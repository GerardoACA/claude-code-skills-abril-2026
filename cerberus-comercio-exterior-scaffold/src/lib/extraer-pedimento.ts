// CERBERUS COMERCIO EXTERIOR — extracción del encabezado del pedimento desde su PDF. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/extraer-pedimento.ts  (Incremento 51)
// Propósito: Leer el TEXTO PLANO del pedimento impreso (formato Anexo 22, ya
//            convertido a texto por unpdf, que APLANA el PDF y puede no tener
//            saltos de línea) y EXTRAER los datos del encabezado para
//            PRELLENAR la captura: número de pedimento (15 dígitos, se
//            normaliza y valida con pedimento-validacion), clave de pedimento
//            (CVE. PEDIM.), tipo de cambio, aduana E/S, RFC del importador,
//            régimen y los importes del cuadro de liquidación (IGI/DTA/IVA/PRV).
//
// Es EXTRACCIÓN heurística por etiquetas acotadas (patrón de
// src/lib/extraer-kyc-doc.ts): lo que no se detecta con confianza queda
// undefined y la persona lo captura; lo dudoso se reporta en `advertencias`.
// PURA (sin I/O), defensiva y NUNCA lanza (C9: sugerir, nunca imponer).
// =============================================================================

import {
  esClaveAduanaValida,
  esNumeroPedimentoValido,
  normalizarNumeroPedimento,
} from "./pedimento-validacion";

/** Importes del cuadro de liquidación del pedimento (MXN). */
export interface ContribucionesExtraidas {
  igi?: number;
  dta?: number;
  iva?: number;
  prv?: number;
}

/** Datos detectados en el texto del pedimento. Todo opcional: lo no detectado
 *  con confianza se omite para que el capturista lo teclee. */
export interface DatosPedimentoExtraidos {
  /** Número de pedimento NORMALIZADO a 15 dígitos (sin espacios/guiones). */
  numeroPedimento?: string;
  /** Clave de pedimento (1-2 alfanuméricos, p. ej. A1, IN). */
  clavePedimento?: string;
  /** Tipo de cambio (MXN/USD) del encabezado. */
  tipoCambio?: number;
  /** Clave de aduana/sección (3 dígitos, p. ej. 470). */
  aduana?: string;
  /** RFC del importador (12-13 caracteres). */
  rfcImportador?: string;
  /** Clave de régimen aduanero (IMD, EXD, ITR, DFI, …). */
  regimen?: string;
  /** Importes del cuadro de liquidación que se detectaron. */
  contribuciones?: ContribucionesExtraidas;
  /** Avisos para el usuario (datos descartados, texto sin etiquetas, …). */
  advertencias: string[];
}

/** Claves de régimen del Anexo 22 (apéndice 16) reconocidas. */
const REGIMENES_CONOCIDOS = new Set([
  "IMD", "EXD", "ITR", "ITE", "ETR", "ETE", "DFI", "RFE", "TRA", "DEP", "ELB",
]);

/** Quita acentos para casar etiquetas (RÉGIMEN → REGIMEN) sin tocar dígitos. */
function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Colapsa espacios/tabulaciones: unpdf aplana el PDF y el texto llega corrido. */
function normalizarEspacios(t: string): string {
  return t.replace(/[ \t]+/g, " ").replace(/\r/g, "");
}

/** "12,345.67" → 12345.67; undefined si no es un importe válido (>= 0). */
function parseImporte(token: string): number | undefined {
  const n = Number(token.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Etiqueta del número de pedimento: "NUM. PEDIMENTO:", "NUMERO DE PEDIMENTO", …
const ETIQUETA_NUM_PEDIMENTO = "(?:NUM(?:ERO)?\\.?|NO\\.?)\\s*(?:DE\\s*)?PEDIMENTO\\s*:?\\s*";

/**
 * Número de pedimento tras su etiqueta. Primero el patrón ESTRICTO del formato
 * impreso "AA AA NNNN NNNNNNN" (separadores opcionales); si no, una corrida
 * laxa de dígitos que se valida (15 dígitos) o se descarta con advertencia.
 */
function extraerNumeroPedimento(norm: string, advertencias: string[]): string | undefined {
  const estricto = norm.match(
    new RegExp(`${ETIQUETA_NUM_PEDIMENTO}(\\d{2}[\\s-]?\\d{2}[\\s-]?\\d{4}[\\s-]?\\d{7})(?!\\d)`),
  );
  if (estricto && estricto[1]) {
    const numero = normalizarNumeroPedimento(estricto[1]);
    if (esNumeroPedimentoValido(numero)) return numero;
  }
  const laxo = norm.match(new RegExp(`${ETIQUETA_NUM_PEDIMENTO}(\\d[\\d\\s-]*\\d)`));
  if (laxo && laxo[1]) {
    const numero = normalizarNumeroPedimento(laxo[1]);
    if (esNumeroPedimentoValido(numero)) return numero;
    advertencias.push(
      `Se detectó un número de pedimento de ${numero.length} dígitos ("${laxo[1].trim()}") y se descartó: deben ser exactamente 15.`,
    );
  }
  return undefined;
}

/** Clave de pedimento (1-2 alfanuméricos) tras "CVE. PEDIM." / "CVE PEDIMENTO". */
function extraerClavePedimento(norm: string): string | undefined {
  const m = norm.match(/CVE\.?\s*PEDIM(?:ENTO)?\.?\s*:?\s*([A-Z0-9]{1,2})(?![A-Z0-9])/);
  return m && m[1] ? m[1] : undefined;
}

/** Tipo de cambio (MXN/USD) tras "TIPO CAMBIO" / "TIPO DE CAMBIO". */
function extraerTipoCambio(norm: string, advertencias: string[]): number | undefined {
  const m = norm.match(/TIPO\s*(?:DE\s*)?CAMBIO\s*:?\s*\$?\s*(\d+(?:[.,]\d+)?)/);
  if (!m || !m[1]) return undefined;
  const valor = Number(m[1].replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) {
    advertencias.push(`Se detectó un tipo de cambio no válido ("${m[1]}") y se descartó.`);
    return undefined;
  }
  return valor;
}

/** Clave de aduana (3 dígitos) tras "ADUANA" / "ADUANA E/S". */
function extraerAduana(norm: string): string | undefined {
  const m = norm.match(/ADUANA(?:\s*E\s*\/?\s*S)?\.?\s*:?\s*(\d{3})(?!\d)/);
  if (m && m[1] && esClaveAduanaValida(m[1])) return m[1];
  return undefined;
}

/** RFC (12-13 caracteres, moral o física) tras la etiqueta "RFC". */
function extraerRfcImportador(norm: string): string | undefined {
  const m = norm.match(/\bRFC\b[.:\s]*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3})(?![A-Z0-9])/);
  return m && m[1] ? m[1] : undefined;
}

