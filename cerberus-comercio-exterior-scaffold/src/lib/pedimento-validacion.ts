// CERBERUS COMERCIO EXTERIOR — validaciones puras del número de pedimento. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/pedimento-validacion.ts  (Incremento 41)
// Propósito: Validaciones PURAS (sin I/O, testeables) del encabezado del
//            pedimento mexicano: el número de pedimento son 15 dígitos que
//            suelen escribirse con separadores "AA AAAA NNNNNNN" (año, aduana/
//            patente, consecutivo) — se tolera con o sin espacios/guiones y se
//            normaliza a solo dígitos. La clave de aduana (sección) son 3
//            dígitos numéricos.
//
// NOTA: el modelo Pedimento actual (prisma/schema.prisma) NO tiene campos
// `numero` ni `aduana`; estas validaciones quedan listas para cuando el schema
// los incorpore (y para captura/validación en cliente), sin migración alguna.
// =============================================================================

/**
 * Normaliza un número de pedimento quitando separadores tolerados
 * (espacios y guiones). Devuelve la cadena resultante; si el original
 * contenía caracteres no numéricos distintos de separadores, permanecen
 * (y `esNumeroPedimentoValido` los rechaza).
 */
export function normalizarNumeroPedimento(numero: string): string {
  return numero.replace(/[\s-]+/g, "");
}

/**
 * true si el número de pedimento, ya normalizado (sin espacios/guiones),
 * consiste EXACTAMENTE en 15 dígitos (formato mexicano).
 */
export function esNumeroPedimentoValido(numero: string): boolean {
  return /^\d{15}$/.test(normalizarNumeroPedimento(numero));
}

/**
 * true si la clave de aduana/sección son exactamente 3 dígitos (p. ej. "240"
 * Nuevo Laredo, "470" Veracruz). No admite espacios ni otros caracteres.
 */
export function esClaveAduanaValida(clave: string): boolean {
  return /^\d{3}$/.test(clave);
}
