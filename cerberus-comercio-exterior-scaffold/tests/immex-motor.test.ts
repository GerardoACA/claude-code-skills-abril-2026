// CERBERUS COMERCIO EXTERIOR — pruebas del motor PEPS y saldos IMMEX. NO es SIDF.

import { describe, it, expect } from "vitest";
import { aplicarDescargoPeps, evaluarRegla48h } from "@/lib/immex/motor-peps";
import { derivarSaldos, totalNoRetornado } from "@/lib/immex/derivar-saldos";
import type { MovimientoLite, SaldoDerivado } from "@/lib/immex/tipos";

/** Fábrica de movimientos con defaults razonables. */
function mov(parcial: Partial<MovimientoLite> & { id: string }): MovimientoLite {
  return {
    tipo: "ENTRADA",
    cantidad: 100,
    registradoEn: "2026-01-01T00:00:00Z",
    fechaLimiteRetorno: null,
    pedimentoNumero: null,
    entradaOrigenId: null,
    ...parcial,
  };
}

describe("aplicarDescargoPeps", () => {
  it("consume primero la entrada más antigua (aunque venga desordenada)", () => {
    const movimientos = [
      mov({ id: "e2", registradoEn: "2026-02-01T00:00:00Z", cantidad: 100 }),
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 100 }),
    ];
    const r = aplicarDescargoPeps(movimientos, 50);
    expect(r.consumos).toEqual([{ entradaId: "e1", cantidad: 50 }]);
    expect(r.faltante).toBe(0);
  });

  it("un descargo que abarca 2 entradas reparte bien (agota la 1a, sigue con la 2a)", () => {
    const movimientos = [
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 60 }),
      mov({ id: "e2", registradoEn: "2026-02-01T00:00:00Z", cantidad: 100 }),
    ];
    const r = aplicarDescargoPeps(movimientos, 90);
    expect(r.consumos).toEqual([
      { entradaId: "e1", cantidad: 60 },
      { entradaId: "e2", cantidad: 30 },
    ]);
    expect(r.faltante).toBe(0);
  });

  it("los descargos previos reducen el disponible de su entrada de origen", () => {
    const movimientos = [
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 100 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 70, entradaOrigenId: "e1", registradoEn: "2026-01-10T00:00:00Z" }),
      mov({ id: "e2", registradoEn: "2026-02-01T00:00:00Z", cantidad: 50 }),
    ];
    // e1 solo tiene 30 disponibles; el resto sale de e2.
    const r = aplicarDescargoPeps(movimientos, 40);
    expect(r.consumos).toEqual([
      { entradaId: "e1", cantidad: 30 },
      { entradaId: "e2", cantidad: 10 },
    ]);
    expect(r.faltante).toBe(0);
  });

  it("salta entradas totalmente consumidas por descargos previos", () => {
    const movimientos = [
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 50 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 50, entradaOrigenId: "e1", registradoEn: "2026-01-05T00:00:00Z" }),
      mov({ id: "e2", registradoEn: "2026-02-01T00:00:00Z", cantidad: 80 }),
    ];
    const r = aplicarDescargoPeps(movimientos, 20);
    expect(r.consumos).toEqual([{ entradaId: "e2", cantidad: 20 }]);
    expect(r.faltante).toBe(0);
  });

  it("faltante > 0 cuando el saldo total no alcanza (C9: se reporta, no se rechaza)", () => {
    const movimientos = [
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 30 }),
      mov({ id: "e2", registradoEn: "2026-02-01T00:00:00Z", cantidad: 20 }),
    ];
    const r = aplicarDescargoPeps(movimientos, 80);
    expect(r.consumos).toEqual([
      { entradaId: "e1", cantidad: 30 },
      { entradaId: "e2", cantidad: 20 },
    ]);
    expect(r.faltante).toBe(30);
  });

  it("sin entradas: todo el descargo queda como faltante", () => {
    const r = aplicarDescargoPeps([], 25);
    expect(r.consumos).toEqual([]);
    expect(r.faltante).toBe(25);
  });

  it("ignora descargos previos sin entradaOrigenId y movimientos AJUSTE", () => {
    const movimientos = [
      mov({ id: "e1", registradoEn: "2026-01-01T00:00:00Z", cantidad: 100 }),
      mov({ id: "d0", tipo: "DESCARGO", cantidad: 40, entradaOrigenId: null }),
      mov({ id: "a1", tipo: "AJUSTE", cantidad: 999 }),
    ];
    const r = aplicarDescargoPeps(movimientos, 100);
    expect(r.consumos).toEqual([{ entradaId: "e1", cantidad: 100 }]);
    expect(r.faltante).toBe(0);
  });

  it("un descargo de 0 no genera consumos ni faltante", () => {
    const movimientos = [mov({ id: "e1", cantidad: 10 })];
    const r = aplicarDescargoPeps(movimientos, 0);
    expect(r.consumos).toEqual([]);
    expect(r.faltante).toBe(0);
  });
});

