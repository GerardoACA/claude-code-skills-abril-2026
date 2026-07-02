// CERBERUS COMERCIO EXTERIOR — conector de cotejo EN VIVO de la opinión 32-D. NO es SIDF.
//
// Patrón idéntico a TimbradorPac / FirmadorEfirma / ConectorErp: interfaz estable
// + implementación NoOp por defecto + factoría que decide por entorno. Aquí se
// construye SOLO el CONECTOR del COTEJO EN VIVO de la opinión de cumplimiento
// (art. 32-D CFF) ante el SAT: dado el FOLIO/acuse (y RFC) de una opinión que el
// cliente entregó, la implementación real consultará el servicio de verificación
// del SAT y devolverá si el folio existe y con qué sentido, para RATIFICAR (o
// desmentir) la validación automática de autenticidad del texto.
//
// Con el NoOp, cotejar responde HONESTAMENTE que el cotejo en vivo no está
// configurado (NO_DISPONIBLE): la opinión queda con su veredicto de análisis
// textual y marcada como pendiente de ratificación. Nunca se finge una
// confirmación del SAT.
//
// SEGURIDAD/ALCANCE: el cotejo por folio NO requiere la e.firma del contribuyente
// (es una verificación pública del acuse), por eso este camino funciona aunque el
// cliente no entregue su .cer — que es justo el caso de uso. La conexión real
// (endpoint del SAT, parsing del acuse, tolerancia a captcha/rate-limit) se
// enchufa implementando `VerificadorOpinionSat` sin tocar rutas ni UI.

/** Estado del cotejo (espeja el enum Prisma EstadoCotejoSat). */
export type EstadoCotejoSat =
  | "NO_INTENTADO"
  | "CONFIRMADA"
  | "DISCREPANCIA"
  | "NO_DISPONIBLE";

/** Entrada del cotejo en vivo. */
export interface EntradaCotejo {
  /** RFC del contribuyente al que corresponde la opinión. */
  readonly rfc: string;
  /** Folio/acuse de la opinión entregada (clave de la consulta). */
  readonly folio: string | null;
  /** Sentido detectado en el documento ingestado (para comparar con el SAT). */
  readonly sentidoDeclarado: string;
}

/** Resultado del cotejo en vivo. */
export interface ResultadoCotejo {
  /** `true` solo si el SAT confirmó el folio/sentido. */
  readonly ok: boolean;
  readonly estado: EstadoCotejoSat;
  /** Detalle legible (se persiste en OpinionCumplimientoIngestada.cotejoDetalle). */
  readonly detalle: string;
}

/**
 * Contrato del conector de cotejo en vivo. Permite pasar de "no configurado" a
 * la verificación real ante el SAT sin tocar rutas ni UI (Strategy enchufable).
 */
export interface VerificadorOpinionSat {
  /** Identificador estable del conector (aparece en cotejoDetalle / bitácora). */
  readonly id: string;
  /** Coteja la opinión ante el SAT por folio/acuse. */
  cotejar(input: EntradaCotejo): Promise<ResultadoCotejo>;
}

/**
 * Conector por defecto. NO contacta al SAT: responde honestamente que el cotejo
 * en vivo no está configurado. La opinión conserva su veredicto de análisis
 * textual y queda pendiente de ratificación. Comportamiento seguro mientras la
 * conexión real no esté hecha.
 */
export class VerificadorOpinionNoOp implements VerificadorOpinionSat {
  readonly id = "NOOP";

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    void input;
    return {
      ok: false,
      estado: "NO_DISPONIBLE",
      detalle:
        "Cotejo en vivo ante el SAT no configurado. La opinión queda con su " +
        "veredicto de análisis de autenticidad; el folio quedará listo para " +
        "ratificación cuando se conecte el servicio de verificación del SAT.",
    };
  }
}

/**
 * Devuelve el verificador activo según el entorno.
 *
 * HOY: siempre `VerificadorOpinionNoOp`. La conexión real es un paso posterior.
 *
 * DESPUÉS: implementar `VerificadorOpinionSatReal implements VerificadorOpinionSat`
 * (transporte HTTP al servicio del SAT, parsing del acuse) y devolverla aquí
 * cuando `SAT_OPINION_PROVIDER` identifique al proveedor/gateway, p. ej.:
 *
 *   switch (process.env.SAT_OPINION_PROVIDER) {
 *     case "SAT_DIRECTO":
 *       return new VerificadorOpinionSatDirecto({ apiUrl: process.env.SAT_OPINION_URL! });
 *     default:
 *       return verificadorOpinionPorDefecto;
 *   }
 *
 * Rutas y UI no cambian: solo consumen esta factoría.
 */
export function obtenerVerificadorOpinion(): VerificadorOpinionSat {
  const provider = process.env.SAT_OPINION_PROVIDER?.trim();
  if (provider) {
    // Gancho presente pero sin implementación real todavía: degradar de forma
    // segura a NoOp en lugar de fingir una confirmación del SAT.
    return verificadorOpinionPorDefecto;
  }
  return verificadorOpinionPorDefecto;
}

/** Conector por defecto mientras no se conecte el cotejo en vivo real. */
export const verificadorOpinionPorDefecto: VerificadorOpinionSat =
  new VerificadorOpinionNoOp();
