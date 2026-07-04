// CERBERUS COMERCIO EXTERIOR — API opinión 32-D ingestada + validación + cotejo. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/opinion/route.ts  (Incrementos 22/49B)
// Propósito: POST que ingiere el TEXTO de la opinión de cumplimiento (32-D) que
//            el cliente entrega impresa/PDF, valida su AUTENTICIDAD con el
//            validador automático (@/lib/validador-opinion) para detectar
//            falsificaciones, intenta el COTEJO EN VIVO ante el SAT
//            (@/lib/verificador-opinion-sat), persiste
//            OpinionCumplimientoIngestada, registra un evento encadenado en
//            bitácora y deja una VerificacionCumplimiento de la fuente
//            OPINION_32D acorde al veredicto + sentido + cotejo. GET lista las
//            opiniones ingestadas del cliente.
//
// Inc 49B (cotejo en vivo automático + evidencia): si el capturista no pegó la
// URL del QR, se LEE el QR del propio PDF (@/lib/extraer-qr-pdf — solo URLs
// *.sat.gob.mx) y con ella se coteja EN VIVO contra el validador del SAT. La
// respuesta del SAT queda SELLADA como evidencia: sha256 del body + copia WORM
// (almacen-worm, clave cotejo/<tenant>/<sha256>.html) si hay Blob configurado;
// la URL del validador viaja en cotejoDetalle en formato parseable "url=…" para
// que la UI ofrezca "Abrir en el portal del SAT". Fail-safe TOTAL: ningún fallo
// de QR/red/WORM hace fallar la ingesta (C9).
//
// Inc 57 (diagnóstico VISIBLE): el flujo SIEMPRE cuenta qué pasó con el QR y el
// cotejo — las advertencias de extraerQrDePdf y del intento de cotejo se
// acumulan, viajan en la respuesta JSON (campo `advertencias`) y su resumen se
// persiste en cotejoDetalle (" [avisos: …]") aunque el estado sea
// NO_DISPONIBLE. "No apareció nada" es imposible. El sellado de evidencia y la
// construcción del detalle viven en @/lib/cotejo-evidencia (compartidos con el
// re-cotejo api/clientes/[id]/opinion/[opinionId]/cotejar).
//
// Multi-tenant (convención DURA): el tenantId SIEMPRE proviene del JWT verificado,
// NUNCA del body/params. Toda escritura corre dentro de withTenantFromSession.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { analizarOpinion, type AnalisisOpinion, type SentidoOpinion } from "@/lib/validador-opinion";
import {
  obtenerVerificadorOpinion,
  urlEsDelSat,
  type EstadoCotejoSat,
  type EvidenciaCotejo,
} from "@/lib/verificador-opinion-sat";
import { certificadosEmisor, verificarSelloOpinion } from "@/lib/sello-opinion";
import { descargarCertificadoSat } from "@/lib/cert-sat-rccf";
import { extraerQrDePdf } from "@/lib/extraer-qr-pdf";
import { construirCotejoDetalle, sellarEvidenciaCotejo } from "@/lib/cotejo-evidencia";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    // Texto de la opinión (copiado/OCR del PDF impreso). Opcional si se aporta la
    // URL del QR o el PDF.
    texto: z.string().trim().max(262144).optional(),
    nombreArchivo: z.string().trim().max(256).optional(),
    // URL del QR (decodificada en el navegador desde una imagen, o escaneada).
    urlQr: z.string().trim().url("La URL del QR no es válida").max(2048).optional(),
    // PDF de la opinión en base64: el servidor extrae el texto (y la Cadena
    // Original + Sello) con unpdf. Límite ~9 MB en base64.
    pdfBase64: z.string().max(12_000_000).optional(),
  })
  .refine(
    (d) =>
      (d.texto !== undefined && d.texto.length >= 40) ||
      d.urlQr !== undefined ||
      (d.pdfBase64 !== undefined && d.pdfBase64.length > 0),
    { message: "Aporta el PDF de la opinión, su texto (mín. 40 caracteres) o la URL del QR." },
  );

