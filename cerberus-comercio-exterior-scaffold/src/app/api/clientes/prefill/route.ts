// CERBERUS COMERCIO EXTERIOR — API prellenado del ALTA de cliente desde CSF (PDF). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/prefill/route.ts  (Incremento 46)
// Propósito: POST multipart/form-data con `file` (PDF de la Constancia de
//            Situación Fiscal, máx 10 MB): extrae el texto con unpdf en el
//            servidor y devuelve los datos para PRELLENAR el alta de cliente
//            (RFC, razón social, domicilio, régimen, actividad). SOLO LEE: no
//            persiste nada; el capturista revisa y confirma antes de dar de
//            alta (C9: sugerir, nunca imponer). Mismo patrón que tenía el
//            prefill KYC (Inc 28, retirado en Inc 48B: el cuestionario ahora
//            se precarga desde la bóveda documental), sin cotejo de RFC
//            porque el cliente AÚN NO EXISTE.
//
// Multi-tenant: el tenantId proviene del JWT verificado (401 sin sesión). No
// hay lectura/escritura de BD, así que no se abre transacción tenant-scoped.
// Fail-safe: PDF ilegible => { ok:false, detalle } con 200 (no rompe el alta;
// el form manual sigue disponible).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extraerDatosKyc } from "@/lib/extraer-kyc-doc";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

/** Tamaño máximo del PDF subido (10 MB). */
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;

async function textoDePdf(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA del request (convención DURA).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 1) Leer el multipart/form-data (falla limpio si el body no es multipart).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo debe ser multipart/form-data con el campo file (PDF)" },
      { status: 400 },
    );
  }

  // 2) Validar el archivo (presencia, tipo File, no vacío, tamaño máximo).
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

  // 3) PDF -> texto (unpdf). Fail-safe: si no hay capa de texto, se responde
  //    ok:false con 200 para que el form siga con captura manual.
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

  // 4) Extraer los datos con la heurística existente (SOLO lectura; lo que no
  //    se detecta con confianza va null y el capturista lo teclea).
  const datos = extraerDatosKyc(texto);

  return NextResponse.json(
    {
      ok: true,
      tipoDocumento: datos.tipoDocumento,
      datos: {
        rfc: datos.rfc,
        razonSocial: datos.razonSocial,
        domicilio: datos.domicilio,
        regimen: datos.regimen,
        actividad: datos.actividadEconomica,
      },
      camposDetectados: datos.camposDetectados,
    },
    { status: 200 },
  );
}
