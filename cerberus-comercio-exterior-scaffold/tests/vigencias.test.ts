// CERBERUS COMERCIO EXTERIOR — pruebas de clasificación de vigencias. NO es SIDF.

import { describe, it, expect } from "vitest";
import { clasificarVigencia, ordenUrgencia } from "@/lib/vigencias";

const AHORA = new Date("2026-07-03T12:00:00.000Z");

describe("clasificarVigencia", () => {
  it("SIN_FECHA cuando no hay vencimiento", () => {
    expect(clasificarVigencia(null, AHORA).estado).toBe("SIN_FECHA");
  });

  it("VENCIDO si la fecha ya pasó", () => {
    const c = clasificarVigencia(new Date("2026-07-01T12:00:00.000Z"), AHORA);
    expect(c.estado).toBe("VENCIDO");
    expect(c.diasRestantes).toBeLessThan(0);
  });

  it("POR_VENCER dentro de la ventana de aviso (30 días)", () => {
    const c = clasificarVigencia(new Date("2026-07-20T12:00:00.000Z"), AHORA);
    expect(c.estado).toBe("POR_VENCER");
    expect(c.diasRestantes).toBe(17);
  });

  it("VIGENTE fuera de la ventana", () => {
    expect(clasificarVigencia(new Date("2026-09-01T12:00:00.000Z"), AHORA).estado).toBe("VIGENTE");
  });

  it("respeta una ventana de aviso personalizada", () => {
    expect(clasificarVigencia(new Date("2026-07-08T12:00:00.000Z"), AHORA, 3).estado).toBe("VIGENTE");
    expect(clasificarVigencia(new Date("2026-07-05T12:00:00.000Z"), AHORA, 3).estado).toBe("POR_VENCER");
  });

  it("ordenUrgencia pone lo más próximo primero y sin-fecha al final", () => {
    const arr = [
      clasificarVigencia(new Date("2026-09-01T12:00:00.000Z"), AHORA),
      clasificarVigencia(null, AHORA),
      clasificarVigencia(new Date("2026-07-01T12:00:00.000Z"), AHORA),
    ].sort((a, b) => ordenUrgencia(a) - ordenUrgencia(b));
    expect(arr[0].estado).toBe("VENCIDO");
    expect(arr[2].estado).toBe("SIN_FECHA");
  });
});
