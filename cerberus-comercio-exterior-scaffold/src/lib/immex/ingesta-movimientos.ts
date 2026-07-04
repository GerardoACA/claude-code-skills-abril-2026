// CERBERUS COMERCIO EXTERIOR — ingesta masiva de movimientos IMMEX por CSV (parser puro). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/ingesta-movimientos.ts  (Incremento 61 — carril B)
// Propósito: Parsear y validar, SIN I/O (puro y testeable), los CSV de
//            movimientos del libro de cotejo IMMEX:
//              - ENTRADAS:  fraccion,descripcion,unidadMedida,cantidad,
//                           valorAduana,pedimentoNumero,clavePedimento,
//                           fechaLimiteRetorno,despachoConcluidoEn
//              - DESCARGOS: fraccion,cantidad,pedimentoNumero,clavePedimento,
//                           despachoConcluidoEn
//            Gemelo de src/lib/ingesta-partidas.ts: encabezado tolerante a
//            mayúsculas/espacios, separador ',' o ';' (se detecta en el
//            encabezado), límite duro de 500 filas, cada fila mala se acumula
//            en `errores` con su número de línea y NO aborta las demás
//            (decisión C9: alertar, no bloquear). Fechas: ISO 8601 o
//            dd/mm/aaaa (se normalizan a ISO). El pedimento se normaliza con
//            @/lib/pedimento-validacion si queda en 15 dígitos; si no, se
//            acepta tal cual con una ADVERTENCIA (la fila NO se descarta).
// =============================================================================

import type { DescargoImmexInput, EntradaImmexInput } from "@/lib/immex/tipos";
import { esFraccionValida } from "@/lib/clasificador-arancel";
import {
  esNumeroPedimentoValido,
  normalizarNumeroPedimento,
} from "@/lib/pedimento-validacion";

/** Máximo de filas de datos aceptadas en una sola ingesta (igual que partidas). */
export const MAX_FILAS_INGESTA_IMMEX = 500;

/** Encabezado canónico del CSV de ENTRADAS (para mensajes de error/ayuda). */
export const ENCABEZADO_ENTRADAS =
  "fraccion,descripcion,unidadMedida,cantidad,valorAduana,pedimentoNumero," +
  "clavePedimento,fechaLimiteRetorno,despachoConcluidoEn";

/** Encabezado canónico del CSV de DESCARGOS (para mensajes de error/ayuda). */
export const ENCABEZADO_DESCARGOS =
  "fraccion,cantidad,pedimentoNumero,clavePedimento,despachoConcluidoEn";

/** Columnas esperadas (normalizadas: minúsculas, sin espacios) por tipo. */
const COLUMNAS_ENTRADAS = [
  "fraccion",
  "descripcion",
  "unidadmedida",
  "cantidad",
  "valoraduana",
  "pedimentonumero",
  "clavepedimento",
  "fechalimiteretorno",
  "despachoconcluidoen",
] as const;

const COLUMNAS_DESCARGOS = [
  "fraccion",
  "cantidad",
  "pedimentonumero",
  "clavepedimento",
  "despachoconcluidoen",
] as const;

/** Resultado del parseo de entradas: filas buenas + errores/advertencias legibles. */
export interface ResultadoIngestaEntradas {
  filas: EntradaImmexInput[];
  errores: string[];
}

/** Resultado del parseo de descargos: filas buenas + errores/advertencias legibles. */
export interface ResultadoIngestaDescargos {
  filas: DescargoImmexInput[];
  errores: string[];
}

// -----------------------------------------------------------------------------
// Utilería compartida (idéntica en espíritu a ingesta-partidas.ts).
// -----------------------------------------------------------------------------

/** Normaliza una celda de encabezado: minúsculas y sin espacios. */
function normalizarCelda(celda: string): string {
  return celda.trim().toLowerCase().replace(/\s+/g, "");
}

/** Detecta el separador del CSV a partir del encabezado (';' o ','). */
function detectarSeparador(encabezado: string): ";" | "," {
  return encabezado.includes(";") ? ";" : ",";
}

/** Convierte una celda a número finito, o null si no es numérica. */
function aNumero(crudo: string): number | null {
  const texto = crudo.trim();
  if (texto.length === 0) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza una fecha capturada a ISO 8601. Acepta:
 *  - dd/mm/aaaa  → "aaaa-mm-dd" (se verifica que sea fecha real, p. ej. no 31/02)
 *  - ISO "aaaa-mm-dd" (con hora opcional "T…") → se devuelve tal cual si es válida
 * Devuelve null si el texto no es una fecha reconocible.
 */
export function normalizarFechaIso(crudo: string): string | null {
  const texto = crudo.trim();

  const ddmm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (ddmm) {
    const dia = Number(ddmm[1]);
    const mes = Number(ddmm[2]);
    const anio = Number(ddmm[3]);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    const esReal =
      fecha.getUTCFullYear() === anio &&
      fecha.getUTCMonth() === mes - 1 &&
      fecha.getUTCDate() === dia;
    return esReal ? `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}` : null;
  }

  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(texto)) {
    return null;
  }
  const fecha = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto);
  return Number.isNaN(fecha.getTime()) ? null : texto;
}

