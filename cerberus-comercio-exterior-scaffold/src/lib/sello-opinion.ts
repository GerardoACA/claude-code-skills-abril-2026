// CERBERUS COMERCIO EXTERIOR — verificación criptográfica del sello de la opinión. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/sello-opinion.ts  (Incremento 26)
// Propósito: Verificar el SELLO DIGITAL de una opinión de cumplimiento (SAT 32-D
//            o IMSS) contra su CADENA ORIGINAL, usando el CERTIFICADO PÚBLICO del
//            emisor — igual que se valida un CFDI. Es un cotejo DETERMINISTA y
//            OFFLINE (no contacta al SAT/IMSS): si alguien altera el RFC, el
//            folio o el sentido, la firma RSA deja de validar. Es la prueba más
//            fuerte de autenticidad que ofrece el propio documento.
//
// "ENCHUFAR EL COTEJO": el código ya corre. Lo único externo es el CERTIFICADO
// PÚBLICO del emisor (lo publican SAT/IMSS); se aporta por variable de entorno
// (SAT_OPINION_CERT / IMSS_OPINION_CERT, PEM o base64 DER). Sin certificado, la
// verificación criptográfica queda "pendiente de certificado" (nunca se finge un
// válido) y la autenticidad se apoya en la consistencia de la cadena y el texto.
//
// Se prueban SHA-256 y SHA-1 (los acuses del SAT históricamente han usado ambos)
// para no depender de un supuesto sobre el algoritmo del emisor.
// =============================================================================

import { X509Certificate, createPublicKey, createVerify, type KeyObject } from "node:crypto";

/** Emisores soportados de la opinión de cumplimiento. */
export type EmisorOpinion = "SAT" | "IMSS" | "DESCONOCIDO";

export interface EntradaSello {
  /** Cadena original EXACTA tal como aparece en el documento (bytes firmados). */
  readonly cadenaOriginal: string;
  /** Sello digital en base64 (la firma RSA). */
  readonly selloBase64: string;
  /** Certificado público del emisor (PEM, o base64 DER del .cer). */
  readonly certificado: string;
}

export interface ResultadoSello {
  /** `true` solo si la firma valida contra el certificado. */
  readonly valido: boolean;
  /** Algoritmo con el que validó (si validó). */
  readonly algoritmo: string | null;
  /** Detalle legible. */
  readonly detalle: string;
}

/** Construye una KeyObject pública desde PEM (clave o cert) o base64 DER (.cer). */
function clavePublicaDesde(certificado: string): KeyObject {
  const txt = certificado.trim();
  if (txt.includes("BEGIN CERTIFICATE")) {
    return new X509Certificate(txt).publicKey;
  }
  if (txt.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(txt);
  }
  // base64 DER del certificado (.cer).
  const der = Buffer.from(txt.replace(/\s+/g, ""), "base64");
  return new X509Certificate(der).publicKey;
}

/**
 * Verifica el sello digital contra la cadena original usando el certificado del
 * emisor. Prueba RSA-SHA256 y RSA-SHA1. Nunca lanza por datos malformados:
 * devuelve `valido:false` con el detalle.
 */
export function verificarSelloOpinion(entrada: EntradaSello): ResultadoSello {
  let pub: KeyObject;
  try {
    pub = clavePublicaDesde(entrada.certificado);
  } catch {
    return { valido: false, algoritmo: null, detalle: "Certificado del emisor no interpretable (PEM o base64 DER)." };
  }

  let firma: Buffer;
  try {
    firma = Buffer.from(entrada.selloBase64.replace(/\s+/g, ""), "base64");
    if (firma.length === 0) throw new Error("vacío");
  } catch {
    return { valido: false, algoritmo: null, detalle: "Sello digital no es base64 válido." };
  }

  for (const algo of ["RSA-SHA256", "RSA-SHA1"]) {
    try {
      const v = createVerify(algo);
      v.update(entrada.cadenaOriginal, "utf8");
      v.end();
      if (v.verify(pub, firma)) {
        return {
          valido: true,
          algoritmo: algo,
          detalle: `Sello digital VÁLIDO: la firma del emisor sobre la cadena original verifica (${algo}). Documento auténtico e íntegro.`,
        };
      }
    } catch {
      // Probar el siguiente algoritmo.
    }
  }
  return {
    valido: false,
    algoritmo: null,
    detalle:
      "El sello digital NO valida contra el certificado del emisor: el documento fue alterado, " +
      "o el certificado configurado no corresponde al que firmó esta opinión.",
  };
}

/**
 * Devuelve el certificado público configurado para el emisor (o null). Se aporta
 * por entorno: SAT_OPINION_CERT / IMSS_OPINION_CERT (PEM o base64 DER). Permite
 * varios certificados separados por ';' (el SAT/IMSS rotan certificados): se
 * intentará con cada uno.
 */
export function certificadosEmisor(emisor: EmisorOpinion): string[] {
  const raw =
    emisor === "SAT"
      ? process.env.SAT_OPINION_CERT
      : emisor === "IMSS"
        ? process.env.IMSS_OPINION_CERT
        : undefined;
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}
