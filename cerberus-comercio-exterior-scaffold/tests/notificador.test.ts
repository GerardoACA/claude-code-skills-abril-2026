// CERBERUS COMERCIO EXTERIOR — pruebas del notificador Telegram. NO es SIDF.

import { describe, it, expect, vi, afterEach } from "vitest";
import { NotificadorTelegram, NotificadorNoOp } from "@/lib/notificador";

afterEach(() => vi.restoreAllMocks());

const tg = new NotificadorTelegram({ token: "123:ABC", chatId: "-100999", timeoutMs: 5000 });

describe("NotificadorTelegram", () => {
  it("ok cuando la Bot API responde 200", async () => {
    const spy = vi.fn((..._args: unknown[]) => Promise.resolve({ ok: true, status: 200 } as unknown as Response));
    vi.stubGlobal("fetch", spy);
    const r = await tg.enviar("hola");
    expect(r.ok).toBe(true);
    expect(r.canal).toBe("TELEGRAM");
    // Verifica que pega al host correcto con el token.
    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
  });

  it("fail-safe: HTTP 400 → ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400 }) as unknown as Response));
    const r = await tg.enviar("x");
    expect(r.ok).toBe(false);
  });

  it("fail-safe: red caída → ok:false, nunca lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const r = await tg.enviar("x");
    expect(r.ok).toBe(false);
    expect(r.canal).toBe("TELEGRAM");
  });
});

describe("NotificadorNoOp", () => {
  it("no envía y lo dice honestamente", async () => {
    const r = await new NotificadorNoOp().enviar("x");
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("TELEGRAM_BOT_TOKEN");
  });
});
