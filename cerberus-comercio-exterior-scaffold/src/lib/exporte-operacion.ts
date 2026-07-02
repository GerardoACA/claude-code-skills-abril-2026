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

// Constantes del dossier (Incremento 9.1): se importan para EXCLUIR del
// snapshot la huella administrativa del propio dossier (ver nota abajo).
// Solo se importan consts string; no hay ciclo de evaluación en runtime.
import { ACCION_DOSSIER, TIPO_DOSSIER } from "@/lib/dossier-diligencia";
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
export type TipoRegistroExporte =
  | "bitacora"
  | "documento"
  | "paso_despacho"
  // Inc 25: opinión de cumplimiento (32-D) ingestada del cliente, con su
  // veredicto de autenticidad y el resultado del cotejo en vivo (QR del SAT).
  | "opinion_cumplimiento";

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

// Inc 25: opinión de cumplimiento (32-D) ingestada del cliente. Subconjunto de
// OpinionCumplimientoIngestada (campos probatorios: folio, veredicto, sentido,
// resultado del cotejo en vivo y la huella sha256 del texto ingestado).
interface OpinionEvidencia {
  readonly id: string;
  readonly folio: string | null;
  readonly rfcDocumento: string | null;
  readonly sentido: string;
  readonly resultado: string;
  readonly cotejoEnVivo: string;
  readonly cotejoDetalle: string | null;
  readonly sha256: string;
  readonly creadoEn: Date;
}

/**
 * Cuántos eventos de BitacoraAuditoria del tenant se consideran como fallback
 * cuando no hay forma directa de ligarlos a la operación (ver heurística).
 */
const MAX_EVENTOS_FALLBACK = 200;

