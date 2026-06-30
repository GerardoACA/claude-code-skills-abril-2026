// CERBERUS COMERCIO EXTERIOR — Privacidad (API consentimiento). NO es SIDF.
// ============================================================================
// Route handler (Next.js App Router) para registrar el consentimiento de datos
// sensibles con SELLO DE INTEGRIDAD (SHA-256 + timestamp + hash-chain).
//
// LFPDPPP: Responsable = tenant ; Encargado = CERBERUS Comercio Exterior.
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene
// del JWT verificado de la sesión (NextAuth), NUNCA del body del request.
//
// El modelo `ConsentimientoDatos` lo define el Agente B en prisma/schema.prisma
// (este handler asume sus campos del blueprint del módulo de privacidad).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";

export const runtime = "nodejs";

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
  // 0) tenantId del JWT verificado, NUNCA del body (convención DURA del blueprint).
  const session = await getServerSession(authOptions);
  // El claim tenantId puede llegar tipado como string (augmentación NextAuth de
  // Agente D) o como unknown; lo normalizamos a string con guarda explícita para
  // no depender de la forma exacta del tipo y satisfacer `strict`.
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

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

  const ipOrigen = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // Toda la lectura/escritura tenant-scoped corre dentro de withTenantFromSession
  // (convención DURA del blueprint): abre transacción + SET LOCAL app.tenant_id,
  // de modo que la RLS filtra por el tenantId DERIVADO DEL JWT (nunca del body) y
  // la lectura del eslabón previo + el INSERT del nuevo eslabón son atómicos.
  let resultado:
    | { tipo: "ok"; consentimientoId: string; selloRegistro: string; hashAvisoPrivacidad: string; versionAviso: string; timestamp: string }
    | { tipo: "no-aviso" }
    | { tipo: "hash-desfasado" };

  try {
    resultado = await withTenantFromSession(session, async (tx) => {
      // 1) Recuperar la versión del aviso (RLS la limita al tenant) y verificar el hash.
      const aviso = await tx.versionAviso.findFirst({
        where: { id: body.versionAvisoId },
      });
      if (!aviso) {
        return { tipo: "no-aviso" as const };
      }
      // Anti-suplantación: el hash que vio el cliente debe coincidir con el publicado.
      if (body.hashAvisoEnPantalla && body.hashAvisoEnPantalla !== aviso.hashAviso) {
        return { tipo: "hash-desfasado" as const };
      }

      const creadoEn = new Date();

      // 2) Hash-chain append-only por tenant: tomar el sello del registro previo.
      const previo = await tx.consentimientoDatos.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { selloRegistro: true },
      });
      const hashPrev = previo?.selloRegistro ?? null;

      // 3) Sello de integridad del registro (SHA-256 sobre payload canónico).
      //    La primitiva SHA-256 proviene de @/lib/probatoria/hash (Agente E).
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

      const registro = await tx.consentimientoDatos.create({
        data: {
          tenantId,
          titularRef: body.titularRef,
          operacionRef: body.operacionRef ?? null,
          versionAvisoId: aviso.id,
          versionAvisoEtiqueta: aviso.version,
          hashAvisoPrivacidad: aviso.hashAviso,
          consienteBiometricos: body.consienteBiometricos,
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

      return {
        tipo: "ok" as const,
        consentimientoId: registro.id,
        selloRegistro: registro.selloRegistro,
        hashAvisoPrivacidad: aviso.hashAviso,
        versionAviso: aviso.version,
        timestamp: registro.creadoEn.toISOString(),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el consentimiento" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-aviso") {
    return NextResponse.json({ error: "Versión de aviso no encontrada" }, { status: 404 });
  }
  if (resultado.tipo === "hash-desfasado") {
    return NextResponse.json(
      { error: "El aviso mostrado no corresponde a la versión vigente; recargue" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      consentimientoId: resultado.consentimientoId,
      selloRegistro: resultado.selloRegistro,
      hashAvisoPrivacidad: resultado.hashAvisoPrivacidad,
      versionAviso: resultado.versionAviso,
      timestamp: resultado.timestamp,
    },
    { status: 201 },
  );
}
