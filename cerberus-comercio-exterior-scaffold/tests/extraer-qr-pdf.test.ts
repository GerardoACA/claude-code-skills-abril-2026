// CERBERUS COMERCIO EXTERIOR — pruebas de extracción de QR desde PDF. NO es SIDF.
//
// Cubren los Incrementos 49A/57 (src/lib/extraer-qr-pdf.ts):
//   1) filtrarUrlsSat: allowlist anti-SSRF pura (solo https + sat.gob.mx o
//      subdominios; deduplica; lo demás genera advertencia).
//   2) extraerQrDePdf es FAIL-SAFE: bytes basura / vacíos NUNCA lanzan y
//      devuelven advertencia de "No se encontró QR".
//   3) Fallback de texto: un PDF mínimo real (sin QR, con la URL del SAT en la
//      capa de texto) devuelve la URL con la advertencia de que no vino de un QR.
//   4) Inc 57 (diagnóstico visible + robustez): conversiones de raster puras
//      (aRgba 1/3/4 canales, escalado 2x vecino más cercano, inversión RGBA) y
//      advertencias ESPECÍFICAS cuando el PDF no aporta imágenes utilizables.

import { describe, it, expect } from "vitest";

import {
  aRgba,
  escalar2xNearest,
  extraerQrDePdf,
  filtrarUrlsSat,
  invertirRgba,
} from "@/lib/extraer-qr-pdf";

const URL_SAT =
  "https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=OPC1234567_ABC101010AB1";

// ============================================================================
// filtrarUrlsSat (función pura)
// ============================================================================

describe("filtrarUrlsSat", () => {
  it("acepta URLs https de sat.gob.mx y subdominios", () => {
    const r = filtrarUrlsSat([URL_SAT, "https://sat.gob.mx/algo"]);
    expect(r.urls).toEqual([URL_SAT, "https://sat.gob.mx/algo"]);
    expect(r.advertencias).toEqual([]);
  });

  it("rechaza hosts ajenos al SAT con advertencia", () => {
    const r = filtrarUrlsSat(["https://evil.com/qr", URL_SAT]);
    expect(r.urls).toEqual([URL_SAT]);
    expect(r.advertencias).toHaveLength(1);
    expect(r.advertencias[0]).toContain("evil.com");
  });

  it("rechaza el truco de sufijo (sat.gob.mx.evil.com) y subdominios falsos", () => {
    const r = filtrarUrlsSat([
      "https://sat.gob.mx.evil.com/qr",
      "https://falso-sat.gob.mx.attacker.io/x",
      "https://notsat.gob.mx/x",
    ]);
    expect(r.urls).toEqual([]);
    expect(r.advertencias).toHaveLength(3);
  });

  it("rechaza http:// (exige https) y contenido que no es URL", () => {
    const r = filtrarUrlsSat(["http://siat.sat.gob.mx/qr", "hola mundo", "RFC ABC101010AB1"]);
    expect(r.urls).toEqual([]);
    expect(r.advertencias).toHaveLength(3);
  });

  it("deduplica aceptadas y rechazadas, e ignora vacíos", () => {
    const r = filtrarUrlsSat([URL_SAT, URL_SAT, "", "   ", "https://evil.com", "https://evil.com"]);
    expect(r.urls).toEqual([URL_SAT]);
    expect(r.advertencias).toHaveLength(1);
  });

  it("recorta contenidos larguísimos en la advertencia", () => {
    const largo = `no-es-url-${"x".repeat(300)}`;
    const r = filtrarUrlsSat([largo]);
    expect(r.urls).toEqual([]);
    expect(r.advertencias[0].length).toBeLessThan(250);
    expect(r.advertencias[0]).toContain("...");
  });
});

// ============================================================================
// Conversiones de raster (Inc 57) — puras, sin QR real
// ============================================================================

