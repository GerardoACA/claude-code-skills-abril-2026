// CERBERUS COMERCIO EXTERIOR — motor PEPS y regla 48h del módulo IMMEX. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/motor-peps.ts  (Incremento 61 — Carril A)
// Propósito: Lógica PURA (sin I/O ni Prisma) del libro de cotejo IMMEX:
//            - aplicarDescargoPeps: reparte un descargo entre las entradas con
//              saldo, de la más antigua a la más nueva (PEPS / FIFO).
//            - evaluarRegla48h: horas entre el fin del despacho y el registro
//              en el control de inventarios (Anexo 24; incumple si > 48h).
//            C9: todo se reporta como faltante/alerta, NUNCA se rechaza.
// =============================================================================

import type { MovimientoLite, ResultadoDescargoPeps, ResultadoRegla48h } from "./tipos";

/**
 * Aplica un descargo bajo PEPS (primeras entradas, primeras salidas).
 *
 * SEMÁNTICA del parámetro `entradas` (dada por el contrato congelado): recibe
 * la lista COMPLETA de movimientos del material (MovimientoLite[] MIXTO, con
 * ENTRADA, DESCARGO y AJUSTE revueltos). La función:
 *  1. Filtra las ENTRADA y las ordena por `registradoEn` ascendente.
 *  2. Calcula el saldo disponible de cada entrada restándole los DESCARGO
 *     previos que la referencian vía `entradaOrigenId`.
 *  3. Reparte `cantidadADescargar` de la entrada más antigua a la más nueva.
 *
 * Devuelve los consumos por entrada y el `faltante` (> 0 si el saldo total no
 * alcanzó; C9: se reporta para alertar, nunca se rechaza el descargo).
 */
export function aplicarDescargoPeps(
  entradas: MovimientoLite[],
  cantidadADescargar: number,
): ResultadoDescargoPeps {
  // Descargos previos ya aplicados: cuánto consumió cada entrada.
  const consumidoPorEntrada = new Map<string, number>();
  for (const mov of entradas) {
    if (mov.tipo === "DESCARGO" && mov.entradaOrigenId !== null) {
      const previo = consumidoPorEntrada.get(mov.entradaOrigenId) ?? 0;
      consumidoPorEntrada.set(mov.entradaOrigenId, previo + mov.cantidad);
    }
  }

  // Entradas ordenadas por antigüedad (PEPS = registradoEn ascendente).
  const entradasOrdenadas = entradas
    .filter((mov) => mov.tipo === "ENTRADA")
    .slice()
    .sort(
      (a, b) => new Date(a.registradoEn).getTime() - new Date(b.registradoEn).getTime(),
    );

  const consumos: ResultadoDescargoPeps["consumos"] = [];
  let restante = Math.max(0, cantidadADescargar);

  for (const entrada of entradasOrdenadas) {
    if (restante <= 0) break;
    const consumido = consumidoPorEntrada.get(entrada.id) ?? 0;
    const disponible = Math.max(0, entrada.cantidad - consumido);
    if (disponible <= 0) continue;
    const aConsumir = Math.min(disponible, restante);
    consumos.push({ entradaId: entrada.id, cantidad: aConsumir });
    restante -= aConsumir;
  }

  // C9: si no alcanzó el saldo, el faltante se REPORTA, no se rechaza.
  return { consumos, faltante: restante };
}

const MS_HORA = 60 * 60 * 1000;

/**
 * Regla de las 48 horas (Anexo 24): horas transcurridas entre la conclusión
 * del despacho y el registro del movimiento en el control de inventarios,
 * redondeadas a 1 decimal; incumple si son MÁS de 48.
 *
 * Criterio DEFENSIVO ante fechas inválidas o faltantes: sin datos confiables
 * no se puede medir el plazo, así que se devuelve { horas: 0, incumple: false }
 * — no se acusa un incumplimiento que no consta (C9: alertar solo con base).
 */
export function evaluarRegla48h(
  despachoConcluidoEn: string,
  registradoEn: string,
): ResultadoRegla48h {
  const inicio = new Date(despachoConcluidoEn).getTime();
  const fin = new Date(registradoEn).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    return { horas: 0, incumple: false };
  }
  const horas = Math.round(((fin - inicio) / MS_HORA) * 10) / 10;
  return { horas, incumple: horas > 48 };
}
