// CERBERUS COMERCIO EXTERIOR — validador de autenticidad de e.firma (.cer). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/validador-efirma.ts  (Incremento 20)
// Propósito: Analizar de forma AUTOMÁTICA la autenticidad del certificado
//            público de e.firma (FIEL) que un cliente/proveedor ENTREGA, cuando
//            no otorga acceso directo para consultar su opinión 32-D. El
//            análisis es determinista y verificable (no una caja negra):
//            parsea el X.509 con node:crypto, comprueba el EMISOR (Autoridad
//            Certificadora del SAT), la VIGENCIA, extrae el RFC del subject y lo
//            coteja contra el RFC del cliente, y computa la huella SHA-256 del
//            certificado. Devuelve un veredicto motivado con la lista de checks.
//
// SEGURIDAD (decisión C14) — LÍNEA ROJA: este validador SOLO acepta el
// certificado PÚBLICO (.cer / X.509, PEM o DER). Si el material entregado
// contiene una CLAVE PRIVADA (.key, "PRIVATE KEY", material cifrado de llave),
// se RECHAZA de inmediato: la clave privada de la FIEL NUNCA debe entrar a este
// sistema. El certificado público es información pública (se publica al firmar).
//
// C9: el veredicto ALERTA/INVALIDA es informativo (revisión humana); nunca
// bloquea la operación del cliente. La validación criptográfica de la CADENA
// completa contra el certificado raíz del SAT (y OCSP/CRL de revocación, o el
// servicio "ValidaFIEL" del SAT) es el siguiente escalón, enchufable sin tocar
// este contrato (no se empaqueta la raíz del SAT aquí; se documenta el gancho).
// =============================================================================

import { X509Certificate } from "node:crypto";
import { sha256 } from "@/lib/probatoria/hash";

/** Veredicto (espeja el enum Prisma ResultadoValidacionEfirma). */
export type ResultadoValidacionEfirma =
  | "VALIDA"
  | "ALERTA"
  | "INVALIDA"
  | "NO_VERIFICABLE";

/** Una comprobación individual del análisis de autenticidad. */
export interface CheckEfirma {
  /** Identificador legible de la comprobación. */
  readonly check: string;
  /** `true` si la comprobación pasó. */
  readonly ok: boolean;
  /** Detalle legible del resultado de la comprobación. */
  readonly detalle: string;
}

/** Resultado del análisis de autenticidad de una e.firma entregada. */
export interface AnalisisEfirma {
  readonly resultado: ResultadoValidacionEfirma;
  /** SHA-256 (hex) del certificado en DER (huella del archivo entregado). */
  readonly sha256: string | null;
  readonly rfcCertificado: string | null;
  readonly titular: string | null;
  readonly serie: string | null;
  readonly emisor: string | null;
  /** Vigencia (ISO 8601) si se pudo parsear. */
  readonly validoDesde: string | null;
  readonly validoHasta: string | null;
  readonly checks: readonly CheckEfirma[];
  /** Resumen legible (una línea) del veredicto. */
  readonly resumen: string;
}

/** Error de ingreso de material NO permitido (clave privada). C14. */
export class MaterialPrivadoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialPrivadoError";
  }
}

/** RFC (persona moral 12 / persona física 13): formato SAT. */
const RFC_RE = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}/g;

/** Marcadores de material PRIVADO que este sistema NUNCA debe recibir (C14). */
const MARCADORES_PRIVADOS = [
  "PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "RSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "BEGIN PRIVATE",
];

/** Normaliza texto: mayúsculas, sin acentos (para comparar emisor con tolerancia). */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Rechaza (lanza MaterialPrivadoError) si el contenido entregado contiene
 * material de CLAVE PRIVADA. Se llama ANTES de cualquier parseo. C14.
 */
export function rechazarSiEsClavePrivada(contenido: string): void {
  const arriba = contenido.toUpperCase();
  if (MARCADORES_PRIVADOS.some((m) => arriba.includes(m))) {
    throw new MaterialPrivadoError(
      "El material entregado parece contener una CLAVE PRIVADA (.key). Por " +
        "seguridad (C14) CERBERUS solo acepta el certificado PÚBLICO (.cer). " +
        "Nunca subas tu llave privada ni su contraseña.",
    );
  }
}

/**
 * Construye el Buffer del certificado a partir de PEM (texto) o DER (base64).
 * Acepta:
 *  - PEM: texto con cabeceras "-----BEGIN CERTIFICATE-----".
 *  - base64 DER: cadena base64 del .cer binario (sin cabeceras PEM).
 */
function aBuffer(contenido: string): Buffer {
  const limpio = contenido.trim();
  if (limpio.includes("BEGIN CERTIFICATE")) {
    return Buffer.from(limpio, "utf8");
  }
  // Quitar posibles saltos/espacios del base64 antes de decodificar DER.
  const b64 = limpio.replace(/\s+/g, "");
  return Buffer.from(b64, "base64");
}

/** ¿El emisor corresponde a una Autoridad Certificadora del SAT? */
function emisorEsSat(issuer: string): boolean {
  const s = normalizar(issuer);
  return (
    s.includes("SERVICIO DE ADMINISTRACION TRIBUTARIA") ||
    s.includes("SAT") ||
    s.includes("AUTORIDAD CERTIFICADORA") ||
    s.includes("ADMINISTRACION CENTRAL DE SERVICIOS TRIBUTARIOS")
  );
}

