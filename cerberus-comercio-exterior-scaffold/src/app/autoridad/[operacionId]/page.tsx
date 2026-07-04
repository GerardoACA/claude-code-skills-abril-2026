// CERBERUS COMERCIO EXTERIOR — Detalle de operación para la AUTORIDAD (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/autoridad/[operacionId]/page.tsx
// Propósito: [Inc 60] Detalle de UNA operación en SOLO LECTURA para el rol
//            AUTORIDAD (reforma RFE 2026, acceso remoto continuo de consulta):
//            datos de la operación, línea de tiempo de PasoDespacho, lista de
//            Documento del expediente (sha256 completo, marca WORM) y los
//            últimos 20 eventos de BitacoraAuditoria con su encadenamiento de
//            hashes, más la explicación de cómo verificar la integridad y el
//            enlace al exporte probatorio autocontenido (GET, solo lectura).
//
// Autorización (fail-closed): sin sesión => /login; rol distinto de AUTORIDAD
// => aviso sin datos. El rol y el tenant salen del JWT verificado; la lectura
// pasa por withTenantFromSession (RLS): si la operación no pertenece al tenant
// de la autoridad, la consulta devuelve null y se muestra aviso.
//
// SOLO LECTURA: cero forms, cero botones de escritura, cero POST.
// En Next 16 `params` es Promise => se await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

/** Paso del despacho mostrado en la línea de tiempo. */
type PasoFila = {
  id: string;
  tipo: string;
  acuse: string | null;
  sello: string | null;
  completadoEn: string;
};

/** Documento del expediente de la operación. */
type DocumentoFila = {
  id: string;
  tipo: string;
  sha256: string;
  worm: boolean;
  creadoEn: string;
};

/** Evento de bitácora (cadena de hashes). */
type EventoFila = {
  id: string;
  accion: string;
  actor: string;
  sha256: string;
  hashPrev: string | null;
  estadoSello: string;
  creadoEn: string;
};

/** Detalle completo que la página renderiza. */
type DetalleAutoridad = {
  operacionId: string;
  referencia: string;
  estado: string;
  creadoEn: string;
  cliente: { rfc: string; razonSocial: string };
  pasos: PasoFila[];
  documentos: DocumentoFila[];
  eventos: EventoFila[];
};

/** Abrevia un hash hex para lectura (primeros 16 caracteres + elipsis). */
function abreviarHash(hash: string | null): string {
  if (hash === null || hash === "") return "— (génesis)";
  return `${hash.slice(0, 16)}…`;
}

