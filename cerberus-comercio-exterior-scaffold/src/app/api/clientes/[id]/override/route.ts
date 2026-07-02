// CERBERUS COMERCIO EXTERIOR — API override firmado de alertas (decision C11). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/override/route.ts  [Agente UI-15, Inc 15]
// Proposito: POST que registra un OVERRIDE de alerta: la decision HUMANA de
//            continuar operando con un cliente pese a una verificacion adversa
//            (ALERTA / INHABILITADO_*). El acto queda MOTIVADO (texto obligatorio
//            min 20 chars), ATRIBUIDO (actor del JWT), SELLADO (sha256 del payload
//            canonico), ENCADENADO en BitacoraAuditoria e idealmente FIRMADO con
//            e.firma via el conector enchufable de @/lib/firmador-efirma (hoy
//            NoOp honesto => SIN_FIRMA con nota). GET lista los overrides del
//            cliente.
//
// DECISION C9 + C11: el sistema alerta, el RESPONSABLE decide. El override NUNCA
// borra ni modifica VerificacionCumplimiento/Alerta69b: es un acto ADICIONAL que
// documenta la decision. Panel penalista: "overrides sin motivacion firmada
// regalan el dolo a la Fiscalia" => motivo obligatorio + sello + atribucion.
//
// Multi-tenant (convencion DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda lectura/escritura
// tenant-scoped corre dentro de withTenantFromSession (transaccion + SET LOCAL
// app.tenant_id => RLS filtra por el tenant del token).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
// Conector e.firma enchufable [Agente MODELO-15, Inc 15]. Hoy NoOp honesto:
// devuelve SIN_FIRMA con detalle explicito; la firma FIEL real (del lado del
// titular, la clave privada NUNCA se almacena — C14) llega con las APIs del
// cliente.
import { obtenerFirmador } from "@/lib/firmador-efirma";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Valores EXACTOS del enum FuenteVerificacion (prisma/schema.prisma). NO inventar.
// -----------------------------------------------------------------------------
const FUENTES = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
  "OPINION_32D",
  "CSD_17H",
  "SANCIONES_INT",
] as const;

type FuenteVerificacion = (typeof FUENTES)[number];

// Estados de firma EXACTOS del enum EstadoFirmaOverride (Agente MODELO-15).
type EstadoFirmaOverride = "SIN_FIRMA" | "FIRMADO";

// -----------------------------------------------------------------------------
// Validacion del body con zod (fail-closed): fuente del enum, resultado no
// vacio, motivo OBLIGATORIO de al menos 20 caracteres (decision C11 + panel
// penalista: la motivacion es la defensa del responsable).
// -----------------------------------------------------------------------------
const bodySchema = z.object({
  fuente: z.enum(FUENTES),
  resultado: z.string().min(1, "El resultado adverso es obligatorio"),
  motivo: z
    .string()
    .trim()
    .min(20, "El motivo es obligatorio y debe tener al menos 20 caracteres"),
});

type Params = { params: Promise<{ id: string }> };

// Fila que devuelve el GET (sin exponer objetos Prisma).
type OverrideResumen = {
  id: string;
  fuente: FuenteVerificacion;
  resultado: string;
  motivo: string;
  actor: string;
  sha256: string;
  estadoFirma: EstadoFirmaOverride;
  firmaDetalle: string | null;
  creadoEn: string;
};

// Discriminante del resultado de la transaccion del POST.
type ResultadoPost =
  | { tipo: "no-cliente" }
  | {
      tipo: "ok";
      override: OverrideResumen;
      firma: { estado: EstadoFirmaOverride; detalle: string };
      eventoSha256: string;
    };

/** Actor legible para atribucion (email o nombre del token verificado). */
function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)
    ?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// =============================================================================
