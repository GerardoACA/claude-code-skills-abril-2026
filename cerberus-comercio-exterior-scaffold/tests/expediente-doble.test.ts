// CERBERUS COMERCIO EXTERIOR — pruebas del catálogo del expediente doble. NO es SIDF.
// =============================================================================
// Archivo:  tests/expediente-doble.test.ts  (Incremento 54)
// Propósito: verificar el catálogo del EXPEDIENTE DOBLE 3.1.42 RGCE
//            (src/lib/expediente-doble-catalogo.ts): tipos documentales,
//            etiquetas legibles, type guards y la codificación de la "parte"
//            (AGENTE/EMPRESA) como prefijo del tipo almacenado — el modelo
//            ExpedienteDoble3142 no distingue la parte en el schema.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  TIPOS_DOC_DOBLE_3142,
  TIPO_DOC_DOBLE_ETIQUETA,
  PARTES_EXPEDIENTE_DOBLE,
  PARTE_EXPEDIENTE_ETIQUETA,
  esTipoDocDoble3142,
  esParteExpedienteDoble,
  tipoConParte,
  separarTipoConParte,
} from "@/lib/expediente-doble-catalogo";

describe("TIPOS_DOC_DOBLE_3142 (catálogo)", () => {
  it("contiene exactamente los 7 tipos documentales del baseline", () => {
    expect([...TIPOS_DOC_DOBLE_3142]).toEqual([
      "COPIA_PEDIMENTO",
      "FACTURA",
      "DOCUMENTO_TRANSPORTE",
      "CERTIFICADO_ORIGEN",
      "ACUSE_COVE",
      "CORRESPONDENCIA_CLIENTE",
      "OTRO",
    ]);
  });

  it("hay etiqueta legible (no vacía) para todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_DOBLE_3142) {
      const etiqueta = TIPO_DOC_DOBLE_ETIQUETA[tipo];
      expect(typeof etiqueta).toBe("string");
      expect(etiqueta.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("esTipoDocDoble3142 (type guard)", () => {
  it("acepta todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_DOBLE_3142) {
      expect(esTipoDocDoble3142(tipo)).toBe(true);
    }
  });

  it("rechaza valores fuera del catálogo", () => {
    expect(esTipoDocDoble3142("IDENTIFICACION_OFICIAL")).toBe(false); // es del KYC
    expect(esTipoDocDoble3142("copia_pedimento")).toBe(false);
    expect(esTipoDocDoble3142("")).toBe(false);
    expect(esTipoDocDoble3142("AGENTE:COPIA_PEDIMENTO")).toBe(false); // con prefijo NO es tipo puro
  });
});

describe("partes del expediente doble (AGENTE / EMPRESA)", () => {
  it("son exactamente las dos partes de la regla 3.1.42, con etiqueta legible", () => {
    expect([...PARTES_EXPEDIENTE_DOBLE]).toEqual(["AGENTE", "EMPRESA"]);
    for (const parte of PARTES_EXPEDIENTE_DOBLE) {
      expect(PARTE_EXPEDIENTE_ETIQUETA[parte].trim().length).toBeGreaterThan(0);
    }
  });

  it("esParteExpedienteDoble acepta las partes y rechaza lo demás", () => {
    expect(esParteExpedienteDoble("AGENTE")).toBe(true);
    expect(esParteExpedienteDoble("EMPRESA")).toBe(true);
    expect(esParteExpedienteDoble("agente")).toBe(false);
    expect(esParteExpedienteDoble("CLIENTE")).toBe(false);
    expect(esParteExpedienteDoble("")).toBe(false);
  });
});

describe("tipoConParte / separarTipoConParte (parte como prefijo del tipo)", () => {
  it("compone el tipo almacenado como PARTE:TIPO", () => {
    expect(tipoConParte("AGENTE", "COPIA_PEDIMENTO")).toBe("AGENTE:COPIA_PEDIMENTO");
    expect(tipoConParte("EMPRESA", "FACTURA")).toBe("EMPRESA:FACTURA");
  });

  it("es un roundtrip: separar(componer(parte, tipo)) devuelve lo mismo", () => {
    for (const parte of PARTES_EXPEDIENTE_DOBLE) {
      for (const tipo of TIPOS_DOC_DOBLE_3142) {
        expect(separarTipoConParte(tipoConParte(parte, tipo))).toEqual({ parte, tipo });
      }
    }
  });

  it("es defensivo: devuelve null ante formatos ajenos o corruptos (nunca lanza)", () => {
    expect(separarTipoConParte("COPIA_PEDIMENTO")).toBeNull(); // sin prefijo
    expect(separarTipoConParte("CLIENTE:FACTURA")).toBeNull(); // parte inválida
    expect(separarTipoConParte("AGENTE:PEDIMENTO_X")).toBeNull(); // tipo inválido
    expect(separarTipoConParte(":FACTURA")).toBeNull(); // parte vacía
    expect(separarTipoConParte("AGENTE:")).toBeNull(); // tipo vacío
    expect(separarTipoConParte("")).toBeNull();
    expect(separarTipoConParte("IDENTIFICACION_OFICIAL")).toBeNull(); // doc del KYC
  });
});
