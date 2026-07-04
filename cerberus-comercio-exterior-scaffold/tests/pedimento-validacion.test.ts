// CERBERUS COMERCIO EXTERIOR — pruebas de validaciones del pedimento. NO es SIDF.

import { describe, it, expect } from "vitest";
import {
  esNumeroPedimentoValido,
  normalizarNumeroPedimento,
  esClaveAduanaValida,
} from "@/lib/pedimento-validacion";

describe("normalizarNumeroPedimento", () => {
  it("quita espacios y guiones dejando solo los dígitos", () => {
    expect(normalizarNumeroPedimento("24 3801 5012345")).toBe("2438015012345".padEnd(13, "").slice(0));
    expect(normalizarNumeroPedimento("24-38-3801-5012345")).toBe("243838015012345");
    expect(normalizarNumeroPedimento("  24 38 3801 501 2345  ")).toBe("243838015012345");
  });

  it("deja intacta una cadena que ya es solo dígitos", () => {
    expect(normalizarNumeroPedimento("243838015012345")).toBe("243838015012345");
  });
});

describe("esNumeroPedimentoValido", () => {
  it("acepta 15 dígitos sin separadores", () => {
    expect(esNumeroPedimentoValido("243838015012345")).toBe(true);
  });

  it("acepta 15 dígitos con espacios y/o guiones (se normaliza)", () => {
    expect(esNumeroPedimentoValido("24 38 3801 5012345")).toBe(true);
    expect(esNumeroPedimentoValido("24-38-3801-5012345")).toBe(true);
    expect(esNumeroPedimentoValido("24 38-3801 5012345")).toBe(true);
  });

  it("rechaza 14 dígitos", () => {
    expect(esNumeroPedimentoValido("24383801501234")).toBe(false);
    expect(esNumeroPedimentoValido("24 38 3801 501234")).toBe(false);
  });

  it("rechaza 16 dígitos", () => {
    expect(esNumeroPedimentoValido("2438380150123456")).toBe(false);
    expect(esNumeroPedimentoValido("24 38 3801 50123456")).toBe(false);
  });

  it("rechaza letras u otros caracteres", () => {
    expect(esNumeroPedimentoValido("24A838015012345")).toBe(false);
    expect(esNumeroPedimentoValido("ABCDEFGHIJKLMNO")).toBe(false);
    expect(esNumeroPedimentoValido("24.38.3801.5012345")).toBe(false);
    expect(esNumeroPedimentoValido("")).toBe(false);
  });
});

describe("esClaveAduanaValida", () => {
  it("acepta claves de exactamente 3 dígitos", () => {
    expect(esClaveAduanaValida("240")).toBe(true);
    expect(esClaveAduanaValida("470")).toBe(true);
    expect(esClaveAduanaValida("070")).toBe(true);
  });

  it("rechaza otras longitudes o caracteres no numéricos", () => {
    expect(esClaveAduanaValida("24")).toBe(false);
    expect(esClaveAduanaValida("2400")).toBe(false);
    expect(esClaveAduanaValida("24A")).toBe(false);
    expect(esClaveAduanaValida(" 240")).toBe(false);
    expect(esClaveAduanaValida("240 ")).toBe(false);
    expect(esClaveAduanaValida("")).toBe(false);
  });
});
