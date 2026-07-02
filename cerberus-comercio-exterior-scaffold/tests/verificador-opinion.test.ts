// CERBERUS COMERCIO EXTERIOR — pruebas del verificador de opinión 32-D. NO es SIDF.
//
// Prueban tanto el análisis de autenticidad del texto (validador-opinion) como el
// verificador HTTP REAL de cotejo en vivo (verificador-opinion-sat), stubbeando
// `fetch` para no salir a la red. Confirman que el conector "echa a andar":
// CONFIRMADA / DISCREPANCIA / NO_DISPONIBLE según la respuesta del gateway.

import { describe, it, expect, vi, afterEach } from "vitest";

import { analizarOpinion } from "@/lib/validador-opinion";
import {
  VerificadorOpinionSatHttp,
  VerificadorOpinionSatQr,
  urlEsDelSat,
} from "@/lib/verificador-opinion-sat";

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

function respuestaHtml(html: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => html,
  } as unknown as Response;
}

const URL_SAT = "https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?folio=OPC1234567";

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

describe("urlEsDelSat (allowlist anti-SSRF)", () => {
  it("acepta https en dominios del SAT", () => {
    expect(urlEsDelSat(URL_SAT)).toBe(true);
    expect(urlEsDelSat("https://www.sat.gob.mx/x")).toBe(true);
  });
  it("rechaza dominios ajenos y http", () => {
    expect(urlEsDelSat("https://evil.example/sat.gob.mx")).toBe(false);
    expect(urlEsDelSat("http://siat.sat.gob.mx/x")).toBe(false);
    expect(urlEsDelSat("https://sat.gob.mx.attacker.com/x")).toBe(false);
    expect(urlEsDelSat("no-es-url")).toBe(false);
  });
});

describe("VerificadorOpinionSatQr (cotejo por QR del SAT)", () => {
  const qr = new VerificadorOpinionSatQr();

  it("CONFIRMADA cuando la página del SAT muestra folio, RFC y sentido", async () => {
    const html = `<html><body>Folio OPC1234567 RFC ${RFC} Opinión Positivo</body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => respuestaHtml(html)));
    const r = await qr.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA", urlVerificacion: URL_SAT });
    expect(r.estado).toBe("CONFIRMADA");
  });

  it("DISCREPANCIA cuando la página del SAT no muestra folio ni RFC", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuestaHtml("<html>página sin datos</html>")));
    const r = await qr.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA", urlVerificacion: URL_SAT });
    expect(r.estado).toBe("DISCREPANCIA");
  });

  it("DISCREPANCIA cuando el sentido del SAT difiere", async () => {
    const html = `Folio OPC1234567 RFC ${RFC} Opinión Negativo`;
    vi.stubGlobal("fetch", vi.fn(async () => respuestaHtml(html)));
    const r = await qr.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA", urlVerificacion: URL_SAT });
    expect(r.estado).toBe("DISCREPANCIA");
  });

  it("NO_DISPONIBLE si la URL no es de un dominio del SAT (anti-SSRF, no hace fetch)", async () => {
    const spy = vi.fn(async () => respuestaHtml("x"));
    vi.stubGlobal("fetch", spy);
    const r = await qr.cotejar({
      rfc: RFC,
      folio: "OPC1234567",
      sentidoDeclarado: "POSITIVA",
      urlVerificacion: "https://evil.example/validar",
    });
    expect(r.estado).toBe("NO_DISPONIBLE");
    expect(spy).not.toHaveBeenCalled();
  });

  it("NO_DISPONIBLE (fail-safe) si la página del SAT falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("blocked");
    }));
    const r = await qr.cotejar({ rfc: RFC, folio: "OPC1234567", sentidoDeclarado: "POSITIVA", urlVerificacion: URL_SAT });
    expect(r.estado).toBe("NO_DISPONIBLE");
  });
});

describe("analizarOpinion — extracción de URL del QR", () => {
  it("extrae la URL del SAT presente en el texto", () => {
    const texto = opinionSat("Positivo") + `\nVerificación: ${URL_SAT}`;
    const a = analizarOpinion(texto, RFC);
    expect(a.urlVerificacion).toContain("sat.gob.mx");
  });
});
