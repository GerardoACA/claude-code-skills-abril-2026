// CERBERUS COMERCIO EXTERIOR — Dossier de diligencia de una operación (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/dossier/page.tsx  (Agente UI-DOSSIER, Incremento 9)
// Propósito: Listar los Documentos tipo "DOSSIER_DILIGENCIA" de una Operacion
//            (fecha, sha256, estadoProbatorio) y ofrecer la descarga/regeneración
//            del paquete probatorio vía el client component DescargarDossier.
//
// El dossier de diligencia es el SEGURO DEL AGENTE: al caer la operación en ROJO
// o INCIDENCIA se sella automáticamente un snapshot probatorio (sha256 del JSON
// canónico del paquete) como Documento ligado por FK directa (operacionId, Inc 8).
//
// Toda la lectura es tenant-scoped vía withTenantFromSession: abre una transacción
// con SET LOCAL app.tenant_id => la RLS de Postgres filtra por el tenant del JWT.
// El tenantId NUNCA se toma de params/query; solo del token verificado.
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { DescargarDossier } from "@/components/DescargarDossier";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

/** Tipo documental del dossier (mismo literal que sella el Agente AUTO-DOSSIER). */
const TIPO_DOSSIER = "DOSSIER_DILIGENCIA";

/** Un dossier sellado (Documento tipo DOSSIER_DILIGENCIA) para el listado. */
type DossierSellado = {
  id: string;
  sha256: string;
  estadoProbatorio: string;
  version: number;
  creadoEn: string;
  /**
   * URL de la copia WORM del blob (Inc 14) o null si no la hay (almacén no
   * configurado o guardado fallido). Trade-off documentado en almacen-worm.ts:
   * la URL de Vercel Blob (access "public") no es adivinable pero SÍ pública;
   * solo se muestra aquí, dentro de la sesión autenticada del tenant
   * (mitigación futura: blob privado o proxy autenticado).
   */
  wormUrl: string | null;
};

/** Datos de la vista: operación + sus dossieres sellados. */
type VistaDossier = {
  operacionId: string;
  referencia: string;
  estado: string;
  cliente: { rfc: string; razonSocial: string };
  dossieres: DossierSellado[];
};

export default async function DossierOperacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const vista: VistaDossier | null = await withTenantFromSession(
    session,
    async (tx): Promise<VistaDossier | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          estado: true,
          cliente: { select: { rfc: true, razonSocial: true } },
        },
      });
      if (!op) return null;

      // Dossieres sellados de la operación: Documentos tipo DOSSIER_DILIGENCIA
      // ligados por FK directa (operacionId, Inc 8), más reciente primero.
      const documentos = await tx.documento.findMany({
        where: { operacionId: op.id, tipo: TIPO_DOSSIER },
        select: {
          id: true,
          sha256: true,
          estadoProbatorio: true,
          version: true,
          creadoEn: true,
          wormUrl: true,
        },
        orderBy: { creadoEn: "desc" },
      });

      return {
        operacionId: op.id,
        referencia: op.referencia,
        estado: op.estado,
        cliente: { rfc: op.cliente.rfc, razonSocial: op.cliente.razonSocial },
        dossieres: documentos.map((d) => ({
          id: d.id,
          sha256: d.sha256,
          estadoProbatorio: d.estadoProbatorio,
          version: d.version,
          creadoEn: d.creadoEn.toISOString(),
          wormUrl: d.wormUrl,
        })),
      };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        {vista === null ? (
          <a href="/operaciones" style={{ color: "#2563eb" }}>
            ← Operaciones
          </a>
        ) : (
          <a
            href={`/operaciones/${encodeURIComponent(vista.operacionId)}`}
            style={{ color: "#2563eb" }}
          >
            ← Operación {vista.referencia}
          </a>
        )}
      </p>

      {vista === null ? (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem 1.25rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          Operación no encontrada para este tenant.{" "}
          <a href="/operaciones" style={{ color: "#2563eb" }}>
            Volver a operaciones
          </a>
          .
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
            Dossier de diligencia — {vista.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{vista.cliente.razonSocial}</strong> (
            {vista.cliente.rfc})
          </p>

          <section
            style={{
              marginTop: "1.5rem",
              padding: "1.25rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
            }}
          >
            <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>
              ¿Qué es el dossier?
            </h2>
            <p style={{ color: "#475569", fontSize: "0.9rem", margin: 0 }}>
              El dossier de diligencia es el <strong>seguro del agente</strong>:
              al caer la operación en ROJO o INCIDENCIA se sella automáticamente
              un snapshot probatorio del estado de la operación en ese instante
              (SHA-256 del paquete probatorio autocontenido), que acredita la
              diligencia debida del agente aduanal ante la autoridad. El paquete
              es regenerable y verificable por un perito tercero.
            </p>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Dossieres sellados</h2>
            {vista.dossieres.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Esta operación aún no tiene dossieres sellados. Se generan
                automáticamente al transicionar a ROJO o INCIDENCIA.
              </p>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                {vista.dossieres.map((d) => (
                  <li
                    key={d.id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>
                      {new Date(d.creadoEn).toLocaleString("es-MX")}
                    </strong>{" "}
                    <span style={{ color: "#64748b" }}>v{d.version}</span>
                    <br />
                    <code style={{ color: "#0f172a", wordBreak: "break-all" }}>
                      {d.sha256}
                    </code>
                    <br />
                    <span
                      style={{
                        color:
                          d.estadoProbatorio === "PRUEBA_OPONIBLE"
                            ? "#065f46"
                            : "#92400e",
                      }}
                    >
                      {d.estadoProbatorio}
                    </span>
                    <br />
                    {/* Copia WORM (Inc 14): el blob guarda el JSON íntegro del
                        paquete; el sha256 de arriba es el sello de CONTENIDO
                        (excluye generadoEn/selloPaquete). La URL es pública
                        pero no adivinable; solo se muestra en esta sesión. */}
                    {d.wormUrl ? (
                      <a
                        href={d.wormUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#2563eb" }}
                      >
                        Copia WORM ↗
                      </a>
                    ) : (
                      <span style={{ color: "#64748b" }}>
                        sin copia WORM; anclado por sha256 y regenerable
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Descargar / regenerar</h2>
            <p style={{ color: "#475569", fontSize: "0.9rem" }}>
              La descarga regenera el JSON desde la evidencia viva y lo coteja
              contra el sha256 sellado; si difieren, hubo evidencia posterior
              al sellado (también es señal). Cuando el almacén WORM está
              configurado, cada dossier conserva además su copia inmutable
              (&ldquo;Copia WORM ↗&rdquo; arriba).
            </p>
            <DescargarDossier
              operacionId={vista.operacionId}
              referencia={vista.referencia}
            />
          </section>
        </>
      )}
    </main>
  );
}
