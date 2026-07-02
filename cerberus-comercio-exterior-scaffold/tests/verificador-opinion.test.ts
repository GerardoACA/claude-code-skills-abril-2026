// CERBERUS COMERCIO EXTERIOR — pruebas del verificador de opinión 32-D. NO es SIDF.
//
// Prueban tanto el análisis de autenticidad del texto (validador-opinion) como el
// verificador HTTP REAL de cotejo en vivo (verificador-opinion-sat), stubbeando
// `fetch` para no salir a la red. Confirman que el conector "echa a andar":
// CONFIRMADA / DISCREPANCIA / NO_DISPONIBLE según la respuesta del gateway.

import { describe, it, expect, vi, afterEach } from "vitest";

import { analizarOpinion } from "@/lib/validador-opinion";
import { VerificadorOpinionSatHttp } from "@/lib/verificador-opinion-sat";

const RFC = "ABC101010AB1";

function opinionSat(sentido: string, folio = "OPC1234567"): string {
  return [
    "Servicio de Administración Tributaria",
    "Opinión del cumplimiento de obligaciones fiscales (artículo 32-D del Código Fiscal de la Federación)",
    `RFC: ${RFC}`,
    `Folio: ${folio}`,
    `Sentido de la opinión: ${sentido}`,
    "Fecha: 01/07/2026",
  ].join("\n");
}

function respuesta(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analizarOpinion (autenticidad del texto)", () => {
  it("marca AUTENTICA una opinión con marcadores, folio, RFC y sentido", () => {
    const a = analizarOpinion(opinionSat("Positivo"), RFC);
    expect(a.resultado).toBe("AUTENTICA");
    expect(a.folio).toBe("OPC1234567");
    expect(a.sentido).toBe("POSITIVA");
    expect(a.rfcDocumento).toBe(RFC);
  });

  it("marca NO_AUTENTICA cuando el RFC no coincide", () => {
    const a = analizarOpinion(opinionSat("Positivo").replace(RFC, "XXX999999ZZ9"), RFC);
    expect(a.resultado).toBe("NO_AUTENTICA");
  });

  it("marca NO_AUTENTICA cuando faltan los marcadores del SAT", () => {
    const a = analizarOpinion(`Documento cualquiera Folio: X123456 RFC ${RFC} Positivo`, RFC);
    expect(a.resultado).toBe("NO_AUTENTICA");
  });

  it("marca SOSPECHOSA cuando falta el folio", () => {
    const texto = opinionSat("Positivo").replace(/Folio:.*\n/, "");
    const a = analizarOpinion(texto, RFC);
    expect(a.resultado).toBe("SOSPECHOSA");
  });
});

describe("VerificadorOpinionSatHttp (cotejo en vivo real)", () => {
  const verificador = new VerificadorOpinionSatHttp({ url: "https://gateway.example/validar" });

  it("CONFIRMADA cuando el gateway localiza el folio con el mismo sentido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({ encontrada: true, sentido: "POSITIVA" })));
    const r = await verificador.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("CONFIRMADA");
    expect(r.ok).toBe(true);
  });

  it("DISCREPANCIA cuando el SAT no localiza el folio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({ encontrada: false })));
    const r = await verificador.cotejar({ rfc: RFC, folio: "FALSO0000", sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("DISCREPANCIA");
  });

  it("DISCREPANCIA cuando el sentido del SAT difiere del declarado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({ encontrada: true, sentido: "NEGATIVA" })));
    const r = await verificador.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("DISCREPANCIA");
  });

  it("NO_DISPONIBLE cuando no hay folio", async () => {
    const r = await verificador.cotejar({ rfc: RFC, folio: null, sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("NO_DISPONIBLE");
  });

  it("NO_DISPONIBLE (fail-safe) cuando el gateway falla la red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const r = await verificador.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("NO_DISPONIBLE");
    expect(r.ok).toBe(false);
  });

  it("NO_DISPONIBLE cuando el gateway responde HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta({}, false, 500)));
    const r = await verificador.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA" });
    expect(r.estado).toBe("NO_DISPONIBLE");
  });
});
