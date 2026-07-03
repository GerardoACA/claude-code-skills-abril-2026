// CERBERUS COMERCIO EXTERIOR — extracción de datos KYC desde documentos. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/extraer-kyc-doc.ts  (Incremento 28)
// Propósito: Leer el texto de un documento del cliente (PDF ya convertido a
//            texto) y EXTRAER los datos que sirven para PRELLENAR el cuestionario
//            KYC 1.4.14: RFC, razón social, régimen, actividad económica y
//            domicilio. Reconoce la CONSTANCIA DE SITUACIÓN FISCAL (CSF, el
//            documento más rico para KYC) y, de forma más limitada, la OPINIÓN
//            de cumplimiento.
//
// Es EXTRACCIÓN heurística por etiquetas/patrones (no una caja negra): lo que
// no se detecta con confianza se deja vacío para que la persona lo capture. El
// prellenado NUNCA se auto-envía: el responsable revisa y corrige antes de sellar.
// =============================================================================

export type TipoDocumentoKyc =
  | "CONSTANCIA_SITUACION_FISCAL"
  | "OPINION_CUMPLIMIENTO"
  | "DESCONOCIDO";

export interface DatosExtraidosKyc {
  tipoDocumento: TipoDocumentoKyc;
  rfc: string | null;
  razonSocial: string | null;
  regimen: string | null;
  actividadEconomica: string | null;
  domicilio: string | null;
  /** Nombres legibles de los campos que se detectaron (para avisar al usuario). */
  camposDetectados: string[];
}

const RFC_RE = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}/;

/** Sufijos societarios mexicanos para detectar la razón social. */
const SUFIJOS =
  "(?:S\\.?\\s?A\\.?\\s?P\\.?\\s?I\\.?\\s?DE\\s?C\\.?\\s?V\\.?|S\\.?\\s?A\\.?\\s?B\\.?\\s?DE\\s?C\\.?\\s?V\\.?|S\\.?\\s?A\\.?\\s?DE\\s?C\\.?\\s?V\\.?|S\\.?\\s?DE\\s?R\\.?\\s?L\\.?(?:\\s?DE\\s?C\\.?\\s?V\\.?)?|S\\.?\\s?C\\.?|A\\.?\\s?C\\.?)";
const RAZON_SUFIJO_RE = new RegExp(`([A-ZÑ&0-9][A-ZÑ&0-9 .,'\\-]{3,90}?\\s${SUFIJOS})(?:\\b|$)`);

function normalizarEspacios(t: string): string {
  return t.replace(/[ \t]+/g, " ").replace(/\r/g, "");
}

/** Busca el valor de una etiqueta tipo "Etiqueta: valor" o "Etiqueta\n valor". */
function valorEtiqueta(texto: string, etiquetas: string[]): string | null {
  for (const et of etiquetas) {
    const re = new RegExp(`${et}\\s*:?\\s*([^\\n|]{2,120})`, "i");
    const m = texto.match(re);
    if (m && m[1]) {
      const v = m[1].trim().replace(/\s{2,}/g, " ");
      if (v.length >= 2) return v;
    }
  }
  return null;
}

function detectarTipo(norm: string): TipoDocumentoKyc {
  if (
    norm.includes("CONSTANCIA DE SITUACION FISCAL") ||
    norm.includes("CEDULA DE IDENTIFICACION FISCAL") ||
    norm.includes("IDCIF")
  ) {
    return "CONSTANCIA_SITUACION_FISCAL";
  }
  if (norm.includes("OPINION DEL CUMPLIMIENTO") || norm.includes("OPINION DE CUMPLIMIENTO")) {
    return "OPINION_CUMPLIMIENTO";
  }
  return "DESCONOCIDO";
}

function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Palabras de etiqueta que la extracción de PDF suele pegar al inicio del valor. */
const STOPWORDS_RAZON = new Set([
  "SENTIDO", "SOCIAL", "RAZON", "DENOMINACION", "NOMBRE", "FECHA", "FOLIO",
  "RFC", "PATRON", "ESTIMADO", "CLAVE", "VIGENCIA", "N", "O",
]);
const MES_RE = /^\d{1,2}\s+DE\s+[A-ZÑ]+\s+DE\s+\d{4}\s+/;

