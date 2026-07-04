// CERBERUS COMERCIO EXTERIOR — pruebas de la heurística pura del cotejo SAT. NO es SIDF.
// =============================================================================
// Archivo:  tests/cotejo-sat.test.ts  (Incremento 49B)
// Propósito: Verificar veredictoCotejo (body del validador del SAT + RFC +
//            folio → CONFIRMADA / DISCREPANCIA / NO_DISPONIBLE) y el parseo de
//            la URL del validador embebida en cotejoDetalle ("url=…").
// =============================================================================

import { describe, expect, it } from "vitest";
import { urlSatDeDetalle, veredictoCotejo } from "@/lib/cotejo-sat";

const RFC = "ABC680524P76";
const FOLIO = "23NA4324891";

describe("veredictoCotejo", () => {
  it("body con el RFC y marcador 'positivo' → CONFIRMADA", () => {
    const body = `<html><body>Opinión del cumplimiento. RFC: ${RFC}. Sentido: POSITIVO. Vigente.</body></html>`;
    expect(veredictoCotejo(body, RFC, FOLIO)).toBe("CONFIRMADA");
  });

  it("body sin el RFC (ni el folio) del documento → DISCREPANCIA", () => {
    const body = "<html><body>El folio consultado no corresponde a una opinión emitida por el SAT.</body></html>";
    expect(veredictoCotejo(body, RFC, FOLIO)).toBe("DISCREPANCIA");
  });

  it("body vacío → NO_DISPONIBLE (nunca un falso positivo)", () => {
    expect(veredictoCotejo("", RFC, FOLIO)).toBe("NO_DISPONIBLE");
    expect(veredictoCotejo("   \n\t ", RFC, null)).toBe("NO_DISPONIBLE");
  });

  it("es case-insensitive (RFC y marcadores en minúsculas)", () => {
    const body = `rfc del contribuyente: ${RFC.toLowerCase()} — sentido positivo`;
    expect(veredictoCotejo(body, RFC, null)).toBe("CONFIRMADA");
  });

  it("con solo el folio presente también CONFIRMADA", () => {
    const body = `Consulta de opinión — folio ${FOLIO.toLowerCase()} localizado, negativa`;
    expect(veredictoCotejo(body, RFC, FOLIO)).toBe("CONFIRMADA");
  });

  it("aplana etiquetas HTML antes de buscar", () => {
    const body = `<td>R</td>FC: <b>${RFC}</b>`;
    // El RFC dentro de <b> sí se encuentra tras aplanar las etiquetas.
    expect(veredictoCotejo(body, RFC, null)).toBe("CONFIRMADA");
  });
});

describe("urlSatDeDetalle", () => {
  it("extrae la URL del validador con formato parseable url=…", () => {
    const detalle =
      "El SAT confirma la opinión vía QR (coincide RFC). " +
      "[url=https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=23NA4324891_ABC680524P76] " +
      "[evidencia HTTP 200 sha256=abc]";
    expect(urlSatDeDetalle(detalle)).toBe(
      "https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=23NA4324891_ABC680524P76",
    );
  });

  it("rechaza hosts ajenos al SAT y detalles sin URL", () => {
    expect(urlSatDeDetalle("Cotejo… [url=https://evil.example.com/sat.gob.mx/x]")).toBeNull();
    expect(urlSatDeDetalle("Cotejo sin URL")).toBeNull();
    expect(urlSatDeDetalle(null)).toBeNull();
  });
});
