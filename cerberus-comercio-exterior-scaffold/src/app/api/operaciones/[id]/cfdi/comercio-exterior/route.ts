// CERBERUS COMERCIO EXTERIOR — API CFDI Ingreso + Complemento Comercio Exterior 1.1. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/cfdi/comercio-exterior/route.ts  (Inc 16)
// Propósito: POST que captura un CFDI de INGRESO con complemento COMERCIO_EXT_11
//            (exportación definitiva) para una Operacion: valida con
//            validarComercioExterior (400 con la lista {campo, mensaje} si falla
//            — C9: no se guarda borrador con errores), sella el payload canónico
//            con sha256 y crea el ComprobanteCfdi en estado BORRADOR + evento
//            BitacoraAuditoria "CFDI_BORRADOR" encadenado. GET lista los
//            comprobantes de complemento Comercio Exterior de la operación.
//
// Se implementa como RUTA SEPARADA de la Carta Porte (…/cfdi/route.ts) para no
// alterar el flujo de TRASLADO en producción; ambas crean ComprobanteCfdi con el
// mismo patrón probatorio. El timbrado/cancelación reutilizan las rutas
// existentes (…/cfdi/[cfdiId]/timbrar|cancelar) vía el conector TimbradorPac.
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
import {
  validarComercioExterior,
  canonicalizarComercioExt,
  type ComercioExterior11,
  type ComprobanteComercioExt,
  type ErrorValidacion,
} from "@/lib/comercio-exterior";

export const runtime = "nodejs";

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const rfcSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => RFC_RE.test(v), {
    message: "RFC con formato inválido (12-13 caracteres del estándar SAT)",
  });

const esquemaBody = z.object({
  emisorRfc: rfcSchema,
  receptorRfc: rfcSchema,
  tipoOperacion: z.string().trim().default("2"),
  claveDePedimento: z.string().trim().min(1, "claveDePedimento es obligatoria"),
  certificadoOrigen: z.boolean().default(false),
  tipoCambioUsd: z.number({ invalid_type_error: "tipoCambioUsd debe ser numérico" }),
  totalUsd: z.number({ invalid_type_error: "totalUsd debe ser numérico" }),
  emisor: z.object({
    calle: z.string().trim(),
    codigoPostal: z.string().trim(),
    estado: z.string().trim(),
    pais: z.string().trim().default("MEX"),
  }),
  receptor: z.object({
    numRegIdTrib: z.string().trim().optional(),
    pais: z.string().trim(),
    calle: z.string().trim().optional(),
    codigoPostal: z.string().trim().optional(),
  }),
  mercancias: z
    .array(
      z.object({
        noIdentificacion: z.string().trim(),
        fraccionArancelaria: z.string().trim(),
        cantidadAduana: z.number({ invalid_type_error: "cantidadAduana debe ser numérica" }),
        unidadAduana: z.string().trim(),
        valorUnitarioAduana: z.number({ invalid_type_error: "valorUnitarioAduana debe ser numérico" }),
        valorDolares: z.number({ invalid_type_error: "valorDolares debe ser numérico" }),
      }),
    )
    .min(1, "Se requiere al menos una mercancía"),
});

function issuesAErrores(error: z.ZodError): ErrorValidacion[] {
  return error.issues.map((i) => ({
    campo: i.path.length > 0 ? i.path.join(".") : "body",
    mensaje: i.message,
  }));
}

type Resultado =
  | { tipo: "ok"; cfdiId: string; sha256: string; timestamp: string }
  | { tipo: "no-encontrada" };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parseado = esquemaBody.safeParse(bruto);
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Documento con estructura inválida", errores: issuesAErrores(parseado.error) },
      { status: 400 },
    );
  }
  const datos = parseado.data;

  const comercioExterior: ComercioExterior11 = {
    tipoOperacion: datos.tipoOperacion,
    claveDePedimento: datos.claveDePedimento,
    certificadoOrigen: datos.certificadoOrigen,
    tipoCambioUsd: datos.tipoCambioUsd,
    totalUsd: datos.totalUsd,
    emisor: datos.emisor,
    receptor: datos.receptor,
    mercancias: datos.mercancias,
  };

  const errores: ErrorValidacion[] = validarComercioExterior(comercioExterior);
  if (errores.length > 0) {
    return NextResponse.json(
      { error: "Complemento Comercio Exterior 1.1 inválido: corrige los campos señalados", errores },
      { status: 400 },
    );
  }

  const documento: ComprobanteComercioExt = {
    tipo: "INGRESO",
    complemento: "COMERCIO_EXT_11",
    emisorRfc: datos.emisorRfc,
    receptorRfc: datos.receptorRfc,
    comercioExterior,
  };
  const payload: string = canonicalizarComercioExt(documento);
  const selloCfdi = sha256(payload);

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!operacion) {
        return { tipo: "no-encontrada" as const };
      }

      const creadoEn = new Date();

      const cfdi = await tx.comprobanteCfdi.create({
        data: {
          tenantId,
          operacionId: operacion.id,
          tipo: "INGRESO",
          complemento: "COMERCIO_EXT_11",
          emisorRfc: datos.emisorRfc,
          receptorRfc: datos.receptorRfc,
          payload,
          sha256: selloCfdi,
        },
        select: { id: true },
      });

      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      const payloadEvento = {
        tenantId,
        accion: "CFDI_BORRADOR",
        actor,
        operacionId: operacion.id,
        cfdiId: cfdi.id,
        cfdiSha256: selloCfdi,
        creadoEn: creadoEn.toISOString(),
        hashPrev,
      };
      const selloEvento = sha256(canonical(payloadEvento));

      const evento = await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "CFDI_BORRADOR",
          operacionId: operacion.id,
          payloadRef: `operacion:${operacion.id}:cfdi:${cfdi.id}:INGRESO:COMERCIO_EXT_11`,
          sha256: selloEvento,
          hashPrev,
          creadoEn,
        },
        select: { creadoEn: true },
      });

      return {
        tipo: "ok" as const,
        cfdiId: cfdi.id,
        sha256: selloCfdi,
        timestamp: evento.creadoEn.toISOString(),
      };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar el CFDI" }, { status: 500 });
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
      cfdiId: resultado.cfdiId,
      estado: "BORRADOR",
      tipo: "INGRESO",
      complemento: "COMERCIO_EXT_11",
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
    },
    { status: 201 },
  );
}

// -----------------------------------------------------------------------------
// GET: lista los ComprobanteCfdi de complemento Comercio Exterior de la operación.
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
    const comprobantes = await withTenantFromSession(session, async (tx) => {
      const filas = await tx.comprobanteCfdi.findMany({
        where: { operacionId: id, complemento: "COMERCIO_EXT_11" },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          tipo: true,
          complemento: true,
          estado: true,
          emisorRfc: true,
          receptorRfc: true,
          uuid: true,
          sha256: true,
          detallePac: true,
          creadoEn: true,
        },
      });
      return filas.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        complemento: c.complemento,
        estado: c.estado,
        emisorRfc: c.emisorRfc,
        receptorRfc: c.receptorRfc,
        uuid: c.uuid,
        sha256: c.sha256,
        detallePac: c.detallePac,
        creadoEn: c.creadoEn.toISOString(),
      }));
    });
    return NextResponse.json({ ok: true, comprobantes }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los comprobantes" },
      { status: 500 },
    );
  }
}