describe("evaluarRegla48h", () => {
  it("47.9 horas NO incumple", () => {
    // 47 h 54 min = 47.9 h exactas.
    const r = evaluarRegla48h("2026-03-01T00:00:00Z", "2026-03-02T23:54:00Z");
    expect(r.horas).toBe(47.9);
    expect(r.incumple).toBe(false);
  });

  it("48 horas exactas NO incumple (el límite es MÁS de 48)", () => {
    const r = evaluarRegla48h("2026-03-01T00:00:00Z", "2026-03-03T00:00:00Z");
    expect(r.horas).toBe(48);
    expect(r.incumple).toBe(false);
  });

  it("48.1 horas SÍ incumple", () => {
    // 48 h 6 min = 48.1 h exactas.
    const r = evaluarRegla48h("2026-03-01T00:00:00Z", "2026-03-03T00:06:00Z");
    expect(r.horas).toBe(48.1);
    expect(r.incumple).toBe(true);
  });

  it("redondea a 1 decimal", () => {
    // 1 h 33 min = 1.55 h → 1.6 (redondeo, no truncado).
    const r = evaluarRegla48h("2026-03-01T00:00:00Z", "2026-03-01T01:33:00Z");
    expect(r.horas).toBe(1.6);
  });

  it("fechas inválidas no acusan incumplimiento (criterio defensivo, C9)", () => {
    expect(evaluarRegla48h("no-es-fecha", "2026-03-01T00:00:00Z")).toEqual({
      horas: 0,
      incumple: false,
    });
    expect(evaluarRegla48h("2026-03-01T00:00:00Z", "")).toEqual({
      horas: 0,
      incumple: false,
    });
  });
});

