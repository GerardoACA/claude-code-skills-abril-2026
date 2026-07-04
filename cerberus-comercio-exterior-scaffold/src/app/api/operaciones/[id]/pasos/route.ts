// CERBERUS COMERCIO EXTERIOR — API pasos del despacho (trámite documental). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pasos/route.ts
// Propósito: POST que registra un PasoDespacho (MVE_E2, COVE, PREVALIDACION,
//            PAGO, DODA) para una Operacion. Cada paso se sella con sha256 sobre
//            un payload canónico y se registra un evento en BitacoraAuditoria
//            (append-only, sha256 encadenado con el último evento del tenant).
//            GET opcional lista los pasos de la operación.
//
// Incremento 59 — acuse documental por paso + conector VUCEM:
//   - El POST acepta también multipart/form-data con un `file` OPCIONAL
//     (PDF/XML del acuse): el archivo se guarda VÍA la lógica compartida de la
//     bóveda del despacho (guardarDocumentoDespacho: sha256 + WORM + Documento
//     + bitácora, Inc 50) con el tipo documental mapeado del tipo de paso
//     (tipoDocumentalDePaso). El Documento queda LIGADO al paso anotando en
//     `detalle` la referencia "doc:<documentoId> sha256:<8>" (el modelo
//     PasoDespacho no se toca).
//   - Al registrar MVE_E2 o COVE se invoca el conector VUCEM (fail-safe,
//     obtenerConectorVucem) y su resultado se anota en el `detalle` del paso —
//     hoy el NoOp deja constancia honesta de que la transmisión fue manual.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda escritura tenant-scoped
// corre dentro de withTenantFromSession (abre transacción + SET LOCAL
// app.tenant_id => la RLS filtra por el tenant del token). La lectura del último
// eslabón + los INSERT (documento, paso, eventos) son atómicos.
//
// No bloquea: es registro. Campos según el tipo de paso (fail-closed si faltan).
// =============================================================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { tipoDocumentalDePaso } from "@/lib/documentos-despacho-catalogo";
import {
  TAMANO_MAX_BYTES_DOC_DESPACHO,
  extraerDeXmlDespacho,
  guardarDocumentoDespacho,
  type DocDespachoGuardado,
} from "@/lib/documentos-despacho-guardar";
import { obtenerConectorVucem, type ResultadoVucem } from "@/lib/conector-vucem";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Valores REALES del enum TipoPaso (prisma/schema.prisma, Agente MODELO-6).
// -----------------------------------------------------------------------------
type TipoPaso = "MVE_E2" | "COVE" | "PREVALIDACION" | "PAGO" | "DODA";

const TIPOS: readonly TipoPaso[] = [
  "MVE_E2",
  "COVE",
  "PREVALIDACION",
  "PAGO",
  "DODA",
];

/** Type guard: la cadena es un valor del enum TipoPaso. */
function esTipoPaso(v: unknown): v is TipoPaso {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v);
}

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

type Body = {
  tipo?: unknown;
  acuse?: unknown;
  sello?: unknown;
  monto?: unknown;
  detalle?: unknown;
};

/** Datos ya validados de un paso listos para persistir. */
type PasoData = {
  tipo: TipoPaso;
  acuse: string | null;
  sello: string | null;
  monto: Prisma.Decimal | null;
  detalle: string | null;
};

/** Normaliza un valor opcional de texto a string no vacío o null. */
function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Valida el body según el tipo de paso y arma los campos a persistir.
 *   - MVE_E2 / COVE / DODA: requieren `acuse`.
 *   - PREVALIDACION: requiere `sello`.
 *   - PAGO: requiere `monto` (number o string decimal, >= 0).
 * Devuelve un mensaje de error si algo falta o es inválido.
 */
