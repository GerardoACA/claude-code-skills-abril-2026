// CERBERUS COMERCIO EXTERIOR — Portal de consulta para la AUTORIDAD (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/autoridad/page.tsx
// Propósito: [Inc 60] Portal de SOLO LECTURA para el rol AUTORIDAD (reforma RFE
//            2026: "acceso remoto continuo" de consulta para el dictamen
//            aduanal). Lista las operaciones del tenant al que la autoridad fue
//            invitada (referencia, cliente, estado, fecha) con el conteo de
//            pasos del despacho y de documentos sellados de cada una.
//
// Autorización (fail-closed):
//   - Sin sesión válida => redirect a /login.
//   - Con sesión pero rol distinto de AUTORIDAD => aviso "acceso exclusivo"
//     con enlace al tablero (NO se filtra ningún dato).
//   El rol proviene del JWT verificado (claim `rol` en src/lib/auth.ts);
//   NUNCA de params/query/headers.
//
// Aislamiento de tenant: toda la lectura pasa por withTenantFromSession
// (SET LOCAL app.tenant_id => la RLS de Postgres filtra por el tenant del
// token). La autoridad ve EXCLUSIVAMENTE el tenant que la invitó.
//
// SOLO LECTURA: esta página no contiene forms, botones de escritura ni POST.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

/** Fila de operación que el portal lista (solo campos mostrados). */
type OperacionAutoridadFila = {
  id: string;
  referencia: string;
  estado: string;
  creadoEn: string;
  cliente: { rfc: string; razonSocial: string };
  conteoPasos: number;
  conteoDocumentos: number;
};

export default async function PortalAutoridadPage() {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Solo el rol AUTORIDAD entra al portal. El resto ve un aviso sin datos.
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

  // 3) Lectura tenant-scoped: la RLS garantiza que la autoridad solo ve el
  //    tenant al que fue invitada (app.tenant_id sale del JWT verificado).
  const operaciones: OperacionAutoridadFila[] = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionAutoridadFila[]> => {
      const filas = await tx.operacion.findMany({
        orderBy: { creadoEn: "desc" },
        take: 200,
        select: {
          id: true,
          referencia: true,
          estado: true,
          creadoEn: true,
          cliente: { select: { rfc: true, razonSocial: true } },
          _count: { select: { pasos: true, documentos: true } },
        },
      });
      return filas.map((op) => ({
        id: op.id,
        referencia: op.referencia,
        estado: op.estado,
        creadoEn: op.creadoEn.toISOString(),
        cliente: {
          rfc: op.cliente.rfc,
          razonSocial: op.cliente.razonSocial,
        },
        conteoPasos: op._count.pasos,
        conteoDocumentos: op._count.documentos,
      }));
    },
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
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
          Operaciones del despacho
        </h1>
        <p style={{ color: "#475569", margin: 0, fontSize: "0.9rem" }}>
          Sesión: <strong>{session.user.name ?? session.user.email}</strong> ·
          Rol: <strong>{session.user.rol}</strong>. Acceso de consulta
          (reforma RFE 2026): este portal no permite crear, editar ni borrar
          información.
        </p>
      </header>

      {operaciones.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          No hay operaciones registradas para este tenant.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Referencia
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Cliente
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Estado
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Fecha
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Pasos
                </th>
                <th style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e2e8f0" }}>
                  Documentos sellados
                </th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((op) => (
                <tr key={op.id}>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <a
                      href={`/autoridad/${encodeURIComponent(op.id)}`}
                      style={{ color: "#2563eb", fontWeight: 600 }}
                    >
                      {op.referencia}
                    </a>
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {op.cliente.razonSocial}{" "}
                    <span style={{ color: "#64748b" }}>({op.cliente.rfc})</span>
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <code>{op.estado}</code>
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#64748b",
                    }}
                  >
                    {new Date(op.creadoEn).toLocaleString("es-MX")}
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "center",
                    }}
                  >
                    {op.conteoPasos}
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.75rem",
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "center",
                    }}
                  >
                    {op.conteoDocumentos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: "1.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        Los datos mostrados corresponden exclusivamente al tenant que otorgó el
        acceso (aislamiento garantizado por Row-Level Security en la base de
        datos).
      </p>
    </main>
  );
}

// =============================================================================
// FIN autoridad/page.tsx  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
