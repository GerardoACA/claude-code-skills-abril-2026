// CERBERUS COMERCIO EXTERIOR — API de movimientos IMMEX (libro de cotejo). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/immex/movimientos/route.ts  (Inc 61 — carril B)
// Propósito: GET lista los materiales del inventario IMMEX del cliente con sus
//            movimientos (para la UI de saldos y el vigía). POST registra UN
//            movimiento: { tipo: "ENTRADA", entrada } o { tipo: "DESCARGO",
//            descargo } (zod discriminado). La persistencia vive en
//            @/lib/immex/persistir-movimiento (compartida con la ingesta CSV):
//            upsert inventario/material, movimiento(s) SELLADOS, PEPS en
//            descargos (motor del carril A), saldoActual, regla de 48h y
//            bitácora encadenada "IMMEX_MOVIMIENTO". C9: el faltante de un
//            descargo se registra y reporta, nunca se rechaza.
//
// Multi-tenant: tenantId del JWT (jamás del request); todo dentro de
// withTenantFromSession (RLS, timeout 60s) tras verificar que el cliente es
// del tenant.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  persistirMovimientoImmex,
  type ResultadoPersistirMovimiento,
} from "@/lib/immex/persistir-movimiento";
import { normalizarFechaIso } from "@/lib/immex/ingesta-movimientos";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// ---------------------------------------------------------------------------
// Validación zod. Las fechas aceptan ISO o dd/mm/aaaa (se normalizan a ISO con
// el mismo helper del parser CSV, para que API y CSV se comporten igual).
// ---------------------------------------------------------------------------
const fechaSchema = z
  .string()
  .min(1)
  .transform((v, ctx) => {
    const iso = normalizarFechaIso(v);
    if (iso === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fecha inválida: se espera ISO (aaaa-mm-dd) o dd/mm/aaaa",
      });
      return z.NEVER;
    }
    return iso;
  });

const entradaSchema = z.object({
  fraccion: z.string().trim().regex(/^\d{8}$/, "La fracción debe ser 8 dígitos TIGIE"),
  nico: z.string().trim().max(2).optional(),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria"),
  unidadMedida: z.string().trim().min(1, "La unidad de medida es obligatoria"),
  cantidad: z.number().finite().positive("La cantidad debe ser > 0"),
  valorAduana: z.number().finite().positive().optional(),
  pedimentoNumero: z.string().trim().min(1, "El pedimento es obligatorio"),
  clavePedimento: z.string().trim().min(1, "La clave de pedimento es obligatoria"),
  fechaLimiteRetorno: fechaSchema,
  despachoConcluidoEn: fechaSchema.optional(),
});

const descargoSchema = z.object({
  fraccion: z.string().trim().regex(/^\d{8}$/, "La fracción debe ser 8 dígitos TIGIE"),
  nico: z.string().trim().max(2).optional(),
  cantidad: z.number().finite().positive("La cantidad debe ser > 0"),
  pedimentoNumero: z.string().trim().min(1, "El pedimento es obligatorio"),
  clavePedimento: z.string().trim().min(1, "La clave de pedimento es obligatoria"),
  despachoConcluidoEn: fechaSchema.optional(),
});

const bodySchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ENTRADA"), entrada: entradaSchema }),
  z.object({ tipo: z.literal("DESCARGO"), descargo: descargoSchema }),
]);

// ---------------------------------------------------------------------------
// GET: materiales del inventario del cliente con sus movimientos (orden PEPS:
// registradoEn ascendente). Consumido por la UI (carril C) y el vigía (D).
// ---------------------------------------------------------------------------
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: clienteId } = await params;

  try {
    const salida = await withTenantFromSession(
      session,
      async (tx) => {
        // El cliente debe existir para el tenant del JWT (RLS filtra).
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) return null;

        const inventario = await tx.inventarioImmex.findFirst({
          where: { clienteId },
          select: {
            id: true,
            certificadoIvaIeps: true,
            nivelCiva: true,
            fuente: true,
            actualizadoEn: true,
            materiales: {
              orderBy: [{ fraccion: "asc" }, { nico: "asc" }],
              select: {
                id: true,
                fraccion: true,
                nico: true,
                descripcion: true,
                unidadMedida: true,
                saldoActual: true,
                movimientos: {
                  orderBy: { registradoEn: "asc" },
                  select: {
                    id: true,
                    tipo: true,
                    cantidad: true,
                    valorAduana: true,
                    pedimentoNumero: true,
                    clavePedimento: true,
                    fechaLimiteRetorno: true,
                    despachoConcluidoEn: true,
                    registradoEn: true,
                    entradaOrigenId: true,
                    sha256: true,
                  },
                },
              },
            },
          },
        });

        // Sin inventario aún: respuesta vacía válida (no es error).
        if (!inventario) {
          return { inventario: null, materiales: [] as never[] };
        }
        return {
          inventario: {
            id: inventario.id,
            certificadoIvaIeps: inventario.certificadoIvaIeps,
            nivelCiva: inventario.nivelCiva,
            fuente: inventario.fuente,
            actualizadoEn: inventario.actualizadoEn.toISOString(),
          },
          materiales: inventario.materiales.map((m) => ({
            id: m.id,
            fraccion: m.fraccion,
            nico: m.nico,
            descripcion: m.descripcion,
            unidadMedida: m.unidadMedida,
            saldoActual: Number(m.saldoActual),
            movimientos: m.movimientos.map((mov) => ({
              id: mov.id,
              tipo: mov.tipo,
              cantidad: Number(mov.cantidad),
              valorAduana: mov.valorAduana === null ? null : Number(mov.valorAduana),
              pedimentoNumero: mov.pedimentoNumero,
              clavePedimento: mov.clavePedimento,
              fechaLimiteRetorno: mov.fechaLimiteRetorno?.toISOString() ?? null,
              despachoConcluidoEn: mov.despachoConcluidoEn?.toISOString() ?? null,
              registradoEn: mov.registradoEn.toISOString(),
              entradaOrigenId: mov.entradaOrigenId,
              sha256: mov.sha256,
            })),
          })),
        };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    if (salida === null) {
      return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
    }
    return NextResponse.json(salida);
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el inventario IMMEX" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST: registra UN movimiento (ENTRADA o DESCARGO).
// Respuesta: { ok, movimientoIds, faltante?, regla48h? }.
// ---------------------------------------------------------------------------
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);
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
  const body = parseado.data;

  let salida: ResultadoPersistirMovimiento | null;
  try {
    salida = await withTenantFromSession(
      session,
      async (tx): Promise<ResultadoPersistirMovimiento | null> => {
        // El cliente debe existir para el tenant del JWT (RLS filtra).
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) return null;

        return persistirMovimientoImmex(
          tx,
          body.tipo === "ENTRADA"
            ? { tenantId, clienteId, actor, tipo: "ENTRADA", entrada: body.entrada }
            : { tenantId, clienteId, actor, tipo: "DESCARGO", descargo: body.descargo },
        );
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el movimiento IMMEX" },
      { status: 500 },
    );
  }

  if (salida === null) {
    return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
  }
  // C9: el faltante y la regla de 48h se REPORTAN; el registro nunca se bloquea.
  return NextResponse.json(
    {
      ok: true,
      movimientoIds: salida.movimientoIds,
      ...(salida.faltante !== undefined ? { faltante: salida.faltante } : {}),
      ...(salida.regla48h !== undefined ? { regla48h: salida.regla48h } : {}),
    },
    { status: 201 },
  );
}
// =============================================================================
// FIN route.ts (movimientos IMMEX)  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