describe("derivarSaldos", () => {
  it("entrada sin descargos = saldo completo, con datos de la entrada", () => {
    const movimientos = [
      mov({
        id: "e1",
        cantidad: 200,
        pedimentoNumero: "261234567890123",
        descripcion: "Lámina de acero",
        fraccion: "72101101",
        fechaLimiteRetorno: "2026-12-31T00:00:00Z",
      }),
    ];
    expect(derivarSaldos(movimientos)).toEqual([
      {
        fraccion: "72101101",
        descripcion: "Lámina de acero",
        pedimentoImportacion: "261234567890123",
        cantidadImportada: 200,
        cantidadDescargada: 0,
        saldoPendiente: 200,
        fechaLimiteRetorno: "2026-12-31T00:00:00Z",
      },
    ]);
  });

  it("suma descargos parciales por entradaOrigenId", () => {
    const movimientos = [
      mov({ id: "e1", cantidad: 100 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 30, entradaOrigenId: "e1" }),
      mov({ id: "d2", tipo: "DESCARGO", cantidad: 25, entradaOrigenId: "e1" }),
    ];
    const [s] = derivarSaldos(movimientos);
    expect(s.cantidadDescargada).toBe(55);
    expect(s.saldoPendiente).toBe(45);
  });

  it("el saldo nunca es negativo (sobre-descargo)", () => {
    const movimientos = [
      mov({ id: "e1", cantidad: 40 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 60, entradaOrigenId: "e1" }),
    ];
    const [s] = derivarSaldos(movimientos);
    expect(s.cantidadDescargada).toBe(60);
    expect(s.saldoPendiente).toBe(0);
  });

  it("aplica fallbacks '' para descripcion/fraccion/pedimento/fechaLimiteRetorno", () => {
    const [s] = derivarSaldos([mov({ id: "e1", cantidad: 10 })]);
    expect(s.fraccion).toBe("");
    expect(s.descripcion).toBe("");
    expect(s.pedimentoImportacion).toBe("");
    expect(s.fechaLimiteRetorno).toBe("");
  });

  it("default incluirSaldadas=true: incluye entradas ya saldadas", () => {
    const movimientos = [
      mov({ id: "e1", cantidad: 50 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 50, entradaOrigenId: "e1" }),
      mov({ id: "e2", cantidad: 10 }),
    ];
    expect(derivarSaldos(movimientos)).toHaveLength(2);
  });

  it("incluirSaldadas=false excluye SOLO las saldadas con descargo completo", () => {
    const movimientos = [
      mov({ id: "e1", cantidad: 50, pedimentoNumero: "PED-1" }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 50, entradaOrigenId: "e1" }),
      mov({ id: "e2", cantidad: 10, pedimentoNumero: "PED-2" }),
      mov({ id: "d2", tipo: "DESCARGO", cantidad: 4, entradaOrigenId: "e2" }),
    ];
    const saldos = derivarSaldos(movimientos, false);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].pedimentoImportacion).toBe("PED-2");
    expect(saldos[0].saldoPendiente).toBe(6);
  });

  it("los AJUSTE y descargos sin entradaOrigenId no afectan los saldos", () => {
    const movimientos = [
      mov({ id: "e1", cantidad: 30 }),
      mov({ id: "a1", tipo: "AJUSTE", cantidad: 5 }),
      mov({ id: "d1", tipo: "DESCARGO", cantidad: 8, entradaOrigenId: null }),
    ];
    const [s] = derivarSaldos(movimientos);
    expect(s.cantidadDescargada).toBe(0);
    expect(s.saldoPendiente).toBe(30);
  });
});

describe("totalNoRetornado", () => {
  const AHORA = new Date("2026-07-04T12:00:00Z");

  function saldo(parcial: Partial<SaldoDerivado>): SaldoDerivado {
    return {
      fraccion: "",
      descripcion: "",
      pedimentoImportacion: "",
      cantidadImportada: 100,
      cantidadDescargada: 0,
      saldoPendiente: 100,
      fechaLimiteRetorno: "",
      ...parcial,
    };
  }

  it("clasifica vencido (fecha pasada) y por vencer (dentro de 30 días)", () => {
    const vencido = saldo({ pedimentoImportacion: "V", fechaLimiteRetorno: "2026-06-01T00:00:00Z" });
    const porVencer = saldo({ pedimentoImportacion: "P", fechaLimiteRetorno: "2026-07-15T00:00:00Z" });
    const vigente = saldo({ pedimentoImportacion: "OK", fechaLimiteRetorno: "2027-01-01T00:00:00Z" });
    const r = totalNoRetornado([vencido, porVencer, vigente], AHORA);
    expect(r.vencidos).toEqual([vencido]);
    expect(r.porVencer).toEqual([porVencer]);
  });

  it("ignora saldos con pendiente 0 aunque su fecha esté vencida", () => {
    const saldado = saldo({
      saldoPendiente: 0,
      cantidadDescargada: 100,
      fechaLimiteRetorno: "2026-01-01T00:00:00Z",
    });
    const r = totalNoRetornado([saldado], AHORA);
    expect(r.vencidos).toEqual([]);
    expect(r.porVencer).toEqual([]);
  });

  it("sin fecha límite ('') no clasifica en ningún grupo (SIN_FECHA)", () => {
    const sinFecha = saldo({ fechaLimiteRetorno: "" });
    const r = totalNoRetornado([sinFecha], AHORA);
    expect(r.vencidos).toEqual([]);
    expect(r.porVencer).toEqual([]);
  });
});
