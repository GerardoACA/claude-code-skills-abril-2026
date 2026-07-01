// CERBERUS COMERCIO EXTERIOR — API cambio de estado de despacho (máquina de estados). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/estado/route.ts
// Propósito: POST que avanza el estado de una Operacion según la MÁQUINA DE
//            ESTADOS del despacho (enum EstadoDespacho del schema). Cada cambio
//            válido se registra en la BitacoraAuditoria (append-only, sha256
//            encadenado con el último evento del tenant).
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda escritura tenant-scoped
// corre dentro de withTenantFromSession (abre transacción + SET LOCAL
// app.tenant_id => la RLS filtra por el tenant del token). La lectura del último
// eslabón + el UPDATE del estado + el INSERT del evento son atómicos.
//
// Transición inválida => 400 sin cambiar NADA (fail-closed).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Valores REALES del enum EstadoDespacho (prisma/schema.prisma). NO inventar.
//   ARMADO, PREVALIDADO, PRESENTACION_PENDIENTE, SELECCION, VERDE, ROJO,
//   INCIDENCIA, DOSSIER_GENERADO.
// -----------------------------------------------------------------------------
type EstadoDespacho =
  | "ARMADO"
  | "PREVALIDADO"
  | "PRESENTACION_PENDIENTE"
  | "SELECCION"
  | "VERDE"
  | "ROJO"
  | "INCIDENCIA"
  | "DOSSIER_GENERADO";

const ESTADOS: readonly EstadoDespacho[] = [
  "ARMADO",
  "PREVALIDADO",
  "PRESENTACION_PENDIENTE",
  "SELECCION",
  "VERDE",
  "ROJO",
  "INCIDENCIA",
  "DOSSIER_GENERADO",
];

/**
 * MAPA de transiciones válidas de la máquina de estados del despacho.
 * El flujo modela: armado → prevalidación → presentación → selección
 * automatizada (semáforo) → VERDE/ROJO; el ROJO puede escalar a INCIDENCIA y de
 * ahí resolverse; el reconocimiento (VERDE o ROJO/INCIDENCIA resuelta) cierra en
 * DOSSIER_GENERADO. DOSSIER_GENERADO es estado terminal (sin salidas).
 */
const TRANSICIONES: Readonly<Record<EstadoDespacho, readonly EstadoDespacho[]>> = {
  ARMADO: ["PREVALIDADO"],
  PREVALIDADO: ["PRESENTACION_PENDIENTE"],
  PRESENTACION_PENDIENTE: ["SELECCION"],
  SELECCION: ["VERDE", "ROJO"],
  VERDE: ["DOSSIER_GENERADO"],
  ROJO: ["INCIDENCIA", "DOSSIER_GENERADO"],
  INCIDENCIA: ["DOSSIER_GENERADO"],
  DOSSIER_GENERADO: [],
};

/** Type guard: la cadena es un valor del enum EstadoDespacho. */
function esEstadoDespacho(v: unknown): v is EstadoDespacho {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}

/** ¿La transición actual → destino está permitida por la máquina de estados? */
function transicionValida(
  actual: EstadoDespacho,
  destino: EstadoDespacho,
): boolean {
  return TRANSICIONES[actual].includes(destino);
}

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

type Body = {
  estado?: unknown;
};

type Resultado =
  | {
      tipo: "ok";
      operacionId: string;
      estadoAnterior: EstadoDespacho;
      estadoNuevo: EstadoDespacho;
      sha256: string;
      timestamp: string;
    }
  | { tipo: "no-encontrada" }
  | { tipo: "transicion-invalida"; actual: EstadoDespacho };

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

  // Actor legible para la bitácora (email o nombre del token).
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

  if (!esEstadoDespacho(body.estado)) {
    return NextResponse.json(
      { error: "El campo 'estado' debe ser un EstadoDespacho válido" },
      { status: 400 },
    );
  }
  const destino: EstadoDespacho = body.estado;

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 1) Cargar la operación (RLS la limita al tenant del JWT).
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: { id: true, estado: true },
      });
      if (!operacion) {
        return { tipo: "no-encontrada" as const };
      }

      const actual = operacion.estado as EstadoDespacho;

      // 2) Validar la transición ANTES de escribir nada (fail-closed).
      if (!transicionValida(actual, destino)) {
        return { tipo: "transicion-invalida" as const, actual };
      }

      const creadoEn = new Date();

      // 3) Actualizar el estado SOLO si la transición es válida.
      const actualizada = await tx.operacion.update({
        where: { id: operacion.id },
        data: { estado: destino },
        select: { id: true, estado: true },
      });

      // 4) Bitácora append-only: encadenar con el sha256 del último evento del
      //    tenant (dentro de la transacción => lectura + insert atómicos).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      // 5) Sello de integridad del evento (SHA-256 sobre payload canónico,
      //    incluyendo hashPrev para encadenar).
      const payload = {
        tenantId,
        accion: "CAMBIO_ESTADO",
        actor,
        operacionId: actualizada.id,
        estadoAnterior: actual,
        estadoNuevo: actualizada.estado,
        creadoEn: creadoEn.toISOString(),
        hashPrev,
      };
      const selloSha256 = sha256(canonical(payload));

      const evento = await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "CAMBIO_ESTADO",
          payloadRef: `operacion:${actualizada.id}:${actual}->${actualizada.estado}`,
          sha256: selloSha256,
          hashPrev,
          creadoEn,
        },
        select: { sha256: true, creadoEn: true },
      });

      return {
        tipo: "ok" as const,
        operacionId: actualizada.id,
        estadoAnterior: actual,
        estadoNuevo: actualizada.estado as EstadoDespacho,
        sha256: evento.sha256,
        timestamp: evento.creadoEn.toISOString(),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar el estado de la operación" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }
  if (resultado.tipo === "transicion-invalida") {
    return NextResponse.json(
      {
        error: "Transición de estado inválida",
        estadoActual: resultado.actual,
        estadoSolicitado: destino,
        transicionesPermitidas: TRANSICIONES[resultado.actual],
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      operacionId: resultado.operacionId,
      estadoAnterior: resultado.estadoAnterior,
      estadoNuevo: resultado.estadoNuevo,
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
    },
    { status: 200 },
  );
}
