// CERBERUS COMERCIO EXTERIOR — Expediente probatorio de una operación (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/expediente/page.tsx
// Propósito: Mostrar el RESUMEN de la evidencia probatoria de una Operacion
//            (conteos de Documentos, PasoDespacho y eventos de BitacoraAuditoria,
//            más los últimos sellos registrados) y ofrecer el botón para GENERAR
//            el exporte probatorio autocontenido (descargable como JSON).
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
import { BotonExporte } from "@/components/BotonExporte";
import { DocumentosDespacho } from "@/components/DocumentosDespacho";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

/** Un sello reciente de la bitácora, para el bloque "últimos sellos". */
type SelloReciente = {
  id: string;
  accion: string;
  actor: string;
  sha256: string;
  estadoSello: string;
  creadoEn: string;
};

/** Resumen de la evidencia de la operación (conteos + últimos sellos). */
type ResumenExpediente = {
  operacionId: string;
  referencia: string;
  estado: string;
  cliente: { rfc: string; razonSocial: string };
  conteos: {
    documentos: number;
    pasos: number;
    eventos: number;
  };
  ultimosSellos: SelloReciente[];
};

export default async function ExpedienteOperacionPage({
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
  const resumen: ResumenExpediente | null = await withTenantFromSession(
    session,
    async (tx): Promise<ResumenExpediente | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          estado: true,
          clienteId: true,
          cliente: { select: { rfc: true, razonSocial: true } },
        },
      });
      if (!op) return null;

      // Conteos de la evidencia:
      //  - Documentos del expediente probatorio del cliente de la operación.
      //  - PasoDespacho de la operación.
      //  - Eventos de BitacoraAuditoria del tenant relacionados con la operación
      //    (por payloadRef que contiene el id de la operación).
      const [documentos, pasos, eventos] = await Promise.all([
        tx.documento.count({
          where: { expedienteProbatorio: { clienteId: op.clienteId } },
        }),
        tx.pasoDespacho.count({ where: { operacionId: op.id } }),
        tx.bitacoraAuditoria.count({
          where: { payloadRef: { contains: `operacion:${op.id}` } },
        }),
      ]);

      // Últimos sellos: eventos de bitácora más recientes de la operación.
      const recientes = await tx.bitacoraAuditoria.findMany({
        where: { payloadRef: { contains: `operacion:${op.id}` } },
        orderBy: { creadoEn: "desc" },
        take: 5,
        select: {
          id: true,
          accion: true,
          actor: true,
          sha256: true,
          estadoSello: true,
          creadoEn: true,
        },
      });

      return {
        operacionId: op.id,
        referencia: op.referencia,
        estado: op.estado,
        cliente: { rfc: op.cliente.rfc, razonSocial: op.cliente.razonSocial },
        conteos: { documentos, pasos, eventos },
        ultimosSellos: recientes.map((r) => ({
          id: r.id,
          accion: r.accion,
          actor: r.actor,
          sha256: r.sha256,
          estadoSello: r.estadoSello,
          creadoEn: r.creadoEn.toISOString(),
        })),
      };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        {resumen === null ? (
          <a href="/operaciones" style={{ color: "#2563eb" }}>
            ← Operaciones
          </a>
        ) : (
          <a
            href={`/operaciones/${encodeURIComponent(resumen.operacionId)}`}
            style={{ color: "#2563eb" }}
          >
            ← Operación {resumen.referencia}
          </a>
        )}
      </p>

      {resumen === null ? (
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
            Expediente probatorio — {resumen.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{resumen.cliente.razonSocial}</strong> (
            {resumen.cliente.rfc})
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
              Resumen de la evidencia
            </h2>
            <ul
              style={{
                display: "flex",
                gap: "2rem",
                listStyle: "none",
                padding: 0,
                margin: "0.5rem 0 0",
                flexWrap: "wrap",
              }}
            >
              <li>
                <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                  {resumen.conteos.documentos}
                </span>
                <br />
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  Documentos
                </span>
              </li>
              <li>
                <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                  {resumen.conteos.pasos}
                </span>
                <br />
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  Pasos del despacho
                </span>
              </li>
              <li>
                <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                  {resumen.conteos.eventos}
                </span>
                <br />
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  Eventos de bitácora
                </span>
              </li>
            </ul>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Últimos sellos registrados</h2>
            {resumen.ultimosSellos.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Aún no hay eventos sellados para esta operación.
              </p>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                {resumen.ultimosSellos.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{s.accion}</strong>{" "}
                    <span style={{ color: "#64748b" }}>por {s.actor}</span>
                    <br />
                    <code style={{ color: "#0f172a" }}>
                      {s.sha256.slice(0, 16)}…
                    </code>{" "}
                    <span
                      style={{
                        color:
                          s.estadoSello === "PRUEBA_OPONIBLE"
                            ? "#065f46"
                            : "#92400e",
                      }}
                    >
                      {s.estadoSello}
                    </span>
                    <br />
                    <span style={{ color: "#94a3b8" }}>
                      {new Date(s.creadoEn).toLocaleString("es-MX")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Inc 50 — bóveda documental del despacho (checklist + subida). */}
          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Documentos del despacho</h2>
            <p style={{ color: "#475569", fontSize: "0.9rem" }}>
              Resguarda aquí los documentos reales de la operación (pedimento,
              factura, carta porte, COVE, DODA…): cada archivo se sella con
              SHA-256, se guarda en la bóveda WORM y queda en la bitácora.
            </p>
            <DocumentosDespacho operacionId={resumen.operacionId} />
          </section>

          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Exporte probatorio</h2>
            <p style={{ color: "#475569", fontSize: "0.9rem" }}>
              Genera un paquete autocontenido (registros + hashes + sellos +
              manual de verificación) que un perito tercero puede validar sin
              acceso al sistema vivo. Se descarga como archivo JSON.
            </p>
            <BotonExporte
              operacionId={resumen.operacionId}
              referencia={resumen.referencia}
            />
          </section>
        </>
      )}
    </main>
  );
}
