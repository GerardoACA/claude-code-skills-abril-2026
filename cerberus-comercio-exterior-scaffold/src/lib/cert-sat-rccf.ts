// CERBERUS COMERCIO EXTERIOR — descarga del certificado del SAT (RCCF) por serie. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/cert-sat-rccf.ts  (Incremento 27)
// Propósito: Descargar AUTOMÁTICAMENTE el certificado PÚBLICO con el que el SAT
//            firmó el acuse de una opinión, usando el NÚMERO DE SERIE que viene
//            dentro de la propia Cadena Original (último campo). El SAT publica
//            sus certificados en un repositorio abierto (RCCF) accesible por
//            serie, sin autenticación. Con ese certificado, la verificación del
//            sello (src/lib/sello-opinion.ts) es criptográfica y definitiva —
//            sin que el operador tenga que cargar nada manualmente.
//
// SEGURIDAD (anti-SSRF): SOLO se arma y descarga la URL del host FIJO del SAT
// (rdc.sat.gob.mx) a partir de una serie de EXACTAMENTE 20 dígitos. Nada de la
// URL proviene de entrada libre del usuario. Fail-safe: cualquier error (red,
// TLS, 404, bytes no-certificado) devuelve null → el cotejo cae a NO_DISPONIBLE,
// nunca a un falso "válido".
//
// Patrón de ruta del RCCF (documentado por la comunidad CFDI):
//   https://rdc.sat.gob.mx/rccf/<1-6>/<7-12>/<13-14>/<15-16>/<17-18>/<serie>.cer
// =============================================================================

import { X509Certificate } from "node:crypto";

const HOST_RCCF = "https://rdc.sat.gob.mx/rccf";

/** Caché en memoria por serie (por instancia serverless). Solo aciertos. */
const cache = new Map<string, string>();

/** ¿Serie válida del SAT? Exactamente 20 dígitos. */
export function esSerieSat(serie: string): boolean {
  return /^\d{20}$/.test(serie);
}

/** Construye la URL del RCCF para una serie de 20 dígitos (o null). */
export function urlRccf(serie: string): string | null {
  if (!esSerieSat(serie)) return null;
  const s = serie;
  return `${HOST_RCCF}/${s.slice(0, 6)}/${s.slice(6, 12)}/${s.slice(12, 14)}/${s.slice(14, 16)}/${s.slice(16, 18)}/${s}.cer`;
}

/**
 * Descarga el certificado del SAT (RCCF) por serie y lo devuelve en base64 (DER),
 * listo para `verificarSelloOpinion`. Devuelve null ante cualquier problema.
 * Cachea solo los aciertos. Valida que los bytes sean un X.509 real antes de
 * devolverlos (para no alimentar basura al verificador).
 */
export async function descargarCertificadoSat(
  serie: string,
  timeoutMs = 8000,
): Promise<string | null> {
  const url = urlRccf(serie);
  if (url === null) return null;
  const enCache = cache.get(serie);
  if (enCache !== undefined) return enCache;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/pkix-cert,application/octet-stream,*/*" },
      signal: controlador.signal,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    // Validar que sea un certificado X.509 real (DER); si no, no cachear.
    try {
      // eslint-disable-next-line no-new
      new X509Certificate(buf);
    } catch {
      return null;
    }
    const b64 = buf.toString("base64");
    cache.set(serie, b64);
    return b64;
  } catch {
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}
