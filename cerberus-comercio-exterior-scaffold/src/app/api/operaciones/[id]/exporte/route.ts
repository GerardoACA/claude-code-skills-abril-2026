// CERBERUS COMERCIO EXTERIOR — API exporte probatorio por operación. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/exporte/route.ts
// Propósito: GET que genera el EXPORTE PROBATORIO autocontenido de una operación:
//            reúne su evidencia (Documentos, PasoDespacho y eventos de
//            BitacoraAuditoria del tenant), delega el empaquetado en la capa
//            servicio (construirEntradaExporte de @/lib/exporte-operacion) y en la
//            capa probatoria (armarExporteProbatorio + serializarPaquete de
//            @/lib/probatoria/exporte-probatorio), y responde el JSON canónico del
//            paquete con Content-Type application/json.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA de params/query/body. Toda la lectura corre
// dentro de withTenantFromSession => abre transacción + SET LOCAL app.tenant_id,
// por lo que la RLS de Postgres filtra por el tenant del token. Esta ruta SOLO
// LEE: no muta ni sella nada nuevo (el sellado ya vive en la evidencia).
//
// En Next 16 `params` es Promise => se await. Runtime nodejs (usa Prisma + crypto).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  construirEntradaExporte,
  type EvidenciaOperacion,
  type OperacionExporte,
} from "@/lib/exporte-operacion";
import {
  armarExporteProbatorio,
  serializarPaquete,
} from "@/lib/probatoria/exporte-probatorio";

export const runtime = "nodejs";
// Depende de la sesión/DB: no debe pre-renderizarse ni cachearse.
export const dynamic = "force-dynamic";

type Resultado =
  | { tipo: "ok"; referencia: string; json: string }
  | { tipo: "no-encontrada" };

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA de params.
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
      // 1) La operación (con cliente) debe existir para este tenant (RLS la limita).
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          estado: true,
          creadoEn: true,
          actualizadoEn: true,
          clienteId: true,
          cliente: { select: { id: true, rfc: true, razonSocial: true } },
        },
      });
      if (!op) {
        return { tipo: "no-encontrada" as const };
      }

      // 2) Reunir la evidencia tenant-scoped de la operación:
      //    - Documentos del expediente probatorio del cliente de la operación.
      //    - PasoDespacho de la operación (checklist sellado).
      //    - Eventos de BitacoraAuditoria del tenant relacionados con la operación
      //      (por payloadRef que contiene el id de la operación).
      const documentos = await tx.documento.findMany({
        where: { expedienteProbatorio: { clienteId: op.clienteId } },
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          tipo: true,
          sha256: true,
          estadoProbatorio: true,
          version: true,
          creadoEn: true,
        },
      });

      const pasos = await tx.pasoDespacho.findMany({
        where: { operacionId: op.id },
        orderBy: { completadoEn: "asc" },
        select: {
          id: true,
          tipo: true,
          acuse: true,
          sello: true,
          monto: true,
          detalle: true,
          sha256: true,
          completadoEn: true,
        },
      });

      const eventos = await tx.bitacoraAuditoria.findMany({
        where: { payloadRef: { contains: `operacion:${op.id}` } },
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          actor: true,
          accion: true,
          payloadRef: true,
          sha256: true,
          hashPrev: true,
          estadoSello: true,
          creadoEn: true,
        },
      });

      // 3) Normalizar a formas serializables (Decimal/Date -> string) para el
      //    servicio de empaquetado. El servicio (Agente SERVICIO-EXPORTE) mapea
      //    cada elemento a un RegistroProbatorio y arma el EntradaExporte.
      const operacion: OperacionExporte = {
        id: op.id,
        referencia: op.referencia,
        estado: op.estado,
        creadoEn: op.creadoEn.toISOString(),
        actualizadoEn: op.actualizadoEn.toISOString(),
        cliente: {
          id: op.cliente.id,
          rfc: op.cliente.rfc,
          razonSocial: op.cliente.razonSocial,
        },
      };

      const evidencia: EvidenciaOperacion = {
        documentos: documentos.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          sha256: d.sha256,
          estadoProbatorio: d.estadoProbatorio,
          version: d.version,
          creadoEn: d.creadoEn.toISOString(),
        })),
        pasos: pasos.map((p) => ({
          id: p.id,
          tipo: p.tipo,
          acuse: p.acuse,
          sello: p.sello,
          monto: p.monto === null ? null : p.monto.toString(),
          detalle: p.detalle,
          sha256: p.sha256,
          completadoEn: p.completadoEn.toISOString(),
        })),
        eventos: eventos.map((e) => ({
          id: e.id,
          actor: e.actor,
          accion: e.accion,
          payloadRef: e.payloadRef,
          sha256: e.sha256,
          hashPrev: e.hashPrev,
          estadoSello: e.estadoSello,
          creadoEn: e.creadoEn.toISOString(),
        })),
      };

      // 4) Empaquetar: servicio -> capa probatoria -> JSON canónico.
      //    Firma del contrato (Agente SERVICIO-EXPORTE): (tx, tenantId, operacion,
      //    evidencia). Se pasa `tx` por si el servicio completa evidencia adicional
      //    dentro de la misma transacción tenant-scoped.
      const entrada = await construirEntradaExporte(tx, tenantId, operacion, evidencia);
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

  // 5) Responder el JSON canónico del paquete tal cual (no re-serializar, para
  //    preservar la canonicalización que respalda el selloPaquete).
  return new NextResponse(resultado.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
