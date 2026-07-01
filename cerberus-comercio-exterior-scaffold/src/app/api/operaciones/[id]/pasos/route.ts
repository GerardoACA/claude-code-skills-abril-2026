// CERBERUS COMERCIO EXTERIOR — API pasos del despacho (trámite documental). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pasos/route.ts
// Propósito: POST que registra un PasoDespacho (MVE_E2, COVE, PREVALIDACION,
//            PAGO, DODA) para una Operacion. Cada paso se sella con sha256 sobre
//            un payload canónico y se registra un evento en BitacoraAuditoria
//            (append-only, sha256 encadenado con el último evento del tenant).
//            GET opcional lista los pasos de la operación.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda escritura tenant-scoped
// corre dentro de withTenantFromSession (abre transacción + SET LOCAL
// app.tenant_id => la RLS filtra por el tenant del token). La lectura del último
// eslabón + el INSERT del paso + el INSERT del evento son atómicos.
//
// No bloquea: es registro. Campos según el tipo de paso (fail-closed si faltan).
// =============================================================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Valores REALES del enum TipoPaso (prisma/schema.prisma, Agente MODELO-6).
// -----------------------------------------------------------------------------
type TipoPaso = "MVE_E2" | "COVE" | "PREVALIDACION" | "PAGO" | "DODA";

const TIPOS: readonly TipoPaso[] = [
  "MVE_E2",
  "COVE",
  "PREVALIDACION",
  "PAGO",
  "DODA",
];

/** Type guard: la cadena es un valor del enum TipoPaso. */
function esTipoPaso(v: unknown): v is TipoPaso {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v);
}

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

type Body = {
  tipo?: unknown;
  acuse?: unknown;
  sello?: unknown;
  monto?: unknown;
  detalle?: unknown;
};

/** Datos ya validados de un paso listos para persistir. */
type PasoData = {
  tipo: TipoPaso;
  acuse: string | null;
  sello: string | null;
  monto: Prisma.Decimal | null;
  detalle: string | null;
};

/** Normaliza un valor opcional de texto a string no vacío o null. */
function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Valida el body según el tipo de paso y arma los campos a persistir.
 *   - MVE_E2 / COVE / DODA: requieren `acuse`.
 *   - PREVALIDACION: requiere `sello`.
 *   - PAGO: requiere `monto` (number o string decimal, >= 0).
 * Devuelve un mensaje de error si algo falta o es inválido.
 */
function validar(body: Body): { ok: true; data: PasoData } | { ok: false; error: string } {
  if (!esTipoPaso(body.tipo)) {
    return { ok: false, error: "El campo 'tipo' debe ser un TipoPaso válido" };
  }
  const tipo: TipoPaso = body.tipo;
  const detalle = texto(body.detalle);

  if (tipo === "MVE_E2" || tipo === "COVE" || tipo === "DODA") {
    const acuse = texto(body.acuse);
    if (acuse === null) {
      return { ok: false, error: `El paso ${tipo} requiere un 'acuse' no vacío` };
    }
    return { ok: true, data: { tipo, acuse, sello: null, monto: null, detalle } };
  }

  if (tipo === "PREVALIDACION") {
    const sello = texto(body.sello);
    if (sello === null) {
      return { ok: false, error: "El paso PREVALIDACION requiere un 'sello' no vacío" };
    }
    return { ok: true, data: { tipo, acuse: null, sello, monto: null, detalle } };
  }

  // PAGO
  const bruto = body.monto;
  if (typeof bruto !== "number" && typeof bruto !== "string") {
    return { ok: false, error: "El paso PAGO requiere un 'monto' (number o string decimal)" };
  }
  let monto: Prisma.Decimal;
  try {
    monto = new Prisma.Decimal(bruto);
  } catch {
    return { ok: false, error: "El 'monto' del PAGO no es un decimal válido" };
  }
  if (!monto.isFinite() || monto.isNegative()) {
    return { ok: false, error: "El 'monto' del PAGO debe ser un número finito >= 0" };
  }
  return { ok: true, data: { tipo, acuse: null, sello: null, monto, detalle } };
}

