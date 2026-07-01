// CERBERUS COMERCIO EXTERIOR — servicio de verificación de cumplimiento. NO es SIDF.
// ============================================================================
// Incremento 10 — Verificación REAL contra los listados públicos del SAT.
//
// REESCRITURA CONTROLADA del stub del Incremento 5. Los TIPOS PÚBLICOS
// exportados (FUENTES_VERIFICACION, FuenteVerificacion, RESULTADOS_VERIFICACION,
// ResultadoVerificacion, EntradaVerificacion, ResultadoFuente) CONSERVAN su
// nombre y forma exactos para no romper consumidores. Lo que cambia:
//
//   - `verificarCumplimiento` pasa a ser ASÍNCRONA y recibe como PRIMER
//     argumento un cliente Prisma (`PrismaClient` o `Prisma.TransactionClient`)
//     con acceso a los modelos GLOBALES ImportacionListadoSat/ListadoSatEntrada
//     (tablas de referencia SIN tenant_id: los listados del SAT son públicos e
//     iguales para todos los tenants; la RLS no las toca por diseño).
//
//   - Para ART_69 / ART_69B / ART_69B_BIS / ART_49BIS consulta la ÚLTIMA
//     importación de la fuente (sincronizada vía POST /api/admin/listados) y
//     busca el RFC en sus entradas. El campo `situacion` del CSV se mapea a
//     `ResultadoVerificacion` (ver `mapearSituacion`).
//
//   - `snapshotSha256` es el sha256Archivo REAL del CSV importado (huella
//     sellada del listado contra el que se consultó), y `detalle` incluye la
//     fecha de importación y la razón social hallada.
//
//   - OPINION_32D y CSD_17H permanecen NO_DISPONIBLE (requieren e.firma del
//     contribuyente; integración posterior), igual que hoy.
//
// Principio rector C9: el sistema ALERTA y registra con snapshot fechado;
// NUNCA bloquea. Un resultado adverso (INHABILITADO_*, ALERTA) NO impide
// operar; solo se marca y registra para que el responsable (humano) decida.
// ============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { sha256 } from "@/lib/probatoria/hash";

/**
 * Fuentes/supuestos verificados. Los valores coinciden EXACTAMENTE con el enum
 * `FuenteVerificacion` del schema Prisma (Incremento 5).
 */
export const FUENTES_VERIFICACION = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
  "OPINION_32D",
  "CSD_17H",
] as const;

/** Unión de literales de fuente (equivalente al enum Prisma `FuenteVerificacion`). */
export type FuenteVerificacion = (typeof FUENTES_VERIFICACION)[number];

/**
 * Resultados posibles. Coinciden EXACTAMENTE con el enum
 * `ResultadoVerificacion` del schema Prisma (Incremento 5).
 */
export const RESULTADOS_VERIFICACION = [
  "AL_CORRIENTE",
  "NO_DISPONIBLE",
  "ALERTA",
  "INHABILITADO_PRESUNTO",
  "INHABILITADO_DEFINITIVO",
] as const;

/** Unión de literales de resultado (equivalente al enum Prisma `ResultadoVerificacion`). */
export type ResultadoVerificacion = (typeof RESULTADOS_VERIFICACION)[number];

/** Entrada del servicio: identificación del cliente/proveedor a verificar. */
export interface EntradaVerificacion {
  /** RFC del cliente/proveedor a buscar en los listados. */
  rfc: string;
}

/** Resultado de la verificación para UNA fuente. */
export interface ResultadoFuente {
  /** Fuente/supuesto verificado. */
  fuente: FuenteVerificacion;
  /** Resultado del supuesto para el RFC. */
  resultado: ResultadoVerificacion;
  /** Texto explicativo legible (fuente, fecha de importación, hallazgo). */
  detalle: string;
  /** SHA-256 (hex, 64 chars): el del ARCHIVO importado si hay listado; si no, el de un payload canónico fechado. */
  snapshotSha256: string;
  /** Fecha de consulta (ISO 8601). */
  consultadoEn: string;
}

/**
 * Cliente de base de datos aceptado por el servicio: el `PrismaClient` global
 * o un `TransactionClient` (tx de withTenant/withTenantFromSession). Los
 * modelos globales ImportacionListadoSat/ListadoSatEntrada NO tienen tenant_id,
 * así que son accesibles desde cualquiera de los dos sin depender de la RLS.
 */
export type DbVerificacion = PrismaClient | Prisma.TransactionClient;

