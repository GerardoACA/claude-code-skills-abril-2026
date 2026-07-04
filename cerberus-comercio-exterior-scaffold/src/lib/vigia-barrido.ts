// CERBERUS COMERCIO EXTERIOR — barrido diario del vigía (Incremento 11). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/vigia-barrido.ts                     [Agente VIGIA-BARRIDO]
// Propósito: Re-verificación de cumplimiento de TODOS los clientes de TODOS los
//            tenants (la invoca el CRON /api/cron/vigia tras sincronizar los
//            listados SAT). Por cada cliente:
//
//              1. Obtiene el resultado previo MÁS RECIENTE por fuente
//                 (VerificacionCumplimiento, orderBy consultadoEn desc).
//              2. Corre `verificarCumplimiento(tx, { rfc })` (Incremento 10:
//                 consulta los listados REALES del SAT en tablas globales).
//              3. Persiste UN registro VerificacionCumplimiento por fuente
//                 (mismo patrón que POST /api/clientes/[id]/cumplimiento).
//              4. Si alguna fuente EMPEORÓ según el orden de severidad
//                   AL_CORRIENTE(0) < NO_DISPONIBLE(1) < ALERTA(2)
//                   < INHABILITADO_PRESUNTO(3) < INHABILITADO_DEFINITIVO(4)
//                 registra un evento BitacoraAuditoria (accion "VIGIA_ALERTA",
//                 actor "vigia@system", sha256 sobre payload canónico encadenado
//                 con hashPrev del último evento del tenant, operacionId null) —
//                 patrón EXACTO del route de cambio de estado.
//
// Multi-tenant SIN sesión (es un cron, no hay JWT): los ids de Tenant se leen
// con `listarTenantIds` (función SECURITY DEFINER app_listar_tenant_ids(), porque
// la tabla `tenant` tiene FORCE RLS) y cada tenant se recorre
// DENTRO de `withTenant(tenantId, fn)` (@/lib/tenant-context), que abre la
// transacción y fija app.tenant_id => la RLS sigue aislando cada tenant.
// PROHIBIDO evadir la RLS (nada de BYPASSRLS): se itera contexto por contexto.
//
// Decisión C9 — ES ALERTA, *NO* BLOQUEO: el barrido jamás impide operar; solo
// marca, registra y deja evidencia encadenada para que el humano decida.
//
// Tolerancia a fallos: un tenant o un cliente que falla NO aborta el barrido
// (se registra en consola y se continúa con el siguiente).
// =============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { withTenant, listarTenantIds } from "@/lib/tenant-context";
import {
  verificarCumplimiento,
  type FuenteVerificacion,
  type ResultadoFuente,
  type ResultadoVerificacion,
} from "@/lib/verificacion-cumplimiento";
import { sha256 } from "@/lib/probatoria/hash";
import type { AvisoTenant } from "@/lib/despacho-notificaciones";

// -----------------------------------------------------------------------------
// Tipos públicos (firma EXACTA del blueprint del Incremento 11).
// -----------------------------------------------------------------------------

export interface ResumenBarrido {
  tenants: number;
  clientes: number;
  alertas: number;
  detalles: {
    tenantId: string;
    clienteId: string;
    rfc: string;
    fuente: string;
    de: string;
    a: string;
  }[];
  /** Avisos a enrutar a destinatarios suscritos a CUMPLIMIENTO (Inc 36). */
  avisos: AvisoTenant[];
  /** Errores por tenant (visibilidad en la respuesta del cron, no solo consola). */
  errores: string[];
}

/** Detalle de una alerta emitida (elemento de ResumenBarrido.detalles). */
type DetalleAlerta = ResumenBarrido["detalles"][number];

// -----------------------------------------------------------------------------
// Orden de severidad (contrato del Incremento 11). EMPEORAR = pasar a un
// resultado con severidad ESTRICTAMENTE mayor que el previo.
// -----------------------------------------------------------------------------
const SEVERIDAD: Readonly<Record<ResultadoVerificacion, number>> = {
  AL_CORRIENTE: 0,
  NO_DISPONIBLE: 1,
  ALERTA: 2,
  INHABILITADO_PRESUNTO: 3,
  INHABILITADO_DEFINITIVO: 4,
};

