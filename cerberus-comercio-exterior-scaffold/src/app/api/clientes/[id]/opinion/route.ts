// CERBERUS COMERCIO EXTERIOR — API opinión 32-D ingestada + validación + cotejo. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/opinion/route.ts  (Incremento 22)
// Propósito: POST que ingiere el TEXTO de la opinión de cumplimiento (32-D) que
//            el cliente entrega impresa/PDF, valida su AUTENTICIDAD con el
//            validador automático (@/lib/validador-opinion) para detectar
//            falsificaciones, intenta el COTEJO EN VIVO ante el SAT por folio
//            (@/lib/verificador-opinion-sat, NoOp hoy), persiste
//            OpinionCumplimientoIngestada, registra un evento encadenado en
//            bitácora y deja una VerificacionCumplimiento de la fuente
//            OPINION_32D acorde al veredicto + sentido + cotejo. GET lista las
//            opiniones ingestadas del cliente.
//
// C9: un veredicto SOSPECHOSA/NO_AUTENTICA es una ALERTA para revisión humana,
// nunca un bloqueo. El cotejo en vivo por folio (no requiere e.firma del cliente)
// es lo que RATIFICA de forma definitiva; hoy queda pendiente (conector NoOp).
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
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { analizarOpinion, type AnalisisOpinion, type SentidoOpinion } from "@/lib/validador-opinion";
import { obtenerVerificadorOpinion, type EstadoCotejoSat } from "@/lib/verificador-opinion-sat";

export const runtime = "nodejs";

const bodySchema = z.object({
  // Texto de la opinión (copiado/OCR del PDF impreso). Máx razonable ~256 KB.
  texto: z.string().trim().min(40, "Pega el texto completo de la opinión (mín. 40 caracteres)").max(262144),
  nombreArchivo: z.string().trim().max(256).optional(),
});

type Params = { params: Promise<{ id: string }> };

type ResultadoPost =
  | { tipo: "no-cliente" }
  | {
      tipo: "ok";
      opinionId: string;
      analisis: AnalisisOpinion;
      cotejo: { estado: EstadoCotejoSat; detalle: string };
      opinion32d: { resultado: string; detalle: string };
    };

/** Mapea el sentido a resultado de cumplimiento (positivo = al corriente). */
function porSentido(sentido: SentidoOpinion, nota: string): { resultado: string; detalle: string } {
  switch (sentido) {
    case "POSITIVA":
    case "SIN_OBLIGACIONES":
      return { resultado: "AL_CORRIENTE", detalle: `Opinión 32-D ${sentido}. ${nota}` };
    case "NEGATIVA":
    case "NO_INSCRITO":
      return {
        resultado: "ALERTA",
        detalle: `Opinión 32-D ${sentido}. Alerta para revisión humana (C9). ${nota}`,
      };
    default:
      return { resultado: "NO_DISPONIBLE", detalle: `Opinión sin sentido claro. ${nota}` };
  }
}

/** Mapea veredicto + sentido + cotejo a la VerificacionCumplimiento OPINION_32D.
 *  El cotejo EN VIVO tiene PRIORIDAD sobre la heurística de texto: una
 *  confirmación (o discrepancia) del SAT manda sobre el análisis del documento. */
