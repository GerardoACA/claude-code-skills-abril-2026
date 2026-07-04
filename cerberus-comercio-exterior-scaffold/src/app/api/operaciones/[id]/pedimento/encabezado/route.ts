// CERBERUS COMERCIO EXTERIOR — API encabezado del pedimento (upsert). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/pedimento/encabezado/route.ts  (Inc 41; 55)
// Propósito: GET devuelve el pedimento vigente de la operación (el más
//            reciente) o null si aún no se captura. POST crea o actualiza
//            (upsert por operación) el ENCABEZADO del pedimento: clave de
//            pedimento, régimen, tipo de cambio y — desde Inc 55, ya con
//            campos en el modelo — `numero` (15 dígitos, se normaliza con
//            normalizarNumeroPedimento) y `aduana` (3 dígitos), ambos
//            OPCIONALES: si vienen se validan (400 con mensaje claro si son
//            inválidos); si no vienen, se conserva lo ya guardado. Los totales
//            se recalculan de las partidas actuales (0 si no hay), el registro
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
import {
  esClaveAduanaValida,
  esNumeroPedimentoValido,
  normalizarNumeroPedimento,
} from "@/lib/pedimento-validacion";

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
  // [Inc 55] Número de pedimento y aduana: OPCIONALES; la validación fina
  // (15 y 3 dígitos) se hace tras el parse con los validadores puros.
  numero: z
    .string({ invalid_type_error: "numero debe ser texto" })
    .trim()
    .max(40, "El número de pedimento excede 40 caracteres")
    .optional(),
  aduana: z
    .string({ invalid_type_error: "aduana debe ser texto" })
    .trim()
    .max(10, "La clave de aduana excede 10 caracteres")
    .optional(),
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
  numero: string | null;
  aduana: string | null;
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
            numero: true,
            aduana: true,
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
          numero: p.numero,
          aduana: p.aduana,
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

  // [Inc 55] Validación fina de número de pedimento y aduana (opcionales):
  // cadena vacía tras trim se trata como "no enviado"; si vienen con contenido
  // y son inválidos, 400 con mensaje claro (validadores puros, sin I/O).
  let numeroNormalizado: string | undefined;
  if (d.numero !== undefined && d.numero.length > 0) {
    numeroNormalizado = normalizarNumeroPedimento(d.numero);
    if (!esNumeroPedimentoValido(numeroNormalizado)) {
      return NextResponse.json(
        {
          error:
            "Número de pedimento inválido: deben ser exactamente 15 dígitos (se toleran espacios y guiones como separadores)",
        },
        { status: 400 },
      );
    }
  }
  let aduanaValidada: string | undefined;
  if (d.aduana !== undefined && d.aduana.length > 0) {
    if (!esClaveAduanaValida(d.aduana)) {
      return NextResponse.json(
        {
          error:
            "Clave de aduana inválida: deben ser exactamente 3 dígitos (p. ej. 240 Nuevo Laredo, 470 Veracruz)",
        },
        { status: 400 },
      );
    }
    aduanaValidada = d.aduana;
  }

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

      // 3) Upsert por operación: se actualiza el pedimento más reciente o se
      //    crea el primero (el modelo no tiene unique por operación; el
      //    "vigente" es el más reciente, criterio del GET). Se lee ANTES del
      //    sello para conservar numero/aduana ya guardados si el body no los
      //    trae (opcionales: no enviar NO borra lo capturado).
      const existente = await tx.pedimento.findFirst({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "desc" },
        select: { id: true, numero: true, aduana: true },
      });
      const numeroFinal: string | null = numeroNormalizado ?? existente?.numero ?? null;
      const aduanaFinal: string | null = aduanaValidada ?? existente?.aduana ?? null;

      // 4) Sello canónico del pedimento con el encabezado capturado.
      const ts = new Date();
      const selloPedimento = sha256(
        canonicalizar({
          operacionId: op.id,
          claveDePedimento: d.claveDePedimento,
          numero: numeroFinal,
          aduana: aduanaFinal,
          regimen: d.regimen,
          tipoCambioUsd: d.tipoCambioUsd,
          ...totales,
          partidas: partidas.length,
          ts: ts.toISOString(),
        }),
      );

      const datosPedimento = {
        claveDePedimento: d.claveDePedimento,
        numero: numeroFinal,
        aduana: aduanaFinal,
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
