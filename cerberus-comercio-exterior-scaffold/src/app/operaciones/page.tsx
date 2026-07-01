// CERBERUS COMERCIO EXTERIOR — Operaciones de despacho (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/page.tsx
// Proposito: Listar las Operacion del tenant EXCLUSIVAMENTE via withTenantFromSession
//            (RLS de Postgres filtra por app.tenant_id derivado del JWT verificado).
//            Sin sesion => redirect("/login") (fail-closed). Incluye la relación
//            cliente (razonSocial/rfc), referencia y estado; enlaza por fila al
//            detalle /operaciones/[id] y ofrece crear una nueva /operaciones/nueva.
//
// Server Component (sin "use client"). Depende de sesion/DB: no se pre-renderiza.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

// Forma de los datos que la lista renderiza (solo campos mostrados; del schema real).
type OperacionFila = {
  id: string;
  referencia: string;
  estado: string;
  cliente: {
    id: string;
    rfc: string;
    razonSocial: string;
  };
};

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  //    Se incluye la relación `cliente` para mostrar RFC / razón social por fila.
  const operaciones: OperacionFila[] = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionFila[]> => {
      return tx.operacion.findMany({
        select: {
          id: true,
          referencia: true,
          estado: true,
          cliente: {
            select: {
              id: true,
              rfc: true,
              razonSocial: true,
            },
          },
        },
        orderBy: { creadoEn: "desc" },
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
            Operaciones de despacho
          </h1>
          <p style={{ color: "#475569", margin: 0 }}>
            {operaciones.length} registrada(s) para este tenant.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a href="/dashboard" style={{ color: "#2563eb" }}>
            ← Tablero
          </a>
          <a
            href="/operaciones/nueva"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            + Nueva operación
          </a>
        </div>
      </header>

      <section style={{ marginTop: "2.5rem" }}>
        {operaciones.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>
            Sin operaciones registradas para este tenant.{" "}
            <a href="/operaciones/nueva" style={{ color: "#2563eb" }}>
              Crear la primera
            </a>
            .
          </p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Referencia</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Cliente</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Estado</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((o: OperacionFila) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>
                    {o.referencia}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {o.cliente.razonSocial}{" "}
                    <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                      ({o.cliente.rfc})
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{o.estado}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <a href={`/operaciones/${o.id}`} style={{ color: "#2563eb" }}>
                      Ver / avanzar
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
