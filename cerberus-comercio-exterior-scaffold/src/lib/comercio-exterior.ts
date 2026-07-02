// CERBERUS COMERCIO EXTERIOR — CFDI complemento Comercio Exterior 1.1. NO es SIDF.
//
// SUBSET PRAGMÁTICO del estándar Complemento de Comercio Exterior 1.1 del SAT,
// obligatorio en el CFDI de tipo INGRESO que ampara una EXPORTACIÓN DEFINITIVA
// (clave de pedimento A1) de mercancías. Este módulo modela y VALIDA los campos
// mínimos que el software debe revisar (tipo de operación, clave de pedimento,
// código postal del domicilio, país del receptor con catálogo c_Pais de 3
// letras, fracción arancelaria de 8 dígitos, valores en dólares y tipo de
// cambio) para producir un BORRADOR sellado e íntegro. El XSD completo del SAT
// (catálogos c_FraccionArancelaria, c_Pais, c_UnidadAduana, c_ClavePedimento…)
// se integra cuando se conecte el PAC real vía TimbradorPac (src/lib/timbrador-pac.ts):
// el PAC re-valida contra los catálogos vigentes al timbrar.
//
// Espeja el diseño de src/lib/carta-porte.ts (mismo patrón de validación +
// canonicalización probatoria). C9: se alerta con la lista de errores; un
// borrador con errores NO se persiste, pero nada bloquea la operación.

import { canonicalizar } from "./probatoria/hash-chain";

// ============================================================================
// Tipos del complemento (subset del estándar 1.1)
// ============================================================================

/** Domicilio del emisor (exportador nacional). */
export interface EmisorComercioExt {
  /** Calle / domicilio. */
  calle: string;
  /** Código postal (5 dígitos, catálogo c_CodigoPostal). */
  codigoPostal: string;
  /** Estado (catálogo c_Estado). */
  estado: string;
  /** País del emisor (ISO 3166 alfa-3; para exportación mexicana, "MEX"). */
  pais: string;
}

/** Domicilio y registro fiscal del receptor extranjero. */
export interface ReceptorComercioExt {
  /** Número de registro de identidad fiscal en el extranjero (tax id). */
  numRegIdTrib?: string;
  /** País del receptor (ISO 3166 alfa-3, catálogo c_Pais, p. ej. "USA"). */
  pais: string;
  /** Calle / domicilio en el extranjero (opcional). */
  calle?: string;
  /** Código postal en el extranjero (opcional; formato libre por país). */
  codigoPostal?: string;
}

/** Mercancía exportada (nivel aduana). */
export interface MercanciaComercioExt {
  /** Número de identificación / SKU del exportador. */
  noIdentificacion: string;
  /** Fracción arancelaria (8 dígitos, catálogo c_FraccionArancelaria). */
  fraccionArancelaria: string;
  /** Cantidad en la unidad de medida de la aduana (> 0). */
  cantidadAduana: number;
  /** Unidad de medida de la aduana (catálogo c_UnidadAduana). */
  unidadAduana: string;
  /** Valor unitario en aduana (>= 0). */
  valorUnitarioAduana: number;
  /** Valor total en dólares de la mercancía (> 0). */
  valorDolares: number;
}

/** Complemento Comercio Exterior 1.1 (subset pragmático). */
export interface ComercioExterior11 {
  /** Tipo de operación: "2" = exportación (único soportado en este flujo). */
  tipoOperacion: string;
  /** Clave de pedimento (p. ej. "A1" = exportación definitiva). */
  claveDePedimento: string;
  /** ¿Se acompaña certificado de origen? */
  certificadoOrigen: boolean;
  /** Tipo de cambio MXN por USD a la fecha del CFDI (> 0). */
  tipoCambioUsd: number;
  /** Total en dólares del comprobante (> 0). */
  totalUsd: number;
  emisor: EmisorComercioExt;
  receptor: ReceptorComercioExt;
  mercancias: MercanciaComercioExt[];
}

/** Error de validación asociado a un campo del complemento. */
export interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

// ============================================================================
// Validaciones
// ============================================================================

/** CP mexicano: exactamente 5 dígitos. */
const CP_REGEX = /^\d{5}$/;
/** Fracción arancelaria: exactamente 8 dígitos. */
const FRACCION_REGEX = /^\d{8}$/;
/** Código de país ISO 3166 alfa-3 (catálogo c_Pais): 3 letras mayúsculas. */
const PAIS_REGEX = /^[A-Z]{3}$/;

