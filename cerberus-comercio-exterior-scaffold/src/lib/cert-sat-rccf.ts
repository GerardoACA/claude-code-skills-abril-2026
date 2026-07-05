// CERBERUS COMERCIO EXTERIOR — descarga del certificado del SAT (RCCF) por serie. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/cert-sat-rccf.ts  (Incrementos 27/62)
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

/** Resultado detallado de la descarga RCCF (Inc 62: diagnóstico visible). */
export interface DescargaRccf {
  /** Certificado en base64 (DER), listo para `verificarSelloOpinion`, o null. */
  certificadoB64: string | null;
  /** Motivo del fallo (HTTP status / red / timeout + serie + URL, SIN datos
   *  sensibles: la serie y la ruta del RCCF son públicas). Null si hubo éxito. */
  motivo: string | null;
}

/** Intentos de descarga (Inc 62: el RCCF falla transitoriamente a veces). */
const INTENTOS_RCCF = 2;
/** Espera entre intentos (parametrizable en pruebas para no dormir de verdad). */
const ESPERA_ENTRE_INTENTOS_MS = 1000;

/**
 * Descarga el certificado del SAT (RCCF) por serie con REINTENTO (2 intentos,
 * 1 s entre ellos) y devuelve el base64 (DER) o el MOTIVO real del fallo, para
 * que el detalle del cotejo diga POR QUÉ no se descargó (Inc 62). Fail-safe:
 * nunca lanza. Cachea solo los aciertos y valida que los bytes sean un X.509
 * real antes de devolverlos (para no alimentar basura al verificador).
 * Nota: el AbortController y su temporizador se crean NUEVOS en cada intento —
 * una señal ya abortada no puede reutilizarse.
 */
export async function descargarCertificadoSatDetallado(
  serie: string,
  timeoutMs = 8000,
  esperaEntreIntentosMs = ESPERA_ENTRE_INTENTOS_MS,
): Promise<DescargaRccf> {
  const url = urlRccf(serie);
  if (url === null) {
    return {
      certificadoB64: null,
      motivo: "la serie del certificado no es válida (se esperan exactamente 20 dígitos)",
    };
  }
  const enCache = cache.get(serie);
  if (enCache !== undefined) return { certificadoB64: enCache, motivo: null };

  let ultimoMotivo = "motivo desconocido";
  for (let intento = 1; intento <= INTENTOS_RCCF; intento++) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/pkix-cert,application/octet-stream,*/*" },
        signal: controlador.signal,
      });
      if (!res.ok) {
        ultimoMotivo = `el repositorio RCCF respondió HTTP ${res.status}`;
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) {
          ultimoMotivo = "el repositorio RCCF respondió vacío (0 bytes)";
        } else {
          try {
            // eslint-disable-next-line no-new
            new X509Certificate(buf);
          } catch {
            // Contenido que NO es un certificado: determinista, reintentar no ayuda.
            return {
              certificadoB64: null,
              motivo: `la respuesta del RCCF no es un certificado X.509 (${buf.length} bytes; serie ${serie}; ${url})`,
            };
          }
          const b64 = buf.toString("base64");
          cache.set(serie, b64);
          return { certificadoB64: b64, motivo: null };
        }
      }
    } catch (e) {
      ultimoMotivo = controlador.signal.aborted
        ? `timeout de ${timeoutMs} ms esperando al repositorio RCCF`
        : `error de red hacia el RCCF: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(temporizador);
    }
    if (intento < INTENTOS_RCCF) {
      await new Promise((resolver) => setTimeout(resolver, esperaEntreIntentosMs));
    }
  }
  return {
    certificadoB64: null,
    motivo: `${ultimoMotivo} (serie ${serie}, ${url}, ${INTENTOS_RCCF} intentos)`,
  };
}

/**
 * Compatibilidad (firma original del Inc 27): devuelve solo el base64 o null.
 * Internamente ya reintenta y diagnostica (descargarCertificadoSatDetallado).
 */
export async function descargarCertificadoSat(
  serie: string,
  timeoutMs = 8000,
  esperaEntreIntentosMs = ESPERA_ENTRE_INTENTOS_MS,
): Promise<string | null> {
  const r = await descargarCertificadoSatDetallado(serie, timeoutMs, esperaEntreIntentosMs);
  return r.certificadoB64;
}
