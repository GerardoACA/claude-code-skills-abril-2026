// CERBERUS COMERCIO EXTERIOR — servicio de exporte por operación. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/exporte-operacion.ts  (Agente SERVICIO-EXPORTE, Incremento 7)
// Propósito: reunir, DENTRO de una transacción tenant-scoped (RLS ya fijada por
//            withTenant/withTenantFromSession), la evidencia probatoria de UNA
//            operación —eventos de BitacoraAuditoria, Documentos y PasoDespacho—
//            y armar el `EntradaExporte` que consume la capa probatoria existente
//            (armarExporteProbatorio / serializarPaquete).
//
// NO reimplementa el empaquetado ni el hashing: reutiliza hash-chain.ts
// (canonicalizar, GENESIS_SELLO, construirCadena) y las formas EXACTAS de
// exporte-probatorio.ts (EntradaExporte, RegistroProbatorio).
// NO toca el schema: solo LEE tablas existentes con los campos reales.
// =============================================================================

import type { Prisma } from "@prisma/client";

import { canonicalizar, construirCadena } from "@/lib/probatoria/hash-chain";
import type {
  EntradaExporte,
  RegistroProbatorio,
} from "@/lib/probatoria/exporte-probatorio";

// -----------------------------------------------------------------------------
// Entrada mínima que necesita el servicio: la operación identificada.
// Se pasa explícita (no se re-lee) para no acoplar a la forma exacta del
// findUnique del caller (UI-EXPEDIENTE) y mantener la función testeable.
// -----------------------------------------------------------------------------
export interface OperacionParaExporte {
  /** id (cuid) de la Operacion. */
  readonly id: string;
  /** Referencia interna del despacho; será el `expediente` del exporte. */
  readonly referencia: string;
  /** Cliente dueño de la operación (para contexto en los payloads). */
  readonly clienteId: string;
}

/**
 * Categoría del registro dentro del expediente, para que el perito distinga
 * el origen de cada eslabón sin acceso al sistema vivo.
 */
export type TipoRegistroExporte = "bitacora" | "documento" | "paso_despacho";

// -----------------------------------------------------------------------------
// Formas mínimas de lo que leemos de la BD (subconjunto de los modelos Prisma).
// Se declaran locales para no depender de tipos generados y evitar `any`.
// Los nombres/tipos coinciden con prisma/schema.prisma (campos reales).
// -----------------------------------------------------------------------------
interface EventoBitacora {
  readonly id: string;
  readonly actor: string;
  readonly accion: string;
  readonly payloadRef: string | null;
  readonly sha256: string;
  readonly hashPrev: string | null;
  readonly estadoSello: string;
  readonly creadoEn: Date;
}

interface DocumentoEvidencia {
  readonly id: string;
  readonly tipo: string;
  readonly sha256: string;
  readonly wormUrl: string | null;
  readonly estadoProbatorio: string;
  readonly version: number;
  readonly creadoEn: Date;
}

interface PasoEvidencia {
  readonly id: string;
  readonly tipo: string;
  readonly acuse: string | null;
  readonly sello: string | null;
  readonly detalle: string | null;
  readonly sha256: string;
  readonly completadoEn: Date;
}

/**
 * Cuántos eventos de BitacoraAuditoria del tenant se consideran como fallback
 * cuando no hay forma directa de ligarlos a la operación (ver heurística).
 */
const MAX_EVENTOS_FALLBACK = 200;

