// CERBERUS COMERCIO EXTERIOR — API partidas (valoración + contribuciones). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/partidas/route.ts  (Incremento 31)
// Propósito: POST captura una PARTIDA de la operación con su valor en aduana y
//            tasas, calcula sus contribuciones (IGI/DTA/IEPS/IVA) con
//            @/lib/contribuciones, la sella (sha256) y la persiste + evento de
//            bitácora "PARTIDA_CAPTURADA". GET lista las partidas de la operación.
//
// La tasa de IGI se captura (o vendrá del conector ClasificadorArancel). Se valida
// la fracción arancelaria (8 dígitos). Multi-tenant: tenantId del JWT; escritura
// dentro de withTenantFromSession (RLS).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { calcularContribucionesPartida } from "@/lib/contribuciones";
import { esFraccionValida } from "@/lib/clasificador-arancel";

export const runtime = "nodejs";

const bodySchema = z.object({
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(300),
  fraccion: z.string().trim().refine(esFraccionValida, "La fracción debe tener 8 dígitos (TIGIE)"),
  nico: z.string().trim().max(4).optional(),
  umt: z.string().trim().max(20).optional(),
  origen: z.string().trim().max(60).optional(),
  incoterm: z.string().trim().max(10).optional(),
  valorAduana: z.number({ invalid_type_error: "valorAduana debe ser numérico" }).nonnegative(),
  tasaIgiPct: z.number({ invalid_type_error: "tasaIgiPct debe ser numérico" }).nonnegative(),
  tasaIepsPct: z.number().nonnegative().optional(),
  dtaFijo: z.number().nonnegative().optional(),
});

type Params = { params: Promise<{ id: string }> };

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

type ResultadoPost =
  | { tipo: "no-op" }
  | { tipo: "ok"; partidaId: string; sha256: string; contribuciones: ReturnType<typeof calcularContribucionesPartida> };

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);
  const { id: operacionId } = await params;

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
  const d = parseado.data;

  const contribuciones = calcularContribucionesPartida({
    valorAduana: d.valorAduana,
    tasaIgiPct: d.tasaIgiPct,
    tasaIepsPct: d.tasaIepsPct,
    dtaFijo: d.dtaFijo,
  });

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      const op = await tx.operacion.findFirst({ where: { id: operacionId }, select: { id: true } });
      if (!op) return { tipo: "no-op" };

      const ts = new Date();
      const selloPartida = sha256(
        canonicalizar({
          operacionId: op.id,
          fraccion: d.fraccion,
          nico: d.nico ?? null,
          descripcion: d.descripcion,
          valorAduana: contribuciones.valorAduana,
          tasaIgiPct: d.tasaIgiPct,
          igi: contribuciones.igi,
          dta: contribuciones.dta,
          ieps: contribuciones.ieps,
          iva: contribuciones.iva,
          ts: ts.toISOString(),
        }),
      );

      const partida = await tx.partida.create({
        data: {
          tenantId,
          operacionId: op.id,
          descripcion: d.descripcion,
          fraccionDeclarada: d.fraccion,
          nico: d.nico ?? null,
          umt: d.umt ?? null,
          origen: d.origen ?? null,
          incoterm: d.incoterm ?? null,
          valorAduana: contribuciones.valorAduana,
          tasaIgiPct: d.tasaIgiPct,
          tasaIepsPct: d.tasaIepsPct ?? null,
          igiImporte: contribuciones.igi,
          dtaImporte: contribuciones.dta,
          iepsImporte: contribuciones.ieps,
          ivaImporte: contribuciones.iva,
          sha256: selloPartida,
          creadoEn: ts,
        },
        select: { id: true },
      });

      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "PARTIDA_CAPTURADA",
        actor,
        operacionId: op.id,
        partidaId: partida.id,
        partidaSha256: selloPartida,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PARTIDA_CAPTURADA",
          operacionId: op.id,
          payloadRef: `operacion:${op.id}:partida:${partida.id}:fraccion:${d.fraccion}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return { tipo: "ok", partidaId: partida.id, sha256: selloPartida, contribuciones };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar la partida" }, { status: 500 });
  }

  if (salida.tipo === "no-op") {
    return NextResponse.json({ error: "Operación no encontrada para este tenant" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, partidaId: salida.partidaId, sha256: salida.sha256, contribuciones: salida.contribuciones },
    { status: 201 },
  );
}

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: operacionId } = await params;

  try {
    const partidas = await withTenantFromSession(session, async (tx) => {
      const filas = await tx.partida.findMany({
        where: { operacionId },
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          descripcion: true,
          fraccionDeclarada: true,
          nico: true,
          origen: true,
          valorAduana: true,
          tasaIgiPct: true,
          igiImporte: true,
          dtaImporte: true,
          iepsImporte: true,
          ivaImporte: true,
          sha256: true,
          creadoEn: true,
        },
      });
      return filas.map((p) => ({
        id: p.id,
        descripcion: p.descripcion,
        fraccion: p.fraccionDeclarada,
        nico: p.nico,
        origen: p.origen,
        valorAduana: p.valorAduana === null ? null : Number(p.valorAduana),
        tasaIgiPct: p.tasaIgiPct === null ? null : Number(p.tasaIgiPct),
        igi: p.igiImporte === null ? null : Number(p.igiImporte),
        dta: p.dtaImporte === null ? null : Number(p.dtaImporte),
        ieps: p.iepsImporte === null ? null : Number(p.iepsImporte),
        iva: p.ivaImporte === null ? null : Number(p.ivaImporte),
        sha256: p.sha256,
        creadoEn: p.creadoEn.toISOString(),
      }));
    });
    return NextResponse.json({ ok: true, partidas }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudieron listar las partidas" }, { status: 500 });
  }
}
