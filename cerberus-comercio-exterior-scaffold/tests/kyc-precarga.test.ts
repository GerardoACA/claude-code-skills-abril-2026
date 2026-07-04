// CERBERUS COMERCIO EXTERIOR — pruebas de la precarga del cuestionario KYC. NO es SIDF.
// =============================================================================
// Archivo:  tests/kyc-precarga.test.ts  (Incremento 47)
// Propósito: Verificar que extraerInicialesDeSellado toma SOLO los campos
//            conocidos con el tipo correcto de un payload sellado (JSON ajeno)
//            y es defensiva ante basura.
// =============================================================================

import { describe, it, expect } from "vitest";
import { extraerInicialesDeSellado } from "@/lib/kyc-precarga";

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
