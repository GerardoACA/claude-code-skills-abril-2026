// CERBERUS COMERCIO EXTERIOR — pruebas del conector VUCEM y mapeo paso→doc. NO es SIDF.
// =============================================================================
// Archivo:  tests/conector-vucem.test.ts  (Incremento 59)
// Propósito: verificar el conector VUCEM enchufable (src/lib/conector-vucem.ts:
//            NoOp honesto + factoría por env que hoy SIEMPRE degrada a NoOp) y
//            el mapeo puro tipo de paso → tipo documental de la bóveda del
//            despacho (tipoDocumentalDePaso, src/lib/documentos-despacho-catalogo.ts).
// =============================================================================

import { describe, it, expect, afterEach } from "vitest";
import {
  VucemNoOp,
  obtenerConectorVucem,
  vucemPorDefecto,
  DETALLE_VUCEM_NO_CONFIGURADO,
} from "@/lib/conector-vucem";
import { tipoDocumentalDePaso } from "@/lib/documentos-despacho-catalogo";

// -----------------------------------------------------------------------------
// VucemNoOp: responde honestamente que no hay conexión, sin lanzar jamás.
// -----------------------------------------------------------------------------
describe("VucemNoOp", () => {
  const noop = new VucemNoOp();

  it("transmitirMve responde ok:false con detalle honesto", async () => {
    const r = await noop.transmitirMve({
      operacionId: "op-1",
      acuse: "MVE-2026-0001",
      sha256Documento: "a".repeat(64),
    });
    expect(r.ok).toBe(false);
    expect(r.detalle).toBe(DETALLE_VUCEM_NO_CONFIGURADO);
    expect(r.detalle).toContain("transmisión manual");
    expect(r.folio).toBeUndefined();
  });

  it("consultarCove responde ok:false con detalle honesto", async () => {
    const r = await noop.consultarCove({ operacionId: "op-1", acuse: "COVE246800001X1" });
    expect(r.ok).toBe(false);
    expect(r.detalle).toBe(DETALLE_VUCEM_NO_CONFIGURADO);
  });

  it("estado() lo dice claramente", () => {
    expect(noop.estado()).toBe("NO_CONFIGURADO");
  });
});

// -----------------------------------------------------------------------------
// Factoría: sin env → NoOp; con env pero SIN implementación real → también NoOp
// (degradación segura: nunca fingir transmisión).
// -----------------------------------------------------------------------------
describe("obtenerConectorVucem (factoría)", () => {
  afterEach(() => {
    delete process.env.VUCEM_WS_URL;
    delete process.env.VUCEM_USUARIO;
  });

  it("sin variables de entorno devuelve el NoOp por defecto", () => {
    delete process.env.VUCEM_WS_URL;
    delete process.env.VUCEM_USUARIO;
    expect(obtenerConectorVucem()).toBe(vucemPorDefecto);
    expect(obtenerConectorVucem().estado()).toBe("NO_CONFIGURADO");
  });

  it("con VUCEM_WS_URL/VUCEM_USUARIO pero sin implementación real degrada a NoOp", () => {
    process.env.VUCEM_WS_URL = "https://www.ventanillaunica.gob.mx/ws";
    process.env.VUCEM_USUARIO = "agente.aduanal";
    const conector = obtenerConectorVucem();
    expect(conector).toBe(vucemPorDefecto);
  });
});

// -----------------------------------------------------------------------------
// Mapeo puro tipo de paso → tipo documental del catálogo del despacho.
// -----------------------------------------------------------------------------
describe("tipoDocumentalDePaso", () => {
  it("mapea los 5 tipos de paso del despacho", () => {
    expect(tipoDocumentalDePaso("MVE_E2")).toBe("MANIFESTACION_VALOR");
    expect(tipoDocumentalDePaso("COVE")).toBe("COVE_ACUSE");
    expect(tipoDocumentalDePaso("DODA")).toBe("DODA");
    expect(tipoDocumentalDePaso("PAGO")).toBe("OTRO");
    expect(tipoDocumentalDePaso("PREVALIDACION")).toBe("OTRO");
  });

  it("tipo de paso desconocido → OTRO (fail-safe: el acuse se guarda igual)", () => {
    expect(tipoDocumentalDePaso("GLOSA")).toBe("OTRO");
    expect(tipoDocumentalDePaso("")).toBe("OTRO");
    expect(tipoDocumentalDePaso("mve_e2")).toBe("OTRO"); // sensible a mayúsculas
  });
});
