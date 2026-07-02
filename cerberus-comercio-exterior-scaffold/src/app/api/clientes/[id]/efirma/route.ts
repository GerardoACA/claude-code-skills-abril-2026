// CERBERUS COMERCIO EXTERIOR — API e.firma entregada + validación de autenticidad. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/efirma/route.ts  (Incremento 20)
// Propósito: POST que recibe el certificado PÚBLICO de e.firma (.cer) que el
//            cliente/proveedor ENTREGA, valida su AUTENTICIDAD con el validador
//            automático (@/lib/validador-efirma), persiste EfirmaEntregada con el
//            veredicto motivado, registra un evento encadenado en bitácora y
//            —según el veredicto y el sentido de opinión declarado— deja una
//            VerificacionCumplimiento de la fuente OPINION_32D. GET lista las
//            e.firmas entregadas del cliente con su veredicto.
//
// SEGURIDAD (decisión C14): el validador RECHAZA cualquier material que parezca
// una clave privada (.key); aquí eso se traduce en 400 con mensaje claro. La
// clave privada NUNCA entra al sistema. Solo se guarda el certificado público.
//
// C9: incluso una e.firma INVALIDA es una ALERTA registrada (revisión humana),
// nunca un bloqueo. La consulta EN VIVO de la opinión 32-D ante el SAT/PSC sigue
// diferida (conector); esta capa sustenta esa gestión con una e.firma auténtica.
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
import {
  analizarEfirma,
  MaterialPrivadoError,
  type AnalisisEfirma,
  type ResultadoValidacionEfirma,
} from "@/lib/validador-efirma";

export const runtime = "nodejs";

// Sentido de la opinión 32-D que el cliente declara al entregar su e.firma.
const SENTIDOS = ["POSITIVA", "SIN_OBLIGACIONES", "NEGATIVA", "NO_INSCRITO"] as const;
type SentidoOpinion = (typeof SENTIDOS)[number];

const bodySchema = z.object({
  // Certificado público en PEM (texto) o DER (base64). Máx razonable ~64 KB.
  contenido: z.string().trim().min(1, "El certificado es obligatorio").max(65536),
  nombreArchivo: z.string().trim().max(256).optional(),
  sentidoOpinion: z.enum(SENTIDOS).optional(),
});

type Params = { params: Promise<{ id: string }> };

/** Resultado que devuelve el POST (sin exponer objetos Prisma). */
type ResultadoPost =
  | { tipo: "no-cliente" }
  | {
      tipo: "ok";
      efirmaId: string;
      analisis: AnalisisEfirma;
      opinion32d: { resultado: string; detalle: string };
    };

