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
  // unpdf aplana el PDF: se colapsan espacios y se unifican saltos a " ␤ ".
  return t.replace(/[ \t]+/g, " ").replace(/\r/g, "");
}

// Alternación de las ETIQUETAS de la Constancia de Situación Fiscal / opinión.
// Se usa como frontera derecha para acotar el valor de cada campo cuando el PDF
// viene aplanado (el valor va de "Etiqueta:" hasta la SIGUIENTE etiqueta).
const SIG_ETIQUETA =
  "(?:RFC|Denominaci[oó]n\\/?\\s?Raz[oó]n Social|Nombre,? [Dd]enominaci[oó]n o [Rr]az[oó]n [Ss]ocial|" +
  "R[eé]gimen Capital|R[eé]gimen|Nombre Comercial|Fecha inicio de operaciones|Estatus en el padr[oó]n|" +
  "Fecha de [uú]ltimo cambio|C[oó]digo Postal|Tipo de Vialidad|Nombre de (?:la )?Vialidad|" +
  "N[uú]mero Exterior|N[uú]mero Interior|Nombre de la Colonia|Nombre de la Localidad|" +
  "Nombre del Municipio(?: o Demarcaci[oó]n Territorial)?|Nombre de la Entidad Federativa|" +
  "Entre Calle|Y Calle|Actividad(?:es)? Econ[oó]mica(?:s)?|Datos del domicilio|Reg[ií]menes|Obligaciones|" +
  "Orden|Porcentaje|Fecha Inicio|Fecha Fin|CURP|Opinion|Invocante|Tramite|Folio|Sentido)\\s*:?";

/**
 * Valor de "Etiqueta: valor", acotado hasta la SIGUIENTE etiqueta conocida, un
 * "|" (cadena original) o un salto de línea. Robusto ante el texto aplanado.
 */
function valorEtiqueta(texto: string, etiquetas: string[]): string | null {
  for (const et of etiquetas) {
    const re = new RegExp(`${et}\\s*:\\s*(.+?)\\s*(?=${SIG_ETIQUETA}|\\||\\n|$)`, "i");
    const m = texto.match(re);
    if (m && m[1]) {
      const v = m[1].trim().replace(/\s{2,}/g, " ");
      if (v.length >= 2 && v.length <= 90) return v;
    }
  }
  return null;
}

/** Régimen FISCAL (no el "Régimen Capital"): toma el de la sección "Regímenes". */
function extraerRegimen(texto: string): string | null {
  const m = texto.match(
    /R[eé]gimen (General de Ley Personas Morales|Simplificado de Confianza|de Incorporaci[oó]n Fiscal|de las? Personas F[ií]sicas con Actividades? Empresariales?(?: y Profesionales)?|de Actividades? Empresariales?(?: y Profesionales)?|de Arrendamiento|de Sueldos y Salarios[^\n|]*)/i,
  );
  return m ? m[0].trim().replace(/\s{2,}/g, " ") : null;
}

/** Actividad económica principal: la fila de la tabla "Actividades Económicas". */
function extraerActividad(texto: string): string | null {
  // Tras los encabezados de la tabla y el número de orden viene el nombre,
  // seguido del porcentaje (número). Capturar el nombre.
  const m = texto.match(
    /Actividad Econ[oó]mica\s+Porcentaje[\s\S]{0,40}?\b\d{1,2}\s+([A-Za-zÁÉÍÓÚÑñáéíóú][A-Za-zÁÉÍÓÚÑñáéíóú ,.()/-]{3,70}?)\s+\d{1,3}\b/i,
  );
  if (m && m[1]) return m[1].trim().replace(/\s{2,}/g, " ");
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

  // Campos de la Constancia de Situación Fiscal (tablas → extractores dedicados).
  const regimen = extraerRegimen(limpio);
  if (regimen) campos.push("Régimen");

  const actividadEconomica =
    extraerActividad(limpio) ??
    valorEtiqueta(limpio, ["Actividad(?:es)? Econ[oó]mica(?:s)?", "Nombre de la actividad"]);
  if (actividadEconomica) campos.push("Actividad económica");

  // Domicilio: ensamblar de las partes de la CSF (etiquetas exactas).
  const cp = valorEtiqueta(limpio, ["C[oó]digo Postal"]);
  const vial = valorEtiqueta(limpio, ["Nombre de (?:la )?Vialidad"]);
  const numExt = valorEtiqueta(limpio, ["N[uú]mero Exterior"]);
  const colonia = valorEtiqueta(limpio, ["Nombre de la Colonia"]);
  const municipio = valorEtiqueta(limpio, ["Nombre del Municipio(?: o Demarcaci[oó]n Territorial)?"]);
  const entidad = valorEtiqueta(limpio, ["Nombre de la Entidad Federativa"]);
  const calle = [vial, numExt].filter((x): x is string => !!x).join(" ");
  const partes = [calle || null, colonia, cp ? `CP ${cp}` : null, municipio, entidad].filter(
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
