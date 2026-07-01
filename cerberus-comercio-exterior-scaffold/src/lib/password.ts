// CERBERUS COMERCIO EXTERIOR — hashing de contrasenas (scrypt/node:crypto). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/password.ts
// Proposito: Derivar y verificar hashes de contrasena SIN dependencias externas,
//            usando scrypt de node:crypto. El formato almacenado es
//            "salthex:hashhex" (ambos en hexadecimal). La verificacion es
//            timing-safe (crypto.timingSafeEqual) para evitar fugas por tiempo.
//
// Nota: scrypt es un KDF resistente a fuerza bruta por diseno (memory-hard).
//       No se guarda la contrasena en claro; solo el salt y el hash derivado.
// =============================================================================

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/// Longitud del salt en bytes (16 = 128 bits).
const SALT_BYTES = 16;
/// Longitud de la clave derivada en bytes (64 = 512 bits).
const KEY_LEN = 64;

/**
 * Deriva un hash de la contrasena en claro.
 * Devuelve una cadena en formato "salthex:hashhex" lista para almacenar en
 * `Usuario.passwordHash`.
 */
export function hashPassword(plain: string): string {
  const salt: Buffer = randomBytes(SALT_BYTES);
  const derived: Buffer = scryptSync(plain, salt, KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verifica una contrasena en claro contra un hash almacenado ("salthex:hashhex").
 * Comparacion timing-safe. Devuelve false ante cualquier formato invalido en vez
 * de lanzar, para no filtrar informacion por excepciones.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const sep: number = stored.indexOf(":");
  if (sep <= 0) return false;

  const saltHex: string = stored.slice(0, sep);
  const hashHex: string = stored.slice(sep + 1);
  if (saltHex.length === 0 || hashHex.length === 0) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived: Buffer = scryptSync(plain, salt, expected.length);
  if (derived.length !== expected.length) return false;

  return timingSafeEqual(derived, expected);
}

// =============================================================================
// FIN password.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
