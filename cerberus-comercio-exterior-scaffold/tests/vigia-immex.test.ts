// CERBERUS COMERCIO EXTERIOR — pruebas del vigía IMMEX (lógica pura). NO es SIDF.
// =============================================================================
// Archivo:  tests/vigia-immex.test.ts  (Incremento 61 — Carril D)
// Propósito: Probar la lógica PURA extraíble del barrido IMMEX: el filtro de
//            "historia reciente" para la regla de las 48h (esRecienteParaAlerta)
//            y la composición del texto del aviso (componerTextoAvisoImmex).
//            El barrido en sí (Prisma + RLS) se ejercita en vivo desde el cron.
// =============================================================================

import { describe, it, expect } from "vitest";
import { esRecienteParaAlerta, componerTextoAvisoImmex } from "@/lib/immex/vigia-immex";
import type { AlertaImmex } from "@/lib/immex/tipos";

const AHORA = new Date("2026-07-04T12:00:00.000Z");

describe("esRecienteParaAlerta (filtro de 30 días para la regla 48h)", () => {
  it("acepta un registro de hace unos días", () => {
    expect(esRecienteParaAlerta("2026-07-01T09:00:00.000Z", AHORA)).toBe(true);
  });

  it("acepta el límite exacto de la ventana (30 días)", () => {
    expect(esRecienteParaAlerta("2026-06-04T12:00:00.000Z", AHORA)).toBe(true);
  });

  it("rechaza historia antigua (más de 30 días)", () => {
    expect(esRecienteParaAlerta("2026-06-04T11:59:59.000Z", AHORA)).toBe(false);
    expect(esRecienteParaAlerta("2025-01-15T00:00:00.000Z", AHORA)).toBe(false);
  });

  it("rechaza registros futuros (reloj inconsistente: no se acusa sin base)", () => {
    expect(esRecienteParaAlerta("2026-07-05T00:00:00.000Z", AHORA)).toBe(false);
  });

  it("rechaza fechas inválidas (defensivo)", () => {
    expect(esRecienteParaAlerta("no-es-fecha", AHORA)).toBe(false);
  });

  it("respeta una ventana personalizada", () => {
    expect(esRecienteParaAlerta("2026-07-01T12:00:00.000Z", AHORA, 2)).toBe(false);
    expect(esRecienteParaAlerta("2026-07-03T12:00:00.000Z", AHORA, 2)).toBe(true);
  });
});

describe("componerTextoAvisoImmex", () => {
  const base: AlertaImmex = {
    clienteId: "cli_1",
    tipo: "PLAZO_RETORNO",
    severidad: "MEDIA",
    referencia: "24 47 3801 1234567",
    contexto: "Lámina de acero · saldo pendiente 120",
    venceIso: "2026-07-20T00:00:00.000Z",
    diasRestantes: 16,
  };

  it("compone el patrón <icono> IMMEX <tipo>: <referencia> — <contexto> (<dias>d)", () => {
    expect(componerTextoAvisoImmex(base)).toBe(
      "⏳ IMMEX PLAZO_RETORNO: 24 47 3801 1234567 — Lámina de acero · saldo pendiente 120 (16d)",
    );
  });

  it("usa ⛔ para SALDO_NO_RETORNADO y conserva días negativos", () => {
    const texto = componerTextoAvisoImmex({
      ...base,
      tipo: "SALDO_NO_RETORNADO",
      severidad: "ALTA",
      contexto: "plazo excedido · riesgo de crédito fiscal IVA/IEPS exigible (certificación)",
      diasRestantes: -5,
    });
    expect(texto).toBe(
      "⛔ IMMEX SALDO_NO_RETORNADO: 24 47 3801 1234567 — plazo excedido · riesgo de crédito fiscal IVA/IEPS exigible (certificación) (-5d)",
    );
  });

  it("omite el sufijo de días cuando no aplica (REGLA_48H)", () => {
    const texto = componerTextoAvisoImmex({
      ...base,
      tipo: "REGLA_48H",
      contexto: "registrado 72h después del despacho (límite 48h, Anexo 24)",
      venceIso: null,
      diasRestantes: null,
    });
    expect(texto).toBe(
      "⚠️ IMMEX REGLA_48H: 24 47 3801 1234567 — registrado 72h después del despacho (límite 48h, Anexo 24)",
    );
  });
});
