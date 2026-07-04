// CERBERUS COMERCIO EXTERIOR — envío de prueba a un destinatario. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/destinatarios/[destId]/probar/route.ts  (Inc 36)
// Propósito: POST envía un mensaje de PRUEBA al destinatario por su canal, para
//            verificar la configuración (chat id correcto, bot alcanzable) sin
//            esperar una alerta real del vigía. Multi-tenant (RLS).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { enviarTelegramA } from "@/lib/notificador";
import { enviarEmailA } from "@/lib/notificador-email";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; destId: string }> };

export async function POST(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId, destId } = await params;

  // Resolución tenant-scoped (RLS); el envío ocurre FUERA de la transacción.
  let destinatario: { nombre: string; cargo: string; canal: string; direccion: string } | null;
  try {
    destinatario = await withTenantFromSession(session, (tx) =>
      tx.destinatario.findFirst({
        where: { id: destId, clienteId },
        select: { nombre: true, cargo: true, canal: true, direccion: true },
      }),
    );
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el destinatario" }, { status: 500 });
  }
  if (!destinatario) {
    return NextResponse.json({ error: "Destinatario no encontrado para este tenant" }, { status: 404 });
  }

  // Canal EMAIL (Inc 37): mensaje de prueba vía Resend, fail-safe.
  if (destinatario.canal === "EMAIL") {
    const textoEmail =
      `Hola ${destinatario.nombre} (${destinatario.cargo}): este es un mensaje de prueba de CERBERUS. ` +
      `Si lo estás leyendo, tus notificaciones quedaron bien configuradas.`;
    const resultadoEmail = await enviarEmailA(destinatario.direccion, "CERBERUS · Mensaje de prueba", textoEmail);
    return NextResponse.json(
      { ok: resultadoEmail.ok, detalle: resultadoEmail.detalle },
      { status: 200 },
    );
  }

  if (destinatario.canal !== "TELEGRAM") {
    return NextResponse.json(
      { ok: false, detalle: `El canal ${destinatario.canal} no está soportado; solo TELEGRAM y EMAIL envían.` },
      { status: 200 },
    );
  }

  const texto =
    `🐺 CERBERUS · PRUEBA\n` +
    `Hola ${destinatario.nombre} (${destinatario.cargo}): este es un mensaje de prueba. ` +
    `Si lo estás leyendo, tus notificaciones quedaron bien configuradas.`;
  const resultado = await enviarTelegramA(destinatario.direccion, texto);

  return NextResponse.json(
    { ok: resultado.ok, detalle: resultado.detalle ?? (resultado.ok ? "Mensaje de prueba enviado." : "No se pudo enviar.") },
    { status: 200 },
  );
}
