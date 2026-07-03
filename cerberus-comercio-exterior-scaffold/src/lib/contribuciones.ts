// CERBERUS COMERCIO EXTERIOR — cálculo de contribuciones al comercio exterior. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/contribuciones.ts  (Incremento 31)
// Propósito: Calcular, de forma DETERMINISTA y verificable, las contribuciones
//            de una partida de importación y agregarlas a nivel pedimento:
//              - IGI  (Impuesto General de Importación, ad valorem): valor en
//                     aduana × tasa de la fracción.
//              - DTA  (Derecho de Trámite Aduanero): general 8 al millar
//                     (0.008) del valor en aduana (art. 49 LFD); se permite una
//                     cuota fija (p. ej. régimenes/operaciones específicas).
//              - IEPS (si la mercancía lo causa): (valor en aduana + IGI) × tasa.
//              - IVA  (16%) sobre la base = valor en aduana + IGI + DTA + IEPS
//                     (art. 27 LIVA).
//
// Es el CÁLCULO GENERAL. Casos particulares (cuotas específicas, compensatorias,
// preferencias de TLC, franjas fronterizas, IVA 8%, etc.) los ajusta el agente
// aduanal. Las TASAS por fracción se obtienen del conector ClasificadorArancel
// (enchufable a la TIGIE) o se capturan a mano; aquí solo se ARITMETIZAN.
//
// Todos los importes en MXN, redondeados a 2 decimales (centavos).
// =============================================================================

/** Tasa de IVA general de importación. */
export const IVA_TASA = 0.16;
/** DTA general: 8 al millar del valor en aduana (art. 49 LFD). */
export const DTA_TASA_GENERAL = 0.008;

/** Entrada de cálculo de una partida. */
export interface EntradaPartida {
  /** Valor en aduana (base gravable) en MXN. Debe ser >= 0. */
  readonly valorAduana: number;
  /** Tasa de IGI en PORCENTAJE (p. ej. 15 = 15%). 0 = exenta. */
  readonly tasaIgiPct: number;
  /** Tasa de IEPS en PORCENTAJE (0 si no causa). */
  readonly tasaIepsPct?: number;
  /** DTA: si se da un importe fijo (cuota), se usa; si no, 8 al millar. */
  readonly dtaFijo?: number;
}

/** Contribuciones calculadas de una partida (MXN, 2 decimales). */
export interface ContribucionesPartida {
  readonly valorAduana: number;
  readonly igi: number;
  readonly dta: number;
  readonly ieps: number;
  readonly baseIva: number;
  readonly iva: number;
  readonly total: number;
}

/** Redondeo a centavos (2 decimales) estable. */
function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function noNegativo(n: number, nombre: string): number {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`${nombre} debe ser un número >= 0.`);
  }
  return n;
}

/**
 * Calcula las contribuciones de una partida. No aplica preferencias ni cuotas
 * compensatorias (el agente las ajusta); es el cálculo general y auditable.
 */
export function calcularContribucionesPartida(e: EntradaPartida): ContribucionesPartida {
  const valorAduana = noNegativo(e.valorAduana, "valorAduana");
  const igiPct = noNegativo(e.tasaIgiPct, "tasaIgiPct");
  const iepsPct = noNegativo(e.tasaIepsPct ?? 0, "tasaIepsPct");

  const igi = centavos(valorAduana * (igiPct / 100));
  const dta =
    e.dtaFijo !== undefined
      ? centavos(noNegativo(e.dtaFijo, "dtaFijo"))
      : centavos(valorAduana * DTA_TASA_GENERAL);
  const ieps = centavos((valorAduana + igi) * (iepsPct / 100));
  const baseIva = centavos(valorAduana + igi + dta + ieps);
  const iva = centavos(baseIva * IVA_TASA);
  const total = centavos(igi + dta + ieps + iva);

  return { valorAduana: centavos(valorAduana), igi, dta, ieps, baseIva, iva, total };
}

/** Totales del pedimento agregando varias partidas ya calculadas. */
export interface TotalesPedimento {
  readonly valorAduanaTotal: number;
  readonly igiTotal: number;
  readonly dtaTotal: number;
  readonly iepsTotal: number;
  readonly ivaTotal: number;
  readonly contribucionesTotal: number;
}

/** Suma las contribuciones de las partidas al nivel del pedimento. */
export function agregarPedimento(partidas: readonly ContribucionesPartida[]): TotalesPedimento {
  const acc = partidas.reduce(
    (a, p) => ({
      valorAduanaTotal: a.valorAduanaTotal + p.valorAduana,
      igiTotal: a.igiTotal + p.igi,
      dtaTotal: a.dtaTotal + p.dta,
      iepsTotal: a.iepsTotal + p.ieps,
      ivaTotal: a.ivaTotal + p.iva,
    }),
    { valorAduanaTotal: 0, igiTotal: 0, dtaTotal: 0, iepsTotal: 0, ivaTotal: 0 },
  );
  const contribucionesTotal = acc.igiTotal + acc.dtaTotal + acc.iepsTotal + acc.ivaTotal;
  return {
    valorAduanaTotal: centavos(acc.valorAduanaTotal),
    igiTotal: centavos(acc.igiTotal),
    dtaTotal: centavos(acc.dtaTotal),
    iepsTotal: centavos(acc.iepsTotal),
    ivaTotal: centavos(acc.ivaTotal),
    contribucionesTotal: centavos(contribucionesTotal),
  };
}
