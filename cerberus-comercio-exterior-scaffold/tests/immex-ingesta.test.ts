// CERBERUS COMERCIO EXTERIOR — pruebas del parser de ingesta de movimientos IMMEX (CSV). NO es SIDF.

import { describe, it, expect } from "vitest";
import {
  parsearCsvEntradas,
  parsearCsvDescargos,
  normalizarFechaIso,
  MAX_FILAS_INGESTA_IMMEX,
  ENCABEZADO_ENTRADAS,
  ENCABEZADO_DESCARGOS,
} from "@/lib/immex/ingesta-movimientos";

const ENC_ENTRADAS =
  "fraccion,descripcion,unidadMedida,cantidad,valorAduana,pedimentoNumero," +
  "clavePedimento,fechaLimiteRetorno,despachoConcluidoEn";
const ENC_DESCARGOS = "fraccion,cantidad,pedimentoNumero,clavePedimento,despachoConcluidoEn";

const PEDIMENTO_OK = "241234561234567"; // 15 dígitos

describe("parsearCsvEntradas", () => {
  it("CSV válido de 3 filas → 3 filas y 0 errores", () => {
    const csv = [
      ENC_ENTRADAS,
      `84713001,Laptop industrial,PZA,100,250000,${PEDIMENTO_OK},IN,2026-12-31,2026-06-01`,
      `85044099,Fuente de poder,PZA,50,,${PEDIMENTO_OK},IN,2026-11-30,`,
      `39269099,Carcasa plástica,KG,12.5,8000,${PEDIMENTO_OK},IN,2027-01-15,2026-06-02T10:30:00Z`,
    ].join("\n");

    const r = parsearCsvEntradas(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toEqual({
      fraccion: "84713001",
      descripcion: "Laptop industrial",
      unidadMedida: "PZA",
      cantidad: 100,
      valorAduana: 250000,
      pedimentoNumero: PEDIMENTO_OK,
      clavePedimento: "IN",
      fechaLimiteRetorno: "2026-12-31",
      despachoConcluidoEn: "2026-06-01",
    });
    // valorAduana y despachoConcluidoEn vacíos => ausentes (opcionales).
    expect(r.filas[1].valorAduana).toBeUndefined();
    expect(r.filas[1].despachoConcluidoEn).toBeUndefined();
    expect(r.filas[2].cantidad).toBe(12.5);
  });

  it("separador ';' funciona (encabezado tolerante a mayúsculas y espacios)", () => {
    const csv = [
      "Fraccion ; DESCRIPCION ; Unidad Medida ; Cantidad ; Valor Aduana ; " +
        "Pedimento Numero ; Clave Pedimento ; Fecha Limite Retorno ; Despacho Concluido En",
      `84713001; Laptop industrial ; PZA ; 100 ; 250000 ; ${PEDIMENTO_OK} ; IN ; 2026-12-31 ; `,
    ].join("\n");

    const r = parsearCsvEntradas(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].descripcion).toBe("Laptop industrial");
    expect(r.filas[0].unidadMedida).toBe("PZA");
  });

  it("cantidad negativa (o cero) → error con número de línea; las demás filas pasan", () => {
    const csv = [
      ENC_ENTRADAS,
      `84713001,Laptop industrial,PZA,-5,,${PEDIMENTO_OK},IN,2026-12-31,`,
      `85044099,Fuente de poder,PZA,0,,${PEDIMENTO_OK},IN,2026-12-31,`,
      `39269099,Carcasa plástica,KG,10,,${PEDIMENTO_OK},IN,2026-12-31,`,
    ].join("\n");

    const r = parsearCsvEntradas(csv);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].fraccion).toBe("39269099");
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]).toContain("Línea 2");
    expect(r.errores[0]).toContain("cantidad debe ser numérica y > 0");
    expect(r.errores[1]).toContain("Línea 3");
  });

  it("fecha dd/mm/aaaa se normaliza a ISO; fecha imposible → error", () => {
    const csv = [
      ENC_ENTRADAS,
      `84713001,Laptop industrial,PZA,10,,${PEDIMENTO_OK},IN,31/12/2026,01/06/2026`,
      `85044099,Fuente de poder,PZA,10,,${PEDIMENTO_OK},IN,31/02/2026,`,
    ].join("\n");

    const r = parsearCsvEntradas(csv);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].fechaLimiteRetorno).toBe("2026-12-31");
    expect(r.filas[0].despachoConcluidoEn).toBe("2026-06-01");
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("Línea 3");
    expect(r.errores[0]).toContain("fechaLimiteRetorno");
  });

  it("pedimento que no normaliza a 15 dígitos → ADVERTENCIA pero la fila se acepta", () => {
    const csv = [
      ENC_ENTRADAS,
      `84713001,Laptop industrial,PZA,10,,24-12-3456-1234567,IN,2026-12-31,`,
      `85044099,Fuente de poder,PZA,10,,PED-EXTRANJERO-9,IN,2026-12-31,`,
    ].join("\n");

    const r = parsearCsvEntradas(csv);
    expect(r.filas).toHaveLength(2);
    // Con guiones que sí normalizan a 15 dígitos: sin advertencia y normalizado.
    expect(r.filas[0].pedimentoNumero).toBe("241234561234567");
    // El que no normaliza se acepta tal cual, con advertencia (C9).
    expect(r.filas[1].pedimentoNumero).toBe("PED-EXTRANJERO-9");
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("Línea 3 (advertencia)");
  });

  it(`más de ${MAX_FILAS_INGESTA_IMMEX} filas → error único y 0 filas`, () => {
    const filas = Array.from(
      { length: MAX_FILAS_INGESTA_IMMEX + 1 },
      () => `84713001,Laptop,PZA,1,,${PEDIMENTO_OK},IN,2026-12-31,`,
    );
    const r = parsearCsvEntradas([ENC_ENTRADAS, ...filas].join("\n"));
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain(`máximo por ingesta es ${MAX_FILAS_INGESTA_IMMEX}`);
  });

  it("encabezado faltante o inválido → error claro con el encabezado canónico", () => {
    const r = parsearCsvEntradas(
      `84713001,Laptop industrial,PZA,10,,${PEDIMENTO_OK},IN,2026-12-31,`,
    );
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("encabezado inválido o faltante");
    expect(r.errores[0]).toContain(ENCABEZADO_ENTRADAS);
  });

  it("CSV vacío → error claro", () => {
    const r = parsearCsvEntradas("\n  \n");
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toEqual(["El CSV está vacío: no hay encabezado ni filas."]);
  });
});

