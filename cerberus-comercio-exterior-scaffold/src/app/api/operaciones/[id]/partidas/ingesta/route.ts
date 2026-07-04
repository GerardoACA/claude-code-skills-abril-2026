// CERBERUS COMERCIO EXTERIOR — API ingesta masiva de partidas por CSV. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/partidas/ingesta/route.ts  (Incremento 39)
// Propósito: POST recibe { csv } con hasta 500 filas de partidas
//            (fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct), las
//            valida con el parser puro @/lib/ingesta-partidas, calcula por fila
//            las contribuciones (IGI/DTA/IEPS/IVA) con @/lib/contribuciones,
//            sella cada partida (sha256 de la fila canónica) y las persiste.
//            Las filas malas se REPORTAN pero no bloquean a las buenas
//            (decisión C9: alertar, no bloquear); si ninguna fila es válida
//            responde 400 con los errores.
//
// Multi-tenant: tenantId del JWT (jamás del request); escritura dentro de
// withTenantFromSession (RLS) tras verificar que la operación es del tenant.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { calcularContribucionesPartida } from "@/lib/contribuciones";
import { parsearCsvPartidas } from "@/lib/ingesta-partidas";

export const runtime = "nodejs";

const bodySchema = z.object({
  csv: z
    .string({ invalid_type_error: "csv debe ser texto" })
    .min(1, "El CSV es obligatorio")
    .max(500_000, "El CSV excede el tamaño máximo (500,000 caracteres)"),
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

type ResultadoIngestaApi =
  | { tipo: "no-op" }
  | { tipo: "sin-filas"; errores: string[] }
  | { tipo: "ok"; creadas: number; errores: string[] };

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
  const csv = parseado.data.csv;

  let salida: ResultadoIngestaApi;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoIngestaApi> => {
      // 1) La operación debe existir para el tenant del JWT (RLS filtra).
      const op = await tx.operacion.findFirst({ where: { id: operacionId }, select: { id: true } });
      if (!op) return { tipo: "no-op" };

      // 2) Parseo puro: filas buenas + errores por línea (no aborta las buenas).
      const { filas, errores } = parsearCsvPartidas(csv);
      if (filas.length === 0) {
        return { tipo: "sin-filas", errores };
      }

      // 3) Por cada fila válida: contribuciones + sello + persistencia.
      const ts = new Date();
      let creadas = 0;
      for (const fila of filas) {
        const contribuciones = calcularContribucionesPartida({
          valorAduana: fila.valorAduana,
          tasaIgiPct: fila.tasaIgiPct,
          tasaIepsPct: fila.tasaIepsPct,
        });
        const selloPartida = sha256(
          canonicalizar({
            operacionId: op.id,
            fraccion: fila.fraccion,
            descripcion: fila.descripcion,
            valorAduana: contribuciones.valorAduana,
            tasaIgiPct: fila.tasaIgiPct,
            tasaIepsPct: fila.tasaIepsPct,
            igi: contribuciones.igi,
            dta: contribuciones.dta,
            ieps: contribuciones.ieps,
            iva: contribuciones.iva,
            ts: ts.toISOString(),
          }),
        );
        await tx.partida.create({
          data: {
            tenantId,
            operacionId: op.id,
            descripcion: fila.descripcion,
            fraccionDeclarada: fila.fraccion,
            valorAduana: contribuciones.valorAduana,
            tasaIgiPct: fila.tasaIgiPct,
            tasaIepsPct: fila.tasaIepsPct,
            igiImporte: contribuciones.igi,
            dtaImporte: contribuciones.dta,
            iepsImporte: contribuciones.ieps,
            ivaImporte: contribuciones.iva,
            sha256: selloPartida,
            creadoEn: ts,
          },
          select: { id: true },
        });
        creadas += 1;
      }

      // 4) Un evento de bitácora que resume la ingesta (cadena de hashes).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;
      const payloadEvento = canonicalizar({
        tenantId,
        accion: "PARTIDAS_INGESTA_CSV",
        actor,
        operacionId: op.id,
        creadas,
        erroresReportados: errores.length,
        creadoEn: ts.toISOString(),
        hashPrev,
      });
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PARTIDAS_INGESTA_CSV",
          operacionId: op.id,
          payloadRef: `operacion:${op.id}:ingesta-csv:creadas:${creadas}`,
          sha256: sha256(payloadEvento),
          hashPrev,
          creadoEn: ts,
        },
        select: { id: true },
      });

      return { tipo: "ok", creadas, errores };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo ingerir el CSV de partidas" }, { status: 500 });
  }

  if (salida.tipo === "no-op") {
    return NextResponse.json({ error: "Operación no encontrada para este tenant" }, { status: 404 });
  }
  if (salida.tipo === "sin-filas") {
    return NextResponse.json(
      { error: "Ninguna fila válida en el CSV", errores: salida.errores },
      { status: 400 },
    );
  }
  // Decisión C9: las filas malas se reportan pero no bloquean a las buenas.
  return NextResponse.json(
    { ok: true, creadas: salida.creadas, errores: salida.errores },
    { status: 201 },
  );
}
