// CERBERUS COMERCIO EXTERIOR — capa probatoria / exporte probatorio. NO es SIDF.
//
// Decisión C16 / §4 diseño v2: paquete autocontenido (registros + hashes +
// sellos + manual de verificación) que un perito tercero valida SIN acceso al
// sistema vivo. Stub funcional: produce el objeto/JSON del paquete.

import { sha256 } from "./hash";
import {
  GENESIS_SELLO,
  canonicalizar,
  verificarCadena,
  type RegistroEncadenado,
} from "./hash-chain";
import {
  EstadoProbatorio,
  type ResultadoSellado,
} from "./sellador-calificado";

/** Versión del formato del exporte (para que el perito sepa interpretarlo). */
export const FORMATO_EXPORTE = "cerberus-ce-exporte-probatorio/1";

/** Un registro probatorio completo: payload + eslabón de cadena + sellado. */
export interface RegistroProbatorio {
  /** Eslabón de la hash-chain append-only. */
  readonly eslabon: RegistroEncadenado;
  /** Payload canónico (string) cuyo SHA-256 es `eslabon.hashPayload`. */
  readonly payloadCanonico: string;
  /** Resultado del sellado (preliminar u oponible). Opcional por registro. */
  readonly sellado?: ResultadoSellado;
}

/** Entrada para armar el paquete. */
export interface EntradaExporte {
  /** Identificador del tenant dueño de la evidencia. */
  readonly tenantId: string;
  /** Identificador del expediente/operación exportado. */
  readonly expediente: string;
  /** Registros en orden de cadena. */
  readonly registros: readonly RegistroProbatorio[];
  /**
   * Snapshots de listas externas consultadas (p. ej. 69-B / DOF) con su hash,
   * para que el perito reconstruya el contexto sin el sistema vivo.
   */
  readonly snapshotsExternos?: readonly SnapshotExterno[];
}

/** Snapshot de una fuente externa con su sello de integridad. */
export interface SnapshotExterno {
  readonly fuente: string;
  readonly consultadoEn: string;
  readonly sha256: string;
  readonly descripcion?: string;
}

/** Paquete probatorio autocontenido y verificable por perito tercero. */
export interface PaqueteProbatorio {
  readonly formato: typeof FORMATO_EXPORTE;
  readonly generadoEn: string;
  readonly tenantId: string;
  readonly expediente: string;
  readonly genesis: string;
  readonly algoritmo: "SHA-256";
  readonly registros: readonly RegistroProbatorio[];
  readonly snapshotsExternos: readonly SnapshotExterno[];
  /** Resumen del estado probatorio agregado del paquete. */
  readonly resumen: ResumenProbatorio;
  /** Manual de verificación en texto plano (español) para el perito. */
  readonly manualVerificacion: string;
  /**
   * Sello del propio paquete: SHA-256 del cuerpo canonicalizado SIN este campo.
   * Permite detectar alteración del paquete completo tras su emisión.
   */
  readonly selloPaquete: string;
}

/** Agregado del estado probatorio del paquete. */
export interface ResumenProbatorio {
  readonly totalRegistros: number;
  readonly conPruebaOponible: number;
  readonly soloPreliminar: number;
  /** El paquete es oponible solo si TODOS sus registros lo son. */
  readonly estadoGlobal: EstadoProbatorio;
}

function resumir(registros: readonly RegistroProbatorio[]): ResumenProbatorio {
  let oponibles = 0;
  for (const r of registros) {
    if (r.sellado?.estado === EstadoProbatorio.PRUEBA_OPONIBLE) oponibles++;
  }
  const total = registros.length;
  const todasOponibles = total > 0 && oponibles === total;
  return {
    totalRegistros: total,
    conPruebaOponible: oponibles,
    soloPreliminar: total - oponibles,
    estadoGlobal: todasOponibles
      ? EstadoProbatorio.PRUEBA_OPONIBLE
      : EstadoProbatorio.EVIDENCIA_PRELIMINAR,
  };
}

