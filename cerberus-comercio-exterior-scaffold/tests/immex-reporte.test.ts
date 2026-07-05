// CERBERUS COMERCIO EXTERIOR — pruebas del reporte mensual de descargos IMMEX. NO es SIDF.
// =============================================================================
// Archivo:  tests/immex-reporte.test.ts  (Incremento 64)
// Propósito: Verifica la lógica PURA de src/lib/immex/reporte-mensual.ts:
//            filtro por mes (UTC, bordes incluidos/excluidos), solo DESCARGO,
//            orden por fecha, periodo "YYYY-MM", CSV con encabezados en
//            español, entrecomillado de valores con coma y línea final de
//            total (incluido el mes vacío → total 0).
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  componerReporteMensual,
  reporteACsv,
  ENCABEZADOS_REPORTE_CSV,
  type MovimientoLiteReporte,
} from "@/lib/immex/reporte-mensual";

/** Fábrica de movimientos con defaults razonables. */
function mov(parcial: Partial<MovimientoLiteReporte>): MovimientoLiteReporte {
  return {
    tipo: "DESCARGO",
    cantidad: 10,
    registradoEn: "2026-03-15T12:00:00Z",
    pedimentoNumero: "263012340001234",
    clavePedimento: "RT",
    entradaOrigenId: "ent-1",
    descripcion: "Lámina de acero",
    fraccion: "72101101",
    unidadMedida: "KG",
    ...parcial,
  };
}

describe("componerReporteMensual", () => {
  it("filtra SOLO los DESCARGO del mes pedido (bordes UTC: día 1 y último día entran; mes anterior/siguiente no)", () => {
    const movimientos: MovimientoLiteReporte[] = [
      // Bordes que SÍ entran (marzo 2026, UTC):
      mov({ registradoEn: "2026-03-01T00:00:00Z", cantidad: 5, pedimentoNumero: "P-DIA1" }),
      mov({ registradoEn: "2026-03-31T23:59:59Z", cantidad: 7, pedimentoNumero: "P-DIA31" }),
      // Bordes que NO entran:
      mov({ registradoEn: "2026-02-28T23:59:59Z", cantidad: 100, pedimentoNumero: "P-FEB" }),
      mov({ registradoEn: "2026-04-01T00:00:00Z", cantidad: 100, pedimentoNumero: "P-ABR" }),
      // Otros tipos NO entran aunque caigan en el mes:
      mov({ tipo: "ENTRADA", registradoEn: "2026-03-10T00:00:00Z", cantidad: 100 }),
      mov({ tipo: "AJUSTE", registradoEn: "2026-03-10T00:00:00Z", cantidad: 100 }),
    ];

    const r = componerReporteMensual(movimientos, 2026, 3);

    expect(r.periodo).toBe("2026-03");
    expect(r.filas).toHaveLength(2);
    expect(r.filas.map((f) => f.pedimentoDescargo)).toEqual(["P-DIA1", "P-DIA31"]);
    expect(r.totalCantidad).toBe(12);
  });

  it("ordena por fecha ascendente aunque los movimientos vengan desordenados", () => {
    const movimientos = [
      mov({ registradoEn: "2026-03-20T00:00:00Z", pedimentoNumero: "P-20" }),
      mov({ registradoEn: "2026-03-05T00:00:00Z", pedimentoNumero: "P-05" }),
      mov({ registradoEn: "2026-03-12T00:00:00Z", pedimentoNumero: "P-12" }),
    ];
    const r = componerReporteMensual(movimientos, 2026, 3);
    expect(r.filas.map((f) => f.fecha)).toEqual(["2026-03-05", "2026-03-12", "2026-03-20"]);
  });

  it("compone las filas con los datos del material (descripción, fracción, unidad) y campos nulos como vacíos", () => {
    const r = componerReporteMensual(
      [mov({ pedimentoNumero: null, clavePedimento: null, entradaOrigenId: null })],
      2026,
      3,
    );
    expect(r.filas[0]).toEqual({
      fecha: "2026-03-15",
      fraccion: "72101101",
      descripcion: "Lámina de acero",
      cantidad: 10,
      unidadMedida: "KG",
      pedimentoDescargo: "",
      clavePedimento: "",
      entradaOrigen: "",
    });
  });

  it("mes sin movimientos → 0 filas, total 0 y periodo bien formado (mes de un dígito con cero a la izquierda)", () => {
    const r = componerReporteMensual([mov({ registradoEn: "2026-03-15T00:00:00Z" })], 2026, 7);
    expect(r.filas).toHaveLength(0);
    expect(r.totalCantidad).toBe(0);
    expect(r.periodo).toBe("2026-07");
  });
});

describe("reporteACsv", () => {
  it("emite los encabezados en español, una línea por fila y la línea final de total", () => {
    const r = componerReporteMensual(
      [
        mov({ registradoEn: "2026-03-01T00:00:00Z", cantidad: 5 }),
        mov({ registradoEn: "2026-03-31T00:00:00Z", cantidad: 7 }),
      ],
      2026,
      3,
    );
    const csv = reporteACsv(r.filas, r.totalCantidad, r.periodo);
    const lineas = csv.trimEnd().split("\n");

    expect(lineas[0]).toBe(
      "Fecha,Fracción,Descripción,Cantidad,Unidad de medida,Pedimento de descargo,Clave de pedimento,Entrada de origen",
    );
    expect(lineas[0]).toBe(ENCABEZADOS_REPORTE_CSV.join(","));
    expect(lineas).toHaveLength(4); // encabezado + 2 filas + total
    expect(lineas[1]).toBe("2026-03-01,72101101,Lámina de acero,5,KG,263012340001234,RT,ent-1");
    expect(lineas[3]).toBe("TOTAL 2026-03,,,12,,,,");
  });

  it("entrecomilla los valores que llevan coma (y escapa comillas dobles)", () => {
    const r = componerReporteMensual(
      [mov({ descripcion: 'Tornillo, acero "inox", 5mm', cantidad: 3 })],
      2026,
      3,
    );
    const csv = reporteACsv(r.filas, r.totalCantidad, r.periodo);
    expect(csv).toContain('"Tornillo, acero ""inox"", 5mm"');
    // La fila sigue teniendo 8 columnas al parsear respetando comillas:
    const fila = csv.split("\n")[1];
    const columnas = fila.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [];
    expect(fila.startsWith("2026-03-15,72101101,")).toBe(true);
    expect(columnas.length).toBeGreaterThanOrEqual(8);
  });

  it("mes sin movimientos → CSV válido con solo encabezado y línea de total en 0", () => {
    const r = componerReporteMensual([], 2026, 1);
    const csv = reporteACsv(r.filas, r.totalCantidad, r.periodo);
    const lineas = csv.trimEnd().split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe(ENCABEZADOS_REPORTE_CSV.join(","));
    expect(lineas[1]).toBe("TOTAL 2026-01,,,0,,,,");
    expect(csv.endsWith("\n")).toBe(true);
  });
});
// =============================================================================
// FIN immex-reporte.test.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
