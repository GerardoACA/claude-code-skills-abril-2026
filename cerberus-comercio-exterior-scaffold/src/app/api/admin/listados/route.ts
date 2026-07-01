// CERBERUS COMERCIO EXTERIOR — API admin: sincronización de listados SAT. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/admin/listados/route.ts
// Propósito (Incremento 10):
//   POST — SOLO rol ADMIN (403 si no): por cada FuenteVerificacion de listado
//          (ART_69, ART_69B, ART_69B_BIS, ART_49BIS) con URL configurada en
//          FUENTES_LISTADOS (src/lib/sat-listados.ts, overridable por env):
//          descarga el CSV público del SAT, lo parsea, crea UNA
//          ImportacionListadoSat (snapshot sellado: sha256 del archivo + fecha)
//          y sus ListadoSatEntrada con createMany POR LOTES de 1000 (memoria y
//          tiempo acotados en Vercel). Responde un resumen por fuente.
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
  FUENTES_LISTADOS,
  descargarListado,
  parsearCsvListado,
} from "@/lib/sat-listados";

export const runtime = "nodejs";
// Descargar + parsear + insertar millones de filas puede tardar: tope Vercel.
export const maxDuration = 300;

// -----------------------------------------------------------------------------
// Fuentes sincronizables (las 4 de listado; OPINION_32D/CSD_17H no son listados).
// Literales EXACTOS del enum Prisma FuenteVerificacion.
// -----------------------------------------------------------------------------
const FUENTES_SINCRONIZABLES = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
] as const;

type FuenteListado = (typeof FUENTES_SINCRONIZABLES)[number];

/** Tamaño de lote para createMany (acota memoria/roundtrips). */
const TAMANO_LOTE = 1000;

// Resumen por fuente que devuelve el POST.
type ResumenFuente = {
  fuente: FuenteListado;
  estado: "importado" | "omitido" | "error";
  filas: number | null;
  sha256: string | null;
  detalle: string;
};

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

  const resumen: ResumenFuente[] = [];

  // Secuencial a propósito: acota memoria (un CSV a la vez) y evita saturar
  // el pool de conexiones. Un fallo en una fuente NO aborta las demás.
  for (const fuente of FUENTES_SINCRONIZABLES) {
    const config = FUENTES_LISTADOS[fuente];
    const url: string | null = config?.url ?? null;

    if (!url) {
      resumen.push({
        fuente,
        estado: "omitido",
        filas: null,
        sha256: null,
        detalle: `URL no configurada para ${fuente}; fuente omitida (quedará NO_DISPONIBLE en la verificación).`,
      });
      continue;
    }

    try {
      // 1) Descargar el CSV (decodificación latin1 y sha256 del archivo la
      //    resuelve src/lib/sat-listados.ts).
      const { texto, sha256 } = await descargarListado(url);

      // 2) Parsear (salta preámbulo, detecta columnas RFC/razón social/situación).
      const entradas = parsearCsvListado(texto, fuente);

      // 3) Crear la importación (snapshot sellado: sha256 del archivo + fecha).
      const importacion = await prisma.importacionListadoSat.create({
        data: {
          fuente,
          url,
          sha256Archivo: sha256,
          filas: entradas.length,
        },
        select: { id: true },
      });

      // 4) Insertar entradas por lotes de 1000 (createMany, sin objetos pesados).
      for (let i = 0; i < entradas.length; i += TAMANO_LOTE) {
        const lote = entradas.slice(i, i + TAMANO_LOTE).map((e) => ({
          importacionId: importacion.id,
          fuente,
          rfc: e.rfc,
          razonSocial: e.razonSocial ?? null,
          situacion: e.situacion ?? null,
        }));
        await prisma.listadoSatEntrada.createMany({ data: lote });
      }

      resumen.push({
        fuente,
        estado: "importado",
        filas: entradas.length,
        sha256,
        detalle: `Importadas ${entradas.length} filas desde ${url}.`,
      });
    } catch (err) {
      const motivo = err instanceof Error ? err.message : "error desconocido";
      resumen.push({
        fuente,
        estado: "error",
        filas: null,
        sha256: null,
        detalle: `Falló la sincronización de ${fuente}: ${motivo}`,
      });
    }
  }

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