/** Extrae el primer RFC con formato SAT del subject (o null). */
function extraerRfc(subject: string): string | null {
  const arriba = normalizar(subject);
  const encontrados = arriba.match(RFC_RE);
  if (!encontrados || encontrados.length === 0) return null;
  // Preferir un RFC de 12-13 chars (formato completo).
  const completo = encontrados.find((r) => r.length === 12 || r.length === 13);
  return completo ?? encontrados[0];
}

/** Extrae el CN (Common Name) del subject de X509Certificate (string multilínea). */
function extraerCn(subject: string): string | null {
  for (const linea of subject.split("\n")) {
    const t = linea.trim();
    if (t.toUpperCase().startsWith("CN=")) return t.slice(3).trim();
  }
  return null;
}

function fechaIso(valor: string): string | null {
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Analiza la autenticidad de una e.firma entregada.
 *
 * @param contenido - Certificado público en PEM (texto) o DER (base64).
 * @param rfcCliente - RFC del cliente/proveedor con el que se coteja el del cert.
 * @param ahora - Momento de referencia (inyectable para pruebas).
 * @throws MaterialPrivadoError si el material contiene una clave privada (C14).
 */
export function analizarEfirma(
  contenido: string,
  rfcCliente: string,
  ahora: Date = new Date(),
): AnalisisEfirma {
  // 0) LÍNEA ROJA C14: nunca aceptar clave privada.
  rechazarSiEsClavePrivada(contenido);

  const checks: CheckEfirma[] = [];

  // 1) Parseo del X.509.
  let cert: X509Certificate;
  let der: Buffer;
  try {
    const buf = aBuffer(contenido);
    cert = new X509Certificate(buf);
    // `raw` es el DER canónico del certificado: sella la huella sobre él.
    der = Buffer.from(cert.raw);
  } catch {
    return {
      resultado: "NO_VERIFICABLE",
      sha256: null,
      rfcCertificado: null,
      titular: null,
      serie: null,
      emisor: null,
      validoDesde: null,
      validoHasta: null,
      checks: [
        {
          check: "parseo_x509",
          ok: false,
          detalle:
            "No se pudo interpretar el material como un certificado X.509 " +
            "(.cer PEM o DER). Verifica que sea el certificado público de la e.firma.",
        },
      ],
      resumen: "No verificable: el archivo no es un certificado X.509 legible.",
    };
  }
  checks.push({
    check: "parseo_x509",
    ok: true,
    detalle: "Certificado X.509 interpretado correctamente.",
  });

  const huella = sha256(der);
  const rfcCert = extraerRfc(cert.subject);
  const titular = extraerCn(cert.subject);
  const validoDesde = fechaIso(cert.validFrom);
  const validoHasta = fechaIso(cert.validTo);

  // 2) Emisor = Autoridad Certificadora del SAT.
  const esSat = emisorEsSat(cert.issuer);
  checks.push({
    check: "emisor_sat",
    ok: esSat,
    detalle: esSat
      ? "El emisor corresponde a una Autoridad Certificadora del SAT."
      : "El emisor NO parece ser el SAT: certificado no reconocido como e.firma oficial.",
  });

  // 3) Vigencia.
  const desdeOk = validoDesde !== null && Date.parse(cert.validFrom) <= ahora.getTime();
  const hastaOk = validoHasta !== null && ahora.getTime() <= Date.parse(cert.validTo);
  const vigente = desdeOk && hastaOk;
  checks.push({
    check: "vigencia",
    ok: vigente,
    detalle: vigente
      ? `Certificado vigente (${validoDesde} → ${validoHasta}).`
      : validoHasta !== null && ahora.getTime() > Date.parse(cert.validTo)
        ? `Certificado VENCIDO el ${validoHasta}.`
        : "Certificado fuera de su periodo de vigencia o sin fechas legibles.",
  });

  // 4) RFC del certificado vs RFC del cliente.
  const rfcClienteNorm = normalizar(rfcCliente.trim());
  const rfcCoincide = rfcCert !== null && normalizar(rfcCert) === rfcClienteNorm;
  checks.push({
    check: "rfc_coincide",
    ok: rfcCoincide,
    detalle: rfcCert === null
      ? "No se pudo extraer un RFC del certificado."
      : rfcCoincide
        ? `El RFC del certificado (${rfcCert}) coincide con el del cliente.`
        : `El RFC del certificado (${rfcCert}) NO coincide con el del cliente (${rfcCliente}).`,
  });

  // 5) Veredicto.
  //   - Emisor no-SAT o vencido            => INVALIDA (no auténtica / no utilizable).
  //   - Emisor SAT + vigente + RFC coincide => VALIDA.
  //   - Emisor SAT + vigente + RFC no coincide / ausente => ALERTA (revisión humana).
  let resultado: ResultadoValidacionEfirma;
  let resumen: string;
  if (!esSat) {
    resultado = "INVALIDA";
    resumen = "Inválida: el emisor no es el SAT (no es una e.firma oficial reconocible).";
  } else if (!vigente) {
    resultado = "INVALIDA";
    resumen = "Inválida: certificado del SAT pero fuera de vigencia.";
  } else if (rfcCoincide) {
    resultado = "VALIDA";
    resumen = "Válida: e.firma auténtica del SAT, vigente y con RFC coincidente.";
  } else {
    resultado = "ALERTA";
    resumen =
      "Alerta: e.firma del SAT y vigente, pero el RFC no coincide con el del " +
      "cliente (requiere revisión humana).";
  }

  return {
    resultado,
    sha256: huella,
    rfcCertificado: rfcCert,
    titular,
    serie: cert.serialNumber,
    emisor: cert.issuer.replace(/\n/g, ", "),
    validoDesde,
    validoHasta,
    checks,
    resumen,
  };
}
