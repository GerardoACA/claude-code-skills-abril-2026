// CERBERUS COMERCIO EXTERIOR — CFDI / Carta Porte 3.1 de la operación (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/cfdi/page.tsx
// Propósito: Cargar una Operacion por id (tenant-scoped vía withTenantFromSession;
//            la RLS de Postgres filtra por el tenant del JWT) junto a sus
//            ComprobanteCfdi (tipo, complemento, estado, uuid, sha corto,
//            detallePac), mostrar la nota de contexto normativo (Carta Porte 3.1
//            obligatoria; multas por documento) y montar el form de captura
//            (CfdiCartaPorteForm) más las acciones Timbrar/Cancelar por
//            comprobante (CfdiAcciones, client components).
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { CfdiCartaPorteForm } from "@/components/CfdiCartaPorteForm";
import { CfdiAcciones, type EstadoCfdi } from "@/components/CfdiAcciones";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Readonly<Record<EstadoCfdi, string>> = {
  BORRADOR: "Borrador sellado",
  TIMBRADO: "Timbrado",
  CANCELADO: "Cancelado",
  SUSTITUIDO: "Sustituido",
};

const COLOR_ESTADO: Readonly<Record<EstadoCfdi, { fondo: string; borde: string; texto: string }>> = {
  BORRADOR: { fondo: "#fffbeb", borde: "#fde68a", texto: "#b45309" },
  TIMBRADO: { fondo: "#f0fdf4", borde: "#bbf7d0", texto: "#166534" },
  CANCELADO: { fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b" },
  SUSTITUIDO: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" },
};

/** Comprobante ya serializado (fechas ISO, enums como string) para render. */
type ComprobanteSerializado = {
  id: string;
  tipo: string;
  complemento: string;
  estado: EstadoCfdi;
  emisorRfc: string;
  receptorRfc: string;
  uuid: string | null;
  sha256: string;
  detallePac: string | null;
  creadoEn: string;
};

type OperacionCfdi = {
  id: string;
  referencia: string;
  cliente: {
    id: string;
    rfc: string;
    razonSocial: string;
  };
  comprobantes: ComprobanteSerializado[];
};

export default async function CfdiPage({
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
  const operacion: OperacionCfdi | null = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionCfdi | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          cliente: {
            select: { id: true, rfc: true, razonSocial: true },
          },
        },
      });
      if (!op) return null;

      const comprobantes = await tx.comprobanteCfdi.findMany({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          tipo: true,
          complemento: true,
          estado: true,
          emisorRfc: true,
          receptorRfc: true,
          uuid: true,
          sha256: true,
          detallePac: true,
          creadoEn: true,
        },
      });

      return {
        id: op.id,
        referencia: op.referencia,
        cliente: op.cliente,
        comprobantes: comprobantes.map((c) => ({
          id: c.id,
          tipo: c.tipo as string,
          complemento: c.complemento as string,
          estado: c.estado as EstadoCfdi,
          emisorRfc: c.emisorRfc,
          receptorRfc: c.receptorRfc,
          uuid: c.uuid,
          sha256: c.sha256,
          detallePac: c.detallePac,
          creadoEn: c.creadoEn.toISOString(),
        })),
      };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a
          href={`/operaciones/${encodeURIComponent(id)}`}
          style={{ color: "#2563eb" }}
        >
          ← Operación
        </a>
      </p>

      {operacion === null ? (
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
            CFDI / Carta Porte — {operacion.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{operacion.cliente.razonSocial}</strong> (
            {operacion.cliente.rfc})
          </p>

          {/* Nota de contexto normativo (reporte §1). */}
          <div
            style={{
              marginTop: "1rem",
              padding: "0.9rem 1.1rem",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              color: "#92400e",
              fontSize: "0.9rem",
            }}
          >
            El complemento <strong>Carta Porte 3.1</strong> es obligatorio para el
            traslado de mercancías (exigible desde el 17 de julio de 2024). Emitir
            sin él o con datos inválidos expone a multas de hasta{" "}
            <strong>~$97,330 MXN por documento</strong>: se validan códigos
            postales, placas y claves de producto/servicio antes de sellar el
            borrador. El timbrado se hace vía el conector PAC (hoy sin configurar:
            los comprobantes quedan en borrador sellado).
          </div>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Comprobantes de la operación</h2>
            {operacion.comprobantes.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Aún no hay comprobantes capturados para esta operación.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {operacion.comprobantes.map((c) => {
                  const color = COLOR_ESTADO[c.estado];
                  return (
                    <li
                      key={c.id}
                      style={{
                        padding: "0.9rem 1.1rem",
                        marginBottom: "0.6rem",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "0.75rem",
                        }}
                      >
                        <strong style={{ color: "#0f172a" }}>
                          {c.tipo} · {c.complemento.replaceAll("_", " ")}
                        </strong>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            padding: "0.1rem 0.5rem",
                            borderRadius: 999,
                            background: color.fondo,
                            border: `1px solid ${color.borde}`,
                            color: color.texto,
                          }}
                        >
                          {ETIQUETA_ESTADO[c.estado]}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "#475569",
                        }}
                      >
                        <div>
                          Emisor: <strong>{c.emisorRfc}</strong> · Receptor:{" "}
                          <strong>{c.receptorRfc}</strong>
                        </div>
                        <div>
                          UUID (folio fiscal):{" "}
                          {c.uuid !== null ? (
                            <code style={{ fontSize: "0.8rem" }}>{c.uuid}</code>
                          ) : (
                            <em>sin timbrar</em>
                          )}
                        </div>
                        {c.detallePac !== null && (
                          <div>
                            Respuesta del conector PAC:{" "}
                            <code style={{ fontSize: "0.75rem" }}>
                              {c.detallePac}
                            </code>
                          </div>
                        )}
                        <div style={{ color: "#94a3b8", marginTop: "0.25rem" }}>
                          Sellado {new Date(c.creadoEn).toLocaleString("es-MX")}
                          {" · "}
                          <code style={{ fontSize: "0.75rem" }}>
                            {c.sha256.slice(0, 12)}…
                          </code>
                        </div>
                      </div>

                      <CfdiAcciones
                        operacionId={operacion.id}
                        cfdiId={c.id}
                        estado={c.estado}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>
              Capturar CFDI de traslado (Carta Porte 3.1)
            </h2>
            <CfdiCartaPorteForm operacionId={operacion.id} />
          </section>
        </>
      )}
    </main>
  );
}
