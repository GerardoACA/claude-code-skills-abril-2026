// CERBERUS COMERCIO EXTERIOR — cuadre CFDI (Comercio Exterior 1.1) ↔ Pedimento. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/cuadre-cfdi-pedimento.ts
// Propósito: [Inc 53] Lógica PURA de cuadre entre el CFDI con Complemento de
//            Comercio Exterior 1.1 (totalUsd, tipoCambioUsd, fracciones de las
//            mercancías — payload del ComprobanteCfdi) y el Pedimento de la
//            operación (valorAduanaTotal en MXN, tipoCambioUsd) con sus
//            Partidas (fraccionDeclarada). El SAT cruza ambos documentos:
//            fracción arancelaria y valores deben CUADRAR; una discrepancia es
//            hallazgo de auditoría (dictamen del auditor + reporte §2).
//
//            Reglas:
//            - Fracciones se normalizan a 8 dígitos ("8471.30.01" ≡ "84713001").
//              Toda fracción del CFDI debe existir entre las partidas del
//              pedimento; si no está => DISCREPANCIA.
//            - Valor: totalUsd del CFDI vs valorAduanaTotal (MXN) del pedimento
//              convertido a USD con su tipo de cambio. Tolerancia ±2% (los
//              redondeos aduanales existen): dentro de tolerancia pero >0.5%
//              => hallazgo INFORMATIVO (sigue CUADRA); fuera => DISCREPANCIA.
//            - Tipos de cambio distintos entre CFDI y pedimento => hallazgo.
//            - Sin pedimento o sin valores comparables => NO_COMPARABLE con
//              explicación.
//
//            C9: esto ALERTA, nunca bloquea. No lanza; siempre devuelve un
//            resultado renderizable (fail-safe).
// =============================================================================

// ============================================================================
// Contratos de entrada/salida (mínimos, ya serializados a number)
// ============================================================================

/** Lado CFDI del cuadre (del complemento Comercio Exterior 1.1 en el payload). */
export interface DatosCfdiCuadre {
  /** Total en dólares del comprobante (ComercioExterior11.totalUsd). */
  totalUsd: number | null;
  /** Tipo de cambio MXN/USD del CFDI (ComercioExterior11.tipoCambioUsd). */
  tipoCambioUsd: number | null;
  /** Fracciones arancelarias de las mercancías (fraccionArancelaria). */
  fracciones: string[];
}

/** Lado pedimento del cuadre (Pedimento + fracciones de sus Partidas). */
export interface DatosPedimentoCuadre {
  /** Pedimento.valorAduanaTotal (MXN). */
  valorAduanaTotalMxn: number | null;
  /** Pedimento.tipoCambioUsd (MXN por USD). */
  tipoCambioUsd: number | null;
  /** Partida.fraccionDeclarada de cada partida de la operación. */
  fraccionesPartidas: (string | null)[];
}

/** Resultado del cuadre: semáforo + hallazgos legibles para el auditor. */
export interface ResultadoCuadre {
  estado: "CUADRA" | "DISCREPANCIA" | "NO_COMPARABLE";
  hallazgos: string[];
}

// ============================================================================
// Parámetros del cuadre
// ============================================================================

/** Tolerancia de valor (±2%): fuera de ella la diferencia es DISCREPANCIA. */
const TOLERANCIA_VALOR_PCT = 2;
/** Umbral informativo: dentro de tolerancia pero >0.5% se deja constancia. */
const UMBRAL_INFORMATIVO_PCT = 0.5;
/** Tolerancia absoluta entre tipos de cambio (redondeo a 4 decimales DOF). */
const TOLERANCIA_TIPO_CAMBIO = 0.0001;

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Normaliza una fracción arancelaria a sus 8 dígitos (quita puntos, espacios
 * y guiones: "8471.30.01" => "84713001"). Devuelve null si el resultado no
 * son exactamente 8 dígitos (no comparable).
 */
export function normalizarFraccion(fraccion: string): string | null {
  const digitos = fraccion.replace(/[^0-9]/g, "");
  return /^\d{8}$/.test(digitos) ? digitos : null;
}

function esPositivo(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && n > 0;
}

