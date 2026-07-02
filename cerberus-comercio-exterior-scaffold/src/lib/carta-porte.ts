// CERBERUS COMERCIO EXTERIOR — CFDI complemento Carta Porte 3.1. NO es SIDF.
//
// SUBSET PRAGMÁTICO del estándar Carta Porte 3.1 del SAT (obligatorio desde el
// 17-jul-2024; multas de hasta ~$97,330 MXN por documento — reporte §1). Este
// módulo modela los campos mínimos que el software debe validar según el
// reporte de fiscalización (claves prod/serv, códigos postales, placas) para
// producir un BORRADOR sellado e íntegro. El XSD completo del SAT (catálogos
// c_CodigoPostal, c_ClaveProdServSAT, c_ClaveUnidad, c_ConfigAutotransporte,
// etc.) se integrará cuando se conecte el PAC real del cliente vía
// `TimbradorPac` (src/lib/timbrador-pac.ts): el PAC re-valida contra los
// catálogos vigentes al timbrar.

import { canonicalizar } from "./probatoria/hash-chain";

// ============================================================================
// Tipos del complemento (subset del blueprint Inc 13)
// ============================================================================

/** Ubicación de origen del traslado. */
export interface OrigenCartaPorte {
  /** Código postal de origen (5 dígitos, catálogo SAT). */
  codigoPostal: string;
  /** Fecha/hora de salida (ISO 8601). */
  fechaSalida: string;
}

/** Ubicación de destino del traslado. */
export interface DestinoCartaPorte {
  /** Código postal de destino (5 dígitos, catálogo SAT). */
  codigoPostal: string;
  /** Fecha/hora estimada de llegada (ISO 8601). Debe ser > fechaSalida. */
  fechaLlegada: string;
  /** Distancia recorrida en kilómetros. */
  distanciaKm: number;
}

/** Datos del autotransporte federal. */
export interface AutotransporteCartaPorte {
  /** Placa del vehículo motor (formato oficial: alfanumérico 5-7, sin guiones/espacios). */
  placaVm: string;
  /** Configuración vehicular (catálogo c_ConfigAutotransporte, p. ej. "C2"). */
  configVehicular: string;
  aseguradora?: string;
  polizaSeguro?: string;
  /** Código Alfanumérico Armonizado del Transportista (comercio exterior). */
  caat?: string;
}

/** Figura de transporte (operador del vehículo). */
export interface FiguraTransporteCartaPorte {
  /** RFC del operador (12-13 caracteres, formato SAT). */
  rfcOperador: string;
  nombreOperador: string;
  licencia?: string;
}

/** Mercancía trasladada. */
export interface MercanciaCartaPorte {
  /** Clave de producto/servicio (8 dígitos, catálogo c_ClaveProdServSAT). */
  claveProdServ: string;
  descripcion: string;
  /** Cantidad trasladada (> 0). */
  cantidad: number;
  /** Clave de unidad (catálogo c_ClaveUnidad, p. ej. "KGM"). */
  claveUnidad: string;
  /** Peso en kilogramos (> 0). */
  pesoKg: number;
}

/** Complemento Carta Porte 3.1 (subset pragmático del estándar SAT). */
export interface CartaPorte31 {
  origen: OrigenCartaPorte;
  destino: DestinoCartaPorte;
  autotransporte: AutotransporteCartaPorte;
  figuraTransporte: FiguraTransporteCartaPorte;
  mercancias: MercanciaCartaPorte[];
}

/** Error de validación asociado a un campo del complemento. */
export interface ErrorValidacion {
  /** Ruta legible del campo, p. ej. "mercancias[0].claveProdServ". */
  campo: string;
  mensaje: string;
}

// ============================================================================
// Validaciones (reporte §1: CP, placas, claves prod/serv; C9: alertar con
// lista de errores — el borrador con errores NO se guarda, integridad del
// documento, pero nada bloquea la operación en sí)
// ============================================================================

/** CP mexicano: exactamente 5 dígitos. */
const CP_REGEX = /^\d{5}$/;

/** Clave de producto/servicio SAT: exactamente 8 dígitos. */
const CLAVE_PROD_SERV_REGEX = /^\d{8}$/;

/** Placa normalizada: alfanumérico de 5 a 7 caracteres (formato oficial). */
const PLACA_REGEX = /^[A-Z0-9]{5,7}$/;

/** RFC (persona moral 12 / persona física 13): formato SAT. */
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * Normaliza una placa vehicular al formato de comparación oficial:
 * mayúsculas, sin guiones, espacios ni otros separadores.
 */
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[\s\-–—.·]/g, "");
}

/** ¿El RFC cumple el formato SAT (12-13 caracteres)? */
export function esRfcValido(rfc: string): boolean {
  const limpio = rfc.trim().toUpperCase();
  return (
    (limpio.length === 12 || limpio.length === 13) && RFC_REGEX.test(limpio)
  );
}

function esFechaValida(iso: string): boolean {
  return iso.trim() !== "" && !Number.isNaN(Date.parse(iso));
}

/**
 * Valida el complemento Carta Porte 3.1 (subset) y devuelve la lista completa
 * de errores encontrados (vacía si el complemento es válido). No lanza: el
 * consumidor decide (C9 — la ruta responde 400 con la lista; el borrador con
 * errores no se persiste).
 */
