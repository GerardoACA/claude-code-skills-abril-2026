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
//   - PADRON (Incremento 56): Padrón de Importadores / Sectores Específicos
//     (requisito del dictamen aduanal, Módulo 2.1 del despacho). Sin
//     listado/fuente de padrón configurada todavía → NO_DISPONIBLE con
//     detalle explícito de verificación manual (C9: el requisito queda
//     visible sin inventar datos).
//
//   - SANCIONES_INT (Incremento 12): listas de sanciones internacionales
//     (OFAC/SDN, ONU, UE, UK…) por INGESTA MANUAL. Se consulta la ÚLTIMA
//     importación de la fuente: (i) si la entrada trae RFC y coincide EXACTO
//     → mapeo normal de `situacion`; (ii) match HEURÍSTICO por nombre
//     normalizado (normalizarNombre del cliente contenido en/igual al de la
//     entrada) → SIEMPRE ALERTA con nota de revisión humana (C9 reforzado:
//     nunca inhabilitación automática por nombre). Sin importación →
//     NO_DISPONIBLE con "ingesta manual disponible en Administración".
//
// Principio rector C9: el sistema ALERTA y registra con snapshot fechado;
// NUNCA bloquea. Un resultado adverso (INHABILITADO_*, ALERTA) NO impide
// operar; solo se marca y registra para que el responsable (humano) decida.
// ============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { sha256 } from "@/lib/probatoria/hash";
import { normalizarNombre } from "@/lib/sat-listados";

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
  "SANCIONES_INT",
  "PADRON",
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
  /**
   * Razón social del cliente/proveedor (opcional; Inc 12). Se usa SOLO para
   * el match heurístico por nombre contra SANCIONES_INT: si se omite, esa
   * fuente se resuelve únicamente por RFC exacto.
   */
  razonSocial?: string;
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
  SANCIONES_INT: "sanciones internacionales (OFAC/SDN, ONU, UE, UK…)",
  PADRON: "Padrón de Importadores / Sectores Específicos (Módulo 2.1)",
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
// SANCIONES_INT (Inc 12) — listas internacionales (OFAC/SDN, ONU, UE, UK…)
// por ingesta manual. Identifican por NOMBRE ⇒ el match por nombre es
// HEURÍSTICO y produce SIEMPRE ALERTA con revisión humana (C9 reforzado:
// nunca inhabilitación automática por nombre). El match por RFC exacto (si
// la lista lo trae) sí usa el mapeo normal de situación.
// -----------------------------------------------------------------------------

/** Máximo de candidatas traídas para el filtro en memoria del match por nombre. */
const MAX_CANDIDATAS_NOMBRE = 500;

