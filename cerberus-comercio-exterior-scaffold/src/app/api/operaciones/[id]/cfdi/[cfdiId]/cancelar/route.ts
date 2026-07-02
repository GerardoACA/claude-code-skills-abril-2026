// CERBERUS COMERCIO EXTERIOR — API cancelación de un CFDI (motivos 01-04). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/cfdi/[cfdiId]/cancelar/route.ts
// Propósito: POST { motivo: "M01".."M04", sustituyeUuid? } que intenta cancelar
//            un ComprobanteCfdi TIMBRADO vía obtenerTimbrador().cancelar(...)
//            (Agente MODELO-13). Decisión C8 del cliente: la cancelación se
//            modela desde el inicio aunque hoy el conector sea NoOp — con NoOp
//            ningún comprobante llega a TIMBRADO, así que este endpoint
//            responderá 409 con mensaje claro (no hay timbrado que cancelar),
//            pero el flujo completo queda listo para el PAC real.
//
// Reglas del estándar CFDI 4.0: motivo M01 ("comprobante emitido con errores
// CON relación") exige el uuid del comprobante que sustituye (sustituyeUuid).
// Solo procede sobre estado TIMBRADO; en otro estado => 409.
// Registra el evento de bitácora "CFDI_CANCELAR_INTENTO" encadenado (patrón
// exacto de pasos/route.ts). params async (Next 16) con ambos segmentos.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { obtenerTimbrador, type ResultadoCancelacion } from "@/lib/timbrador-pac";

export const runtime = "nodejs";

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// -----------------------------------------------------------------------------
// Body: motivo M01..M04 (enum MotivoCancelacion del schema); sustituyeUuid es
// OBLIGATORIO si el motivo es M01 (sustitución con relación).
// -----------------------------------------------------------------------------
const esquemaCancelacion = z
  .object({
    motivo: z.enum(["M01", "M02", "M03", "M04"]),
    sustituyeUuid: z.string().trim().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.motivo === "M01" && (v.sustituyeUuid === undefined || v.sustituyeUuid.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sustituyeUuid"],
        message:
          "El motivo M01 (emitido con errores con relación) exige el UUID del comprobante que sustituye",
      });
    }
  });

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; cfdiId: string }> },
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

  const { id, cfdiId } = await context.params;

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parseado = esquemaCancelacion.safeParse(bruto);
  if (!parseado.success) {
    return NextResponse.json(
      {
        error: "Solicitud de cancelación inválida",
        errores: parseado.error.issues.map((i) => ({
          campo: i.path.length > 0 ? i.path.join(".") : "body",
          mensaje: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const { motivo, sustituyeUuid } = parseado.data;

  // 1) Cargar el comprobante del tenant (RLS) para la operación de la ruta.
  let comprobante: {
    id: string;
    estado: string;
    uuid: string | null;
    emisorRfc: string;
  } | null;
  try {
    comprobante = await withTenantFromSession(session, async (tx) => {
      const c = await tx.comprobanteCfdi.findFirst({
        where: { id: cfdiId, operacionId: id },
        select: { id: true, estado: true, uuid: true, emisorRfc: true },
      });
      return c === null
        ? null
        : { id: c.id, estado: c.estado as string, uuid: c.uuid, emisorRfc: c.emisorRfc };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el comprobante" },
      { status: 500 },
    );
  }

  if (comprobante === null) {
    return NextResponse.json(
      { error: "Comprobante no encontrado para este tenant/operación" },
      { status: 404 },
    );
  }

  // 2) Solo procede sobre TIMBRADO. Con el conector NoOp nada llega a TIMBRADO,
  //    así que hoy este es el camino esperado: mensaje honesto y claro.
  if (comprobante.estado !== "TIMBRADO") {
    return NextResponse.json(
      {
        error:
          `No hay timbrado que cancelar: el comprobante está en ${comprobante.estado}. ` +
          "Solo un CFDI TIMBRADO (con folio fiscal del PAC) puede cancelarse; " +
          "el conector PAC aún no está configurado.",
      },
      { status: 409 },
    );
  }

  // 3) Intento de cancelación vía el conector (EntradaCancelacion del Agente
  //    MODELO-13; fuera de transacción: un PAC real tiene latencia).
  let resultado: ResultadoCancelacion;
  try {
    resultado = await obtenerTimbrador().cancelar({
      uuid: comprobante.uuid ?? undefined,
      motivo,
      sustituyeUuid,
      emisorRfc: comprobante.emisorRfc,
    });
  } catch {
    return NextResponse.json(
      { error: "El conector PAC falló al intentar la cancelación" },
      { status: 502 },
    );
  }

  const detallePac: string = JSON.stringify(resultado);
  const cancelado: boolean = resultado.ok === true;

  // 4) Persistir el resultado + evento de bitácora encadenado (atómico).
  let respuesta: { estado: string; timestamp: string } | null;
  try {
    respuesta = await withTenantFromSession(session, async (tx) => {
      const vigente = await tx.comprobanteCfdi.findFirst({
        where: { id: cfdiId, operacionId: id },
        select: { id: true },
      });
      if (!vigente) return null;

      const ahora = new Date();

      // Flujo futuro con PAC real: resultado.ok => CANCELADO + motivo (+ uuid
      // sustituto si M01). Si el PAC no confirma, solo se guarda su respuesta.
      const actualizado = await tx.comprobanteCfdi.update({
        where: { id: vigente.id },
        data: cancelado
          ? {
              estado: "CANCELADO",
              motivoCancelacion: motivo,
              sustituyeUuid: sustituyeUuid ?? null,
              detallePac,
            }
          : { detallePac },
        select: { estado: true },
      });

      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      const payloadEvento = {
        tenantId,
        accion: "CFDI_CANCELAR_INTENTO",
        actor,
        operacionId: id,
        cfdiId: vigente.id,
        motivo,
        sustituyeUuid: sustituyeUuid ?? null,
        resultadoOk: cancelado,
        resultadoEstado: resultado.estado,
        creadoEn: ahora.toISOString(),
        hashPrev,
      };
      const selloEvento = sha256(canonical(payloadEvento));

      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "CFDI_CANCELAR_INTENTO",
          operacionId: id,
          payloadRef: `operacion:${id}:cfdi:${vigente.id}:cancelar:${motivo}`,
          sha256: selloEvento,
          hashPrev,
          creadoEn: ahora,
        },
        select: { id: true },
      });

      return { estado: actualizado.estado as string, timestamp: ahora.toISOString() };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el intento de cancelación" },
      { status: 500 },
    );
  }

  if (respuesta === null) {
    return NextResponse.json(
      { error: "Comprobante no encontrado para este tenant/operación" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      cancelado,
      estado: respuesta.estado,
      motivo,
      detalle: resultado.detalle,
      timestamp: respuesta.timestamp,
    },
    { status: 200 },
  );
}
