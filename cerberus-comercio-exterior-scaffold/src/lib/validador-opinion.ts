// CERBERUS COMERCIO EXTERIOR — validador de autenticidad de la opinión 32-D. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/validador-opinion.ts  (Incremento 22)
// Propósito: Analizar de forma AUTOMÁTICA la autenticidad de la OPINIÓN DE
//            CUMPLIMIENTO (art. 32-D CFF) que un cliente/proveedor ENTREGA
//            impresa/PDF (texto ingestado), para detectar documentos FALSOS
//            antes de darlos por buenos. El análisis es determinista y
//            explicable (no una caja negra): busca los marcadores propios del
//            documento del SAT, extrae RFC, folio/acuse, sentido y fecha, y
//            evalúa consistencia. Devuelve un veredicto motivado con la lista de
//            checks y los campos extraídos.
//
// LÍMITE HONESTO: el análisis textual es el PRIMER filtro contra falsificaciones
// (estructura, RFC, folio, coherencia). La CONFIRMACIÓN definitiva de que la
// opinión es real la da el COTEJO EN VIVO ante el SAT por folio/acuse (conector
// VerificadorOpinionSat, hoy NoOp). Este módulo NUNCA afirma "auténtica" con
// certeza absoluta a partir del texto: marca AUTENTICA solo cuando todos los
// indicios estructurales cuadran, y deja claro que el cotejo en vivo la ratifica.
//
// C9: SOSPECHOSA/NO_AUTENTICA es ALERTA para revisión humana, nunca un bloqueo.
// =============================================================================

import { sha256 } from "@/lib/probatoria/hash";

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
  readonly rfcDocumento: string | null;
  readonly folio: string | null;
  readonly sentido: SentidoOpinion;
  readonly fechaEmision: string | null;
  readonly checks: readonly CheckOpinion[];
  readonly resumen: string;
}

const RFC_RE = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}/g;

/** Marcadores textuales típicos de la opinión de cumplimiento del SAT. */
const MARCADORES_SAT = [
  "SERVICIO DE ADMINISTRACION TRIBUTARIA",
  "OPINION DEL CUMPLIMIENTO",
  "OPINION DE CUMPLIMIENTO",
  "32-D",
  "32 D",
  "CODIGO FISCAL DE LA FEDERACION",
];

/** Patrones de folio/acuse (la opinión trae un folio alfanumérico largo). */
const FOLIO_RES = [
  /FOLIO[:\s]*([A-Z0-9]{6,})/i,
  /ACUSE[:\s]*([A-Z0-9]{6,})/i,
  /N[UÚ]MERO DE OPERACI[OÓ]N[:\s]*([A-Z0-9]{6,})/i,
];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function detectarSentido(norm: string): SentidoOpinion {
  // El orden importa: "SIN OBLIGACIONES" y "NO INSCRITO" antes que POSITIVA/NEGATIVA.
  if (norm.includes("SIN OBLIGACIONES")) return "SIN_OBLIGACIONES";
  if (norm.includes("NO INSCRITO") || norm.includes("NO REGISTRADO")) return "NO_INSCRITO";
  if (norm.includes("POSITIVO") || norm.includes("POSITIVA")) return "POSITIVA";
  if (norm.includes("NEGATIVO") || norm.includes("NEGATIVA")) return "NEGATIVA";
  return "INDETERMINADO";
}

