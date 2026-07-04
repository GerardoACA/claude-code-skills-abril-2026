// CERBERUS COMERCIO EXTERIOR — re-cotejo en vivo de una opinión ya ingestada. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/opinion/[opinionId]/cotejar/route.ts  (Inc 57)
// Propósito: POST que RE-EJECUTA el cotejo en vivo ante el SAT de una opinión
//            32-D YA ingestada, SIN volver a subir el PDF:
//              - URL del validador: la guardada en su cotejoDetalle (bloque
//                parseable "url=…", vía urlSatDeDetalle) o una `urlQr` del body
//                (zod; se valida host del SAT — anti-SSRF — antes de usarla).
//                Caso típico: el QR nunca se detectó en el PDF y el capturista
//                lo escanea UNA vez con su teléfono y pega la URL.
//              - Corre el cotejo (verificador-opinion-sat), sella la EVIDENCIA
//                (sha256 + WORM) y actualiza cotejoEnVivo/cotejoDetalle con los
//                helpers COMPARTIDOS de @/lib/cotejo-evidencia + evento
//                encadenado OPINION_RECOTEJADA en bitácora.
//
// Multi-tenant (convención DURA): tenantId SIEMPRE del JWT verificado; lecturas
// y escrituras dentro de withTenantFromSession (RLS). La llamada de red al SAT
// corre FUERA de la transacción. Fail-safe: el WORM nunca tumba el re-cotejo;
// C9: el resultado alerta, nunca bloquea.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { urlSatDeDetalle } from "@/lib/cotejo-sat";
import { obtenerVerificadorOpinion, urlEsDelSat } from "@/lib/verificador-opinion-sat";
import { construirCotejoDetalle, sellarEvidenciaCotejo } from "@/lib/cotejo-evidencia";

export const runtime = "nodejs";

const bodySchema = z.object({
  // URL del QR pegada por el capturista (opcional: si no viene, se usa la
  // guardada en cotejoDetalle). El host se valida contra la allowlist del SAT.
  urlQr: z.string().trim().url("La URL del QR no es válida").max(2048).optional(),
});

type Params = { params: Promise<{ id: string; opinionId: string }> };

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);

  const { id: clienteId, opinionId } = await params;
  if (!clienteId || !opinionId) {
    return NextResponse.json({ error: "Cliente u opinión no especificados" }, { status: 400 });
  }

  // Body opcional: un POST sin body (o vacío) equivale a "usa la URL guardada".
  let bodyCrudo: unknown = {};
  try {
    const textoBody = await req.text();
    bodyCrudo = textoBody.trim().length > 0 ? JSON.parse(textoBody) : {};
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
  const { urlQr } = parseado.data;
  if (urlQr !== undefined && !urlEsDelSat(urlQr)) {
    return NextResponse.json(
      { error: "La URL no corresponde al validador del SAT (se exige https y dominio sat.gob.mx)." },
      { status: 400 },
    );
  }

  // 1) Lectura tenant-scoped de la opinión (RLS) — sin red dentro de la tx.
  type Lectura = {
    rfc: string;
    folio: string | null;
    sentido: string;
    rfcDocumento: string | null;
    cotejoDetalle: string | null;
  } | null;
  let lectura: Lectura;
  try {
    lectura = await withTenantFromSession(session, async (tx): Promise<Lectura> => {
      const opinion = await tx.opinionCumplimientoIngestada.findFirst({
        where: { id: opinionId, clienteId },
        select: {
          folio: true,
          sentido: true,
          rfcDocumento: true,
          cotejoDetalle: true,
          cliente: { select: { rfc: true } },
        },
      });
      if (!opinion) return null;
      return {
        rfc: opinion.cliente.rfc,
        folio: opinion.folio,
        sentido: opinion.sentido,
        rfcDocumento: opinion.rfcDocumento,
        cotejoDetalle: opinion.cotejoDetalle,
      };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la opinión" }, { status: 500 });
  }
  if (lectura === null) {
    return NextResponse.json(
      { error: "Opinión no encontrada para este cliente/tenant" },
      { status: 404 },
    );
  }

  // URL efectiva: la pegada por el capturista o la guardada en cotejoDetalle.
  const urlGuardada = urlSatDeDetalle(lectura.cotejoDetalle);
  const urlEfectiva = urlQr ?? urlGuardada;
  if (urlEfectiva === null || urlEfectiva === undefined) {
    return NextResponse.json(
      {
        error:
          "Esta opinión no tiene URL del validador guardada (el QR no se detectó en el PDF). " +
          "Escanea el QR de la opinión con tu teléfono y pega aquí la URL del SAT.",
      },
      { status: 400 },
    );
  }

  // 2) Cotejo EN VIVO (red, FUERA de la transacción) + evidencia sellada.
  const advertencias: string[] = [];
  const cotejo = await obtenerVerificadorOpinion().cotejar({
    rfc: lectura.rfcDocumento ?? lectura.rfc,
    folio: lectura.folio,
    sentidoDeclarado: lectura.sentido,
    urlVerificacion: urlEfectiva,
  });
  const evidenciaSellada =
    cotejo.evidencia && cotejo.evidencia.cuerpo.length > 0
      ? await sellarEvidenciaCotejo(tenantId, cotejo.evidencia)
      : null;
  const cotejoDetalle = construirCotejoDetalle({
    detalle: cotejo.detalle,
    // Se re-embebe SIEMPRE la URL usada: futuros reintentos la reutilizan.
    urlSat: urlEfectiva,
    evidencia: cotejo.evidencia ?? null,
    evidenciaSellada,
    advertencias: [`Re-cotejo manual por ${actor}.`],
  });
  if (cotejo.estado === "NO_DISPONIBLE" || cotejo.estado === "NO_INTENTADO") {
    advertencias.push(`Cotejo falló: ${cotejo.detalle}`);
  }

  // 3) Escritura tenant-scoped: actualizar la opinión + bitácora encadenada.
  try {
    const actualizado = await withTenantFromSession(session, async (tx): Promise<boolean> => {
      const r = await tx.opinionCumplimientoIngestada.updateMany({
        where: { id: opinionId, clienteId },
        data: { cotejoEnVivo: cotejo.estado, cotejoDetalle },
      });
      if (r.count === 0) return false;

      const ts = new Date();
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "OPINION_RECOTEJADA",
        actor,
        clienteId,
        opinionId,
        cotejo: cotejo.estado,
        cotejoUrl: urlEfectiva,
        cotejoEvidenciaSha256: evidenciaSellada?.sha256 ?? null,
        cotejoEvidenciaWormUrl: evidenciaSellada?.wormUrl ?? null,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "OPINION_RECOTEJADA",
          payloadRef: `opinion:${opinionId}:cliente:${clienteId}:${cotejo.estado}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });
      return true;
    });
    if (!actualizado) {
      return NextResponse.json(
        { error: "Opinión no encontrada para este cliente/tenant" },
        { status: 404 },
      );
    }
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el re-cotejo" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      cotejo: { estado: cotejo.estado, detalle: cotejoDetalle, url: urlEfectiva },
      advertencias,
    },
    { status: 200 },
  );
}
