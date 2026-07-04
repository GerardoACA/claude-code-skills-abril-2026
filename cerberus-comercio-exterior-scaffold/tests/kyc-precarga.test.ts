// CERBERUS COMERCIO EXTERIOR — pruebas de la precarga del cuestionario KYC. NO es SIDF.
// =============================================================================
// Archivo:  tests/kyc-precarga.test.ts  (Incrementos 47 y 48B)
// Propósito: Verificar que extraerInicialesDeSellado toma SOLO los campos
//            conocidos con el tipo correcto de un payload sellado (JSON ajeno)
//            y es defensiva ante basura. [Inc 48B] Ídem para
//            extraerInicialesDeDocumento (eventos KYC_DOCUMENTO de la bóveda,
//            incluidos los viejos con payloadRef string plano) y para
//            combinarPrecargas (el sellado gana campo a campo; los documentos
//            solo rellenan huecos).
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  combinarPrecargas,
  extraerInicialesDeDocumento,
  extraerInicialesDeSellado,
  type PrecargaCuestionario,
} from "@/lib/kyc-precarga";

const PAYLOAD_VALIDO = JSON.stringify({
  tenantId: "t1",
  clienteId: "c1",
  datosGenerales: {
    tipoPersona: "MORAL",
    nombreComercial: "Fundación X",
    representanteLegal: "Juan Pérez",
    repLegalTipoIdentificacion: "INE",
    residenciaFiscal: "MEXICO",
    correoContacto: "contacto@fundacion.mx",
    actividadEconomica: "Actividades culturales",
  },
  materialidad: {
    domicilioOperacionesCE: "Av. Siempre Viva 123, Tlalpan",
    tieneContratos: true,
    descripcionContratos: "Contrato marco de servicios",
    numeroEmpleados: "12",
  },
  integridad: { declaraNoEfos: true, nombreDeclarante: "Juan Pérez" },
  capturadoEn: "2026-07-01T12:00:00.000Z",
});