function validar(body: Body): { ok: true; data: PasoData } | { ok: false; error: string } {
  if (!esTipoPaso(body.tipo)) {
    return { ok: false, error: "El campo 'tipo' debe ser un TipoPaso válido" };
  }
  const tipo: TipoPaso = body.tipo;
  const detalle = texto(body.detalle);

  if (tipo === "MVE_E2" || tipo === "COVE" || tipo === "DODA") {
    const acuse = texto(body.acuse);
    if (acuse === null) {
      return { ok: false, error: `El paso ${tipo} requiere un 'acuse' no vacío` };
    }
    return { ok: true, data: { tipo, acuse, sello: null, monto: null, detalle } };
  }

  if (tipo === "PREVALIDACION") {
    const sello = texto(body.sello);
    if (sello === null) {
      return { ok: false, error: "El paso PREVALIDACION requiere un 'sello' no vacío" };
    }
    return { ok: true, data: { tipo, acuse: null, sello, monto: null, detalle } };
  }

  // PAGO
  const bruto = body.monto;
  if (typeof bruto !== "number" && typeof bruto !== "string") {
    return { ok: false, error: "El paso PAGO requiere un 'monto' (number o string decimal)" };
  }
  let monto: Prisma.Decimal;
  try {
    monto = new Prisma.Decimal(bruto);
  } catch {
    return { ok: false, error: "El 'monto' del PAGO no es un decimal válido" };
  }
  if (!monto.isFinite() || monto.isNegative()) {
    return { ok: false, error: "El 'monto' del PAGO debe ser un número finito >= 0" };
  }
  return { ok: true, data: { tipo, acuse: null, sello: null, monto, detalle } };
}

// -----------------------------------------------------------------------------
// Acuse documental (Inc 59): archivo opcional PDF/XML validado y con extensión
// para la ruta content-addressed de la bóveda del despacho.
// -----------------------------------------------------------------------------

/** MIME admitidos para el ARCHIVO del acuse de un paso (solo PDF/XML). */
const EXTENSION_ACUSE_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
};

/** Archivo del acuse ya validado y leído (listo para la bóveda). */
type ArchivoAcuse = {
  buffer: Buffer;
  extension: string;
  contentType: string;
  nombreArchivo: string;
};

/**
 * Valida y lee el `file` opcional del multipart. Devuelve null si no se
 * adjuntó archivo, el ArchivoAcuse si es válido, o un error legible.
 */
async function leerArchivoAcuse(
  form: FormData,
): Promise<{ ok: true; archivo: ArchivoAcuse | null } | { ok: false; error: string; status: number }> {
  const archivo = form.get("file");
  if (archivo === null) return { ok: true, archivo: null };
  if (!(archivo instanceof File)) {
    return { ok: false, error: "El campo 'file' debe ser un archivo (PDF o XML)", status: 400 };
  }
  if (archivo.size === 0) {
    return { ok: false, error: "El archivo del acuse está vacío", status: 400 };
  }
  if (archivo.size > TAMANO_MAX_BYTES_DOC_DESPACHO) {
    return { ok: false, error: "El archivo del acuse excede el tamaño máximo de 10 MB", status: 413 };
  }
  // Algunos navegadores mandan los .xml sin MIME (o como text/plain): se
  // acepta también por la extensión del nombre (mismo criterio que la bóveda).
  const nombre = archivo.name.toLowerCase();
  const extension =
    EXTENSION_ACUSE_POR_MIME[archivo.type] ??
    (nombre.endsWith(".xml") ? "xml" : nombre.endsWith(".pdf") ? "pdf" : undefined);
  if (extension === undefined) {
    return {
      ok: false,
      error: "Formato del acuse no admitido: sube un PDF o un XML",
      status: 415,
    };
  }
  return {
    ok: true,
    archivo: {
      buffer: Buffer.from(await archivo.arrayBuffer()),
      extension,
      contentType: archivo.type,
      nombreArchivo: archivo.name.trim().length > 0 ? archivo.name.trim() : "acuse",
    },
  };
}

/**
 * Referencia del Documento del acuse anotada en el `detalle` del paso — es la
 * LIGA paso↔documento sin tocar el modelo PasoDespacho. La UI (trámites) la
 * detecta para mostrar el indicador de acuse sellado.
 */
function referenciaDoc(guardado: DocDespachoGuardado): string {
  return `doc:${guardado.documentoId} sha256:${guardado.sha256.slice(0, 8)}`;
}

/**
 * Compone el `detalle` final del paso: nota del capturista + referencia del
 * acuse documental (si se adjuntó; para PAGO se precisa "comprobante de pago"
 * porque su tipo documental en la bóveda es OTRO) + resultado del conector
 * VUCEM (si aplicó). Partes unidas con " | ".
 */
function componerDetalle(
  tipo: TipoPaso,
  detalleUsuario: string | null,
  doc: DocDespachoGuardado | null,
  vucem: ResultadoVucem | null,
): string | null {
  const partes: string[] = [];
  if (detalleUsuario !== null) partes.push(detalleUsuario);
  if (doc !== null) {
    const etiqueta = tipo === "PAGO" ? "comprobante de pago " : tipo === "PREVALIDACION" ? "acuse de prevalidación " : "";
    partes.push(`${etiqueta}${referenciaDoc(doc)}`);
  }
  if (vucem !== null) partes.push(`VUCEM: ${vucem.detalle}`);
  return partes.length > 0 ? partes.join(" | ") : null;
}

