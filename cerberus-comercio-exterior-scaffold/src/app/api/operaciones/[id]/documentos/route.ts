// CERBERUS COMERCIO EXTERIOR — API bóveda documental del expediente del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/documentos/route.ts  (Incremento 50)
// Propósito: bóveda documental del expediente probatorio del DESPACHO — el
//            expediente de una operación de importación debe RESGUARDAR sus
//            documentos reales (pedimento, factura, carta porte, COVE, DODA…),
//            sellados y auditables.
//   GET  — lista los Documento del expediente probatorio de la operación.
//   POST — recibe multipart/form-data con `file` (PDF/XML/imagen, máx 10 MB) y
//          `tipo` (validado contra el catálogo documentos-despacho-catalogo),
//          sella el binario CRUDO con sha256, lo sube al almacén WORM (ruta
//          content-addressed despacho/<tenant>/<operacion>/<sha256>.<ext>) y
//          registra el Documento ligado al ExpedienteProbatorioDespacho (se
//          crea mínimo si no existe) + evento encadenado DESPACHO_DOCUMENTO en
//          bitácora. Captura asistida: si el archivo es XML se le corre
//          extraerDatosCfdiXml al momento de subirlo — lo extraído (RFC
//          emisor/receptor, total, conceptos resumidos, carta porte) va en el
//          payloadRef del evento (JSON) y en la respuesta, para que la captura
//          lo reutilice; si es PDF, extraido = null por ahora.
//
// FAIL-SAFE (patrón de la bóveda KYC, Inc 43): si el almacén WORM no está
// configurado (BLOB_READ_WRITE_TOKEN ausente) o falla, el Documento se guarda
// IGUAL con su sha256 y wormUrl null — el sello probatorio vale por sí mismo y
// el binario puede re-anclarse después (verificable contra el original).
//
// Multi-tenant (convención DURA): el tenantId SIEMPRE proviene del JWT
// verificado, NUNCA del body/ruta. Toda escritura corre dentro de
// withTenantFromSession (SET LOCAL app.tenant_id → RLS de Postgres).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { obtenerAlmacen } from "@/lib/almacen-worm";
import { TIPOS_DOC_DESPACHO } from "@/lib/documentos-despacho-catalogo";
import { extraerDatosCfdiXml } from "@/lib/extraer-cfdi-xml";

export const runtime = "nodejs";

/** Tamaño máximo del archivo subido (10 MB). */
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;

// Retención del expediente del despacho: 5 años (plazo de conservación de la
// documentación aduanera, art. 30 CFF / Ley Aduanera).
const RETENCION_ANIOS_DESPACHO = 5;

