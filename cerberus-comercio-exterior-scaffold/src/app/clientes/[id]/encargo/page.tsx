// CERBERUS COMERCIO EXTERIOR — Página Encargo Conferido (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/encargo/page.tsx
// Propósito: Cargar el Cliente por id (tenant-scoped vía withTenantFromSession, la
//            RLS de Postgres filtra por el tenant del JWT) junto con sus
//            EncargoConferido (B14/B21) y renderizar su estado/vigencia + el form
//            de alta (client component EncargoForm).
//
// Fail-closed: sin sesión válida => redirect a /login. Si el cliente no pertenece
// al tenant (o no existe), la lectura devuelve null y se muestra un aviso.
// En Next 16 `params` es Promise => se hace await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  EncargoForm,
  type ClienteResumen,
  type EncargoResumen,
} from "@/components/EncargoForm";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

type Cargado = {
  cliente: ClienteResumen;
  encargos: EncargoResumen[];
};

/** Etiqueta y color para el estado del encargo (enum EstadoEncargo). */
function estiloEstado(estado: EncargoResumen["estado"]): {
  fondo: string;
  borde: string;
  texto: string;
} {
  switch (estado) {
    case "VIGENTE":
      return { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46" };
    case "REVOCADO":
      return { fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b" };
    case "VENCIDO":
      return { fondo: "#fffbeb", borde: "#fcd34d", texto: "#92400e" };
    default:
      return { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#334155" };
  }
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function EncargoPage({
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
  const cargado: Cargado | null = await withTenantFromSession(
    session,
    async (tx): Promise<Cargado | null> => {
      const cliente = await tx.cliente.findFirst({
        where: { id },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) return null;

      const encargos = await tx.encargoConferido.findMany({
        where: { clienteId: cliente.id },
        select: {
          id: true,
          tipo: true,
          estado: true,
          vigenciaInicio: true,
          vigenciaFin: true,
          aceptacionAgente: true,
          creadoEn: true,
        },
        orderBy: { creadoEn: "desc" },
      });

      const encargosResumen: EncargoResumen[] = encargos.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        estado: e.estado,
        vigenciaInicio: e.vigenciaInicio.toISOString(),
        vigenciaFin: e.vigenciaFin ? e.vigenciaFin.toISOString() : null,
        aceptacionAgente: e.aceptacionAgente,
        creadoEn: e.creadoEn.toISOString(),
      }));

      return { cliente, encargos: encargosResumen };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb" }}>
          ← Clientes
        </a>
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Encargo Conferido
      </h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Aviso de encargo conferido (B14/B21) del cliente, con su vigencia y estado.
        El encargo vigente habilita las operaciones de despacho.
      </p>

      {cargado === null ? (
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
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
          .
        </div>
      ) : (
        <div style={{ marginTop: "2rem" }}>
          {/* Cabecera del cliente */}
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.9rem 1.1rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          >
            <strong>{cargado.cliente.razonSocial}</strong> · RFC{" "}
            <code>{cargado.cliente.rfc}</code>
          </div>

          {/* Encargos existentes: estado + vigencia */}
          <section aria-label="Encargos conferidos" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.2rem" }}>Encargos registrados</h2>
            {cargado.encargos.length === 0 ? (
              <p style={{ color: "#64748b" }}>
                Aún no hay encargos conferidos para este cliente. Registra el primero
                con el formulario de abajo.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {cargado.encargos.map((e) => {
                  const c = estiloEstado(e.estado);
                  return (
                    <li
                      key={e.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                        flexWrap: "wrap",
                        padding: "0.85rem 1rem",
                        marginBottom: "0.6rem",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#fff",
                      }}
                    >
                      <div>
                        <strong>{e.tipo}</strong>
                        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                          Vigencia: {formatearFecha(e.vigenciaInicio)} —{" "}
                          {formatearFecha(e.vigenciaFin)}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                          Aceptación del agente:{" "}
                          {e.aceptacionAgente ? "Sí" : "Pendiente"}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: "0.25rem 0.7rem",
                          borderRadius: 999,
                          background: c.fondo,
                          border: `1px solid ${c.borde}`,
                          color: c.texto,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        {e.estado}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Alta de un nuevo encargo conferido */}
          <EncargoForm cliente={cargado.cliente} />
        </div>
      )}
    </main>
  );
}
