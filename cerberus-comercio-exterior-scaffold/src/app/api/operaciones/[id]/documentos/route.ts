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
//          bitácora. Desde el Inc 59 el algoritmo de guardado vive en
//          src/lib/documentos-despacho-guardar.ts (COMPARTIDO con el route de
//          pasos, que adjunta el acuse documental de cada paso).
//          Captura asistida: si el archivo es XML se le corre
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
import { TIPOS_DOC_DESPACHO } from "@/lib/documentos-despacho-catalogo";
import {
  EXTENSION_POR_MIME_DESPACHO,
  TAMANO_MAX_BYTES_DOC_DESPACHO,
  extraerDeXmlDespacho,
  guardarDocumentoDespacho,
  type ExtraidoDocDespacho,
} from "@/lib/documentos-despacho-guardar";

export const runtime = "nodejs";

/** Validación zod del campo de texto del multipart (tipo del catálogo). */
const EsquemaCampos = z.object({
  tipo: z.enum(TIPOS_DOC_DESPACHO),
});

type Params = { params: Promise<{ id: string }> };

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
  if (archivo.size > TAMANO_MAX_BYTES_DOC_DESPACHO) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo de 10 MB" },
      { status: 413 },
    );
  }
  // Algunos navegadores mandan los .xml sin MIME (o como text/plain): se
  // acepta también por la extensión del nombre.
  const extension =
    EXTENSION_POR_MIME_DESPACHO[archivo.type] ??
    (archivo.name.toLowerCase().endsWith(".xml") ? "xml" : undefined);
  if (extension === undefined) {
    return NextResponse.json(
      { error: "Formato no admitido: sube un PDF, un XML o una imagen (PNG, JPEG, WebP, HEIC)" },
      { status: 415 },
    );
  }

  // 4) Bytes crudos (el sha256 del CRUDO lo calcula el guardado compartido).
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const nombreArchivo = archivo.name.trim().length > 0 ? archivo.name.trim() : "documento";

  // 4b) Captura asistida: si es XML, extraer datos CFDI/carta porte del propio
  //     documento (fail-safe: nunca impide guardar; null si no se pudo). Los
  //     PDF quedan con extraido = null por ahora.
  const extraido: ExtraidoDocDespacho =
    extension === "xml" ? extraerDeXmlDespacho(buffer.toString("utf-8")) : null;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      // a) La operación debe existir dentro del tenant (RLS la limita al tenant).
      const operacion = await tx.operacion.findFirst({
        where: { id: operacionId },
        select: { id: true, clienteId: true },
      });
      if (!operacion) return { tipo: "no-operacion" };

      // b) Algoritmo COMPARTIDO de la bóveda (Inc 59): sha256 + WORM +
      //    Documento + evento encadenado DESPACHO_DOCUMENTO en bitácora.
      const guardado = await guardarDocumentoDespacho(tx, {
        tenantId,
        actor,
        operacionId: operacion.id,
        clienteId: operacion.clienteId,
        tipo,
        buffer,
        extension,
        contentType: archivo.type,
        nombreArchivo,
        extraido,
      });

      return {
        tipo: "ok",
        documentoId: guardado.documentoId,
        sha256: guardado.sha256,
        almacenado: guardado.almacenado,
        detalle: guardado.detalle,
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
