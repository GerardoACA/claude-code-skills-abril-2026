// CERBERUS COMERCIO EXTERIOR — página e.firma entregada (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/efirma/page.tsx  (Incremento 20)
// Propósito: Gestionar las e.firmas ENTREGADAS por el cliente/proveedor para
//            sustentar su opinión 32-D: explica por qué se entregan, muestra el
//            historial con su veredicto de autenticidad (VALIDA/ALERTA/INVALIDA/
//            NO_VERIFICABLE) y monta el form de entrega + validación.
//
// Lectura tenant-scoped vía withTenantFromSession (RLS). C14: solo el .cer
// público; la clave privada nunca entra al sistema. C9: los veredictos alertan,
// no bloquean.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { EfirmaUploadForm } from "@/components/EfirmaUploadForm";

export const dynamic = "force-dynamic";

type Veredicto = "VALIDA" | "ALERTA" | "INVALIDA" | "NO_VERIFICABLE";

type EfirmaFila = {
  id: string;
  nombreArchivo: string | null;
  sha256: string;
  rfcCertificado: string | null;
  titular: string | null;
  serie: string | null;
  emisor: string | null;
  validoDesde: Date | null;
  validoHasta: Date | null;
  resultado: Veredicto;
  observaciones: string;
  actor: string;
  creadoEn: Date;
};

type ClienteDatos = { id: string; rfc: string; razonSocial: string };

const COLOR_VEREDICTO: Record<Veredicto, { fondo: string; borde: string; texto: string; etiqueta: string }> = {
  VALIDA: { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46", etiqueta: "Válida" },
  ALERTA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e", etiqueta: "Alerta" },
  INVALIDA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c", etiqueta: "Inválida" },
  NO_VERIFICABLE: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569", etiqueta: "No verificable" },
};

/** Extrae el resumen legible del JSON de observaciones (o el texto crudo). */
function resumenObservaciones(observaciones: string): string {
  try {
    const parsed: unknown = JSON.parse(observaciones);
    if (parsed && typeof parsed === "object" && "resumen" in parsed) {
      const r = (parsed as { resumen: unknown }).resumen;
      if (typeof r === "string") return r;
    }
  } catch {
    // No es JSON: mostrar tal cual.
  }
  return observaciones;
}

type PageProps = { params: Promise<{ id: string }> };

export default async function EfirmaPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  const datos = await withTenantFromSession(
    session,
    async (tx): Promise<{ cliente: ClienteDatos | null; efirmas: EfirmaFila[] }> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) return { cliente: null, efirmas: [] };
      const efirmas = await tx.efirmaEntregada.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          nombreArchivo: true,
          sha256: true,
          rfcCertificado: true,
          titular: true,
          serie: true,
          emisor: true,
          validoDesde: true,
          validoHasta: true,
          resultado: true,
          observaciones: true,
          actor: true,
          creadoEn: true,
        },
      });
      return { cliente, efirmas: efirmas as EfirmaFila[] };
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
        e.firma entregada · Opinión 32-D
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
        La opinión de cumplimiento (art. 32-D CFF) se consulta ante el SAT con la
        e.firma del contribuyente. Como los clientes/proveedores no siempre otorgan
        acceso directo, aquí pueden <strong>entregar su certificado público de
        e.firma (.cer)</strong> y un validador automático analiza su{" "}
        <strong>autenticidad</strong> (emisor SAT, vigencia, RFC y huella). La{" "}
        <strong>clave privada (.key) nunca se entrega ni se almacena</strong>{" "}
        (decisión C14). El cotejo en vivo ante el SAT/PSC queda pendiente de
        conexión (conector).
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>e.firmas entregadas ({datos.efirmas.length})</h2>
        {datos.efirmas.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Aún no se ha entregado ninguna e.firma para este cliente.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fecha</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Veredicto</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Titular / RFC</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Vigencia</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.efirmas.map((e) => {
                const c = COLOR_VEREDICTO[e.resultado];
                return (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {e.creadoEn.toISOString().slice(0, 10)}
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
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>
                      {e.titular ?? "—"}
                      <br />
                      <code style={{ fontSize: "0.75rem", color: "#475569" }}>
                        {e.rfcCertificado ?? "sin RFC"}
                      </code>
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.78rem", color: "#475569" }}>
                      {e.validoDesde ? e.validoDesde.toISOString().slice(0, 10) : "—"}
                      {" → "}
                      {e.validoHasta ? e.validoHasta.toISOString().slice(0, 10) : "—"}
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "#475569" }}>
                      {resumenObservaciones(e.observaciones)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Entregar e.firma y validar autenticidad</h2>
        <EfirmaUploadForm clienteId={cliente.id} />
      </section>
    </main>
  );
}
