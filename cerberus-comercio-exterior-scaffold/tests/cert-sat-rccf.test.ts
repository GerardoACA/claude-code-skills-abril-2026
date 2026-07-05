// CERBERUS COMERCIO EXTERIOR — pruebas de descarga del certificado SAT (RCCF). NO es SIDF.
//
// Cubre la construcción de la URL del repositorio (crítica: el troceo de la
// serie), el comportamiento FAIL-SAFE (red caída, 404, bytes no-certificado →
// null, nunca un certificado inválido) y el Inc 62: REINTENTO (2 intentos) +
// MOTIVO real del fallo (HTTP status / red / timeout + serie + URL) para que
// el detalle del cotejo diga POR QUÉ no se descargó. No sale a la red: stubbea
// fetch; la espera entre intentos se pasa en 0 ms para no dormir de verdad.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  urlRccf,
  esSerieSat,
  descargarCertificadoSat,
  descargarCertificadoSatDetallado,
} from "@/lib/cert-sat-rccf";

afterEach(() => vi.restoreAllMocks());

describe("urlRccf — patrón del repositorio RCCF", () => {
  it("trocea la serie según el patrón documentado", () => {
    expect(urlRccf("00001000000303350259")).toBe(
      "https://rdc.sat.gob.mx/rccf/000010/000003/03/35/02/00001000000303350259.cer",
    );
  });

  it("construye la URL de la serie del acuse de ejemplo (SAT)", () => {
    expect(urlRccf("00001088888800000031")).toBe(
      "https://rdc.sat.gob.mx/rccf/000010/888888/00/00/00/00001088888800000031.cer",
    );
  });

  it("rechaza series que no son 20 dígitos", () => {
    expect(urlRccf("123")).toBeNull();
    expect(urlRccf("0000108888880000003X")).toBeNull();
    expect(esSerieSat("00001088888800000031")).toBe(true);
    expect(esSerieSat("abc")).toBe(false);
  });
});

describe("descargarCertificadoSat — fail-safe", () => {
  it("null si la serie es inválida (no hace fetch)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await descargarCertificadoSat("nope")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("null si la red falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("tls");
    }));
    expect(await descargarCertificadoSat("00001088888800000099", 8000, 0)).toBeNull();
  });

  it("null si responde 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    expect(await descargarCertificadoSat("00001088888800000098", 8000, 0)).toBeNull();
  });

  it("null si los bytes no son un certificado X.509", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }) as unknown as Response),
    );
    expect(await descargarCertificadoSat("00001088888800000097", 8000, 0)).toBeNull();
  });
});

describe("descargarCertificadoSatDetallado — reintento + motivo (Inc 62)", () => {
  it("reintenta UNA vez ante fallo de red y el motivo trae error, serie, URL e intentos", async () => {
    const spy = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", spy);
    const r = await descargarCertificadoSatDetallado("00001088888800000096", 8000, 0);
    expect(spy).toHaveBeenCalledTimes(2); // 2 intentos
    expect(r.certificadoB64).toBeNull();
    expect(r.motivo).toContain("ECONNRESET");
    expect(r.motivo).toContain("00001088888800000096");
    expect(r.motivo).toContain("https://rdc.sat.gob.mx/rccf/");
    expect(r.motivo).toContain("2 intentos");
  });

  it("reporta el HTTP status real cuando el RCCF responde 404 (tras reintentar)", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    vi.stubGlobal("fetch", spy);
    const r = await descargarCertificadoSatDetallado("00001088888800000095", 8000, 0);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.certificadoB64).toBeNull();
    expect(r.motivo).toContain("HTTP 404");
  });

  it("bytes que no son X.509 NO se reintentan (fallo determinista) y el motivo lo dice", async () => {
    const spy = vi.fn(
      async () =>
        ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer }) as unknown as Response,
    );
    vi.stubGlobal("fetch", spy);
    const r = await descargarCertificadoSatDetallado("00001088888800000094", 8000, 0);
    expect(spy).toHaveBeenCalledTimes(1); // sin reintento: el contenido no va a cambiar
    expect(r.certificadoB64).toBeNull();
    expect(r.motivo).toContain("X.509");
  });

  it("si el 1er intento falla por red y el 2º responde, usa la respuesta del 2º", async () => {
    let llamada = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        llamada++;
        if (llamada === 1) throw new Error("EAI_AGAIN");
        return { ok: false, status: 503 } as unknown as Response;
      }),
    );
    const r = await descargarCertificadoSatDetallado("00001088888800000093", 8000, 0);
    expect(llamada).toBe(2);
    expect(r.certificadoB64).toBeNull();
    expect(r.motivo).toContain("HTTP 503"); // el motivo es el del ÚLTIMO intento
  });

  it("serie inválida: motivo claro y sin fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await descargarCertificadoSatDetallado("123", 8000, 0);
    expect(spy).not.toHaveBeenCalled();
    expect(r.certificadoB64).toBeNull();
    expect(r.motivo).toContain("20 dígitos");
  });
});
