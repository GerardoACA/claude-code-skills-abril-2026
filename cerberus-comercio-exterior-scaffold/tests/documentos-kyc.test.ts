// CERBERUS COMERCIO EXTERIOR — pruebas del catálogo documental KYC. NO es SIDF.
// =============================================================================
// Archivo:  tests/documentos-kyc.test.ts  (Incrementos 43 y 52)
// Propósito: verificar el catálogo de la bóveda documental del expediente KYC
//            1.4.14 (src/lib/documentos-kyc-catalogo.ts): documentos requeridos
//            por tipo de persona, type guard y etiquetas legibles. Incremento 52:
//            comprobante del domicilio de operaciones de comercio exterior
//            obligatorio (RGCE 1.4.14, 1ª Modif. 2026, DOF 14-may-2026).
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  TIPOS_DOC_KYC,
  TIPO_DOC_KYC_ETIQUETA,
  documentosRequeridos,
  esTipoDocKyc,
} from "@/lib/documentos-kyc-catalogo";

describe("documentosRequeridos", () => {
  it("persona FÍSICA: exige identificación, comprobante de domicilio fiscal y RFC/CSF", () => {
    const req = documentosRequeridos("FISICA");
    expect(req).toContain("IDENTIFICACION_OFICIAL");
    expect(req).toContain("COMPROBANTE_DOMICILIO");
    expect(req).toContain("RFC_CSF");
  });

  it("persona FÍSICA: NO exige acta constitutiva ni poder del representante", () => {
    const req = documentosRequeridos("FISICA");
    expect(req).not.toContain("ACTA_CONSTITUTIVA");
    expect(req).not.toContain("PODER_REPRESENTANTE");
    expect(req).toHaveLength(4);
  });

  it("persona MORAL: exige además acta constitutiva y poder del representante", () => {
    const req = documentosRequeridos("MORAL");
    expect(req).toContain("ACTA_CONSTITUTIVA");
    expect(req).toContain("PODER_REPRESENTANTE");
    // Y conserva los de base.
    expect(req).toContain("IDENTIFICACION_OFICIAL");
    expect(req).toContain("COMPROBANTE_DOMICILIO");
    expect(req).toContain("RFC_CSF");
    expect(req).toHaveLength(6);
  });

  it("Incremento 52: el comprobante de domicilio de operaciones de comercio exterior es OBLIGATORIO para FÍSICA y MORAL (RGCE 1.4.14, 1ª Modif. 2026)", () => {
    for (const tp of ["FISICA", "MORAL"] as const) {
      expect(documentosRequeridos(tp)).toContain(
        "COMPROBANTE_DOMICILIO_OPERACIONES_CE"
      );
    }
  });

  it("todo requerido pertenece al catálogo (nunca inventa tipos)", () => {
    for (const tp of ["FISICA", "MORAL"] as const) {
      for (const tipo of documentosRequeridos(tp)) {
        expect(TIPOS_DOC_KYC).toContain(tipo);
      }
    }
  });
});

describe("esTipoDocKyc (type guard)", () => {
  it("acepta todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_KYC) {
      expect(esTipoDocKyc(tipo)).toBe(true);
    }
  });

  it("Incremento 52: acepta el nuevo tipo COMPROBANTE_DOMICILIO_OPERACIONES_CE", () => {
    expect(esTipoDocKyc("COMPROBANTE_DOMICILIO_OPERACIONES_CE")).toBe(true);
    expect(TIPOS_DOC_KYC).toContain("COMPROBANTE_DOMICILIO_OPERACIONES_CE");
  });

  it("rechaza valores fuera del catálogo", () => {
    expect(esTipoDocKyc("FACTURA")).toBe(false);
    expect(esTipoDocKyc("identificacion_oficial")).toBe(false);
    expect(esTipoDocKyc("")).toBe(false);
    expect(esTipoDocKyc("CUESTIONARIO_KYC_1414")).toBe(false);
  });
});

describe("TIPO_DOC_KYC_ETIQUETA", () => {
  it("hay etiqueta legible (no vacía) para todos los tipos del catálogo", () => {
    for (const tipo of TIPOS_DOC_KYC) {
      const etiqueta = TIPO_DOC_KYC_ETIQUETA[tipo];
      expect(typeof etiqueta).toBe("string");
      expect(etiqueta.trim().length).toBeGreaterThan(0);
    }
  });

  it("Incremento 52: etiquetas de los comprobantes de domicilio (fiscal vs. operaciones CE)", () => {
    expect(TIPO_DOC_KYC_ETIQUETA.COMPROBANTE_DOMICILIO).toBe(
      "Comprobante de domicilio fiscal"
    );
    expect(TIPO_DOC_KYC_ETIQUETA.COMPROBANTE_DOMICILIO_OPERACIONES_CE).toBe(
      "Comprobante de domicilio de operaciones de comercio exterior (RGCE 1.4.14, 1ª Modif. 2026)"
    );
  });
});
