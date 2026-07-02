// CERBERUS COMERCIO EXTERIOR — listados públicos del SAT (Incremento 10). NO es SIDF.
//
// Descarga y parseo de los listados de datos abiertos del SAT (CSV) para las
// fuentes ART_69, ART_69B, ART_69B_BIS y ART_49BIS. Los datos son PÚBLICOS y
// globales (las tablas ImportacionListadoSat / ListadoSatEntrada no llevan
// tenant_id).
//
// FORMATO ESPERADO de los CSV del SAT:
// - Codificación LATIN-1 / Windows-1252 (NO UTF-8): se decodifica con
//   Buffer.toString("latin1"). El sha256 del snapshot se calcula sobre el
//   buffer CRUDO (los bytes tal como se descargaron), no sobre el texto.
// - Suelen traer líneas de PREÁMBULO antes del encabezado real (títulos,
//   fechas de corte, avisos). El parser busca la primera línea que contenga
//   "RFC" y la trata como encabezado.
// - Columnas detectadas por encabezado normalizado (mayúsculas, sin acentos):
//   RFC (obligatoria), razón social (contiene "RAZON" o "NOMBRE") y
//   situación del contribuyente (contiene "SITUACI": Presunto, Definitivo,
//   Desvirtuado, Sentencia favorable, etc.).
// - Comillas dobles y comas embebidas básicas soportadas ("" = comilla
//   literal dentro de campo entrecomillado).
//
// LÍMITES DOCUMENTADOS:
// - Archivos grandes (el 69-B completo supera cientos de miles de filas): el
//   parser recorre el texto POR LÍNEAS con un cursor (indexOf), sin regex
//   global sobre todo el archivo ni estructuras intermedias pesadas.
// - NO se soportan saltos de línea DENTRO de campos entrecomillados (los
//   listados del SAT no los usan); una fila así se parte y sus fragmentos sin
//   RFC válido se descartan.
// - Filas sin RFC válido (12-13 caracteres alfanuméricos, incluidos Ñ y &) se
//   ignoran silenciosamente: cubre subtotales, notas al pie y preámbulos.
// - ART_69: conforme a la regla 1.4.14 RGCE reformada se EXCLUYE el supuesto
//   de la fracción VI del art. 69 CFF; usar como arranque los CSV de
//   "no localizados" y "créditos firmes" de omawww.sat.gob.mx/cifras_sat.
//   Al no existir una URL única estable, la fuente queda sin default (null).
// - ART_69B_BIS y ART_49BIS: sin URL pública estable conocida → url null si
//   el env correspondiente no está configurado (la verificación reporta
//   NO_DISPONIBLE con detalle "URL no configurada").

import { sha256 } from "@/lib/probatoria/hash";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Fuentes de verificación que se alimentan de listados públicos del SAT. */
export type FuenteListadoSat = "ART_69" | "ART_69B" | "ART_69B_BIS" | "ART_49BIS";

/**
 * Fuentes aceptadas por `parsearCsvListado` (Inc 12): las 4 de listados SAT
 * más SANCIONES_INT (listas internacionales OFAC/ONU/UE/UK por ingesta manual,
 * que identifican por NOMBRE y pueden no traer RFC).
 */
export type FuenteCsvListado = FuenteListadoSat | "SANCIONES_INT";

/** Configuración de una fuente de listado (URL efectiva + descripción). */
export interface FuenteListadoConfig {
  /** URL efectiva del CSV (override por env) o null si no hay URL conocida. */
  url: string | null;
  /** Descripción humana de la fuente y sus particularidades. */
  descripcion: string;
}

/** Entrada individual parseada de un CSV de listado del SAT. */
export interface EntradaParseada {
  /**
   * RFC normalizado (mayúsculas, sin espacios), 12-13 caracteres; null para
   * filas de SANCIONES_INT que solo traen nombre (Inc 12). Para las fuentes
   * SAT el parser sigue descartando toda fila sin RFC válido (nunca null).
   */
  rfc: string | null;
  /** Razón social / nombre del contribuyente, si la columna existe. */
  razonSocial?: string;
  /** Texto de la columna "situación" (Presunto/Definitivo/etc.), si existe. */
  situacion?: string;
}

