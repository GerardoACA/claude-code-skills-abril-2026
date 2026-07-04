// CERBERUS COMERCIO EXTERIOR — extracción del QR de un PDF (opinión 32-D). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/extraer-qr-pdf.ts  (Incremento 49A)
// Propósito: Decodificar EN EL SERVIDOR el QR impreso en un PDF (típicamente la
//            opinión de cumplimiento 32-D del SAT) para obtener la URL del
//            validador del SAT sin que el capturista la teclee/pegue a mano.
//
// Estrategia (Node puro, SIN dependencias nativas nuevas):
//   1) unpdf.extractImages: saca los rasters embebidos de las primeras 2
//      páginas (el QR del SAT es una imagen embebida) y los decodifica con
//      jsQR (que exige RGBA; aquí se convierten canales 1/3 → 4).
//      NOTA: unpdf 1.6.2 SÍ exporta renderPageAsImage, pero en Node exige
//      `canvasImport` hacia @napi-rs/canvas (dependencia NATIVA que este
//      proyecto NO tiene instalada); por eso el raster de página completa NO
//      se usa y la vía real es extractImages.
//   2) Fallback si ningún QR decodifica: hipervínculos del PDF (Annots, vía
//      unpdf.extractLinks) y URLs presentes en el texto — muchos PDF del SAT
//      llevan el destino del QR también como anotación/hipervínculo.
//   3) Anti-SSRF: SOLO se devuelven URLs https cuyo host sea del SAT
//      (sat.gob.mx o subdominios; misma allowlist que el verificador de
//      opinión). Lo demás genera advertencia, nunca se devuelve.
//
// FAIL-SAFE TOTAL: la función NUNCA lanza. Bytes basura, PDF cifrado o sin QR
// devuelven { urls: [], advertencias: [...] } para que quien llama decida
// (C9: el sistema sugiere/alerta, nunca bloquea la captura manual).
// =============================================================================

import jsQR from "jsqr";
import { extractImages, extractLinks, extractText, getDocumentProxy } from "unpdf";

import { urlEsDelSat } from "@/lib/verificador-opinion-sat";

// ============================================================================
// Tipos
// ============================================================================

export interface ResultadoQrPdf {
  /** URLs del SAT (https + *.sat.gob.mx) encontradas en el QR / PDF, sin duplicados. */
  urls: string[];
  /** Avisos legibles: sin QR, contenido ajeno al SAT, PDF ilegible, etc. */
  advertencias: string[];
}

/** Máximo de páginas a examinar (el QR de la 32-D vive en la primera página). */
const MAX_PAGINAS = 2;

/** Guardas de tamaño para no gastar CPU en imágenes absurdas (fotos escaneadas). */
const MAX_PIXELES_IMAGEN = 16_000_000; // ~4000x4000
const MAX_IMAGENES_POR_PAGINA = 20;

// ============================================================================
// Filtrado anti-SSRF (función pura, testeable)
// ============================================================================

/**
 * Filtra una lista de candidatos (contenido de QRs, hipervínculos, texto):
 * conserva SOLO URLs https con host del SAT (sat.gob.mx o subdominios, misma
 * allowlist que el verificador de opinión) y deduplica. Todo lo demás produce
 * una advertencia — el dato se muestra al usuario como aviso, jamás se usa.
 */
export function filtrarUrlsSat(urls: string[]): { urls: string[]; advertencias: string[] } {
  const aceptadas: string[] = [];
  const advertencias: string[] = [];
  const vistas = new Set<string>();
  const rechazadas = new Set<string>();

  for (const cruda of urls) {
    const url = typeof cruda === "string" ? cruda.trim() : "";
    if (url.length === 0) continue;
    if (urlEsDelSat(url)) {
      if (!vistas.has(url)) {
        vistas.add(url);
        aceptadas.push(url);
      }
    } else if (!rechazadas.has(url)) {
      rechazadas.add(url);
      // Se recorta por si el QR trae un texto largo que no es URL.
      const resumen = url.length > 120 ? `${url.slice(0, 117)}...` : url;
      advertencias.push(
        `Se descartó contenido que no es una URL del SAT (se exige https y dominio sat.gob.mx): "${resumen}".`,
      );
    }
  }

  return { urls: aceptadas, advertencias };
}

// ============================================================================
// Conversión de raster a RGBA (jsQR exige 4 canales)
// ============================================================================