// -----------------------------------------------------------------------------
// HEURÍSTICA DE ASOCIACIÓN evento-operación
// -----------------------------------------------------------------------------
// BitacoraAuditoria NO tiene FK a Operacion en el schema. Sus columnas de enlace
// son `payloadRef` (referencia libre al payload sellado) y `accion`. Por eso:
//
//   1) DIRECTA (preferida): eventos cuyo `payloadRef` CONTIENE el id de la
//      operación o su `referencia`. Es la única atadura semántica disponible.
//   2) FALLBACK: si (1) no arroja nada, se toman los eventos MÁS RECIENTES del
//      tenant (hasta MAX_EVENTOS_FALLBACK), en orden cronológico. Esto es una
//      aproximación tenant-scoped honesta: se documenta como tal en el payload
//      (`asociacion: "directa" | "fallback_reciente_tenant"`) para que el perito
//      sepa que el vínculo evento↔operación es por proximidad, no por FK.
//
// La consulta es tenant-scoped por RLS (la tx ya tiene app.tenant_id fijado); el
// filtro explícito por tenantId es defensa en profundidad, coherente con el
// resto del código.
// -----------------------------------------------------------------------------
async function reunirEventos(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operacion: OperacionParaExporte,
): Promise<{ eventos: readonly EventoBitacora[]; asociacion: string }> {
  const seleccion = {
    id: true,
    actor: true,
    accion: true,
    payloadRef: true,
    sha256: true,
    hashPrev: true,
    estadoSello: true,
    creadoEn: true,
  } as const;

  const directos = (await tx.bitacoraAuditoria.findMany({
    where: {
      tenantId,
      OR: [
        { payloadRef: { contains: operacion.id } },
        { payloadRef: { contains: operacion.referencia } },
      ],
    },
    select: seleccion,
    orderBy: { creadoEn: "asc" },
  })) as EventoBitacora[];

  if (directos.length > 0) {
    return { eventos: directos, asociacion: "directa" };
  }

  const recientes = (await tx.bitacoraAuditoria.findMany({
    where: { tenantId },
    select: seleccion,
    orderBy: { creadoEn: "desc" },
    take: MAX_EVENTOS_FALLBACK,
  })) as EventoBitacora[];

  // Se devuelven en orden cronológico ascendente para encadenar de forma estable.
  const cronologicos = [...recientes].reverse();
  return { eventos: cronologicos, asociacion: "fallback_reciente_tenant" };
}

// -----------------------------------------------------------------------------
// Documentos de la operación.
//   Documento NO tiene FK directa a Operacion (solo a los tres expedientes). No
//   existe forma fiel de ligarlos por operación en el schema actual, así que se
//   toman los Documentos del tenant (tenant-scoped por RLS) más recientes como
//   contexto documental del expediente. Se documenta la limitación en el payload.
// -----------------------------------------------------------------------------
const MAX_DOCUMENTOS = 200;

