// CERBERUS COMERCIO EXTERIOR — heurística PURA del veredicto de cotejo SAT. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/cotejo-sat.ts  (Incremento 49B)
// Propósito: Lógica PURA (sin red, sin BD) para dictaminar el resultado del
//            cotejo EN VIVO de una opinión 32-D contra la página del validador
//            del SAT: dado el BODY (HTML/texto) que respondió el SAT, el RFC del
//            documento y su folio, decide CONFIRMADA / DISCREPANCIA /
//            NO_DISPONIBLE con los valores REALES del enum Prisma
//            EstadoCotejoSat. También expone utilidades de normalización y el
//            parseo de la URL del validador embebida en cotejoDetalle
//            (formato parseable "url=https://…sat.gob.mx/…").
//
// C9: el veredicto ALERTA, nunca bloquea. Fail-safe: un body vacío o
// ininteligible NUNCA produce un falso CONFIRMADA — degrada a NO_DISPONIBLE.
// =============================================================================

/** Subconjunto del enum Prisma EstadoCotejoSat que puede dictar la heurística. */
export type VeredictoCotejo = "CONFIRMADA" | "DISCREPANCIA" | "NO_DISPONIBLE";

/** Marcadores de vigencia/sentido que muestra el validador del SAT. */
const MARCADORES_SENTIDO = [
  "POSITIVO",
  "POSITIVA",
  "NEGATIVO",
  "NEGATIVA",
  "SIN OBLIGACIONES",
  "NO INSCRITO",
  "NO REGISTRADO",
  "VIGENTE",
];

/** Quita acentos, aplana etiquetas HTML y espacios, y pasa a MAYÚSCULAS. */
export function aplanarBodySat(body: string): string {
  return body
    .replace(/<[^>]+>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

/**
 * Heurística del veredicto de cotejo en vivo (case-insensitive):
 *   - body vacío/ilegible → NO_DISPONIBLE (nunca un falso positivo).
 *   - el body muestra el RFC del documento o su folio → CONFIRMADA
 *     (los marcadores de sentido/vigencia refuerzan, no son requisito: la
 *     página del SAT no siempre repite la palabra exacta).
 *   - el body responde pero NO muestra ni el RFC ni el folio → DISCREPANCIA
 *     (posible documento falso o folio erróneo).
 */
export function veredictoCotejo(
  body: string,
  rfc: string,
  folio: string | null,
): VeredictoCotejo {
  const texto = aplanarBodySat(body);
  if (texto.length === 0) return "NO_DISPONIBLE";

  const rfcN = aplanarBodySat(rfc);
  const folioN = folio !== null ? aplanarBodySat(folio) : "";
  const hayRfc = rfcN.length > 0 && texto.includes(rfcN);
  const hayFolio = folioN.length > 0 && texto.includes(folioN);

  if (hayRfc || hayFolio) return "CONFIRMADA";
  return "DISCREPANCIA";
}

/** ¿El body trae algún marcador de vigencia/sentido del validador del SAT? */
export function hayMarcadorSentido(body: string): boolean {
  const texto = aplanarBodySat(body);
  return MARCADORES_SENTIDO.some((m) => texto.includes(m));
}

/**
 * Extrae la URL del validador del SAT embebida en un cotejoDetalle con el
 * formato parseable " [url=https://…]". Devuelve null si no hay o si el host
 * no pertenece a sat.gob.mx (defensa extra al render del enlace en la UI).
 */
export function urlSatDeDetalle(detalle: string | null | undefined): string | null {
  if (!detalle) return null;
  const m = /url=(https:\/\/[^\s\]]+)/.exec(detalle);
  if (!m || m[1] === undefined) return null;
  try {
    const u = new URL(m[1]);
    const host = u.hostname.toLowerCase();
    if (u.protocol === "https:" && (host === "sat.gob.mx" || host.endsWith(".sat.gob.mx"))) {
      return m[1];
    }
    return null;
  } catch {
    return null;
  }
}