function resultadoOpinion(
  veredicto: AnalisisOpinion["resultado"],
  sentido: SentidoOpinion,
  cotejo: EstadoCotejoSat,
): { resultado: string; detalle: string } {
  // 1) El SAT confirmó el folio en vivo: es la prueba más fuerte.
  if (cotejo === "CONFIRMADA") {
    return porSentido(sentido, "Ratificada por cotejo EN VIVO ante el SAT.");
  }
  // 2) El SAT discrepa / no localiza el folio: alerta fuerte (posible falso).
  if (cotejo === "DISCREPANCIA") {
    return {
      resultado: "ALERTA",
      detalle: "El cotejo en vivo ante el SAT discrepa o no localiza el folio. Revisión humana (C9).",
    };
  }
  // 3) Sin cotejo en vivo (NO_INTENTADO/NO_DISPONIBLE): decide el análisis textual.
  if (veredicto === "NO_AUTENTICA") {
    return {
      resultado: "ALERTA",
      detalle: "La opinión entregada NO es auténtica (probable falsificación). Revisión humana (C9).",
    };
  }
  if (veredicto === "NO_VERIFICABLE" || veredicto === "SOSPECHOSA") {
    return {
      resultado: "ALERTA",
      detalle: "La opinión entregada es sospechosa o no verificable. Revisión humana y cotejo en vivo.",
    };
  }
  // veredicto AUTENTICA sin cotejo en vivo.
  return porSentido(
    sentido,
    "Auténtica por análisis del documento; cotejo en vivo ante el SAT pendiente/no disponible.",
  );
}

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// =============================================================================
// POST /api/clientes/[id]/opinion — ingesta + validación de autenticidad + cotejo.
// =============================================================================
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);

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
  const { texto, nombreArchivo } = parseado.data;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true },
      });
      if (!cliente) return { tipo: "no-cliente" };

      const analisis = analizarOpinion(texto, cliente.rfc);

      // Cotejo en vivo ante el SAT por folio (NoOp → NO_DISPONIBLE).
      const cotejo = await obtenerVerificadorOpinion().cotejar({
        rfc: cliente.rfc,
        folio: analisis.folio,
        sentidoDeclarado: analisis.sentido,
      });

      const ts = new Date();
      const opinion = await tx.opinionCumplimientoIngestada.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          nombreArchivo: nombreArchivo ?? null,
          sha256: analisis.sha256,
          textoOriginal: texto,
          rfcDocumento: analisis.rfcDocumento,
          folio: analisis.folio,
          sentido: analisis.sentido,
          fechaEmision: analisis.fechaEmision ? new Date(analisis.fechaEmision) : null,
          resultado: analisis.resultado,
          observaciones: JSON.stringify({ resumen: analisis.resumen, checks: analisis.checks }),
          cotejoEnVivo: cotejo.estado,
          cotejoDetalle: cotejo.detalle,
          actor,
          creadoEn: ts,
        },
        select: { id: true },
      });

      const opinion32d = resultadoOpinion(analisis.resultado, analisis.sentido, cotejo.estado);
      await tx.verificacionCumplimiento.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          fuente: "OPINION_32D",
          resultado: opinion32d.resultado as
            | "AL_CORRIENTE"
            | "NO_DISPONIBLE"
            | "ALERTA"
            | "INHABILITADO_PRESUNTO"
            | "INHABILITADO_DEFINITIVO",
          detalle: opinion32d.detalle,
          snapshotSha256: analisis.sha256,
          consultadoEn: ts,
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
        accion: "OPINION_INGESTADA",
        actor,
        clienteId: cliente.id,
        opinionId: opinion.id,
        opinionSha256: analisis.sha256,
        veredicto: analisis.resultado,
        folio: analisis.folio,
        cotejo: cotejo.estado,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "OPINION_INGESTADA",
          payloadRef: `opinion:${opinion.id}:cliente:${cliente.id}:${analisis.resultado}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return {
        tipo: "ok",
        opinionId: opinion.id,
        analisis,
        cotejo: { estado: cotejo.estado, detalle: cotejo.detalle },
        opinion32d,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar la opinión de cumplimiento" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-cliente") {
    return NextResponse.json(
      { error: "Cliente no encontrado para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      opinionId: salida.opinionId,
      veredicto: salida.analisis.resultado,
      resumen: salida.analisis.resumen,
      checks: salida.analisis.checks,
      extraido: {
        rfc: salida.analisis.rfcDocumento,
        folio: salida.analisis.folio,
        sentido: salida.analisis.sentido,
        fechaEmision: salida.analisis.fechaEmision,
      },
      cotejo: salida.cotejo,
      opinion32d: salida.opinion32d,
    },
    { status: 201 },
  );
}

// =============================================================================
// GET /api/clientes/[id]/opinion — lista las opiniones ingestadas del cliente.
// =============================================================================
export async function GET(_req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  try {
    const opiniones = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) return null;
      const filas = await tx.opinionCumplimientoIngestada.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          nombreArchivo: true,
          sha256: true,
          rfcDocumento: true,
          folio: true,
          sentido: true,
          fechaEmision: true,
          resultado: true,
          observaciones: true,
          cotejoEnVivo: true,
          cotejoDetalle: true,
          actor: true,
          creadoEn: true,
        },
      });
      return filas.map((f) => ({
        id: f.id,
        nombreArchivo: f.nombreArchivo,
        sha256: f.sha256,
        rfcDocumento: f.rfcDocumento,
        folio: f.folio,
        sentido: f.sentido,
        fechaEmision: f.fechaEmision?.toISOString() ?? null,
        resultado: f.resultado,
        observaciones: f.observaciones,
        cotejoEnVivo: f.cotejoEnVivo,
        cotejoDetalle: f.cotejoDetalle,
        actor: f.actor,
        creadoEn: f.creadoEn.toISOString(),
      }));
    });

    if (opiniones === null) {
      return NextResponse.json(
        { error: "Cliente no encontrado para este tenant" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, opiniones }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar las opiniones" },
      { status: 500 },
    );
  }
}
