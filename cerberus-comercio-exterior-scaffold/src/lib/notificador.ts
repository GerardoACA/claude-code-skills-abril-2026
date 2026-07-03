// CERBERUS COMERCIO EXTERIOR — conector de notificaciones (Telegram). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/notificador.ts  (Incremento 34)
// Propósito: Enviar avisos del VIGÍA (alertas de cumplimiento y vencimientos) a
//            un canal externo. Conector enchufable (patrón TimbradorPac/etc.):
//            interfaz estable + NoOp por defecto + implementación Telegram +
//            factoría por entorno. HOY se implementa Telegram (Bot API); se puede
//            enchufar otro canal (correo, Slack) sin tocar el vigía.
//
// CONFIGURACIÓN (variables de entorno):
//   - TELEGRAM_BOT_TOKEN : token del bot (@BotFather).
//   - TELEGRAM_CHAT_ID   : id del chat/canal/grupo destino.
//   Sin ambas → NoOp honesto (no se finge un envío).
//
// SEGURIDAD: el host es FIJO (api.telegram.org) y el token viene del entorno
// (no de entrada del usuario) → sin SSRF. Fail-safe: cualquier error de red/API
// se reporta { ok:false } y NUNCA aborta el barrido del vigía.
// =============================================================================

export interface ResultadoNotificacion {
  readonly ok: boolean;
  readonly canal: string;
  readonly detalle: string;
}

export interface Notificador {
  readonly id: string;
  enviar(texto: string): Promise<ResultadoNotificacion>;
}

/** NoOp: no envía; reporta honestamente que no está configurado. */
export class NotificadorNoOp implements Notificador {
  readonly id = "NOOP";
  async enviar(texto: string): Promise<ResultadoNotificacion> {
    void texto;
    return {
      ok: false,
      canal: "NINGUNO",
      detalle:
        "Notificador no configurado. Define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID " +
        "para que el vigía avise por Telegram.",
    };
  }
}

export interface OpcionesTelegram {
  readonly token: string;
  readonly chatId: string;
  readonly timeoutMs?: number;
}

/** Envía por la Bot API de Telegram (sendMessage). Fail-safe. */
export class NotificadorTelegram implements Notificador {
  readonly id = "TELEGRAM";
  private readonly opciones: OpcionesTelegram;
  constructor(opciones: OpcionesTelegram) {
    this.opciones = opciones;
  }

  async enviar(texto: string): Promise<ResultadoNotificacion> {
    const url = `https://api.telegram.org/bot${this.opciones.token}/sendMessage`;
    const controlador = new AbortController();
    const t = setTimeout(() => controlador.abort(), this.opciones.timeoutMs ?? 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.opciones.chatId,
          text: texto.slice(0, 4096), // límite de Telegram por mensaje
          disable_web_page_preview: true,
        }),
        signal: controlador.signal,
      });
      if (!res.ok) {
        return { ok: false, canal: "TELEGRAM", detalle: `Telegram respondió HTTP ${res.status}.` };
      }
      return { ok: true, canal: "TELEGRAM", detalle: "Notificación enviada por Telegram." };
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        canal: "TELEGRAM",
        detalle: abortado ? "Tiempo de espera agotado al enviar a Telegram." : "No se pudo contactar a Telegram.",
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export const notificadorPorDefecto: Notificador = new NotificadorNoOp();

/** Devuelve el notificador activo. Telegram si hay token+chat; si no, NoOp. */
export function obtenerNotificador(): Notificador {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (token && chatId) {
    const timeoutRaw = process.env.TELEGRAM_TIMEOUT_MS?.trim();
    const timeoutMs = timeoutRaw && /^\d+$/.test(timeoutRaw) ? Number(timeoutRaw) : undefined;
    return new NotificadorTelegram({ token, chatId, ...(timeoutMs ? { timeoutMs } : {}) });
  }
  return notificadorPorDefecto;
}