/** Convierte un raster de 1 (gris), 3 (RGB) o 4 (RGBA) canales a RGBA. */
function aRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  canales: 1 | 3 | 4,
): Uint8ClampedArray {
  const pixeles = width * height;
  if (canales === 4) {
    return data instanceof Uint8ClampedArray
      ? data
      : new Uint8ClampedArray(data.buffer, data.byteOffset, pixeles * 4);
  }
  const rgba = new Uint8ClampedArray(pixeles * 4);
  if (canales === 1) {
    for (let i = 0; i < pixeles; i++) {
      const v = data[i];
      const j = i * 4;
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
  } else {
    for (let i = 0; i < pixeles; i++) {
      const j3 = i * 3;
      const j4 = i * 4;
      rgba[j4] = data[j3];
      rgba[j4 + 1] = data[j3 + 1];
      rgba[j4 + 2] = data[j3 + 2];
      rgba[j4 + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// Extracción principal
// ============================================================================

/** Extrae URLs candidatas del texto plano del PDF (fallback, mejor esfuerzo). */
function urlsEnTexto(texto: string): string[] {
  // unpdf aplana el texto (espacios colapsados); se corta en espacio/comillas.
  const patron = /https:\/\/[^\s"'<>)\]]+/gi;
  return texto.match(patron) ?? [];
}

/**
 * Decodifica el/los QR de un PDF y devuelve las URLs del SAT que contengan.
 *
 * NUNCA lanza. Sin QR ni hipervínculo utilizable devuelve
 * `{ urls: [], advertencias: ["No se encontró QR en el PDF."] }`.
 */
export async function extraerQrDePdf(pdf: Uint8Array): Promise<ResultadoQrPdf> {
  const candidatos: string[] = [];
  const advertencias: string[] = [];

  let proxy: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    // Copia defensiva: pdfjs puede transferir/neutralizar el buffer recibido.
    proxy = await getDocumentProxy(new Uint8Array(pdf));
  } catch {
    return {
      urls: [],
      advertencias: [
        "No se pudo leer el archivo como PDF (¿está dañado o cifrado?).",
        "No se encontró QR en el PDF.",
      ],
    };
  }

  // --- Vía 1: imágenes embebidas (el QR del SAT es una imagen) + jsQR -------
  try {
    const paginas = Math.min(proxy.numPages, MAX_PAGINAS);
    for (let pagina = 1; pagina <= paginas; pagina++) {
      let imagenes: Awaited<ReturnType<typeof extractImages>>;
      try {
        imagenes = await extractImages(proxy, pagina);
      } catch {
        continue; // Página ilegible: se sigue con la siguiente (fail-safe).
      }
      for (const imagen of imagenes.slice(0, MAX_IMAGENES_POR_PAGINA)) {
        try {
          const { width, height, channels } = imagen;
          if (width * height > MAX_PIXELES_IMAGEN) continue;
          const rgba = aRgba(imagen.data, width, height, channels);
          if (rgba.length !== width * height * 4) continue;
          const qr = jsQR(rgba, width, height, { inversionAttempts: "attemptBoth" });
          if (qr && qr.data.trim().length > 0) {
            candidatos.push(qr.data.trim());
          }
        } catch {
          // Imagen corrupta o formato inesperado: se ignora esa imagen.
        }
      }
    }
  } catch {
    // Fallo global de la vía de imágenes: se pasa al fallback.
  }

  const huboQr = candidatos.length > 0;

  // --- Vía 2 (fallback): hipervínculos (Annots) y URLs en el texto ----------
  if (!huboQr) {
    try {
      const { links } = await extractLinks(proxy);
      candidatos.push(...links);
    } catch {
      // Sin anotaciones legibles: no pasa nada.
    }
    try {
      const { text } = await extractText(proxy, { mergePages: true });
      candidatos.push(...urlsEnTexto(text));
    } catch {
      // Sin capa de texto: no pasa nada.
    }
  }

  const filtrado = filtrarUrlsSat(candidatos);
  advertencias.push(...filtrado.advertencias);

  if (!huboQr && filtrado.urls.length > 0) {
    advertencias.push(
      "No se pudo decodificar un QR como imagen; la URL se tomó de los hipervínculos o del texto del PDF. Verifica que corresponda al QR impreso.",
    );
  }
  if (candidatos.length === 0) {
    advertencias.push("No se encontró QR en el PDF.");
  } else if (filtrado.urls.length === 0 && huboQr) {
    advertencias.push(
      "El QR del PDF se decodificó pero no contiene una URL del SAT; se descartó por seguridad.",
    );
  }

  return { urls: filtrado.urls, advertencias };
}
