// CERBERUS COMERCIO EXTERIOR — pruebas del prevalidador interno del pedimento. NO es SIDF.
// =============================================================================
// Archivo:  tests/prevalidador.test.ts  (Incremento 63)
// Propósito: Probar el motor PURO src/lib/prevalidador.ts: criterios SINTÁCTICO,
//            CATALÓGICO, ESTRUCTURAL (cuadre con tolerancia ±1 peso) y
//            NORMATIVO (encargo B14/B21, opinión 32-D). C9: las ADVERTENCIAs
//            no reprueban; solo los ERRORes.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  prevalidarPedimento,
  TOLERANCIA_CUADRE_MXN,
  type DatosPrevalidacion,
} from "@/lib/prevalidador";
import {
  calcularContribucionesPartida,
  agregarPedimento,
} from "@/lib/contribuciones";

// -----------------------------------------------------------------------------
// Fixture: pedimento completo y VÁLIDO cuyos totales cuadran exactamente con
// las partidas (recalculados con el mismo motor de contribuciones).
// -----------------------------------------------------------------------------

/** Partida válida: fracción TIGIE de 8 dígitos, valor 10,000 MXN, IGI 15%. */
const PARTIDA_VALIDA = {
  valorAduana: 10000,
  tasaIgiPct: 15,
} as const;

function datosValidos(): DatosPrevalidacion {
  const contrib = calcularContribucionesPartida(PARTIDA_VALIDA);
  const totales = agregarPedimento([contrib]);
  return {
    pedimento: {
      numero: "240147000123456", // 15 dígitos
      aduana: "470", // 3 dígitos (Veracruz)
      claveDePedimento: "A1",
      regimen: "IMPORTACION DEFINITIVA",
      tipoCambioUsd: 17.5,
      valorAduanaTotal: totales.valorAduanaTotal,
      igiTotal: totales.igiTotal,
      dtaTotal: totales.dtaTotal,
      iepsTotal: totales.iepsTotal,
      ivaTotal: totales.ivaTotal,
      contribucionesTotal: totales.contribucionesTotal,
    },
    partidas: [
      {
        fraccionDeclarada: "84713001", // 8 dígitos TIGIE
        valorDeclarado: 10000,
        valorAduana: contrib.valorAduana,
        tasaIgiPct: PARTIDA_VALIDA.tasaIgiPct,
        tasaIepsPct: 0,
        igiImporte: contrib.igi,
        dtaImporte: contrib.dta,
        iepsImporte: contrib.ieps,
        ivaImporte: contrib.iva,
      },
    ],
    cliente: { rfc: "CCE010101AB9" }, // 12 alfanuméricos (persona moral)
    encargoVigente: true,
    opinionPositivaReciente: true,
  };
}

describe("prevalidarPedimento — pedimento válido", () => {
  it("pedimento completo válido: aprobado y SIN hallazgos", () => {
    const r = prevalidarPedimento(datosValidos());
    expect(r.hallazgos).toEqual([]);
    expect(r.aprobado).toBe(true);
  });
});

describe("criterio SINTÁCTICO", () => {
  it("número de pedimento de 14 dígitos: ERROR SIN-001 y reprobado", () => {
    const d = datosValidos();
    d.pedimento.numero = "24014700012345"; // 14 dígitos
    const r = prevalidarPedimento(d);
    const sin = r.hallazgos.find((h) => h.codigo === "SIN-001");
    expect(sin).toBeDefined();
    expect(sin?.criterio).toBe("SINTACTICO");
    expect(sin?.severidad).toBe("ERROR");
    expect(r.aprobado).toBe(false);
  });

  it("número null (aún sin asignar): no genera hallazgo sintáctico", () => {
    const d = datosValidos();
    d.pedimento.numero = null;
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.filter((h) => h.codigo === "SIN-001")).toEqual([]);
    expect(r.aprobado).toBe(true);
  });

  it("aduana de 2 dígitos: ERROR SIN-002", () => {
    const d = datosValidos();
    d.pedimento.aduana = "47";
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "SIN-002" && h.severidad === "ERROR")).toBe(true);
    expect(r.aprobado).toBe(false);
  });

  it("RFC con formato inválido (11 caracteres): ERROR SIN-003", () => {
    const d = datosValidos();
    d.cliente.rfc = "CCE010101AB"; // 11 chars
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "SIN-003" && h.severidad === "ERROR")).toBe(true);
    expect(r.aprobado).toBe(false);
  });

  it("RFC de persona física (13 alfanuméricos) es válido", () => {
    const d = datosValidos();
    d.cliente.rfc = "GACG800101AB1";
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.filter((h) => h.codigo === "SIN-003")).toEqual([]);
  });

  it("tipo de cambio 0: ERROR SIN-004", () => {
    const d = datosValidos();
    d.pedimento.tipoCambioUsd = 0;
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "SIN-004" && h.severidad === "ERROR")).toBe(true);
    expect(r.aprobado).toBe(false);
  });
});