/** Mapea el veredicto de autenticidad + sentido declarado a la opinión 32-D. */
function resultadoOpinion(
  veredicto: ResultadoValidacionEfirma,
  sentido: SentidoOpinion | undefined,
): { resultado: string; detalle: string } {
  if (veredicto === "INVALIDA" || veredicto === "NO_VERIFICABLE") {
    return {
      resultado: "ALERTA",
      detalle:
        "Opinión 32-D no sustentable: la e.firma entregada no es auténtica o no " +
        "es verificable. Requiere revisión humana (C9).",
    };
  }
  if (veredicto === "ALERTA") {
    return {
      resultado: "ALERTA",
      detalle:
        "e.firma del SAT y vigente, pero con observaciones (p. ej. RFC no " +
        "coincide). Opinión 32-D marcada para revisión humana.",
    };
  }
  // veredicto VALIDA: se apoya en el sentido declarado por el cliente.
  switch (sentido) {
    case "POSITIVA":
    case "SIN_OBLIGACIONES":
      return {
        resultado: "AL_CORRIENTE",
        detalle:
          "Opinión 32-D declarada POSITIVA/SIN OBLIGACIONES, respaldada por una " +
          "e.firma auténtica y vigente del SAT. Cotejo EN VIVO ante el SAT/PSC " +
          "pendiente de conexión (conector).",
      };
    case "NEGATIVA":
    case "NO_INSCRITO":
      return {
        resultado: "ALERTA",
        detalle:
          "Opinión 32-D declarada NEGATIVA/NO INSCRITO (respaldo de e.firma " +
          "auténtico). Alerta para revisión humana (C9); nunca bloquea.",
      };
    default:
      return {
        resultado: "NO_DISPONIBLE",
        detalle:
          "e.firma auténtica y vigente en archivo; falta declarar el sentido de " +
          "la opinión 32-D o realizar el cotejo en vivo (conector SAT/PSC pendiente).",
      };
  }
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
// POST /api/clientes/[id]/efirma — entrega + validación de autenticidad.
// =============================================================================
export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
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
  const { contenido, nombreArchivo, sentidoOpinion } = parseado.data;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true },
      });
      if (!cliente) {
        return { tipo: "no-cliente" };
      }

      // Análisis de autenticidad (puede lanzar MaterialPrivadoError → C14).
      const analisis = analizarEfirma(contenido, cliente.rfc);
      const ts = new Date();

      const efirma = await tx.efirmaEntregada.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          nombreArchivo: nombreArchivo ?? null,
          sha256: analisis.sha256 ?? sha256(contenido),
          rfcCertificado: analisis.rfcCertificado,
          titular: analisis.titular,
          serie: analisis.serie,
          emisor: analisis.emisor,
          validoDesde: analisis.validoDesde ? new Date(analisis.validoDesde) : null,
          validoHasta: analisis.validoHasta ? new Date(analisis.validoHasta) : null,
          resultado: analisis.resultado,
          observaciones: JSON.stringify({
            resumen: analisis.resumen,
            checks: analisis.checks,
          }),
          actor,
          creadoEn: ts,
        },
        select: { id: true, sha256: true },
      });

      // Deja una VerificacionCumplimiento de la fuente OPINION_32D acorde al
      // veredicto + sentido declarado. Snapshot anclado con la huella del cert.
      const opinion = resultadoOpinion(analisis.resultado, sentidoOpinion);
      await tx.verificacionCumplimiento.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          fuente: "OPINION_32D",
          // El enum ResultadoVerificacion admite estos literales exactos.
          resultado: opinion.resultado as
            | "AL_CORRIENTE"
            | "NO_DISPONIBLE"
            | "ALERTA"
            | "INHABILITADO_PRESUNTO"
            | "INHABILITADO_DEFINITIVO",
          detalle: opinion.detalle,
          snapshotSha256: efirma.sha256,
          consultadoEn: ts,
        },
        select: { id: true },
      });

      // Bitácora append-only encadenada.
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "EFIRMA_ENTREGADA",
        actor,
        clienteId: cliente.id,
        efirmaId: efirma.id,
        efirmaSha256: efirma.sha256,
        veredicto: analisis.resultado,
        opinion32d: opinion.resultado,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "EFIRMA_ENTREGADA",
          payloadRef: `efirma:${efirma.id}:cliente:${cliente.id}:${analisis.resultado}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return { tipo: "ok", efirmaId: efirma.id, analisis, opinion32d: opinion };
    });
  } catch (e) {
    if (e instanceof MaterialPrivadoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo procesar la e.firma entregada" },
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
      efirmaId: salida.efirmaId,
      veredicto: salida.analisis.resultado,
      resumen: salida.analisis.resumen,
      checks: salida.analisis.checks,
      certificado: {
        rfc: salida.analisis.rfcCertificado,
        titular: salida.analisis.titular,
        serie: salida.analisis.serie,
        emisor: salida.analisis.emisor,
        validoDesde: salida.analisis.validoDesde,
        validoHasta: salida.analisis.validoHasta,
      },
      opinion32d: salida.opinion32d,
    },
    { status: 201 },
  );
}

// =============================================================================
// GET /api/clientes/[id]/efirma — lista las e.firmas entregadas del cliente.
// =============================================================================
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

  try {
    const efirmas = await withTenantFromSession(session, async (tx) => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) return null;
      const filas = await tx.efirmaEntregada.findMany({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          nombreArchivo: true,
          sha256: true,
          rfcCertificado: true,
          titular: true,
          serie: true,
          emisor: true,
          validoDesde: true,
          validoHasta: true,
          resultado: true,
          observaciones: true,
          actor: true,
          creadoEn: true,
        },
      });
      return filas.map((f) => ({
        id: f.id,
        nombreArchivo: f.nombreArchivo,
        sha256: f.sha256,
        rfcCertificado: f.rfcCertificado,
        titular: f.titular,
        serie: f.serie,
        emisor: f.emisor,
        validoDesde: f.validoDesde?.toISOString() ?? null,
        validoHasta: f.validoHasta?.toISOString() ?? null,
        resultado: f.resultado,
        observaciones: f.observaciones,
        actor: f.actor,
        creadoEn: f.creadoEn.toISOString(),
      }));
    });

    if (efirmas === null) {
      return NextResponse.json(
        { error: "Cliente no encontrado para este tenant" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, efirmas }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar las e.firmas entregadas" },
      { status: 500 },
    );
  }
}