function manualVerificacion(expediente: string): string {
  return [
    "MANUAL DE VERIFICACIÓN — EXPORTE PROBATORIO CERBERUS COMERCIO EXTERIOR",
    `Expediente: ${expediente}`,
    `Formato: ${FORMATO_EXPORTE}`,
    "",
    "Este paquete es autocontenido: puede verificarse SIN acceso al sistema",
    "vivo, usando únicamente herramientas estándar de cómputo de SHA-256.",
    "",
    "1. ALGORITMO",
    "   Todos los sellos usan SHA-256 y se expresan en hexadecimal (64 chars,",
    "   minúsculas). La codificación de texto de los payloads es UTF-8.",
    "",
    "2. VERIFICACIÓN DE CADA REGISTRO",
    "   Para cada registro de 'registros':",
    "   a) Calcule SHA-256 de 'payloadCanonico' (como bytes UTF-8). Debe ser",
    "      igual a 'eslabon.hashPayload'.",
    "   b) Concatene: eslabon.hashPrev + '\\n' + eslabon.hashPayload (UTF-8) y",
    "      calcule su SHA-256. Debe ser igual a 'eslabon.selloRegistro'.",
    "",
    "3. VERIFICACIÓN DE LA CADENA (append-only)",
    `   - El 'hashPrev' del primer registro es el génesis: ${GENESIS_SELLO}`,
    "   - Para i>=1, 'eslabon.hashPrev' debe ser igual al 'selloRegistro' del",
    "     registro anterior. Si un registro intermedio fue alterado, su",
    "     hashPayload (paso 2a) o el encadenamiento (paso 3) dejará de cuadrar,",
    "     delatando la manipulación.",
    "",
    "4. ESTADO PROBATORIO",
    "   - 'EVIDENCIA_PRELIMINAR': integridad interna; NO oponible a terceros.",
    "   - 'PRUEBA_OPONIBLE': respaldada por sellado calificado. En ese caso el",
    "     campo 'sellado' incluye 'tsaToken' (RFC 3161) y 'nom151'. Verifique el",
    "     token TSA contra la autoridad de tiempo y la constancia NOM-151 con el",
    "     PSC emisor indicado.",
    "",
    "5. SNAPSHOTS EXTERNOS",
    "   'snapshotsExternos' contiene el SHA-256 de las listas externas (p. ej.",
    "   69-B / DOF) consultadas al momento de los hechos, para reconstruir el",
    "   contexto normativo sin el sistema vivo.",
    "",
    "6. SELLO DEL PAQUETE",
    "   'selloPaquete' es el SHA-256 del cuerpo del paquete canonicalizado",
    "   (mismas claves, ordenadas, EXCLUYENDO el propio campo 'selloPaquete').",
    "   Permite detectar alteración del paquete completo tras su emisión.",
  ].join("\n");
}

/**
 * Arma el paquete probatorio autocontenido. No realiza E/S: es una función pura
 * que produce el objeto listo para serializar a JSON con `serializarPaquete`.
 */
export function armarExporteProbatorio(
  entrada: EntradaExporte,
): PaqueteProbatorio {
  const snapshotsExternos = entrada.snapshotsExternos ?? [];
  const resumen = resumir(entrada.registros);

  const cuerpo = {
    formato: FORMATO_EXPORTE,
    generadoEn: new Date().toISOString(),
    tenantId: entrada.tenantId,
    expediente: entrada.expediente,
    genesis: GENESIS_SELLO,
    algoritmo: "SHA-256" as const,
    registros: entrada.registros,
    snapshotsExternos,
    resumen,
    manualVerificacion: manualVerificacion(entrada.expediente),
  };

  // El sello del paquete cubre el cuerpo SIN incluirse a sí mismo.
  const selloPaquete = sha256(canonicalizar(cuerpo));

  return { ...cuerpo, selloPaquete };
}

/** Serializa el paquete a JSON canónico (determinista) para entrega/archivo. */
export function serializarPaquete(paquete: PaqueteProbatorio): string {
  return canonicalizar(paquete);
}

/** Resultado de verificar un paquete completo (autovalidación del exporte). */
export interface ResultadoVerificacionExporte {
  readonly valida: boolean;
  readonly selloPaqueteOk: boolean;
  readonly indiceRoto: number | null;
  readonly motivo: string | null;
}

/**
 * Reproduce, dentro del propio sistema, la verificación que haría un perito:
 * recomputa la hash-chain a partir de los payloads canónicos y revalida el
 * sello del paquete. Pensada para tests y para autovalidar antes de exportar.
 */
export function verificarExporte(
  paquete: PaqueteProbatorio,
): ResultadoVerificacionExporte {
  const cadena = paquete.registros.map((r) => r.eslabon);
  const payloads = paquete.registros.map((r) => r.payloadCanonico);

  // Los payloads del exporte ya son canónicos (string); su hash directo debe
  // coincidir con hashPayload, así que verificamos la cadena estructuralmente
  // y el contenido por separado.
  for (let i = 0; i < paquete.registros.length; i++) {
    const reg = paquete.registros[i];
    if (sha256(reg.payloadCanonico) !== reg.eslabon.hashPayload) {
      return {
        valida: false,
        selloPaqueteOk: false,
        indiceRoto: i,
        motivo: `payloadCanonico no corresponde a hashPayload en ${i}`,
      };
    }
  }

  const cadenaOk = verificarCadena(cadena);
  if (!cadenaOk.valida) {
    return {
      valida: false,
      selloPaqueteOk: false,
      indiceRoto: cadenaOk.indiceRoto,
      motivo: cadenaOk.motivo,
    };
  }

  const { selloPaquete, ...cuerpo } = paquete;
  const selloRecomputado = sha256(canonicalizar(cuerpo));
  const selloPaqueteOk = selloRecomputado === selloPaquete;

  return {
    valida: selloPaqueteOk,
    selloPaqueteOk,
    indiceRoto: null,
    motivo: selloPaqueteOk ? null : "selloPaquete recomputado no coincide",
  };
}