// POST /api/clientes/[id]/override — registra el override motivado y sellado.
// =============================================================================
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  // 0) tenantId + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  // 1) Body validado con zod (400 con detalle si no cumple).
  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parseado = bodySchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      {
        error: "Body invalido",
        detalles: parseado.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { fuente, resultado, motivo } = parseado.data;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      // 2) Verificar que el cliente pertenece al tenant (RLS + fail-closed).
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true },
      });
      if (!cliente) {
        return { tipo: "no-cliente" };
      }

      // 3) Payload CANONICO del acto (claves ordenadas de forma determinista)
      //    y su sello SHA-256. Es lo que un perito tercero puede recomputar.
      const ts = new Date();
      const payloadCanonico = canonicalizar({
        clienteId: cliente.id,
        rfc: cliente.rfc,
        fuente,
        resultado,
        motivo,
        actor,
        ts: ts.toISOString(),
      });
      const selloSha256 = sha256(payloadCanonico);

      // 4) Intentar la firma e.firma via el conector enchufable. Hoy NoOp:
      //    devuelve SIN_FIRMA con detalle honesto; el override queda igualmente
      //    motivado, sellado y atribuido.
      const firma = await obtenerFirmador().firmar({
        payloadCanonico,
        sha256: selloSha256,
        actor,
      });

      // 5) Crear el OverrideAlerta con el estado que reporto el conector.
      const firmaDetalle: string =
        firma.serialCertificado !== undefined
          ? `${firma.detalle} (serial: ${firma.serialCertificado})`
          : firma.detalle;
      const override = await tx.overrideAlerta.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          fuente,
          resultado,
          motivo,
          actor,
          sha256: selloSha256,
          estadoFirma: firma.estado,
          firmaDetalle,
          creadoEn: ts,
        },
        select: {
          id: true,
          fuente: true,
          resultado: true,
          motivo: true,
          actor: true,
          sha256: true,
          estadoFirma: true,
          firmaDetalle: true,
          creadoEn: true,
        },
      });

      // 6) Bitacora append-only: encadenar con el sha256 del ultimo evento del
      //    tenant (lectura + insert atomicos dentro de la transaccion).
      //    Patron EXACTO de la maquina de estados / cumplimiento.
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      const payloadEvento = canonicalizar({
        tenantId,
        accion: "OVERRIDE_ALERTA",
        actor,
        clienteId: cliente.id,
        fuente,
        resultado,
        overrideId: override.id,
        overrideSha256: override.sha256,
        estadoFirma: override.estadoFirma,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      const eventoSha256 = sha256(payloadEvento);

      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "OVERRIDE_ALERTA",
          payloadRef: `override:${override.id}:cliente:${cliente.id}:fuente:${fuente}`,
          sha256: eventoSha256,
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return {
        tipo: "ok",
        override: {
          id: override.id,
          fuente: override.fuente as FuenteVerificacion,
          resultado: override.resultado,
          motivo: override.motivo,
          actor: override.actor,
          sha256: override.sha256,
          estadoFirma: override.estadoFirma as EstadoFirmaOverride,
          firmaDetalle: override.firmaDetalle,
          creadoEn: override.creadoEn.toISOString(),
        },
        firma: { estado: firma.estado, detalle: firma.detalle },
        eventoSha256,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el override" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-cliente") {
    return NextResponse.json(
      { error: "Cliente no encontrado para este tenant" },
      { status: 404 },
    );
  }

  // IMPORTANTE (C9/C11): el override no desbloquea nada porque NADA estaba
  // bloqueado. Solo documenta la decision humana de continuar, con su motivo.
  return NextResponse.json(
    {
      ok: true,
      mensaje:
        "Override registrado: la decision de continuar quedo motivada, atribuida, sellada y encadenada en bitacora. La alerta original NO se borra ni se modifica.",
      override: salida.override,
      firma: salida.firma,
      eventoBitacoraSha256: salida.eventoSha256,
    },
    { status: 201 },
  );
}

// =============================================================================
// GET /api/clientes/[id]/override — lista los overrides del cliente (tenant del
// JWT; RLS filtra). 404 si el cliente no existe para el tenant.
// =============================================================================
type ResultadoGet =
  | { tipo: "no-cliente" }
  | { tipo: "ok"; overrides: OverrideResumen[] };

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  let salida: ResultadoGet;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoGet> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) {
        return { tipo: "no-cliente" };
      }

      const filas = await tx.overrideAlerta.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          fuente: true,
          resultado: true,
          motivo: true,
          actor: true,
          sha256: true,
          estadoFirma: true,
          firmaDetalle: true,
          creadoEn: true,
        },
      });

      return {
        tipo: "ok",
        overrides: filas.map(
          (f): OverrideResumen => ({
            id: f.id,
            fuente: f.fuente as FuenteVerificacion,
            resultado: f.resultado,
            motivo: f.motivo,
            actor: f.actor,
            sha256: f.sha256,
            estadoFirma: f.estadoFirma as EstadoFirmaOverride,
            firmaDetalle: f.firmaDetalle,
            creadoEn: f.creadoEn.toISOString(),
          }),
        ),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron consultar los overrides" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-cliente") {
    return NextResponse.json(
      { error: "Cliente no encontrado para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, overrides: salida.overrides }, { status: 200 });
}
