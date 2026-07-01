// CERBERUS COMERCIO EXTERIOR — tablero protegido (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/dashboard/page.tsx
// Proposito: Tablero demostrable end-to-end. Exige sesion valida (si no, redirige
//            a /login) y lista los Cliente y Operacion del tenant EXCLUSIVAMENTE
//            a traves de withTenantFromSession, de modo que la RLS de Postgres
//            filtra por app.tenant_id derivado del JWT verificado. Deja claro en
//            pantalla que solo se ven datos del propio tenant.
//
// Nota: Server Component (sin "use client"). El unico trozo interactivo es el
//       boton CerrarSesion, que es su propio client component.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { CerrarSesion } from "@/components/CerrarSesion";

// Forma de los datos que el tablero renderiza (solo los campos mostrados).
type ClienteFila = { id: string; rfc: string; razonSocial: string };
type OperacionFila = { id: string; referencia: string; estado: string };

// El tablero depende de la sesion/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const { clientes, operaciones } = await withTenantFromSession(
    session,
    async (tx): Promise<{ clientes: ClienteFila[]; operaciones: OperacionFila[] }> => {
      const clientes = await tx.cliente.findMany({
        select: { id: true, rfc: true, razonSocial: true },
        orderBy: { razonSocial: "asc" },
      });
      const operaciones = await tx.operacion.findMany({
        select: { id: true, referencia: true, estado: true },
        orderBy: { creadoEn: "desc" },
      });
      return { clientes, operaciones };
    }
  );

  const nombreUsuario = session.user.name ?? session.user.email ?? "Usuario";
  const tenantId = session.user.tenantId;

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
            Tablero — Cerberus Comercio Exterior
          </h1>
          <p style={{ color: "#475569", margin: 0 }}>
            Sesion: <strong>{nombreUsuario}</strong>
            {session.user.email ? ` (${session.user.email})` : null} · Rol:{" "}
            <strong>{session.user.rol}</strong>
          </p>
          <p style={{ color: "#94a3b8", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Tenant: <code>{tenantId}</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <a
            href="/clientes"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            Clientes
          </a>
          <a
            href="/operaciones"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            Operaciones
          </a>
          <CerrarSesion />
        </div>
      </header>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "0.9rem 1.1rem",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          color: "#065f46",
          fontSize: "0.95rem",
        }}
      >
        Aislamiento estricto por inquilino: solo estas viendo los datos de tu
        propio tenant. El filtrado lo garantiza la seguridad a nivel de fila (RLS)
        de PostgreSQL, no un simple <code>WHERE</code> de la aplicacion.
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>
          Clientes / Importadores ({clientes.length})
        </h2>
        {clientes.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Sin clientes registrados para este tenant.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>RFC</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Razon social</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c: ClienteFila) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>
                    {c.rfc}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{c.razonSocial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>
          Operaciones de despacho ({operaciones.length})
        </h2>
        {operaciones.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Sin operaciones registradas para este tenant.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Referencia</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((o: OperacionFila) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>
                    {o.referencia}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{o.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid #e2e8f0",
          color: "#94a3b8",
          fontSize: "0.875rem",
        }}
      >
        <a href="/aviso-privacidad" style={{ color: "#2563eb" }}>
          Aviso de privacidad
        </a>
      </footer>
    </main>
  );
}
