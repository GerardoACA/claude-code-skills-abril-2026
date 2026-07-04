// CERBERUS COMERCIO EXTERIOR — conector de notificaciones (EMAIL vía Resend). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/notificador-email.ts  (Incremento 37)
// Propósito: Enviar correos del sistema (mensajes de prueba y avisos del VIGÍA)
//            por el canal EMAIL usando la API de Resend. Conector enchufable
//            (patrón notificador.ts): interfaz estable + NoOp por defecto +
//            implementación Resend + factoría por entorno.
//
// CONFIGURACIÓN (variables de entorno):
//   - RESEND_API_KEY : API key de Resend. Sin ella → NoOp honesto.
//   - EMAIL_FROM     : remitente; default "CERBERUS <onboarding@resend.dev>".
//
// SEGURIDAD: el host es FIJO (api.resend.com) y la API key viene del entorno
// (no de entrada del usuario) → sin SSRF. Fail-safe: cualquier error de red/API
// se reporta { ok:false } y NUNCA lanza una excepción.
// =============================================================================

export interface ResultadoEmail {
  ok: boolean;
  detalle: string;
}

export interface EnviadorEmail {
  enviar(destinatario: string, asunto: string, texto: string): Promise<ResultadoEmail>;
}

// Regex simple de email: algo@algo.algo, sin espacios. Suficiente para evitar
// llamadas a la red con direcciones obviamente inválidas (la validación real
// la hace Resend al entregar).
const REGEX_EMAIL_SIMPLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OpcionesResend {
  readonly apiKey: string;
  readonly from: string;
  readonly timeoutMs?: number;
}

/** Envía por la API de Resend (POST /emails). Fail-safe. */
export class EnviadorResend implements EnviadorEmail {
  private readonly opciones: OpcionesResend;
  constructor(opciones: OpcionesResend) {
    this.opciones = opciones;
  }

  async enviar(destinatario: string, asunto: string, texto: string): Promise<ResultadoEmail> {
    if (!REGEX_EMAIL_SIMPLE.test(destinatario)) {
      return { ok: false, detalle: "El destinatario no parece una dirección de correo válida." };
    }
    const controlador = new AbortController();
    const t = setTimeout(() => controlador.abort(), this.opciones.timeoutMs ?? 10000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opciones.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.opciones.from,
          to: [destinatario],
          subject: asunto,
          text: texto,
        }),
        signal: controlador.signal,
      });
      if (!res.ok) {
        return { ok: false, detalle: `Resend respondió HTTP ${res.status}.` };
      }
      return { ok: true, detalle: "Correo enviado por Resend." };
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        detalle: abortado ? "Tiempo de espera agotado al enviar el correo." : "No se pudo contactar a Resend.",
      };
    } finally {
      clearTimeout(t);
    }
  }
}

/** NoOp: no envía; reporta honestamente que el canal no está configurado. */
export class EnviadorEmailNoOp implements EnviadorEmail {
  async enviar(destinatario: string, asunto: string, texto: string): Promise<ResultadoEmail> {
    void destinatario;
    void asunto;
    void texto;
    return { ok: false, detalle: "Canal EMAIL no configurado (falta RESEND_API_KEY)." };
  }
}

/** Devuelve el enviador activo. Resend si hay API key; si no, NoOp. */
export function obtenerEnviadorEmail(): EnviadorEmail {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return new EnviadorEmailNoOp();
  }
  const from = process.env.EMAIL_FROM?.trim() || "CERBERUS <onboarding@resend.dev>";
  return new EnviadorResend({ apiKey, from });
}

/** Azúcar: envía un correo con el enviador activo. CONTRATO estable (Inc 37). */
export async function enviarEmailA(
  destinatario: string,
  asunto: string,
  texto: string,
): Promise<ResultadoEmail> {
  return obtenerEnviadorEmail().enviar(destinatario, asunto, texto);
}
