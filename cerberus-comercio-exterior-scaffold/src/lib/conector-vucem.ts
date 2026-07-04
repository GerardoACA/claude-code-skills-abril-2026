// CERBERUS COMERCIO EXTERIOR — conector VUCEM (ventanilla única). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/conector-vucem.ts  (Incremento 59)
// Propósito: conector enchufable hacia VUCEM (Ventanilla Única de Comercio
//            Exterior Mexicana) con el patrón de TimbradorPac / AlmacenWorm /
//            Notificador: interfaz estable + implementación NoOp por defecto +
//            factoría que decide por entorno.
//
// CONTEXTO (dictamen aduanal, hallazgo ALTO): la reforma exige la
// Manifestación de Valor SOLO-electrónica vía VUCEM (E2). Hoy el sistema
// registra el paso con su acuse (y desde el Inc 59, con el archivo del acuse
// sellado en la bóveda); la TRANSMISIÓN sigue siendo manual por el portal.
// Este conector deja el enchufe listo: cuando existan las credenciales, se
// implementa `ConectorVucem` real y rutas/UI no cambian.
//
// FAIL-SAFE (convención dura): el conector NUNCA lanza por condiciones
// esperables — responde ok:false con detalle honesto y el paso se registra
// igual (C9: el sistema alerta/anota, nunca bloquea).
//
// TODO (conexión real): el web service de VUCEM exige credenciales del agente
// aduanal / importador (usuario VUCEM + FIEL para firmar los sobres SOAP).
// Decisión C14: la llave privada FIEL JAMÁS se almacena — la implementación
// real deberá firmar del lado del cliente o vía un firmado por sesión, nunca
// persistir la llave. Implementar `VucemWs implements ConectorVucem`
// (transporte SOAP a VUCEM_WS_URL con host fijo anti-SSRF, autenticación con
// VUCEM_USUARIO + firma) y devolverla en la factoría cuando el entorno esté
// completo. Rutas y UI no cambian: solo consumen `obtenerConectorVucem()`.
// =============================================================================

// ============================================================================
// Tipos (basados en lo que ya captura el paso del despacho)
// ============================================================================

/** Entrada para transmitir la Manifestación de Valor (E2) vía VUCEM. */
export interface EntradaMveVucem {
  /** Operación a la que pertenece la manifestación. */
  readonly operacionId: string;
  /** Acuse/folio/referencia capturado del trámite E2. */
  readonly acuse: string;
  /** sha256 del archivo del acuse adjunto (bóveda del despacho), si existe. */
  readonly sha256Documento?: string;
}

/** Entrada para consultar un acuse de valor (COVE) en VUCEM. */
export interface EntradaCoveVucem {
  /** Operación a la que pertenece el COVE. */
  readonly operacionId: string;
  /** Número de acuse de valor (COVE) a consultar. */
  readonly acuse: string;
}

/** Resultado de una operación contra VUCEM. */
export interface ResultadoVucem {
  /** `true` solo si VUCEM transmitió/confirmó (imposible con el NoOp). */
  readonly ok: boolean;
  /** Folio / e-document devuelto por VUCEM, si hubo transmisión real. */
  readonly folio?: string;
  /** Detalle legible (se anota en el `detalle` del paso y en bitácora). */
  readonly detalle: string;
}

/**
 * Contrato del conector VUCEM. Permite pasar de "sin conexión" (NoOp honesto)
 * al web service real sin tocar rutas ni UI (Strategy enchufable, como
 * TimbradorPac / AlmacenWorm).
 */
export interface ConectorVucem {
  /** Transmite la Manifestación de Valor (E2) — reforma: solo-electrónica. */
  transmitirMve(entrada: EntradaMveVucem): Promise<ResultadoVucem>;
  /** Consulta el estado de un COVE por su número de acuse. */
  consultarCove(entrada: EntradaCoveVucem): Promise<ResultadoVucem>;
  /** Estado legible del conector (UI / bitácora / diagnóstico). */
  estado(): string;
}

// ============================================================================
// Implementación NoOp (default mientras no haya credenciales VUCEM)
// ============================================================================

/** Detalle honesto y estable del NoOp (se anota en el detalle del paso). */
export const DETALLE_VUCEM_NO_CONFIGURADO =
  "Conector VUCEM no configurado; transmisión manual por el portal.";

/**
 * Conector por defecto. NO contacta a VUCEM: responde honestamente que no hay
 * conexión configurada. El paso se registra igual (con su acuse y su archivo
 * sellado) y el detalle deja constancia de que la transmisión fue manual.
 */
export class VucemNoOp implements ConectorVucem {
  async transmitirMve(entrada: EntradaMveVucem): Promise<ResultadoVucem> {
    void entrada;
    return { ok: false, detalle: DETALLE_VUCEM_NO_CONFIGURADO };
  }

  async consultarCove(entrada: EntradaCoveVucem): Promise<ResultadoVucem> {
    void entrada;
    return { ok: false, detalle: DETALLE_VUCEM_NO_CONFIGURADO };
  }

  estado(): string {
    return "NO_CONFIGURADO";
  }
}

// ============================================================================
// Factoría
// ============================================================================

/** Conector por defecto del sistema mientras no haya conexión real a VUCEM. */
export const vucemPorDefecto: ConectorVucem = new VucemNoOp();

/**
 * Devuelve el conector VUCEM activo según el entorno (VUCEM_WS_URL +
 * VUCEM_USUARIO).
 *
 * HOY: siempre `VucemNoOp` — el despacho real exige credenciales del agente
 * aduanal (usuario VUCEM + firma FIEL, ver TODO en la cabecera) que aún no
 * existen; aunque las variables estén presentes se degrada de forma segura a
 * NoOp en lugar de fingir transmisión.
 *
 * DESPUÉS: cuando `VucemWs` exista, devolverla aquí si ambas variables están
 * presentes. Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerConectorVucem(): ConectorVucem {
  const wsUrl = process.env.VUCEM_WS_URL?.trim();
  const usuario = process.env.VUCEM_USUARIO?.trim();
  if (wsUrl && usuario) {
    // Gancho presente pero sin implementación real todavía: degradar de forma
    // segura a NoOp en lugar de fingir transmisión (mismo criterio que
    // obtenerTimbrador con PAC_PROVIDER).
    return vucemPorDefecto;
  }
  return vucemPorDefecto;
}

// =============================================================================
// FIN conector-vucem.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
