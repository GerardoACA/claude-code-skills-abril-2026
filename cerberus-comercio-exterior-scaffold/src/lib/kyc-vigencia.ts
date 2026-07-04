// CERBERUS COMERCIO EXTERIOR — ciclo trienal del expediente KYC 1.4.14. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/kyc-vigencia.ts  (Incremento 44)
// Propósito: Calcular la PRÓXIMA ACTUALIZACIÓN del expediente KYC 1.4.14 (ciclo
//            de re-actualización trienal, distinto del plazo de retención
//            `retieneHasta`). Función pura y testeable: la consumen el route de
//            sellado (/api/clientes/[id]/kyc) y el vigía de vencimientos.
// =============================================================================

/** Años del ciclo de re-actualización del cuestionario KYC 1.4.14. */
export const CICLO_ACTUALIZACION_ANIOS_KYC = 3;

/**
 * Próxima actualización del expediente KYC: fecha de sellado + 3 años.
 * Usa aritmética UTC; en fechas sin equivalente exacto (29 de febrero sellado
 * en bisiesto) JavaScript desborda al día siguiente (1 de marzo), que sigue
 * siendo una fecha válida dentro del año objetivo.
 */
export function proximaActualizacionKyc(sellado: Date): Date {
  const proxima = new Date(sellado);
  proxima.setUTCFullYear(proxima.getUTCFullYear() + CICLO_ACTUALIZACION_ANIOS_KYC);
  return proxima;
}
