// CERBERUS COMERCIO EXTERIOR — API admin: sincronización de listados SAT. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/admin/listados/route.ts
// Propósito (Incremento 10, refactor en Incremento 11):
//   POST — SOLO rol ADMIN (403 si no): sincroniza los listados públicos del
//          SAT vía la lib COMPARTIDA src/lib/sincronizar-listados.ts (por
//          fuente con URL: descargar→parsear→ImportacionListadoSat+entradas
//          createMany por lotes de 1000; una fuente que falla no aborta las
//          demás). Responde un resumen por fuente. La MISMA lib la usa el
//          cron diario /api/cron/vigia (Incremento 11).
//   GET  — Última importación por fuente (fecha, filas, sha256) para la UI.
//
// DECISIÓN DE DISEÑO — TABLAS GLOBALES SIN TENANT:
//   Los listados del SAT son PÚBLICOS e iguales para todos los tenants, por lo
//   que ImportacionListadoSat/ListadoSatEntrada NO tienen tenant_id y NO pasan
//   por withTenantFromSession: se usa `prisma` directo. La RLS dinámica solo
//   protege tablas con columna tenant_id, así que no las toca (correcto). La
//   escritura queda restringida por ROL DE APLICACIÓN: solo ADMIN sincroniza.
//
// FALLBACK (documentado en el blueprint del incremento): si la sincronización
// excede los límites de Vercel pese a maxDuration=300, correr localmente
// `curl -X POST .../api/admin/listados` contra la app local apuntando a Neon.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  FUENTES_SINCRONIZABLES,
  sincronizarListados,
  type FuenteListado,
} from "@/lib/sincronizar-listados";

export const runtime = "nodejs";
// Descargar + parsear + insertar millones de filas puede tardar: tope Vercel.
export const maxDuration = 300;

// Última importación por fuente que devuelve el GET.
type UltimaImportacion = {
  fuente: FuenteListado;
  importadoEn: string; // ISO 8601
  filas: number;
  sha256: string;
  url: string;
} | null;

// -----------------------------------------------------------------------------
// Guardia de sesión/rol. El rol proviene EXCLUSIVAMENTE del JWT verificado
// (claims tipados en src/lib/auth.ts); jamás del body/query/headers.
// -----------------------------------------------------------------------------
async function obtenerSesion() {
  return getServerSession(authOptions);
}

// -----------------------------------------------------------------------------
// POST /api/admin/listados — sincroniza todas las fuentes con URL configurada.
// -----------------------------------------------------------------------------
export async function POST(): Promise<NextResponse> {
  const session = await obtenerSesion();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.rol !== "ADMIN") {
    // Escritura de referencia global: restringida por rol de aplicación.
    return NextResponse.json(
      { error: "Solo el rol ADMIN puede sincronizar los listados del SAT" },
      { status: 403 },
    );
  }

  // Lógica compartida (semántica idéntica a la del incremento 10): secuencial,
  // por lotes de 1000, y una fuente que falla no aborta las demás.
  const resumen = await sincronizarListados(prisma);

  const huboImportacion = resumen.some((r) => r.estado === "importado");
  return NextResponse.json(
    { ok: huboImportacion, resumen },
    { status: huboImportacion ? 201 : 502 },
  );
}

// -----------------------------------------------------------------------------
// GET /api/admin/listados — última importación por fuente (fecha, filas, sha256).
// Lectura de metadatos de referencia global: basta sesión válida.
// -----------------------------------------------------------------------------
export async function GET(): Promise<NextResponse> {
  const session = await obtenerSesion();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const ultimas: Record<FuenteListado, UltimaImportacion> = {
    ART_69: null,
    ART_69B: null,
    ART_69B_BIS: null,
    ART_49BIS: null,
  };

  for (const fuente of FUENTES_SINCRONIZABLES) {
    const imp = await prisma.importacionListadoSat.findFirst({
      where: { fuente },
      orderBy: { importadoEn: "desc" },
      select: { importadoEn: true, filas: true, sha256Archivo: true, url: true },
    });
    ultimas[fuente] = imp
      ? {
          fuente,
          importadoEn: imp.importadoEn.toISOString(),
          filas: imp.filas,
          sha256: imp.sha256Archivo,
          url: imp.url,
        }
      : null;
  }

  return NextResponse.json({ ok: true, ultimas }, { status: 200 });
}
