// CERBERUS COMERCIO EXTERIOR — API descarga/regeneración del dossier de diligencia. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/dossier/route.ts  (Agente UI-DOSSIER, Incremento 9)
// Propósito: GET que REGENERA el paquete probatorio de la operación (mismas
//            funciones del exporte: construirEntradaExporte → armarExporteProbatorio
//            → serializarPaquete), calcula el SHA-256 del JSON canónico y lo
//            COMPARA con el sha256 del último Documento "DOSSIER_DILIGENCIA"
//            sellado para esa operación (si existe).
//
// El blob del dossier NO se persiste todavía (sin object storage): el sha256
// sellado en el Documento ancla el contenido y el paquete es regenerable. Si el
// sha256 regenerado difiere del sellado, se ADVIERTE vía header
// `X-Dossier-Match: "false"` — es evidencia de que hubo actividad posterior al
// sellado (eso también es señal probatoria, no un error).
//   X-Dossier-Match: "true"       → regenerado coincide con el último sellado.
//   X-Dossier-Match: "false"      → difiere (evidencia posterior al sellado).
//   X-Dossier-Match: "sin-dossier"→ la operación aún no tiene dossier sellado.
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
import { selloContenidoDossier, TIPO_DOSSIER } from "@/lib/dossier-diligencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Valores posibles del header X-Dossier-Match. */
type DossierMatch = "true" | "false" | "sin-dossier";

type Resultado =
  | {
      tipo: "ok";
      referencia: string;
      json: string;
      shaRegenerado: string;
      shaSellado: string | null;
      match: DossierMatch;
    }
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

      // REGENERAR el paquete probatorio con las mismas funciones del exporte,
      // dentro de la misma transacción tenant-scoped.
      const operacion: OperacionParaExporte = {
        id: op.id,
        referencia: op.referencia,
        clienteId: op.clienteId,
      };
      const entrada = await construirEntradaExporte(tx, tenantId, operacion);
      const paquete = armarExporteProbatorio(entrada);
      const json = serializarPaquete(paquete);
      // Cotejo por sello de CONTENIDO (fix Inc 9.1): excluye generadoEn y
      // selloPaquete, para que Match: true sea alcanzable sin actividad posterior.
      const shaRegenerado = selloContenidoDossier(paquete);

      // Último dossier SELLADO de la operación (Documento tipo DOSSIER_DILIGENCIA
      // con FK directa operacionId, Inc 8). Puede no existir todavía.
      const ultimoDossier = await tx.documento.findFirst({
        where: { tenantId, operacionId: op.id, tipo: TIPO_DOSSIER },
        select: { sha256: true },
        orderBy: { creadoEn: "desc" },
      });

      const shaSellado: string | null = ultimoDossier?.sha256 ?? null;
      const match: DossierMatch =
        shaSellado === null
          ? "sin-dossier"
          : shaSellado === shaRegenerado
            ? "true"
            : "false";

      return {
        tipo: "ok" as const,
        referencia: op.referencia,
        json,
        shaRegenerado,
        shaSellado,
        match,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo regenerar el dossier de diligencia" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }

  // Responder el JSON canónico tal cual (no re-serializar) para preservar el
  // selloPaquete; el veredicto de cotejo viaja en headers para no alterar el cuerpo.
  return new NextResponse(resultado.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Dossier-Match": resultado.match,
      "X-Dossier-Sha256-Regenerado": resultado.shaRegenerado,
      ...(resultado.shaSellado !== null
        ? { "X-Dossier-Sha256-Sellado": resultado.shaSellado }
        : {}),
    },
  });
}
