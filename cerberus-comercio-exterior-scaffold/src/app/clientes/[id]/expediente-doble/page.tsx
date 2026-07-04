// CERBERUS COMERCIO EXTERIOR — Página expediente doble 3.1.42 (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/expediente-doble/page.tsx  (Incremento 54)
// Propósito: Cargar el Cliente por id (tenant-scoped vía withTenantFromSession,
//            la RLS de Postgres filtra por el tenant del JWT) y montar el
//            componente ExpedienteDoble: la regla 3.1.42 RGCE exige que el
//            agente aduanal Y la empresa importadora/exportadora conserven
//            CADA UNO su expediente de las operaciones ("expediente doble").
//
// Fail-closed: sin sesión válida => redirect a /login. Si el cliente no
// pertenece al tenant (o no existe), la lectura devuelve null y se avisa.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { ExpedienteDoble } from "@/components/ExpedienteDoble";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

type ClienteResumen = { id: string; rfc: string; razonSocial: string };

export default async function ExpedienteDoblePage({
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
  const cliente: ClienteResumen | null = await withTenantFromSession(
    session,
    async (tx): Promise<ClienteResumen | null> => {
      return tx.cliente.findFirst({
        where: { id },
        select: { id: true, rfc: true, razonSocial: true },
      });
    },
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb" }}>← Clientes</a>
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Expediente doble — Regla 3.1.42
      </h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        La regla 3.1.42 RGCE exige el <strong>doble expediente</strong>: el agente
        aduanal Y la empresa importadora/exportadora deben conservar cada uno su
        expediente de las operaciones (pedimento, factura, transporte, origen,
        COVE, correspondencia). Cada documento se sella con sha256 y se custodia
        en la bóveda WORM.
      </p>

      {cliente === null ? (
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
          Cliente no encontrado para este tenant.{" "}
          <a href="/clientes" style={{ color: "#2563eb" }}>Volver a clientes</a>.
        </div>
      ) : (
        <>
          <p style={{ color: "#475569" }}>
            <strong>{cliente.razonSocial}</strong> ·{" "}
            <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <ExpedienteDoble clienteId={cliente.id} />
          </div>
        </>
      )}
    </main>
  );
}
