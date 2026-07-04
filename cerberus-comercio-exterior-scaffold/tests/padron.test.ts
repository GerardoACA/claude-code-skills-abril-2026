// CERBERUS COMERCIO EXTERIOR — pruebas del Padrón de Importadores (Inc 58). NO es SIDF.
//
// Cubre la lógica PURA de src/lib/padron-importadores.ts:
//   - parsearCsvPadron: CSV rfc,estado (tolerante a mayúsculas/espacios/BOM/
//     preámbulo; RFC 12-13 validado; fila inválida → ErrorFilaPadron con línea).
//   - evaluarPadron: ACTIVO → AL_CORRIENTE; SUSPENDIDO → INHABILITADO_PRESUNTO;
//     AUSENTE del listado → ALERTA "verificar manualmente" (C9: alerta, no
//     bloquea); sin listado cargado → NO_DISPONIBLE.

import { describe, it, expect } from "vitest";
import {
  ErrorFilaPadron,
  evaluarPadron,
  normalizarEstadoPadron,
  parsearCsvPadron,
} from "@/lib/padron-importadores";

const INGESTA = { fechaIngesta: "2026-07-01T00:00:00.000Z", filas: 3 };

describe("parsearCsvPadron", () => {
  it("parsea el CSV rfc,estado y normaliza mayúsculas/espacios", () => {
    const csv = "rfc,estado\nabc850101xy2 , activo \nXAXX010101000,Suspendido\n";
    expect(parsearCsvPadron(csv)).toEqual([
      { rfc: "ABC850101XY2", estado: "ACTIVO" },
      { rfc: "XAXX010101000", estado: "SUSPENDIDO" },
    ]);
  });

  it("tolera BOM, encabezado en mayúsculas con espacios y líneas vacías", () => {
    const csv = '﻿ RFC , ESTADO \n"ABC850101XY2","ACTIVO"\n\n';
    expect(parsearCsvPadron(csv)).toEqual([
      { rfc: "ABC850101XY2", estado: "ACTIVO" },
    ]);
  });

  it("tolera preámbulo antes del encabezado", () => {
    const csv =
      "Padrón de Importadores - corte 2026-07-01\n\nrfc,estado\nABC850101XY2,ACTIVO\n";
    expect(parsearCsvPadron(csv)).toHaveLength(1);
  });

  it("RFC inválido → error de fila con el número de línea", () => {
    const csv = "rfc,estado\nABC850101XY2,ACTIVO\nNO-ES-RFC,ACTIVO\n";
    expect(() => parsearCsvPadron(csv)).toThrowError(ErrorFilaPadron);
    expect(() => parsearCsvPadron(csv)).toThrowError(/línea 3/);
    expect(() => parsearCsvPadron(csv)).toThrowError(/RFC inválido/);
  });

  it("estado no reconocido → error de fila", () => {
    const csv = "rfc,estado\nABC850101XY2,CANCELADO\n";
    expect(() => parsearCsvPadron(csv)).toThrowError(ErrorFilaPadron);
    expect(() => parsearCsvPadron(csv)).toThrowError(/estado no reconocido/);
  });

  it("sin encabezado rfc,estado → error (no ErrorFilaPadron)", () => {
    expect(() => parsearCsvPadron("a,b\nABC850101XY2,ACTIVO\n")).toThrowError(
      /sin encabezado/,
    );
  });
});

describe("normalizarEstadoPadron", () => {
  it("normaliza mayúsculas, acentos y espacios", () => {
    expect(normalizarEstadoPadron("  activo ")).toBe("ACTIVO");
    expect(normalizarEstadoPadron("Suspendido")).toBe("SUSPENDIDO");
  });

  it("devuelve null para textos no reconocidos o null", () => {
    expect(normalizarEstadoPadron("CANCELADO")).toBeNull();
    expect(normalizarEstadoPadron(null)).toBeNull();
  });
});

describe("evaluarPadron (mapeo estado → resultado)", () => {
  it("ACTIVO → AL_CORRIENTE con la fecha de la ingesta en el detalle", () => {
    const e = evaluarPadron("ABC850101XY2", { estado: "ACTIVO" }, INGESTA);
    expect(e.resultado).toBe("AL_CORRIENTE");
    expect(e.detalle).toContain("Activo en Padrón de Importadores");
    expect(e.detalle).toContain("ingesta manual del 2026-07-01T00:00:00.000Z");
  });

  it("SUSPENDIDO → INHABILITADO_PRESUNTO con detalle (C9: alerta, no bloqueo)", () => {
    const e = evaluarPadron("ABC850101XY2", { estado: "SUSPENDIDO" }, INGESTA);
    expect(e.resultado).toBe("INHABILITADO_PRESUNTO");
    expect(e.detalle).toContain("SUSPENDIDO");
    expect(e.detalle).toContain("2026-07-01T00:00:00.000Z");
  });

  it("ausente del listado → ALERTA de verificación manual (listado posiblemente parcial)", () => {
    const e = evaluarPadron("ABC850101XY2", null, INGESTA);
    expect(e.resultado).toBe("ALERTA");
    expect(e.detalle).toContain("no localizado en el padrón cargado");
    expect(e.detalle).toContain("verificar manualmente");
    expect(e.detalle).toContain("2026-07-01T00:00:00.000Z");
  });

  it("sin listado cargado → NO_DISPONIBLE con instrucción de ingesta", () => {
    const e = evaluarPadron("ABC850101XY2", null, null);
    expect(e.resultado).toBe("NO_DISPONIBLE");
    expect(e.detalle).toContain("verificación manual");
    expect(e.detalle).toContain("/admin/listados");
  });

  it("hallado con estado no reconocido → ALERTA de revisión humana", () => {
    const e = evaluarPadron("ABC850101XY2", { estado: "EN TRÁMITE" }, INGESTA);
    expect(e.resultado).toBe("ALERTA");
    expect(e.detalle).toContain("estado no reconocido");
  });
});
