// CERBERUS COMERCIO EXTERIOR — pruebas del cuadre CFDI ↔ Pedimento (Inc 53). NO es SIDF.

import { describe, it, expect } from "vitest";
import {
  cuadrarCfdiPedimento,
  extraerDatosCfdiDePayload,
  normalizarFraccion,
  type DatosCfdiCuadre,
  type DatosPedimentoCuadre,
} from "@/lib/cuadre-cfdi-pedimento";

// Pedimento base: 340,000 MXN a TC 17.00 => 20,000.00 USD en aduana.
function pedimentoBase(): DatosPedimentoCuadre {
  return {
    valorAduanaTotalMxn: 340000,
    tipoCambioUsd: 17,
    fraccionesPartidas: ["84713001"],
  };
}

function cfdiBase(): DatosCfdiCuadre {
  return {
    totalUsd: 20000,
    tipoCambioUsd: 17,
    fracciones: ["84713001"],
  };
}

describe("cuadrarCfdiPedimento", () => {
  it("cuadre exacto => CUADRA sin hallazgos", () => {
    const r = cuadrarCfdiPedimento(cfdiBase(), pedimentoBase());
    expect(r.estado).toBe("CUADRA");
    expect(r.hallazgos).toEqual([]);
  });

  it("diferencia de 1% => CUADRA con hallazgo informativo", () => {
    const cfdi = { ...cfdiBase(), totalUsd: 20200 }; // +1%
    const r = cuadrarCfdiPedimento(cfdi, pedimentoBase());
    expect(r.estado).toBe("CUADRA");
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0]).toContain("Informativo");
    expect(r.hallazgos[0]).toContain("tolerancia");
  });

  it("diferencia de 5% => DISCREPANCIA", () => {
    const cfdi = { ...cfdiBase(), totalUsd: 21000 }; // +5%
    const r = cuadrarCfdiPedimento(cfdi, pedimentoBase());
    expect(r.estado).toBe("DISCREPANCIA");
    expect(r.hallazgos.some((h) => h.includes("fuera de la tolerancia"))).toBe(true);
  });

  it("fracción del CFDI que no está en las partidas => DISCREPANCIA que la menciona", () => {
    const cfdi = { ...cfdiBase(), fracciones: ["90189099"] };
    const r = cuadrarCfdiPedimento(cfdi, pedimentoBase());
    expect(r.estado).toBe("DISCREPANCIA");
    expect(r.hallazgos.some((h) => h.includes("90189099"))).toBe(true);
  });

  it("sin pedimento => NO_COMPARABLE con explicación", () => {
    const r = cuadrarCfdiPedimento(cfdiBase(), null);
    expect(r.estado).toBe("NO_COMPARABLE");
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0]).toContain("no tiene pedimento");
  });

  it('normalización: "8471.30.01" en el CFDI cuadra con "84713001" en la partida', () => {
    const cfdi = { ...cfdiBase(), fracciones: ["8471.30.01"] };
    const r = cuadrarCfdiPedimento(cfdi, pedimentoBase());
    expect(r.estado).toBe("CUADRA");
    expect(r.hallazgos).toEqual([]);
  });

  it("pedimento sin valores => NO_COMPARABLE", () => {
    const ped = { ...pedimentoBase(), valorAduanaTotalMxn: null };
    const r = cuadrarCfdiPedimento(cfdiBase(), ped);
    expect(r.estado).toBe("NO_COMPARABLE");
  });

  it("tipos de cambio distintos => hallazgo informativo sin romper el CUADRA", () => {
    const cfdi = { ...cfdiBase(), tipoCambioUsd: 17.25 };
    const r = cuadrarCfdiPedimento(cfdi, pedimentoBase());
    expect(r.estado).toBe("CUADRA");
    expect(r.hallazgos.some((h) => h.includes("tipo de cambio"))).toBe(true);
  });
});

describe("normalizarFraccion", () => {
  it("quita puntos y valida 8 dígitos", () => {
    expect(normalizarFraccion("8471.30.01")).toBe("84713001");
    expect(normalizarFraccion("84713001")).toBe("84713001");
    expect(normalizarFraccion("8471.30")).toBeNull();
    expect(normalizarFraccion("abc")).toBeNull();
  });
});

describe("extraerDatosCfdiDePayload", () => {
  it("extrae totalUsd, tipoCambioUsd y fracciones del payload canónico", () => {
    const payload = JSON.stringify({
      tipo: "INGRESO",
      complemento: "COMERCIO_EXT_11",
      comercioExterior: {
        tipoOperacion: "2",
        tipoCambioUsd: 17,
        totalUsd: 20000,
        mercancias: [{ fraccionArancelaria: "84713001", valorDolares: 20000 }],
      },
    });
    const d = extraerDatosCfdiDePayload(payload);
    expect(d).not.toBeNull();
    expect(d?.totalUsd).toBe(20000);
    expect(d?.tipoCambioUsd).toBe(17);
    expect(d?.fracciones).toEqual(["84713001"]);
  });

  it("payload ilegible o sin complemento => null (fail-safe)", () => {
    expect(extraerDatosCfdiDePayload("no-es-json")).toBeNull();
    expect(extraerDatosCfdiDePayload(JSON.stringify({ tipo: "INGRESO" }))).toBeNull();
  });
});