describe("criterio CATALÓGICO", () => {
  it("fracción inválida (7 dígitos): ERROR CAT-001 con criterio CATALOGICO", () => {
    const d = datosValidos();
    d.partidas[0].fraccionDeclarada = "8471300"; // 7 dígitos
    const r = prevalidarPedimento(d);
    const cat = r.hallazgos.find((h) => h.codigo === "CAT-001");
    expect(cat).toBeDefined();
    expect(cat?.criterio).toBe("CATALOGICO");
    expect(cat?.severidad).toBe("ERROR");
    expect(cat?.mensaje).toContain("partida 1");
    expect(r.aprobado).toBe(false);
  });

  it("clave de pedimento vacía: ERROR CAT-002", () => {
    const d = datosValidos();
    d.pedimento.claveDePedimento = "";
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "CAT-002" && h.severidad === "ERROR")).toBe(true);
    expect(r.aprobado).toBe(false);
  });

  it("clave de pedimento de 3 caracteres: ERROR CAT-002", () => {
    const d = datosValidos();
    d.pedimento.claveDePedimento = "A1X";
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "CAT-002")).toBe(true);
  });
});

describe("criterio ESTRUCTURAL", () => {
  it("IGI total que no cuadra (descuadre de $5): ERROR estructural", () => {
    const d = datosValidos();
    d.pedimento.igiTotal += 5;
    const r = prevalidarPedimento(d);
    const est = r.hallazgos.find(
      (h) => h.criterio === "ESTRUCTURAL" && h.severidad === "ERROR",
    );
    expect(est).toBeDefined();
    expect(est?.codigo).toBe("EST-005");
    expect(r.aprobado).toBe(false);
  });

  it("descuadre de $0.50 (redondeo): SIN hallazgo — dentro de la tolerancia ±1 peso", () => {
    const d = datosValidos();
    d.pedimento.igiTotal += 0.5;
    d.pedimento.ivaTotal -= 0.5;
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.filter((h) => h.criterio === "ESTRUCTURAL")).toEqual([]);
    expect(r.aprobado).toBe(true);
    expect(TOLERANCIA_CUADRE_MXN).toBe(1);
  });

  it("valor en aduana total descuadrado: ERROR EST-004", () => {
    const d = datosValidos();
    d.pedimento.valorAduanaTotal += 100;
    const r = prevalidarPedimento(d);
    expect(r.hallazgos.some((h) => h.codigo === "EST-004" && h.severidad === "ERROR")).toBe(true);
  });

  it("sin partidas: ERROR EST-001", () => {
    const d = datosValidos();
    d.partidas = [];
    const r = prevalidarPedimento(d);
    const est = r.hallazgos.find((h) => h.codigo === "EST-001");
    expect(est).toBeDefined();
    expect(est?.criterio).toBe("ESTRUCTURAL");
    expect(est?.severidad).toBe("ERROR");
    expect(r.aprobado).toBe(false);
  });

  it("partida sin valoración: ADVERTENCIA EST-002 (no se puede verificar el cuadre)", () => {
    const d = datosValidos();
    d.partidas[0].valorAduana = null;
    const r = prevalidarPedimento(d);
    const est = r.hallazgos.find((h) => h.codigo === "EST-002");
    expect(est).toBeDefined();
    expect(est?.severidad).toBe("ADVERTENCIA");
    expect(r.aprobado).toBe(true); // advertencia no reprueba (C9)
  });
});

describe("criterio NORMATIVO", () => {
  it("sin encargo conferido vigente: ERROR NOR-001 (B14/B21)", () => {
    const d = datosValidos();
    d.encargoVigente = false;
    const r = prevalidarPedimento(d);
    const nor = r.hallazgos.find((h) => h.codigo === "NOR-001");
    expect(nor).toBeDefined();
    expect(nor?.criterio).toBe("NORMATIVO");
    expect(nor?.severidad).toBe("ERROR");
    expect(nor?.mensaje).toContain("B14/B21");
    expect(r.aprobado).toBe(false);
  });

  it("sin opinión 32-D positiva reciente: ADVERTENCIA NOR-002 y aprobado sigue true", () => {
    const d = datosValidos();
    d.opinionPositivaReciente = false;
    const r = prevalidarPedimento(d);
    const nor = r.hallazgos.find((h) => h.codigo === "NOR-002");
    expect(nor).toBeDefined();
    expect(nor?.criterio).toBe("NORMATIVO");
    expect(nor?.severidad).toBe("ADVERTENCIA");
    expect(r.aprobado).toBe(true); // C9: la advertencia informa, no reprueba
  });
});

describe("acumulación de hallazgos", () => {
  it("varios problemas a la vez: se reportan todos y aprobado=false", () => {
    const d = datosValidos();
    d.pedimento.numero = "123"; // SIN-001
    d.partidas[0].fraccionDeclarada = "abc"; // CAT-001
    d.encargoVigente = false; // NOR-001
    d.opinionPositivaReciente = false; // NOR-002 (advertencia)
    const r = prevalidarPedimento(d);
    const codigos = r.hallazgos.map((h) => h.codigo);
    expect(codigos).toContain("SIN-001");
    expect(codigos).toContain("CAT-001");
    expect(codigos).toContain("NOR-001");
    expect(codigos).toContain("NOR-002");
    expect(r.aprobado).toBe(false);
  });
});