/** Fuentes que se resuelven contra los listados importados del SAT. */
const FUENTES_LISTADO = [
  "ART_69",
  "ART_69B",
  "ART_69B_BIS",
  "ART_49BIS",
] as const satisfies readonly FuenteVerificacion[];

type FuenteListado = (typeof FUENTES_LISTADO)[number];

function esFuenteListado(fuente: FuenteVerificacion): fuente is FuenteListado {
  return (FUENTES_LISTADO as readonly FuenteVerificacion[]).includes(fuente);
}

/** Etiqueta legible por fuente, para el `detalle`. */
const ETIQUETA_FUENTE: Readonly<Record<FuenteVerificacion, string>> = {
  ART_69: "art. 69 CFF (créditos firmes / no localizados)",
  ART_69B: "art. 69-B CFF (EFOS/EDOS)",
  ART_69B_BIS: "art. 69-B Bis CFF (transmisión indebida de pérdidas)",
  ART_49BIS:
    "Art. 49 Bis CFF (verificación documental en curso por abogado; supuesto de la reforma CFF 2026)",
  OPINION_32D: "art. 32-D CFF (opinión de cumplimiento)",
  CSD_17H: "art. 17-H / 17-H Bis CFF (sello digital)",
};

// -----------------------------------------------------------------------------
// Normalización y mapeo de la columna "situación" del CSV del SAT.
// -----------------------------------------------------------------------------

/** Minúsculas y sin acentos, para comparar texto libre del CSV con tolerancia. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Mapea el texto de `situacion` del listado a un `ResultadoVerificacion`.
 *
 * Reglas (Incremento 10):
 *   - contiene "desvirtu" o "sentencia" (p. ej. "Desvirtuado", "Sentencia
 *     Favorable") → AL_CORRIENTE (el hallazgo se explica en el detalle). Se
 *     evalúa PRIMERO porque textos como "presunción desvirtuada" contienen
 *     también "presunt" y desvirtuar/sentencia favorable PREVALECE.
 *   - contiene "definitiv" → INHABILITADO_DEFINITIVO
 *   - contiene "presunt"  → INHABILITADO_PRESUNTO
 *   - hallado con situación no reconocida (o sin situación) → ALERTA
 *
 * C9: incluso INHABILITADO_DEFINITIVO es una ALERTA registrada, NO un bloqueo.
 */
function mapearSituacion(situacion: string | null): ResultadoVerificacion {
  if (situacion === null || situacion.trim() === "") {
    // Hallado en el listado pero sin texto de situación: amerita revisión humana.
    return "ALERTA";
  }
  const s = normalizarTexto(situacion);
  if (s.includes("desvirtu") || s.includes("sentencia")) return "AL_CORRIENTE";
  if (s.includes("definitiv")) return "INHABILITADO_DEFINITIVO";
  if (s.includes("presunt")) return "INHABILITADO_PRESUNTO";
  // Texto de situación no reconocido: hallado en el listado → alerta (no bloqueo).
  return "ALERTA";
}

/**
 * Snapshot canónico fechado para resultados SIN archivo de respaldo
 * (fuente no sincronizada u OPINION_32D/CSD_17H sin integración). Mantiene la
 * invariante de que `snapshotSha256` siempre es un digest hex de 64 chars.
 */
function snapshotSinArchivo(
  rfc: string,
  fuente: FuenteVerificacion,
  resultado: ResultadoVerificacion,
  consultadoEn: string,
): string {
  const payload = JSON.stringify({
    version: "sin-archivo-1",
    rfc,
    fuente,
    resultado,
    consultadoEn,
  });
  return sha256(payload);
}

