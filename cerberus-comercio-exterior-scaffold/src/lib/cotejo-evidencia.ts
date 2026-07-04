// CERBERUS COMERCIO EXTERIOR — evidencia y detalle del cotejo en vivo (compartido). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/cotejo-evidencia.ts  (Incremento 57)
// Propósito: Lógica COMPARTIDA entre la ingesta de la opinión 32-D
//            (api/clientes/[id]/opinion) y el RE-COTEJO de una opinión ya
//            ingestada (api/clientes/[id]/opinion/[opinionId]/cotejar):
//              1) sellarEvidenciaCotejo: sha256 del body que respondió el SAT +
//                 copia inmutable en el almacén WORM (fail-safe: nunca lanza).
//              2) construirCotejoDetalle: arma el cotejoDetalle persistido con
//                 los bloques parseables " [url=…]" (que lee urlSatDeDetalle),
//                 " [evidencia HTTP … sha256=… worm=…]" y " [avisos: …]" con el
//                 resumen corto de las advertencias del QR/cotejo — así el
//                 detalle NUNCA queda mudo, ni siquiera en NO_DISPONIBLE.
//              3) resumenAdvertencias: aplana y recorta la lista de avisos.
//
// C9: los avisos alertan, nunca bloquean. Fail-safe: el WORM jamás tumba nada.
// =============================================================================

import { sha256 } from "@/lib/probatoria/hash";
import { obtenerAlmacen } from "@/lib/almacen-worm";
import type { EvidenciaCotejo } from "@/lib/verificador-opinion-sat";

/** Huella + copia WORM (si se logró) de la respuesta del SAT. */
export interface EvidenciaSellada {
  sha256: string;
  wormUrl: string | null;
}

/** Longitud máxima del resumen de avisos embebido en cotejoDetalle. */
const MAX_RESUMEN_AVISOS = 320;

/**
 * Sella la EVIDENCIA del cotejo en vivo (Inc 49B): sha256 del body respondido
 * por el SAT + copia inmutable en el almacén WORM (clave
 * cotejo/<tenant>/<sha256>.html) si hay Blob configurado. Fail-safe: nunca lanza.
 */
export async function sellarEvidenciaCotejo(
  tenantId: string,
  evidencia: EvidenciaCotejo,
): Promise<EvidenciaSellada> {
  const huella = sha256(evidencia.cuerpo);
  let wormUrl: string | null = null;
  try {
    const guardado = await obtenerAlmacen().guardar(
      `cotejo/${tenantId}/${huella}.html`,
      evidencia.cuerpo,
      "text/html; charset=utf-8",
    );
    if (guardado.ok && guardado.url) wormUrl = guardado.url;
  } catch {
    // El almacén WORM jamás debe tumbar la ingesta/el re-cotejo; el sha256 basta.
  }
  return { sha256: huella, wormUrl };
}

/**
 * Aplana la lista de advertencias en un resumen corto (una línea, recortado).
 * Devuelve null si no hay advertencias.
 */
export function resumenAdvertencias(
  advertencias: readonly string[],
  maxLen: number = MAX_RESUMEN_AVISOS,
): string | null {
  const utiles = advertencias.map((a) => a.trim()).filter((a) => a.length > 0);
  if (utiles.length === 0) return null;
  const unido = utiles.join(" | ").replace(/\s+/g, " ");
  return unido.length > maxLen ? `${unido.slice(0, Math.max(1, maxLen - 1))}…` : unido;
}

/** Entrada para armar el cotejoDetalle persistido. */
export interface EntradaCotejoDetalle {
  /** Detalle humano del veredicto (viene del verificador; nunca vacío). */
  detalle: string;
  /** URL del validador del SAT usada/disponible (se embebe como " [url=…]"). */
  urlSat: string | null;
  /** Respuesta cruda del SAT (si el cotejo en vivo respondió algo). */
  evidencia?: EvidenciaCotejo | null;
  /** Huella + WORM de esa respuesta (si se selló). */
  evidenciaSellada?: EvidenciaSellada | null;
  /** Advertencias del QR/cotejo: se resumen en " [avisos: …]" (diagnóstico visible). */
  advertencias?: readonly string[];
}

/**
 * Arma el cotejoDetalle que se persiste en OpinionCumplimientoIngestada.
 * SIEMPRE devuelve texto no vacío: aun en NO_DISPONIBLE queda el porqué
 * (detalle del verificador + resumen de avisos del QR).
 */
export function construirCotejoDetalle(entrada: EntradaCotejoDetalle): string {
  let detalle = entrada.detalle.trim().length > 0
    ? entrada.detalle.trim()
    : "Cotejo sin detalle reportado por el verificador.";
  if (entrada.urlSat !== null && entrada.urlSat.length > 0) {
    detalle += ` [url=${entrada.urlSat}]`;
  }
  if (entrada.evidenciaSellada && entrada.evidencia) {
    detalle +=
      ` [evidencia HTTP ${entrada.evidencia.httpStatus} sha256=${entrada.evidenciaSellada.sha256}` +
      (entrada.evidenciaSellada.wormUrl !== null
        ? ` worm=${entrada.evidenciaSellada.wormUrl}`
        : "") +
      `]`;
  }
  const resumen = resumenAdvertencias(entrada.advertencias ?? []);
  if (resumen !== null) {
    detalle += ` [avisos: ${resumen}]`;
  }
  return detalle;
}
