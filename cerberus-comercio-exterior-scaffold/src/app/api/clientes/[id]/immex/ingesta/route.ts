// CERBERUS COMERCIO EXTERIOR — API ingesta masiva de movimientos IMMEX por CSV. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/immex/ingesta/route.ts  (Inc 61 — carril B)
// Propósito: POST recibe { tipo: "ENTRADA"|"DESCARGO", csv } con hasta 500
//            filas, las valida con los parsers puros de
//            @/lib/immex/ingesta-movimientos y persiste cada fila válida con
//            la MISMA lógica de la ruta unitaria (compartida en
//            @/lib/immex/persistir-movimiento: inventario/material, sello
//            sha256, PEPS en descargos, saldoActual, bitácora encadenada).
//            Las filas malas se REPORTAN pero no bloquean a las buenas
//            (decisión C9); si ninguna fila es válida responde 400.
//
// Multi-tenant: tenantId del JWT (jamás del request); todo dentro de
// withTenantFromSession (RLS, timeout 60s) tras verificar que el cliente es
// del tenant.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { parsearCsvDescargos, parsearCsvEntradas } from "@/lib/immex/ingesta-movimientos";
import { persistirMovimientoImmex } from "@/lib/immex/persistir-movimiento";

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

const bodySchema = z.object({
  tipo: z.enum(["ENTRADA", "DESCARGO"]),
  csv: z
    .string({ invalid_type_error: "csv debe ser texto" })
    .min(1, "El CSV es obligatorio")
    .max(500_000, "El CSV excede el tamaño máximo (500,000 caracteres)"),
});

type ResultadoIngestaApi =
  | { tipo: "no-cliente" }
  | { tipo: "sin-filas"; errores: string[] }
  | { tipo: "ok"; creadas: number; errores: string[] };

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor = actorDeSesion(session);
  const { id: clienteId } = await params;

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
  const { tipo, csv } = parseado.data;

  let salida: ResultadoIngestaApi;
  try {
    salida = await withTenantFromSession(
      session,
      async (tx): Promise<ResultadoIngestaApi> => {
        // 1) El cliente debe existir para el tenant del JWT (RLS filtra).
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) return { tipo: "no-cliente" };

        // 2) Parseo puro: filas buenas + errores/advertencias por línea.
        //    Se parsea DENTRO de la transacción solo por simetría con partidas;
        //    los parsers no hacen I/O.
        let creadas = 0;
        const errores: string[] = [];

        if (tipo === "ENTRADA") {
          const r = parsearCsvEntradas(csv);
          errores.push(...r.errores);
          if (r.filas.length === 0) return { tipo: "sin-filas", errores };
          // 3) Cada fila válida se persiste con la lógica compartida (sello,
          //    saldo, bitácora). Un fallo de PERSISTENCIA (infra) aborta y
          //    revierte toda la transacción (a diferencia de las filas mal
          //    formadas, que solo se reportan: C9 aplica al dato, no a la infra).
          for (const fila of r.filas) {
            await persistirMovimientoImmex(tx, {
              tenantId,
              clienteId,
              actor,
              tipo: "ENTRADA",
              entrada: fila,
            });
            creadas += 1;
          }
        } else {
          const r = parsearCsvDescargos(csv);
          errores.push(...r.errores);
          if (r.filas.length === 0) return { tipo: "sin-filas", errores };
          for (const [i, fila] of r.filas.entries()) {
            const resultado = await persistirMovimientoImmex(tx, {
              tenantId,
              clienteId,
              actor,
              tipo: "DESCARGO",
              descargo: fila,
            });
            creadas += 1;
            // C9: el faltante se registra igual, pero se le informa al usuario.
            if (resultado.faltante !== undefined && resultado.faltante > 0) {
              errores.push(
                `Fila válida #${i + 1} (descargo, fracción ${fila.fraccion}): ` +
                  `faltante de ${resultado.faltante} sin saldo PEPS (se registró igual).`,
              );
            }
          }
        }

        return { tipo: "ok", creadas, errores };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo ingerir el CSV de movimientos IMMEX" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-cliente") {
    return NextResponse.json({ error: "Cliente no encontrado para este tenant" }, { status: 404 });
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
// =============================================================================
// FIN route.ts (ingesta IMMEX)  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
