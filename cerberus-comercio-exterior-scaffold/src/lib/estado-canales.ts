// CERBERUS COMERCIO EXTERIOR — estado de los canales de notificación. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/estado-canales.ts  (Incremento 40)
// Propósito: Función PURA que evalúa si los canales de aviso (Telegram/EMAIL)
//            están configurados a partir de las variables de entorno que le
//            pasen (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RESEND_API_KEY,
//            EMAIL_FROM). El panel de notificaciones la usa para mostrarle al
//            administrador un semáforo honesto de cada canal.
//
// SEGURIDAD: los detalles NUNCA incluyen el valor de un secreto (token/API
// key); solo se reporta su PRESENCIA o AUSENCIA por nombre de variable.
// =============================================================================

/** Remitente por defecto del canal EMAIL (mismo default que notificador-email.ts). */
const REMITENTE_DEFAULT = "CERBERUS <onboarding@resend.dev>";

export interface EstadoCanales {
  telegram: { configurado: boolean; detalle: string };
  email: { configurado: boolean; detalle: string };
}

/**
 * Evalúa el estado de los canales SIN leer process.env (función pura, testeable).
 * El llamador (server component) le inyecta las variables de entorno.
 */
export function evaluarEstadoCanales(env: {
  telegramToken?: string | undefined;
  telegramChatId?: string | undefined;
  resendApiKey?: string | undefined;
  emailFrom?: string | undefined;
}): EstadoCanales {
  // --- Telegram: basta el token del bot; el chat id global es opcional -------
  const hayToken = (env.telegramToken ?? "").trim() !== "";
  const hayChatIdGlobal = (env.telegramChatId ?? "").trim() !== "";

  let telegram: EstadoCanales["telegram"];
  if (hayToken) {
    telegram = {
      configurado: true,
      detalle: hayChatIdGlobal
        ? "Bot configurado con chat global (TELEGRAM_CHAT_ID) y envíos por destinatario."
        : "Bot configurado; sin chat global (TELEGRAM_CHAT_ID), solo envíos por destinatario.",
    };
  } else {
    telegram = {
      configurado: false,
      detalle:
        "Falta TELEGRAM_BOT_TOKEN: el canal Telegram queda en NoOp y no se envía ningún aviso por este medio.",
    };
  }

  // --- EMAIL (Resend): requiere la API key; el remitente tiene default -------
  const hayApiKey = (env.resendApiKey ?? "").trim() !== "";
  const remitente = (env.emailFrom ?? "").trim() || REMITENTE_DEFAULT;

  let email: EstadoCanales["email"];
  if (hayApiKey) {
    email = {
      configurado: true,
      detalle: `Resend activo; los correos salen como ${remitente}.`,
    };
  } else {
    email = {
      configurado: false,
      detalle:
        "Falta RESEND_API_KEY: el canal EMAIL queda en NoOp y los destinos EMAIL se cuentan como omitidos.",
    };
  }

  return { telegram, email };
}
