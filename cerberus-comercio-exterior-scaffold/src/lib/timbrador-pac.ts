// CERBERUS COMERCIO EXTERIOR — conector de timbrado PAC. NO es SIDF.
//
// Patrón idéntico a SelladorCalificado (src/lib/probatoria/sellador-calificado.ts):
// interfaz estable + implementación NoOp por defecto + factoría que decide por
// entorno. El cliente YA tiene PAC contratado; aquí se construye SOLO el
// CONECTOR — la conexión real (credenciales, transporte, XSD/catálogos SAT) se
// enchufa después implementando `TimbradorPac` sin tocar el resto del sistema.
//
// Con el NoOp, timbrar/cancelar responden HONESTAMENTE que no hay PAC
// configurado: el comprobante queda en BORRADOR sellado (integridad local) y
// el intento se registra en bitácora. Decisión C8: la cancelación (motivos
// 01-04 del estándar CFDI 4.0) se modela desde el inicio.

import { isSha256Hex } from "./probatoria/hash";

// ============================================================================
// Tipos
// ============================================================================

/** Motivo de cancelación del estándar CFDI 4.0 (enum MotivoCancelacion). */
export type MotivoCancelacionCfdi = "M01" | "M02" | "M03" | "M04";

/** Estado devuelto por un intento de timbrado. */
export type EstadoTimbrado = "SIN_PAC" | "TIMBRADO" | "ERROR";

/** Estado devuelto por un intento de cancelación. */
export type EstadoCancelacion = "SIN_PAC" | "CANCELADO" | "ERROR";

/** Entrada para timbrar un comprobante (borrador sellado localmente). */
export interface EntradaTimbrado {
  /** Payload canónico del comprobante (string determinista, ver carta-porte.ts). */
  readonly payloadCanonico: string;
  /** SHA-256 hex (64 chars) del payload canónico — sello local del borrador. */
  readonly sha256: string;
  /** RFC del emisor del CFDI. */
  readonly emisorRfc: string;
  /** RFC del receptor del CFDI. */
  readonly receptorRfc: string;
}

/** Resultado de un intento de timbrado. */
export interface ResultadoTimbrado {
  /** `true` solo si el PAC timbró (estado TIMBRADO con uuid). */
  readonly ok: boolean;
  readonly estado: EstadoTimbrado;
  /** Folio fiscal (UUID) asignado por el SAT vía PAC, si hubo timbrado. */
  readonly uuid?: string;
  /** Detalle legible del resultado (se persiste en ComprobanteCfdi.detallePac). */
  readonly detalle: string;
}

/** Entrada para cancelar un comprobante timbrado. */
export interface EntradaCancelacion {
  /** Folio fiscal (UUID) del comprobante a cancelar (solo existe si fue TIMBRADO). */
  readonly uuid?: string;
  /** Motivo 01-04 del estándar CFDI 4.0. */
  readonly motivo: MotivoCancelacionCfdi;
  /** UUID del comprobante que sustituye (obligatorio si motivo = M01). */
  readonly sustituyeUuid?: string;
  /** RFC del emisor del comprobante. */
  readonly emisorRfc: string;
}

/** Resultado de un intento de cancelación. */
export interface ResultadoCancelacion {
  /** `true` solo si el PAC canceló (estado CANCELADO). */
  readonly ok: boolean;
  readonly estado: EstadoCancelacion;
  /** Detalle legible del resultado (se persiste en ComprobanteCfdi.detallePac). */
  readonly detalle: string;
}

/**
 * Contrato del conector de timbrado. Permite pasar de "sin PAC" al PAC real
 * del cliente sin tocar rutas ni UI (Strategy enchufable, como
 * SelladorCalificado).
 */
export interface TimbradorPac {
  /** Identificador estable del conector (aparece en detallePac / bitácora). */
  readonly id: string;
  /** Intenta timbrar el comprobante ante el SAT vía PAC. */
  timbrar(input: EntradaTimbrado): Promise<ResultadoTimbrado>;
  /** Intenta cancelar un comprobante timbrado (motivos 01-04). */
  cancelar(input: EntradaCancelacion): Promise<ResultadoCancelacion>;
}

// ============================================================================
// Implementación NoOp (default mientras no se conecte el PAC del cliente)
// ============================================================================

function assertSha256(sha: string): void {
  if (!isSha256Hex(sha)) {
    throw new TypeError(
      "TimbradorPac.timbrar requiere un SHA-256 hex válido (64 chars).",
    );
  }
}

/**
 * Conector por defecto. NO contacta a ningún PAC: responde honestamente que no
 * hay conector configurado. El comprobante queda en BORRADOR sellado (su
 * integridad la garantiza el sha256 del payload canónico) y el intento se
 * registra. Comportamiento seguro mientras la conexión real no esté hecha.
 */
export class TimbradorNoOp implements TimbradorPac {
  readonly id = "NOOP";

  async timbrar(input: EntradaTimbrado): Promise<ResultadoTimbrado> {
    assertSha256(input.sha256);
    return {
      ok: false,
      estado: "SIN_PAC",
      detalle:
        "Conector PAC no configurado; el comprobante queda en BORRADOR sellado",
    };
  }

  async cancelar(input: EntradaCancelacion): Promise<ResultadoCancelacion> {
    void input;
    return {
      ok: false,
      estado: "SIN_PAC",
      detalle:
        "Conector PAC no configurado; no hay comprobante timbrado que cancelar",
    };
  }
}

// ============================================================================
// Factoría
// ============================================================================

/**
 * Devuelve el conector de timbrado activo según el entorno.
 *
 * HOY: siempre `TimbradorNoOp` — el cliente ya tiene PAC contratado pero la
 * conexión real es un paso posterior.
 *
 * DESPUÉS (dónde se enchufa el PAC real): implementar una clase
 * `TimbradorPacReal implements TimbradorPac` (transporte HTTP/SOAP del PAC del
 * cliente, credenciales vía env, validación XSD/catálogos del SAT) y devolverla
 * aquí cuando `PAC_PROVIDER` identifique al proveedor, p. ej.:
 *
 *   switch (process.env.PAC_PROVIDER) {
 *     case "PROVEEDOR_X":
 *       return new TimbradorProveedorX({ apiKey: process.env.PAC_API_KEY! });
 *     default:
 *       return timbradorPorDefecto;
 *   }
 *
 * Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerTimbrador(): TimbradorPac {
  const provider = process.env.PAC_PROVIDER?.trim();
  if (provider) {
    // Gancho presente pero sin implementación real todavía: degradar de forma
    // segura a NoOp en lugar de fingir timbrado.
    return timbradorPorDefecto;
  }
  return timbradorPorDefecto;
}

/** Conector por defecto del sistema mientras no se conecte el PAC real. */
export const timbradorPorDefecto: TimbradorPac = new TimbradorNoOp();