function empeoro(de: ResultadoVerificacion, a: ResultadoVerificacion): boolean {
  return SEVERIDAD[a] > SEVERIDAD[de];
}

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// -----------------------------------------------------------------------------
// Resultado previo MÁS RECIENTE por fuente para un cliente: se leen las
// verificaciones ordenadas por consultadoEn desc y se conserva la PRIMERA
// aparición de cada fuente (la más reciente).
// -----------------------------------------------------------------------------
async function previosPorFuente(
  tx: Prisma.TransactionClient,
  clienteId: string,
): Promise<Map<FuenteVerificacion, ResultadoVerificacion>> {
  const filas = await tx.verificacionCumplimiento.findMany({
    where: { clienteId },
    orderBy: { consultadoEn: "desc" },
    select: { fuente: true, resultado: true },
  });

  const previos = new Map<FuenteVerificacion, ResultadoVerificacion>();
  for (const fila of filas) {
    const fuente = fila.fuente as FuenteVerificacion;
    if (!previos.has(fuente)) {
      previos.set(fuente, fila.resultado as ResultadoVerificacion);
    }
  }
  return previos;
}

// -----------------------------------------------------------------------------
// Evento de alerta en la bitácora append-only del tenant: hashPrev = sha256 del
// último evento del tenant (lectura + insert dentro de la MISMA transacción =>
// encadenado atómico), sello = sha256 del payload canónico (incluye hashPrev).
// Patrón EXACTO de src/app/api/operaciones/[id]/estado/route.ts.
// -----------------------------------------------------------------------------
async function registrarAlertaVigia(
  tx: Prisma.TransactionClient,
  detalle: DetalleAlerta,
): Promise<void> {
  const creadoEn = new Date();

  const previo = await tx.bitacoraAuditoria.findFirst({
    orderBy: { creadoEn: "desc" },
    select: { sha256: true },
  });
  const hashPrev: string | null = previo?.sha256 ?? null;

  const payload = {
    tenantId: detalle.tenantId,
    accion: "VIGIA_ALERTA",
    actor: "vigia@system",
    clienteId: detalle.clienteId,
    rfc: detalle.rfc,
    fuente: detalle.fuente,
    de: detalle.de,
    a: detalle.a,
    creadoEn: creadoEn.toISOString(),
    hashPrev,
  };
  const selloSha256 = sha256(canonical(payload));

  await tx.bitacoraAuditoria.create({
    data: {
      tenantId: detalle.tenantId,
      actor: "vigia@system",
      accion: "VIGIA_ALERTA",
      // Sin operación asociada: la alerta es del cliente, no de un despacho.
      operacionId: null,
      // payloadRef JSON-ish legible con la transición detectada.
      payloadRef: JSON.stringify({
        clienteId: detalle.clienteId,
        rfc: detalle.rfc,
        fuente: detalle.fuente,
        de: detalle.de,
        a: detalle.a,
      }),
      sha256: selloSha256,
      hashPrev,
      creadoEn,
    },
    select: { id: true },
  });
}

// -----------------------------------------------------------------------------
// Barrido de UN cliente (dentro de la transacción del tenant): previos → nueva
// verificación → persistencia por fuente → alertas por empeoramiento.
// Devuelve los detalles de alerta emitidos para ese cliente.
// -----------------------------------------------------------------------------
async function barrerCliente(
  tx: Prisma.TransactionClient,
  tenantId: string,
  cliente: { id: string; rfc: string; razonSocial: string },
): Promise<DetalleAlerta[]> {
  // 1) Baseline: resultado previo más reciente por fuente.
  const previos = await previosPorFuente(tx, cliente.id);

  // 2) Verificación fresca contra los listados del SAT (Incremento 10).
  const evaluaciones: ResultadoFuente[] = await verificarCumplimiento(tx, {
    rfc: cliente.rfc,
    // razonSocial: alimenta el match heurístico por nombre de SANCIONES_INT
    // (Inc 12); su resultado es SIEMPRE ALERTA con revisión humana (C9).
    razonSocial: cliente.razonSocial,
  });

  // 3) Persistir UN registro por fuente (igual que el route de cumplimiento) y
  //    detectar empeoramientos contra el baseline.
  const alertas: DetalleAlerta[] = [];

  for (const ev of evaluaciones) {
    await tx.verificacionCumplimiento.create({
      data: {
        tenantId,
        clienteId: cliente.id,
        fuente: ev.fuente,
        resultado: ev.resultado,
        detalle: ev.detalle,
        snapshotSha256: ev.snapshotSha256,
        // consultadoEn: default(now()) del modelo; vigenciaHasta queda null.
      },
      select: { id: true },
    });

    const previoFuente = previos.get(ev.fuente);
    // Sin baseline previo para la fuente => primera verificación: no hay
    // transición que comparar, no se alerta (el registro ya quedó persistido).
    if (previoFuente === undefined) continue;

    if (empeoro(previoFuente, ev.resultado)) {
      const detalle: DetalleAlerta = {
        tenantId,
        clienteId: cliente.id,
        rfc: cliente.rfc,
        fuente: ev.fuente,
        de: previoFuente,
        a: ev.resultado,
      };
      // 4) Alerta encadenada en la bitácora (C9: alerta, NUNCA bloqueo).
      await registrarAlertaVigia(tx, detalle);
      alertas.push(detalle);
    }
  }

  return alertas;
}