/** Líneas con contenido, conservando su número de línea original (1-based). */
function lineasConContenido(texto: string): Array<{ numero: number; linea: string }> {
  const lineas = texto.split(/\r\n|\r|\n/);
  const conContenido: Array<{ numero: number; linea: string }> = [];
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim().length > 0) {
      conContenido.push({ numero: i + 1, linea: lineas[i] });
    }
  }
  return conContenido;
}

/**
 * Valida encabezado + límite de filas. Devuelve las filas de datos con su
 * separador, o el error único que aborta el parseo (encabezado malo / vacío /
 * exceso de filas).
 */
function prepararDatos(
  texto: string,
  columnasEsperadas: readonly string[],
  encabezadoCanonico: string,
):
  | { ok: true; datos: Array<{ numero: number; linea: string }>; separador: ";" | "," }
  | { ok: false; error: string } {
  const conContenido = lineasConContenido(texto);
  if (conContenido.length === 0) {
    return { ok: false, error: "El CSV está vacío: no hay encabezado ni filas." };
  }

  const encabezado = conContenido[0];
  const separador = detectarSeparador(encabezado.linea);
  const columnas = encabezado.linea.split(separador).map(normalizarCelda);
  const encabezadoOk =
    columnas.length === columnasEsperadas.length &&
    columnasEsperadas.every((esperada, i) => columnas[i] === esperada);
  if (!encabezadoOk) {
    return {
      ok: false,
      error:
        `Línea ${encabezado.numero}: encabezado inválido o faltante. Se esperaba ` +
        `"${encabezadoCanonico}" (separador ',' o ';').`,
    };
  }

  const datos = conContenido.slice(1);
  if (datos.length > MAX_FILAS_INGESTA_IMMEX) {
    return {
      ok: false,
      error:
        `El CSV tiene ${datos.length} filas de datos; el máximo por ingesta es ` +
        `${MAX_FILAS_INGESTA_IMMEX}.`,
    };
  }
  return { ok: true, datos, separador };
}

/**
 * Normaliza el número de pedimento de una fila: si al quitar espacios/guiones
 * quedan 15 dígitos se usa la forma normalizada; si no, se acepta TAL CUAL y
 * se agrega una ADVERTENCIA (no descarta la fila; C9: alertar, no bloquear).
 */
function pedimentoDeFila(
  crudo: string,
  numeroLinea: number,
  advertencias: string[],
): string {
  const texto = crudo.trim();
  if (esNumeroPedimentoValido(texto)) {
    return normalizarNumeroPedimento(texto);
  }
  advertencias.push(
    `Línea ${numeroLinea} (advertencia): el pedimento "${texto}" no normaliza a ` +
      `15 dígitos; se acepta tal cual.`,
  );
  return texto;
}

// -----------------------------------------------------------------------------
// Parser de ENTRADAS (importación temporal, pedimento tipo IN).
// -----------------------------------------------------------------------------

/**
 * Parsea el CSV de ENTRADAS IMMEX. No lanza: todo problema se reporta en
 * `errores` con el número de línea (1-based); las advertencias de pedimento no
 * descartan la fila. Las líneas vacías se ignoran sin contar como error.
 */