/** Extrae el texto de un PDF (bytes) con unpdf. Devuelve "" si falla. */
async function textoDePdf(pdfBytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(pdfBytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

/**
 * Lee el QR de la opinión desde el propio PDF (Inc 49B) y devuelve la primera
 * URL del SAT encontrada JUNTO CON las advertencias del intento (Inc 57:
 * diagnóstico visible, nada se traga). Fail-safe: cualquier fallo devuelve
 * url null + advertencia; la ingesta jamás falla por esto (C9).
 */
async function urlQrDesdePdf(
  pdfBytes: Uint8Array,
): Promise<{ url: string | null; advertencias: string[] }> {
  try {
    const { urls, advertencias } = await extraerQrDePdf(pdfBytes);
    return { url: urls.find((u) => urlEsDelSat(u)) ?? null, advertencias };
  } catch {
    return {
      url: null,
      advertencias: ["Fallo inesperado al leer el QR del PDF; se continúa sin URL del validador."],
    };
  }
}

/**
 * Coteja la opinión. PRIORIDAD:
 *   1) Sello digital (SAT/IMSS) verificado CRIPTOGRÁFICAMENTE contra el
 *      certificado del emisor (si está configurado): CONFIRMADA / DISCREPANCIA.
 *   2) Cotejo EN VIVO por QR/URL del SAT (o gateway HTTP).
 *   3) NO_DISPONIBLE (con nota si hay sello pero falta el certificado).
 */
async function cotejarOpinion(
  analisis: AnalisisOpinion | null,
  rfcCliente: string,
  urlQr: string | undefined,
): Promise<{
  estado: EstadoCotejoSat;
  detalle: string;
  sentidoSat?: string | null;
  /** Respuesta cruda del SAT (cotejo en vivo): evidencia a sellar (Inc 49B). */
  evidencia?: EvidenciaCotejo;
  /** URL del validador del SAT usada/disponible (para el enlace de la UI). */
  urlSat: string | null;
}> {
  const urlLive = urlQr ?? analisis?.urlVerificacion ?? null;
  // URL del validador del SAT disponible (aunque el cotejo sea criptográfico,
  // se conserva para ofrecer "Abrir en el portal del SAT" en la UI).
  const urlSat = urlLive !== null && urlEsDelSat(urlLive) ? urlLive : null;

  if (analisis && analisis.cadenaOriginal && analisis.selloBase64) {
    // Certificados candidatos: los configurados por entorno + (SAT) el
    // descargado AUTOMÁTICAMENTE del repositorio RCCF por el número de serie que
    // trae la propia cadena. Así el cotejo criptográfico del SAT no requiere
    // configuración manual.
    const certs = certificadosEmisor(analisis.emisor);
    let fuenteAuto = false;
    if (analisis.emisor === "SAT" && analisis.serieCertificado) {
      const auto = await descargarCertificadoSat(analisis.serieCertificado);
      if (auto) {
        certs.push(auto);
        fuenteAuto = true;
      }
    }

    if (certs.length > 0) {
      for (const cert of certs) {
        const r = verificarSelloOpinion({
          cadenaOriginal: analisis.cadenaOriginal,
          selloBase64: analisis.selloBase64,
          certificado: cert,
        });
        if (r.valido) {
          const nota =
            fuenteAuto && analisis.serieCertificado
              ? ` (certificado del SAT descargado del repositorio RCCF, serie ${analisis.serieCertificado})`
              : "";
          return {
            estado: "CONFIRMADA",
            detalle: `Cotejo criptográfico (${analisis.emisor}): ${r.detalle}${nota}`,
            sentidoSat: analisis.sentido,
            urlSat,
          };
        }
      }
      return {
        estado: "DISCREPANCIA",
        detalle: `Cotejo criptográfico (${analisis.emisor}): el sello NO valida contra el certificado del emisor (documento alterado o certificado incorrecto).`,
        sentidoSat: analisis.sentido,
        urlSat,
      };
    }

    // Sin certificado disponible (ni configurado ni descargable): intentar cotejo
    // en vivo; si tampoco, dejar la autenticidad estructural con nota honesta.
    const live = await obtenerVerificadorOpinion().cotejar({
      rfc: rfcCliente,
      folio: analisis.folio,
      sentidoDeclarado: analisis.sentido,
      urlVerificacion: urlLive,
    });
    if (live.estado === "CONFIRMADA" || live.estado === "DISCREPANCIA") {
      return { ...live, urlSat };
    }
    const notaCert =
      analisis.emisor === "SAT"
        ? "No se pudo descargar el certificado del SAT (RCCF) para el cotejo criptográfico automático; "
        : `Falta el certificado público del emisor (define ${analisis.emisor}_OPINION_CERT); `;
    return {
      estado: "NO_DISPONIBLE",
      detalle: `${notaCert}la autenticidad estructural (cadena original + sello) sí está confirmada.`,
      urlSat,
    };
  }

  // Sin cadena/sello: cotejo en vivo (QR/HTTP).
  const live = await obtenerVerificadorOpinion().cotejar({
    rfc: rfcCliente,
    folio: analisis?.folio ?? null,
    sentidoDeclarado: analisis?.sentido ?? "INDETERMINADO",
    urlVerificacion: urlLive,
  });
  return { ...live, urlSat };
}

type Params = { params: Promise<{ id: string }> };

type ResultadoPost =
  | { tipo: "no-cliente" }
  | {
      tipo: "ok";
      opinionId: string;
      veredicto: AnalisisOpinion["resultado"];
      resumen: string;
      checks: AnalisisOpinion["checks"];
      extraido: {
        emisor: string;
        rfc: string | null;
        folio: string | null;
        sentido: SentidoOpinion;
        fechaEmision: string | null;
      };
      cotejo: { estado: EstadoCotejoSat; detalle: string; url: string | null };
      opinion32d: { resultado: string; detalle: string };
      /** URL del QR leída del propio PDF (Inc 49B), si se detectó. */
      urlQrDetectada: string | null;
      /** Diagnóstico visible (Inc 57): qué pasó con el QR y con el cotejo. */
      advertencias: string[];
    };

/** Normaliza un sentido reportado por el SAT al enum SentidoOpinion. */
function aSentidoOpinion(valor: string | null | undefined): SentidoOpinion {
  switch ((valor ?? "").toUpperCase()) {
    case "POSITIVA":
      return "POSITIVA";
    case "NEGATIVA":
      return "NEGATIVA";
    case "SIN_OBLIGACIONES":
      return "SIN_OBLIGACIONES";
    case "NO_INSCRITO":
      return "NO_INSCRITO";
    default:
      return "INDETERMINADO";
  }
}

/** Mapea el sentido a resultado de cumplimiento (positivo = al corriente). */
function porSentido(sentido: SentidoOpinion, nota: string): { resultado: string; detalle: string } {
  switch (sentido) {
    case "POSITIVA":
    case "SIN_OBLIGACIONES":
      return { resultado: "AL_CORRIENTE", detalle: `Opinión 32-D ${sentido}. ${nota}` };
    case "NEGATIVA":
    case "NO_INSCRITO":
      return {
        resultado: "ALERTA",
        detalle: `Opinión 32-D ${sentido}. Alerta para revisión humana (C9). ${nota}`,
      };
    default:
      return { resultado: "NO_DISPONIBLE", detalle: `Opinión sin sentido claro. ${nota}` };
  }
}

/** Mapea veredicto + sentido + cotejo a la VerificacionCumplimiento OPINION_32D.
 *  El cotejo EN VIVO tiene PRIORIDAD sobre la heurística de texto: una
 *  confirmación (o discrepancia) del SAT manda sobre el análisis del documento. */
function resultadoOpinion(
  veredicto: AnalisisOpinion["resultado"],
  sentido: SentidoOpinion,
  cotejo: EstadoCotejoSat,
): { resultado: string; detalle: string } {
  // 1) El SAT confirmó el folio en vivo: es la prueba más fuerte.
  if (cotejo === "CONFIRMADA") {
    return porSentido(sentido, "Ratificada por cotejo EN VIVO ante el SAT.");
  }
  // 2) El SAT discrepa / no localiza el folio: alerta fuerte (posible falso).
  if (cotejo === "DISCREPANCIA") {
    return {
      resultado: "ALERTA",
      detalle: "El cotejo en vivo ante el SAT discrepa o no localiza el folio. Revisión humana (C9).",
    };
  }
  // 3) Sin cotejo en vivo (NO_INTENTADO/NO_DISPONIBLE): decide el análisis textual.
  if (veredicto === "NO_AUTENTICA") {
    return {
      resultado: "ALERTA",
      detalle: "La opinión entregada NO es auténtica (probable falsificación). Revisión humana (C9).",
    };
  }
  if (veredicto === "NO_VERIFICABLE" || veredicto === "SOSPECHOSA") {
    return {
      resultado: "ALERTA",
      detalle: "La opinión entregada es sospechosa o no verificable. Revisión humana y cotejo en vivo.",
    };
  }
  // veredicto AUTENTICA sin cotejo en vivo.
  return porSentido(
    sentido,
    "Auténtica por análisis del documento; cotejo en vivo ante el SAT pendiente/no disponible.",
  );
}

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// =============================================================================
// POST /api/clientes/[id]/opinion — ingesta + validación de autenticidad + cotejo.
// =============================================================================
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parseado = bodySchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Body inválido", detalles: parseado.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const { texto, nombreArchivo, urlQr, pdfBase64 } = parseado.data;

  // Si viene el PDF, extraer su texto en el servidor (trae Cadena Original +
  // Sello). Se prefiere el texto del PDF; si falla, se usa el texto pegado.
  const pdfBytes = pdfBase64 ? new Uint8Array(Buffer.from(pdfBase64, "base64")) : null;
  const textoPdf = pdfBytes ? await textoDePdf(pdfBytes) : "";
  const textoEfectivo = textoPdf.trim().length >= 40 ? textoPdf : (texto ?? "");
  if (pdfBase64 && textoPdf.trim().length < 40 && (texto ?? "").length < 40 && urlQr === undefined) {
    return NextResponse.json(
      { error: "No se pudo extraer texto del PDF (¿es una imagen escaneada sin capa de texto?). Pega el texto o la URL del QR." },
      { status: 400 },
    );
  }

  // Inc 49B: si el capturista NO pegó la URL del QR pero sí hay PDF, leer el QR
  // del propio documento (extraer-qr-pdf, solo URLs *.sat.gob.mx). Fail-safe.
  // Inc 57: las advertencias del intento se acumulan y se DEVUELVEN (nunca silencio).
  const advertencias: string[] = [];
  let urlQrDetectada: string | null = null;
  if (urlQr === undefined && pdfBytes) {
    const qr = await urlQrDesdePdf(pdfBytes);
    urlQrDetectada = qr.url;
    advertencias.push(...qr.advertencias);
    if (qr.url === null) {
      advertencias.push("QR no encontrado en el PDF: el cotejo en vivo no tiene URL del validador.");
    }
  }
  // Si el capturista pegó una URL que NO es del SAT, se avisa (no se usa: anti-SSRF).
  if (urlQr !== undefined && !urlEsDelSat(urlQr)) {
    let hostAjeno = urlQr;
    try {
      hostAjeno = new URL(urlQr).hostname;
    } catch {
      // Se deja la URL cruda recortada.
      hostAjeno = urlQr.slice(0, 80);
    }
    advertencias.push(`URL no-SAT descartada: ${hostAjeno} (se exige https y dominio sat.gob.mx).`);
  }
  const urlQrEfectiva = urlQr ?? urlQrDetectada ?? undefined;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true },
      });
      if (!cliente) return { tipo: "no-cliente" };

      // Análisis textual solo si hay texto suficiente; si es flujo "solo QR",
      // no hay texto y el veredicto proviene del cotejo en vivo.
      const hayTexto = textoEfectivo.length >= 40;
      const analisis = hayTexto ? analizarOpinion(textoEfectivo, cliente.rfc) : null;
      const textoOriginal = hayTexto
        ? textoEfectivo
        : `(Verificación por QR sin texto de opinión). URL: ${urlQrEfectiva ?? "—"}`;

      // Cotejo: sello criptográfico (SAT/IMSS) si hay cadena+sello+certificado;
      // si no, cotejo en vivo por QR/URL del SAT (la del capturista o la leída
      // del propio PDF, Inc 49B) o gateway configurado.
      const cotejo = await cotejarOpinion(analisis, cliente.rfc, urlQrEfectiva);

      // Inc 49B/57: sellar la EVIDENCIA del cotejo en vivo (sha256 + WORM) y
      // armar cotejoDetalle con los bloques parseables "url=…", "evidencia…" y
      // el resumen de avisos del QR — se persiste AUNQUE el estado sea
      // NO_DISPONIBLE (el porqué del silencio queda escrito).
      const evidenciaSellada =
        cotejo.evidencia && cotejo.evidencia.cuerpo.length > 0
          ? await sellarEvidenciaCotejo(tenantId, cotejo.evidencia)
          : null;
      const cotejoDetalle = construirCotejoDetalle({
        detalle: cotejo.detalle,
        urlSat: cotejo.urlSat,
        evidencia: cotejo.evidencia ?? null,
        evidenciaSellada,
        advertencias,
      });

      // Inc 57: si el cotejo en vivo no concluyó, que la respuesta lo DIGA
      // (después de armar el detalle, para no duplicar el mismo texto en él).
      if (cotejo.estado === "NO_DISPONIBLE" || cotejo.estado === "NO_INTENTADO") {
        advertencias.push(`Cotejo falló o no se intentó: ${cotejo.detalle}`);
      }

      // Sentido efectivo: el del documento si se detectó; si no, el que reportó
      // el SAT en el cotejo (clave para el flujo "solo QR").
      const sentidoEfectivo: SentidoOpinion =
        analisis && analisis.sentido !== "INDETERMINADO"
          ? analisis.sentido
          : aSentidoOpinion(cotejo.sentidoSat);
      const veredicto = analisis?.resultado ?? "NO_VERIFICABLE";
      const huella = analisis?.sha256 ?? sha256(textoOriginal);
      const resumen = analisis?.resumen ?? "Verificación por QR (sin análisis de texto).";
      const checks = analisis?.checks ?? [];
      const emisor = analisis?.emisor ?? "DESCONOCIDO";

      const ts = new Date();
      const opinion = await tx.opinionCumplimientoIngestada.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          nombreArchivo: nombreArchivo ?? null,
          sha256: huella,
          textoOriginal,
          rfcDocumento: analisis?.rfcDocumento ?? null,
          folio: analisis?.folio ?? null,
          sentido: sentidoEfectivo,
          fechaEmision: analisis?.fechaEmision ? new Date(analisis.fechaEmision) : null,
          vigenciaHasta: analisis?.vigenciaHasta ? new Date(analisis.vigenciaHasta) : null,
          resultado: veredicto,
          observaciones: JSON.stringify({
            emisor,
            resumen,
            checks,
            cadenaOriginal: analisis?.cadenaOriginal ?? null,
            selloPresente: analisis?.selloBase64 !== null && analisis?.selloBase64 !== undefined,
          }),
          cotejoEnVivo: cotejo.estado,
          cotejoDetalle,
          actor,
          creadoEn: ts,
        },
        select: { id: true },
      });

      const opinion32d = resultadoOpinion(veredicto, sentidoEfectivo, cotejo.estado);
      await tx.verificacionCumplimiento.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          fuente: "OPINION_32D",
          resultado: opinion32d.resultado as
            | "AL_CORRIENTE"
            | "NO_DISPONIBLE"
            | "ALERTA"
            | "INHABILITADO_PRESUNTO"
            | "INHABILITADO_DEFINITIVO",
          detalle: opinion32d.detalle,
          snapshotSha256: huella,
          consultadoEn: ts,
        },
        select: { id: true },
      });

      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "OPINION_INGESTADA",
        actor,
        clienteId: cliente.id,
        opinionId: opinion.id,
        opinionSha256: huella,
        veredicto,
        folio: analisis?.folio ?? null,
        cotejo: cotejo.estado,
        // Evidencia del cotejo en vivo (Inc 49B): URL del validador del SAT,
        // huella sha256 del body respondido y su copia WORM (si se guardó).
        cotejoUrl: cotejo.urlSat,
        cotejoEvidenciaSha256: evidenciaSellada?.sha256 ?? null,
        cotejoEvidenciaWormUrl: evidenciaSellada?.wormUrl ?? null,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "OPINION_INGESTADA",
          payloadRef: `opinion:${opinion.id}:cliente:${cliente.id}:${veredicto}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return {
        tipo: "ok",
        opinionId: opinion.id,
        veredicto,
        resumen,
        checks,
        extraido: {
          emisor,
          rfc: analisis?.rfcDocumento ?? null,
          folio: analisis?.folio ?? null,
          sentido: sentidoEfectivo,
          fechaEmision: analisis?.fechaEmision ?? null,
        },
        cotejo: { estado: cotejo.estado, detalle: cotejoDetalle, url: cotejo.urlSat },
        opinion32d,
        urlQrDetectada,
        advertencias,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar la opinión de cumplimiento" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-cliente") {
    return NextResponse.json(
      { error: "Cliente no encontrado para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      opinionId: salida.opinionId,
      veredicto: salida.veredicto,
      resumen: salida.resumen,
      checks: salida.checks,
      extraido: salida.extraido,
      cotejo: salida.cotejo,
      opinion32d: salida.opinion32d,
      urlQrDetectada: salida.urlQrDetectada,
      advertencias: salida.advertencias,
    },
    { status: 201 },
  );
}

// =============================================================================
// GET /api/clientes/[id]/opinion — lista las opiniones ingestadas del cliente.
// =============================================================================
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  try {
    const opiniones = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) return null;
      const filas = await tx.opinionCumplimientoIngestada.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          nombreArchivo: true,
          sha256: true,
          rfcDocumento: true,
          folio: true,
          sentido: true,
          fechaEmision: true,
          resultado: true,
          observaciones: true,
          cotejoEnVivo: true,
          cotejoDetalle: true,
          actor: true,
          creadoEn: true,
        },
      });
      return filas.map((f) => ({
        id: f.id,
        nombreArchivo: f.nombreArchivo,
        sha256: f.sha256,
        rfcDocumento: f.rfcDocumento,
        folio: f.folio,
        sentido: f.sentido,
        fechaEmision: f.fechaEmision?.toISOString() ?? null,
        resultado: f.resultado,
        observaciones: f.observaciones,
        cotejoEnVivo: f.cotejoEnVivo,
        cotejoDetalle: f.cotejoDetalle,
        actor: f.actor,
        creadoEn: f.creadoEn.toISOString(),
      }));
    });

    if (opiniones === null) {
      return NextResponse.json(
        { error: "Cliente no encontrado para este tenant" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, opiniones }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar las opiniones" },
      { status: 500 },
    );
  }
}