function extraerFolio(texto: string): string | null {
  for (const re of FOLIO_RES) {
    const m = texto.match(re);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return null;
}

function extraerFecha(norm: string): string | null {
  // dd/mm/aaaa o aaaa-mm-dd (heurístico).
  const m1 = norm.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) {
    const iso = `${m1[3]}-${m1[2]}-${m1[1]}T00:00:00.000Z`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  const m2 = norm.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    const iso = `${m2[1]}-${m2[2]}-${m2[3]}T00:00:00.000Z`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  return null;
}

/**
 * Analiza la autenticidad de la opinión 32-D a partir de su texto ingestado.
 *
 * @param texto - Texto íntegro de la opinión (copiado/OCR del PDF impreso).
 * @param rfcCliente - RFC del cliente con el que se coteja el del documento.
 */
export function analizarOpinion(texto: string, rfcCliente: string): AnalisisOpinion {
  const huella = sha256(texto);
  const limpio = texto.trim();

  if (limpio.length < 40) {
    return {
      resultado: "NO_VERIFICABLE",
      sha256: huella,
      rfcDocumento: null,
      folio: null,
      sentido: "INDETERMINADO",
      fechaEmision: null,
      checks: [
        {
          check: "texto_minimo",
          ok: false,
          detalle:
            "El texto ingestado es demasiado corto para analizarse. Pega el " +
            "contenido completo de la opinión de cumplimiento.",
        },
      ],
      resumen: "No verificable: texto insuficiente.",
    };
  }

  const norm = normalizar(limpio);
  const checks: CheckOpinion[] = [];

  // 1) Marcadores del SAT (¿tiene la forma de una opinión oficial?).
  const marcadoresEncontrados = MARCADORES_SAT.filter((m) => norm.includes(m));
  const tieneMarcadores = marcadoresEncontrados.length >= 2;
  checks.push({
    check: "marcadores_sat",
    ok: tieneMarcadores,
    detalle: tieneMarcadores
      ? `Contiene marcadores del documento del SAT (${marcadoresEncontrados.length}).`
      : "No contiene los marcadores típicos de la opinión de cumplimiento del SAT.",
  });

  // 2) Folio / acuse (indispensable para el cotejo en vivo).
  const folio = extraerFolio(limpio);
  checks.push({
    check: "folio_acuse",
    ok: folio !== null,
    detalle: folio !== null
      ? `Folio/acuse detectado: ${folio}.`
      : "No se detectó folio/acuse; sin él no es cotejable ante el SAT.",
  });

  // 3) RFC del documento vs RFC del cliente.
  const rfcs = norm.match(RFC_RE) ?? [];
  const rfcClienteNorm = normalizar(rfcCliente.trim());
  const rfcDoc = rfcs.find((r) => r === rfcClienteNorm) ?? rfcs[0] ?? null;
  const rfcCoincide = rfcDoc !== null && rfcDoc === rfcClienteNorm;
  checks.push({
    check: "rfc_coincide",
    ok: rfcCoincide,
    detalle: rfcDoc === null
      ? "No se detectó ningún RFC en el documento."
      : rfcCoincide
        ? `El RFC del documento (${rfcDoc}) coincide con el del cliente.`
        : `El RFC del documento (${rfcDoc}) NO coincide con el del cliente (${rfcCliente}).`,
  });

  // 4) Sentido y fecha (consistencia).
  const sentido = detectarSentido(norm);
  const fechaEmision = extraerFecha(norm);
  checks.push({
    check: "sentido_detectado",
    ok: sentido !== "INDETERMINADO",
    detalle: sentido !== "INDETERMINADO"
      ? `Sentido detectado: ${sentido}.`
      : "No se pudo determinar el sentido (positivo/negativo/sin obligaciones).",
  });

  // 5) Veredicto.
  //   - Sin marcadores del SAT O RFC no coincide (habiéndose detectado) => NO_AUTENTICA.
  //   - Marcadores + RFC coincide + folio + sentido            => AUTENTICA (a ratificar en vivo).
  //   - Resto (falta folio, sentido indeterminado, etc.)       => SOSPECHOSA.
  let resultado: ResultadoValidacionOpinion;
  let resumen: string;
  if (!tieneMarcadores || (rfcDoc !== null && !rfcCoincide)) {
    resultado = "NO_AUTENTICA";
    resumen = !tieneMarcadores
      ? "No auténtica: no tiene la estructura del documento oficial del SAT."
      : "No auténtica: el RFC del documento no corresponde al cliente.";
  } else if (rfcCoincide && folio !== null && sentido !== "INDETERMINADO") {
    resultado = "AUTENTICA";
    resumen =
      "Auténtica (indicios estructurales completos). Ratificar con el cotejo en " +
      "vivo ante el SAT por folio.";
  } else {
    resultado = "SOSPECHOSA";
    resumen =
      "Sospechosa: faltan elementos (folio, sentido o RFC claro). Requiere " +
      "revisión humana y cotejo en vivo.";
  }

  return {
    resultado,
    sha256: huella,
    rfcDocumento: rfcDoc,
    folio,
    sentido,
    fechaEmision,
    checks,
    resumen,
  };
}
