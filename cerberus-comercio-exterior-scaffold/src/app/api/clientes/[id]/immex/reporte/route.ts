// CERBERUS COMERCIO EXTERIOR — API del reporte mensual de descargos IMMEX. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/immex/reporte/route.ts  (Incremento 64)
// Propósito: GET ?periodo=YYYY-MM[&formato=csv] — reporte mensual de descargos
//            del libro de cotejo (MVP tabular del Anexo 30, R7 del dictamen;
//            el layout OFICIAL está A CONFIRMAR por abogado). Dentro de
//            withTenantFromSession carga el inventario del cliente con los
//            movimientos DESCARGO del periodo, compone el reporte con la
//            lógica pura de @/lib/immex/reporte-mensual, SELLA el CSV con
//            sha256 (R10) y registra el evento de bitácora encadenado
//            "IMMEX_REPORTE_MENSUAL" (payloadRef con periodo/filas/sha256).
//            Con formato=csv responde el CSV como descarga; si no, JSON
//            { ok, periodo, filas, totalCantidad, sha256 }.
//
// Multi-tenant: tenantId del JWT (jamás del request); RLS vía
// withTenantFromSession tras verificar que el cliente es del tenant.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import {
  componerReporteMensual,
  reporteACsv,
  type MovimientoLiteReporte,
  type ReporteMensual,
} from "@/lib/immex/reporte-mensual";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// Query: periodo obligatorio "YYYY-MM"; formato opcional ("csv" para descarga).
const querySchema = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El periodo debe tener formato YYYY-MM"),
  formato: z.enum(["csv"]).optional(),
});

export async function GET(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);
  const { id: clienteId } = await params;

  const url = new URL(req.url);
  const parseado = querySchema.safeParse({
    periodo: url.searchParams.get("periodo") ?? "",
    formato: url.searchParams.get("formato") ?? undefined,
  });
  if (!parseado.success) {
    return NextResponse.json(
      { error: "Query inválida", detalles: parseado.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const { periodo, formato } = parseado.data;
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  // Límites del mes en UTC para filtrar en la consulta (mismo criterio que la
  // lógica pura, que vuelve a filtrar de forma defensiva).
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));

  let salida: { reporte: ReporteMensual; csv: string; sello: string } | null;
  try {
    salida = await withTenantFromSession(
      session,
      async (tx) => {
        // El cliente debe existir para el tenant del JWT (RLS filtra).
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) return null;

        // Inventario → materiales → SOLO movimientos DESCARGO del periodo.
        // Sin inventario aún: reporte válido con 0 filas (no es error).
        const inventario = await tx.inventarioImmex.findFirst({
          where: { clienteId },
          select: {
            materiales: {
              orderBy: { fraccion: "asc" },
              select: {
                fraccion: true,
                descripcion: true,
                unidadMedida: true,
                movimientos: {
                  where: { tipo: "DESCARGO", registradoEn: { gte: inicio, lt: fin } },
                  orderBy: { registradoEn: "asc" },
                  select: {
                    cantidad: true,
                    registradoEn: true,
                    pedimentoNumero: true,
                    clavePedimento: true,
                    entradaOrigenId: true,
                  },
                },
              },
            },
          },
        });

        const movimientos: MovimientoLiteReporte[] = (inventario?.materiales ?? []).flatMap(
          (m) =>
            m.movimientos.map(
              (mov): MovimientoLiteReporte => ({
                tipo: "DESCARGO",
                cantidad: Number(mov.cantidad),
                registradoEn: mov.registradoEn.toISOString(),
                pedimentoNumero: mov.pedimentoNumero,
                clavePedimento: mov.clavePedimento,
                entradaOrigenId: mov.entradaOrigenId,
                descripcion: m.descripcion,
                fraccion: m.fraccion,
                unidadMedida: m.unidadMedida,
              }),
            ),
        );

        const reporte = componerReporteMensual(movimientos, anio, mes);
        const csv = reporteACsv(reporte.filas, reporte.totalCantidad, reporte.periodo);
        const sello = sha256(csv); // R10: sello probatorio del exporte

        // Evento de bitácora ENCADENADO (hashPrev), mismo patrón que
        // persistir-movimiento.ts ("IMMEX_MOVIMIENTO").
        const ts = new Date();
        const previo = await tx.bitacoraAuditoria.findFirst({
          orderBy: { creadoEn: "desc" },
          select: { sha256: true },
        });
        const hashPrev: string | null = previo?.sha256 ?? null;
        const payloadRef = JSON.stringify({
          clienteId,
          periodo: reporte.periodo,
          filas: reporte.filas.length,
          totalCantidad: reporte.totalCantidad,
          sha256: sello,
        });
        const payloadEvento = canonicalizar({
          tenantId,
          accion: "IMMEX_REPORTE_MENSUAL",
          actor,
          payloadRef,
          creadoEn: ts.toISOString(),
          hashPrev,
        });
        await tx.bitacoraAuditoria.create({
          data: {
            tenantId,
            actor,
            accion: "IMMEX_REPORTE_MENSUAL",
            payloadRef,
            sha256: sha256(payloadEvento),
            hashPrev,
            creadoEn: ts,
          },
          select: { id: true },
        });

        return { reporte, csv, sello };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el reporte mensual IMMEX" },
      { status: 500 },
    );
  }

  if (salida === null) {
    return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
  }

  if (formato === "csv") {
    return new NextResponse(salida.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reporte-anexo30-${salida.reporte.periodo}.csv"`,
        "X-Reporte-Sha256": salida.sello,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    periodo: salida.reporte.periodo,
    filas: salida.reporte.filas,
    totalCantidad: salida.reporte.totalCantidad,
    sha256: salida.sello,
  });
}
// =============================================================================
// FIN route.ts (reporte mensual IMMEX)  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
