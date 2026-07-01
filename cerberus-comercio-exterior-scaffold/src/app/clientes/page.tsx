// CERBERUS COMERCIO EXTERIOR — Clientes/Importadores (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/page.tsx
// Proposito: Listar los Cliente del tenant EXCLUSIVAMENTE via withTenantFromSession
//            (RLS de Postgres filtra por app.tenant_id derivado del JWT verificado).
//            Sin sesion => redirect("/login") (fail-closed). Ofrece alta de cliente
//            y enlaces por fila al expediente KYC (1.4.14) y a la verificacion 69-B.
//
// Server Component (sin "use client"). Depende de sesion/DB: no se pre-renderiza.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

// Forma de los datos que la lista renderiza (solo campos mostrados; del schema real).
type ClienteFila = {
  id: string;
  rfc: string;
  razonSocial: string;
  estadoCsd: string;
  etapa69b: string;
};

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const clientes: ClienteFila[] = await withTenantFromSession(
    session,
    async (tx): Promise<ClienteFila[]> => {
      return tx.cliente.findMany({
        select: {
          id: true,
          rfc: true,
          razonSocial: true,
          estadoCsd: true,
          etapa69b: true,
        },
        orderBy: { razonSocial: "asc" },
      });
    },
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>
            Clientes / Importadores
          </h1>
          <p style={{ color: "#475569", margin: 0 }}>
            {clientes.length} registrado(s) para este tenant.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/dashboard" style={{ color: "#2563eb" }}>
            ← Tablero
          </a>
          <a
            href="/clientes/nuevo"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            + Registrar cliente
          </a>
        </div>
      </header>

      <section style={{ marginTop: "2.5rem" }}>
        {clientes.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>
            Sin clientes registrados para este tenant.{" "}
            <a href="/clientes/nuevo" style={{ color: "#2563eb" }}>
              Registrar el primero
            </a>
            .
          </p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>RFC</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Razón social</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>CSD</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>69-B</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Expedientes</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c: ClienteFila) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>
                    {c.rfc}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{c.razonSocial}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{c.estadoCsd}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{c.etapa69b}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <a
                      href={`/clientes/${c.id}/kyc`}
                      style={{ color: "#2563eb", marginRight: "0.75rem" }}
                    >
                      KYC 1.4.14
                    </a>
                    <a
                      href={`/clientes/${c.id}/verificacion`}
                      style={{ color: "#2563eb" }}
                    >
                      Verificación 69-B
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
