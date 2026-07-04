// CERBERUS COMERCIO EXTERIOR — pruebas del detalle/avisos del cotejo en vivo. NO es SIDF.
// =============================================================================
// Archivo:  tests/cotejo-evidencia.test.ts  (Incremento 57)
// Propósito: Verificar la lógica PURA de @/lib/cotejo-evidencia:
//            construirCotejoDetalle (bloques parseables "url=…", "evidencia…",
//            "avisos: …" — el detalle NUNCA queda mudo, ni en NO_DISPONIBLE) y
//            resumenAdvertencias (aplanado + recorte). Incluye el roundtrip con
//            urlSatDeDetalle (el re-cotejo relee la URL del detalle persistido).
// =============================================================================

import { describe, expect, it } from "vitest";

import { construirCotejoDetalle, resumenAdvertencias } from "@/lib/cotejo-evidencia";
import { urlSatDeDetalle } from "@/lib/cotejo-sat";

const URL_SAT =
  "https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=OPC1234567_ABC101010AB1";

describe("resumenAdvertencias", () => {
  it("devuelve null sin advertencias (o solo vacías)", () => {
    expect(resumenAdvertencias([])).toBeNull();
    expect(resumenAdvertencias(["", "   "])).toBeNull();
  });

  it("une con ' | ' y aplana espacios", () => {
    expect(resumenAdvertencias(["No se encontró QR.", "Página  2\nilegible."])).toBe(
      "No se encontró QR. | Página 2 ilegible.",
    );
  });

  it("recorta al máximo indicado con elipsis", () => {
    const r = resumenAdvertencias(["x".repeat(500)], 100);
    expect(r).not.toBeNull();
    expect((r as string).length).toBe(100);
    expect(r).toMatch(/…$/);
  });
});

describe("construirCotejoDetalle", () => {
  it("con solo detalle devuelve el detalle (sin bloques)", () => {
    const d = construirCotejoDetalle({ detalle: "Cotejo criptográfico OK.", urlSat: null });
    expect(d).toBe("Cotejo criptográfico OK.");
  });

  it("nunca queda mudo: detalle vacío produce texto explicativo", () => {
    const d = construirCotejoDetalle({ detalle: "   ", urlSat: null });
    expect(d.length).toBeGreaterThan(0);
    expect(d).toContain("sin detalle");
  });

  it("embebe url= parseable que urlSatDeDetalle relee (roundtrip del re-cotejo)", () => {
    const d = construirCotejoDetalle({
      detalle: "El SAT confirma la opinión vía QR.",
      urlSat: URL_SAT,
      advertencias: ["Aviso menor."],
    });
    expect(urlSatDeDetalle(d)).toBe(URL_SAT);
  });

  it("incluye el bloque de evidencia (HTTP, sha256 y worm)", () => {
    const d = construirCotejoDetalle({
      detalle: "Confirmada.",
      urlSat: URL_SAT,
      evidencia: { url: URL_SAT, httpStatus: 200, cuerpo: "<html>ok</html>" },
      evidenciaSellada: { sha256: "a".repeat(64), wormUrl: "https://blob.example/x.html" },
    });
    expect(d).toContain("[evidencia HTTP 200 sha256=" + "a".repeat(64));
    expect(d).toContain("worm=https://blob.example/x.html");
  });

  it("persiste el porqué también en NO_DISPONIBLE (bloque [avisos: …])", () => {
    const d = construirCotejoDetalle({
      detalle: "Cotejo en vivo no disponible: no se aportó la URL del QR.",
      urlSat: null,
      advertencias: [
        "El PDF no contiene imágenes utilizables en sus primeras 4 página(s).",
        "No se encontró QR en el PDF.",
      ],
    });
    expect(d).toContain("[avisos: ");
    expect(d).toContain("No se encontró QR en el PDF.");
    // Sin URL del SAT no debe haber bloque url= (nada que abrir en el portal).
    expect(urlSatDeDetalle(d)).toBeNull();
  });
});
