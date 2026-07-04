// CERBERUS COMERCIO EXTERIOR — guardado compartido en la bóveda del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/documentos-despacho-guardar.ts  (Incremento 59)
// Propósito: función COMPARTIDA con el algoritmo de la bóveda documental del
//            despacho (Inc 50) — sha256 del binario CRUDO + almacén WORM en
//            ruta content-addressed + Documento ligado al
//            ExpedienteProbatorioDespacho (creación mínima si no existe) +
//            evento encadenado DESPACHO_DOCUMENTO en bitácora. EXTRAÍDA de
//            src/app/api/operaciones/[id]/documentos/route.ts para que el
//            route de pasos (acuse documental por paso, Inc 59) REUTILICE el
//            mismo algoritmo sin duplicarlo.
//
// Corre DENTRO de la transacción tenant-scoped del llamador
// (withTenantFromSession): la RLS de Postgres ya aplica y las escrituras del
// llamador quedan atómicas con las de aquí.
//
// FAIL-SAFE (patrón de la bóveda KYC, Inc 43): si el almacén WORM no está
// configurado (BLOB_READ_WRITE_TOKEN ausente) o falla, el Documento se guarda
// IGUAL con su sha256 y wormUrl null — el sello probatorio vale por sí mismo.
//
// ENCADENADO: esta función inserta un evento de bitácora. Si el llamador va a
// insertar MÁS eventos en la MISMA transacción, debe usar `eventoSha256` como
// hashPrev de su siguiente evento (no re-consultar el último por fecha: dos
// eventos del mismo instante harían ambiguo el orden).
// =============================================================================

import type { Prisma } from "@prisma/client";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { obtenerAlmacen } from "@/lib/almacen-worm";
import type { TipoDocDespacho } from "@/lib/documentos-despacho-catalogo";
import { extraerDatosCfdiXml } from "@/lib/extraer-cfdi-xml";

/** Tamaño máximo del archivo subido a la bóveda del despacho (10 MB). */
export const TAMANO_MAX_BYTES_DOC_DESPACHO = 10 * 1024 * 1024;

// Retención del expediente del despacho: 5 años (plazo de conservación de la
// documentación aduanera, art. 30 CFF / Ley Aduanera).
export const RETENCION_ANIOS_DESPACHO = 5;

/** MIME permitidos (PDF/XML/imagen) → extensión de la ruta content-addressed. */
export const EXTENSION_POR_MIME_DESPACHO: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/xml": "xml",
  "text/xml": "xml",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/**
 * Datos extraídos del XML subido (captura asistida — el capturista no teclea
 * lo que el documento ya dice). SOLO incluye los campos que el extractor
 * detectó; null si el archivo no es XML o no se reconoció ningún dato.
 */
export type ExtraidoDocDespacho = {
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  moneda?: string;
  /** Conceptos resumidos: "descripción (cantidad unidad)" de cada partida. */
  conceptos?: string[];
  cartaPorte?: {
    origenCp?: string;
    destinoCp?: string;
    placaVm?: string;
  };
} | null;

/**
 * Corre el extractor CFDI/carta porte sobre el texto del XML y RESUME lo
 * encontrado. FAIL-SAFE: el extractor nunca lanza y un XML irreconocible
 * NUNCA impide guardar el documento — se devuelve null.
 */
export function extraerDeXmlDespacho(texto: string): ExtraidoDocDespacho {
  const datos = extraerDatosCfdiXml(texto);
  const extraido: NonNullable<ExtraidoDocDespacho> = {};

  if (datos.emisorRfc !== undefined) extraido.emisorRfc = datos.emisorRfc;
  if (datos.receptorRfc !== undefined) extraido.receptorRfc = datos.receptorRfc;
  if (datos.total !== undefined) extraido.total = datos.total;
  if (datos.moneda !== undefined) extraido.moneda = datos.moneda;

  const conceptos = datos.conceptos
    .map((c) => {
      const partes: string[] = [];
      if (c.descripcion !== undefined) partes.push(c.descripcion);
      if (c.cantidad !== undefined) {
        partes.push(`(${c.cantidad}${c.claveUnidad !== undefined ? ` ${c.claveUnidad}` : ""})`);
      }
      return partes.join(" ");
    })
    .filter((r) => r.length > 0);
  if (conceptos.length > 0) extraido.conceptos = conceptos;

  if (datos.cartaPorte !== undefined) {
    const cp: NonNullable<NonNullable<ExtraidoDocDespacho>["cartaPorte"]> = {};
    if (datos.cartaPorte.origen?.codigoPostal !== undefined) {
      cp.origenCp = datos.cartaPorte.origen.codigoPostal;
    }
    if (datos.cartaPorte.destino?.codigoPostal !== undefined) {
      cp.destinoCp = datos.cartaPorte.destino.codigoPostal;
    }
    if (datos.cartaPorte.placaVm !== undefined) cp.placaVm = datos.cartaPorte.placaVm;
    if (Object.keys(cp).length > 0) extraido.cartaPorte = cp;
  }

  return Object.keys(extraido).length > 0 ? extraido : null;
}