/** Clave de régimen (IMD/EXD/ITR/DFI…) tras "REGIMEN", solo si es conocida. */
function extraerRegimen(norm: string): string | undefined {
  const m = norm.match(/\bREGIMEN\s*:?\s*([A-Z]{3})(?![A-Z])/);
  if (m && m[1] && REGIMENES_CONOCIDOS.has(m[1])) return m[1];
  return undefined;
}

/**
 * Importe de un concepto del cuadro de liquidación ("IGI 0 12,345": tras el
 * concepto puede venir la FORMA DE PAGO de 1-2 dígitos y luego el importe;
 * se toma el ÚLTIMO número de la pareja). Se busca a partir de "LIQUIDACION"
 * si esa sección existe, para no confundir con columnas de las partidas.
 */
function extraerImporteConcepto(norm: string, concepto: string): number | undefined {
  const zona = norm.includes("LIQUIDACION")
    ? norm.slice(norm.indexOf("LIQUIDACION"))
    : norm;
  const m = zona.match(
    new RegExp(`\\b${concepto}\\b[\\s:$]*((?:\\d[\\d,]*(?:\\.\\d{1,2})?\\s*){1,2})`),
  );
  if (!m || !m[1]) return undefined;
  const tokens = m[1].trim().split(/\s+/);
  const token = tokens[tokens.length - 1];
  return token === undefined ? undefined : parseImporte(token);
}

/**
 * Extrae los datos del encabezado del pedimento del texto plano (unpdf).
 * Defensivo: con basura o texto vacío devuelve todo undefined + advertencias;
 * NUNCA lanza.
 */
export function extraerDatosPedimento(texto: string): DatosPedimentoExtraidos {
  const advertencias: string[] = [];
  const datos: DatosPedimentoExtraidos = { advertencias };
  try {
    if (typeof texto !== "string" || texto.trim().length === 0) {
      advertencias.push("El texto del pedimento está vacío: no hay nada que extraer.");
      return datos;
    }
    const norm = sinAcentos(normalizarEspacios(texto)).toUpperCase();

    const numeroPedimento = extraerNumeroPedimento(norm, advertencias);
    if (numeroPedimento !== undefined) datos.numeroPedimento = numeroPedimento;

    const clavePedimento = extraerClavePedimento(norm);
    if (clavePedimento !== undefined) datos.clavePedimento = clavePedimento;

    const tipoCambio = extraerTipoCambio(norm, advertencias);
    if (tipoCambio !== undefined) datos.tipoCambio = tipoCambio;

    const aduana = extraerAduana(norm);
    if (aduana !== undefined) datos.aduana = aduana;

    const rfcImportador = extraerRfcImportador(norm);
    if (rfcImportador !== undefined) datos.rfcImportador = rfcImportador;

    const regimen = extraerRegimen(norm);
    if (regimen !== undefined) datos.regimen = regimen;

    const contribuciones: ContribucionesExtraidas = {};
    const igi = extraerImporteConcepto(norm, "IGI");
    if (igi !== undefined) contribuciones.igi = igi;
    const dta = extraerImporteConcepto(norm, "DTA");
    if (dta !== undefined) contribuciones.dta = dta;
    const iva = extraerImporteConcepto(norm, "IVA");
    if (iva !== undefined) contribuciones.iva = iva;
    const prv = extraerImporteConcepto(norm, "PRV");
    if (prv !== undefined) contribuciones.prv = prv;
    if (Object.keys(contribuciones).length > 0) datos.contribuciones = contribuciones;

    const nadaDetectado =
      datos.numeroPedimento === undefined &&
      datos.clavePedimento === undefined &&
      datos.tipoCambio === undefined &&
      datos.aduana === undefined &&
      datos.rfcImportador === undefined &&
      datos.regimen === undefined &&
      datos.contribuciones === undefined;
    if (nadaDetectado && advertencias.length === 0) {
      advertencias.push(
        "No se detectaron etiquetas de pedimento en el documento (¿es realmente el pedimento impreso?). Captura los datos a mano.",
      );
    }
    return datos;
  } catch {
    // Fail-safe absoluto: la extracción jamás rompe el flujo de captura.
    return {
      advertencias: ["No se pudo analizar el texto del pedimento; captura los datos a mano."],
    };
  }
}
