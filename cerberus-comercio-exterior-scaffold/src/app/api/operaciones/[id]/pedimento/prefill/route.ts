// CERBERUS COMERCIO EXTERIOR — API prellenado del pedimento desde su PDF. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pedimento/prefill/route.ts  (Inc 51)
// Propósito: POST multipart/form-data con `file` (PDF del pedimento impreso,
//            formato Anexo 22, máx 10 MB): valida que la operación exista
//            para el tenant (404 si no), extrae el texto con unpdf y devuelve
//            los datos detectados (extraer-pedimento) para PRELLENAR la
//            captura del encabezado. SOLO LEE: no persiste nada — la custodia
//            del PDF va por la bóveda documental del despacho — y el
//            capturista revisa y confirma antes de guardar (C9: sugerir,
//            nunca imponer). Mismo patrón que /api/clientes/prefill (Inc 46).
//
// Multi-tenant: tenantId del JWT verificado, JAMÁS del request; la existencia
// de la operación se valida dentro de withTenantFromSession (RLS filtra).
// Fail-safe: PDF ilegible => { ok:false, detalle } con 200 (no rompe la
// captura; el form manual sigue disponible).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { extraerDatosPedimento } from "@/lib/extraer-pedimento";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

/** Tamaño máximo del PDF subido (10 MB). */
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

async function textoDePdf(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA del request (convención DURA).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: operacionId } = await params;

  // 1) La operación debe existir para el tenant del JWT (RLS filtra). Solo se
  //    valida la pertenencia: este endpoint no escribe nada en la BD.
  let operacionExiste: boolean;
  try {
    operacionExiste = await withTenantFromSession(session, async (tx): Promise<boolean> => {
      const op = await tx.operacion.findFirst({ where: { id: operacionId }, select: { id: true } });
      return op !== null;
    });
  } catch {
    return NextResponse.json({ error: "No se pudo validar la operación" }, { status: 500 });
  }
  if (!operacionExiste) {
    return NextResponse.json({ error: "Operación no encontrada para este tenant" }, { status: 404 });
  }

  // 2) Leer el multipart/form-data (falla limpio si el body no es multipart).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo debe ser multipart/form-data con el campo file (PDF)" },
      { status: 400 },
    );
  }

  // 3) Validar el archivo (presencia, tipo File, no vacío, tamaño máximo).
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Falta el campo file (PDF) en el formulario" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo excede el tamaño máximo de 10 MB" },
      { status: 413 },
    );
  }

  // 4) PDF -> texto (unpdf). Fail-safe: si no hay capa de texto, se responde
  //    ok:false con 200 para que la captura manual siga disponible.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const texto = await textoDePdf(bytes);
  if (texto.trim().length < 30) {
    return NextResponse.json(
      {
        ok: false,
        detalle:
          "No se pudo extraer texto del PDF (¿es una imagen escaneada sin capa de texto?). Captura los datos a mano.",
      },
      { status: 200 },
    );
  }

  // 5) Extraer los datos con la heurística pura (SOLO lectura; lo que no se
  //    detecta con confianza va undefined y el capturista lo teclea).
  const extraccion = extraerDatosPedimento(texto);
  const { advertencias, ...datos } = extraccion;

  return NextResponse.json({ ok: true, datos, advertencias }, { status: 200 });
}
