// CERBERUS COMERCIO EXTERIOR — API encabezado del pedimento (upsert). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pedimento/encabezado/route.ts  (Inc 41)
// Propósito: GET devuelve el pedimento vigente de la operación (el más
//            reciente) o null si aún no se captura. POST crea o actualiza
//            (upsert por operación) el ENCABEZADO del pedimento: clave de
//            pedimento, régimen y tipo de cambio (los únicos campos de
//            encabezado que existen en el modelo Pedimento; no hay `numero`
//            ni `aduana` en el schema y NO se migra). Los totales se
//            recalculan de las partidas actuales (0 si no hay), el registro
//            se sella (sha256 canónico) y se registra evento de bitácora
//            "PEDIMENTO_ENCABEZADO" encadenado (sha256 + hashPrev).
//
// Multi-tenant: tenantId del JWT (jamás del request); lectura/escritura dentro
// de withTenantFromSession (RLS) tras verificar que la operación es del tenant.
// Nota: la generación con totales de Inc 31 vive en ../route.ts y se conserva.
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
  claveDePedimento: z
    .string({ invalid_type_error: "claveDePedimento debe ser texto" })
    .trim()
    .min(1, "La clave de pedimento es obligatoria")
    .max(10, "La clave de pedimento excede 10 caracteres"),
  regimen: z
    .string({ invalid_type_error: "regimen debe ser texto" })
    .trim()
    .min(1, "El régimen es obligatorio")
    .max(80, "El régimen excede 80 caracteres"),
  tipoCambioUsd: z
    .number({ invalid_type_error: "tipoCambioUsd debe ser numérico" })
    .positive("El tipo de cambio debe ser positivo"),
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

/** Encabezado serializable del pedimento que consume el client component. */
type EncabezadoPedimento = {
  id: string;
  claveDePedimento: string;
  regimen: string;
  tipoCambioUsd: number;
  contribucionesTotal: number;
  sha256: string;
  creadoEn: string;
};

export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id: operacionId } = await params;
  try {
    const pedimento = await withTenantFromSession(
      session,
      async (tx): Promise<EncabezadoPedimento | null> => {
        const p = await tx.pedimento.findFirst({
          where: { operacionId },
          orderBy: { creadoEn: "desc" },
          select: {
            id: true,
            claveDePedimento: true,
            regimen: true,
            tipoCambioUsd: true,
            contribucionesTotal: true,
            sha256: true,
            creadoEn: true,
          },
        });
        if (!p) return null;
        return {
          id: p.id,
          claveDePedimento: p.claveDePedimento,
          regimen: p.regimen,
          tipoCambioUsd: Number(p.tipoCambioUsd),
          contribucionesTotal: Number(p.contribucionesTotal),
          sha256: p.sha256,
          creadoEn: p.creadoEn.toISOString(),
        };
      },
    );
    return NextResponse.json({ ok: true, pedimento }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el encabezado del pedimento" }, { status: 500 });
  }
}

type ResultadoPost = { tipo: "no-op" } | { tipo: "ok"; pedimentoId: string };

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
      // 1) La operación debe existir para el tenant del JWT (RLS filtra).
      const op = await tx.operacion.findFirst({ where: { id: operacionId }, select: { id: true } });
      if (!op) return { tipo: "no-op" };

      // 2) Totales de las partidas actuales (0 si aún no hay: el encabezado
      //    puede capturarse antes que las partidas).
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
      const contribuciones: ContribucionesPartida[] = partidas.map((p) => {
        const valorAduana = p.valorAduana === null ? 0 : Number(p.valorAduana);
        const igi = p.igiImporte === null ? 0 : Number(p.igiImporte);
        const dta = p.dtaImporte === null ? 0 : Number(p.dtaImporte);
        const ieps = p.iepsImporte === null ? 0 : Number(p.iepsImporte);
        const iva = p.ivaImporte === null ? 0 : Number(p.ivaImporte);
        return {
          valorAduana,
          igi,
          dta,
          ieps,
          iva,
          baseIva: valorAduana + igi + dta + ieps,
          total: igi + dta + ieps + iva,
        };
      });
      const totales = agregarPedimento(contribuciones);

      // 3) Sello canónico del pedimento con el encabezado capturado.
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

      // 4) Upsert por operación: se actualiza el pedimento más reciente o se
      //    crea el primero (el modelo no tiene unique por operación; el
      //    "vigente" es el más reciente, criterio del GET).
      const existente = await tx.pedimento.findFirst({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "desc" },
        select: { id: true },
      });
      const datosPedimento = {
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
      };
      const pedimento = existente
        ? await tx.pedimento.update({
            where: { id: existente.id },
            data: datosPedimento,
            select: { id: true },
          })
        : await tx.pedimento.create({
            data: { tenantId, operacionId: op.id, ...datosPedimento, creadoEn: ts },
            select: { id: true },
          });

      // 5) Evento de bitácora encadenado (append-only, sha256 + hashPrev).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "PEDIMENTO_ENCABEZADO",
        actor,
        operacionId: op.id,
        pedimentoId: pedimento.id,
        pedimentoSha256: selloPedimento,
        claveDePedimento: d.claveDePedimento,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PEDIMENTO_ENCABEZADO",
          operacionId: op.id,
          payloadRef: `operacion:${op.id}:pedimento:${pedimento.id}:encabezado:${d.claveDePedimento}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return { tipo: "ok", pedimentoId: pedimento.id };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el encabezado del pedimento" }, { status: 500 });
  }

  if (salida.tipo === "no-op") {
    return NextResponse.json({ error: "Operación no encontrada para este tenant" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, pedimentoId: salida.pedimentoId }, { status: 201 });
}
