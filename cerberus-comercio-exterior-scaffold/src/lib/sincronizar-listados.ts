// CERBERUS COMERCIO EXTERIOR — sincronización compartida de listados SAT. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/sincronizar-listados.ts
// Propósito (Incremento 11 — Agente VIGIA-SYNC):
//   Extrae a una función COMPARTIDA la lógica de sincronización que hasta el
//   incremento 10 vivía dentro del POST de src/app/api/admin/listados/route.ts,
//   para que la usen DOS llamadores con la MISMA semántica:
//     1. POST /api/admin/listados (sincronización manual, solo rol ADMIN).
//     2. GET  /api/cron/vigia     (cron diario de Vercel, Bearer CRON_SECRET).
//
// SEMÁNTICA (idéntica a la del route original; no cambiar sin tocar ambos):
//   Por cada FuenteVerificacion de listado (ART_69, ART_69B, ART_69B_BIS,
//   ART_49BIS) con URL configurada en FUENTES_LISTADOS (src/lib/sat-listados.ts,
//   overridable por env): descarga el CSV público del SAT, lo parsea, crea UNA
//   ImportacionListadoSat (snapshot sellado: sha256 del archivo crudo + fecha)
//   y sus ListadoSatEntrada con createMany POR LOTES de 1000 (memoria y tiempo
//   acotados en Vercel). Fuente sin URL → "omitido". Una fuente que FALLA no
//   aborta las demás → "error" en su renglón del resumen.
//
// DECISIÓN DE DISEÑO — TABLAS GLOBALES SIN TENANT (heredada del incremento 10):
//   Los listados del SAT son PÚBLICOS e iguales para todos los tenants, por lo
//   que ImportacionListadoSat/ListadoSatEntrada NO tienen tenant_id y NO pasan
//   por withTenant*: se usa el cliente prisma directo que reciba esta función.
//   La restricción de QUIÉN sincroniza es responsabilidad del llamador (rol
//   ADMIN en el route admin; Bearer CRON_SECRET en el cron).
// =============================================================================

import type { PrismaClient } from "@prisma/client";
import {
  FUENTES_LISTADOS,
  descargarListado,
  parsearCsvListado,
} from "@/lib/sat-listados";

// -----------------------------------------------------------------------------
// Fuentes sincronizables (las 4 de listado; OPINION_32D/CSD_17H no son listados).
// Literales EXACTOS del enum Prisma FuenteVerificacion.
// -----------------------------------------------------------------------------
export const FUENTES_SINCRONIZABLES = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
] as const;

/** Fuente de listado sincronizable (literal del enum Prisma FuenteVerificacion). */
export type FuenteListado = (typeof FUENTES_SINCRONIZABLES)[number];

/** Tamaño de lote para createMany (acota memoria/roundtrips). */
const TAMANO_LOTE = 1000;

/** Resumen por fuente que produce la sincronización (contrato del POST admin). */
export type ResumenFuente = {
  fuente: FuenteListado;
  estado: "importado" | "omitido" | "error";
  filas: number | null;
  sha256: string | null;
  detalle: string;
};

// -----------------------------------------------------------------------------
// sincronizarListados — sincroniza todas las fuentes con URL configurada.
// -----------------------------------------------------------------------------
/**
 * Sincroniza los listados públicos del SAT contra la base de datos.
 *
 * Secuencial a propósito: acota memoria (un CSV a la vez) y evita saturar el
 * pool de conexiones. Un fallo en una fuente NO aborta las demás: cada fuente
 * termina en "importado", "omitido" (sin URL) o "error" dentro del resumen.
 *
 * @param prisma Cliente Prisma directo (tablas globales sin tenant_id).
 * @returns Resumen por fuente, en el orden de FUENTES_SINCRONIZABLES.
 */
export async function sincronizarListados(
  prisma: PrismaClient,
): Promise<ResumenFuente[]> {
  const resumen: ResumenFuente[] = [];

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

  return resumen;
}