async function verificarSancionesInternacionales(
  db: DbVerificacion,
  rfc: string,
  razonSocial: string | undefined,
  consultadoEn: string,
): Promise<ResultadoFuente> {
  const fuente = "SANCIONES_INT" as const;

  // 1) Última importación de la fuente (ingesta manual o sync futura).
  const importacion = await db.importacionListadoSat.findFirst({
    where: { fuente },
    orderBy: { importadoEn: "desc" },
    select: {
      id: true,
      sha256Archivo: true,
      importadoEn: true,
      filas: true,
      emisor: true,
    },
  });

  if (!importacion) {
    const resultado: ResultadoVerificacion = "NO_DISPONIBLE";
    return {
      fuente,
      resultado,
      detalle:
        `${ETIQUETA_FUENTE[fuente]}: sin importación de lista disponible; ` +
        `ingesta manual disponible en Administración (/admin/listados) para ` +
        `poder verificar al cliente (RFC ${rfc}).`,
      snapshotSha256: snapshotSinArchivo(rfc, fuente, resultado, consultadoEn),
      consultadoEn,
    };
  }

  const fechaImportacion = importacion.importadoEn.toISOString();
  const emisorTexto =
    importacion.emisor && importacion.emisor.trim() !== ""
      ? ` Emisor de la lista: ${importacion.emisor.trim()}.`
      : "";

  // 2-i) Match por RFC EXACTO (solo si la lista trae RFC): mapeo normal de
  // situación (puede llegar a INHABILITADO_*; C9: sigue siendo alerta, no bloqueo).
  const porRfc = await db.listadoSatEntrada.findFirst({
    where: { importacionId: importacion.id, rfc },
    select: { razonSocial: true, situacion: true },
  });

  if (porRfc) {
    const resultado = mapearSituacion(porRfc.situacion);
    const nombrePublicado =
      porRfc.razonSocial && porRfc.razonSocial.trim() !== ""
        ? ` Nombre publicado: "${porRfc.razonSocial.trim()}".`
        : "";
    const situacionTexto =
      porRfc.situacion && porRfc.situacion.trim() !== ""
        ? `situación publicada: "${porRfc.situacion.trim()}"`
        : "sin texto de situación en la lista";
    return {
      fuente,
      resultado,
      detalle:
        `${ETIQUETA_FUENTE[fuente]}: RFC ${rfc} HALLADO (match exacto por RFC) ` +
        `en la lista importada el ${fechaImportacion}; ${situacionTexto} → ` +
        `${resultado}.${nombrePublicado}${emisorTexto}`,
      snapshotSha256: importacion.sha256Archivo,
      consultadoEn,
    };
  }

  // 2-ii) Match HEURÍSTICO por nombre normalizado: el nombre del cliente debe
  // quedar CONTENIDO en (o ser igual a) el nombre normalizado de la entrada.
  // Se acota la consulta con `contains` case-insensitive sobre razonSocial
  // (primera palabra del nombre normalizado) y se filtra en memoria con
  // normalizarNombre. SIEMPRE ALERTA: requiere revisión humana (C9).
  if (razonSocial !== undefined) {
    const nombreCliente = normalizarNombre(razonSocial);
    if (nombreCliente !== "") {
      const primeraPalabra = nombreCliente.split(" ")[0];
      const candidatas = await db.listadoSatEntrada.findMany({
        where: {
          importacionId: importacion.id,
          razonSocial: { contains: primeraPalabra, mode: "insensitive" },
        },
        select: { razonSocial: true, situacion: true },
        take: MAX_CANDIDATAS_NOMBRE,
      });

      for (const candidata of candidatas) {
        if (!candidata.razonSocial) continue;
        const nombreEntrada = normalizarNombre(candidata.razonSocial);
        if (
          nombreEntrada === nombreCliente ||
          nombreEntrada.includes(nombreCliente)
        ) {
          return {
            fuente,
            resultado: "ALERTA",
            detalle:
              `${ETIQUETA_FUENTE[fuente]}: coincidencia por NOMBRE (heurística); ` +
              `requiere revisión humana. Cliente "${razonSocial.trim()}" (RFC ${rfc}) ` +
              `coincide con la entrada "${candidata.razonSocial.trim()}" de la ` +
              `lista importada el ${fechaImportacion}.${emisorTexto}`,
            snapshotSha256: importacion.sha256Archivo,
            consultadoEn,
          };
        }
      }
    }
  }

  // 3) Sin match por RFC ni por nombre → al corriente respecto de esta fuente.
  const nombreConsultado =
    razonSocial !== undefined && razonSocial.trim() !== ""
      ? ` ni el nombre "${razonSocial.trim()}"`
      : " (sin razón social para match por nombre)";
  return {
    fuente,
    resultado: "AL_CORRIENTE",
    detalle:
      `${ETIQUETA_FUENTE[fuente]}: el RFC ${rfc}${nombreConsultado} NO aparece ` +
      `en la lista importada el ${fechaImportacion} (${importacion.filas} filas).` +
      emisorTexto,
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

// -----------------------------------------------------------------------------
// PADRON (Inc 56) — Padrón de Importadores / Sectores Específicos (requisito
// del dictamen aduanal, Módulo 2.1 del despacho). Mismo patrón que las fuentes
// sin URL/listado configurado (p. ej. ART_69B_BIS sin importación): mientras
// no exista listado/fuente de padrón configurada, el resultado es
// NO_DISPONIBLE con detalle explícito — el requisito queda VISIBLE sin
// inventar datos (C9: alerta e informa, nunca bloquea).
// -----------------------------------------------------------------------------
function resultadoPadronNoConfigurado(
  rfc: string,
  consultadoEn: string,
): ResultadoFuente {
  const fuente = "PADRON" as const;
  const resultado: ResultadoVerificacion = "NO_DISPONIBLE";
  return {
    fuente,
    resultado,
    detalle:
      "Padrón de Importadores: fuente no configurada; verificación manual " +
      "requerida (Módulo 2.1).",
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
 * sincronizadas vía /api/admin/listados). SANCIONES_INT (Inc 12) se resuelve
 * contra la última lista internacional ingresada manualmente: RFC exacto →
 * mapeo normal; nombre normalizado → SIEMPRE ALERTA con revisión humana.
 * OPINION_32D y CSD_17H siguen NO_DISPONIBLE hasta su integración (e.firma).
 * PADRON (Inc 56) es NO_DISPONIBLE con verificación manual requerida mientras
 * no haya listado/fuente de padrón configurada.
 *
 * C9: el resultado NUNCA bloquea; solo marca y registra para que el
 * responsable decida.
 *
 * @param db - `PrismaClient` o `Prisma.TransactionClient` con acceso a los modelos globales.
 * @param entrada - `{ rfc, razonSocial? }` del cliente/proveedor (la razón
 *   social solo alimenta el match heurístico por nombre de SANCIONES_INT).
 * @param ahora - Momento de consulta (inyectable para pruebas). Por defecto `new Date()`.
 */
export async function verificarCumplimiento(
  db: DbVerificacion,
  entrada: EntradaVerificacion,
  ahora: Date = new Date(),
): Promise<ResultadoFuente[]> {
  const rfc = entrada.rfc.trim().toUpperCase();
  const consultadoEn = ahora.toISOString();

  const razonSocial =
    typeof entrada.razonSocial === "string" && entrada.razonSocial.trim() !== ""
      ? entrada.razonSocial.trim()
      : undefined;

  const resultados: ResultadoFuente[] = [];
  for (const fuente of FUENTES_VERIFICACION) {
    if (fuente === "SANCIONES_INT") {
      resultados.push(
        await verificarSancionesInternacionales(db, rfc, razonSocial, consultadoEn),
      );
    } else if (fuente === "PADRON") {
      // [Inc 56] Padrón de Importadores: sin fuente configurada todavía →
      // NO_DISPONIBLE con requisito visible de verificación manual (C9).
      resultados.push(resultadoPadronNoConfigurado(rfc, consultadoEn));
    } else if (esFuenteListado(fuente)) {
      resultados.push(await verificarContraListado(db, fuente, rfc, consultadoEn));
    } else {
      resultados.push(resultadoNoIntegrado(fuente, rfc, consultadoEn));
    }
  }
  return resultados;
}
