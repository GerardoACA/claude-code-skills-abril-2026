// CERBERUS COMERCIO EXTERIOR — Trámites del despacho (checklist, Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/tramites/page.tsx
// Propósito: Cargar una Operacion por id (tenant-scoped vía withTenantFromSession;
//            la RLS de Postgres filtra por el tenant del JWT) junto a su Cliente y
//            sus PasoDespacho, y mostrar un CHECKLIST de los 5 pasos del despacho
//            (MVE_E2, COVE, PREVALIDACION, PAGO, DODA) indicando completos vs
//            pendientes y sus datos (acuse/sello/monto). Incrusta RegistrarPaso.
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await. `monto` es Prisma.Decimal => se
// muestra con .toString() (serializado en la capa de datos).
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { RegistrarPaso, type TipoPaso } from "@/components/RegistrarPaso";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Los 5 pasos del despacho, en orden documental. Valores REALES del enum
// TipoPaso (prisma/schema.prisma, Agente MODELO-6).
// -----------------------------------------------------------------------------
const PASOS: readonly TipoPaso[] = [
  "MVE_E2",
  "COVE",
  "PREVALIDACION",
  "PAGO",
  "DODA",
];

const ETIQUETA_PASO: Readonly<Record<TipoPaso, string>> = {
  MVE_E2: "Manifestación de Valor (E2)",
  COVE: "COVE",
  PREVALIDACION: "Prevalidación",
  PAGO: "Pago de contribuciones",
  DODA: "DODA",
};

// -----------------------------------------------------------------------------
// Acuse documental (Inc 59): el route de pasos liga el Documento del acuse al
// paso anotando en `detalle` la referencia "doc:<documentoId> sha256:<8>".
// Aquí se detecta esa referencia para mostrar el indicador de acuse sellado.
// -----------------------------------------------------------------------------
const REF_DOC_EN_DETALLE = /doc:([A-Za-z0-9]+) sha256:([0-9a-f]{8})/;

/** Extrae la referencia del acuse documental del detalle del paso, si existe. */
function acuseDocumentalDe(detalle: string | null): { sha256Abrev: string } | null {
  if (detalle === null) return null;
  const m = REF_DOC_EN_DETALLE.exec(detalle);
  return m === null ? null : { sha256Abrev: m[2] };
}

/** Paso registrado, ya serializado (monto Decimal -> string) para el cliente. */
type PasoSerializado = {
  id: string;
  tipo: TipoPaso;
  acuse: string | null;
  sello: string | null;
  monto: string | null;
  detalle: string | null;
  sha256: string;
  completadoEn: string;
};

type OperacionTramites = {
  id: string;
  referencia: string;
  cliente: {
    id: string;
    rfc: string;
    razonSocial: string;
  };
  pasos: PasoSerializado[];
};

export default async function TramitesPage({
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
  const operacion: OperacionTramites | null = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionTramites | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          cliente: {
            select: { id: true, rfc: true, razonSocial: true },
          },
          pasos: {
            orderBy: { completadoEn: "asc" },
            select: {
              id: true,
              tipo: true,
              acuse: true,
              sello: true,
              monto: true,
              detalle: true,
              sha256: true,
              completadoEn: true,
            },
          },
        },
      });
      if (!op) return null;

      return {
        id: op.id,
        referencia: op.referencia,
        cliente: op.cliente,
        pasos: op.pasos.map((p) => ({
          id: p.id,
          tipo: p.tipo as TipoPaso,
          acuse: p.acuse,
          sello: p.sello,
          // monto es Prisma.Decimal | null => .toString() para mostrar.
          monto: p.monto === null ? null : p.monto.toString(),
          detalle: p.detalle,
          sha256: p.sha256,
          completadoEn: p.completadoEn.toISOString(),
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
            Trámites del despacho — {operacion.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{operacion.cliente.razonSocial}</strong> (
            {operacion.cliente.rfc})
          </p>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Checklist del despacho</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {PASOS.map((tipo) => {
                // Un paso puede haberse registrado más de una vez; el checklist
                // considera "completo" si existe al menos un registro del tipo y
                // muestra el más reciente (los pasos vienen en orden ascendente).
                const registros = operacion.pasos.filter((p) => p.tipo === tipo);
                const completo = registros.length > 0;
                const ultimo = completo ? registros[registros.length - 1] : null;

                return (
                  <li
                    key={tipo}
                    style={{
                      padding: "0.9rem 1.1rem",
                      marginBottom: "0.6rem",
                      background: completo ? "#f0fdf4" : "#f8fafc",
                      border: `1px solid ${completo ? "#bbf7d0" : "#e2e8f0"}`,
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
                        {ETIQUETA_PASO[tipo]}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: completo ? "#166534" : "#b45309",
                        }}
                      >
                        {completo ? "✓ Completo" : "Pendiente"}
                      </span>
                    </div>

                    {ultimo !== null && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "#475569",
                        }}
                      >
                        {ultimo.acuse !== null && (
                          <div>
                            Acuse: <strong>{ultimo.acuse}</strong>
                          </div>
                        )}
                        {ultimo.sello !== null && (
                          <div>
                            Sello: <strong>{ultimo.sello}</strong>
                          </div>
                        )}
                        {ultimo.monto !== null && (
                          <div>
                            Monto: <strong>${ultimo.monto}</strong> MXN
                          </div>
                        )}
                        {ultimo.detalle !== null && (
                          <div>Detalle: {ultimo.detalle}</div>
                        )}
                        {(() => {
                          // Inc 59: indicador del acuse documental sellado en
                          // la bóveda (referencia doc:<id> sha256:<8> del detalle).
                          const acuseDoc = acuseDocumentalDe(ultimo.detalle);
                          return acuseDoc === null ? null : (
                            <div
                              style={{
                                marginTop: "0.35rem",
                                color: "#166534",
                                fontWeight: 600,
                              }}
                            >
                              📎 acuse sellado{" "}
                              <code style={{ fontSize: "0.75rem" }}>
                                sha256 {acuseDoc.sha256Abrev}…
                              </code>
                            </div>
                          );
                        })()}
                        <div style={{ color: "#94a3b8", marginTop: "0.25rem" }}>
                          Sellado{" "}
                          {new Date(ultimo.completadoEn).toLocaleString("es-MX")}
                          {" · "}
                          <code style={{ fontSize: "0.75rem" }}>
                            {ultimo.sha256.slice(0, 12)}…
                          </code>
                          {registros.length > 1 && (
                            <> · {registros.length} registros</>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Registrar un paso</h2>
            <RegistrarPaso operacionId={operacion.id} />
          </section>
        </>
      )}
    </main>
  );
}