export function parsearCsvEntradas(texto: string): ResultadoIngestaEntradas {
  const filas: EntradaImmexInput[] = [];
  const errores: string[] = [];

  const preparado = prepararDatos(texto, COLUMNAS_ENTRADAS, ENCABEZADO_ENTRADAS);
  if (!preparado.ok) {
    return { filas, errores: [preparado.error] };
  }

  for (const { numero, linea } of preparado.datos) {
    const celdas = linea.split(preparado.separador);
    if (celdas.length !== COLUMNAS_ENTRADAS.length) {
      errores.push(
        `Línea ${numero}: se esperaban ${COLUMNAS_ENTRADAS.length} columnas y llegaron ${celdas.length}.`,
      );
      continue;
    }

    const erroresFila: string[] = [];

    const fraccion = celdas[0].trim();
    if (!esFraccionValida(fraccion)) {
      erroresFila.push("fracción inválida (deben ser 8 dígitos TIGIE)");
    }

    const descripcion = celdas[1].trim();
    if (descripcion.length === 0) {
      erroresFila.push("descripción vacía");
    }

    const unidadMedida = celdas[2].trim();
    if (unidadMedida.length === 0) {
      erroresFila.push("unidadMedida vacía");
    }

    const cantidad = aNumero(celdas[3]);
    if (cantidad === null || cantidad <= 0) {
      erroresFila.push("cantidad debe ser numérica y > 0");
    }

    // valorAduana es opcional: celda vacía => undefined; si viene, debe ser > 0.
    const valorAduanaCrudo = celdas[4].trim();
    let valorAduana: number | undefined;
    if (valorAduanaCrudo.length > 0) {
      const n = aNumero(valorAduanaCrudo);
      if (n === null || n <= 0) {
        erroresFila.push("valorAduana debe ser numérico y > 0 (o vacío)");
      } else {
        valorAduana = n;
      }
    }

    const clavePedimento = celdas[6].trim();
    if (clavePedimento.length === 0) {
      erroresFila.push("clavePedimento vacía");
    }

    const fechaLimiteRetorno = normalizarFechaIso(celdas[7]);
    if (fechaLimiteRetorno === null) {
      erroresFila.push("fechaLimiteRetorno debe ser ISO (aaaa-mm-dd) o dd/mm/aaaa");
    }

    // despachoConcluidoEn es opcional: celda vacía => undefined.
    const despachoCrudo = celdas[8].trim();
    let despachoConcluidoEn: string | undefined;
    if (despachoCrudo.length > 0) {
      const iso = normalizarFechaIso(despachoCrudo);
      if (iso === null) {
        erroresFila.push("despachoConcluidoEn debe ser ISO (aaaa-mm-dd) o dd/mm/aaaa (o vacío)");
      } else {
        despachoConcluidoEn = iso;
      }
    }

    if (erroresFila.length > 0 || cantidad === null || fechaLimiteRetorno === null) {
      errores.push(`Línea ${numero}: ${erroresFila.join("; ")}.`);
      continue;
    }

    // La advertencia de pedimento NO descarta la fila (se anota al final).
    const pedimentoNumero = pedimentoDeFila(celdas[5], numero, errores);

    filas.push({
      fraccion,
      descripcion,
      unidadMedida,
      cantidad,
      ...(valorAduana !== undefined ? { valorAduana } : {}),
      pedimentoNumero,
      clavePedimento,
      fechaLimiteRetorno,
      ...(despachoConcluidoEn !== undefined ? { despachoConcluidoEn } : {}),
    });
  }

  return { filas, errores };
}

// -----------------------------------------------------------------------------
// Parser de DESCARGOS (retorno/exportación o cambio de régimen, tipo RT…).
// -----------------------------------------------------------------------------

/**
 * Parsea el CSV de DESCARGOS IMMEX. Mismo contrato que `parsearCsvEntradas`:
 * puro, no lanza, errores con número de línea, advertencias no descartan fila.
 */
export function parsearCsvDescargos(texto: string): ResultadoIngestaDescargos {
  const filas: DescargoImmexInput[] = [];
  const errores: string[] = [];

  const preparado = prepararDatos(texto, COLUMNAS_DESCARGOS, ENCABEZADO_DESCARGOS);
  if (!preparado.ok) {
    return { filas, errores: [preparado.error] };
  }

  for (const { numero, linea } of preparado.datos) {
    const celdas = linea.split(preparado.separador);
    if (celdas.length !== COLUMNAS_DESCARGOS.length) {
      errores.push(
        `Línea ${numero}: se esperaban ${COLUMNAS_DESCARGOS.length} columnas y llegaron ${celdas.length}.`,
      );
      continue;
    }

    const erroresFila: string[] = [];

    const fraccion = celdas[0].trim();
    if (!esFraccionValida(fraccion)) {
      erroresFila.push("fracción inválida (deben ser 8 dígitos TIGIE)");
    }

    const cantidad = aNumero(celdas[1]);
    if (cantidad === null || cantidad <= 0) {
      erroresFila.push("cantidad debe ser numérica y > 0");
    }

    const clavePedimento = celdas[3].trim();
    if (clavePedimento.length === 0) {
      erroresFila.push("clavePedimento vacía");
    }

    const despachoCrudo = celdas[4].trim();
    let despachoConcluidoEn: string | undefined;
    if (despachoCrudo.length > 0) {
      const iso = normalizarFechaIso(despachoCrudo);
      if (iso === null) {
        erroresFila.push("despachoConcluidoEn debe ser ISO (aaaa-mm-dd) o dd/mm/aaaa (o vacío)");
      } else {
        despachoConcluidoEn = iso;
      }
    }

    if (erroresFila.length > 0 || cantidad === null) {
      errores.push(`Línea ${numero}: ${erroresFila.join("; ")}.`);
      continue;
    }

    const pedimentoNumero = pedimentoDeFila(celdas[2], numero, errores);

    filas.push({
      fraccion,
      cantidad,
      pedimentoNumero,
      clavePedimento,
      ...(despachoConcluidoEn !== undefined ? { despachoConcluidoEn } : {}),
    });
  }

  return { filas, errores };
}
// =============================================================================
// FIN ingesta-movimientos.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
