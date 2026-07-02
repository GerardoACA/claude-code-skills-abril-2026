// CERBERUS COMERCIO EXTERIOR — conector de cotejo EN VIVO de la opinión 32-D. NO es SIDF.
//
// Patrón de conector enchufable (como TimbradorPac / FirmadorEfirma / ConectorErp):
// interfaz estable + implementaciones seleccionadas por entorno. A diferencia de
// los conectores que siguen en NoOp, ESTE ya trae una implementación REAL y
// FUNCIONAL (`VerificadorOpinionSatHttp`): dado el FOLIO/acuse (y RFC) de una
// opinión de cumplimiento que el cliente ENTREGA, hace una consulta HTTP al
// gateway/servicio de validación que se le configure y mapea la respuesta a
// CONFIRMADA / DISCREPANCIA / NO_DISPONIBLE. El cotejo por folio NO requiere la
// e.firma del contribuyente (es verificación del acuse), por eso este camino
// funciona aunque el cliente no entregue su .cer — que es justo el caso de uso.
//
// CÓMO SE ENCIENDE (variables de entorno):
//   - SAT_OPINION_PROVIDER=HTTP        → activa el verificador real.
//   - SAT_OPINION_URL=<endpoint>       → endpoint que valida el folio ante el SAT
//                                        (tu gateway, tu PAC/legaltech, o el
//                                        servicio del SAT que te den acceso).
//   - SAT_OPINION_API_KEY=<token>      → (opcional) se envía como Bearer.
//   Sin SAT_OPINION_PROVIDER=HTTP + URL → degrada a NoOp honesto (no finge nada).
//
// CONTRATO del endpoint (para que "eche a andar" en cuanto lo apuntes):
//   Request  (POST JSON):  { "rfc": string, "folio": string, "sentidoDeclarado": string }
//   Response (200 JSON):   { "encontrada": boolean,
//                            "sentido"?: "POSITIVA"|"NEGATIVA"|"SIN_OBLIGACIONES"|"NO_INSCRITO",
//                            "detalle"?: string }
//   - encontrada=false               → DISCREPANCIA (el folio no existe en el SAT: señal de falso).
//   - encontrada=true, sentido igual → CONFIRMADA.
//   - encontrada=true, sentido ≠     → DISCREPANCIA (el SAT dice otra cosa).
//   Cualquier error de red/parseo/timeout → NO_DISPONIBLE (nunca lanza; fail-safe).
//
// C9: el resultado alimenta la alerta de cumplimiento; nunca bloquea.

/** Estado del cotejo (espeja el enum Prisma EstadoCotejoSat). */
export type EstadoCotejoSat =
  | "NO_INTENTADO"
  | "CONFIRMADA"
  | "DISCREPANCIA"
  | "NO_DISPONIBLE";

/** Entrada del cotejo en vivo. */
export interface EntradaCotejo {
  readonly rfc: string;
  readonly folio: string | null;
  readonly sentidoDeclarado: string;
}

/** Resultado del cotejo en vivo. */
export interface ResultadoCotejo {
  readonly ok: boolean;
  readonly estado: EstadoCotejoSat;
  readonly detalle: string;
}

/** Contrato del conector de cotejo en vivo (Strategy enchufable). */
export interface VerificadorOpinionSat {
  readonly id: string;
  cotejar(input: EntradaCotejo): Promise<ResultadoCotejo>;
}

/** Normaliza sentido para comparar (mayúsculas, sin acentos, sin espacios extra). */
function normalizarSentido(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_")
    .trim();
}

// ============================================================================
// NoOp (fallback honesto cuando no hay endpoint configurado)
// ============================================================================

export class VerificadorOpinionNoOp implements VerificadorOpinionSat {
  readonly id = "NOOP";

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    void input;
    return {
      ok: false,
      estado: "NO_DISPONIBLE",
      detalle:
        "Cotejo en vivo ante el SAT no configurado. Define SAT_OPINION_PROVIDER=HTTP " +
        "y SAT_OPINION_URL para activarlo; la opinión queda con su veredicto de " +
        "análisis de autenticidad y el folio listo para ratificación.",
    };
  }
}

// ============================================================================
// Implementación REAL: cliente HTTP contra el gateway de validación del SAT
// ============================================================================

export interface OpcionesHttp {
  readonly url: string;
  readonly apiKey?: string;
  /** Timeout en ms (default 12000). */
  readonly timeoutMs?: number;
}

/** Forma esperada de la respuesta del endpoint (validada defensivamente). */
interface RespuestaGateway {
  encontrada: boolean;
  sentido?: string;
  detalle?: string;
}

function parseRespuesta(data: unknown): RespuestaGateway | null {
  if (data === null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.encontrada !== "boolean") return null;
  return {
    encontrada: o.encontrada,
    sentido: typeof o.sentido === "string" ? o.sentido : undefined,
    detalle: typeof o.detalle === "string" ? o.detalle : undefined,
  };
}