/** Resultado de descargar un listado: texto decodificado + sello del crudo. */
export interface ListadoDescargado {
  /** Contenido del CSV decodificado desde LATIN-1. */
  texto: string;
  /** SHA-256 (hex, 64 chars) del buffer CRUDO descargado. */
  sha256: string;
}

// ---------------------------------------------------------------------------
// Fuentes configurables
// ---------------------------------------------------------------------------

/** Devuelve el valor del env recortado, o null si está ausente o vacío. */
function urlDesdeEnv(nombre: string): string | null {
  const valor = process.env[nombre];
  if (typeof valor !== "string") return null;
  const recortado = valor.trim();
  return recortado.length > 0 ? recortado : null;
}

/** Default público conocido del listado completo del art. 69-B CFF. */
const URL_DEFAULT_69B =
  "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv";

/**
 * Mapa fuente → configuración (URL con override por env + descripción).
 *
 * Overrides por variables de entorno:
 * - SAT_URL_69B     → ART_69B     (default: listado completo 69-B)
 * - SAT_URL_69      → ART_69      (sin default estable → null)
 * - SAT_URL_69B_BIS → ART_69B_BIS (sin default estable → null)
 * - SAT_URL_49BIS   → ART_49BIS   (sin default estable → null)
 *
 * Se evalúa al cargar el módulo (proceso servidor). Si una fuente tiene
 * url null, la sincronización la omite y la verificación la reporta como
 * NO_DISPONIBLE con detalle "URL no configurada".
 */
export const FUENTES_LISTADOS: Record<FuenteListadoSat, FuenteListadoConfig> = {
  ART_69B: {
    url: urlDesdeEnv("SAT_URL_69B") ?? URL_DEFAULT_69B,
    descripcion:
      "Art. 69-B CFF (EFOS/EDOS, operaciones inexistentes): listado completo " +
      "de datos abiertos del SAT. Incluye situaciones Presunto, Definitivo, " +
      "Desvirtuado y Sentencia favorable.",
  },
  ART_69: {
    url: urlDesdeEnv("SAT_URL_69"),
    descripcion:
      "Art. 69 CFF (no localizados y créditos firmes como arranque). Se " +
      "EXCLUYE el supuesto de la fracción VI conforme a la regla 1.4.14 " +
      "reformada. Sin URL única estable: configurar SAT_URL_69 apuntando al " +
      "CSV correspondiente de omawww.sat.gob.mx/cifras_sat.",
  },
  ART_69B_BIS: {
    url: urlDesdeEnv("SAT_URL_69B_BIS"),
    descripcion:
      "Art. 69-B Bis CFF (transmisión indebida de pérdidas fiscales). Sin " +
      "URL pública estable conocida: configurar SAT_URL_69B_BIS; mientras " +
      "tanto la fuente queda NO_DISPONIBLE (URL no configurada).",
  },
  ART_49BIS: {
    url: urlDesdeEnv("SAT_URL_49BIS"),
    descripcion:
      "Art. 49 Bis CFF (listado nuevo de la reforma 2026 que inhabilita " +
      "operaciones). Configurar SAT_URL_49BIS cuando el SAT publique la URL " +
      "definitiva; mientras tanto NO_DISPONIBLE (URL no configurada).",
  },
};

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

/**
 * Descarga un listado del SAT con fetch nativo.
 *
 * - Obtiene el cuerpo como ArrayBuffer y lo decodifica desde LATIN-1
 *   (Buffer.from(ab).toString("latin1")): los CSV del SAT NO vienen en UTF-8.
 * - El sha256 devuelto es el del buffer CRUDO (bytes descargados), para que
 *   el snapshot sellado sea reproducible contra el archivo original.
 *
 * Lanza Error si la respuesta HTTP no es 2xx.
 */
export async function descargarListado(url: string): Promise<ListadoDescargado> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(
      `Descarga de listado SAT falló (${respuesta.status} ${respuesta.statusText}): ${url}`,
    );
  }
  const ab = await respuesta.arrayBuffer();
  const buffer = Buffer.from(ab);
  return {
    texto: buffer.toString("latin1"),
    sha256: sha256(buffer),
  };
}

