// CERBERUS COMERCIO EXTERIOR — extracción del QR de un PDF (opinión 32-D). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/extraer-qr-pdf.ts  (Incrementos 49A/57)
// Propósito: Decodificar EN EL SERVIDOR el QR impreso en un PDF (típicamente la
//            opinión de cumplimiento 32-D del SAT) para obtener la URL del
//            validador del SAT sin que el capturista la teclee/pegue a mano.
//
// Estrategia (Node puro, SIN dependencias nativas nuevas):
//   1) unpdf.extractImages: saca los rasters embebidos de las primeras 4
//      páginas y los decodifica con jsQR (que exige RGBA; aquí se convierten
//      canales 1/3 → 4). Nota Inc 57: extractImages (unpdf 1.6.2) ya entrega
//      los datos DECODIFICADOS (image.data crudo de pdf.js) — no hace falta
//      jpeg-js — pero DESCARTA en silencio las imágenes cuyo largo de datos no
//      corresponde a 1/3/4 canales (p. ej. máscaras 1-bit, formato frecuente
//      del QR del SAT): por eso aquí cada descarte/derrota deja ADVERTENCIA.
//      Si el QR mide <200 px por lado se reintenta escalado 2x (vecino más
//      cercano) y además invertido (jsQR falla con QRs chicos o en negativo).
//      NOTA: unpdf 1.6.2 SÍ exporta renderPageAsImage, pero en Node exige
//      `canvasImport` hacia @napi-rs/canvas (dependencia NATIVA que este
//      proyecto NO tiene instalada); por eso el raster de página completa NO
//      se usa y la vía real es extractImages.
//   2) Fallback si NINGUNA URL del SAT salió de un QR: hipervínculos del PDF
//      (Annots, vía unpdf.extractLinks) y URLs presentes en el texto — muchos
//      PDF del SAT llevan el destino del QR también como anotación/hipervínculo.
//      El fallback corre SIEMPRE antes de rendirse (aunque un QR haya
//      decodificado contenido ajeno al SAT).
//   3) Anti-SSRF: SOLO se devuelven URLs https cuyo host sea del SAT
//      (sat.gob.mx o subdominios; misma allowlist que el verificador de
//      opinión). Lo demás genera advertencia, nunca se devuelve.
//
// FAIL-SAFE TOTAL: la función NUNCA lanza. Bytes basura, PDF cifrado o sin QR
// devuelven { urls: [], advertencias: [...] } para que quien llama decida
// (C9: el sistema sugiere/alerta, nunca bloquea la captura manual).
// DIAGNÓSTICO VISIBLE (Inc 57): cada camino que se rinde explica POR QUÉ en
// advertencias — nunca silencio.
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

/** Máximo de páginas a examinar (el QR de la 32-D suele vivir en la primera). */
const MAX_PAGINAS = 4;

/** Guardas de tamaño para no gastar CPU en imágenes absurdas (fotos escaneadas). */
const MAX_PIXELES_IMAGEN = 16_000_000; // ~4000x4000
const MAX_IMAGENES_POR_PAGINA = 20;

/** Lado mínimo (px) por debajo del cual se reintenta el QR escalado 2x. */
const MIN_LADO_QR = 200;

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
// Conversión/transformación de rasters (jsQR exige RGBA) — puras, testeables
// ============================================================================

/** Convierte un raster de 1 (gris), 3 (RGB) o 4 (RGBA) canales a RGBA. */
export function aRgba(
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

/**
 * Escala un raster RGBA al doble (vecino más cercano, sin dependencias).
 * Los QR chicos (<~200 px de lado) fallan en jsQR; duplicarlos suele bastar.
 */
export function escalar2xNearest(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const w2 = width * 2;
  const h2 = height * 2;
  const salida = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const yFuente = y >> 1;
    for (let x = 0; x < w2; x++) {
      const xFuente = x >> 1;
      const iFuente = (yFuente * width + xFuente) * 4;
      const iDestino = (y * w2 + x) * 4;
      salida[iDestino] = rgba[iFuente];
      salida[iDestino + 1] = rgba[iFuente + 1];
      salida[iDestino + 2] = rgba[iFuente + 2];
      salida[iDestino + 3] = rgba[iFuente + 3];
    }
  }
  return { data: salida, width: w2, height: h2 };
}

/** Invierte los canales RGB de un raster RGBA (el alfa se conserva). */
export function invertirRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const salida = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    salida[i] = 255 - rgba[i];
    salida[i + 1] = 255 - rgba[i + 1];
    salida[i + 2] = 255 - rgba[i + 2];
    salida[i + 3] = rgba[i + 3];
  }
  return salida;
}

/**
 * Intenta decodificar un QR de un raster RGBA con varias pasadas:
 * original → escalado 2x (si es chico) → invertido (en ambas escalas).
 * jsQR ya prueba la inversión interna (attemptBoth); la pasada explícita es
 * cinturón y tirantes ante variaciones de la librería. Devuelve null si nada.
 */
function decodificarQrRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const intentos: Array<{ data: Uint8ClampedArray; width: number; height: number }> = [
    { data: rgba, width, height },
  ];
  if (Math.min(width, height) < MIN_LADO_QR) {
    intentos.push(escalar2xNearest(rgba, width, height));
  }
  // Pasadas invertidas de cada escala.
  const escalas = intentos.length;
  for (let i = 0; i < escalas; i++) {
    const base = intentos[i];
    intentos.push({ data: invertirRgba(base.data), width: base.width, height: base.height });
  }
  for (const intento of intentos) {
    try {
      const qr = jsQR(intento.data, intento.width, intento.height, {
        inversionAttempts: "attemptBoth",
      });
      if (qr && qr.data.trim().length > 0) return qr.data.trim();
    } catch {
      // Un intento que lanza no aborta los demás.
    }
  }
  return null;
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
 * `{ urls: [], advertencias: ["No se encontró QR en el PDF.", …] }` — con una
 * advertencia ESPECÍFICA por cada camino que se rindió (diagnóstico visible).
 */
export async function extraerQrDePdf(pdf: Uint8Array): Promise<ResultadoQrPdf> {
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
  const candidatosQr: string[] = [];
  const paginas = Math.min(proxy.numPages, MAX_PAGINAS);
  let imagenesExaminadas = 0;
  try {
    for (let pagina = 1; pagina <= paginas; pagina++) {
      let imagenes: Awaited<ReturnType<typeof extractImages>>;
      try {
        imagenes = await extractImages(proxy, pagina);
      } catch {
        advertencias.push(
          `No se pudieron extraer las imágenes de la página ${pagina} (página ilegible); se continúa con las demás.`,
        );
        continue; // Fail-safe: se sigue con la siguiente página.
      }
      for (const imagen of imagenes.slice(0, MAX_IMAGENES_POR_PAGINA)) {
        try {
          const { width, height, channels } = imagen;
          if (width * height > MAX_PIXELES_IMAGEN) {
            advertencias.push(
              `Imagen de ${width}x${height} px (página ${pagina}) descartada por exceder el límite de tamaño.`,
            );
            continue;
          }
          const rgba = aRgba(imagen.data, width, height, channels);
          if (rgba.length !== width * height * 4) {
            advertencias.push(
              `Imagen de ${width}x${height} px (página ${pagina}) descartada: sus datos no corresponden a ${channels} canal(es); formato no soportado.`,
            );
            continue;
          }
          imagenesExaminadas++;
          const dato = decodificarQrRgba(rgba, width, height);
          if (dato !== null) candidatosQr.push(dato);
        } catch {
          advertencias.push(
            `Una imagen embebida de la página ${pagina} no se pudo procesar (datos corruptos o formato inesperado).`,
          );
        }
      }
    }
  } catch {
    advertencias.push(
      "Fallo inesperado al recorrer las imágenes del PDF; se intentan los respaldos (hipervínculos/texto).",
    );
  }

  if (candidatosQr.length === 0) {
    if (imagenesExaminadas === 0) {
      advertencias.push(
        `El PDF no contiene imágenes utilizables en sus primeras ${paginas} página(s): ` +
          "el QR puede estar en un formato que la extracción no soporta (p. ej. máscara 1-bit) o ser un dibujo vectorial.",
      );
    } else {
      advertencias.push(
        `Se examinaron ${imagenesExaminadas} imagen(es) embebida(s) en ${paginas} página(s) y ningún QR se pudo decodificar ` +
          "(se probó también la imagen invertida y escalada 2x).",
      );
    }
  }

  const filtradoQr = filtrarUrlsSat(candidatosQr);
  advertencias.push(...filtradoQr.advertencias);
  const urls: string[] = [...filtradoQr.urls];

  // --- Vía 2 (fallback): hipervínculos (Annots) y URLs en el texto ----------
  // Corre SIEMPRE que ningún QR haya aportado una URL del SAT (aunque algún QR
  // haya decodificado contenido ajeno): nunca rendirse sin agotar las Annots.
  if (urls.length === 0) {
    const candidatosFallback: string[] = [];
    try {
      const { links } = await extractLinks(proxy);
      candidatosFallback.push(...links);
    } catch {
      advertencias.push("No se pudieron leer los hipervínculos (anotaciones) del PDF.");
    }
    try {
      const { text } = await extractText(proxy, { mergePages: true });
      candidatosFallback.push(...urlsEnTexto(text));
    } catch {
      advertencias.push("No se pudo leer la capa de texto del PDF.");
    }
    const filtradoFallback = filtrarUrlsSat(candidatosFallback);
    advertencias.push(...filtradoFallback.advertencias);
    if (filtradoFallback.urls.length > 0) {
      urls.push(...filtradoFallback.urls);
      advertencias.push(
        "No se pudo decodificar un QR como imagen; la URL se tomó de los hipervínculos o del texto del PDF. Verifica que corresponda al QR impreso.",
      );
    }
  }

  if (urls.length === 0) {
    if (candidatosQr.length > 0 && filtradoQr.urls.length === 0) {
      advertencias.push(
        "El QR del PDF se decodificó pero no contiene una URL del SAT; se descartó por seguridad.",
      );
    }
    advertencias.push("No se encontró QR en el PDF.");
  }

  return { urls, advertencias };
}
