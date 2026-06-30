// CERBERUS COMERCIO EXTERIOR — capa probatoria / hash. NO es SIDF.
//
// Integridad interna inmediata: SHA-256 (hex, 64 chars) vía node:crypto.
// Corrige el "64-bit" del cliente (decisión C10 + hallazgos del panel).
// Prohibido inventar otro algoritmo (ver _BLUEPRINT.md "Hashing").

import { createHash } from "node:crypto";

/** Longitud esperada de un digest SHA-256 en hexadecimal. */
export const SHA256_HEX_LENGTH = 64;

/** Expresión que valida un digest SHA-256 en hex (minúsculas, 64 chars). */
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Calcula el SHA-256 de una entrada y lo devuelve en hexadecimal (64 chars).
 *
 * Acepta `string` (UTF-8) o datos binarios (`Buffer`/`Uint8Array`) para poder
 * sellar tanto payloads canónicos como documentos crudos.
 */
export function sha256(input: string | Buffer | Uint8Array): string {
  const data =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return createHash("sha256").update(data).digest("hex");
}

/** Indica si una cadena tiene la forma de un digest SHA-256 hex válido. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_REGEX.test(value);
}

/**
 * Verifica que el hash esperado corresponde al contenido dado.
 *
 * La comparación es a prueba de timing (longitud constante) para no filtrar
 * información por el tiempo de respuesta. Devuelve `false` si el hash esperado
 * no es un digest SHA-256 hex bien formado.
 */
export function verifyHash(
  input: string | Buffer | Uint8Array,
  expectedHash: string,
): boolean {
  if (!isSha256Hex(expectedHash)) return false;
  const actual = sha256(input);
  return timingSafeEqualHex(actual, expectedHash);
}

/** Comparación de dos digests hex en tiempo constante. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
