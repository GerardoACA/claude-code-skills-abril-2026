// CERBERUS COMERCIO EXTERIOR — dossier de diligencia automático. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/dossier-diligencia.ts  (Agente AUTO-DOSSIER, Incremento 9)
// Propósito: cuando una operación cae en ROJO o INCIDENCIA, generar el DOSSIER
//            DE DILIGENCIA: snapshot probatorio del estado de la operación en
//            ese instante, sellado (SHA-256) y ligado por FK directa.
//
// Diseño (ver _INCREMENTO-9.md):
//   1) Se construye el paquete probatorio con las funciones EXISTENTES:
//      construirEntradaExporte → armarExporteProbatorio → serializarPaquete.
//   2) sha256(JSON canónico del paquete) = sello del dossier.
//   3) El dossier se materializa como `Documento` (tipo "DOSSIER_DILIGENCIA",
//      sha256, operacionId FK directa del Inc 8). Los tres expedientes
//      (expedienteKycId / expedienteProbatorioId / expedienteDobleId) son
//      OPCIONALES en el schema y se dejan en null: el vínculo probatorio del
//      dossier es la operación, no un expediente de cliente.
//   4) + Evento BitacoraAuditoria "DOSSIER_GENERADO" encadenado (hashPrev del
//      último evento del tenant), mismo patrón que estado/route.ts.
//
// El JSON del dossier NO se persiste como blob todavía (no hay object storage):
// el sha256 ancla el contenido y el paquete es regenerable con estas mismas
// funciones; el almacenamiento WORM del blob (wormUrl) es un paso futuro. El
// GET de descarga regenera el paquete y ADVIERTE si su sha256 difiere del
// sellado — esa divergencia también es señal probatoria.
//
// NO toca el schema: usa SOLO campos reales de Documento y BitacoraAuditoria.
// Corre SIEMPRE dentro de una transacción tenant-scoped (withTenantFromSession
// ya fijó app.tenant_id => RLS); el filtro por tenantId en los datos escritos
// es defensa en profundidad, coherente con el resto del código.
// =============================================================================

import type { Prisma } from "@prisma/client";

import {
  construirEntradaExporte,
  type OperacionParaExporte,
} from "@/lib/exporte-operacion";
import {
  armarExporteProbatorio,
  type PaqueteProbatorio,
} from "@/lib/probatoria/exporte-probatorio";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { sha256 } from "@/lib/probatoria/hash";

/** Tipo documental del dossier dentro del catálogo libre de `Documento.tipo`. */
export const TIPO_DOSSIER = "DOSSIER_DILIGENCIA";

/** Acción registrada en la bitácora al generar el dossier. */
export const ACCION_DOSSIER = "DOSSIER_GENERADO";

/** Resultado de la generación del dossier. */
export interface ResultadoDossier {
  /** id del `Documento` (tipo "DOSSIER_DILIGENCIA") creado. */
  readonly documentoId: string;
  /** SHA-256 (hex, 64 chars) del JSON canónico del paquete probatorio. */
  readonly sha256: string;
}

/**
 * Serialización canónica y estable (claves ordenadas) para sellar el evento.
 * Mismo patrón que src/app/api/operaciones/[id]/estado/route.ts.
 */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Sello de CONTENIDO del dossier (fix Inc 9.1, commit e163e8e del producto):
 * SHA-256 del paquete canonicalizado EXCLUYENDO `generadoEn` (timestamp de
 * pared que cambia en cada regeneración) y `selloPaquete` (que depende de
 * generadoEn). Así el sello ancla la EVIDENCIA, no el instante de emisión, y
 * el cotejo X-Dossier-Match: true es alcanzable cuando no hubo actividad
 * posterior. Usar SIEMPRE esta función tanto al sellar como al cotejar.
 */
export function selloContenidoDossier(paquete: PaqueteProbatorio): string {
  const { generadoEn: _g, selloPaquete: _s, ...contenido } = paquete;
  return sha256(canonicalizar(contenido));
}

/**
 * Genera el dossier de diligencia de una operación DENTRO de la transacción
 * `tx` (tenant-scoped por RLS): arma el paquete probatorio con la evidencia
 * actual, lo sella con SHA-256, crea el `Documento` "DOSSIER_DILIGENCIA"
 * ligado por FK a la operación y registra el evento "DOSSIER_GENERADO"
 * encadenado en la bitácora append-only.
 *
 * @param tx        cliente transaccional con app.tenant_id ya fijado.
 * @param tenantId  tenant del JWT (defensa en profundidad sobre la RLS).
 * @param actor     actor legible (email/nombre del token) para la bitácora.
 * @param operacion operación identificada (id, referencia, clienteId).
 * @returns { documentoId, sha256 } del dossier sellado.
 */
export async function generarDossier(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actor: string,
  operacion: OperacionParaExporte,
): Promise<ResultadoDossier> {
  // 1) Paquete probatorio del instante: evidencia reunida dentro de la MISMA
  //    transacción (incluye el evento del cambio de estado recién insertado).
  const entrada = await construirEntradaExporte(tx, tenantId, operacion);
  const paquete = armarExporteProbatorio(entrada);

  // 2) Sello del dossier: SHA-256 del CONTENIDO del paquete (excluye generadoEn
  //    y selloPaquete — ver selloContenidoDossier). Ancla la evidencia del
  //    instante de la diligencia y hace alcanzable el cotejo Match: true.
  const selloDossier = selloContenidoDossier(paquete);

  // 3) Documento "DOSSIER_DILIGENCIA" ligado por FK directa a la operación.
  //    Los campos opcionales (wormUrl, vence, expedienteKycId,
  //    expedienteProbatorioId, expedienteDobleId) quedan en null; el
  //    estadoProbatorio y version toman sus defaults del schema
  //    (EVIDENCIA_PRELIMINAR, 1).
  const documento = await tx.documento.create({
    data: {
      tenantId,
      tipo: TIPO_DOSSIER,
      sha256: selloDossier,
      operacionId: operacion.id,
    },
    select: { id: true },
  });

  // 4) Bitácora append-only: encadenar con el sha256 del último evento del
  //    tenant (la tx tiene app.tenant_id fijado => la lectura es tenant-scoped;
  //    lectura + insert atómicos). Mismo patrón que estado/route.ts.
  const previo = await tx.bitacoraAuditoria.findFirst({
    orderBy: { creadoEn: "desc" },
    select: { sha256: true },
  });
  const hashPrev: string | null = previo?.sha256 ?? null;

  const creadoEn = new Date();

  // 5) Sello de integridad del evento (SHA-256 sobre payload canónico,
  //    incluyendo hashPrev para encadenar).
  const payload = {
    tenantId,
    accion: ACCION_DOSSIER,
    actor,
    operacionId: operacion.id,
    referencia: operacion.referencia,
    documentoId: documento.id,
    dossierSha256: selloDossier,
    creadoEn: creadoEn.toISOString(),
    hashPrev,
  };
  const selloEvento = sha256(canonical(payload));

  await tx.bitacoraAuditoria.create({
    data: {
      tenantId,
      actor,
      accion: ACCION_DOSSIER,
      // FK directa a la operación (Incremento 8): evidencia exacta, sin heurística.
      operacionId: operacion.id,
      payloadRef: `documento:${documento.id}:dossier:${selloDossier}`,
      sha256: selloEvento,
      hashPrev,
      creadoEn,
    },
    select: { id: true },
  });

  return { documentoId: documento.id, sha256: selloDossier };
}