// -----------------------------------------------------------------------------
// ASOCIACIÓN evento-operación (Incremento 8: FK directa + heurística fallback)
// -----------------------------------------------------------------------------
// Desde el Incremento 8, BitacoraAuditoria tiene `operacionId String?` (FK
// opcional a Operacion). Los eventos nuevos la llevan; los históricos no. Por eso:
//
//   0) FK_DIRECTA (preferida): eventos con `operacionId` igual al de la
//      operación. Vínculo exacto por FK (`asociacion: "fk_directa"`).
//   1) DIRECTA (heurística): si (0) no arroja nada, eventos cuyo `payloadRef`
//      CONTIENE el id de la operación o su `referencia`.
//   2) FALLBACK: si (1) tampoco arroja nada, se toman los eventos MÁS RECIENTES
//      del tenant (hasta MAX_EVENTOS_FALLBACK), en orden cronológico. Esto es una
//      aproximación tenant-scoped honesta: se documenta como tal en el payload
//      (`asociacion: "fk_directa" | "directa" | "fallback_reciente_tenant"`) para
//      que el perito sepa cómo se estableció el vínculo evento↔operación.
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

  // Incremento 9.1: se EXCLUYE el evento "DOSSIER_GENERADO" en TODAS las rutas
  // de recolección. El dossier ancla la evidencia DE LA OPERACIÓN, no su propia
  // huella administrativa: si el evento del dossier entrara al paquete, el
  // sha256 regenerado nunca coincidiría con el sellado (X-Dossier-Match false).
  const sinDossier = { not: ACCION_DOSSIER } as const;

  // 0) FK directa (Incremento 8): eventos ligados EXACTAMENTE a la operación.
  const porFk = (await tx.bitacoraAuditoria.findMany({
    where: { tenantId, operacionId: operacion.id, accion: sinDossier },
    select: seleccion,
    orderBy: { creadoEn: "asc" },
  })) as EventoBitacora[];

  if (porFk.length > 0) {
    return { eventos: porFk, asociacion: "fk_directa" };
  }

  const directos = (await tx.bitacoraAuditoria.findMany({
    where: {
      tenantId,
      accion: sinDossier,
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
    where: { tenantId, accion: sinDossier },
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
//   Desde el Incremento 8, Documento tiene `operacionId String?` (FK opcional a
//   Operacion). Primero se toman los documentos ligados EXACTAMENTE por FK
//   (`asociacion: "fk_directa"`); si no hay ninguno (documentos históricos sin
//   FK), se mantiene el fallback anterior: los Documentos del tenant
//   (tenant-scoped por RLS) más recientes como contexto documental del
//   expediente (`asociacion: "contexto_tenant"`).
// -----------------------------------------------------------------------------
const MAX_DOCUMENTOS = 200;

const SELECCION_DOCUMENTO = {
  id: true,
  tipo: true,
  sha256: true,
  wormUrl: true,
  estadoProbatorio: true,
  version: true,
  creadoEn: true,
} as const;

async function reunirDocumentos(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operacionId: string,
): Promise<{ documentos: readonly DocumentoEvidencia[]; asociacion: string }> {
  // Incremento 9.1: se EXCLUYE el Documento "DOSSIER_DILIGENCIA" en AMBAS rutas
  // de recolección. Misma razón que en reunirEventos: el dossier sella la
  // evidencia de la operación, no su propia huella; incluirlo rompería el
  // cotejo al regenerar (X-Dossier-Match). La página de dossier lo sigue
  // listando porque esa lista no usa este snapshot.
  const sinDossier = { not: TIPO_DOSSIER } as const;

  // 0) FK directa (Incremento 8): documentos ligados EXACTAMENTE a la operación.
  const porFk = (await tx.documento.findMany({
    where: { tenantId, operacionId, tipo: sinDossier },
    select: SELECCION_DOCUMENTO,
    orderBy: { creadoEn: "asc" },
  })) as DocumentoEvidencia[];

  if (porFk.length > 0) {
    return { documentos: porFk, asociacion: "fk_directa" };
  }

  const docs = (await tx.documento.findMany({
    where: { tenantId, tipo: sinDossier },
    select: SELECCION_DOCUMENTO,
    orderBy: { creadoEn: "asc" },
    take: MAX_DOCUMENTOS,
  })) as DocumentoEvidencia[];
  return { documentos: docs, asociacion: "contexto_tenant" };
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
// Inc 25: opiniones de cumplimiento (32-D) del CLIENTE de la operación.
//   La opinión es evidencia por cliente (no por operación): se incluyen todas
//   las opiniones ingestadas del cliente, en orden cronológico, como contexto
//   probatorio del despacho (¿estaba el cliente al corriente / con opinión
//   auténtica y cotejada al operar?). tenant-scoped por RLS. Si el cliente no
//   tiene opiniones, no se añade ningún registro (la cadena queda idéntica a la
//   de antes de Inc 25 → no afecta el cotejo de dossiers previos).
// -----------------------------------------------------------------------------
const MAX_OPINIONES = 100;

async function reunirOpiniones(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clienteId: string,
): Promise<readonly OpinionEvidencia[]> {
  const opiniones = (await tx.opinionCumplimientoIngestada.findMany({
    where: { tenantId, clienteId },
    select: {
      id: true,
      folio: true,
      rfcDocumento: true,
      sentido: true,
      resultado: true,
      cotejoEnVivo: true,
      cotejoDetalle: true,
      sha256: true,
      creadoEn: true,
    },
    orderBy: { creadoEn: "asc" },
    take: MAX_OPINIONES,
  })) as OpinionEvidencia[];
  return opiniones;
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
  asociacion: string,
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
      // "fk_directa" si el documento lleva la FK operacionId (Incremento 8);
      // "contexto_tenant" para históricos sin FK (fallback anterior).
      asociacion,
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

function payloadOpinion(
  op: OpinionEvidencia,
  expediente: string,
  operacion: OperacionParaExporte,
  orden: number,
): PayloadRegistro {
  return {
    tipo: "opinion_cumplimiento",
    expediente,
    operacionId: operacion.id,
    clienteId: operacion.clienteId,
    orden,
    datos: {
      id: op.id,
      folio: op.folio,
      rfcDocumento: op.rfcDocumento,
      sentido: op.sentido,
      veredictoAutenticidad: op.resultado,
      cotejoEnVivo: op.cotejoEnVivo,
      cotejoDetalle: op.cotejoDetalle,
      creadoEn: op.creadoEn.toISOString(),
      asociacion: "cliente_de_la_operacion",
    },
    selloOriginal: {
      // Huella del texto de la opinión ingestada (cotejo del perito).
      sha256: op.sha256,
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
 *   3) pasos del despacho (cronológico),
 *   4) opiniones de cumplimiento 32-D del cliente (cronológico; Inc 25).
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

  const [
    { eventos, asociacion },
    { documentos, asociacion: asociacionDocs },
    pasos,
    opiniones,
  ] = await Promise.all([
    reunirEventos(tx, tenantId, operacion),
    reunirDocumentos(tx, tenantId, operacion.id),
    reunirPasos(tx, tenantId, operacion.id),
    reunirOpiniones(tx, tenantId, operacion.clienteId),
  ]);

  // Payloads en orden de cadena. `orden` es el índice global (estable).
  const payloads: PayloadRegistro[] = [];
  let orden = 0;
  for (const ev of eventos) {
    payloads.push(payloadEvento(ev, expediente, operacion, asociacion, orden++));
  }
  for (const doc of documentos) {
    payloads.push(
      payloadDocumento(doc, expediente, operacion, asociacionDocs, orden++),
    );
  }
  for (const paso of pasos) {
    payloads.push(payloadPaso(paso, expediente, operacion, orden++));
  }
  // Inc 25: opiniones 32-D del cliente al final de la cadena. Si no hay
  // ninguna, este bucle no añade nada y la cadena queda idéntica a la previa.
  for (const op of opiniones) {
    payloads.push(payloadOpinion(op, expediente, operacion, orden++));
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
