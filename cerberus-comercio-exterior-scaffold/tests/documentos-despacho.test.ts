// CERBERUS COMERCIO EXTERIOR — pruebas del catálogo documental del despacho. NO es SIDF.
// =============================================================================
// Archivo:  tests/documentos-despacho.test.ts  (Incremento 50)
// Propósito: verificar el catálogo de la bóveda documental del expediente
//            probatorio del despacho (src/lib/documentos-despacho-catalogo.ts):
//            catálogo completo con etiquetas legibles y type guard.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  TIPOS_DOC_DESPACHO,
  TIPO_DOC_DESPACHO_ETIQUETA,
  esTipoDocDespacho,
} from "@/lib/documentos-despacho-catalogo";

describe("TIPOS_DOC_DESPACHO (catálogo)", () => {
  it("contiene los 17 tipos documentales del despacho", () => {
    expect(TIPOS_DOC_DESPACHO).toHaveLength(17);
    for (const esperado of [
      "PEDIMENTO",
      "FACTURA_COMERCIAL",
      "CARTA_PORTE_XML",
      "CARTA_PORTE_PDF",
      "DOCUMENTO_TRANSPORTE",
      "COVE_ACUSE",
      "DODA",
      "MANIFESTACION_VALOR",
      "CERTIFICADO_ORIGEN",
      "PERMISO_NOM",
      "ENCARGO_CONFERIDO_ACUSE",
      // Ampliación arts. 36/36-A LA (documentos-pedimento-art-36-36A.md):
      "GARANTIA_PRECIOS_ESTIMADOS",
      "CERTIFICADO_PESO_VOLUMEN",
      "AVISO_CONSOLIDADO",
      "EDOCUMENT_VUCEM",
      "CFDI_COMERCIO_EXTERIOR",
      "OTRO",
    ]) {
      expect(TIPOS_DOC_DESPACHO).toContain(esperado);
    }
  });

  it("no tiene tipos duplicados", () => {
    expect(new Set(TIPOS_DOC_DESPACHO).size).toBe(TIPOS_DOC_DESPACHO.length);
  });
});

describe("TIPO_DOC_DESPACHO_ETIQUETA", () => {
  it("hay etiqueta legible (no vacía) para todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_DESPACHO) {
      const etiqueta = TIPO_DOC_DESPACHO_ETIQUETA[tipo];
      expect(typeof etiqueta).toBe("string");
      expect(etiqueta.trim().length).toBeGreaterThan(0);
    }
  });

  it("las etiquetas clave son las esperadas", () => {
    expect(TIPO_DOC_DESPACHO_ETIQUETA.PEDIMENTO).toBe("Pedimento");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.COVE_ACUSE).toContain("COVE");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.DODA).toContain("DODA");
    // Nuevos tipos 36/36-A: la etiqueta cita el fundamento normativo.
    expect(TIPO_DOC_DESPACHO_ETIQUETA.GARANTIA_PRECIOS_ESTIMADOS).toContain("84-A");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.CERTIFICADO_PESO_VOLUMEN).toContain("36-A");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.AVISO_CONSOLIDADO).toContain("37-A");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.EDOCUMENT_VUCEM).toContain("VUCEM");
    expect(TIPO_DOC_DESPACHO_ETIQUETA.CFDI_COMERCIO_EXTERIOR).toContain("comercio exterior");
  });
});

describe("esTipoDocDespacho (type guard)", () => {
  it("acepta todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_DESPACHO) {
      expect(esTipoDocDespacho(tipo)).toBe(true);
    }
  });

  it("rechaza valores fuera del catálogo", () => {
    expect(esTipoDocDespacho("IDENTIFICACION_OFICIAL")).toBe(false); // es del KYC
    expect(esTipoDocDespacho("pedimento")).toBe(false); // sensible a mayúsculas
    expect(esTipoDocDespacho("")).toBe(false);
    expect(esTipoDocDespacho("FACTURA")).toBe(false);
    expect(esTipoDocDespacho("CARTA_PORTE")).toBe(false);
  });
});
