// CERBERUS COMERCIO EXTERIOR — Nueva Operación (Server Component wrapper). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/nueva/page.tsx
// Proposito: Cargar los Cliente del tenant EXCLUSIVAMENTE via withTenantFromSession
//            (RLS de Postgres filtra por app.tenant_id derivado del JWT verificado)
//            y pasarlos como prop al client component OperacionForm, que gestiona el
//            formulario y postea a /api/operaciones. Sin sesion => redirect("/login").
//
// Server Component (sin "use client"): la carga de clientes ocurre en el servidor,
// dentro del contexto de tenant; el formulario interactivo vive en el client component.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import OperacionForm from "@/components/OperacionForm";
import type { ClienteOpcion } from "@/components/OperacionForm";

export const dynamic = "force-dynamic";

export default async function NuevaOperacionPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Carga tenant-scoped de los clientes seleccionables.
  const clientes: ClienteOpcion[] = await withTenantFromSession(
    session,
    async (tx): Promise<ClienteOpcion[]> => {
      return tx.cliente.findMany({
        select: {
          id: true,
          rfc: true,
          razonSocial: true,
        },
        orderBy: { razonSocial: "asc" },
      });
    },
  );

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <a href="/operaciones" style={{ color: "#2563eb" }}>
          ← Operaciones
        </a>
        <h1 style={{ fontSize: "1.75rem", marginTop: "0.75rem" }}>
          Nueva operación de despacho
        </h1>
        <p style={{ color: "#475569", margin: "0.25rem 0 0" }}>
          La operación nace en estado <strong>ARMADO</strong>; el avance se gestiona
          en el detalle de la operación.
        </p>
      </header>

      <OperacionForm clientes={clientes} />
    </main>
  );
}
