// CERBERUS COMERCIO EXTERIOR — pruebas de descarga del certificado SAT (RCCF). NO es SIDF.
//
// Cubre la construcción de la URL del repositorio (crítica: el troceo de la
// serie) y el comportamiento FAIL-SAFE (red caída, 404, bytes no-certificado →
// null, nunca un certificado inválido). No sale a la red: stubbea fetch.

import { describe, it, expect, vi, afterEach } from "vitest";
import { urlRccf, esSerieSat, descargarCertificadoSat } from "@/lib/cert-sat-rccf";

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
    expect(await descargarCertificadoSat("00001088888800000099")).toBeNull();
  });

  it("null si responde 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    expect(await descargarCertificadoSat("00001088888800000098")).toBeNull();
  });

  it("null si los bytes no son un certificado X.509", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }) as unknown as Response),
    );
    expect(await descargarCertificadoSat("00001088888800000097")).toBeNull();
  });
});
