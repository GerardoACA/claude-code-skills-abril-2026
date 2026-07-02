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
// [Agente VIGIA-BARRIDO, Inc 11] alerta del vigía (evento de bitácora).
type AlertaVigiaFila = { id: string; creadoEn: Date; payloadRef: string | null };

// [Agente VIGIA-BARRIDO, Inc 11] payloadRef legible: el vigía guarda un JSON
// con { clienteId, rfc, fuente, de, a }; si se puede parsear, se muestra como
// texto humano; si no, se muestra el payloadRef crudo (o un guion).
function payloadVigiaLegible(payloadRef: string | null): string {
  if (payloadRef === null || payloadRef.trim() === "") return "—";
  try {
    const parsed: unknown = JSON.parse(payloadRef);
    if (parsed !== null && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      const rfc = typeof p.rfc === "string" ? p.rfc : "¿RFC?";
      const fuente = typeof p.fuente === "string" ? p.fuente : "¿fuente?";
      const de = typeof p.de === "string" ? p.de : "¿?";
      const a = typeof p.a === "string" ? p.a : "¿?";
      return `RFC ${rfc} — ${fuente}: ${de} → ${a}`;
    }
  } catch {
    // payloadRef no es JSON: se muestra tal cual (sigue siendo legible).
  }
  return payloadRef;
}

// El tablero depende de la sesion/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const { clientes, operaciones, alertasVigia } = await withTenantFromSession(
    session,
    async (
      tx
    ): Promise<{
      clientes: ClienteFila[];
      operaciones: OperacionFila[];
      alertasVigia: AlertaVigiaFila[];
    }> => {
      const clientes = await tx.cliente.findMany({
        select: { id: true, rfc: true, razonSocial: true },
        orderBy: { razonSocial: "asc" },
      });
      const operaciones = await tx.operacion.findMany({
        select: { id: true, referencia: true, estado: true },
        orderBy: { creadoEn: "desc" },
      });
      // [Agente VIGIA-BARRIDO, Inc 11] últimos 10 eventos "VIGIA_ALERTA" del
      // tenant (la RLS ya filtra por app.tenant_id; alerta, NUNCA bloqueo).
      const alertasVigia = await tx.bitacoraAuditoria.findMany({
        where: { accion: "VIGIA_ALERTA" },
        select: { id: true, creadoEn: true, payloadRef: true },
        orderBy: { creadoEn: "desc" },
        take: 10,
      });
      return { clientes, operaciones, alertasVigia };
    }
  );

  const nombreUsuario = session.user.name ?? session.user.email ?? "Usuario";
  const tenantId = session.user.tenantId;
  // [Agente SERVICIO-12, Inc 12] El rol proviene del JWT verificado: solo ADMIN
  // ve el enlace a la administración de listados (la defensa real la imponen
  // la página /admin/listados y sus endpoints, no este condicional de UX).
  const esAdmin = session.user.rol === "ADMIN";

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
          {/* [Inc 19] Tablero ejecutivo con métricas (cualquier rol autenticado). */}
          <a
            href="/tablero-ejecutivo"
            style={{
              background: "#1d4ed8",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            Tablero ejecutivo
          </a>
          {/* [Inc 17] Contrato de encargo LFPDPPP por tenant (generación solo ADMIN). */}
          <a
            href="/contrato-encargo"
            style={{
              background: "#0f766e",
              color: "#fff",
              padding: "0.5rem 0.9rem",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            Contrato de encargo
          </a>
          {/* [Agente SERVICIO-12, Inc 12] enlace solo-ADMIN a /admin/listados */}
          {esAdmin ? (
            <a
              href="/admin/listados"
              style={{
                background: "#0f766e",
                color: "#fff",
                padding: "0.5rem 0.9rem",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Listados (admin)
            </a>
          ) : null}
          {/* [Inc 18 / Inc 21] Gestión de usuarios y estado de conectores (solo ADMIN). */}
          {esAdmin ? (
            <a
              href="/usuarios"
              style={{
                background: "#7c3aed",
                color: "#fff",
                padding: "0.5rem 0.9rem",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Usuarios
            </a>
          ) : null}
          {esAdmin ? (
            <a
              href="/admin/conectores"
              style={{
                background: "#475569",
                color: "#fff",
                padding: "0.5rem 0.9rem",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Conectores
            </a>
          ) : null}
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

      {/* [Agente VIGIA-BARRIDO, Inc 11] Alertas del barrido diario del vigía:
          eventos "VIGIA_ALERTA" de la bitácora del tenant (últimos 10). Es
          ALERTA, NO bloqueo (C9): solo informa; el responsable decide. */}
      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>
          Alertas de cumplimiento (vigía) ({alertasVigia.length})
        </h2>
        {alertasVigia.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>Sin alertas del vigía.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fecha</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {alertasVigia.map((a: AlertaVigiaFila) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {a.creadoEn.toISOString()}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {payloadVigiaLegible(a.payloadRef)}
                  </td>
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