// ---------------------------------------------------------------------------
// Parser CSV ligero (sin dependencias)
// ---------------------------------------------------------------------------

/** RFC válido: 12 (moral) o 13 (física) caracteres alfanuméricos, con Ñ y &. */
const RFC_REGEX = /^[A-ZÑ&0-9]{12,13}$/;

/** Normaliza un encabezado: mayúsculas, sin acentos ni espacios sobrantes. */
function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Normaliza un NOMBRE/raz\u00f3n social para matching heur\u00edstico (Inc 12):
 * may\u00fasculas, sin acentos (\u00d1 \u2192 N por la descomposici\u00f3n NFD, consistente en
 * ambos lados de la comparaci\u00f3n), sin puntuaci\u00f3n (todo lo que no sea letra,
 * d\u00edgito o "&" se vuelve espacio) y espacios colapsados.
 *
 * El match por nombre es HEUR\u00cdSTICO: quien lo use debe producir ALERTA con
 * revisi\u00f3n humana, nunca una inhabilitaci\u00f3n autom\u00e1tica (C9).
 */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parte UNA línea CSV en campos, manejando comillas dobles y comas embebidas
 * básicas: `"a, b"` → `a, b`; `""` dentro de campo entrecomillado → `"`.
 * No soporta saltos de línea dentro de campos (ver límites arriba).
 */
function partirLineaCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea.charAt(i);
    if (enComillas) {
      if (ch === '"') {
        if (linea.charAt(i + 1) === '"') {
          actual += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        actual += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ",") {
      campos.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  campos.push(actual);
  return campos;
}

/**
 * Itera las líneas de un texto SIN crear un arreglo con todas ellas
 * (importante para archivos grandes): avanza un cursor con indexOf("\n")
 * y recorta el "\r" final de líneas CRLF.
 */
function* lineasDe(texto: string): Generator<string, void, undefined> {
  let inicio = 0;
  while (inicio <= texto.length) {
    let fin = texto.indexOf("\n", inicio);
    if (fin === -1) fin = texto.length;
    let linea = texto.slice(inicio, fin);
    if (linea.endsWith("\r")) linea = linea.slice(0, -1);
    yield linea;
    if (fin === texto.length) break;
    inicio = fin + 1;
  }
}

/** Índices de columnas detectados en el encabezado. */
interface IndicesColumnas {
  /** Índice de la columna RFC, o null si el listado no la trae (SANCIONES_INT). */
  rfc: number | null;
  razonSocial: number | null;
  situacion: number | null;
}

/**
 * Detecta los índices de columna a partir de los campos del encabezado.
 *
 * - RFC: encabezado que contenga "RFC". Obligatoria para las fuentes SAT
 *   (`exigirRfc` = true); opcional para SANCIONES_INT, cuyas listas
 *   (OFAC/ONU/UE/UK) identifican por nombre.
 * - Nombre/razón social: "RAZON" | "NOMBRE" | "NAME" | "ENTITY" (Inc 12: las
 *   listas internacionales usan NAME/ENTITY).
 * - Situación: "SITUACI" (o "PROGRAM"/"SANCTION" como equivalente en listas
 *   internacionales, si existe; se conserva como texto libre).
 *
 * Devuelve null si no se detecta ninguna columna utilizable (con `exigirRfc`,
 * si falta RFC; sin él, si faltan tanto RFC como nombre).
 */
function detectarColumnas(
  camposEncabezado: string[],
  exigirRfc: boolean,
): IndicesColumnas | null {
  let rfc: number | null = null;
  let razonSocial: number | null = null;
  let situacion: number | null = null;
  for (let i = 0; i < camposEncabezado.length; i++) {
    const nombre = normalizarEncabezado(camposEncabezado[i]);
    if (rfc === null && nombre.includes("RFC")) {
      rfc = i;
    } else if (
      razonSocial === null &&
      (nombre.includes("RAZON") ||
        nombre.includes("NOMBRE") ||
        nombre.includes("NAME") ||
        nombre.includes("ENTITY"))
    ) {
      razonSocial = i;
    } else if (
      situacion === null &&
      (nombre.includes("SITUACI") ||
        nombre.includes("PROGRAM") ||
        nombre.includes("SANCTION"))
    ) {
      situacion = i;
    }
  }
  if (exigirRfc && rfc === null) return null;
  if (rfc === null && razonSocial === null) return null;
  return { rfc, razonSocial, situacion };
}

/** Devuelve el campo recortado en el índice dado, o undefined si vacío/ausente. */
function campoOpcional(campos: string[], indice: number | null): string | undefined {
  if (indice === null || indice >= campos.length) return undefined;
  const valor = campos[indice].trim();
  return valor.length > 0 ? valor : undefined;
}

/**
 * Parsea un CSV de listado del SAT (ya decodificado desde LATIN-1).
 *
 * Estrategia (ver formato y límites en la cabecera del módulo):
 * 1. Recorre el texto por líneas (generador con cursor; sin regex global).
 * 2. Salta el preámbulo: el encabezado es la primera línea cuyo contenido
 *    normalizado contiene "RFC" Y de la que se pueden detectar columnas.
 * 3. Detecta índices de RFC / razón social (RAZON|NOMBRE) / situación
 *    (SITUACI) por encabezado normalizado (mayúsculas, sin acentos).
 * 4. Cada fila posterior se parte con el parser de comillas; se descartan
 *    las filas cuyo campo RFC no cumpla RFC_REGEX (12-13 alfanuméricos).
 *
 * EXTENSIÓN Inc 12 — fuente SANCIONES_INT (listas internacionales OFAC/ONU/
 * UE/UK por ingesta manual): esas listas identifican por NOMBRE, así que el
 * RFC es TOLERADO ausente: el encabezado puede no traer columna RFC (se
 * detecta el nombre también por NAME/ENTITY) y las filas con solo nombre se
 * aceptan con `rfc: null`. Para las fuentes SAT el comportamiento es idéntico
 * al del Incremento 10: toda fila sin RFC válido se descarta.
 */
export function parsearCsvListado(
  texto: string,
  fuente: FuenteCsvListado,
): EntradaParseada[] {
  const toleraRfcAusente = fuente === "SANCIONES_INT";
  const entradas: EntradaParseada[] = [];
  let columnas: IndicesColumnas | null = null;

  for (const linea of lineasDe(texto)) {
    if (linea.trim().length === 0) continue;

    if (columnas === null) {
      // Fase de preámbulo: buscar la línea de encabezado. Para fuentes SAT
      // debe contener "RFC"; para SANCIONES_INT basta con una columna de
      // nombre (NAME/ENTITY/NOMBRE/RAZON) o de RFC.
      const encabezado = normalizarEncabezado(linea);
      const pareceEncabezado = toleraRfcAusente
        ? encabezado.includes("RFC") ||
          encabezado.includes("NAME") ||
          encabezado.includes("ENTITY") ||
          encabezado.includes("NOMBRE") ||
          encabezado.includes("RAZON")
        : encabezado.includes("RFC");
      if (!pareceEncabezado) continue;
      columnas = detectarColumnas(partirLineaCsv(linea), !toleraRfcAusente);
      continue; // el encabezado mismo no es una fila de datos.
    }

    const campos = partirLineaCsv(linea);

    // RFC de la fila (si hay columna y el valor cumple el formato).
    let rfc: string | null = null;
    if (columnas.rfc !== null && columnas.rfc < campos.length) {
      const crudo = campos[columnas.rfc].trim().toUpperCase();
      if (RFC_REGEX.test(crudo)) rfc = crudo;
    }

    const razonSocial = campoOpcional(campos, columnas.razonSocial);

    if (rfc === null) {
      // Sin RFC válido: las fuentes SAT descartan la fila (subtotales, notas,
      // filas rotas); SANCIONES_INT la acepta si al menos trae nombre.
      if (!toleraRfcAusente || razonSocial === undefined) continue;
    }

    entradas.push({
      rfc,
      razonSocial,
      situacion: campoOpcional(campos, columnas.situacion),
    });
  }

  return entradas;
}