/**
 * Verificador real. Consulta el endpoint configurado con { rfc, folio,
 * sentidoDeclarado } y mapea la respuesta. NUNCA lanza por condiciones
 * esperables (sin folio, red caída, timeout, JSON inválido): reporta
 * NO_DISPONIBLE. Solo devuelve CONFIRMADA/DISCREPANCIA cuando el endpoint
 * respondió de forma inequívoca.
 */
export class VerificadorOpinionSatHttp implements VerificadorOpinionSat {
  readonly id = "HTTP";
  private readonly opciones: OpcionesHttp;

  constructor(opciones: OpcionesHttp) {
    this.opciones = opciones;
  }

  async cotejar(input: EntradaCotejo): Promise<ResultadoCotejo> {
    if (input.folio === null || input.folio.trim() === "") {
      return {
        ok: false,
        estado: "NO_DISPONIBLE",
        detalle: "Sin folio/acuse no es posible cotejar ante el SAT.",
      };
    }

    const timeoutMs = this.opciones.timeoutMs ?? 12000;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.opciones.apiKey) {
        headers.Authorization = `Bearer ${this.opciones.apiKey}`;
      }
      const res = await fetch(this.opciones.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rfc: input.rfc,
          folio: input.folio,
          sentidoDeclarado: input.sentidoDeclarado,
        }),
        signal: controlador.signal,
      });

      if (!res.ok) {
        return {
          ok: false,
          estado: "NO_DISPONIBLE",
          detalle: `El gateway de validación respondió HTTP ${res.status}.`,
        };
      }

      let cuerpo: unknown;
      try {
        cuerpo = await res.json();
      } catch {
        return {
          ok: false,
          estado: "NO_DISPONIBLE",
          detalle: "El gateway de validación devolvió una respuesta no interpretable (JSON inválido).",
        };
      }

      const resp = parseRespuesta(cuerpo);
      if (resp === null) {
        return {
          ok: false,
          estado: "NO_DISPONIBLE",
          detalle:
            "La respuesta del gateway no cumple el contrato esperado " +
            "({ encontrada: boolean, sentido?, detalle? }).",
        };
      }

      if (!resp.encontrada) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle:
            resp.detalle ??
            "El SAT no localizó el folio de la opinión: posible documento falso o folio erróneo.",
        };
      }

      // encontrada = true: comparar sentido si el documento declaró uno.
      const declarado = normalizarSentido(input.sentidoDeclarado);
      const delSat = resp.sentido ? normalizarSentido(resp.sentido) : null;
      if (delSat !== null && declarado !== "INDETERMINADO" && delSat !== declarado) {
        return {
          ok: true,
          estado: "DISCREPANCIA",
          detalle:
            resp.detalle ??
            `El SAT reporta sentido "${resp.sentido}", distinto al del documento entregado.`,
        };
      }

      return {
        ok: true,
        estado: "CONFIRMADA",
        detalle:
          resp.detalle ??
          `El SAT confirma el folio${resp.sentido ? ` (sentido ${resp.sentido})` : ""}.`,
      };
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        estado: "NO_DISPONIBLE",
        detalle: abortado
          ? `Tiempo de espera agotado (${timeoutMs} ms) al cotejar ante el SAT.`
          : "No se pudo contactar el gateway de validación del SAT.",
      };
    } finally {
      clearTimeout(temporizador);
    }
  }
}

// ============================================================================
// Factoría
// ============================================================================

/** Conector por defecto mientras no se configure el endpoint real. */
export const verificadorOpinionPorDefecto: VerificadorOpinionSat =
  new VerificadorOpinionNoOp();

/**
 * Devuelve el verificador activo según el entorno.
 *
 * - SAT_OPINION_PROVIDER=HTTP + SAT_OPINION_URL → verificador REAL por HTTP.
 * - En cualquier otro caso → NoOp honesto (no finge confirmaciones del SAT).
 */
export function obtenerVerificadorOpinion(): VerificadorOpinionSat {
  const provider = process.env.SAT_OPINION_PROVIDER?.trim().toUpperCase();
  const url = process.env.SAT_OPINION_URL?.trim();
  if (provider === "HTTP" && url) {
    const apiKey = process.env.SAT_OPINION_API_KEY?.trim();
    const timeoutRaw = process.env.SAT_OPINION_TIMEOUT_MS?.trim();
    const timeoutMs = timeoutRaw && /^\d+$/.test(timeoutRaw) ? Number(timeoutRaw) : undefined;
    return new VerificadorOpinionSatHttp({
      url,
      ...(apiKey ? { apiKey } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    });
  }
  return verificadorOpinionPorDefecto;
}
