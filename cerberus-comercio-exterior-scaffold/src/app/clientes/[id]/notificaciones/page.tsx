// CERBERUS COMERCIO EXTERIOR — página de destinatarios de notificaciones (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/notificaciones/page.tsx  (Incremento 36)
// Propósito: Módulo donde CADA cliente define QUIÉN (CEO/CFO/OCN…) recibe QUÉ
//            categoría de aviso y por qué canal. Carga el cliente (RLS) y monta
//            el gestor. El vigía/cron enruta cada aviso a los suscritos (Inc 36).
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { DestinatariosNotificaciones } from "@/components/DestinatariosNotificaciones";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;

  const cliente = await withTenantFromSession(session, async (tx) =>
    tx.cliente.findFirst({ where: { id }, select: { id: true, rfc: true, razonSocial: true } }),
  );

  if (!cliente) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p><a href="/clientes" style={{ color: "#2563eb" }}>Volver a clientes</a></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href={`/clientes/${encodeURIComponent(cliente.id)}/panorama`} style={{ color: "#2563eb", fontSize: "0.9rem" }}>← Panorama</a>
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Notificaciones y destinatarios</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        <strong>{cliente.razonSocial}</strong> · <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
      </p>

      <div style={{ marginTop: "1rem", marginBottom: "1.75rem", padding: "0.8rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1e40af", fontSize: "0.85rem" }}>
        Define aquí <strong>a quién</strong> del cliente (CEO, CFO, OCN, operaciones, legal…) le llega <strong>cada tipo</strong> de aviso
        y por qué canal. El vigía enruta automáticamente cada novedad (cumplimiento, vigencias, opinión 32-D, despacho, KYC, sanciones)
        a los destinatarios suscritos a esa categoría. Telegram se envía de inmediato; el correo queda pendiente de conector.
      </div>

      <DestinatariosNotificaciones clienteId={cliente.id} />
    </main>
  );
}
