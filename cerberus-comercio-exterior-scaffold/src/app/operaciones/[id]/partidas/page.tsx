// CERBERUS COMERCIO EXTERIOR — Partidas, valoración y contribuciones de la operación (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/partidas/page.tsx
// Propósito: Cargar una Operacion por id (tenant-scoped vía withTenantFromSession;
//            la RLS de Postgres filtra por el tenant del JWT) para mostrar la
//            cabecera (referencia + cliente) y montar el client component
//            PartidasContribuciones, que captura partidas, calcula las
//            contribuciones (IGI/DTA/IEPS/IVA) en el servidor y genera el
//            pedimento con sus totales.
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await. La lista de partidas y pedimentos
// NO se carga aquí: el client component las trae por GET al montarse.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { PartidasContribuciones } from "@/components/PartidasContribuciones";
import { PartidasIngestaCsv } from "@/components/PartidasIngestaCsv";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

type OperacionPartidas = {
  id: string;
  referencia: string;
  cliente: {
    razonSocial: string;
    rfc: string;
  };
};

export default async function PartidasPage({
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
  const operacion: OperacionPartidas | null = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionPartidas | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          cliente: {
            select: { razonSocial: true, rfc: true },
          },
        },
      });
      if (!op) return null;

      return {
        id: op.id,
        referencia: op.referencia,
        cliente: op.cliente,
      };
    },
  );

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
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
            Partidas y contribuciones — {operacion.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{operacion.cliente.razonSocial}</strong> (
            {operacion.cliente.rfc})
          </p>

          {/* Aviso explicativo del cálculo de contribuciones (fondo suave). */}
          <div
            style={{
              marginTop: "1rem",
              padding: "0.9rem 1.1rem",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              color: "#1e40af",
              fontSize: "0.9rem",
            }}
          >
            El servidor calcula las contribuciones por partida (importes en{" "}
            <strong>MXN</strong>):{" "}
            <strong>IGI</strong> = valor en aduana × tasa de IGI;{" "}
            <strong>DTA</strong> general al <strong>8 al millar</strong> (o el
            fijo capturado);{" "}
            <strong>IEPS</strong> según la tasa capturada (si aplica); e{" "}
            <strong>IVA</strong> del <strong>16%</strong> sobre la base
            (valor en aduana + IGI + DTA + IEPS). La{" "}
            <strong>tasa de IGI se captura a mano</strong>: el clasificador TIGIE
            es un conector aún no configurado.
          </div>

          {/* Ingesta masiva de partidas por CSV (Incremento 39). */}
          <PartidasIngestaCsv operacionId={operacion.id} />

          <PartidasContribuciones operacionId={operacion.id} />
        </>
      )}
    </main>
  );
}
