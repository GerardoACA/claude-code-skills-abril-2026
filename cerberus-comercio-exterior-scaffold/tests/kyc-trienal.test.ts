// CERBERUS COMERCIO EXTERIOR — pruebas del ciclo trienal KYC 1.4.14 (Inc 44). NO es SIDF.

import { describe, it, expect } from "vitest";
import { proximaActualizacionKyc, CICLO_ACTUALIZACION_ANIOS_KYC } from "@/lib/kyc-vigencia";
import { clasificarVigencia } from "@/lib/vigencias";

describe("proximaActualizacionKyc", () => {
  it("el ciclo es de 3 años", () => {
    expect(CICLO_ACTUALIZACION_ANIOS_KYC).toBe(3);
  });

  it("sellado 2026-01-15 → próxima actualización 2029-01-15", () => {
    const p = proximaActualizacionKyc(new Date("2026-01-15T12:00:00.000Z"));
    expect(p.toISOString()).toBe("2029-01-15T12:00:00.000Z");
  });

  it("no muta la fecha de sellado recibida", () => {
    const sellado = new Date("2026-01-15T12:00:00.000Z");
    proximaActualizacionKyc(sellado);
    expect(sellado.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("año bisiesto: sellado 2024-02-29 produce una fecha válida en 2027", () => {
    const p = proximaActualizacionKyc(new Date("2024-02-29T12:00:00.000Z"));
    expect(Number.isNaN(p.getTime())).toBe(false);
    expect(p.getUTCFullYear()).toBe(2027);
    // 2027 no es bisiesto: JavaScript desborda al 1 de marzo (fecha válida).
    expect(p.toISOString()).toBe("2027-03-01T12:00:00.000Z");
  });
});

describe("clasificarVigencia con la próxima actualización KYC", () => {
  it("a 30 días de la re-actualización → POR_VENCER", () => {
    const vence = proximaActualizacionKyc(new Date("2026-01-15T12:00:00.000Z")); // 2029-01-15
    const ahora = new Date("2028-12-16T12:00:00.000Z"); // exactamente 30 días antes
    const c = clasificarVigencia(vence, ahora);
    expect(c.estado).toBe("POR_VENCER");
    expect(c.diasRestantes).toBe(30);
  });

  it("lejos de la re-actualización → VIGENTE; después → VENCIDO", () => {
    const vence = proximaActualizacionKyc(new Date("2026-01-15T12:00:00.000Z"));
    expect(clasificarVigencia(vence, new Date("2027-01-15T12:00:00.000Z")).estado).toBe("VIGENTE");
    expect(clasificarVigencia(vence, new Date("2029-02-01T12:00:00.000Z")).estado).toBe("VENCIDO");
  });
});
