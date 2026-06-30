// CERBERUS COMERCIO EXTERIOR — capa probatoria / sellador calificado. NO es SIDF.
//
// Decisión C10 (corregida) + hallazgos del panel (penalista / arquitecto SAT):
//   - La hash-chain interna y el sello local (fecha/hora/IP auto-declarados) son
//     EVIDENCIA_PRELIMINAR: útiles internamente, NO oponibles a terceros.
//   - El estado pasa a PRUEBA_OPONIBLE solo con un sellado calificado externo:
//     PSC/TSA acreditado (RFC 3161) + Constancia NOM-151.
//
// El gancho existe desde Fase 0 (impl `NoOp` por defecto). El proveedor real se
// enchufa vía la impl `PSC_TSA` sin tocar el resto del sistema.

import { isSha256Hex } from "./hash";

/**
 * Estado probatorio de un artefacto sellado.
 * - EVIDENCIA_PRELIMINAR: integridad interna, no oponible a terceros.
 * - PRUEBA_OPONIBLE: respaldada por sellado calificado (PSC/TSA + NOM-151).
 */
export const EstadoProbatorio = {
  EVIDENCIA_PRELIMINAR: "EVIDENCIA_PRELIMINAR",
  PRUEBA_OPONIBLE: "PRUEBA_OPONIBLE",
} as const;

export type EstadoProbatorio =
  (typeof EstadoProbatorio)[keyof typeof EstadoProbatorio];

/** Token de sellado de tiempo (RFC 3161) devuelto por un PSC/TSA. */
export interface TsaToken {
  /** Token base64 (DER del TimeStampToken) que el perito puede verificar. */
  readonly tokenBase64: string;
  /** Instante sellado por la autoridad de tiempo (ISO 8601, UTC). */
  readonly selladoEn: string;
  /** Identificador de la autoridad de tiempo (URL o nombre del PSC). */
  readonly autoridad: string;
  /** Algoritmo del hash sellado (siempre SHA-256 en este sistema). */
  readonly algoritmo: "SHA-256";
}

/** Constancia de conservación de mensajes de datos (NOM-151-SCFI-2016). */
export interface ConstanciaNom151 {
  /** Folio o identificador de la constancia emitido por el PSC. */
  readonly folio: string;
  /** PSC acreditado que emite la constancia. */
  readonly psc: string;
  /** Fecha de emisión (ISO 8601, UTC). */
  readonly emitidaEn: string;
}

/** Resultado de un intento de sellado sobre un hash. */
export interface ResultadoSellado {
  /** Estado probatorio resultante del artefacto. */
  readonly estado: EstadoProbatorio;
  /** Hash de entrada (SHA-256 hex) que se intentó sellar. */
  readonly hash: string;
  /** Identificador del sellador que produjo el resultado. */
  readonly sellador: string;
  /** Instante en que se registró el resultado (ISO 8601, UTC). */
  readonly registradoEn: string;
  /** Token TSA si el sellado fue calificado. */
  readonly tsaToken?: TsaToken;
  /** Constancia NOM-151 si el sellado fue calificado. */
  readonly nom151?: ConstanciaNom151;
}

/**
 * Contrato del sellador. Permite cambiar de evidencia preliminar a prueba
 * oponible sin tocar el resto del sistema (Strategy enchufable).
 */
export interface SelladorCalificado {
  /** Identificador estable del sellador (aparece en el exporte probatorio). */
  readonly id: string;
  /** Sella un hash SHA-256 hex y devuelve el resultado probatorio. */
  sellar(hash: string): Promise<ResultadoSellado>;
}

function ahoraIso(): string {
  return new Date().toISOString();
}

function assertHash(hash: string): void {
  if (!isSha256Hex(hash)) {
    throw new TypeError(
      "SelladorCalificado.sellar requiere un SHA-256 hex válido (64 chars).",
    );
  }
}

/**
 * Sellador por defecto (Fase 0). NO contacta a ningún PSC/TSA: el artefacto
 * queda como EVIDENCIA_PRELIMINAR. Es el comportamiento seguro mientras no haya
 * proveedor calificado contratado.
 */
export class SelladorNoOp implements SelladorCalificado {
  readonly id = "NOOP";

  async sellar(hash: string): Promise<ResultadoSellado> {
    assertHash(hash);
    return {
      estado: EstadoProbatorio.EVIDENCIA_PRELIMINAR,
      hash,
      sellador: this.id,
      registradoEn: ahoraIso(),
    };
  }
}

/** Cliente que un PSC real implementará para entregar token TSA + NOM-151. */
export interface ProveedorPscTsa {
  /** Sella el hash con la TSA acreditada (RFC 3161). */
  obtenerTsaToken(hash: string): Promise<TsaToken>;
  /** Emite la constancia NOM-151 asociada. */
  obtenerConstanciaNom151(hash: string): Promise<ConstanciaNom151>;
}

/**
 * Sellador calificado conectable. Cuando se le inyecta un `ProveedorPscTsa`
 * real, eleva el artefacto a PRUEBA_OPONIBLE (TSA RFC 3161 + Constancia
 * NOM-151). Stub funcional: la lógica de transporte vive en el proveedor.
 *
 * Si no se inyecta proveedor, se degrada de forma segura a EVIDENCIA_PRELIMINAR
 * en lugar de fingir oponibilidad.
 */
export class SelladorPscTsa implements SelladorCalificado {
  readonly id = "PSC_TSA";

  constructor(private readonly proveedor?: ProveedorPscTsa) {}

  async sellar(hash: string): Promise<ResultadoSellado> {
    assertHash(hash);

    if (!this.proveedor) {
      // Gancho presente pero sin PSC contratado: no se promete oponibilidad.
      return {
        estado: EstadoProbatorio.EVIDENCIA_PRELIMINAR,
        hash,
        sellador: this.id,
        registradoEn: ahoraIso(),
      };
    }

    const [tsaToken, nom151] = await Promise.all([
      this.proveedor.obtenerTsaToken(hash),
      this.proveedor.obtenerConstanciaNom151(hash),
    ]);

    return {
      estado: EstadoProbatorio.PRUEBA_OPONIBLE,
      hash,
      sellador: this.id,
      registradoEn: ahoraIso(),
      tsaToken,
      nom151,
    };
  }
}

/** Sellador por defecto del sistema mientras no haya PSC/TSA contratado. */
export const selladorPorDefecto: SelladorCalificado = new SelladorNoOp();
