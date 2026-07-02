// CERBERUS COMERCIO EXTERIOR — validador de autenticidad de la opinión de cumplimiento. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/validador-opinion.ts  (Incrementos 22/26)
// Propósito: Analizar de forma AUTOMÁTICA la autenticidad de la OPINIÓN DE
//            CUMPLIMIENTO que un cliente/proveedor ENTREGA (impresa/PDF/texto),
//            de DOS emisores:
//              - SAT   (art. 32-D CFF): opinión del cumplimiento de obligaciones
//                        fiscales.
//              - IMSS  (seguridad social): opinión del cumplimiento en materia de
//                        seguridad social (mismo 32-D CFF).
//            Ambos documentos traen CADENA ORIGINAL + SELLO DIGITAL (firma RSA
//            del emisor). El análisis: detecta el emisor, PARSEA la cadena
//            original (fuente autoritativa de RFC/folio/sentido/fecha), verifica
//            consistencia y detecta el sello. La verificación CRIPTOGRÁFICA del
//            sello (definitiva) la hace src/lib/sello-opinion.ts con el
//            certificado público del emisor.
//
// C9: SOSPECHOSA/NO_AUTENTICA es ALERTA para revisión humana, nunca un bloqueo.
// =============================================================================

import { sha256 } from "@/lib/probatoria/hash";
import type { EmisorOpinion } from "@/lib/sello-opinion";

/** Veredicto (espeja el enum Prisma ResultadoValidacionOpinion). */
export type ResultadoValidacionOpinion =
  | "AUTENTICA"
  | "SOSPECHOSA"
  | "NO_AUTENTICA"
  | "NO_VERIFICABLE";

/** Sentido (espeja el enum Prisma SentidoOpinion). */
export type SentidoOpinion =
  | "POSITIVA"
  | "NEGATIVA"
  | "SIN_OBLIGACIONES"
  | "NO_INSCRITO"
  | "INDETERMINADO";

export interface CheckOpinion {
  readonly check: string;
  readonly ok: boolean;
  readonly detalle: string;
}

export interface AnalisisOpinion {
  readonly resultado: ResultadoValidacionOpinion;
  readonly sha256: string;
  /** Emisor detectado (SAT / IMSS / DESCONOCIDO). */
  readonly emisor: EmisorOpinion;
  readonly rfcDocumento: string | null;
  readonly folio: string | null;
  readonly sentido: SentidoOpinion;
  readonly fechaEmision: string | null;
  /** URL de verificación detectada (la que codifica el QR del SAT), si existe. */
  readonly urlVerificacion: string | null;
  /** Cadena original EXACTA (para verificar el sello). */
  readonly cadenaOriginal: string | null;
  /** Sello digital en base64 (firma del emisor), si se detectó. */
  readonly selloBase64: string | null;
  readonly checks: readonly CheckOpinion[];
  readonly resumen: string;
}

const RFC_RE = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}/g;
const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;

/** Marcadores del SAT (opinión 32-D). */
const MARCADORES_SAT = [
  "SERVICIO DE ADMINISTRACION TRIBUTARIA",
  "OPINION DEL CUMPLIMIENTO",
  "OPINION DE CUMPLIMIENTO",
  "32-D",
  "32 D",
  "CODIGO FISCAL DE LA FEDERACION",
];

/** Marcadores del IMSS (opinión en materia de seguridad social). */
const MARCADORES_IMSS = [
  "INSTITUTO MEXICANO DEL SEGURO SOCIAL",
  "SEGURIDAD SOCIAL",
  "PORTALIMSSDIGITAL",
  "CARTA DE NO ADEUDO",
];

const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function contar(norm: string, marcadores: string[]): number {
  return marcadores.filter((m) => norm.includes(m)).length;
}

/** Detecta el emisor por marcadores (IMSS tiene prioridad: también cita 32-D). */
function detectarEmisor(norm: string): EmisorOpinion {
  if (contar(norm, MARCADORES_IMSS) >= 1) return "IMSS";
  if (contar(norm, MARCADORES_SAT) >= 2) return "SAT";
  return "DESCONOCIDO";
}

function mapSentido(valor: string | null | undefined): SentidoOpinion {
  const v = (valor ?? "").trim().toUpperCase();
  if (v === "P" || v.startsWith("POSITIV")) return "POSITIVA";
  if (v === "N" || v.startsWith("NEGATIV")) return "NEGATIVA";
  if (v.includes("SIN OBLIG")) return "SIN_OBLIGACIONES";
  if (v.includes("NO INSCRIT") || v.includes("NO REGISTRAD")) return "NO_INSCRITO";
  return "INDETERMINADO";
}

