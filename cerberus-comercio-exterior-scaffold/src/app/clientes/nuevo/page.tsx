// CERBERUS COMERCIO EXTERIOR — Alta de Cliente (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/nuevo/page.tsx  (Incremento 46)
// Propósito: Página mínima del alta de Cliente/Importador: título + navegación
//            y monta <ClienteNuevoForm /> (Client Component), que ofrece el
//            prellenado desde la Constancia de Situación Fiscal y postea al
//            /api/clientes existente. El tenantId NUNCA viaja desde el cliente:
//            lo deriva el route handler del JWT verificado.
// =============================================================================

import { ClienteNuevoForm } from "@/components/ClienteNuevoForm";

export default function NuevoClientePage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb" }}>
          ← Clientes
        </a>
        <h1 style={{ fontSize: "1.75rem", marginTop: "0.75rem" }}>
          Registrar cliente / importador
        </h1>
      </header>

      <ClienteNuevoForm />
    </main>
  );
}