async function reunirDocumentos(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<readonly DocumentoEvidencia[]> {
  const docs = (await tx.documento.findMany({
    where: { tenantId },
    select: {
      id: true,
      tipo: true,
      sha256: true,
      wormUrl: true,
      estadoProbatorio: true,
      version: true,
      creadoEn: true,
    },
    orderBy: { creadoEn: "asc" },
    take: MAX_DOCUMENTOS,
  })) as DocumentoEvidencia[];
  return docs;
}

// -----------------------------------------------------------------------------
// Pasos del despacho de la operación (FK directa: operacionId). Enlace fiel.
// -----------------------------------------------------------------------------
async function reunirPasos(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operacionId: string,
): Promise<readonly PasoEvidencia[]> {
  const pasos = (await tx.pasoDespacho.findMany({
    where: { tenantId, operacionId },
    select: {
      id: true,
      tipo: true,
      acuse: true,
      sello: true,
      detalle: true,
      sha256: true,
      completadoEn: true,
    },
    orderBy: { completadoEn: "asc" },
  })) as PasoEvidencia[];
  return pasos;
}

// -----------------------------------------------------------------------------
// Construcción de payloads canónicos por registro.
//
// Cada payload preserva el sello ORIGINAL de la BD (sha256/hashPrev/estado) para
// que el perito pueda cotejarlo contra el sistema vivo, y añade metadatos de
// contexto (tipo, expediente, orden). El eslabón de la hash-chain del EXPORTE se
// RECOMPUTA con construirCadena() sobre estos payloads canónicos, garantizando
// que sha256(payloadCanonico) === eslabon.hashPayload y que verificarExporte()
// pase. No se pierden los hashes originales: viajan dentro del payload.
// -----------------------------------------------------------------------------
interface PayloadRegistro {
  readonly tipo: TipoRegistroExporte;
  readonly expediente: string;
  readonly operacionId: string;
  readonly clienteId: string;
  readonly orden: number;
  /** Datos específicos del registro (evento/documento/paso). */
  readonly datos: Record<string, unknown>;
  /** Sello original tal como está en la BD, para cotejo del perito. */
  readonly selloOriginal: {
    readonly sha256: string;
    readonly hashPrev: string | null;
    readonly estado: string;
  };
}

function payloadEvento(
  ev: EventoBitacora,
  expediente: string,
  operacion: OperacionParaExporte,
  asociacion: string,
  orden: number,
): PayloadRegistro {
  return {
    tipo: "bitacora",
    expediente,
    operacionId: operacion.id,
    clienteId: operacion.clienteId,
    orden,
    datos: {
      id: ev.id,
      actor: ev.actor,
      accion: ev.accion,
      payloadRef: ev.payloadRef,
      creadoEn: ev.creadoEn.toISOString(),
      asociacion,
    },
    selloOriginal: {
      sha256: ev.sha256,
      hashPrev: ev.hashPrev,
      estado: ev.estadoSello,
    },
  };
}

function payloadDocumento(
  doc: DocumentoEvidencia,
  expediente: string,
  operacion: OperacionParaExporte,
  orden: number,
): PayloadRegistro {
  return {
    tipo: "documento",
    expediente,
    operacionId: operacion.id,
    clienteId: operacion.clienteId,
    orden,
    datos: {
      id: doc.id,
      tipoDocumental: doc.tipo,
      wormUrl: doc.wormUrl,
      version: doc.version,
      creadoEn: doc.creadoEn.toISOString(),
      // Documento no tiene FK a Operacion: enlace por contexto tenant.
      asociacion: "contexto_tenant",
    },
    selloOriginal: {
      sha256: doc.sha256,
      hashPrev: null,
      estado: doc.estadoProbatorio,
    },
  };
}

function payloadPaso(
  paso: PasoEvidencia,
  expediente: string,
  operacion: OperacionParaExporte,
  orden: number,
): PayloadRegistro {
  return {
    tipo: "paso_despacho",
    expediente,
    operacionId: operacion.id,
    clienteId: operacion.clienteId,
    orden,
    datos: {
      id: paso.id,
      tipoPaso: paso.tipo,
      acuse: paso.acuse,
      sello: paso.sello,
      detalle: paso.detalle,
      completadoEn: paso.completadoEn.toISOString(),
      asociacion: "directa",
    },
    selloOriginal: {
      sha256: paso.sha256,
      hashPrev: null,
      estado: "EVIDENCIA_PRELIMINAR",
    },
  };
}

/**
 * Construye el `EntradaExporte` de una operación reuniendo su evidencia dentro
 * de la transacción `tx` (tenant-scoped por RLS). El resultado se pasa tal cual
 * a `armarExporteProbatorio` de la capa probatoria.
 *
 * Orden de los registros (define la hash-chain del exporte):
 *   1) eventos de BitacoraAuditoria (cronológico),
 *   2) documentos (cronológico),
 *   3) pasos del despacho (cronológico).
 *
 * @param tx        cliente transaccional con app.tenant_id ya fijado.
 * @param tenantId  tenant del JWT (defensa en profundidad sobre la RLS).
 * @param operacion operación identificada a exportar.
 */
export async function construirEntradaExporte(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operacion: OperacionParaExporte,
): Promise<EntradaExporte> {
  const expediente = operacion.referencia;

  const [{ eventos, asociacion }, documentos, pasos] = await Promise.all([
    reunirEventos(tx, tenantId, operacion),
    reunirDocumentos(tx, tenantId),
    reunirPasos(tx, tenantId, operacion.id),
  ]);

  // Payloads en orden de cadena. `orden` es el índice global (estable).
  const payloads: PayloadRegistro[] = [];
  let orden = 0;
  for (const ev of eventos) {
    payloads.push(payloadEvento(ev, expediente, operacion, asociacion, orden++));
  }
  for (const doc of documentos) {
    payloads.push(payloadDocumento(doc, expediente, operacion, orden++));
  }
  for (const paso of pasos) {
    payloads.push(payloadPaso(paso, expediente, operacion, orden++));
  }

  // Se recomputa la hash-chain del exporte sobre los payloads canónicos: el
  // primer eslabón encadena contra GENESIS_SELLO (dentro de construirCadena).
  const cadena = construirCadena(payloads);

  const registros: RegistroProbatorio[] = cadena.map((eslabon, i) => ({
    eslabon,
    payloadCanonico: canonicalizar(payloads[i]),
    // `sellado` se omite: el sellado calificado (PSC/TSA) es un paso posterior;
    // sin él, el estado agregado queda como EVIDENCIA_PRELIMINAR (coherente con
    // resumir() de la capa probatoria).
  }));

  return {
    tenantId,
    expediente,
    registros,
  };
}
