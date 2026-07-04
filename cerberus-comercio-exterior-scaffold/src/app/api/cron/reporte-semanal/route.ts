// CERBERUS COMERCIO EXTERIOR — CRON reporte semanal ejecutivo. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/cron/reporte-semanal/route.ts
// Propósito (Incremento 42 — reporte semanal ejecutivo):
//   GET (Vercel Cron invoca con GET, programado en vercel.json los lunes a las
//   13:00 UTC ≈ 7am CDMX): genera el resumen semanal POR TENANT aunque NO haya
//   alertas (los ejecutivos quieren saber que todo está en orden) y lo enruta
//   por despacharAvisos a los destinatarios de cada cliente suscritos a la
//   categoría REPORTE_SEMANAL. Además envía por el notificador del sistema un
//   resumen global corto SOLO si se procesó al menos un tenant. Fail-safe:
//   siempre alerta/informa, nunca bloquea (C9).
//
// SEGURIDAD — Bearer CRON_SECRET (mismo guard que /api/cron/vigia):
//   Vercel envía automáticamente `Authorization: Bearer ${CRON_SECRET}` en las
//   invocaciones de cron cuando la variable CRON_SECRET está definida en el
//   proyecto. Este route exige EXACTAMENTE ese header:
//     - CRON_SECRET no definido/vacío en el entorno → 401 (nunca se acepta un
//       cron sin secreto configurado).
//     - Header ausente o distinto de `Bearer ${CRON_SECRET}` → 401.
//   Prueba manual:
//     curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/reporte-semanal
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generarReporteSemanal } from "@/lib/reporte-semanal";
import { obtenerNotificador, type ResultadoNotificacion } from "@/lib/notificador";
import { despacharAvisos, type ResultadoDespacho } from "@/lib/despacho-notificaciones";

export const runtime = "nodejs";
// Recorrer todos los tenants + despachar digestes puede tardar: tope Vercel.
export const maxDuration = 300;
// Sin caché/prerender: cada invocación del cron debe ejecutar el trabajo real.
export const dynamic = "force-dynamic";

// Respuesta del cron: resumen de los pasos.
type RespuestaReporteSemanal = {
  tenants: number;
  errores: string[];
  notificacion: ResultadoNotificacion;
  /** Enrutado a destinatarios por cliente (CEO/CFO/OCN…) suscritos por módulo. */
  despacho: ResultadoDespacho;
};

// -----------------------------------------------------------------------------
// GET /api/cron/reporte-semanal — genera y despacha el reporte semanal ejecutivo.
// -----------------------------------------------------------------------------
export async function GET(request: Request): Promise<NextResponse> {
  // Guardia del cron: exige `Authorization: Bearer ${CRON_SECRET}` exacto.
  const secreto = process.env.CRON_SECRET;
  const autorizacion = request.headers.get("authorization");
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 1) Generar el reporte por tenant (aislamiento RLS por tenant lo maneja
  //    internamente reporte-semanal con withTenant; tolerante a fallos por
  //    tenant, acumulados en errores[]).
  const resumen = await generarReporteSemanal(prisma);

  // 2) Notificación al canal del sistema (conector enchufable; NoOp si no está
  //    configurado). Resumen global corto SOLO si se procesó algún tenant.
  const notificacion: ResultadoNotificacion =
    resumen.tenants > 0
      ? await obtenerNotificador().enviar(`Reporte semanal generado: ${resumen.tenants} tenant(s)`)
      : { ok: false, canal: "NINGUNO", detalle: "Sin tenants procesados: no se envió notificación." };

  // 3) Enrutado ESPECÍFICO: cada aviso (uno por cliente, con el texto del
  //    reporte de su tenant) va a los destinatarios suscritos a REPORTE_SEMANAL.
  const despacho = await despacharAvisos(prisma, resumen.avisos);

  const respuesta: RespuestaReporteSemanal = {
    tenants: resumen.tenants,
    errores: resumen.errores,
    notificacion,
    despacho,
  };
  return NextResponse.json(respuesta, { status: 200 });
}
