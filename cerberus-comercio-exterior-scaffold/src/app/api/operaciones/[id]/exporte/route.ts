// CERBERUS COMERCIO EXTERIOR — API exporte probatorio por operación. NO es SIDF.
// =============================================================================
// GET que genera el EXPORTE PROBATORIO autocontenido de una operación. El servicio
// construirEntradaExporte (@/lib/exporte-operacion) reúne la evidencia (Documentos,
// PasoDespacho y eventos de BitacoraAuditoria) DENTRO de la misma transacción
// tenant-scoped y arma el EntradaExporte; la capa probatoria (armarExporteProbatorio
// + serializarPaquete) produce el JSON canónico verificable por un perito.
//
// Multi-tenant (convención DURA): el tenantId SIEMPRE proviene del JWT verificado,
// NUNCA de params. Toda lectura corre dentro de withTenantFromSession (RLS). SOLO LEE.
// En Next 16 `params` es Promise => await. Runtime nodejs (Prisma + crypto).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  construirEntradaExporte,
  type OperacionParaExporte,
} from "@/lib/exporte-operacion";
import {
  armarExporteProbatorio,
  serializarPaquete,
} from "@/lib/probatoria/exporte-probatorio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Resultado =
  | { tipo: "ok"; referencia: string; json: string }
  | { tipo: "no-encontrada" };

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // tenantId del JWT verificado, NUNCA de params.
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown } } | null)?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await context.params;

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // La operación debe existir para este tenant (RLS la limita).
      const op = await tx.operacion.findFirst({
        where: { id },
        select: { id: true, referencia: true, clienteId: true },
      });
      if (!op) {
        return { tipo: "no-encontrada" as const };
      }

      // El servicio reúne la evidencia (bitácora, documentos, pasos) dentro de la
      // misma transacción tenant-scoped y arma el EntradaExporte.
      const operacion: OperacionParaExporte = {
        id: op.id,
        referencia: op.referencia,
        clienteId: op.clienteId,
      };

      const entrada = await construirEntradaExporte(tx, tenantId, operacion);
      const paquete = armarExporteProbatorio(entrada);
      const json = serializarPaquete(paquete);

      return { tipo: "ok" as const, referencia: op.referencia, json };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el exporte probatorio" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }

  // Responder el JSON canónico tal cual (no re-serializar) para preservar el selloPaquete.
  return new NextResponse(resultado.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
