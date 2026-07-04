// CERBERUS COMERCIO EXTERIOR — API del expediente doble 3.1.42. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/expediente-doble/route.ts  (Incremento 54)
// Propósito: operar el EXPEDIENTE DOBLE de la regla 3.1.42 RGCE — el agente
//            aduanal Y la empresa importadora/exportadora conservan CADA UNO su
//            expediente de las operaciones (hallazgo de auditoría: el modelo
//            ExpedienteDoble3142 existía sin ruta ni UI, vacío operativo).
//   GET  — devuelve el expediente del cliente con sus documentos (o null si
//          aún no existe; el POST lo crea al primer documento).
//   POST — multipart/form-data con `file` (PDF/imagen, máx 10 MB), `tipo`
//          (catálogo expediente-doble-catalogo) y `parte` ("AGENTE"|"EMPRESA").
//          El modelo NO tiene campo "parte": se guarda como PREFIJO del
//          Documento.tipo ("AGENTE:COPIA_PEDIMENTO"). Sella el binario CRUDO
//          con sha256, lo sube al almacén WORM (ruta content-addressed
//          doble3142/<tenant>/<cliente>/<sha256>.<ext>) y registra el
//          Documento ligado por la FK real expedienteDobleId (busca/crea el
//          ExpedienteDoble3142 del cliente) + evento encadenado
//          EXPEDIENTE_DOBLE_DOC en bitácora.
//
// FAIL-SAFE (patrón del dossier / bóveda KYC): si el almacén WORM no está
// configurado o falla, el Documento se guarda IGUAL con su sha256 y wormUrl
// null — el sello probatorio vale por sí mismo y el binario puede re-anclarse.
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
import {
  TIPOS_DOC_DOBLE_3142,
  PARTES_EXPEDIENTE_DOBLE,
  tipoConParte,
  separarTipoConParte,
} from "@/lib/expediente-doble-catalogo";

export const runtime = "nodejs";

/** Tamaño máximo del archivo subido (10 MB). */
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;

// Retención del expediente doble 3.1.42: 5 años (plazo general de conservación
// de la contabilidad/documentación, art. 30 CFF — baseline; valida el abogado).
const RETENCION_ANIOS_DOBLE = 5;

/** MIME permitidos (PDF/imagen) → extensión de la ruta content-addressed. */
const EXTENSION_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Validación zod de los campos de texto del multipart (tipo + parte). */
const EsquemaCampos = z.object({
  tipo: z.enum(TIPOS_DOC_DOBLE_3142),
  parte: z.enum(PARTES_EXPEDIENTE_DOBLE),
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
// GET /api/clientes/[id]/expediente-doble — expediente + documentos (o null).
// =============================================================================

type DocumentoSalida = {
  id: string;
  /** Parte que custodia la copia ("AGENTE"|"EMPRESA"; null si tipo histórico). */
  parte: string | null;
  /** Tipo documental del catálogo (sin prefijo; null si tipo histórico). */
  tipo: string | null;
  /** Tipo tal como está almacenado (con prefijo), por transparencia. */
  tipoAlmacenado: string;
  sha256: string;
  almacenado: boolean;
  wormUrl: string | null;
  vence: string | null;
  creadoEn: string;
};

type ExpedienteSalida = {
  id: string;
  custodio: string | null;
  retieneHasta: string | null;
  creadoEn: string;
  documentos: DocumentoSalida[];
};

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
    const salida = await withTenantFromSession(
      session,
      async (tx): Promise<ExpedienteSalida | null | "no-cliente"> => {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) return "no-cliente";

        // Sin expediente aún: null (el POST lo crea al primer documento).
        const expediente = await tx.expedienteDoble3142.findUnique({
          where: { clienteId: cliente.id },
          select: { id: true, custodio: true, retieneHasta: true, creadoEn: true },
        });
        if (!expediente) return null;

        const filas = await tx.documento.findMany({
          where: { expedienteDobleId: expediente.id },
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
        return {
          id: expediente.id,
          custodio: expediente.custodio,
          retieneHasta: expediente.retieneHasta?.toISOString() ?? null,
          creadoEn: expediente.creadoEn.toISOString(),
          documentos: filas.map((f): DocumentoSalida => {
            // Lector defensivo: el prefijo "PARTE:TIPO" puede faltar en datos
            // históricos — se reporta null y la UI lo trata como "OTRO".
            const separado = separarTipoConParte(f.tipo);
            return {
              id: f.id,
              parte: separado?.parte ?? null,
              tipo: separado?.tipo ?? null,
              tipoAlmacenado: f.tipo,
              sha256: f.sha256,
              almacenado: f.wormUrl !== null,
              wormUrl: f.wormUrl,
              vence: f.vence?.toISOString() ?? null,
              creadoEn: f.creadoEn.toISOString(),
            };
          }),
        };
      },
    );

    if (salida === "no-cliente") {
      return NextResponse.json(
        { error: "Cliente no encontrado para este tenant" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, expediente: salida }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el expediente doble 3.1.42" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/clientes/[id]/expediente-doble — sube un documento al expediente.
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
      { error: "El cuerpo debe ser multipart/form-data con los campos tipo, parte y file" },
      { status: 400 },
    );
  }

  // 2) Validar tipo (catálogo) y parte (AGENTE|EMPRESA) con zod.
  const campos = EsquemaCampos.safeParse({
    tipo: form.get("tipo"),
    parte: form.get("parte"),
  });
  if (!campos.success) {
    return NextResponse.json(
      {
        error: `Campos inválidos: tipo debe ser uno de ${TIPOS_DOC_DOBLE_3142.join(", ")} y parte uno de ${PARTES_EXPEDIENTE_DOBLE.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const { tipo, parte } = campos.data;
  // El modelo NO distingue la parte: viaja como prefijo del tipo almacenado.
  const tipoAlmacenado = tipoConParte(parte, tipo);

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
      retieneHasta.setFullYear(retieneHasta.getFullYear() + RETENCION_ANIOS_DOBLE);

      // b) Busca/CREA el ExpedienteDoble3142 (1:1 por clienteId). Creación
      //    mínima: tenantId + clienteId obligatorios; custodio + retención al
      //    crear; si ya existe, NO se sobreescribe nada.
      const expediente = await tx.expedienteDoble3142.upsert({
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
      const ruta = `doble3142/${tenantId}/${cliente.id}/${sha256Documento}.${extension}`;
      const guardado = await obtenerAlmacen().guardar(ruta, buffer, archivo.type);

      // d) Documento real, ligado al expediente doble por su FK real
      //    (Documento.expedienteDobleId); la parte va en el prefijo del tipo.
      const documento = await tx.documento.create({
        data: {
          tenantId,
          tipo: tipoAlmacenado,
          sha256: sha256Documento,
          wormUrl: guardado.ok ? (guardado.url ?? null) : null,
          expedienteDobleId: expediente.id,
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
        accion: "EXPEDIENTE_DOBLE_DOC",
        actor,
        clienteId: cliente.id,
        expedienteId: expediente.id,
        documentoId: documento.id,
        parte,
        tipo,
        tipoAlmacenado,
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
          accion: "EXPEDIENTE_DOBLE_DOC",
          payloadRef: JSON.stringify({
            ref: "doble3142-doc",
            documentoId: documento.id,
            clienteId: cliente.id,
            parte,
            tipo,
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
      { error: "No se pudo registrar el documento del expediente doble 3.1.42" },
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