describe("parsearCsvDescargos", () => {
  it("CSV válido de 2 filas → 2 filas y 0 errores", () => {
    const csv = [
      ENC_DESCARGOS,
      `84713001,40,${PEDIMENTO_OK},RT,2026-06-15`,
      `85044099,10.25,${PEDIMENTO_OK},RT,`,
    ].join("\n");

    const r = parsearCsvDescargos(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toEqual({
      fraccion: "84713001",
      cantidad: 40,
      pedimentoNumero: PEDIMENTO_OK,
      clavePedimento: "RT",
      despachoConcluidoEn: "2026-06-15",
    });
    expect(r.filas[1].despachoConcluidoEn).toBeUndefined();
  });

  it("separador ';' y fecha dd/mm/aaaa también funcionan en descargos", () => {
    const csv = [
      "FRACCION; CANTIDAD; PedimentoNumero; ClavePedimento; DespachoConcluidoEn",
      `84713001; 40; ${PEDIMENTO_OK}; RT; 15/06/2026`,
    ].join("\n");

    const r = parsearCsvDescargos(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].despachoConcluidoEn).toBe("2026-06-15");
  });

  it("cantidad no numérica o <= 0 → error de línea; fracción inválida también", () => {
    const csv = [
      ENC_DESCARGOS,
      `84713001,abc,${PEDIMENTO_OK},RT,`,
      `ABC123,10,${PEDIMENTO_OK},RT,`,
      `85044099,5,${PEDIMENTO_OK},RT,`,
    ].join("\n");

    const r = parsearCsvDescargos(csv);
    expect(r.filas).toHaveLength(1);
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]).toContain("Línea 2");
    expect(r.errores[0]).toContain("cantidad");
    expect(r.errores[1]).toContain("Línea 3");
    expect(r.errores[1]).toContain("fracción inválida");
  });

  it("encabezado de ENTRADAS en el CSV de descargos → error claro", () => {
    const r = parsearCsvDescargos([ENC_ENTRADAS, `84713001,40,${PEDIMENTO_OK},RT,`].join("\n"));
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain(ENCABEZADO_DESCARGOS);
  });

  it("columnas de más/de menos en una fila → error con número de línea", () => {
    const csv = [ENC_DESCARGOS, `84713001,40,${PEDIMENTO_OK},RT`, `84713001,40,${PEDIMENTO_OK},RT,,extra`].join("\n");
    const r = parsearCsvDescargos(csv);
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]).toContain("Línea 2");
    expect(r.errores[1]).toContain("Línea 3");
  });
});

describe("normalizarFechaIso", () => {
  it("acepta ISO con hora, convierte dd/mm/aaaa y rechaza basura", () => {
    expect(normalizarFechaIso("2026-06-01")).toBe("2026-06-01");
    expect(normalizarFechaIso("2026-06-01T10:30:00Z")).toBe("2026-06-01T10:30:00Z");
    expect(normalizarFechaIso("01/06/2026")).toBe("2026-06-01");
    expect(normalizarFechaIso("31/02/2026")).toBeNull();
    expect(normalizarFechaIso("mañana")).toBeNull();
    expect(normalizarFechaIso("2026-13-01")).toBeNull();
  });
});
