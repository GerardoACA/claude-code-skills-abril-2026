// CERBERUS COMERCIO EXTERIOR — reporte semanal ejecutivo (Incremento 42). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/reporte-semanal.ts
// Propósito: Componer y generar el RESUMEN SEMANAL por tenant AUNQUE no haya
//            alertas (los ejecutivos quieren saber que todo está en orden).
//            Por tenant reúne: total de clientes, clientes con problemas de
//            cumplimiento (última verificación por fuente, como el panorama),
//            alertas del vigía de los últimos 7 días, vencimientos (reutiliza
//            clasificarVigencia sobre opiniones/encargos, solo conteos) y
//            operaciones creadas en los últimos 7 días. Emite UN aviso POR
//            CLIENTE con categoría "REPORTE_SEMANAL" para que despacharAvisos
//            lo enrute a los destinatarios suscritos.
//
// Multi-tenant sin sesión (cron): ids con prisma directo; el trabajo de cada
// tenant corre en withTenant (RLS). C9: informa, NUNCA bloquea. Tolerante a
// fallos por tenant (errores[]).
// =============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { withTenant, listarTenantIds } from "@/lib/tenant-context";
import { clasificarVigencia } from "@/lib/vigencias";
import type { AvisoTenant } from "@/lib/despacho-notificaciones";

const MS_DIA = 24 * 60 * 60 * 1000;

/** Cifras del reporte de UN tenant (entrada de la composición pura). */
export interface DatosReporteTenant {
  /** Total de clientes del tenant. */
  readonly totalClientes: number;
  /** Clientes cuya ÚLTIMA verificación (por fuente) es INHABILITADO_* o ALERTA. */
  readonly clientesConProblemas: number;
  /** Alertas del vigía (bitácora VIGIA_ALERTA) en los últimos 7 días. */
  readonly alertasVigia7d: number;
  /** Vencimientos VENCIDOS (opiniones/encargos). */
  readonly vencidos: number;
  /** Vencimientos POR VENCER (opiniones/encargos). */
  readonly porVencer: number;
  /** Operaciones creadas en los últimos 7 días. */
  readonly operaciones7d: number;
}

/** Resumen del generador multi-tenant. */
export interface ResumenReporteSemanal {
  tenants: number;
  avisos: AvisoTenant[];
  errores: string[];
}

// -----------------------------------------------------------------------------
// componerTextoReporte — función PURA y testeable: compone el texto del reporte
// semanal de un tenant. Línea de salud: "✅ Todo en orden" si NO hay rojos ni
// alertas; "⚠️ Requiere atención" si los hay (clientes con problemas, alertas
// del vigía o vencidos). Los "por vencer" son informativos: no encienden el ⚠️.
// -----------------------------------------------------------------------------
export function componerTextoReporte(datos: DatosReporteTenant): string {
  const requiereAtencion =
    datos.clientesConProblemas > 0 || datos.alertasVigia7d > 0 || datos.vencidos > 0;
  const salud = requiereAtencion ? "⚠️ Requiere atención" : "✅ Todo en orden";

  const lineas: string[] = [
    "🐺 CERBERUS — Reporte semanal",
    salud,
    `Clientes: ${datos.totalClientes} en total · ${datos.clientesConProblemas} con problemas de cumplimiento`,
    `Alertas del vigía (7 días): ${datos.alertasVigia7d}`,
    `Vencimientos: ${datos.vencidos} vencido(s) · ${datos.porVencer} por vencer`,
    `Operaciones nuevas (7 días): ${datos.operaciones7d}`,
  ];
  return lineas.join("\n");
}

/** Resultado en cifras que se considera "problema" de cumplimiento (rojo/ámbar). */
function esResultadoProblema(resultado: string): boolean {
  return (
    resultado === "ALERTA" ||
    resultado === "INHABILITADO_PRESUNTO" ||
    resultado === "INHABILITADO_DEFINITIVO"
  );
}

/**
 * Reúne, DENTRO de la transacción tenant-scoped, las cifras del reporte y los
 * ids de los clientes del tenant (para emitir un aviso por cliente).
 */
