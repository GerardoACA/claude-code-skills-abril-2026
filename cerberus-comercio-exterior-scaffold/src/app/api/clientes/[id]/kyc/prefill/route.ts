// CERBERUS COMERCIO EXTERIOR — API prellenado KYC desde documento (PDF). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/kyc/prefill/route.ts  (Incremento 28)
// Propósito: POST que recibe un PDF (base64) de un documento del cliente
//            (Constancia de Situación Fiscal u opinión), extrae su texto con
//            unpdf en el servidor y devuelve los DATOS EXTRAÍDOS para PRELLENAR
//            el cuestionario KYC 1.4.14 (RFC, razón social, régimen, actividad,
//            domicilio). SOLO LEE: no escribe nada; el responsable revisa y
//            corrige antes de sellar el expediente.
//
// Multi-tenant: el tenantId proviene del JWT; se usa el RFC del cliente para
// avisar si el documento corresponde a otro RFC (posible archivo equivocado).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { extraerDatosKyc } from "@/lib/extraer-kyc-doc";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

const bodySchema = z.object({
  pdfBase64: z.string().min(1).max(12_000_000),
  nombreArchivo: z.string().trim().max(256).optional(),
});

type Params = { params: Promise<{ id: string }> };

async function textoDePdf(pdfBase64: string): Promise<string> {
  try {
    const buf = Buffer.from(pdfBase64, "base64");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

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

  // Verificar cliente del tenant y obtener su RFC (para el cotejo del documento).
  let rfcCliente: string | null;
  try {
    rfcCliente = await withTenantFromSession(session, async (tx) => {
      const c = await tx.cliente.findFirst({ where: { id: clienteId }, select: { rfc: true } });
      return c?.rfc ?? null;
    });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el cliente" }, { status: 500 });
  }
  if (rfcCliente === null) {
    return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
  }

  const texto = await textoDePdf(parseado.data.pdfBase64);
  if (texto.trim().length < 30) {
    return NextResponse.json(
      { error: "No se pudo extraer texto del PDF (¿es una imagen escaneada sin capa de texto?)." },
      { status: 400 },
    );
  }

  const datos = extraerDatosKyc(texto);
  const rfcCoincide =
    datos.rfc !== null && datos.rfc.toUpperCase() === rfcCliente.toUpperCase();

  return NextResponse.json(
    {
      ok: true,
      tipoDocumento: datos.tipoDocumento,
      rfcCoincide,
      rfcCliente,
      datos: {
        rfc: datos.rfc,
        razonSocial: datos.razonSocial,
        regimen: datos.regimen,
        actividadEconomica: datos.actividadEconomica,
        domicilio: datos.domicilio,
      },
      camposDetectados: datos.camposDetectados,
    },
    { status: 200 },
  );
}
