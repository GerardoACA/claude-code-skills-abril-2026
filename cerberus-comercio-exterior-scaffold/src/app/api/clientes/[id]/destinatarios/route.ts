// CERBERUS COMERCIO EXTERIOR — API destinatarios de notificaciones. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/destinatarios/route.ts  (Incremento 36)
// Propósito: GET lista los destinatarios del cliente; POST crea uno (nombre,
//            cargo, canal, dirección y categorías suscritas). Valida contra el
//            catálogo. Multi-tenant (RLS); tenantId del JWT.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { CATEGORIAS, CANALES, CARGOS } from "@/lib/notificaciones-catalogo";

export const runtime = "nodejs";

const bodySchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  cargo: z.enum(CARGOS),
  canal: z.enum(CANALES),
  direccion: z.string().trim().min(1, "La dirección (chat id o correo) es obligatoria").max(200),
  categorias: z.array(z.enum(CATEGORIAS)).min(1, "Elige al menos una categoría"),
  activo: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId } = await params;
  try {
    const destinatarios = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: clienteId }, select: { id: true } });
      if (!cliente) return null;
      const filas = await tx.destinatario.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "asc" },
        select: { id: true, nombre: true, cargo: true, canal: true, direccion: true, categorias: true, activo: true, creadoEn: true },
      });
      return filas.map((d) => ({ ...d, creadoEn: d.creadoEn.toISOString() }));
    });
    if (destinatarios === null) {
      return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, destinatarios }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudieron listar los destinatarios" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId } = await params;

  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parseado = bodySchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Body inválido", detalles: parseado.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const d = parseado.data;

  try {
    const salida = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({ where: { id: clienteId }, select: { id: true } });
      if (!cliente) return null;
      const creado = await tx.destinatario.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          nombre: d.nombre,
          cargo: d.cargo,
          canal: d.canal,
          direccion: d.direccion,
          categorias: d.categorias,
          activo: d.activo ?? true,
        },
        select: { id: true },
      });
      return creado.id;
    });
    if (salida === null) {
      return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, destinatarioId: salida }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo crear el destinatario" }, { status: 500 });
  }
}