// -----------------------------------------------------------------------------
// Barrido completo multi-tenant.
// -----------------------------------------------------------------------------

/** Resultado interno del barrido de un tenant (se agrega fuera del withTenant). */
type ResumenTenant = { clientes: number; detalles: DetalleAlerta[] };

/**
 * Re-verifica el cumplimiento de todos los clientes de todos los tenants y
 * registra alertas de bitácora cuando alguna fuente empeora.
 *
 * - Lee los ids de Tenant con `prisma` directo (tabla raíz sin tenant_id).
 * - Entra a cada tenant con `withTenant(tenantId, fn)` (transacción + RLS),
 *   SIN sesión: es un proceso de sistema (actor "vigia@system").
 * - Tolerante a fallos: un tenant o cliente que falla se registra en consola y
 *   NO aborta el barrido de los demás.
 *
 * @param prisma - Cliente Prisma global (el del proceso del cron).
 */
export async function barridoVigia(prisma: PrismaClient): Promise<ResumenBarrido> {
  const resumen: ResumenBarrido = {
    tenants: 0,
    clientes: 0,
    alertas: 0,
    detalles: [],
    avisos: [],
    errores: [],
  };

  // Ids de todos los tenants. La tabla `tenant` tiene FORCE RLS, así que se
  // enumeran vía la función SECURITY DEFINER app_listar_tenant_ids() (ver
  // listarTenantIds): un findMany directo bajo el rol de app devolvería 0.
  const tenantIds = await listarTenantIds(prisma);

  for (const tenantId of tenantIds) {
    try {
      // Todo el trabajo del tenant corre en SU transacción con app.tenant_id
      // fijado (RLS). Los resultados se devuelven y se agregan FUERA de la
      // transacción: si esta se revierte, no quedan alertas fantasma.
      const resumenTenant = await withTenant(
        tenantId,
        async (tx): Promise<ResumenTenant> => {
          const clientes = await tx.cliente.findMany({
            select: { id: true, rfc: true, razonSocial: true },
            orderBy: { creadoEn: "asc" },
          });

          const parcial: ResumenTenant = { clientes: 0, detalles: [] };

          for (const cliente of clientes) {
            try {
              const alertas = await barrerCliente(tx, tenantId, cliente);
              parcial.clientes += 1;
              parcial.detalles.push(...alertas);
            } catch (error) {
              // Un cliente que falla no aborta el barrido del tenant.
              console.error(
                `[vigia] fallo al verificar cliente ${cliente.id} (rfc ${cliente.rfc}) del tenant ${tenantId}:`,
                error,
              );
            }
          }

          return parcial;
        },
        // Barrido pesado (re-verificacion vs listados SAT) en UNA transaccion:
        // timeout amplio para no abortar a medio tenant (el route permite 300s).
        { timeout: 120_000, maxWait: 20_000 },
      );

      resumen.tenants += 1;
      resumen.clientes += resumenTenant.clientes;
      resumen.alertas += resumenTenant.detalles.length;
      resumen.detalles.push(...resumenTenant.detalles);
      // Inc 36: un aviso por empeoramiento, para enrutar a los destinatarios del
      // cliente suscritos a CUMPLIMIENTO.
      for (const d of resumenTenant.detalles) {
        resumen.avisos.push({
          tenantId: d.tenantId,
          clienteId: d.clienteId,
          categoria: "CUMPLIMIENTO",
          texto: `⚠️ ${d.rfc} · ${d.fuente}: ${d.de} → ${d.a}`,
        });
      }
    } catch (error) {
      // Un tenant que falla (p. ej. su transacción se revierte) no aborta el
      // barrido de los demás. Se registra en consola Y en la respuesta.
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[vigia] fallo el barrido del tenant ${tenantId}:`, error);
      resumen.errores.push(`tenant ${tenantId}: ${msg}`);
    }
  }

  return resumen;
}
