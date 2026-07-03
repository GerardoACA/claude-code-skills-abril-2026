// CERBERUS COMERCIO EXTERIOR — página opinión 32-D ingestada (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/opinion/page.tsx  (Incremento 22)
// Propósito: Gestionar las opiniones de cumplimiento (32-D) que el cliente
//            entrega impresas/PDF: explica el flujo, muestra el historial con su
//            veredicto de autenticidad y el estado del cotejo en vivo, y monta el
//            form de ingesta + validación.
//
// Lectura tenant-scoped vía withTenantFromSession (RLS). C9: los veredictos
// alertan, no bloquean.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { OpinionUploadForm } from "@/components/OpinionUploadForm";

export const dynamic = "force-dynamic";

type Veredicto = "AUTENTICA" | "SOSPECHOSA" | "NO_AUTENTICA" | "NO_VERIFICABLE";

type OpinionFila = {
  id: string;
  folio: string | null;
  rfcDocumento: string | null;
  sentido: string;
  fechaEmision: Date | null;
  resultado: Veredicto;
  observaciones: string;
  cotejoEnVivo: string;
  cotejoDetalle: string | null;
  actor: string;
  creadoEn: Date;
};

type ClienteDatos = { id: string; rfc: string; razonSocial: string };

const COLOR: Record<Veredicto, { fondo: string; borde: string; texto: string; etiqueta: string }> = {
  AUTENTICA: { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46", etiqueta: "Auténtica" },
  SOSPECHOSA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e", etiqueta: "Sospechosa" },
  NO_AUTENTICA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c", etiqueta: "No auténtica" },
  NO_VERIFICABLE: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569", etiqueta: "No verificable" },
};

function resumenObservaciones(observaciones: string): string {
  try {
    const parsed: unknown = JSON.parse(observaciones);
    if (parsed && typeof parsed === "object" && "resumen" in parsed) {
      const r = (parsed as { resumen: unknown }).resumen;
      if (typeof r === "string") return r;
    }
  } catch {
    // No es JSON.
  }
  return observaciones;
}

type PageProps = { params: Promise<{ id: string }> };

export default async function OpinionPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  const datos = await withTenantFromSession(
    session,
    async (tx): Promise<{ cliente: ClienteDatos | null; opiniones: OpinionFila[] }> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) return { cliente: null, opiniones: [] };
      const opiniones = await tx.opinionCumplimientoIngestada.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          folio: true,
          rfcDocumento: true,
          sentido: true,
          fechaEmision: true,
          resultado: true,
          observaciones: true,
          cotejoEnVivo: true,
          cotejoDetalle: true,
          actor: true,
          creadoEn: true,
        },
      });
      return { cliente, opiniones: opiniones as OpinionFila[] };
    },
  );

  if (!datos.cliente) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p>
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </main>
    );
  }

  const cliente = datos.cliente;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a
          href={`/clientes/${encodeURIComponent(cliente.id)}/cumplimiento`}
          style={{ color: "#2563eb", fontSize: "0.9rem" }}
        >
          ← Cumplimiento
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Opinión de cumplimiento (32-D) · validación de autenticidad
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        <strong>{cliente.razonSocial}</strong> ·{" "}
        <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
      </p>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1.1rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          color: "#1e40af",
          fontSize: "0.9rem",
        }}
      >
        Cuando el cliente/proveedor <strong>no otorga su e.firma</strong>, entrega
        la <strong>opinión de cumplimiento en PDF</strong> (del <strong>SAT</strong>
        o del <strong>IMSS</strong>). Súbela: CERBERUS extrae su{" "}
        <strong>Cadena Original</strong> y su <strong>Sello Digital</strong>, detecta
        el emisor y analiza la <strong>autenticidad</strong>. Para el SAT, además{" "}
        <strong>verifica el sello criptográficamente</strong> con el certificado que
        descarga del repositorio oficial por número de serie (como un CFDI): si
        alteran RFC, folio o sentido, no valida. C9: los veredictos alertan, no
        bloquean.
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Opiniones ingestadas ({datos.opiniones.length})</h2>
        {datos.opiniones.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Aún no se ha ingestado ninguna opinión para este cliente.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fecha</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Veredicto</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Folio</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Sentido</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Cotejo SAT</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.opiniones.map((o) => {
                const c = COLOR[o.resultado];
                return (
                  <tr key={o.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {o.creadoEn.toISOString().slice(0, 10)}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.15rem 0.6rem",
                          borderRadius: 999,
                          background: c.fondo,
                          border: `1px solid ${c.borde}`,
                          color: c.texto,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        {c.etiqueta}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem" }}>
                      <code style={{ fontSize: "0.75rem" }}>{o.folio ?? "—"}</code>
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>{o.sentido}</td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", color: "#475569" }}>
                      {o.cotejoEnVivo}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "#475569" }}>
                      {resumenObservaciones(o.observaciones)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Ingerir opinión y validar autenticidad</h2>
        <OpinionUploadForm clienteId={cliente.id} />
      </section>
    </main>
  );
}