export default async function DetalleOperacionAutoridadPage({
  params,
}: {
  params: Promise<{ operacionId: string }>;
}) {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Solo el rol AUTORIDAD. El resto ve aviso sin datos.
  if (session.user.rol !== "AUTORIDAD") {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          Acceso exclusivo para el rol AUTORIDAD.{" "}
          <a href="/dashboard" style={{ color: "#2563eb" }}>
            Ir al tablero
          </a>
          .
        </div>
      </main>
    );
  }

  const { operacionId } = await params;

  // 3) Lectura tenant-scoped (RLS). Si la operación no es del tenant de la
  //    autoridad (o no existe), devuelve null => aviso, nunca datos ajenos.
  const detalle: DetalleAutoridad | null = await withTenantFromSession(
    session,
    async (tx): Promise<DetalleAutoridad | null> => {
      const op = await tx.operacion.findFirst({
        where: { id: operacionId },
        select: {
          id: true,
          referencia: true,
          estado: true,
          creadoEn: true,
          cliente: { select: { rfc: true, razonSocial: true } },
        },
      });
      if (!op) return null;

      // Evidencia de la operación: pasos (línea de tiempo), documentos del
      // expediente (FK directa operacionId, Inc 8/50) y los últimos 20 eventos
      // de bitácora ligados por FK directa o por payloadRef (compatibilidad
      // con eventos anteriores al Inc 8).
      const [pasos, documentos, eventos] = await Promise.all([
        tx.pasoDespacho.findMany({
          where: { operacionId: op.id },
          orderBy: { completadoEn: "asc" },
          select: {
            id: true,
            tipo: true,
            acuse: true,
            sello: true,
            completadoEn: true,
          },
        }),
        tx.documento.findMany({
          where: { operacionId: op.id },
          orderBy: { creadoEn: "desc" },
          select: {
            id: true,
            tipo: true,
            sha256: true,
            wormUrl: true,
            creadoEn: true,
          },
        }),
        tx.bitacoraAuditoria.findMany({
          where: {
            OR: [
              { operacionId: op.id },
              { payloadRef: { contains: `operacion:${op.id}` } },
            ],
          },
          orderBy: { creadoEn: "desc" },
          take: 20,
          select: {
            id: true,
            accion: true,
            actor: true,
            sha256: true,
            hashPrev: true,
            estadoSello: true,
            creadoEn: true,
          },
        }),
      ]);

      return {
        operacionId: op.id,
        referencia: op.referencia,
        estado: op.estado,
        creadoEn: op.creadoEn.toISOString(),
        cliente: { rfc: op.cliente.rfc, razonSocial: op.cliente.razonSocial },
        pasos: pasos.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          acuse: p.acuse,
          sello: p.sello,
          completadoEn: p.completadoEn.toISOString(),
        })),
        documentos: documentos.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          sha256: d.sha256,
          worm: d.wormUrl !== null && d.wormUrl !== "",
          creadoEn: d.creadoEn.toISOString(),
        })),
        eventos: eventos.map((e) => ({
          id: e.id,
          accion: e.accion,
          actor: e.actor,
          sha256: e.sha256,
          hashPrev: e.hashPrev,
          estadoSello: e.estadoSello,
          creadoEn: e.creadoEn.toISOString(),
        })),
      };
    },
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/autoridad" style={{ color: "#2563eb" }}>
          ← Portal de consulta
        </a>
      </p>

      {detalle === null ? (
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
          Operación no encontrada para el tenant de esta autoridad.
        </div>
      ) : (
        <>
          <header style={{ marginBottom: "1.5rem" }}>
            <p
              style={{
                margin: 0,
                color: "#b45309",
                fontSize: "0.8rem",
                letterSpacing: "0.08em",
                fontWeight: 700,
              }}
            >
              PORTAL DE CONSULTA — AUTORIDAD, solo lectura
            </p>
            <h1 style={{ fontSize: "1.9rem", margin: "0.25rem 0 0.25rem" }}>
              Operación {detalle.referencia}
            </h1>
            <p style={{ color: "#475569", margin: 0 }}>
              Cliente: <strong>{detalle.cliente.razonSocial}</strong> (
              {detalle.cliente.rfc}) · Estado:{" "}
              <code>{detalle.estado}</code> · Registrada:{" "}
              {new Date(detalle.creadoEn).toLocaleString("es-MX")}
            </p>
          </header>

          {/* Línea de tiempo del despacho */}
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
              Línea de tiempo del despacho ({detalle.pasos.length} pasos)
            </h2>
            {detalle.pasos.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>
                Aún no hay pasos registrados para esta operación.
              </p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {detalle.pasos.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: "0.9rem",
                    }}
                  >
                    <strong>{p.tipo}</strong>{" "}
                    <span style={{ color: "#94a3b8" }}>
                      — {new Date(p.completadoEn).toLocaleString("es-MX")}
                    </span>
                    <br />
                    <span style={{ color: "#475569", fontSize: "0.85rem" }}>
                      Acuse: {p.acuse ? <code>{p.acuse}</code> : "—"} · Sello:{" "}
                      {p.sello ? <code>{abreviarHash(p.sello)}</code> : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Documentos del expediente */}
          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>
              Documentos del expediente ({detalle.documentos.length})
            </h2>
            {detalle.documentos.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                No hay documentos ligados a esta operación.
              </p>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                {detalle.documentos.map((d) => (
                  <li
                    key={d.id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{d.tipo}</strong>{" "}
                    {d.worm ? (
                      <span
                        style={{
                          background: "#ecfdf5",
                          color: "#065f46",
                          border: "1px solid #a7f3d0",
                          borderRadius: 4,
                          padding: "0 0.35rem",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        WORM
                      </span>
                    ) : null}{" "}
                    <span style={{ color: "#94a3b8" }}>
                      — {new Date(d.creadoEn).toLocaleString("es-MX")}
                    </span>
                    <br />
                    <code
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "#0f172a",
                        wordBreak: "break-all",
                      }}
                    >
                      SHA-256: {d.sha256}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Bitácora encadenada */}
          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>
              Bitácora de auditoría — últimos {detalle.eventos.length} eventos
            </h2>
            {detalle.eventos.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Aún no hay eventos de bitácora para esta operación.
              </p>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                {detalle.eventos.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{e.accion}</strong>{" "}
                    <span style={{ color: "#64748b" }}>por {e.actor}</span>{" "}
                    <span
                      style={{
                        color:
                          e.estadoSello === "PRUEBA_OPONIBLE"
                            ? "#065f46"
                            : "#92400e",
                      }}
                    >
                      {e.estadoSello}
                    </span>
                    <br />
                    <span style={{ color: "#475569", fontSize: "0.8rem" }}>
                      sha256: <code>{abreviarHash(e.sha256)}</code> · hashPrev:{" "}
                      <code>{abreviarHash(e.hashPrev)}</code> ·{" "}
                      {new Date(e.creadoEn).toLocaleString("es-MX")}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div
              style={{
                marginTop: "1rem",
                padding: "1rem 1.25rem",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                fontSize: "0.85rem",
                color: "#475569",
              }}
            >
              <strong>Cómo verificar la integridad de la cadena.</strong> La
              bitácora es append-only: cada evento registra el SHA-256 de su
              contenido canónico (<code>sha256</code>) y el SHA-256 del evento
              anterior del tenant (<code>hashPrev</code>). Para verificar,
              recorra los eventos en orden cronológico y compruebe que el{" "}
              <code>hashPrev</code> de cada evento coincide con el{" "}
              <code>sha256</code> del anterior (el primero de la cadena no
              tiene previo). Cualquier alteración, inserción o borrado rompe el
              encadenamiento y es detectable. Para una verificación pericial
              completa sin acceso al sistema vivo, descargue el{" "}
              <a
                href={`/api/operaciones/${encodeURIComponent(detalle.operacionId)}/exporte`}
                style={{ color: "#2563eb" }}
              >
                exporte probatorio autocontenido (JSON)
              </a>
              : incluye los registros, sus hashes, los sellos y el manual de
              verificación para perito tercero.
            </div>
          </section>
        </>
      )}
    </main>
  );
}

// =============================================================================
// FIN autoridad/[operacionId]/page.tsx  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
