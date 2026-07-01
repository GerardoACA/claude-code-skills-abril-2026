// CERBERUS COMERCIO EXTERIOR — API de Operaciones de despacho. NO es SIDF.
// ============================================================================
// Route handler (Next.js App Router) para ALTA y LISTADO de Operacion.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado de la sesión (NextAuth), NUNCA del body/query del request. Toda
// escritura/lectura tenant-scoped corre dentro de withTenantFromSession (abre
// transacción + SET LOCAL app.tenant_id => la RLS de Postgres filtra por tenant).
//
// Campos reales del modelo Operacion (prisma/schema.prisma): clienteId, referencia.
// El campo `estado` (EstadoDespacho) usa su @default(ARMADO) del schema: NO se envía
// en el alta para respetar el valor por defecto. El avance de estado lo gestiona el
// Agente MAQUINA-ESTADOS en su propio route; aquí solo se crea en ARMADO.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

export const runtime = "nodejs";

// Validación de entrada del alta. Solo se exige lo mínimo del modelo real:
// clienteId (a qué cliente se liga) y referencia (identificador interno del despacho).
const AltaOperacionSchema = z.object({
  clienteId: z
    .string()
    .trim()
    .min(1, "El cliente es obligatorio")
    .max(128, "clienteId inválido"),
  referencia: z
    .string()
    .trim()
    .min(1, "La referencia es obligatoria")
    .max(200, "La referencia es demasiado larga"),
});

type AltaOperacion = z.infer<typeof AltaOperacionSchema>;

/** Forma de la fila devuelta al cliente tras el alta / en el listado. */
type OperacionResumen = {
  id: string;
  referencia: string;
  estado: string;
  clienteId: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA del body (convención DURA del blueprint).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 1) Parseo del JSON del body (defensivo).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 2) Validación con zod.
  const parsed = AltaOperacionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const datos: AltaOperacion = parsed.data;

  // 3) Alta tenant-scoped. `estado` usa el @default(ARMADO) del schema: no se envía.
  //    El clienteId debe pertenecer al mismo tenant; la RLS garantiza que un FK a
  //    un cliente de otro tenant no sea visible (create fallaría por FK invisible).
  try {
    const creada: OperacionResumen = await withTenantFromSession(
      session,
      async (tx): Promise<OperacionResumen> => {
        return tx.operacion.create({
          data: {
            tenantId,
            clienteId: datos.clienteId,
            referencia: datos.referencia,
          },
          select: {
            id: true,
            referencia: true,
            estado: true,
            clienteId: true,
          },
        });
      },
    );

    return NextResponse.json({ ok: true, operacion: creada }, { status: 201 });
  } catch (err: unknown) {
    // Violación de unicidad (@@unique([tenantId, referencia])) => referencia repetida.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe una operación con esa referencia en este tenant" },
        { status: 409 },
      );
    }
    // FK inexistente/invisible (cliente de otro tenant o inexistente).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "El cliente indicado no existe en este tenant" },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo registrar la operación" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const operaciones: OperacionResumen[] = await withTenantFromSession(
      session,
      async (tx): Promise<OperacionResumen[]> => {
        return tx.operacion.findMany({
          select: {
            id: true,
            referencia: true,
            estado: true,
            clienteId: true,
          },
          orderBy: { creadoEn: "desc" },
        });
      },
    );

    return NextResponse.json({ ok: true, operaciones }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar las operaciones" },
      { status: 500 },
    );
  }
}