type Resultado =
  | {
      tipo: "ok";
      pasoId: string;
      tipoPaso: TipoPaso;
      sha256: string;
      timestamp: string;
    }
  | { tipo: "no-encontrada" };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 0) tenantId + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown; email?: unknown; name?: unknown } } | null)
    ?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const actor: string =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  const { id } = await context.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validacion = validar(body);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const data: PasoData = validacion.data;

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 1) Confirmar que la operación existe para este tenant (RLS la limita).
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!operacion) {
        return { tipo: "no-encontrada" as const };
      }

      const completadoEn = new Date();

      // 2) Sello de integridad del paso (SHA-256 sobre payload canónico).
      const payloadPaso = {
        tenantId,
        operacionId: operacion.id,
        tipo: data.tipo,
        acuse: data.acuse,
        sello: data.sello,
        monto: data.monto === null ? null : data.monto.toString(),
        detalle: data.detalle,
        completadoEn: completadoEn.toISOString(),
      };
      const selloPaso = sha256(canonical(payloadPaso));

      // 3) Crear el PasoDespacho sellado (campos según el tipo).
      const paso = await tx.pasoDespacho.create({
        data: {
          tenantId,
          operacionId: operacion.id,
          tipo: data.tipo,
          acuse: data.acuse,
          sello: data.sello,
          monto: data.monto,
          detalle: data.detalle,
          sha256: selloPaso,
          completadoEn,
        },
        select: { id: true, tipo: true },
      });

      // 4) Bitácora append-only: encadenar con el sha256 del último evento del
      //    tenant (dentro de la transacción => lectura + insert atómicos).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      // 5) Sello del evento de bitácora (incluye hashPrev para encadenar y el
      //    sello del propio paso como evidencia del registro).
      const payloadEvento = {
        tenantId,
        accion: "PASO_DESPACHO",
        actor,
        operacionId: operacion.id,
        pasoId: paso.id,
        tipo: data.tipo,
        pasoSha256: selloPaso,
        creadoEn: completadoEn.toISOString(),
        hashPrev,
      };
      const selloEvento = sha256(canonical(payloadEvento));

      const evento = await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PASO_DESPACHO",
          payloadRef: `operacion:${operacion.id}:paso:${paso.id}:${data.tipo}`,
          sha256: selloEvento,
          hashPrev,
          creadoEn: completadoEn,
        },
        select: { sha256: true, creadoEn: true },
      });

      return {
        tipo: "ok" as const,
        pasoId: paso.id,
        tipoPaso: paso.tipo as TipoPaso,
        sha256: evento.sha256,
        timestamp: evento.creadoEn.toISOString(),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el paso del despacho" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      pasoId: resultado.pasoId,
      tipo: resultado.tipoPaso,
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
    },
    { status: 201 },
  );
}

// -----------------------------------------------------------------------------
// GET opcional: lista los pasos de la operación (tenant-scoped vía RLS).
// -----------------------------------------------------------------------------
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown } } | null)?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const pasos = await withTenantFromSession(session, async (tx) => {
      const filas = await tx.pasoDespacho.findMany({
        where: { operacionId: id },
        orderBy: { completadoEn: "asc" },
        select: {
          id: true,
          tipo: true,
          acuse: true,
          sello: true,
          monto: true,
          detalle: true,
          sha256: true,
          completadoEn: true,
        },
      });
      return filas.map((p) => ({
        id: p.id,
        tipo: p.tipo,
        acuse: p.acuse,
        sello: p.sello,
        monto: p.monto === null ? null : p.monto.toString(),
        detalle: p.detalle,
        sha256: p.sha256,
        completadoEn: p.completadoEn.toISOString(),
      }));
    });
    return NextResponse.json({ ok: true, pasos }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los pasos" },
      { status: 500 },
    );
  }
}
