// CERBERUS COMERCIO EXTERIOR — Padrón de Importadores por ingesta manual. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/padron-importadores.ts
// Propósito (Incremento 58): Lógica PURA (sin DB, sin red) del Padrón de
//   Importadores / Sectores Específicos (requisito del dictamen aduanal,
//   Módulo 2.1 del despacho):
//
//   1. `parsearCsvPadron` — parser del CSV de ingesta manual con columnas
//      `rfc,estado` (estado ∈ ACTIVO | SUSPENDIDO; tolerante a mayúsculas/
//      minúsculas, acentos y espacios). El SAT NO publica un CSV público del
//      padrón: el despacho baja/recibe el estado y lo carga manualmente, igual
//      que las sanciones internacionales. A diferencia del parser de listados
//      SAT (que descarta filas inválidas en silencio), aquí una fila con RFC
//      o estado inválido es ERROR DE FILA (`ErrorFilaPadron`): el archivo lo
//      construye el propio despacho y un error debe corregirse, no ocultarse.
//
//   2. `evaluarPadron` — mapeo estado → ResultadoVerificacion:
//        ACTIVO               → AL_CORRIENTE
//        SUSPENDIDO           → INHABILITADO_PRESUNTO
//        hallado, otro texto  → ALERTA (estado no reconocido: revisión humana)
//        AUSENTE del listado  → ALERTA "no localizado — verificar manualmente"
//                               (el listado cargado puede ser PARCIAL; C9)
//        SIN listado cargado  → NO_DISPONIBLE (verificación manual requerida)
//
// Principio C9: el sistema ALERTA y registra; NUNCA bloquea. Incluso
// SUSPENDIDO/INHABILITADO_PRESUNTO es una alerta registrada, no un bloqueo.
// =============================================================================

import type { ResultadoVerificacion } from "@/lib/verificacion-cumplimiento";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Estados reconocidos del padrón (tras normalizar mayúsculas/acentos/espacios). */
export const ESTADOS_PADRON = ["ACTIVO", "SUSPENDIDO"] as const;

/** Estado normalizado de un RFC en el Padrón de Importadores. */
export type EstadoPadron = (typeof ESTADOS_PADRON)[number];

/** Fila parseada del CSV del padrón (rfc validado + estado normalizado). */
export interface FilaPadron {
  /** RFC normalizado (mayúsculas, sin espacios), 12-13 caracteres. */
  rfc: string;
  /** Estado normalizado: ACTIVO | SUSPENDIDO. */
  estado: EstadoPadron;
}

/** Error de UNA fila del CSV del padrón (RFC o estado inválidos), con su línea. */
export class ErrorFilaPadron extends Error {
  /** Número de línea (1-based) del archivo donde está la fila inválida. */
  readonly numeroLinea: number;

  constructor(numeroLinea: number, mensaje: string) {
    super(`Fila inválida en la línea ${numeroLinea} del CSV del padrón: ${mensaje}`);
    this.name = "ErrorFilaPadron";
    this.numeroLinea = numeroLinea;
  }
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/** RFC válido: 12 (moral) o 13 (física) caracteres alfanuméricos, con Ñ y &. */
const RFC_REGEX = /^[A-ZÑ&0-9]{12,13}$/;

/** Mayúsculas, sin acentos ni espacios sobrantes (tolerancia de captura). */
function normalizarCampo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Normaliza un texto de estado a `EstadoPadron`, o null si no es reconocible.
 * Tolerante a mayúsculas/minúsculas, acentos y espacios ("  activo " → ACTIVO).
 */
export function normalizarEstadoPadron(texto: string | null): EstadoPadron | null {
  if (texto === null) return null;
  const normalizado = normalizarCampo(texto);
  return (ESTADOS_PADRON as readonly string[]).includes(normalizado)
    ? (normalizado as EstadoPadron)
    : null;
}

// ---------------------------------------------------------------------------
// Parser del CSV del padrón (columnas rfc,estado)
// ---------------------------------------------------------------------------

/** Quita comillas envolventes de un campo CSV simple ("X" → X). */
function sinComillas(campo: string): string {
  const recortado = campo.trim();
  if (recortado.length >= 2 && recortado.startsWith('"') && recortado.endsWith('"')) {
    return recortado.slice(1, -1).replace(/""/g, '"').trim();
  }
  return recortado;
}

/**
 * Parsea el CSV de ingesta manual del Padrón de Importadores.
 *
 * Formato esperado: encabezado con columnas `rfc` y `estado` (tolerante a
 * mayúsculas/acentos/espacios; el encabezado puede ir precedido de líneas de
 * preámbulo) y filas `RFC,ACTIVO|SUSPENDIDO`. Líneas vacías se ignoran.
 *
 * A diferencia de los listados públicos del SAT, este archivo lo prepara el
 * PROPIO despacho ⇒ toda fila de datos con RFC inválido (no 12-13
 * alfanuméricos) o estado no reconocido lanza `ErrorFilaPadron` con el número
 * de línea, para que el capturista lo corrija antes de sellar la ingesta.
 *
 * Lanza `Error` si no se encuentra un encabezado con ambas columnas.
 */
export function parsearCsvPadron(texto: string): FilaPadron[] {
  // Tolerar BOM UTF-8 al inicio del archivo.
  const contenido = texto.startsWith("\uFEFF") ? texto.slice(1) : texto;
  const lineas = contenido.split(/\r?\n/);

  let indiceRfc: number | null = null;
  let indiceEstado: number | null = null;
  let lineaEncabezado = -1;

  // 1) Buscar el encabezado: primera línea con columnas RFC y ESTADO.
  for (let i = 0; i < lineas.length; i++) {
    const campos = lineas[i].split(",").map((c) => normalizarCampo(sinComillas(c)));
    const rfc = campos.findIndex((c) => c.includes("RFC"));
    const estado = campos.findIndex((c) => c.includes("ESTADO"));
    if (rfc !== -1 && estado !== -1) {
      indiceRfc = rfc;
      indiceEstado = estado;
      lineaEncabezado = i;
      break;
    }
  }

  if (indiceRfc === null || indiceEstado === null) {
    throw new Error(
      "CSV del padrón sin encabezado reconocible: se esperan las columnas rfc,estado " +
        "(estado = ACTIVO | SUSPENDIDO).",
    );
  }

  // 2) Filas de datos: RFC válido + estado reconocido, o error de fila.
  const filas: FilaPadron[] = [];
  for (let i = lineaEncabezado + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.trim().length === 0) continue;

    const campos = linea.split(",").map(sinComillas);
    const numeroLinea = i + 1; // 1-based, para el mensaje de error.

    const rfcCrudo = campos[indiceRfc] ?? "";
    const rfc = normalizarCampo(rfcCrudo).replace(/\s+/g, "");
    if (!RFC_REGEX.test(rfc)) {
      throw new ErrorFilaPadron(
        numeroLinea,
        `RFC inválido "${rfcCrudo.trim()}" (se esperan 12-13 caracteres alfanuméricos).`,
      );
    }

    const estadoCrudo = campos[indiceEstado] ?? "";
    const estado = normalizarEstadoPadron(estadoCrudo);
    if (estado === null) {
      throw new ErrorFilaPadron(
        numeroLinea,
        `estado no reconocido "${estadoCrudo.trim()}" (se espera ACTIVO o SUSPENDIDO).`,
      );
    }

    filas.push({ rfc, estado });
  }

