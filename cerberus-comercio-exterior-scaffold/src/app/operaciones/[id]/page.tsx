// CERBERUS COMERCIO EXTERIOR — Detalle de Operación + máquina de estados (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/page.tsx
// Propósito: Cargar una Operacion por id (tenant-scoped vía withTenantFromSession;
//            la RLS de Postgres filtra por el tenant del JWT) junto a su Cliente y
//            estado actual, mostrar los estados posibles de la máquina de estados y
//            renderizar el client component AvanzarEstado con las transiciones
//            válidas desde el estado actual.
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { AvanzarEstado, type EstadoDespacho } from "@/components/AvanzarEstado";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Valores REALES del enum EstadoDespacho (prisma/schema.prisma) y la MISMA
// máquina de estados que valida el route /api/operaciones/[id]/estado. Aquí se
// usa para (a) listar los estados posibles y (b) derivar las transiciones válidas
// desde el estado actual que se pasan al client component.
// -----------------------------------------------------------------------------
const ESTADOS: readonly EstadoDespacho[] = [
  "ARMADO",
  "PREVALIDADO",
  "PRESENTACION_PENDIENTE",
  "SELECCION",
  "VERDE",
  "ROJO",
  "INCIDENCIA",
  "DOSSIER_GENERADO",
];

const TRANSICIONES: Readonly<Record<EstadoDespacho, readonly EstadoDespacho[]>> = {
  ARMADO: ["PREVALIDADO"],
  PREVALIDADO: ["PRESENTACION_PENDIENTE"],
  PRESENTACION_PENDIENTE: ["SELECCION"],
  SELECCION: ["VERDE", "ROJO"],
  VERDE: ["DOSSIER_GENERADO"],
  ROJO: ["INCIDENCIA", "DOSSIER_GENERADO"],
  INCIDENCIA: ["DOSSIER_GENERADO"],
  DOSSIER_GENERADO: [],
};

const ETIQUETA_ESTADO: Readonly<Record<EstadoDespacho, string>> = {
  ARMADO: "Armado",
  PREVALIDADO: "Prevalidado",
  PRESENTACION_PENDIENTE: "Presentación pendiente",
  SELECCION: "Selección (semáforo)",
  VERDE: "Desaduanamiento libre (Verde)",
  ROJO: "Reconocimiento (Rojo)",
  INCIDENCIA: "Incidencia",
  DOSSIER_GENERADO: "Dossier generado",
};

type OperacionDetalle = {
  id: string;
  referencia: string;
  estado: EstadoDespacho;
  actualizadoEn: string;
  cliente: {
    id: string;
    rfc: string;
    razonSocial: string;
  };
};

export default async function OperacionDetallePage({
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
  const operacion: OperacionDetalle | null = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionDetalle | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          estado: true,
          actualizadoEn: true,
          cliente: {
            select: { id: true, rfc: true, razonSocial: true },
          },
        },
      });
      if (!op) return null;

      return {
        id: op.id,
        referencia: op.referencia,
        estado: op.estado as EstadoDespacho,
        actualizadoEn: op.actualizadoEn.toISOString(),
        cliente: op.cliente,
      };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/operaciones" style={{ color: "#2563eb" }}>
          ← Operaciones
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
            Operación {operacion.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{operacion.cliente.razonSocial}</strong> (
            {operacion.cliente.rfc})
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
            <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Estado actual</h2>
            <p style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              <strong>{ETIQUETA_ESTADO[operacion.estado]}</strong>
            </p>
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
              Última actualización:{" "}
              {new Date(operacion.actualizadoEn).toLocaleString("es-MX")}
            </p>
            <p style={{ marginTop: "0.75rem", marginBottom: 0 }}><a href={`/operaciones/${encodeURIComponent(operacion.id)}/tramites`} style={{ color: "#2563eb" }}>Trámites del despacho →</a></p>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}><a href={`/operaciones/${encodeURIComponent(operacion.id)}/expediente`} style={{ color: "#2563eb" }}>Expediente probatorio →</a></p>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}><a href={`/operaciones/${encodeURIComponent(operacion.id)}/dossier`} style={{ color: "#2563eb" }}>Dossier de diligencia →</a></p>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}><a href={`/operaciones/${encodeURIComponent(operacion.id)}/cfdi`} style={{ color: "#2563eb" }}>CFDI / Carta Porte →</a></p>
            {/* [Inc 31] Partidas, valoración y cálculo de contribuciones (IGI/DTA/IVA/IEPS). */}
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}><a href={`/operaciones/${encodeURIComponent(operacion.id)}/partidas`} style={{ color: "#2563eb" }}>Partidas y contribuciones →</a></p>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>
              Máquina de estados del despacho
            </h2>
            <ol
              style={{
                color: "#475569",
                fontSize: "0.9rem",
                paddingLeft: "1.25rem",
              }}
            >
              {ESTADOS.map((estado) => (
                <li
                  key={estado}
                  style={{
                    fontWeight: estado === operacion.estado ? 700 : 400,
                    color: estado === operacion.estado ? "#0f172a" : "#475569",
                  }}
                >
                  {ETIQUETA_ESTADO[estado]}
                  {estado === operacion.estado ? " ← actual" : ""}
                </li>
              ))}
            </ol>
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Avanzar estado</h2>
            <AvanzarEstado
              operacionId={operacion.id}
              estadoActual={operacion.estado}
              transicionesPermitidas={TRANSICIONES[operacion.estado]}
            />
          </section>
        </>
      )}
    </main>
  );
}
