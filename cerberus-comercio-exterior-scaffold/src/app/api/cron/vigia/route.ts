// CERBERUS COMERCIO EXTERIOR — CRON Vigía: sincronización + barrido diarios. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/cron/vigia/route.ts
// Propósito (Incremento 11 — Agente VIGIA-SYNC):
//   GET (Vercel Cron invoca con GET, programado en vercel.json a las 12:00 UTC
//   ≈ 6am CDMX): monitoreo continuo en dos pasos SECUENCIALES:
//     1. sincronizarListados(prisma)  — refresca los listados públicos del SAT
//        (misma lib compartida que usa POST /api/admin/listados).
//     2. barridoVigia(prisma)         — re-verifica el cumplimiento de TODOS
//        los clientes de TODOS los tenants (src/lib/vigia-barrido.ts) y
//        registra alertas en bitácora cuando un resultado EMPEORA.
//   Siempre alerta, nunca bloqueo (C9). Responde { sync, barrido }.
//
// SEGURIDAD — Bearer CRON_SECRET (documentado en _INCREMENTO-11.md):
//   Vercel envía automáticamente `Authorization: Bearer ${CRON_SECRET}` en las
//   invocaciones de cron cuando la variable CRON_SECRET está definida en el
//   proyecto. Este route exige EXACTAMENTE ese header:
//     - CRON_SECRET no definido/vacío en el entorno → 401 (nunca se acepta un
//       cron sin secreto configurado).
//     - Header ausente o distinto de `Bearer ${CRON_SECRET}` → 401.
//   DESPLIEGUE: crear el secreto en Vercel, p. ej.:
//     openssl rand -hex 24 | npx vercel env add CRON_SECRET production
//   Prueba manual:
//     curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/vigia
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sincronizarListados,
  type ResumenFuente,
} from "@/lib/sincronizar-listados";
import { barridoVigia, type ResumenBarrido } from "@/lib/vigia-barrido";

export const runtime = "nodejs";
// Sincronizar listados grandes + barrer todos los tenants puede tardar: tope Vercel.
export const maxDuration = 300;
// Sin caché/prerender: cada invocación del cron debe ejecutar el trabajo real.
export const dynamic = "force-dynamic";

// Respuesta del cron: resumen de ambos pasos.
type RespuestaVigia = {
  sync: ResumenFuente[];
  barrido: ResumenBarrido;
};

// -----------------------------------------------------------------------------
// GET /api/cron/vigia — sincroniza listados SAT y re-verifica todos los clientes.
// -----------------------------------------------------------------------------
export async function GET(request: Request): Promise<NextResponse> {
  // Guardia del cron: exige `Authorization: Bearer ${CRON_SECRET}` exacto.
  const secreto = process.env.CRON_SECRET;
  const autorizacion = request.headers.get("authorization");
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 1) Sincronizar listados SAT (tablas globales sin tenant: prisma directo).
  //    Tolerante a fallos POR FUENTE dentro de la lib: siempre devuelve resumen.
  const sync = await sincronizarListados(prisma);

  // 2) Barrido multi-tenant de re-verificación (aislamiento RLS por tenant lo
  //    maneja internamente vigia-barrido con withTenant; tolerante a fallos
  //    por tenant/cliente). Corre DESPUÉS del sync para verificar contra los
  //    listados recién importados.
  const barrido = await barridoVigia(prisma);

  const respuesta: RespuestaVigia = { sync, barrido };
  return NextResponse.json(respuesta, { status: 200 });
}
