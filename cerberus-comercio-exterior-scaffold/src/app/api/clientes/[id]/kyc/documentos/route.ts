// CERBERUS COMERCIO EXTERIOR — API bóveda documental del expediente KYC. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/kyc/documentos/route.ts  (Incremento 43)
// Propósito: bóveda documental del expediente KYC 1.4.14 — el expediente debe
//            contener los DOCUMENTOS REALES del cliente (hallazgo de auditoría:
//            hasta el Inc 42 solo se sellaba el cuestionario, sin documento).
//   GET  — lista los Documento del expediente KYC del cliente.
//   POST — recibe multipart/form-data con `file` (PDF/imagen, máx 10 MB) y
//          `tipo` (validado contra el catálogo documentos-kyc-catalogo), sella
//          el binario CRUDO con sha256, lo sube al almacén WORM (ruta
//          content-addressed kyc/<tenant>/<cliente>/<sha256>.<ext>) y registra
//          el Documento ligado al ExpedienteKyc1414 (se crea mínimo si no
//          existe) + evento encadenado KYC_DOCUMENTO en bitácora.
//
// FAIL-SAFE (patrón del dossier, Inc 14): si el almacén WORM no está
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
import { TIPOS_DOC_KYC } from "@/lib/documentos-kyc-catalogo";

export const runtime = "nodejs";

/** Tamaño máximo del archivo subido (10 MB). */
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;

// Retención del expediente KYC 1414: ~3 años (mismo plazo que el cuestionario
// en src/app/api/clientes/[id]/kyc/route.ts; plazo propio del expediente).
const RETENCION_ANIOS_KYC = 3;

/** MIME permitidos (PDF/imagen) → extensión de la ruta content-addressed. */
const EXTENSION_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Validación zod del campo de texto del multipart (tipo del catálogo). */
const EsquemaCampos = z.object({
  tipo: z.enum(TIPOS_DOC_KYC),
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
// GET /api/clientes/[id]/kyc/documentos — lista los documentos del expediente.
// =============================================================================
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (tenantDeSesion(session) === null) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  try {
    const documentos = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) return null;

      // Sin expediente aún: lista vacía (el POST lo crea al primer documento).
      const expediente = await tx.expedienteKyc1414.findUnique({
        where: { clienteId: cliente.id },
        select: { id: true },
      });
      if (!expediente) return [];

      const filas = await tx.documento.findMany({
        where: { expedienteKycId: expediente.id },
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
        { error: "Cliente no encontrado para este tenant" },
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
// POST /api/clientes/[id]/kyc/documentos — sube un documento a la bóveda.
// =============================================================================

type ResultadoPost =
  | { tipo: "no-cliente" }
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

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
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
      { error: `Tipo de documento inválido: debe ser uno de ${TIPOS_DOC_KYC.join(", ")}` },
      { status: 400 },
    );
  }
  const tipo = campos.data.tipo;

  // 3) Validar el archivo (presencia, MIME PDF/imagen, tamaño máximo 10 MB).
  const archivo = form.get("file");
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: "Falta el campo file (PDF o imagen) en el formulario" },
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
  const extension = EXTENSION_POR_MIME[archivo.type];
  if (extension === undefined) {
    return NextResponse.json(
      { error: "Formato no admitido: sube un PDF o una imagen (PNG, JPEG, WebP, HEIC)" },
      { status: 415 },
    );
  }

  // 4) Bytes crudos → sha256 del CRUDO (sello reproducible contra el original).
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const sha256Documento = sha256(buffer);
  const nombreArchivo = archivo.name.trim().length > 0 ? archivo.name.trim() : "documento";

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      // a) El cliente debe existir dentro del tenant (RLS lo limita al tenant).
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) return { tipo: "no-cliente" };

      const ahora = new Date();
      const retieneHasta = new Date(ahora);
      retieneHasta.setFullYear(retieneHasta.getFullYear() + RETENCION_ANIOS_KYC);

      // b) Busca/CREA el ExpedienteKyc1414 (1:1 por clienteId). La creación
      //    mínima cubre los obligatorios del modelo (tenantId + clienteId) y
      //    fija custodio + retención; si ya existe, NO se sobreescribe nada
      //    (el cuestionario es dueño de custodio/retieneHasta).
      const expediente = await tx.expedienteKyc1414.upsert({
        where: { clienteId: cliente.id },
        create: {
          tenantId,
          clienteId: cliente.id,
          custodio: actor,
          retieneHasta,
        },
        update: {},
        select: { id: true },
      });

      // c) Almacén WORM (ruta content-addressed, nunca sobrescribir). El
      //    conector NUNCA lanza: sin token o con fallo, reporta ok:false y el
      //    documento queda anclado SOLO por su sha256 (fail-safe honesto).
      const ruta = `kyc/${tenantId}/${cliente.id}/${sha256Documento}.${extension}`;
      const guardado = await obtenerAlmacen().guardar(ruta, buffer, archivo.type);

      // d) Documento real de la bóveda, ligado al expediente KYC.
      const documento = await tx.documento.create({
        data: {
          tenantId,
          tipo,
          sha256: sha256Documento,
          wormUrl: guardado.ok ? (guardado.url ?? null) : null,
          expedienteKycId: expediente.id,
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
        accion: "KYC_DOCUMENTO",
        actor,
        clienteId: cliente.id,
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
          accion: "KYC_DOCUMENTO",
          payloadRef: `kyc-doc:${documento.id}:cliente:${cliente.id}:${tipo}`,
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
      { error: "No se pudo registrar el documento del expediente KYC" },
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
      documentoId: salida.documentoId,
      sha256: salida.sha256,
      almacenado: salida.almacenado,
      detalle: salida.detalle,
    },
    { status: 201 },
  );
}