describe("extraerInicialesDeSellado", () => {
  it("extrae datos generales y materialidad de un payload válido", () => {
    const p = extraerInicialesDeSellado(PAYLOAD_VALIDO);
    expect(p).not.toBeNull();
    expect(p?.datosGenerales.nombreComercial).toBe("Fundación X");
    expect(p?.datosGenerales.tipoPersona).toBe("MORAL");
    expect(p?.datosGenerales.repLegalTipoIdentificacion).toBe("INE");
    expect(p?.materialidad.domicilioOperacionesCE).toContain("Tlalpan");
    expect(p?.materialidad.tieneContratos).toBe(true);
    expect(p?.capturadoEn).toBe("2026-07-01T12:00:00.000Z");
  });

  it("NUNCA precarga la integridad (se re-declara cada sellado)", () => {
    const p = extraerInicialesDeSellado(PAYLOAD_VALIDO);
    expect(JSON.stringify(p)).not.toContain("declaraNoEfos");
  });

  it("JSON inválido → null, sin lanzar", () => {
    expect(extraerInicialesDeSellado("esto no es json {")).toBeNull();
  });

  it("JSON sin secciones reconocibles → null", () => {
    expect(extraerInicialesDeSellado(JSON.stringify({ otra: "cosa" }))).toBeNull();
    expect(extraerInicialesDeSellado(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it("ignora tipos incorrectos y enums desconocidos", () => {
    const p = extraerInicialesDeSellado(
      JSON.stringify({
        datosGenerales: {
          tipoPersona: "MARCIANA",
          nombreComercial: 42,
          correoContacto: "ok@x.mx",
          repLegalTipoIdentificacion: "LICENCIA",
        },
        materialidad: { tieneContratos: "sí", numeroEmpleados: "5" },
      }),
    );
    expect(p).not.toBeNull();
    expect(p?.datosGenerales.tipoPersona).toBeUndefined();
    expect(p?.datosGenerales.nombreComercial).toBeUndefined();
    expect(p?.datosGenerales.repLegalTipoIdentificacion).toBeUndefined();
    expect(p?.datosGenerales.correoContacto).toBe("ok@x.mx");
    expect(p?.materialidad.tieneContratos).toBeUndefined();
    expect(p?.materialidad.numeroEmpleados).toBe("5");
  });

  it("cadenas vacías no se precargan", () => {
    const p = extraerInicialesDeSellado(
      JSON.stringify({ datosGenerales: { nombreComercial: "   " }, materialidad: {} }),
    );
    expect(p?.datosGenerales.nombreComercial).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [Inc 48B] Precarga desde eventos KYC_DOCUMENTO de la bóveda.
// ---------------------------------------------------------------------------
const PAYLOAD_DOC = JSON.stringify({
  ref: "kyc-doc",
  documentoId: "d1",
  clienteId: "c1",
  tipo: "CONSTANCIA_SITUACION_FISCAL",
  extraido: {
    rfc: "FUX010101AB1",
    razonSocial: "Fundación X",
    regimen: "General de Ley",
    actividad: "Actividades culturales",
    domicilio: "Av. Siempre Viva 123, Tlalpan",
  },
});

describe("extraerInicialesDeDocumento", () => {
  it("mapea actividad→actividadEconomica, domicilio→domicilioOperacionesCE y razonSocial→nombreComercial", () => {
    const p = extraerInicialesDeDocumento(PAYLOAD_DOC);
    expect(p).not.toBeNull();
    expect(p?.datosGenerales.actividadEconomica).toBe("Actividades culturales");
    expect(p?.materialidad.domicilioOperacionesCE).toContain("Tlalpan");
    expect(p?.datosGenerales.nombreComercial).toBe("Fundación X");
    expect(p?.capturadoEn).toBeNull();
  });

  it("payloadRef viejo string plano (no-JSON) → null, sin lanzar", () => {
    expect(extraerInicialesDeDocumento("kyc-doc:abc")).toBeNull();
  });

  it("extraido null (o ausente) → null", () => {
    expect(
      extraerInicialesDeDocumento(
        JSON.stringify({ ref: "kyc-doc", documentoId: "d1", clienteId: "c1", tipo: "OTRO", extraido: null }),
      ),
    ).toBeNull();
    expect(
      extraerInicialesDeDocumento(
        JSON.stringify({ ref: "kyc-doc", documentoId: "d1", clienteId: "c1", tipo: "OTRO" }),
      ),
    ).toBeNull();
  });
});

describe("combinarPrecargas", () => {
  const sellado: PrecargaCuestionario = {
    datosGenerales: { nombreComercial: "Nombre del sellado" },
    materialidad: { numeroEmpleados: "12" },
    capturadoEn: "2026-07-01T12:00:00.000Z",
  };
  const deDocumentos: PrecargaCuestionario = {
    datosGenerales: {
      nombreComercial: "Nombre del documento",
      actividadEconomica: "Actividades culturales",
    },
    materialidad: { domicilioOperacionesCE: "Av. Siempre Viva 123" },
    capturadoEn: null,
  };

  it("el sellado gana campo a campo y los documentos rellenan huecos", () => {
    const c = combinarPrecargas(sellado, deDocumentos);
    expect(c?.datosGenerales.nombreComercial).toBe("Nombre del sellado"); // sellado gana
    expect(c?.datosGenerales.actividadEconomica).toBe("Actividades culturales"); // hueco relleno
    expect(c?.materialidad.numeroEmpleados).toBe("12");
    expect(c?.materialidad.domicilioOperacionesCE).toBe("Av. Siempre Viva 123"); // hueco relleno
    expect(c?.capturadoEn).toBe("2026-07-01T12:00:00.000Z");
  });

  it("una sola entrada no-null → se devuelve tal cual", () => {
    expect(combinarPrecargas(sellado, null)).toEqual(sellado);
    expect(combinarPrecargas(null, deDocumentos)).toEqual(deDocumentos);
  });

  it("ambos null → null", () => {
    expect(combinarPrecargas(null, null)).toBeNull();
  });
});
