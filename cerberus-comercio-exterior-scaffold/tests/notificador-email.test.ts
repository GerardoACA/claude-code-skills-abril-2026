// CERBERUS COMERCIO EXTERIOR — pruebas del enviador de EMAIL (Resend). NO es SIDF.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EnviadorResend,
  EnviadorEmailNoOp,
  obtenerEnviadorEmail,
  enviarEmailA,
} from "@/lib/notificador-email";

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ENV_ORIGINAL };
});

describe("obtenerEnviadorEmail / enviarEmailA sin configurar", () => {
  it("sin RESEND_API_KEY → NoOp honesto (ok:false, sin red)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(obtenerEnviadorEmail()).toBeInstanceOf(EnviadorEmailNoOp);
    const r = await enviarEmailA("ceo@empresa.com", "asunto", "texto");
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("RESEND_API_KEY");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("EnviadorResend", () => {
  it("ok cuando la API responde 200; URL/headers/body correctos", async () => {
    process.env.RESEND_API_KEY = "re_prueba_123";
    const spy = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ ok: true, status: 200 } as unknown as Response),
    );
    vi.stubGlobal("fetch", spy);

    const r = await enviarEmailA("cfo@empresa.com", "CERBERUS · Prueba", "hola");
    expect(r.ok).toBe(true);

    // Host FIJO (anti-SSRF).
    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toBe("https://api.resend.com/emails");

    const init = spy.mock.calls[0]?.[1] as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_prueba_123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const cuerpo = JSON.parse(init.body) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(cuerpo.from).toBe("CERBERUS <onboarding@resend.dev>"); // default sin EMAIL_FROM
    expect(cuerpo.to).toEqual(["cfo@empresa.com"]);
    expect(cuerpo.subject).toBe("CERBERUS · Prueba");
    expect(cuerpo.text).toBe("hola");
  });

  it("fail-safe: HTTP 401 → ok:false", async () => {
    process.env.RESEND_API_KEY = "re_invalida";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response));
    const r = await enviarEmailA("ceo@empresa.com", "asunto", "texto");
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("401");
  });

  it("fail-safe: red caída → ok:false, nunca lanza", async () => {
    process.env.RESEND_API_KEY = "re_prueba_123";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const r = await enviarEmailA("ceo@empresa.com", "asunto", "texto");
    expect(r.ok).toBe(false);
  });

  it("destinatario sin formato de email → ok:false SIN llamar a la red", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const enviador = new EnviadorResend({ apiKey: "re_prueba_123", from: "CERBERUS <a@b.co>" });
    const r = await enviador.enviar("esto-no-es-un-email", "asunto", "texto");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
