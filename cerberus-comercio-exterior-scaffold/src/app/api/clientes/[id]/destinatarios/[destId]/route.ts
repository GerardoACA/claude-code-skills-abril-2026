// CERBERUS COMERCIO EXTERIOR — API destinatario (editar/eliminar). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/destinatarios/[destId]/route.ts  (Inc 36)
// Propósito: PATCH actualiza un destinatario (parcial); DELETE lo elimina.
//            Multi-tenant (RLS); tenantId del JWT.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { CATEGORIAS, CANALES, CARGOS } from "@/lib/notificaciones-catalogo";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    cargo: z.enum(CARGOS).optional(),
    canal: z.enum(CANALES).optional(),
    direccion: z.string().trim().min(1).max(200).optional(),
    categorias: z.array(z.enum(CATEGORIAS)).min(1).optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada que actualizar" });

type Params = { params: Promise<{ id: string; destId: string }> };

export async function PATCH(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId, destId } = await params;

  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parseado = patchSchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Body inválido", detalles: parseado.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const ok = await withTenantFromSession(session, async (tx) => {
      const d = await tx.destinatario.findFirst({ where: { id: destId, clienteId }, select: { id: true } });
      if (!d) return false;
      await tx.destinatario.update({ where: { id: d.id }, data: parseado.data, select: { id: true } });
      return true;
    });
    if (!ok) return NextResponse.json({ error: "Destinatario no encontrado para este tenant" }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el destinatario" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId, destId } = await params;
  try {
    const ok = await withTenantFromSession(session, async (tx) => {
      const d = await tx.destinatario.findFirst({ where: { id: destId, clienteId }, select: { id: true } });
      if (!d) return false;
      await tx.destinatario.delete({ where: { id: d.id } });
      return true;
    });
    if (!ok) return NextResponse.json({ error: "Destinatario no encontrado para este tenant" }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar el destinatario" }, { status: 500 });
  }
}
