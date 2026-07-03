// CERBERUS COMERCIO EXTERIOR — API pedimento (agrega contribuciones). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pedimento/route.ts  (Incremento 31)
// Propósito: POST genera un PEDIMENTO que agrega las contribuciones de las
//            partidas de la operación (IGI/DTA/IEPS/IVA totales), lo sella
//            (sha256) y registra evento "PEDIMENTO_GENERADO". GET lista los
//            pedimentos de la operación. Multi-tenant (RLS).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { agregarPedimento, type ContribucionesPartida } from "@/lib/contribuciones";

export const runtime = "nodejs";

const bodySchema = z.object({
  claveDePedimento: z.string().trim().min(1, "La clave de pedimento es obligatoria").max(10),
  regimen: z.string().trim().min(1, "El régimen es obligatorio").max(80),
  tipoCambioUsd: z.number({ invalid_type_error: "tipoCambioUsd debe ser numérico" }).positive(),
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
  | { tipo: "sin-partidas" }
  | { tipo: "ok"; pedimentoId: string; sha256: string; totales: ReturnType<typeof agregarPedimento> };

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

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      const op = await tx.operacion.findFirst({ where: { id: operacionId }, select: { id: true } });
      if (!op) return { tipo: "no-op" };

      const partidas = await tx.partida.findMany({
        where: { operacionId: op.id },
        select: {
          valorAduana: true,
          igiImporte: true,
          dtaImporte: true,
          iepsImporte: true,
          ivaImporte: true,
        },
      });
      if (partidas.length === 0) return { tipo: "sin-partidas" };

      const contribuciones: ContribucionesPartida[] = partidas.map((p) => {
        const valorAduana = p.valorAduana === null ? 0 : Number(p.valorAduana);
        const igi = p.igiImporte === null ? 0 : Number(p.igiImporte);
        const dta = p.dtaImporte === null ? 0 : Number(p.dtaImporte);
        const ieps = p.iepsImporte === null ? 0 : Number(p.iepsImporte);
        const iva = p.ivaImporte === null ? 0 : Number(p.ivaImporte);
        return { valorAduana, igi, dta, ieps, iva, baseIva: valorAduana + igi + dta + ieps, total: igi + dta + ieps + iva };
      });
      const totales = agregarPedimento(contribuciones);

      const ts = new Date();
      const selloPedimento = sha256(
        canonicalizar({
          operacionId: op.id,
          claveDePedimento: d.claveDePedimento,
          regimen: d.regimen,
          tipoCambioUsd: d.tipoCambioUsd,
          ...totales,
          partidas: partidas.length,
          ts: ts.toISOString(),
        }),
      );

      const pedimento = await tx.pedimento.create({
        data: {
          tenantId,
          operacionId: op.id,
          claveDePedimento: d.claveDePedimento,
          regimen: d.regimen,
          tipoCambioUsd: d.tipoCambioUsd,
          valorAduanaTotal: totales.valorAduanaTotal,
          igiTotal: totales.igiTotal,
          dtaTotal: totales.dtaTotal,
          iepsTotal: totales.iepsTotal,
          ivaTotal: totales.ivaTotal,
          contribucionesTotal: totales.contribucionesTotal,
          sha256: selloPedimento,
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
        accion: "PEDIMENTO_GENERADO",
        actor,
        operacionId: op.id,
        pedimentoId: pedimento.id,
        pedimentoSha256: selloPedimento,
        contribucionesTotal: totales.contribucionesTotal,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PEDIMENTO_GENERADO",
          operacionId: op.id,
          payloadRef: `operacion:${op.id}:pedimento:${pedimento.id}:${d.claveDePedimento}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return { tipo: "ok", pedimentoId: pedimento.id, sha256: selloPedimento, totales };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo generar el pedimento" }, { status: 500 });
  }

  if (salida.tipo === "no-op") {
    return NextResponse.json({ error: "Operación no encontrada para este tenant" }, { status: 404 });
  }
  if (salida.tipo === "sin-partidas") {
    return NextResponse.json({ error: "Captura al menos una partida antes de generar el pedimento" }, { status: 400 });
  }
  return NextResponse.json(
    { ok: true, pedimentoId: salida.pedimentoId, sha256: salida.sha256, totales: salida.totales },
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
    const pedimentos = await withTenantFromSession(session, async (tx) => {
      const filas = await tx.pedimento.findMany({
        where: { operacionId },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true, claveDePedimento: true, regimen: true, tipoCambioUsd: true,
          valorAduanaTotal: true, igiTotal: true, dtaTotal: true, iepsTotal: true,
          ivaTotal: true, contribucionesTotal: true, sha256: true, creadoEn: true,
        },
      });
      return filas.map((p) => ({
        id: p.id,
        claveDePedimento: p.claveDePedimento,
        regimen: p.regimen,
        tipoCambioUsd: Number(p.tipoCambioUsd),
        valorAduanaTotal: Number(p.valorAduanaTotal),
        igiTotal: Number(p.igiTotal),
        dtaTotal: Number(p.dtaTotal),
        iepsTotal: Number(p.iepsTotal),
        ivaTotal: Number(p.ivaTotal),
        contribucionesTotal: Number(p.contribucionesTotal),
        sha256: p.sha256,
        creadoEn: p.creadoEn.toISOString(),
      }));
    });
    return NextResponse.json({ ok: true, pedimentos }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudieron listar los pedimentos" }, { status: 500 });
  }
}
