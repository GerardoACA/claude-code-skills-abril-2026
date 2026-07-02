// CERBERUS COMERCIO EXTERIOR — API CFDI de Traslado + Carta Porte 3.1 (borrador sellado). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/cfdi/route.ts
// Propósito: POST que captura un CFDI de TRASLADO con complemento CARTA_PORTE_31
//            para una Operacion: valida con validarCartaPorte (400 con la lista
//            {campo, mensaje} si falla — decisión C9: no se guarda borrador con
//            errores), sella el payload canónico con sha256 y crea el
//            ComprobanteCfdi en estado BORRADOR (default del schema) + evento
//            BitacoraAuditoria "CFDI_BORRADOR" encadenado (patrón exacto de
//            pasos/route.ts). GET lista los comprobantes de la operación.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda escritura tenant-scoped
// corre dentro de withTenantFromSession (transacción + SET LOCAL app.tenant_id).
//
// Coordinación Incremento 13: los tipos/funciones de src/lib/carta-porte.ts son
// del Agente MODELO-13; aquí se consumen sus formas EXACTAS del blueprint vía
// tipos derivados (Parameters<...>) para no acoplarse a nombres de tipos.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { validarCartaPorte, canonicalizarCartaPorte } from "@/lib/carta-porte";

export const runtime = "nodejs";

/** Forma de entrada que espera la lib del Agente MODELO-13 (derivada, no nombrada). */
type CartaPorteEntrada = Parameters<typeof validarCartaPorte>[0];
type CanonicalizarEntrada = Parameters<typeof canonicalizarCartaPorte>[0];

/** Error de validación con la forma {campo, mensaje} que pinta el form. */
type ErrorValidacion = { campo: string; mensaje: string };

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// -----------------------------------------------------------------------------
// Esquema estructural del body (zod). Las validaciones de NEGOCIO (CP 5 dígitos,
// placa oficial, claveProdServ 8 dígitos, pesos > 0, fechas coherentes, RFC del
// operador) son de validarCartaPorte (MODELO-13); aquí solo la forma + los RFC
// del CFDI (emisor/receptor), que son campos propios del comprobante.
// -----------------------------------------------------------------------------
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
  origen: z.object({
    codigoPostal: z.string().trim(),
    fechaSalida: z.string().trim().min(1, "fechaSalida es obligatoria"),
  }),
  destino: z.object({
    codigoPostal: z.string().trim(),
    fechaLlegada: z.string().trim().min(1, "fechaLlegada es obligatoria"),
    distanciaKm: z.number({ invalid_type_error: "distanciaKm debe ser numérica" }),
  }),
  autotransporte: z.object({
    placaVm: z.string().trim().min(1, "placaVm es obligatoria"),
    configVehicular: z.string().trim().min(1, "configVehicular es obligatoria"),
    caat: z.string().trim().min(1).optional(),
  }),
  figuraTransporte: z.object({
    rfcOperador: z.string().trim().min(1, "rfcOperador es obligatorio"),
    nombreOperador: z.string().trim().min(1, "nombreOperador es obligatorio"),
  }),
  mercancias: z
    .array(
      z.object({
        claveProdServ: z.string().trim(),
        descripcion: z.string().trim().min(1, "descripcion es obligatoria"),
        cantidad: z.number({ invalid_type_error: "cantidad debe ser numérica" }),
        claveUnidad: z.string().trim(),
        pesoKg: z.number({ invalid_type_error: "pesoKg debe ser numérico" }),
      }),
    )
    .min(1, "Se requiere al menos una mercancía"),
});

/** Convierte issues de zod a la forma {campo, mensaje} del contrato del form. */
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

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 1) Forma del documento (estructura + RFC emisor/receptor).
  const parseado = esquemaBody.safeParse(bruto);
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Documento con estructura inválida", errores: issuesAErrores(parseado.error) },
      { status: 400 },
    );
  }
  const datos = parseado.data;

  // 2) Objeto COMPLETO del documento (CFDI + complemento Carta Porte 3.1) con
  //    las formas del blueprint del Agente MODELO-13. La aserción vía tipos
  //    derivados es el punto de coordinación entre agentes.
  const documento = {
    emisorRfc: datos.emisorRfc,
    receptorRfc: datos.receptorRfc,
    origen: datos.origen,
    destino: datos.destino,
    autotransporte: datos.autotransporte,
    figuraTransporte: datos.figuraTransporte,
    mercancias: datos.mercancias,
  };

  // 3) Validaciones de negocio de la Carta Porte 3.1 (reporte §1). C9: alertan
  //    con lista de errores y NO se guarda el borrador si hay errores.
  const errores: ErrorValidacion[] = validarCartaPorte(
    documento as unknown as CartaPorteEntrada,
  );
  if (errores.length > 0) {
    return NextResponse.json(
      { error: "Carta Porte 3.1 inválida: corrige los campos señalados", errores },
      { status: 400 },
    );
  }

  // 4) Payload canónico + sello de integridad (SHA-256 hex, capa probatoria).
  const payload: string = canonicalizarCartaPorte(
    documento as unknown as CanonicalizarEntrada,
  );
  const selloCfdi = sha256(payload);

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 5) Confirmar que la operación existe para este tenant (RLS la limita).
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!operacion) {
        return { tipo: "no-encontrada" as const };
      }

      const creadoEn = new Date();

      // 6) Crear el ComprobanteCfdi sellado. `estado` queda en el default del
      //    schema (BORRADOR); el uuid lo pondrá el PAC real al timbrar.
      const cfdi = await tx.comprobanteCfdi.create({
        data: {
          tenantId,
          operacionId: operacion.id,
          tipo: "TRASLADO",
          complemento: "CARTA_PORTE_31",
          emisorRfc: datos.emisorRfc,
          receptorRfc: datos.receptorRfc,
          payload,
          sha256: selloCfdi,
        },
        select: { id: true },
      });

      // 7) Bitácora append-only: encadenar con el sha256 del último evento del
      //    tenant (dentro de la transacción => lectura + insert atómicos).
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
          payloadRef: `operacion:${operacion.id}:cfdi:${cfdi.id}:TRASLADO:CARTA_PORTE_31`,
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
    return NextResponse.json(
      { error: "No se pudo registrar el CFDI" },
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
      cfdiId: resultado.cfdiId,
      estado: "BORRADOR",
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
    },
    { status: 201 },
  );
}

// -----------------------------------------------------------------------------
// GET: lista los ComprobanteCfdi de la operación (tenant-scoped vía RLS).
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
        where: { operacionId: id },
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
