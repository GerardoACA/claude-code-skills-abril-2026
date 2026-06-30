// ============================================================================
// PRODUCTO: CERBERUS COMERCIO EXTERIOR (SaaS nuevo)  —  NO es SIDF.
// Handler/Route (Next.js App Router) para registrar el consentimiento de
// datos sensibles con SELLO DE INTEGRIDAD (SHA-256 + timestamp + hash-chain).
//
// LFPDPPP: Responsable = tenant ; Encargado = CERBERUS Comercio Exterior.
// Multi-tenant: tenantId SIEMPRE se toma del token de sesión, NUNCA del body
// (consistente con el endurecimiento RLS del diseño v2: tenant_id vs token).
//
// Ubicación sugerida: app/api/privacidad/consentimiento/route.ts
// ============================================================================

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth"; // debe exponer { tenantId, userId }

export const runtime = "nodejs";

/** SHA-256 hex de una cadena. Capa probatoria del diseño v2. */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Serialización canónica y estable (claves ordenadas) para sellar. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

type Body = {
  titularRef: string;
  operacionRef?: string;
  versionAvisoId: string; // versión del aviso corto que estaba en pantalla
  hashAvisoEnPantalla: string; // SHA-256 que el cliente declara haber visto
  consienteBiometricos: boolean;
  consienteGeoloc: boolean;
  rutaSinEvidencia: boolean; // true => "Continuar sin capturar evidencia sensible"
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { tenantId } = session;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.titularRef || !body.versionAvisoId) {
    return NextResponse.json(
      { error: "titularRef y versionAvisoId son obligatorios" },
      { status: 400 },
    );
  }

  // Si NO eligió la ruta alterna, debe existir consentimiento activo (art. 9):
  // la casilla NO pre-marcada se traduce aquí en un booleano explícito.
  if (!body.rutaSinEvidencia && !(body.consienteBiometricos || body.consienteGeoloc)) {
    return NextResponse.json(
      { error: "Consentimiento ausente: marque la casilla o elija la ruta sin evidencia" },
      { status: 422 },
    );
  }

  // 1) Recuperar la versión del aviso scopeada al tenant y verificar el hash.
  const aviso = await prisma.versionAviso.findFirst({
    where: { id: body.versionAvisoId, tenantId },
  });
  if (!aviso) {
    return NextResponse.json({ error: "Versión de aviso no encontrada" }, { status: 404 });
  }
  // Anti-suplantación: el hash que vio el cliente debe coincidir con el publicado.
  if (
    body.hashAvisoEnPantalla &&
    body.hashAvisoEnPantalla !== aviso.hashAviso
  ) {
    return NextResponse.json(
      { error: "El aviso mostrado no corresponde a la versión vigente; recargue" },
      { status: 409 },
    );
  }

  const ipOrigen =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const creadoEn = new Date();

  // 2) Hash-chain append-only por tenant: tomar el sello del registro previo.
  const previo = await prisma.consentimientoDatos.findFirst({
    where: { tenantId },
    orderBy: { creadoEn: "desc" },
    select: { selloRegistro: true },
  });
  const hashPrev = previo?.selloRegistro ?? null;

  // 3) Sello de integridad del registro (SHA-256 sobre payload canónico).
  const payload = {
    tenantId,
    titularRef: body.titularRef,
    operacionRef: body.operacionRef ?? null,
    versionAvisoId: aviso.id,
    versionAvisoEtiqueta: aviso.version,
    hashAvisoPrivacidad: aviso.hashAviso,
    consienteBiometricos: body.consienteBiometricos,
    consienteGeoloc: body.consienteGeoloc,
    rutaSinEvidencia: body.rutaSinEvidencia,
    ipOrigen,
    userAgent,
    creadoEn: creadoEn.toISOString(),
    hashPrev,
  };
  const selloRegistro = sha256(canonical(payload));

  const registro = await prisma.consentimientoDatos.create({
    data: {
      tenantId,
      titularRef: body.titularRef,
      operacionRef: body.operacionRef ?? null,
      versionAvisoId: aviso.id,
      versionAvisoEtiqueta: aviso.version,
      hashAvisoPrivacidad: aviso.hashAviso,
      consientebiometricos: body.consienteBiometricos,
      consienteGeoloc: body.consienteGeoloc,
      rutaSinEvidencia: body.rutaSinEvidencia,
      medio: "WEB_PUNTO_CAPTURA",
      ipOrigen,
      userAgent,
      selloRegistro,
      hashPrev,
      creadoEn,
    },
    select: { id: true, selloRegistro: true, creadoEn: true },
  });

  return NextResponse.json(
    {
      ok: true,
      consentimientoId: registro.id,
      selloRegistro: registro.selloRegistro,
      hashAvisoPrivacidad: aviso.hashAviso,
      versionAviso: aviso.version,
      timestamp: registro.creadoEn.toISOString(),
    },
    { status: 201 },
  );
}