/** MIME permitidos (PDF/XML/imagen) → extensión de la ruta content-addressed. */
const EXTENSION_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Validación zod del campo de texto del multipart (tipo del catálogo). */
const EsquemaCampos = z.object({
  tipo: z.enum(TIPOS_DOC_DESPACHO),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Datos extraídos del XML subido (captura asistida — el capturista no teclea
 * lo que el documento ya dice). SOLO incluye los campos que el extractor
 * detectó; null si el archivo no es XML o no se reconoció ningún dato.
 */
type ExtraidoDocDespacho = {
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  moneda?: string;
  /** Conceptos resumidos: "descripción (cantidad unidad)" de cada partida. */
  conceptos?: string[];
  cartaPorte?: {
    origenCp?: string;
    destinoCp?: string;
    placaVm?: string;
  };
} | null;

/**
 * Corre el extractor CFDI/carta porte sobre el texto del XML y RESUME lo
 * encontrado. FAIL-SAFE: el extractor nunca lanza y un XML irreconocible
 * NUNCA impide guardar el documento — se devuelve null.
 */
function extraerDeXml(texto: string): ExtraidoDocDespacho {
  const datos = extraerDatosCfdiXml(texto);
  const extraido: NonNullable<ExtraidoDocDespacho> = {};

  if (datos.emisorRfc !== undefined) extraido.emisorRfc = datos.emisorRfc;
  if (datos.receptorRfc !== undefined) extraido.receptorRfc = datos.receptorRfc;
  if (datos.total !== undefined) extraido.total = datos.total;
  if (datos.moneda !== undefined) extraido.moneda = datos.moneda;

  const conceptos = datos.conceptos
    .map((c) => {
      const partes: string[] = [];
      if (c.descripcion !== undefined) partes.push(c.descripcion);
      if (c.cantidad !== undefined) {
        partes.push(`(${c.cantidad}${c.claveUnidad !== undefined ? ` ${c.claveUnidad}` : ""})`);
      }
      return partes.join(" ");
    })
    .filter((r) => r.length > 0);
  if (conceptos.length > 0) extraido.conceptos = conceptos;

  if (datos.cartaPorte !== undefined) {
    const cp: NonNullable<NonNullable<ExtraidoDocDespacho>["cartaPorte"]> = {};
    if (datos.cartaPorte.origen?.codigoPostal !== undefined) {
      cp.origenCp = datos.cartaPorte.origen.codigoPostal;
    }
    if (datos.cartaPorte.destino?.codigoPostal !== undefined) {
      cp.destinoCp = datos.cartaPorte.destino.codigoPostal;
    }
    if (datos.cartaPorte.placaVm !== undefined) cp.placaVm = datos.cartaPorte.placaVm;
    if (Object.keys(cp).length > 0) extraido.cartaPorte = cp;
  }

  return Object.keys(extraido).length > 0 ? extraido : null;
}

/** Actor legible de la sesión (mismo criterio que las rutas hermanas). */
function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

/** Extrae el tenantId del JWT verificado (401 si no hay sesión válida). */
function tenantDeSesion(session: unknown): string | null {
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : null;
}

// =============================================================================
// GET /api/operaciones/[id]/documentos — lista los documentos del expediente.
// =============================================================================
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (tenantDeSesion(session) === null) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: operacionId } = await params;
  if (!operacionId) {
    return NextResponse.json({ error: "Operación no especificada" }, { status: 400 });
  }

  try {
    const documentos = await withTenantFromSession(session, async (tx) => {
      const operacion = await tx.operacion.findFirst({
        where: { id: operacionId },
        select: { id: true },
      });
      if (!operacion) return null;

      // Documentos de la bóveda del despacho: ligados al expediente probatorio
      // Y a esta operación (FK directa; el expediente es 1:1 con el cliente y
      // puede abarcar varias operaciones).
      const filas = await tx.documento.findMany({
        where: {
          operacionId: operacion.id,
          expedienteProbatorioId: { not: null },
        },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          tipo: true,
          sha256: true,
          wormUrl: true,
          vence: true,
          creadoEn: true,
        },
      });
      return filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        sha256: f.sha256,
        almacenado: f.wormUrl !== null,
        wormUrl: f.wormUrl,
        vence: f.vence?.toISOString() ?? null,
        creadoEn: f.creadoEn.toISOString(),
      }));
    });

    if (documentos === null) {
      return NextResponse.json(
        { error: "Operación no encontrada para este tenant" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, documentos }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los documentos del expediente" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/operaciones/[id]/documentos — sube un documento a la bóveda.
// =============================================================================

type ResultadoPost =
  | { tipo: "no-operacion" }
  | {
      tipo: "ok";
      documentoId: string;
      sha256: string;
      almacenado: boolean;
      detalle: string;
    };

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId = tenantDeSesion(session);
  if (tenantId === null) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);

  const { id: operacionId } = await params;
  if (!operacionId) {
    return NextResponse.json({ error: "Operación no especificada" }, { status: 400 });
  }

  // 1) Leer el multipart/form-data (falla limpio si el body no es multipart).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo debe ser multipart/form-data con los campos tipo y file" },
      { status: 400 },
    );
  }

  // 2) Validar el tipo documental contra el catálogo (zod).
  const campos = EsquemaCampos.safeParse({ tipo: form.get("tipo") });
  if (!campos.success) {
    return NextResponse.json(
      { error: `Tipo de documento inválido: debe ser uno de ${TIPOS_DOC_DESPACHO.join(", ")}` },
      { status: 400 },
    );
  }
  const tipo = campos.data.tipo;

  // 3) Validar el archivo (presencia, MIME PDF/XML/imagen, tamaño máx 10 MB).
  const archivo = form.get("file");
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Falta el campo file (PDF, XML o imagen) en el formulario" },
      { status: 400 },
    );
  }
  if (archivo.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (archivo.size > TAMANO_MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo de 10 MB" },
      { status: 413 },
    );
  }
  // Algunos navegadores mandan los .xml sin MIME (o como text/plain): se
  // acepta también por la extensión del nombre.
  const extension =
    EXTENSION_POR_MIME[archivo.type] ??
    (archivo.name.toLowerCase().endsWith(".xml") ? "xml" : undefined);
  if (extension === undefined) {
    return NextResponse.json(
      { error: "Formato no admitido: sube un PDF, un XML o una imagen (PNG, JPEG, WebP, HEIC)" },
      { status: 415 },
    );
  }

  // 4) Bytes crudos → sha256 del CRUDO (sello reproducible contra el original).
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const sha256Documento = sha256(buffer);
  const nombreArchivo = archivo.name.trim().length > 0 ? archivo.name.trim() : "documento";

  // 4b) Captura asistida: si es XML, extraer datos CFDI/carta porte del propio
  //     documento (fail-safe: nunca impide guardar; null si no se pudo). Los
  //     PDF quedan con extraido = null por ahora.
  const extraido: ExtraidoDocDespacho =
    extension === "xml" ? extraerDeXml(buffer.toString("utf-8")) : null;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      // a) La operación debe existir dentro del tenant (RLS la limita al tenant).
      const operacion = await tx.operacion.findFirst({
        where: { id: operacionId },
        select: { id: true, clienteId: true },
      });
      if (!operacion) return { tipo: "no-operacion" };

      const ahora = new Date();
      const retieneHasta = new Date(ahora);
      retieneHasta.setFullYear(retieneHasta.getFullYear() + RETENCION_ANIOS_DESPACHO);

      // b) Busca/CREA el ExpedienteProbatorioDespacho (1:1 por clienteId — el
      //    expediente probatorio es del cliente y abarca sus operaciones). La
      //    creación mínima cubre los obligatorios del modelo (tenantId +
      //    clienteId) y fija custodio + retención; si ya existe, NO se
      //    sobreescribe nada.
      const expediente = await tx.expedienteProbatorioDespacho.upsert({
        where: { clienteId: operacion.clienteId },
        create: {
          tenantId,
          clienteId: operacion.clienteId,
          custodio: actor,
          retieneHasta,
        },
        update: {},
        select: { id: true },
      });

      // c) Almacén WORM (ruta content-addressed, nunca sobrescribir). El
      //    conector NUNCA lanza: sin token o con fallo, reporta ok:false y el
      //    documento queda anclado SOLO por su sha256 (fail-safe honesto).
      const ruta = `despacho/${tenantId}/${operacion.id}/${sha256Documento}.${extension}`;
      const guardado = await obtenerAlmacen().guardar(ruta, buffer, archivo.type);

      // d) Documento real de la bóveda, ligado al expediente probatorio Y a la
      //    operación (FK directa del Inc 8, para listar por operación).
      const documento = await tx.documento.create({
        data: {
          tenantId,
          tipo,
          sha256: sha256Documento,
          wormUrl: guardado.ok ? (guardado.url ?? null) : null,
          expedienteProbatorioId: expediente.id,
          operacionId: operacion.id,
          vence: retieneHasta,
        },
        select: { id: true },
      });

      // e) Evento encadenado en bitácora (sha256 del payload canónico + hashPrev).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "DESPACHO_DOCUMENTO",
        actor,
        operacionId: operacion.id,
        expedienteId: expediente.id,
        documentoId: documento.id,
        tipo,
        nombreArchivo,
        sha256Documento,
        almacenado: guardado.ok,
        almacenDetalle: guardado.detalle,
        creadoEn: ahora.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "DESPACHO_DOCUMENTO",
          // payloadRef en JSON (CONTRATO: mismo patrón que "kyc-doc", Inc 48A —
          // los lectores deben ser defensivos con formatos previos).
          payloadRef: JSON.stringify({
            ref: "despacho-doc",
            documentoId: documento.id,
            operacionId: operacion.id,
            tipo,
            extraido,
          }),
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ahora,
        },
        select: { id: true },
      });

      const detalle = guardado.ok
        ? `Documento almacenado en la bóveda WORM y sellado (sha256 ${sha256Documento.slice(0, 12)}…).`
        : `Documento sellado por sha256; sin copia en almacén WORM (${guardado.detalle}).`;
      return {
        tipo: "ok",
        documentoId: documento.id,
        sha256: sha256Documento,
        almacenado: guardado.ok,
        detalle,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el documento del expediente del despacho" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-operacion") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      documentoId: salida.documentoId,
      sha256: salida.sha256,
      almacenado: salida.almacenado,
      detalle: salida.detalle,
      extraido,
    },
    { status: 201 },
  );
}