/** Formatea un número con 2 decimales para hallazgos legibles. */
function fmt(n: number): string {
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ============================================================================
// Cuadre
// ============================================================================

/**
 * Cruza el CFDI con Complemento de Comercio Exterior 1.1 contra el pedimento
 * de la operación (fracciones y valores). Puro y fail-safe: nunca lanza.
 * C9: el resultado ALERTA; ninguna discrepancia bloquea la operación.
 */
export function cuadrarCfdiPedimento(
  cfdi: DatosCfdiCuadre,
  pedimento: DatosPedimentoCuadre | null,
): ResultadoCuadre {
  // --- Sin pedimento: no hay contra qué cuadrar. ---
  if (pedimento === null) {
    return {
      estado: "NO_COMPARABLE",
      hallazgos: [
        "La operación no tiene pedimento registrado: no hay contra qué cuadrar el CFDI. Capture el pedimento (contribuciones) para habilitar el cruce.",
      ],
    };
  }

  // --- Sin valores comparables en alguno de los dos lados. ---
  if (!esPositivo(cfdi.totalUsd)) {
    return {
      estado: "NO_COMPARABLE",
      hallazgos: [
        "El CFDI no tiene total en dólares (totalUsd) en el complemento: no se puede cuadrar el valor contra el pedimento.",
      ],
    };
  }
  if (!esPositivo(pedimento.valorAduanaTotalMxn) || !esPositivo(pedimento.tipoCambioUsd)) {
    return {
      estado: "NO_COMPARABLE",
      hallazgos: [
        "El pedimento no tiene valor en aduana total y/o tipo de cambio válidos: no se puede convertir a dólares para el cuadre.",
      ],
    };
  }

  const hallazgos: string[] = [];
  let discrepancia = false;

  // --- 1) Fracciones arancelarias: las del CFDI deben existir en las partidas. ---
  const fraccionesPedimento = new Set<string>();
  for (const f of pedimento.fraccionesPartidas) {
    if (f === null) continue;
    const norm = normalizarFraccion(f);
    if (norm !== null) fraccionesPedimento.add(norm);
  }

  if (cfdi.fracciones.length === 0) {
    hallazgos.push(
      "Informativo: el CFDI no declara fracciones arancelarias en sus mercancías; no se comparó la clasificación.",
    );
  } else if (fraccionesPedimento.size === 0) {
    hallazgos.push(
      "Informativo: las partidas del pedimento no tienen fracción declarada; no se comparó la clasificación arancelaria.",
    );
  } else {
    for (const f of cfdi.fracciones) {
      const norm = normalizarFraccion(f);
      if (norm === null) {
        hallazgos.push(
          `Informativo: la fracción "${f}" del CFDI no tiene formato de 8 dígitos; no se pudo comparar.`,
        );
        continue;
      }
      if (!fraccionesPedimento.has(norm)) {
        discrepancia = true;
        hallazgos.push(
          `La fracción arancelaria ${norm} del CFDI no aparece en las partidas del pedimento (declaradas: ${[...fraccionesPedimento].join(", ")}). El SAT cruza ambos documentos: revise la clasificación.`,
        );
      }
    }
  }

  // --- 2) Valor: total USD del CFDI vs valor en aduana del pedimento en USD. ---
  const valorPedimentoUsd = pedimento.valorAduanaTotalMxn / pedimento.tipoCambioUsd;
  const difPct = (Math.abs(cfdi.totalUsd - valorPedimentoUsd) / valorPedimentoUsd) * 100;

  if (difPct > TOLERANCIA_VALOR_PCT) {
    discrepancia = true;
    hallazgos.push(
      `El total del CFDI (${fmt(cfdi.totalUsd)} USD) difiere ${fmt(difPct)}% del valor en aduana del pedimento (${fmt(valorPedimentoUsd)} USD = ${fmt(pedimento.valorAduanaTotalMxn)} MXN / ${fmt(pedimento.tipoCambioUsd)}), fuera de la tolerancia de ±${TOLERANCIA_VALOR_PCT}%.`,
    );
  } else if (difPct > UMBRAL_INFORMATIVO_PCT) {
    hallazgos.push(
      `Informativo: el total del CFDI (${fmt(cfdi.totalUsd)} USD) difiere ${fmt(difPct)}% del valor en aduana del pedimento (${fmt(valorPedimentoUsd)} USD); está dentro de la tolerancia de ±${TOLERANCIA_VALOR_PCT}% pero deje constancia del redondeo.`,
    );
  }

  // --- 3) Tipos de cambio distintos entre CFDI y pedimento: hallazgo. ---
  if (
    esPositivo(cfdi.tipoCambioUsd) &&
    Math.abs(cfdi.tipoCambioUsd - pedimento.tipoCambioUsd) > TOLERANCIA_TIPO_CAMBIO
  ) {
    hallazgos.push(
      `Informativo: el tipo de cambio del CFDI (${fmt(cfdi.tipoCambioUsd)}) difiere del aplicado en el pedimento (${fmt(pedimento.tipoCambioUsd)}); es válido si las fechas difieren (DOF), pero verifique.`,
    );
  }

  return { estado: discrepancia ? "DISCREPANCIA" : "CUADRA", hallazgos };
}

// ============================================================================
// Extracción desde el payload probatorio del ComprobanteCfdi
// ============================================================================

/**
 * Extrae los datos de cuadre desde el `payload` (JSON canónico) de un
 * ComprobanteCfdi con complemento COMERCIO_EXT_11 (ComprobanteComercioExt de
 * src/lib/comercio-exterior.ts). Fail-safe: payload ilegible => null.
 */
export function extraerDatosCfdiDePayload(payload: string): DatosCfdiCuadre | null {
  try {
    const obj: unknown = JSON.parse(payload);
    if (typeof obj !== "object" || obj === null) return null;
    const ce = (obj as { comercioExterior?: unknown }).comercioExterior;
    if (typeof ce !== "object" || ce === null) return null;

    const c = ce as {
      totalUsd?: unknown;
      tipoCambioUsd?: unknown;
      mercancias?: unknown;
    };
    const totalUsd = typeof c.totalUsd === "number" ? c.totalUsd : null;
    const tipoCambioUsd = typeof c.tipoCambioUsd === "number" ? c.tipoCambioUsd : null;
    const fracciones: string[] = [];
    if (Array.isArray(c.mercancias)) {
      for (const m of c.mercancias) {
        if (
          typeof m === "object" &&
          m !== null &&
          typeof (m as { fraccionArancelaria?: unknown }).fraccionArancelaria === "string"
        ) {
          fracciones.push((m as { fraccionArancelaria: string }).fraccionArancelaria);
        }
      }
    }
    return { totalUsd, tipoCambioUsd, fracciones };
  } catch {
    return null;
  }
}