describe("aRgba", () => {
  it("convierte 1 canal (gris) a RGBA con alfa opaco", () => {
    const gris = new Uint8Array([0, 128, 255]); // 3x1
    const rgba = aRgba(gris, 3, 1, 1);
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
  });

  it("convierte 3 canales (RGB) a RGBA con alfa opaco", () => {
    const rgb = new Uint8Array([10, 20, 30, 40, 50, 60]); // 2x1
    const rgba = aRgba(rgb, 2, 1, 3);
    expect(Array.from(rgba)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("con 4 canales devuelve la misma data (Uint8Array → vista clamped)", () => {
    const origen = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); // 2x1 RGBA
    const rgba = aRgba(origen, 2, 1, 4);
    expect(rgba).toBeInstanceOf(Uint8ClampedArray);
    expect(rgba.length).toBe(8);
    expect(Array.from(rgba)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("escalar2xNearest", () => {
  it("duplica dimensiones replicando cada pixel (vecino más cercano)", () => {
    // 2x1: pixel rojo y pixel azul.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const r = escalar2xNearest(rgba, 2, 1);
    expect(r.width).toBe(4);
    expect(r.height).toBe(2);
    expect(r.data.length).toBe(4 * 2 * 4);
    // Fila 0: rojo rojo azul azul; fila 1 idéntica.
    const fila0 = Array.from(r.data.slice(0, 16));
    const fila1 = Array.from(r.data.slice(16, 32));
    expect(fila0).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
    expect(fila1).toEqual(fila0);
  });
});

describe("invertirRgba", () => {
  it("invierte RGB y conserva el alfa", () => {
    const rgba = new Uint8ClampedArray([0, 128, 255, 200]);
    const r = invertirRgba(rgba);
    expect(Array.from(r)).toEqual([255, 127, 0, 200]);
  });

  it("no muta el raster original", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255]);
    invertirRgba(rgba);
    expect(Array.from(rgba)).toEqual([10, 20, 30, 255]);
  });
});

// ============================================================================
// extraerQrDePdf: fail-safe con basura
// ============================================================================

describe("extraerQrDePdf — fail-safe", () => {
  it("no lanza con bytes basura y devuelve advertencia", async () => {
    const basura = new Uint8Array([1, 2, 3, 254, 255, 0, 42, 13, 10, 99]);
    const r = await extraerQrDePdf(basura);
    expect(r.urls).toEqual([]);
    expect(r.advertencias.some((a) => a.includes("No se encontró QR"))).toBe(true);
  });

  it("no lanza con un Uint8Array vacío", async () => {
    const r = await extraerQrDePdf(new Uint8Array(0));
    expect(r.urls).toEqual([]);
    expect(r.advertencias.length).toBeGreaterThan(0);
  });

  it("no lanza con texto plano disfrazado de PDF", async () => {
    const r = await extraerQrDePdf(new TextEncoder().encode("esto no es un pdf"));
    expect(r.urls).toEqual([]);
    expect(r.advertencias.some((a) => a.includes("No se encontró QR"))).toBe(true);
  });
});

// ============================================================================
// extraerQrDePdf: fallback por texto (PDF mínimo real, sin QR)
// ============================================================================

/** Construye un PDF de una página con `texto` en la capa de texto (xref válido). */
function pdfMinimoConTexto(texto: string): Uint8Array {
  const escapado = texto.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const contenido = `BT /F1 10 Tf 40 750 Td (${escapado}) Tj ET`;
  const objetos = [
    "<</Type /Catalog /Pages 2 0 R>>",
    "<</Type /Pages /Kids [3 0 R] /Count 1>>",
    "<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>",
    `<</Length ${contenido.length}>>\nstream\n${contenido}\nendstream`,
    "<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>",
  ];
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(cuerpo.length);
    cuerpo += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const inicioXref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    cuerpo += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  cuerpo += `trailer\n<</Size ${objetos.length + 1} /Root 1 0 R>>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return new TextEncoder().encode(cuerpo);
}

describe("extraerQrDePdf — fallback por texto/anotaciones", () => {
  it("encuentra la URL del SAT en la capa de texto cuando no hay QR", async () => {
    const r = await extraerQrDePdf(pdfMinimoConTexto(`Consulta: ${URL_SAT}`));
    expect(r.urls).toEqual([URL_SAT]);
    expect(r.advertencias.some((a) => a.includes("hipervínculos o del texto"))).toBe(true);
  });

  it("PDF legible sin QR ni URL devuelve la advertencia de 'No se encontró QR'", async () => {
    const r = await extraerQrDePdf(pdfMinimoConTexto("Opinión del cumplimiento, sin URL."));
    expect(r.urls).toEqual([]);
    expect(r.advertencias.some((a) => a.includes("No se encontró QR"))).toBe(true);
  });

  it("URL ajena al SAT en el texto se descarta con advertencia", async () => {
    const r = await extraerQrDePdf(pdfMinimoConTexto("Ver https://phishing.example.com/opinion"));
    expect(r.urls).toEqual([]);
    expect(r.advertencias.some((a) => a.includes("phishing.example.com"))).toBe(true);
  });
});

// ============================================================================
// extraerQrDePdf: diagnóstico visible (Inc 57) — cada derrota deja su porqué
// ============================================================================

describe("extraerQrDePdf — advertencias específicas (Inc 57)", () => {
  it("PDF sin imágenes explica que no hubo imágenes utilizables (posible 1-bit/vectorial)", async () => {
    const r = await extraerQrDePdf(pdfMinimoConTexto("Sin QR ni imágenes."));
    expect(r.advertencias.some((a) => a.includes("no contiene imágenes utilizables"))).toBe(true);
  });

  it("aunque el fallback de texto encuentre la URL, el porqué del QR fallido queda dicho", async () => {
    const r = await extraerQrDePdf(pdfMinimoConTexto(`Consulta: ${URL_SAT}`));
    expect(r.urls).toEqual([URL_SAT]);
    // Se explica que la vía de imágenes no aportó nada…
    expect(r.advertencias.some((a) => a.includes("no contiene imágenes utilizables"))).toBe(true);
    // …y que la URL vino del respaldo (hipervínculos/texto), no de un QR.
    expect(r.advertencias.some((a) => a.includes("hipervínculos o del texto"))).toBe(true);
  });

  it("nunca devuelve advertencias vacías cuando no hay URLs (jamás silencio)", async () => {
    const casos = [
      new Uint8Array(0),
      new TextEncoder().encode("no soy pdf"),
      pdfMinimoConTexto("Documento sin nada útil."),
    ];
    for (const caso of casos) {
      const r = await extraerQrDePdf(caso);
      expect(r.urls).toEqual([]);
      expect(r.advertencias.length).toBeGreaterThan(0);
    }
  });
});
