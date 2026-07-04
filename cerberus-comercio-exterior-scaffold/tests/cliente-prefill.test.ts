// CERBERUS COMERCIO EXTERIOR — pruebas del mapeo de prefill del alta de cliente. NO es SIDF.
// =============================================================================
// Archivo:  tests/cliente-prefill.test.ts  (Incremento 46)
// Propósito: Probar la lógica PURA de src/lib/prefill-cliente.ts: cómo se
//            mapean los datos extraídos de la CSF (respuesta del route de
//            prefill) a los valores del formulario de alta y qué advertencias
//            se generan cuando el PDF no trajo algún campo. Sin red ni React.
// =============================================================================

import { describe, it, expect } from "vitest";
import { mapearPrefillCliente } from "@/lib/prefill-cliente";
import type { DatosPrefillCliente } from "@/lib/prefill-cliente";

const COMPLETO: DatosPrefillCliente = {
  rfc: "MPP171122QX4",
  razonSocial: "MILLENNIAL PRODUCTIVE PARK SA DE CV",
  domicilio: "AV REFORMA 100, JUAREZ, CP 06600, CUAUHTEMOC, CIUDAD DE MEXICO",
  regimen: "Régimen General de Ley Personas Morales",
  actividad: "Comercio al por mayor de maquinaria",
};

describe("mapearPrefillCliente", () => {
  it("CSF completa: precarga los tres campos del form sin advertencias", () => {
    const r = mapearPrefillCliente(COMPLETO);
    expect(r.valores).toEqual({
      rfc: "MPP171122QX4",
      razonSocial: "MILLENNIAL PRODUCTIVE PARK SA DE CV",
      domicilioOperacionesCE:
        "AV REFORMA 100, JUAREZ, CP 06600, CUAUHTEMOC, CIUDAD DE MEXICO",
    });
    expect(r.precargados).toEqual({
      rfc: true,
      razonSocial: true,
      domicilioOperacionesCE: true,
    });
    expect(r.advertencias).toEqual([]);
  });

  it("campo faltante: valor vacío, no marcado como precargado y con advertencia", () => {
    const r = mapearPrefillCliente({ ...COMPLETO, domicilio: null });
    expect(r.valores.domicilioOperacionesCE).toBe("");
    expect(r.precargados.domicilioOperacionesCE).toBe(false);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain("domicilio");
  });

  it("documento sin nada útil: tres advertencias y todo vacío", () => {
    const r = mapearPrefillCliente({
      rfc: null,
      razonSocial: null,
      domicilio: null,
      regimen: null,
      actividad: null,
    });
    expect(r.valores).toEqual({ rfc: "", razonSocial: "", domicilioOperacionesCE: "" });
    expect(r.precargados).toEqual({
      rfc: false,
      razonSocial: false,
      domicilioOperacionesCE: false,
    });
    expect(r.advertencias).toHaveLength(3);
    expect(r.advertencias[0]).toContain("RFC");
    expect(r.advertencias[1]).toContain("razón social");
  });

  it("régimen y actividad no van al form del alta (se capturan en el KYC)", () => {
    const r = mapearPrefillCliente(COMPLETO);
    // El resultado solo trae los tres campos del alta; sin fugas de otros datos.
    expect(Object.keys(r.valores).sort()).toEqual([
      "domicilioOperacionesCE",
      "razonSocial",
      "rfc",
    ]);
  });
});
