// CERBERUS COMERCIO EXTERIOR — ingesta masiva de partidas por CSV (parser puro). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/ingesta-partidas.ts  (Incremento 39)
// Propósito: Parsear y validar, SIN I/O (puro y testeable), un CSV de partidas
//            con columnas fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct.
//            El encabezado es tolerante a mayúsculas/espacios y el separador
//            puede ser ',' o ';' (se detecta en el encabezado). Cada fila mala
//            se acumula en `errores` con su número de línea legible y NO aborta
//            las demás (decisión C9: alertar, no bloquear). Límite duro de
//            500 filas de datos por ingesta. La ruta API calcula después las
//            contribuciones con @/lib/contribuciones y persiste (RLS).
// =============================================================================

import { esFraccionValida } from "@/lib/clasificador-arancel";

/** Máximo de filas de datos aceptadas en una sola ingesta. */
export const MAX_FILAS_INGESTA = 500;

/** Fila de partida ya validada, lista para calcular contribuciones. */
export interface FilaPartidaCsv {
  fraccion: string;
  descripcion: string;
  valorAduana: number;
  tasaIgiPct: number;
  tasaIepsPct: number;
}

/** Resultado del parseo: filas buenas + errores legibles (con número de línea). */
export interface ResultadoIngesta {
  filas: FilaPartidaCsv[];
  errores: string[];
}

/** Columnas esperadas del encabezado, ya normalizadas (minúsculas, sin espacios). */
const COLUMNAS_ESPERADAS = [
  "fraccion",
  "descripcion",
  "valoraduana",
  "tasaigipct",
  "tasaiepspct",
] as const;

/** Encabezado canónico para mensajes de error/ayuda. */
export const ENCABEZADO_CANONICO = "fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct";

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
 * Parsea el texto de un CSV de partidas. No lanza: todo problema se reporta en
 * `errores` con el número de línea del texto original (1-based). Las líneas
 * vacías se ignoran sin contar como error.
 */
export function parsearCsvPartidas(texto: string): ResultadoIngesta {
  const filas: FilaPartidaCsv[] = [];
  const errores: string[] = [];

  // Líneas con contenido, conservando su número de línea original (1-based).
  const lineas = texto.split(/\r\n|\r|\n/);
  const conContenido: Array<{ numero: number; linea: string }> = [];
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim().length > 0) {
      conContenido.push({ numero: i + 1, linea: lineas[i] });
    }
  }

  if (conContenido.length === 0) {
    return { filas, errores: ["El CSV está vacío: no hay encabezado ni filas."] };
  }

  // 1) Encabezado obligatorio (tolerante a mayúsculas/espacios y a ';' o ',').
  const encabezado = conContenido[0];
  const separador = detectarSeparador(encabezado.linea);
  const columnas = encabezado.linea.split(separador).map(normalizarCelda);
  const encabezadoOk =
    columnas.length === COLUMNAS_ESPERADAS.length &&
    COLUMNAS_ESPERADAS.every((esperada, i) => columnas[i] === esperada);
  if (!encabezadoOk) {
    return {
      filas,
      errores: [
        `Línea ${encabezado.numero}: encabezado inválido o faltante. Se esperaba ` +
          `"${ENCABEZADO_CANONICO}" (separador ',' o ';').`,
      ],
    };
  }

  // 2) Límite duro de filas de datos.
  const datos = conContenido.slice(1);
  if (datos.length > MAX_FILAS_INGESTA) {
    return {
      filas,
      errores: [
        `El CSV tiene ${datos.length} filas de datos; el máximo por ingesta es ${MAX_FILAS_INGESTA}.`,
      ],
    };
  }

  // 3) Validación fila por fila: la mala se reporta y NO bloquea a las demás.
  for (const { numero, linea } of datos) {
    const celdas = linea.split(separador);
    if (celdas.length !== COLUMNAS_ESPERADAS.length) {
      errores.push(
        `Línea ${numero}: se esperaban ${COLUMNAS_ESPERADAS.length} columnas y llegaron ${celdas.length}.`,
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

    const valorAduana = aNumero(celdas[2]);
    if (valorAduana === null || valorAduana <= 0) {
      erroresFila.push("valorAduana debe ser numérico y > 0");
    }

    const tasaIgiPct = aNumero(celdas[3]);
    if (tasaIgiPct === null || tasaIgiPct < 0) {
      erroresFila.push("tasaIgiPct debe ser numérica y >= 0");
    }

    const tasaIepsPct = aNumero(celdas[4]);
    if (tasaIepsPct === null || tasaIepsPct < 0) {
      erroresFila.push("tasaIepsPct debe ser numérica y >= 0");
    }

    if (
      erroresFila.length > 0 ||
      valorAduana === null ||
      tasaIgiPct === null ||
      tasaIepsPct === null
    ) {
      errores.push(`Línea ${numero}: ${erroresFila.join("; ")}.`);
      continue;
    }

    filas.push({ fraccion, descripcion, valorAduana, tasaIgiPct, tasaIepsPct });
  }

  return { filas, errores };
}