/** Entrada del guardado compartido (el llamador ya validó archivo y tipo). */
export type EntradaDocDespacho = {
  /** tenantId del JWT verificado (NUNCA del request). */
  tenantId: string;
  /** Actor legible de la sesión (email/nombre). */
  actor: string;
  /** Operación (ya verificada dentro del tenant por el llamador). */
  operacionId: string;
  /** Cliente dueño del expediente probatorio (1:1 por clienteId). */
  clienteId: string;
  /** Tipo documental del catálogo del despacho. */
  tipo: TipoDocDespacho;
  /** Bytes CRUDOS del archivo (el sha256 se calcula aquí, sobre el crudo). */
  buffer: Buffer;
  /** Extensión de la ruta content-addressed (pdf, xml, png…). */
  extension: string;
  /** Content-Type reportado por el navegador (va al almacén WORM). */
  contentType: string;
  /** Nombre original del archivo (solo para la bitácora). */
  nombreArchivo: string;
  /** Datos extraídos por captura asistida (null si no aplica). */
  extraido: ExtraidoDocDespacho;
};

/** Resultado del guardado compartido. */
export type DocDespachoGuardado = {
  documentoId: string;
  sha256: string;
  almacenado: boolean;
  detalle: string;
  /**
   * sha256 del evento DESPACHO_DOCUMENTO insertado — es el último eslabón de
   * la cadena: el llamador que agregue otro evento en la MISMA transacción
   * debe usarlo como hashPrev.
   */
  eventoSha256: string;
};

/**
 * Guarda un documento en la bóveda del despacho (algoritmo del Inc 50):
 * sha256 + WORM + Documento + bitácora encadenada. Ver cabecera del archivo.
 */
export async function guardarDocumentoDespacho(
  tx: Prisma.TransactionClient,
  entrada: EntradaDocDespacho,
): Promise<DocDespachoGuardado> {
  const {
    tenantId,
    actor,
    operacionId,
    clienteId,
    tipo,
    buffer,
    extension,
    contentType,
    nombreArchivo,
    extraido,
  } = entrada;

  // 1) sha256 del binario CRUDO (sello reproducible contra el original).
  const sha256Documento = sha256(buffer);

  const ahora = new Date();
  const retieneHasta = new Date(ahora);
  retieneHasta.setFullYear(retieneHasta.getFullYear() + RETENCION_ANIOS_DESPACHO);

  // 2) Busca/CREA el ExpedienteProbatorioDespacho (1:1 por clienteId — el
  //    expediente probatorio es del cliente y abarca sus operaciones). La
  //    creación mínima cubre los obligatorios del modelo (tenantId +
  //    clienteId) y fija custodio + retención; si ya existe, NO se
  //    sobreescribe nada.
  const expediente = await tx.expedienteProbatorioDespacho.upsert({
    where: { clienteId },
    create: {
      tenantId,
      clienteId,
      custodio: actor,
      retieneHasta,
    },
    update: {},
    select: { id: true },
  });

  // 3) Almacén WORM (ruta content-addressed, nunca sobrescribir). El conector
  //    NUNCA lanza: sin token o con fallo, reporta ok:false y el documento
  //    queda anclado SOLO por su sha256 (fail-safe honesto).
  const ruta = `despacho/${tenantId}/${operacionId}/${sha256Documento}.${extension}`;
  const guardado = await obtenerAlmacen().guardar(ruta, buffer, contentType);

  // 4) Documento real de la bóveda, ligado al expediente probatorio Y a la
  //    operación (FK directa del Inc 8, para listar por operación).
  const documento = await tx.documento.create({
    data: {
      tenantId,
      tipo,
      sha256: sha256Documento,
      wormUrl: guardado.ok ? (guardado.url ?? null) : null,
      expedienteProbatorioId: expediente.id,
      operacionId,
      vence: retieneHasta,
    },
    select: { id: true },
  });

  // 5) Evento encadenado en bitácora (sha256 del payload canónico + hashPrev).
  const previo = await tx.bitacoraAuditoria.findFirst({
    orderBy: { creadoEn: "desc" },
    select: { sha256: true },
  });
  const hashPrev: string | null = previo?.sha256 ?? null;
  const payloadEvento = canonicalizar({
    tenantId,
    accion: "DESPACHO_DOCUMENTO",
    actor,
    operacionId,
    expedienteId: expediente.id,
    documentoId: documento.id,
    tipo,
    nombreArchivo,
    sha256Documento,
    almacenado: guardado.ok,
    almacenDetalle: guardado.detalle,
    creadoEn: ahora.toISOString(),
    hashPrev,
  });
  const eventoSha256 = sha256(payloadEvento);
  await tx.bitacoraAuditoria.create({
    data: {
      tenantId,
      actor,
      accion: "DESPACHO_DOCUMENTO",
      // payloadRef en JSON (CONTRATO: mismo patrón que "kyc-doc", Inc 48A —
      // los lectores deben ser defensivos con formatos previos).
      payloadRef: JSON.stringify({
        ref: "despacho-doc",
        documentoId: documento.id,
        operacionId,
        tipo,
        extraido,
      }),
      sha256: eventoSha256,
      hashPrev,
      creadoEn: ahora,
    },
    select: { id: true },
  });

  const detalle = guardado.ok
    ? `Documento almacenado en la bóveda WORM y sellado (sha256 ${sha256Documento.slice(0, 12)}…).`
    : `Documento sellado por sha256; sin copia en almacén WORM (${guardado.detalle}).`;

  return {
    documentoId: documento.id,
    sha256: sha256Documento,
    almacenado: guardado.ok,
    detalle,
    eventoSha256,
  };
}

// =============================================================================
// FIN documentos-despacho-guardar.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
