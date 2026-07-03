// CERBERUS COMERCIO EXTERIOR — pruebas del cálculo de contribuciones. NO es SIDF.

import { describe, it, expect } from "vitest";
import { calcularContribucionesPartida, agregarPedimento } from "@/lib/contribuciones";

describe("calcularContribucionesPartida", () => {
  it("IGI 15%, DTA general (8 al millar), IVA 16%", () => {
    const c = calcularContribucionesPartida({ valorAduana: 100000, tasaIgiPct: 15 });
    expect(c.igi).toBe(15000);
    expect(c.dta).toBe(800); // 0.008 * 100000
    expect(c.ieps).toBe(0);
    expect(c.baseIva).toBe(115800); // 100000 + 15000 + 800
    expect(c.iva).toBe(18528); // 16%
    expect(c.total).toBe(34328); // igi + dta + ieps + iva
  });

  it("con IEPS 8% sobre (valor + IGI)", () => {
    const c = calcularContribucionesPartida({ valorAduana: 100000, tasaIgiPct: 15, tasaIepsPct: 8 });
    expect(c.ieps).toBe(9200); // (100000 + 15000) * 0.08
    expect(c.baseIva).toBe(125000); // 100000+15000+800+9200
    expect(c.iva).toBe(20000);
    expect(c.total).toBe(45000);
  });

  it("fracción exenta (IGI 0%)", () => {
    const c = calcularContribucionesPartida({ valorAduana: 100000, tasaIgiPct: 0 });
    expect(c.igi).toBe(0);
    expect(c.iva).toBe(16128); // (100000 + 800) * 0.16
    expect(c.total).toBe(16928);
  });

  it("DTA con cuota fija sustituye el 8 al millar", () => {
    const c = calcularContribucionesPartida({ valorAduana: 100000, tasaIgiPct: 0, dtaFijo: 500 });
    expect(c.dta).toBe(500);
  });

  it("rechaza valores negativos", () => {
    expect(() => calcularContribucionesPartida({ valorAduana: -1, tasaIgiPct: 10 })).toThrow();
    expect(() => calcularContribucionesPartida({ valorAduana: 100, tasaIgiPct: -5 })).toThrow();
  });
});

describe("agregarPedimento", () => {
  it("suma las contribuciones de las partidas", () => {
    const a = calcularContribucionesPartida({ valorAduana: 100000, tasaIgiPct: 15 });
    const b = calcularContribucionesPartida({ valorAduana: 50000, tasaIgiPct: 0 });
    const t = agregarPedimento([a, b]);
    expect(t.valorAduanaTotal).toBe(150000);
    expect(t.igiTotal).toBe(15000);
    expect(t.dtaTotal).toBe(1200); // 800 + 400
    expect(t.contribucionesTotal).toBe(a.total + b.total);
  });

  it("pedimento vacío = ceros", () => {
    const t = agregarPedimento([]);
    expect(t.contribucionesTotal).toBe(0);
  });
});
