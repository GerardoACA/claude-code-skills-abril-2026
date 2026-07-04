// CERBERUS COMERCIO EXTERIOR — pruebas del parser de ingesta masiva de partidas (CSV). NO es SIDF.

import { describe, it, expect } from "vitest";
import { parsearCsvPartidas, MAX_FILAS_INGESTA } from "@/lib/ingesta-partidas";

const ENCABEZADO = "fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct";

describe("parsearCsvPartidas", () => {
  it("CSV válido de 3 filas → 3 filas y 0 errores", () => {
    const csv = [
      ENCABEZADO,
      "84713001,Laptop industrial,100000,15,0",
      "85044099,Fuente de poder,25000.50,10,0",
      "22030001,Cerveza de malta,50000,20,26.5",
    ].join("\n");

    const r = parsearCsvPartidas(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toEqual({
      fraccion: "84713001",
      descripcion: "Laptop industrial",
      valorAduana: 100000,
      tasaIgiPct: 15,
      tasaIepsPct: 0,
    });
    expect(r.filas[1].valorAduana).toBe(25000.5);
    expect(r.filas[2].tasaIepsPct).toBe(26.5);
  });

  it("separador ';' funciona (encabezado tolerante a mayúsculas y espacios)", () => {
    const csv = [
      "Fraccion ; DESCRIPCION ; Valor Aduana ; TasaIgiPct ; TasaIepsPct",
      "84713001; Laptop industrial ; 100000 ; 15 ; 0",
    ].join("\n");

    const r = parsearCsvPartidas(csv);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].fraccion).toBe("84713001");
    expect(r.filas[0].descripcion).toBe("Laptop industrial");
    expect(r.filas[0].valorAduana).toBe(100000);
  });

  it("fracción inválida → error con número de línea y las demás filas OK", () => {
    const csv = [
      ENCABEZADO,
      "84713001,Laptop industrial,100000,15,0",
      "ABC123,Mercancía rara,5000,10,0",
      "85044099,Fuente de poder,25000,10,0",
    ].join("\n");

    const r = parsearCsvPartidas(csv);
    expect(r.filas).toHaveLength(2);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("Línea 3");
    expect(r.errores[0]).toContain("fracción inválida");
  });

  it("valor no numérico → error (y valorAduana <= 0 también)", () => {
    const csv = [
      ENCABEZADO,
      "84713001,Laptop industrial,cien mil,15,0",
      "85044099,Fuente de poder,0,10,0",
    ].join("\n");

    const r = parsearCsvPartidas(csv);
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]).toContain("Línea 2");
    expect(r.errores[0]).toContain("valorAduana");
    expect(r.errores[1]).toContain("Línea 3");
  });

  it("encabezado faltante → error claro y ninguna fila", () => {
    const csv = "84713001,Laptop industrial,100000,15,0";

    const r = parsearCsvPartidas(csv);
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("encabezado inválido o faltante");
    expect(r.errores[0]).toContain("fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct");
  });

  it(`más de ${MAX_FILAS_INGESTA} filas → error y ninguna fila`, () => {
    const filas = Array.from(
      { length: MAX_FILAS_INGESTA + 1 },
      (_, i) => `84713001,Fila ${i + 1},1000,5,0`,
    );
    const r = parsearCsvPartidas([ENCABEZADO, ...filas].join("\n"));
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain(`${MAX_FILAS_INGESTA}`);
  });

  it("CSV vacío → error", () => {
    const r = parsearCsvPartidas("   \n \n");
    expect(r.filas).toHaveLength(0);
    expect(r.errores).toHaveLength(1);
  });

  it("líneas en blanco intermedias no cuentan y el número de línea es el original", () => {
    const csv = [ENCABEZADO, "", "84713001,Laptop industrial,100000,15,0", "", "XX,Mala,-5,a,b"].join("\n");
    const r = parsearCsvPartidas(csv);
    expect(r.filas).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain("Línea 5");
  });
});