/**
 * Invoca el conector VUCEM para los pasos que la reforma exige electrónicos
 * (MVE solo-electrónica / consulta COVE). FAIL-SAFE: NUNCA lanza — un fallo
 * del conector no impide registrar el paso; se anota honesto en el detalle.
 * Devuelve null para los tipos de paso que no pasan por VUCEM.
 */
async function invocarVucem(
  data: PasoData,
  operacionId: string,
  sha256Documento: string | undefined,
): Promise<ResultadoVucem | null> {
  if (data.tipo !== "MVE_E2" && data.tipo !== "COVE") return null;
  const acuse = data.acuse ?? "";
  try {
    const conector = obtenerConectorVucem();
    if (data.tipo === "MVE_E2") {
      return await conector.transmitirMve({ operacionId, acuse, sha256Documento });
    }
    return await conector.consultarCove({ operacionId, acuse });
  } catch (error) {
    // Fail-safe: el conector no debe lanzar, pero si lo hace el paso se
    // registra igual con constancia del fallo.
    const mensaje = error instanceof Error ? error.message : String(error);
    return { ok: false, detalle: `fallo del conector (${mensaje})` };
  }
}

type Resultado =
  | {
      tipo: "ok";
      pasoId: string;
      tipoPaso: TipoPaso;
      sha256: string;
      timestamp: string;
      documento: {
        documentoId: string;
        sha256: string;
        almacenado: boolean;
      } | null;
    }
  | { tipo: "no-encontrada" };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 0) tenantId + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown; email?: unknown; name?: unknown } } | null)
    ?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const actor: string =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  const { id } = await context.params;

  // 1) Body: JSON (compatibilidad) o multipart/form-data (Inc 59: permite
  //    adjuntar el ARCHIVO del acuse). Los campos de texto son los mismos.
  const esMultipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let body: Body;
  let archivoAcuse: ArchivoAcuse | null = null;

  if (esMultipart) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "multipart/form-data inválido" },
        { status: 400 },
      );
    }
    body = {
      tipo: form.get("tipo") ?? undefined,
      acuse: form.get("acuse") ?? undefined,
      sello: form.get("sello") ?? undefined,
      monto: form.get("monto") ?? undefined,
      detalle: form.get("detalle") ?? undefined,
    };
    const lectura = await leerArchivoAcuse(form);
    if (!lectura.ok) {
      return NextResponse.json({ error: lectura.error }, { status: lectura.status });
    }
    archivoAcuse = lectura.archivo;
  } else {
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
  }

  const validacion = validar(body);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const data: PasoData = validacion.data;

  // 2) Conector VUCEM (solo MVE_E2/COVE), ANTES de la transacción y fail-safe:
  //    hoy es el NoOp — deja constancia honesta de la transmisión manual.
  const shaDocumento = archivoAcuse !== null ? sha256(archivoAcuse.buffer) : undefined;
  const vucem = await invocarVucem(data, id, shaDocumento);

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 3) Confirmar que la operación existe para este tenant (RLS la limita).
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: { id: true, clienteId: true },
      });
      if (!operacion) {
        return { tipo: "no-encontrada" as const };
      }

      // 4) Acuse documental (Inc 59): guardar el archivo VÍA la lógica
      //    compartida de la bóveda del despacho (sha256 + WORM + Documento +
      //    evento DESPACHO_DOCUMENTO encadenado), con el tipo documental
      //    mapeado del tipo de paso. Captura asistida: si es XML se corre el
      //    extractor (fail-safe) igual que en la bóveda.
      let doc: DocDespachoGuardado | null = null;
      if (archivoAcuse !== null) {
        doc = await guardarDocumentoDespacho(tx, {
          tenantId,
          actor,
          operacionId: operacion.id,
          clienteId: operacion.clienteId,
          tipo: tipoDocumentalDePaso(data.tipo),
          buffer: archivoAcuse.buffer,
          extension: archivoAcuse.extension,
          contentType: archivoAcuse.contentType,
          nombreArchivo: archivoAcuse.nombreArchivo,
          extraido:
            archivoAcuse.extension === "xml"
              ? extraerDeXmlDespacho(archivoAcuse.buffer.toString("utf-8"))
              : null,
        });
      }

      // 5) Detalle final: nota del capturista + liga al documento del acuse
      //    ("doc:<id> sha256:<8>") + resultado VUCEM (honesto: hoy NoOp).
      const detalleFinal = componerDetalle(data.tipo, data.detalle, doc, vucem);

      const completadoEn = new Date();

      // 6) Sello de integridad del paso (SHA-256 sobre payload canónico).
      const payloadPaso = {
        tenantId,
        operacionId: operacion.id,
        tipo: data.tipo,
        acuse: data.acuse,
        sello: data.sello,
        monto: data.monto === null ? null : data.monto.toString(),
        detalle: detalleFinal,
        completadoEn: completadoEn.toISOString(),
      };
      const selloPaso = sha256(canonical(payloadPaso));

      // 7) Crear el PasoDespacho sellado (campos según el tipo).
      const paso = await tx.pasoDespacho.create({
        data: {
          tenantId,
          operacionId: operacion.id,
          tipo: data.tipo,
          acuse: data.acuse,
          sello: data.sello,
          monto: data.monto,
          detalle: detalleFinal,
          sha256: selloPaso,
          completadoEn,
        },
        select: { id: true, tipo: true },
      });

      // 8) Bitácora append-only: encadenar con el sha256 del último evento del
      //    tenant. Si el guardado del acuse insertó el evento DESPACHO_DOCUMENTO
      //    en ESTA transacción, ese es el último eslabón (no se re-consulta por
      //    fecha: dos eventos del mismo instante harían ambiguo el orden).
      let hashPrev: string | null;
      if (doc !== null) {
        hashPrev = doc.eventoSha256;
      } else {
        const previo = await tx.bitacoraAuditoria.findFirst({
          orderBy: { creadoEn: "desc" },
          select: { sha256: true },
        });
        hashPrev = previo?.sha256 ?? null;
      }

      // 9) Sello del evento de bitácora (incluye hashPrev para encadenar y el
      //    sello del propio paso como evidencia del registro).
      const payloadEvento = {
        tenantId,
        accion: "PASO_DESPACHO",
        actor,
        operacionId: operacion.id,
        pasoId: paso.id,
        tipo: data.tipo,
        pasoSha256: selloPaso,
        documentoId: doc?.documentoId ?? null,
        creadoEn: completadoEn.toISOString(),
        hashPrev,
      };
      const selloEvento = sha256(canonical(payloadEvento));

      const evento = await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PASO_DESPACHO",
          // FK directa a la operación (Incremento 8): evidencia exacta, sin heurística.
          operacionId: operacion.id,
          payloadRef: `operacion:${operacion.id}:paso:${paso.id}:${data.tipo}${doc !== null ? `:doc:${doc.documentoId}` : ""}`,
          sha256: selloEvento,
          hashPrev,
          creadoEn: completadoEn,
        },
        select: { sha256: true, creadoEn: true },
      });

      return {
        tipo: "ok" as const,
        pasoId: paso.id,
        tipoPaso: paso.tipo as TipoPaso,
        sha256: evento.sha256,
        timestamp: evento.creadoEn.toISOString(),
        documento:
          doc === null
            ? null
            : { documentoId: doc.documentoId, sha256: doc.sha256, almacenado: doc.almacenado },
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el paso del despacho" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      pasoId: resultado.pasoId,
      tipo: resultado.tipoPaso,
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
      // Inc 59: acuse documental sellado (null si no se adjuntó archivo) y
      // resultado del conector VUCEM (null si el paso no pasa por VUCEM).
      documento: resultado.documento,
      vucem: vucem === null ? null : { ok: vucem.ok, detalle: vucem.detalle },
    },
    { status: 201 },
  );
}

// -----------------------------------------------------------------------------
// GET opcional: lista los pasos de la operación (tenant-scoped vía RLS).
// -----------------------------------------------------------------------------
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown } } | null)?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const pasos = await withTenantFromSession(session, async (tx) => {
      const filas = await tx.pasoDespacho.findMany({
        where: { operacionId: id },
        orderBy: { completadoEn: "asc" },
        select: {
          id: true,
          tipo: true,
          acuse: true,
          sello: true,
          monto: true,
          detalle: true,
          sha256: true,
          completadoEn: true,
        },
      });
      return filas.map((p) => ({
        id: p.id,
        tipo: p.tipo,
        acuse: p.acuse,
        sello: p.sello,
        monto: p.monto === null ? null : p.monto.toString(),
        detalle: p.detalle,
        sha256: p.sha256,
        completadoEn: p.completadoEn.toISOString(),
      }));
    });
    return NextResponse.json({ ok: true, pasos }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los pasos" },
      { status: 500 },
    );
  }
}