/** Limpia la razón social: quita fecha y palabras de etiqueta pegadas al inicio. */
function limpiarRazon(valor: string | null): string | null {
  if (valor === null) return null;
  let v = sinAcentos(valor).toUpperCase().replace(/\s{2,}/g, " ").trim();
  if (v.includes(":")) v = v.slice(v.lastIndexOf(":") + 1).trim();
  v = v.replace(MES_RE, "").trim();
  let palabras = v.split(" ");
  while (palabras.length > 1 && STOPWORDS_RAZON.has(palabras[0])) {
    palabras = palabras.slice(1);
  }
  v = palabras.join(" ").trim();
  if (v.length < 3 || RFC_RE.test(v) || /^\d+$/.test(v)) return null;
  return v;
}

/**
 * Extrae datos KYC del texto de un documento. `texto` es el contenido ya
 * convertido a texto (p. ej. por unpdf).
 */
export function extraerDatosKyc(texto: string): DatosExtraidosKyc {
  const limpio = normalizarEspacios(texto);
  const norm = sinAcentos(limpio).toUpperCase();
  const tipoDocumento = detectarTipo(norm);
  const campos: string[] = [];

  // RFC.
  const rfcM = norm.match(RFC_RE);
  const rfc = rfcM ? rfcM[0] : null;
  if (rfc) campos.push("RFC");

  // Razón social. Se prefiere el valor LIMPIO de la cadena original ("Nombre o
  // Razón Social:...") o de la CSF; si no, se detecta por sufijo societario.
  // En todos los casos se limpian prefijos de etiqueta/fecha que la extracción
  // de PDF suele pegar al valor.
  let razonSocial = limpiarRazon(
    valorEtiqueta(limpio, [
      "Nombre o Raz[oó]n Social",
      "Denominaci[oó]n\\/?\\s*Raz[oó]n Social",
    ]),
  );
  if (!razonSocial) {
    const m = limpio.toUpperCase().match(RAZON_SUFIJO_RE);
    razonSocial = limpiarRazon(m ? m[1] : null);
  }
  if (razonSocial) campos.push("Razón social");

  // Campos de la Constancia de Situación Fiscal.
  const regimen = valorEtiqueta(limpio, ["R[eé]gimen"]);
  if (regimen) campos.push("Régimen");

  const actividadEconomica = valorEtiqueta(limpio, [
    "Actividad Econ[oó]mica",
    "Actividades Econ[oó]micas",
    "Nombre de la actividad",
  ]);
  if (actividadEconomica) campos.push("Actividad económica");

  // Domicilio: ensamblar de partes de la CSF si aparecen; si no, etiqueta directa.
  const vial = valorEtiqueta(limpio, ["Nombre de (?:la )?Vialidad"]);
  const numExt = valorEtiqueta(limpio, ["N[uú]mero Exterior"]);
  const colonia = valorEtiqueta(limpio, ["Nombre de (?:la )?Colonia", "Colonia"]);
  const cp = valorEtiqueta(limpio, ["C[oó]digo Postal", "CP"]);
  const municipio = valorEtiqueta(limpio, ["Municipio o Delegaci[oó]n", "Municipio"]);
  const entidad = valorEtiqueta(limpio, ["Entidad Federativa", "Estado"]);
  const partes = [vial, numExt, colonia, cp, municipio, entidad].filter(
    (x): x is string => x !== null && x.length > 0,
  );
  let domicilio: string | null = partes.length >= 2 ? partes.join(", ") : null;
  if (!domicilio) domicilio = valorEtiqueta(limpio, ["Domicilio"]);
  if (domicilio) campos.push("Domicilio");

  return {
    tipoDocumento,
    rfc,
    razonSocial,
    regimen,
    actividadEconomica,
    domicilio,
    camposDetectados: campos,
  };
}
