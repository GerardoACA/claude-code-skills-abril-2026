// CERBERUS COMERCIO EXTERIOR — pruebas del estado de canales de aviso. NO es SIDF.
// =============================================================================
// Archivo:  tests/estado-canales.test.ts  (Incremento 40)
// Propósito: Verificar evaluarEstadoCanales() como función PURA (sin tocar el
//            process.env real): semáforo de Telegram/EMAIL según presencia de
//            variables, remitente default o propio, y que los detalles JAMÁS
//            filtren el valor de los secretos.
// =============================================================================

import { describe, it, expect } from "vitest";
import { evaluarEstadoCanales } from "@/lib/estado-canales";

describe("evaluarEstadoCanales — Telegram", () => {
  it("con token → configurado; sin chat global menciona envíos por destinatario", () => {
    const e = evaluarEstadoCanales({ telegramToken: "123456:ABC-token-secreto" });
    expect(e.telegram.configurado).toBe(true);
    expect(e.telegram.detalle).toContain("por destinatario");
    expect(e.telegram.detalle).toContain("sin chat global");
  });

  it("con token Y chat id global → configurado y lo menciona", () => {
    const e = evaluarEstadoCanales({ telegramToken: "123456:ABC", telegramChatId: "8797245651" });
    expect(e.telegram.configurado).toBe(true);
    expect(e.telegram.detalle).toContain("chat global");
    expect(e.telegram.detalle).not.toContain("sin chat global");
  });

  it("sin token (undefined o solo espacios) → NO configurado y menciona la variable", () => {
    for (const token of [undefined, "", "   "]) {
      const e = evaluarEstadoCanales({ telegramToken: token });
      expect(e.telegram.configurado).toBe(false);
      expect(e.telegram.detalle).toContain("TELEGRAM_BOT_TOKEN");
      expect(e.telegram.detalle).toContain("NoOp");
    }
  });
});

describe("evaluarEstadoCanales — EMAIL", () => {
  it("con API key y sin EMAIL_FROM → configurado con remitente default", () => {
    const e = evaluarEstadoCanales({ resendApiKey: "re_clave_secreta_999" });
    expect(e.email.configurado).toBe(true);
    expect(e.email.detalle).toContain("CERBERUS <onboarding@resend.dev>");
  });

  it("con EMAIL_FROM propio → lo menciona en lugar del default", () => {
    const e = evaluarEstadoCanales({
      resendApiKey: "re_clave_secreta_999",
      emailFrom: "Avisos <avisos@empresa.mx>",
    });
    expect(e.email.configurado).toBe(true);
    expect(e.email.detalle).toContain("Avisos <avisos@empresa.mx>");
    expect(e.email.detalle).not.toContain("onboarding@resend.dev");
  });

  it("sin API key → NO configurado; el detalle nombra RESEND_API_KEY, NoOp y omitidos", () => {
    const e = evaluarEstadoCanales({ emailFrom: "Avisos <avisos@empresa.mx>" });
    expect(e.email.configurado).toBe(false);
    expect(e.email.detalle).toContain("RESEND_API_KEY");
    expect(e.email.detalle).toContain("NoOp");
    expect(e.email.detalle).toContain("omitidos");
  });
});

describe("evaluarEstadoCanales — los detalles NUNCA filtran secretos", () => {
  it("ni el token de Telegram ni la API key de Resend aparecen en ningún detalle", () => {
    const token = "999888:token-super-secreto-XYZ";
    const apiKey = "re_api_key_super_secreta_ABC";
    const e = evaluarEstadoCanales({
      telegramToken: token,
      telegramChatId: "8797245651",
      resendApiKey: apiKey,
      emailFrom: "Avisos <avisos@empresa.mx>",
    });
    for (const detalle of [e.telegram.detalle, e.email.detalle]) {
      expect(detalle).not.toContain(token);
      expect(detalle).not.toContain(apiKey);
    }
  });
});
