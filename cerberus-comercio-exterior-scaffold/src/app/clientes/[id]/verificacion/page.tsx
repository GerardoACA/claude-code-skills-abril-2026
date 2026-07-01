// CERBERUS COMERCIO EXTERIOR — pagina verificacion 69-B (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/verificacion/page.tsx
// Proposito: Muestra el estado 69-B (art. 69-B CFF) del cliente y el boton para
//            (re)verificar. Exige sesion valida (si no => /login). Carga el
//            Cliente y sus Alerta69b EXCLUSIVAMENTE via withTenantFromSession, de
//            modo que la RLS de Postgres filtra por el tenant del JWT verificado.
//
// DECISION C9 — ES ALERTA, NO BLOQUEO: esta pantalla solo INFORMA el estado 69-B
// y ofrece registrarlo. Nunca impide ninguna operacion del cliente.
//
// Server Component (sin "use client"). El unico trozo interactivo es el boton
// BotonVerificar69b, que es su propio client component.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { BotonVerificar69b } from "@/components/BotonVerificar69b";

// Depende de sesion/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// Formas de datos que la pagina renderiza (solo campos mostrados).
type ClienteDatos = { id: string; rfc: string; razonSocial: string };
type AlertaFila = {
  id: string;
  estado: string;
  snapshotDofSha256: string | null;
  snapshotDofFecha: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
};

type PageProps = { params: Promise<{ id: string }> };

export default async function VerificacionPage({ params }: PageProps) {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const datos = await withTenantFromSession(
    session,
    async (
      tx,
    ): Promise<{ cliente: ClienteDatos | null; alertas: AlertaFila[] }> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) {
        return { cliente: null, alertas: [] };
      }
      const alertas = await tx.alerta69b.findMany({
        where: { clienteId: cliente.id },
        select: {
          id: true,
          estado: true,
          snapshotDofSha256: true,
          snapshotDofFecha: true,
          creadoEn: true,
          actualizadoEn: true,
        },
        orderBy: { creadoEn: "desc" },
      });
      return { cliente, alertas };
    },
  );

  if (!datos.cliente) {
    return (
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p style={{ color: "#94a3b8" }}>
          No existe un cliente con ese identificador para tu tenant.
        </p>
        <p>
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </main>
    );
  }

  const cliente = datos.cliente;
  const alertaVigente: AlertaFila | null = datos.alertas[0] ?? null;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
          ← Clientes
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Verificacion 69-B
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        <strong>{cliente.razonSocial}</strong> ·{" "}
        <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
      </p>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1.1rem",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 8,
          color: "#92400e",
          fontSize: "0.9rem",
        }}
      >
        Esto es una <strong>alerta</strong>, no un bloqueo (decision C9). El
        sistema solo marca y registra el estado del art. 69-B CFF para que el
        responsable decida. Nunca impide la operacion.
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Estado actual</h2>
        {alertaVigente ? (
          <div
            style={{
              padding: "1rem 1.2rem",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              marginTop: "0.5rem",
            }}
          >
            <p style={{ margin: "0 0 0.5rem" }}>
              Estado 69-B:{" "}
              <strong style={{ fontSize: "1.05rem" }}>{alertaVigente.estado}</strong>
            </p>
            <p style={{ margin: "0 0 0.25rem", color: "#475569", fontSize: "0.85rem" }}>
              Snapshot DOF (simulado):{" "}
              <code style={{ fontFamily: "monospace" }}>
                {alertaVigente.snapshotDofSha256 ?? "—"}
              </code>
            </p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
              Fecha del snapshot:{" "}
              {alertaVigente.snapshotDofFecha
                ? alertaVigente.snapshotDofFecha.toISOString()
                : "—"}{" "}
              · Actualizado: {alertaVigente.actualizadoEn.toISOString()}
            </p>
          </div>
        ) : (
          <p style={{ color: "#94a3b8", marginTop: "0.5rem" }}>
            Sin alerta 69-B registrada para este cliente. (Ausencia de alerta =
            sin hallazgos.)
          </p>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Verificar</h2>
        <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: 0 }}>
          Ejecuta la verificacion 69-B (STUB demostrativo, sin API externa
          todavia). Registra/actualiza la alerta con un snapshot fechado sellado
          con SHA-256.
        </p>
        <BotonVerificar69b clienteId={cliente.id} />
      </section>

      {datos.alertas.length > 1 ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>
            Historial de alertas ({datos.alertas.length})
          </h2>
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Estado</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Snapshot fecha</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Creado</th>
              </tr>
            </thead>
            <tbody>
              {datos.alertas.map((a: AlertaFila) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{a.estado}</td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {a.snapshotDofFecha ? a.snapshotDofFecha.toISOString() : "—"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {a.creadoEn.toISOString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