  return filas;
}

// ---------------------------------------------------------------------------
// Evaluación estado → ResultadoVerificacion (lógica pura, testeable)
// ---------------------------------------------------------------------------

/** Hallazgo del RFC en el padrón cargado (null = AUSENTE del listado). */
export interface HallazgoPadron {
  /** Texto de estado tal como quedó almacenado (se normaliza al evaluar). */
  estado: string | null;
}

/** Contexto de la última ingesta del padrón (null = SIN listado cargado). */
export interface IngestaPadron {
  /** Fecha ISO de la última ingesta manual del padrón. */
  fechaIngesta: string;
  /** Filas selladas en esa ingesta. */
  filas: number;
}

/** Resultado puro de la evaluación del padrón (sin snapshot ni fecha de consulta). */
export interface EvaluacionPadron {
  resultado: ResultadoVerificacion;
  detalle: string;
}

/**
 * Evalúa el RFC contra el padrón cargado por ingesta manual (Módulo 2.1).
 *
 *   - Sin listado cargado (`ingesta` null) → NO_DISPONIBLE con verificación
 *     manual requerida e instrucción de ingesta.
 *   - Hallado ACTIVO → AL_CORRIENTE.
 *   - Hallado SUSPENDIDO → INHABILITADO_PRESUNTO (C9: alerta registrada,
 *     nunca bloqueo).
 *   - Hallado con estado no reconocido → ALERTA (revisión humana).
 *   - AUSENTE del listado → ALERTA "no localizado — verificar manualmente":
 *     el listado cargado puede ser PARCIAL, la ausencia NO prueba suspensión
 *     (C9: alerta, no bloquea).
 */
export function evaluarPadron(
  rfc: string,
  hallazgo: HallazgoPadron | null,
  ingesta: IngestaPadron | null,
): EvaluacionPadron {
  const etiqueta = "Padrón de Importadores (Módulo 2.1)";

  if (ingesta === null) {
    return {
      resultado: "NO_DISPONIBLE",
      detalle:
        `${etiqueta}: sin listado de padrón cargado; verificación manual ` +
        `requerida para el RFC ${rfc}. El SAT no publica CSV público del ` +
        `padrón: ingesta manual disponible en Administración (/admin/listados).`,
    };
  }

  if (hallazgo === null) {
    return {
      resultado: "ALERTA",
      detalle:
        `${etiqueta}: RFC ${rfc} no localizado en el padrón cargado — ` +
        `verificar manualmente. El listado puede ser parcial; la ausencia no ` +
        `prueba suspensión (C9: alerta, no bloquea). Última ingesta manual: ` +
        `${ingesta.fechaIngesta} (${ingesta.filas} filas).`,
    };
  }

  const estado = normalizarEstadoPadron(hallazgo.estado);

  if (estado === "ACTIVO") {
    return {
      resultado: "AL_CORRIENTE",
      detalle:
        `${etiqueta}: RFC ${rfc} Activo en Padrón de Importadores ` +
        `(ingesta manual del ${ingesta.fechaIngesta}).`,
    };
  }

  if (estado === "SUSPENDIDO") {
    return {
      resultado: "INHABILITADO_PRESUNTO",
      detalle:
        `${etiqueta}: RFC ${rfc} SUSPENDIDO en el Padrón de Importadores ` +
        `(ingesta manual del ${ingesta.fechaIngesta}); requiere reactivación ` +
        `ante el SAT antes de operar. C9: el sistema alerta y registra, no bloquea.`,
    };
  }

  // Hallado pero con texto de estado no reconocido: revisión humana.
  const estadoTexto =
    hallazgo.estado !== null && hallazgo.estado.trim() !== ""
      ? `"${hallazgo.estado.trim()}"`
      : "sin texto de estado";
  return {
    resultado: "ALERTA",
    detalle:
      `${etiqueta}: RFC ${rfc} hallado en el padrón cargado con estado no ` +
      `reconocido (${estadoTexto}); requiere revisión humana. Última ingesta ` +
      `manual: ${ingesta.fechaIngesta}.`,
  };
}