async function reunirDatosTenant(
  tx: Prisma.TransactionClient,
  ahora: Date,
): Promise<{ datos: DatosReporteTenant; clienteIds: string[] }> {
  const hace7d = new Date(ahora.getTime() - 7 * MS_DIA);

  const [clientes, verificaciones, alertasVigia7d, opiniones, encargos, operaciones7d] =
    await Promise.all([
      tx.cliente.findMany({ select: { id: true } }),
      // Última verificación por fuente por cliente (mismo criterio del panorama):
      // se ordena descendente y se toma la PRIMERA por (cliente, fuente).
      tx.verificacionCumplimiento.findMany({
        select: { clienteId: true, fuente: true, resultado: true },
        orderBy: { consultadoEn: "desc" },
      }),
      tx.bitacoraAuditoria.count({
        where: { accion: "VIGIA_ALERTA", creadoEn: { gte: hace7d } },
      }),
      // Vencimientos (versión resumida de vigia-vigencias: SOLO conteos sobre
      // opiniones 32-D y encargos conferidos con fecha).
      tx.opinionCumplimientoIngestada.findMany({
        where: { vigenciaHasta: { not: null } },
        select: { vigenciaHasta: true },
      }),
      tx.encargoConferido.findMany({
        where: { vigenciaFin: { not: null } },
        select: { vigenciaFin: true },
      }),
      tx.operacion.count({ where: { creadoEn: { gte: hace7d } } }),
    ]);

  // Clientes con alguna fuente cuyo ÚLTIMO resultado es problemático.
  const vistos = new Set<string>(); // clave "clienteId|fuente" ya resuelta
  const clientesProblema = new Set<string>();
  for (const v of verificaciones) {
    const clave = `${v.clienteId}|${v.fuente}`;
    if (vistos.has(clave)) continue; // solo la más reciente por fuente
    vistos.add(clave);
    if (esResultadoProblema(v.resultado)) clientesProblema.add(v.clienteId);
  }

  // Conteo de vencimientos con la misma clasificación pura del calendario.
  let vencidos = 0;
  let porVencer = 0;
  for (const fecha of [...opiniones.map((o) => o.vigenciaHasta), ...encargos.map((e) => e.vigenciaFin)]) {
    const cl = clasificarVigencia(fecha, ahora);
    if (cl.estado === "VENCIDO") vencidos += 1;
    else if (cl.estado === "POR_VENCER") porVencer += 1;
  }

  return {
    datos: {
      totalClientes: clientes.length,
      clientesConProblemas: clientesProblema.size,
      alertasVigia7d,
      vencidos,
      porVencer,
      operaciones7d,
    },
    clienteIds: clientes.map((c) => c.id),
  };
}

/**
 * Genera el reporte semanal de TODOS los tenants. Por cada tenant compone el
 * texto (aunque todo esté en orden) y emite UN aviso POR CLIENTE con categoría
 * "REPORTE_SEMANAL" (mismo texto del tenant) para que despacharAvisos lo enrute
 * a los destinatarios suscritos. `ahora` inyectable para pruebas.
 */
export async function generarReporteSemanal(
  prisma: PrismaClient,
  ahora: Date = new Date(),
): Promise<ResumenReporteSemanal> {
  const resumen: ResumenReporteSemanal = { tenants: 0, avisos: [], errores: [] };
  // `tenant` tiene FORCE RLS → se enumeran por la función SECURITY DEFINER.
  const tenantIds = await listarTenantIds(prisma);

  for (const tenantId of tenantIds) {
    try {
      const { datos, clienteIds } = await withTenant(
        tenantId,
        (tx) => reunirDatosTenant(tx, ahora),
        { timeout: 60_000, maxWait: 15_000 },
      );
      resumen.tenants += 1;

      const texto = componerTextoReporte(datos);
      for (const clienteId of clienteIds) {
        resumen.avisos.push({
          tenantId,
          clienteId,
          categoria: "REPORTE_SEMANAL",
          texto,
        });
      }
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      resumen.errores.push(`tenant ${tenantId}: ${detalle}`);
      console.error(`[reporte-semanal] falló el reporte del tenant ${tenantId}:`, error);
    }
  }
  return resumen;
}
