// CERBERUS COMERCIO EXTERIOR — capa probatoria / hash-chain. NO es SIDF.
//
// Bitácora append-only encadenada: cada registro sella `hashPrev + payload
// canónico` produciendo un nuevo `selloRegistro`. Cualquier manipulación de un
// registro intermedio rompe la cadena hacia adelante y es detectable por un
// perito tercero sin acceso al sistema vivo (decisión C10 / §4 diseño v2).

import { sha256 } from "./hash";

/** Sello "génesis" usado como `hashPrev` del primer registro de una cadena. */
export const GENESIS_SELLO = "0".repeat(64);

/** Separador de dominio entre `hashPrev` y `payload` antes de hashear. */
const CHAIN_SEPARATOR = "\n";

/** Un eslabón de la cadena append-only. */
export interface RegistroEncadenado {
  /** Posición 0-based dentro de la cadena. */
  readonly indice: number;
  /** Sello del registro anterior (o `GENESIS_SELLO` si es el primero). */
  readonly hashPrev: string;
  /** SHA-256 del payload canónico de ESTE registro (sin encadenar). */
  readonly hashPayload: string;
  /** SHA-256 de `hashPrev + separador + hashPayload`: el sello encadenado. */
  readonly selloRegistro: string;
}

/**
 * Canonicaliza un valor JSON de forma determinista para que el mismo contenido
 * lógico produzca SIEMPRE la misma cadena (y por tanto el mismo hash),
 * independientemente del orden de inserción de las claves.
 *
 * - Las claves de objeto se ordenan lexicográficamente (recursivo).
 * - `undefined`, funciones y símbolos se omiten en objetos y se vuelven `null`
 *   dentro de arreglos (coherente con `JSON.stringify`).
 * - `NaN`/`Infinity` se serializan como `null` (igual que `JSON.stringify`).
 *
 * No es para cifrado: es para reproducibilidad determinista del payload.
 */
export function canonicalizar(value: unknown): string {
  return serializar(value);
}

function serializar(value: unknown): string {
  if (value === null) return "null";

  const tipo = typeof value;

  if (tipo === "number") {
    return Number.isFinite(value as number) ? String(value) : "null";
  }
  if (tipo === "boolean") return value ? "true" : "false";
  if (tipo === "bigint") return JSON.stringify((value as bigint).toString());
  if (tipo === "string") return JSON.stringify(value);
  // undefined / function / symbol en posición de valor raíz.
  if (tipo === "undefined" || tipo === "function" || tipo === "symbol") {
    return "null";
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => {
      const t = typeof v;
      if (v === undefined || t === "function" || t === "symbol") return "null";
      return serializar(v);
    });
    return `[${items.join(",")}]`;
  }

  // Objeto plano: ordenar claves, omitir valores no serializables.
  const obj = value as Record<string, unknown>;
  const claves = Object.keys(obj).sort();
  const partes: string[] = [];
  for (const k of claves) {
    const v = obj[k];
    const t = typeof v;
    if (v === undefined || t === "function" || t === "symbol") continue;
    partes.push(`${JSON.stringify(k)}:${serializar(v)}`);
  }
  return `{${partes.join(",")}}`;
}

/**
 * Calcula el sello encadenado a partir del sello previo y un payload ya
 * canonicalizado (string). Útil cuando el payload no es JSON (p. ej. el hash de
 * un documento binario).
 */
export function sellarPayloadCanonico(
  hashPrev: string,
  payloadCanonico: string,
): string {
  const hashPayload = sha256(payloadCanonico);
  return sha256(`${hashPrev}${CHAIN_SEPARATOR}${hashPayload}`);
}

/**
 * Crea el siguiente eslabón de la cadena dado el sello previo y un payload JSON.
 * El payload se canonicaliza de forma determinista antes de hashear.
 */
export function appendRegistro(
  hashPrev: string,
  payload: unknown,
  indice: number,
): RegistroEncadenado {
  const payloadCanonico = canonicalizar(payload);
  const hashPayload = sha256(payloadCanonico);
  const selloRegistro = sha256(
    `${hashPrev}${CHAIN_SEPARATOR}${hashPayload}`,
  );
  return { indice, hashPrev, hashPayload, selloRegistro };
}

/**
 * Construye una cadena completa a partir de una lista ordenada de payloads.
 * El primer registro encadena contra `GENESIS_SELLO`.
 */
export function construirCadena(payloads: readonly unknown[]): RegistroEncadenado[] {
  const cadena: RegistroEncadenado[] = [];
  let hashPrev = GENESIS_SELLO;
  payloads.forEach((payload, indice) => {
    const registro = appendRegistro(hashPrev, payload, indice);
    cadena.push(registro);
    hashPrev = registro.selloRegistro;
  });
  return cadena;
}

/** Resultado de verificar la integridad de una cadena. */
export interface ResultadoVerificacionCadena {
  /** `true` solo si TODOS los eslabones son consistentes. */
  readonly valida: boolean;
  /** Índice del primer eslabón roto, o `null` si la cadena es íntegra. */
  readonly indiceRoto: number | null;
  /** Motivo legible del primer fallo detectado. */
  readonly motivo: string | null;
}

/**
 * Verifica la integridad de una cadena ya materializada: cada `hashPrev` debe
 * apuntar al `selloRegistro` anterior, y cada `selloRegistro` debe recomputarse
 * a partir de `hashPrev + hashPayload`. Si se proveen los payloads originales,
 * también revalida que `hashPayload` corresponde al payload (detecta
 * manipulación del contenido aunque se haya recalculado el sello).
 */
export function verificarCadena(
  cadena: readonly RegistroEncadenado[],
  payloads?: readonly unknown[],
): ResultadoVerificacionCadena {
  let esperadoPrev = GENESIS_SELLO;
  for (let i = 0; i < cadena.length; i++) {
    const reg = cadena[i];

    if (reg.indice !== i) {
      return { valida: false, indiceRoto: i, motivo: `índice fuera de orden en ${i}` };
    }
    if (reg.hashPrev !== esperadoPrev) {
      return {
        valida: false,
        indiceRoto: i,
        motivo: `hashPrev no encadena con el registro anterior en ${i}`,
      };
    }

    if (payloads) {
      const hashPayloadReal = sha256(canonicalizar(payloads[i]));
      if (hashPayloadReal !== reg.hashPayload) {
        return {
          valida: false,
          indiceRoto: i,
          motivo: `payload manipulado: hashPayload no corresponde en ${i}`,
        };
      }
    }

    const selloEsperado = sha256(
      `${reg.hashPrev}${CHAIN_SEPARATOR}${reg.hashPayload}`,
    );
    if (selloEsperado !== reg.selloRegistro) {
      return {
        valida: false,
        indiceRoto: i,
        motivo: `selloRegistro recomputado no coincide en ${i}`,
      };
    }

    esperadoPrev = reg.selloRegistro;
  }

  return { valida: true, indiceRoto: null, motivo: null };
}