// -----------------------------------------------------------------------------
// Verificación contra el listado importado de UNA fuente.
// -----------------------------------------------------------------------------
async function verificarContraListado(
  db: DbVerificacion,
  fuente: FuenteListado,
  rfc: string,
  consultadoEn: string,
): Promise<ResultadoFuente> {
  // 1) Última importación de la fuente (snapshot sellado del CSV del SAT).
  const importacion = await db.importacionListadoSat.findFirst({
    where: { fuente },
    orderBy: { importadoEn: "desc" },
    select: { id: true, sha256Archivo: true, importadoEn: true, filas: true },
  });

  if (!importacion) {
    // Nunca se ha sincronizado esta fuente: NO_DISPONIBLE con instrucción clara.
    const resultado: ResultadoVerificacion = "NO_DISPONIBLE";
    return {
      fuente,
      resultado,
      detalle:
        `${ETIQUETA_FUENTE[fuente]}: sin importación de listado disponible; ` +
        `sincroniza los listados desde Administración (POST /api/admin/listados) ` +
        `para poder verificar el RFC ${rfc}.`,
      snapshotSha256: snapshotSinArchivo(rfc, fuente, resultado, consultadoEn),
      consultadoEn,
    };
  }

  const fechaImportacion = importacion.importadoEn.toISOString();

  // 2) Buscar el RFC en las entradas de ESA importación (índice [rfc, fuente]).
  const entrada = await db.listadoSatEntrada.findFirst({
    where: { importacionId: importacion.id, rfc },
    select: { razonSocial: true, situacion: true },
  });

  if (!entrada) {
    // No hallado en el listado vigente → al corriente respecto de esta fuente.
    return {
      fuente,
      resultado: "AL_CORRIENTE",
      detalle:
        `${ETIQUETA_FUENTE[fuente]}: RFC ${rfc} NO aparece en el listado del SAT ` +
        `importado el ${fechaImportacion} (${importacion.filas} filas).`,
      snapshotSha256: importacion.sha256Archivo,
      consultadoEn,
    };
  }

  // 3) Hallado: mapear la situación publicada. C9: es ALERTA, nunca bloqueo.
  const resultado = mapearSituacion(entrada.situacion);
  const razonSocial =
    entrada.razonSocial && entrada.razonSocial.trim() !== ""
      ? ` Razón social publicada: "${entrada.razonSocial.trim()}".`
      : "";
  const situacionTexto =
    entrada.situacion && entrada.situacion.trim() !== ""
      ? `situación publicada: "${entrada.situacion.trim()}"`
      : "sin texto de situación en el listado";

  return {
    fuente,
    resultado,
    detalle:
      `${ETIQUETA_FUENTE[fuente]}: RFC ${rfc} HALLADO en el listado del SAT ` +
      `importado el ${fechaImportacion}; ${situacionTexto} → ${resultado}.` +
      razonSocial,
    snapshotSha256: importacion.sha256Archivo,
    consultadoEn,
  };
}

// -----------------------------------------------------------------------------
// Fuentes aún sin integración (requieren e.firma del contribuyente).
// -----------------------------------------------------------------------------
function resultadoNoIntegrado(
  fuente: "OPINION_32D" | "CSD_17H",
  rfc: string,
  consultadoEn: string,
): ResultadoFuente {
  const resultado: ResultadoVerificacion = "NO_DISPONIBLE";
  return {
    fuente,
    resultado,
    detalle:
      `${ETIQUETA_FUENTE[fuente]} → ${resultado} para RFC ${rfc}. ` +
      `Requiere e.firma del contribuyente; integración posterior.`,
    snapshotSha256: snapshotSinArchivo(rfc, fuente, resultado, consultadoEn),
    consultadoEn,
  };
}

/**
 * Verifica el cumplimiento fiscal de un cliente/proveedor contra TODAS las
 * fuentes de `FuenteVerificacion`, devolviendo un `ResultadoFuente` por cada
 * una (mismo orden que `FUENTES_VERIFICACION`).
 *
 * ART_69 / ART_69B / ART_69B_BIS / ART_49BIS se resuelven contra la ÚLTIMA
 * importación de los listados públicos del SAT (tablas globales sin tenant_id,
 * sincronizadas vía /api/admin/listados). OPINION_32D y CSD_17H siguen
 * NO_DISPONIBLE hasta su integración (e.firma).
 *
 * C9: el resultado NUNCA bloquea; solo marca y registra para que el
 * responsable decida.
 *
 * @param db - `PrismaClient` o `Prisma.TransactionClient` con acceso a los modelos globales.
 * @param entrada - `{ rfc }` del cliente/proveedor.
 * @param ahora - Momento de consulta (inyectable para pruebas). Por defecto `new Date()`.
 */
export async function verificarCumplimiento(
  db: DbVerificacion,
  entrada: EntradaVerificacion,
  ahora: Date = new Date(),
): Promise<ResultadoFuente[]> {
  const rfc = entrada.rfc.trim().toUpperCase();
  const consultadoEn = ahora.toISOString();

  const resultados: ResultadoFuente[] = [];
  for (const fuente of FUENTES_VERIFICACION) {
    if (esFuenteListado(fuente)) {
      resultados.push(await verificarContraListado(db, fuente, rfc, consultadoEn));
    } else {
      resultados.push(resultadoNoIntegrado(fuente, rfc, consultadoEn));
    }
  }
  return resultados;
}