/** Extrae la cadena original EXACTA (entre "Cadena Original" y "Sello"). */
function extraerCadena(texto: string): string | null {
  const m = texto.match(/Cadena Original\s*:?\s*([\s\S]*?)\s*Sello/i);
  if (m && m[1]) {
    const c = m[1].trim();
    return c.startsWith("||") ? c : `||${c}`;
  }
  // Fallback: una línea que empiece con "||".
  const m2 = texto.match(/\|\|[^\n]*\|\|/);
  return m2 ? m2[0].trim() : null;
}

/** Extrae el sello digital: el bloque base64 más largo del documento. */
function extraerSello(texto: string): string | null {
  const compacto = texto.replace(/\s+/g, "");
  const matches = compacto.match(/[A-Za-z0-9+/]{200,}={0,2}/g);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}

function fechaDdMmYyyy(s: string): string | null {
  const m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function fechaEspanol(s: string): string | null {
  // "23 de julio de 2025" / "23 de julio 2025"
  const m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záé]+)\s+(?:de\s+)?(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  const dia = m[1].padStart(2, "0");
  const iso = `${m[3]}-${mes}-${dia}T00:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

interface Campos {
  rfc: string | null;
  folio: string | null;
  sentido: SentidoOpinion;
  fecha: string | null;
}

/** Parsea la cadena original del SAT: ||RFC|FOLIO|DD-MM-YYYY|SENTIDO||SERIE||. */
function parseCadenaSat(cadena: string): Campos {
  const m = cadena.match(
    /\|\|\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3})\s*\|\s*([A-Z0-9]{5,})\s*\|\s*(\d{2}-\d{2}-\d{4})\s*\|\s*([A-Za-z]+)\s*\|/i,
  );
  if (!m) return { rfc: null, folio: null, sentido: "INDETERMINADO", fecha: null };
  return {
    rfc: m[1].toUpperCase(),
    folio: m[2].toUpperCase(),
    sentido: mapSentido(m[4]),
    fecha: fechaDdMmYyyy(m[3]),
  };
}

/** Parsea la cadena original del IMSS (pares Clave:Valor separados por |). */
function parseCadenaImss(cadena: string): Campos {
  const val = (clave: string): string | null => {
    const m = cadena.match(new RegExp(`${clave}\\s*:\\s*([^|]*)`, "i"));
    return m && m[1].trim() !== "" ? m[1].trim() : null;
  };
  const rfc = val("RFC");
  return {
    rfc: rfc ? rfc.toUpperCase() : null,
    folio: val("Folio"),
    sentido: mapSentido(val("Opinion")),
    fecha: (() => {
      const f = val("Fecha") ?? val("FechaInicioVigencia");
      return f ? fechaEspanol(f) : null;
    })(),
  };
}

function extraerUrlVerificacion(texto: string): string | null {
  const urls = texto.match(URL_RE);
  if (!urls) return null;
  const limpias = urls.map((u) => u.replace(/[.,;]+$/, ""));
  return limpias.find((u) => /(^|\.)sat\.gob\.mx/i.test(u) || /(^|\.)imss\.gob\.mx/i.test(u)) ?? limpias[0];
}

/**
 * Analiza la autenticidad de la opinión (SAT o IMSS) a partir de su texto.
 * @param texto - Texto íntegro (pegado, extraído del PDF, u OCR).
 * @param rfcCliente - RFC del cliente con el que se coteja el del documento.
 */
export function analizarOpinion(texto: string, rfcCliente: string): AnalisisOpinion {
  const huella = sha256(texto);
  const limpio = texto.trim();
  if (limpio.length < 40) {
    return {
      resultado: "NO_VERIFICABLE",
      sha256: huella,
      emisor: "DESCONOCIDO",
      rfcDocumento: null,
      folio: null,
      sentido: "INDETERMINADO",
      fechaEmision: null,
      urlVerificacion: null,
      cadenaOriginal: null,
      selloBase64: null,
      checks: [{ check: "texto_minimo", ok: false, detalle: "Texto insuficiente para analizar." }],
      resumen: "No verificable: texto insuficiente.",
    };
  }

  const norm = normalizar(limpio);
  const emisor = detectarEmisor(norm);
  const cadenaOriginal = extraerCadena(limpio);
  const selloBase64 = extraerSello(limpio);
  const urlVerificacion = extraerUrlVerificacion(limpio);

  // Campos autoritativos desde la cadena original (si existe).
  let cad: Campos = { rfc: null, folio: null, sentido: "INDETERMINADO", fecha: null };
  if (cadenaOriginal) {
    cad = emisor === "IMSS" ? parseCadenaImss(cadenaOriginal) : parseCadenaSat(cadenaOriginal);
    // Si el parseo por emisor no dio RFC, intentar el otro formato.
    if (cad.rfc === null) {
      const alterno = emisor === "IMSS" ? parseCadenaSat(cadenaOriginal) : parseCadenaImss(cadenaOriginal);
      if (alterno.rfc !== null) cad = alterno;
    }
  }

  // Fallback de extracción por texto (cuando no hay cadena).
  const rfcsTexto = norm.match(RFC_RE) ?? [];
  const rfcClienteNorm = normalizar(rfcCliente.trim());
  const rfcTexto = rfcsTexto.find((r) => r === rfcClienteNorm) ?? rfcsTexto[0] ?? null;

  const rfcDoc = cad.rfc ?? rfcTexto;
  const folio = cad.folio ?? extraerFolioTexto(limpio);
  const sentido = cad.sentido !== "INDETERMINADO" ? cad.sentido : detectarSentidoTexto(norm);
  const fechaEmision = cad.fecha ?? null;

  const rfcCoincide = rfcDoc !== null && normalizar(rfcDoc) === rfcClienteNorm;

  const checks: CheckOpinion[] = [];
  checks.push({
    check: "emisor",
    ok: emisor !== "DESCONOCIDO",
    detalle: emisor !== "DESCONOCIDO" ? `Emisor detectado: ${emisor}.` : "No se reconoció el emisor (SAT/IMSS).",
  });
  checks.push({
    check: "cadena_original",
    ok: cadenaOriginal !== null,
    detalle: cadenaOriginal !== null
      ? "Contiene la Cadena Original (registro autoritativo del emisor)."
      : "No se detectó Cadena Original.",
  });
  checks.push({
    check: "sello_digital",
    ok: selloBase64 !== null,
    detalle: selloBase64 !== null
      ? "Contiene Sello Digital (firma del emisor; verificable con su certificado)."
      : "No se detectó Sello Digital.",
  });
  checks.push({
    check: "rfc_coincide",
    ok: rfcCoincide,
    detalle: rfcDoc === null
      ? "No se detectó RFC."
      : rfcCoincide
        ? `El RFC del documento (${rfcDoc}) coincide con el del cliente.`
        : `El RFC del documento (${rfcDoc}) NO coincide con el del cliente (${rfcCliente}).`,
  });
  checks.push({
    check: "folio_sentido",
    ok: folio !== null && sentido !== "INDETERMINADO",
    detalle: `Folio: ${folio ?? "—"} · Sentido: ${sentido}.`,
  });

  // Veredicto.
  let resultado: ResultadoValidacionOpinion;
  let resumen: string;
  if (cadenaOriginal !== null) {
    if (rfcDoc !== null && !rfcCoincide) {
      resultado = "SOSPECHOSA";
      resumen = "Cadena original presente, pero el RFC no corresponde al cliente (¿opinión de un tercero?). Revisión humana.";
    } else if (selloBase64 !== null) {
      resultado = "AUTENTICA";
      resumen = `Auténtica (estructura oficial ${emisor}: cadena original + sello). Ratificable con la verificación criptográfica del sello.`;
    } else {
      resultado = "SOSPECHOSA";
      resumen = "Cadena original presente pero sin sello digital legible. Revisión humana.";
    }
  } else {
    // Sin cadena: análisis por texto (compatibilidad con documentos sin cadena).
    if (emisor === "DESCONOCIDO" || (rfcDoc !== null && !rfcCoincide)) {
      resultado = "NO_AUTENTICA";
      resumen = emisor === "DESCONOCIDO"
        ? "No auténtica: sin estructura oficial reconocible (SAT/IMSS)."
        : "No auténtica: el RFC del documento no corresponde al cliente.";
    } else if (rfcCoincide && folio !== null && sentido !== "INDETERMINADO") {
      resultado = "AUTENTICA";
      resumen = `Auténtica por análisis de texto (emisor ${emisor}); sin cadena/sello para ratificación criptográfica.`;
    } else {
      resultado = "SOSPECHOSA";
      resumen = "Sospechosa: faltan elementos (folio, sentido o RFC claro). Revisión humana.";
    }
  }

  return {
    resultado, sha256: huella, emisor, rfcDocumento: rfcDoc, folio, sentido,
    fechaEmision, urlVerificacion, cadenaOriginal, selloBase64, checks, resumen,
  };
}

// -- Extracción por texto (fallback sin cadena) ------------------------------
const FOLIO_RES = [
  /FOLIO[:\s]*([A-Z0-9]{6,})/i,
  /ACUSE[:\s]*([A-Z0-9]{6,})/i,
  /N[UÚ]MERO DE OPERACI[OÓ]N[:\s]*([A-Z0-9]{6,})/i,
];
function extraerFolioTexto(texto: string): string | null {
  for (const re of FOLIO_RES) {
    const m = texto.match(re);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return null;
}
function detectarSentidoTexto(norm: string): SentidoOpinion {
  if (norm.includes("SIN OBLIGACIONES")) return "SIN_OBLIGACIONES";
  if (norm.includes("NO INSCRITO") || norm.includes("NO REGISTRADO")) return "NO_INSCRITO";
  if (norm.includes("POSITIVO") || norm.includes("POSITIVA")) return "POSITIVA";
  if (norm.includes("NEGATIVO") || norm.includes("NEGATIVA")) return "NEGATIVA";
  return "INDETERMINADO";
}
