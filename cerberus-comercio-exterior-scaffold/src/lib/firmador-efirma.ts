// CERBERUS COMERCIO EXTERIOR — conector de firma e.firma (FIEL). NO es SIDF.
//
// Patrón idéntico a TimbradorPac (src/lib/timbrador-pac.ts) y SelladorCalificado:
// interfaz estable + implementación NoOp por defecto + factoría que decide por
// entorno. Aquí se construye SOLO el CONECTOR — la firma real se enchufa
// después implementando `FirmadorEfirma` sin tocar rutas ni UI.
//
// Uso (Incremento 15, decisión C11): el override de una alerta adversa debe
// quedar motivado, atribuido, sellado y —cuando exista integración— FIRMADO
// con la e.firma del responsable. Con el NoOp, firmar responde HONESTAMENTE
// que no hay firma configurada: el override queda registrado como SIN_FIRMA
// ("pendiente de firma electrónica"), nunca se finge un FIRMADO.
//
// SEGURIDAD (decisión C14): la clave privada de la FIEL NUNCA se almacena ni
// transita por este sistema. La firma real será DEL LADO DEL TITULAR (el
// responsable firma con su propia e.firma en su entorno) cuando se integren
// las APIs del cliente; el conector solo recibirá/verificará el resultado
// (sello + serial del certificado), jamás la clave .key ni su contraseña.

import { isSha256Hex } from "./probatoria/hash";

// ============================================================================
// Tipos
// ============================================================================

/** Estado de firma devuelto por un intento (espeja enum EstadoFirmaOverride). */
export type EstadoFirma = "SIN_FIRMA" | "FIRMADO";

/** Entrada para firmar el acto de override (ya motivado y sellado). */
export interface EntradaFirma {
  /** Payload canónico del acto (cliente, fuente, resultado, motivo, actor, ts). */
  readonly payloadCanonico: string;
  /** SHA-256 hex (64 chars) del payload canónico — sello local del acto. */
  readonly sha256: string;
  /** Actor (del JWT) al que se atribuye el acto y cuya e.firma firmaría. */
  readonly actor: string;
}

/** Resultado de un intento de firma. */
export interface ResultadoFirma {
  /** `true` solo si hubo firma real (estado FIRMADO con serial de certificado). */
  readonly ok: boolean;
  readonly estado: EstadoFirma;
  /** Detalle legible del resultado (se persiste en OverrideAlerta.firmaDetalle). */
  readonly detalle: string;
  /** Serial del certificado e.firma cuando se firme de verdad (conector real). */
  readonly serialCertificado?: string;
}

/**
 * Contrato del conector de firma e.firma. Permite pasar de "sin firma" a la
 * firma FIEL real del titular sin tocar rutas ni UI (Strategy enchufable,
 * como TimbradorPac).
 */
export interface FirmadorEfirma {
  /** Identificador estable del conector (aparece en firmaDetalle / bitácora). */
  readonly id: string;
  /** Intenta firmar el acto de override con la e.firma del responsable. */
  firmar(input: EntradaFirma): Promise<ResultadoFirma>;
}

// ============================================================================
// Implementación NoOp (default mientras no se integren las APIs del cliente)
// ============================================================================

function assertSha256(sha: string): void {
  if (!isSha256Hex(sha)) {
    throw new TypeError(
      "FirmadorEfirma.firmar requiere un SHA-256 hex válido (64 chars).",
    );
  }
}

/**
 * Conector por defecto. NO firma nada: responde honestamente que la firma
 * e.firma no está configurada. El override queda igualmente motivado, sellado
 * (sha256 del payload canónico) y atribuido, con estado SIN_FIRMA — jamás se
 * finge un FIRMADO. Comportamiento seguro mientras la integración real no
 * esté hecha.
 */
export class FirmadorNoOp implements FirmadorEfirma {
  readonly id = "NOOP";

  async firmar(input: EntradaFirma): Promise<ResultadoFirma> {
    assertSha256(input.sha256);
    return {
      ok: false,
      estado: "SIN_FIRMA",
      detalle:
        "Firma e.firma no configurada; el override queda motivado, sellado y " +
        "atribuido (SIN_FIRMA). La firma FIEL del lado del titular se " +
        "integrará con las APIs del cliente.",
    };
  }
}

// ============================================================================
// Factoría
// ============================================================================

/**
 * Devuelve el conector de firma activo según el entorno.
 *
 * HOY: siempre `FirmadorNoOp` — la integración con la e.firma del cliente es
 * un paso posterior.
 *
 * DESPUÉS (dónde se enchufa la firma real): implementar una clase
 * `FirmadorEfirmaReal implements FirmadorEfirma` que orqueste la firma DEL
 * LADO DEL TITULAR (decisión C14: la clave privada FIEL nunca se almacena ni
 * se sube a este sistema; el conector solo recibe y verifica el sello firmado
 * y el serial del certificado) y devolverla aquí cuando `EFIRMA_PROVIDER`
 * identifique al proveedor, p. ej.:
 *
 *   switch (process.env.EFIRMA_PROVIDER) {
 *     case "PROVEEDOR_X":
 *       return new FirmadorProveedorX({ apiUrl: process.env.EFIRMA_API_URL! });
 *     default:
 *       return firmadorPorDefecto;
 *   }
 *
 * Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerFirmador(): FirmadorEfirma {
  const provider = process.env.EFIRMA_PROVIDER?.trim();
  if (provider) {
    // Gancho presente pero sin implementación real todavía: degradar de forma
    // segura a NoOp en lugar de fingir una firma.
    return firmadorPorDefecto;
  }
  return firmadorPorDefecto;
}

/** Conector por defecto del sistema mientras no se integre la e.firma real. */
export const firmadorPorDefecto: FirmadorEfirma = new FirmadorNoOp();
