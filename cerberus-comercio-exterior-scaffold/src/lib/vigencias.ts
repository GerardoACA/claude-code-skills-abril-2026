// CERBERUS COMERCIO EXTERIOR — clasificación de vigencias/vencimientos. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/vigencias.ts  (Incremento 33)
// Propósito: Clasificar una fecha de vencimiento en VIGENTE / POR_VENCER /
//            VENCIDO / SIN_FECHA y calcular los días restantes, de forma pura y
//            testeable. Lo consume el calendario de cumplimiento (/vigencias) y,
//            a futuro, el vigía para alertar (C9: alerta, no bloquea).
// =============================================================================

export type EstadoVigencia = "VIGENTE" | "POR_VENCER" | "VENCIDO" | "SIN_FECHA";

export interface ClasificacionVigencia {
  readonly estado: EstadoVigencia;
  /** Días naturales hasta el vencimiento (negativo si ya venció; null sin fecha). */
  readonly diasRestantes: number | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Clasifica una vigencia respecto a `ahora`. `diasAviso` (default 30) define la
 * ventana "por vencer". Un vencimiento HOY o pasado es VENCIDO.
 */
export function clasificarVigencia(
  vence: Date | null,
  ahora: Date,
  diasAviso = 30,
): ClasificacionVigencia {
  if (vence === null || Number.isNaN(vence.getTime())) {
    return { estado: "SIN_FECHA", diasRestantes: null };
  }
  // Días completos restantes (redondeo hacia arriba: parte del día cuenta).
  const diasRestantes = Math.ceil((vence.getTime() - ahora.getTime()) / MS_DIA);
  if (diasRestantes < 0) return { estado: "VENCIDO", diasRestantes };
  if (diasRestantes <= diasAviso) return { estado: "POR_VENCER", diasRestantes };
  return { estado: "VIGENTE", diasRestantes };
}

/** Orden de urgencia para listar (vencidos y lo más próximo primero). */
export function ordenUrgencia(c: ClasificacionVigencia): number {
  if (c.diasRestantes === null) return Number.MAX_SAFE_INTEGER;
  return c.diasRestantes;
}