function esNumeroPositivo(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}
function esNumeroNoNegativo(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

/**
 * Valida el complemento Comercio Exterior 1.1 (subset) y devuelve la lista
 * completa de errores (vacía si es válido). No lanza: el consumidor decide (C9).
 */
export function validarComercioExterior(ce: ComercioExterior11): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  // --- Tipo de operación: este flujo ampara EXPORTACIÓN ("2"). ---
  if (ce.tipoOperacion.trim() !== "2") {
    errores.push({
      campo: "tipoOperacion",
      mensaje:
        'El tipo de operación debe ser "2" (exportación) para el Complemento de Comercio Exterior 1.1.',
    });
  }

  // --- Clave de pedimento (A1 típica para exportación definitiva). ---
  if (ce.claveDePedimento.trim() === "") {
    errores.push({
      campo: "claveDePedimento",
      mensaje: "La clave de pedimento es obligatoria (p. ej. A1).",
    });
  }

  // --- Tipo de cambio y total en dólares. ---
  if (!esNumeroPositivo(ce.tipoCambioUsd)) {
    errores.push({
      campo: "tipoCambioUsd",
      mensaje: "El tipo de cambio (MXN por USD) debe ser mayor que cero.",
    });
  }
  if (!esNumeroPositivo(ce.totalUsd)) {
    errores.push({
      campo: "totalUsd",
      mensaje: "El total en dólares debe ser mayor que cero.",
    });
  }

  // --- Emisor (domicilio nacional). ---
  if (ce.emisor.calle.trim() === "") {
    errores.push({ campo: "emisor.calle", mensaje: "La calle del emisor es obligatoria." });
  }
  if (!CP_REGEX.test(ce.emisor.codigoPostal.trim())) {
    errores.push({
      campo: "emisor.codigoPostal",
      mensaje: "El código postal del emisor debe tener exactamente 5 dígitos.",
    });
  }
  if (ce.emisor.estado.trim() === "") {
    errores.push({ campo: "emisor.estado", mensaje: "El estado del emisor es obligatorio." });
  }
  if (!PAIS_REGEX.test(ce.emisor.pais.trim().toUpperCase())) {
    errores.push({
      campo: "emisor.pais",
      mensaje: "El país del emisor debe ser un código de 3 letras (catálogo c_Pais), p. ej. MEX.",
    });
  }

  // --- Receptor (extranjero). ---
  if (!PAIS_REGEX.test(ce.receptor.pais.trim().toUpperCase())) {
    errores.push({
      campo: "receptor.pais",
      mensaje: "El país del receptor debe ser un código de 3 letras (catálogo c_Pais), p. ej. USA.",
    });
  }
  // numRegIdTrib no es obligatorio en el subset, pero se advierte su ausencia
  // (el SAT lo exige para receptor extranjero en la mayoría de los casos).
  if (
    ce.receptor.numRegIdTrib !== undefined &&
    ce.receptor.numRegIdTrib.trim() !== "" &&
    ce.receptor.numRegIdTrib.trim().length < 3
  ) {
    errores.push({
      campo: "receptor.numRegIdTrib",
      mensaje: "El registro de identidad fiscal del receptor parece incompleto.",
    });
  }

  // --- Mercancías. ---
  if (ce.mercancias.length === 0) {
    errores.push({
      campo: "mercancias",
      mensaje: "El complemento requiere al menos una mercancía.",
    });
  }
  ce.mercancias.forEach((m, i) => {
    if (m.noIdentificacion.trim() === "") {
      errores.push({
        campo: `mercancias[${i}].noIdentificacion`,
        mensaje: "El número de identificación de la mercancía es obligatorio.",
      });
    }
    if (!FRACCION_REGEX.test(m.fraccionArancelaria.trim())) {
      errores.push({
        campo: `mercancias[${i}].fraccionArancelaria`,
        mensaje: "La fracción arancelaria debe tener exactamente 8 dígitos (catálogo SAT).",
      });
    }
    if (m.unidadAduana.trim() === "") {
      errores.push({
        campo: `mercancias[${i}].unidadAduana`,
        mensaje: "La unidad de aduana es obligatoria (catálogo c_UnidadAduana).",
      });
    }
    if (!esNumeroPositivo(m.cantidadAduana)) {
      errores.push({
        campo: `mercancias[${i}].cantidadAduana`,
        mensaje: "La cantidad en aduana debe ser mayor que cero.",
      });
    }
    if (!esNumeroNoNegativo(m.valorUnitarioAduana)) {
      errores.push({
        campo: `mercancias[${i}].valorUnitarioAduana`,
        mensaje: "El valor unitario en aduana no puede ser negativo.",
      });
    }
    if (!esNumeroPositivo(m.valorDolares)) {
      errores.push({
        campo: `mercancias[${i}].valorDolares`,
        mensaje: "El valor en dólares de la mercancía debe ser mayor que cero.",
      });
    }
  });

  return errores;
}

// ============================================================================
// Canonicalización (payload probatorio del ComprobanteCfdi)
// ============================================================================

/**
 * Objeto completo del comprobante de INGRESO con complemento Comercio Exterior
 * 1.1 que se canonicaliza y sella (payload + sha256 del ComprobanteCfdi).
 */
export interface ComprobanteComercioExt {
  /** Tipo de CFDI (para exportación de mercancías: "INGRESO"). */
  tipo: "INGRESO";
  /** Complemento incorporado (enum TipoComplemento del schema). */
  complemento: "COMERCIO_EXT_11";
  emisorRfc: string;
  receptorRfc: string;
  comercioExterior: ComercioExterior11;
}

/**
 * Serializa el comprobante completo como JSON canónico determinista (claves
 * ordenadas, vía `canonicalizar`). Es el `payload` del ComprobanteCfdi y la
 * entrada del `sha256` que lo sella como borrador probatorio.
 */
export function canonicalizarComercioExt(
  comprobante: ComprobanteComercioExt,
): string {
  return canonicalizar(comprobante);
}