export function validarCartaPorte(cp: CartaPorte31): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  // --- Códigos postales (5 dígitos) ---
  if (!CP_REGEX.test(cp.origen.codigoPostal.trim())) {
    errores.push({
      campo: "origen.codigoPostal",
      mensaje: "El código postal de origen debe tener exactamente 5 dígitos.",
    });
  }
  if (!CP_REGEX.test(cp.destino.codigoPostal.trim())) {
    errores.push({
      campo: "destino.codigoPostal",
      mensaje: "El código postal de destino debe tener exactamente 5 dígitos.",
    });
  }

  // --- Fechas coherentes (llegada > salida) ---
  const salidaValida = esFechaValida(cp.origen.fechaSalida);
  const llegadaValida = esFechaValida(cp.destino.fechaLlegada);
  if (!salidaValida) {
    errores.push({
      campo: "origen.fechaSalida",
      mensaje: "La fecha de salida no es una fecha válida (ISO 8601).",
    });
  }
  if (!llegadaValida) {
    errores.push({
      campo: "destino.fechaLlegada",
      mensaje: "La fecha de llegada no es una fecha válida (ISO 8601).",
    });
  }
  if (
    salidaValida &&
    llegadaValida &&
    Date.parse(cp.destino.fechaLlegada) <= Date.parse(cp.origen.fechaSalida)
  ) {
    errores.push({
      campo: "destino.fechaLlegada",
      mensaje: "La fecha de llegada debe ser posterior a la fecha de salida.",
    });
  }

  // --- Distancia ---
  if (!(Number.isFinite(cp.destino.distanciaKm) && cp.destino.distanciaKm > 0)) {
    errores.push({
      campo: "destino.distanciaKm",
      mensaje: "La distancia recorrida (km) debe ser mayor que cero.",
    });
  }

  // --- Placa (formato oficial: alfanumérico 5-7 tras normalizar) ---
  const placa = normalizarPlaca(cp.autotransporte.placaVm);
  if (!PLACA_REGEX.test(placa)) {
    errores.push({
      campo: "autotransporte.placaVm",
      mensaje:
        "La placa debe ser alfanumérica de 5 a 7 caracteres (sin guiones ni espacios), formato oficial.",
    });
  }
  if (cp.autotransporte.configVehicular.trim() === "") {
    errores.push({
      campo: "autotransporte.configVehicular",
      mensaje: "La configuración vehicular es obligatoria (catálogo SAT).",
    });
  }

  // --- Figura de transporte (RFC formato 12-13) ---
  if (!esRfcValido(cp.figuraTransporte.rfcOperador)) {
    errores.push({
      campo: "figuraTransporte.rfcOperador",
      mensaje:
        "El RFC del operador no cumple el formato SAT (12-13 caracteres).",
    });
  }
  if (cp.figuraTransporte.nombreOperador.trim() === "") {
    errores.push({
      campo: "figuraTransporte.nombreOperador",
      mensaje: "El nombre del operador es obligatorio.",
    });
  }

  // --- Mercancías ---
  if (cp.mercancias.length === 0) {
    errores.push({
      campo: "mercancias",
      mensaje: "El complemento requiere al menos una mercancía.",
    });
  }
  cp.mercancias.forEach((m, i) => {
    if (!CLAVE_PROD_SERV_REGEX.test(m.claveProdServ.trim())) {
      errores.push({
        campo: `mercancias[${i}].claveProdServ`,
        mensaje:
          "La clave de producto/servicio debe tener exactamente 8 dígitos (catálogo SAT).",
      });
    }
    if (m.claveUnidad.trim() === "") {
      errores.push({
        campo: `mercancias[${i}].claveUnidad`,
        mensaje: "La clave de unidad es obligatoria (catálogo SAT).",
      });
    }
    if (!(Number.isFinite(m.cantidad) && m.cantidad > 0)) {
      errores.push({
        campo: `mercancias[${i}].cantidad`,
        mensaje: "La cantidad debe ser mayor que cero.",
      });
    }
    if (!(Number.isFinite(m.pesoKg) && m.pesoKg > 0)) {
      errores.push({
        campo: `mercancias[${i}].pesoKg`,
        mensaje: "El peso (kg) debe ser mayor que cero.",
      });
    }
  });

  return errores;
}

// ============================================================================
// Canonicalización (payload probatorio del ComprobanteCfdi)
// ============================================================================

/**
 * Objeto completo del comprobante que se canonicaliza y sella (payload +
 * sha256 del modelo ComprobanteCfdi). Incluye los datos fiscales del
 * comprobante y el complemento capturado.
 */
export interface ComprobanteCartaPorte {
  /** Tipo de CFDI ("TRASLADO" | "INGRESO", enum TipoComprobante del schema). */
  tipo: "TRASLADO" | "INGRESO";
  /** Complemento incorporado (enum TipoComplemento del schema). */
  complemento: "CARTA_PORTE_31";
  emisorRfc: string;
  receptorRfc: string;
  cartaPorte: CartaPorte31;
}

/**
 * Serializa el comprobante completo (datos fiscales + complemento) como JSON
 * canónico determinista (claves ordenadas, vía `canonicalizar` de la capa
 * probatoria). Este string es el `payload` del ComprobanteCfdi y la entrada
 * del `sha256` que lo sella como borrador probatorio.
 */
export function canonicalizarCartaPorte(
  comprobante: ComprobanteCartaPorte,
): string {
  return canonicalizar(comprobante);
}
