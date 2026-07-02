// CERBERUS COMERCIO EXTERIOR — pruebas validador multi-emisor + sello. NO es SIDF.
//
// Cubre: detección SAT/IMSS y parseo de la Cadena Original (con las cadenas
// REALES de los acuses de ejemplo), y la verificación criptográfica del sello
// (RSA) con un par de llaves generado en la prueba (positivo + alteración).

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { analizarOpinion } from "@/lib/validador-opinion";
import { verificarSelloOpinion } from "@/lib/sello-opinion";

const SELLO_DUMMY = "A".repeat(344); // bloque base64 largo (simula el sello)

const TXT_SAT = `Opinión del cumplimiento de obligaciones fiscales
Servicio de Administración Tributaria
Sentido POSITIVO  RFC FLP151123IW8  Folio 26NB9079651
Fecha y hora de emisión 19 de marzo de 2026
Artículos: 17-D, 32-D del CFF
Cadena Original
||FLP151123IW8|26NB9079651|19-03-2026|P||00001088888800000031||
Sello Digital
${SELLO_DUMMY}
Página 1 de 1`;

const TXT_IMSS = `Opinión del Cumplimiento de Obligaciones Fiscales en materia de Seguridad Social
Instituto Mexicano del Seguro Social
Folio: 17532978445751455363986  RFC: MPP171122QX4  opinión Positiva
Cadena Original:
||Invocante:portalimssdigital|Tramite:Carta de No Adeudo Art. 32D|Fecha:23 de julio 2025, 13:10:41|Folio:17532978445751455363986|RFC:MPP171122QX4|Nombre o Razon Social:MILLENNIAL PRODUCTIVE PARK SA DE CV|CURP:|Opinion:POSITIVA|FechaInicioVigencia:23 de julio 2025, 13:10:41|FechaFinVigencia:23 de julio de 2025, 23:59:59||
Sello digital:
${SELLO_DUMMY}
Número de Serie: 00000000000000000001`;

describe("analizarOpinion — multi-emisor + cadena original", () => {
  it("SAT: detecta emisor, parsea cadena y da AUTENTICA", () => {
    const a = analizarOpinion(TXT_SAT, "FLP151123IW8");
    expect(a.emisor).toBe("SAT");
    expect(a.resultado).toBe("AUTENTICA");
    expect(a.rfcDocumento).toBe("FLP151123IW8");
    expect(a.folio).toBe("26NB9079651");
    expect(a.sentido).toBe("POSITIVA");
    expect(a.cadenaOriginal).toContain("||FLP151123IW8|");
    expect(a.selloBase64).not.toBeNull();
  });

  it("IMSS: detecta emisor, parsea cadena (Clave:Valor) y da AUTENTICA", () => {
    const a = analizarOpinion(TXT_IMSS, "MPP171122QX4");
    expect(a.emisor).toBe("IMSS");
    expect(a.resultado).toBe("AUTENTICA");
    expect(a.rfcDocumento).toBe("MPP171122QX4");
    expect(a.folio).toBe("17532978445751455363986");
    expect(a.sentido).toBe("POSITIVA");
  });

  it("RFC del documento distinto al del cliente => SOSPECHOSA (posible tercero)", () => {
    const a = analizarOpinion(TXT_SAT, "XAXX010101000");
    expect(a.resultado).toBe("SOSPECHOSA");
  });

  it("Texto sin estructura oficial => NO_AUTENTICA", () => {
    const a = analizarOpinion("documento cualquiera sin cadena ni emisor, con más de cuarenta caracteres.", "FLP151123IW8");
    expect(a.resultado).toBe("NO_AUTENTICA");
  });
});

describe("verificarSelloOpinion — firma RSA sobre la cadena original", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const cadena = "||FLP151123IW8|26NB9079651|19-03-2026|P||00001088888800000031||";

  function firmar(c: string): string {
    const s = createSign("RSA-SHA256");
    s.update(c, "utf8");
    s.end();
    return s.sign(privateKey).toString("base64");
  }

  it("valida cuando la firma corresponde a la cadena y al certificado", () => {
    const r = verificarSelloOpinion({ cadenaOriginal: cadena, selloBase64: firmar(cadena), certificado: pubPem });
    expect(r.valido).toBe(true);
    expect(r.algoritmo).toBe("RSA-SHA256");
  });

  it("NO valida si la cadena fue alterada (mismo sello)", () => {
    const selloOriginal = firmar(cadena);
    const cadenaAlterada = cadena.replace("|P|", "|N|"); // cambia el sentido
    const r = verificarSelloOpinion({ cadenaOriginal: cadenaAlterada, selloBase64: selloOriginal, certificado: pubPem });
    expect(r.valido).toBe(false);
  });

  it("NO valida con un certificado que no firmó", () => {
    const otro = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otroPem = otro.publicKey.export({ type: "spki", format: "pem" }).toString();
    const r = verificarSelloOpinion({ cadenaOriginal: cadena, selloBase64: firmar(cadena), certificado: otroPem });
    expect(r.valido).toBe(false);
  });
});
