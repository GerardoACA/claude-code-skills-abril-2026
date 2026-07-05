// CERBERUS COMERCIO EXTERIOR — prevalidador interno del pedimento (motor puro). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/prevalidador.ts  (Incremento 63)
// Propósito: Motor PURO (sin I/O, testeable) que aplica al pedimento los cuatro
//            criterios de la prevalidación (Reglamento LA, DOF 23-feb-2026):
//            SINTÁCTICO (formatos), CATALÓGICO (claves contra catálogos),
//            ESTRUCTURAL (consistencia interna: totales = suma de partidas) y
//            NORMATIVO (encargo conferido vigente, opinión 32-D).
//
// C9: el prevalidador INFORMA hallazgos, NUNCA bloquea. `aprobado` es solo un
// veredicto informativo (sin ERRORes); la decisión de transmitir es del agente
// aduanal. NO sustituye al prevalidador autorizado: detecta hallazgos ANTES de
// transmitir para evitar rechazos. Reutiliza los validadores existentes
// (pedimento-validacion.ts, clasificador-arancel.ts) y el cálculo determinista
// de contribuciones (contribuciones.ts). Jamás inventa reglas: lo no cubierto
// queda "a confirmar por abogado".
// =============================================================================

import {
  esNumeroPedimentoValido,
  esClaveAduanaValida,
} from "@/lib/pedimento-validacion";
import { esFraccionValida } from "@/lib/clasificador-arancel";
import {
  calcularContribucionesPartida,
  agregarPedimento,
  type ContribucionesPartida,
} from "@/lib/contribuciones";

// -----------------------------------------------------------------------------
// Contratos
// -----------------------------------------------------------------------------

/** Un hallazgo de la prevalidación interna (informativo; C9: nunca bloquea). */
export interface HallazgoPrevalidacion {
  criterio: "SINTACTICO" | "CATALOGICO" | "ESTRUCTURAL" | "NORMATIVO";
  severidad: "ERROR" | "ADVERTENCIA";
  /** Código estable del check (p. ej. "SIN-001") para seguimiento y pruebas. */
  codigo: string;
  /** Mensaje en español, accionable para el capturista/agente. */
  mensaje: string;
}

/** Encabezado y totales del pedimento a prevalidar (números ya en MXN). */
export interface PedimentoPrevalidacion {
  /** Número de pedimento (15 dígitos, Anexo 22); null si aún no se asigna. */
  numero: string | null;
  /** Clave de aduana/sección (3 dígitos, Anexo 22); null si aún no se asigna. */
  aduana: string | null;
  /** Clave de pedimento (p. ej. "A1"). */
  claveDePedimento: string;
  /** Régimen aduanero declarado. */
  regimen: string;
  /** Tipo de cambio MXN/USD aplicado. */
  tipoCambioUsd: number;
  valorAduanaTotal: number;
  igiTotal: number;
  dtaTotal: number;
  iepsTotal: number;
  ivaTotal: number;
  contribucionesTotal: number;
}

/** Partida a prevalidar (valores en MXN; null = no capturado). */
export interface PartidaPrevalidacion {
  fraccionDeclarada: string | null;
  valorDeclarado: number | null;
  valorAduana: number | null;
  tasaIgiPct: number | null;
  tasaIepsPct: number | null;
  igiImporte: number | null;
  dtaImporte: number | null;
  iepsImporte: number | null;
  ivaImporte: number | null;
}

/** Entrada completa del prevalidador interno. */
export interface DatosPrevalidacion {
  pedimento: PedimentoPrevalidacion;
  partidas: PartidaPrevalidacion[];
  cliente: {
    rfc: string;
  };
  /** ¿Existe encargo conferido (B14/B21) VIGENTE del cliente al agente? */
  encargoVigente: boolean;
  /** ¿La última opinión 32-D del cliente es POSITIVA y reciente (< 30 días)? */
  opinionPositivaReciente: boolean;
}

/** Resultado de la prevalidación interna. */
export interface ResultadoPrevalidacion {
  hallazgos: HallazgoPrevalidacion[];
  /** true si NO hay hallazgos de severidad ERROR (las advertencias no restan). */
  aprobado: boolean;
}

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

/** Tolerancia del cuadre estructural: ±1 peso por redondeo de centavos. */
export const TOLERANCIA_CUADRE_MXN = 1.0;

/** RFC mexicano: 12 (moral) o 13 (física) caracteres alfanuméricos (incl. Ñ y &). */
const RFC_REGEX = /^[A-ZÑ&0-9]{12,13}$/;

/** Clave de pedimento del Apéndice 2 del Anexo 22: 1-2 caracteres alfanuméricos. */
const CLAVE_PEDIMENTO_REGEX = /^[A-Z0-9]{1,2}$/;

// -----------------------------------------------------------------------------
// Checks por criterio
// -----------------------------------------------------------------------------

/** SINTÁCTICO: formatos del encabezado (número, aduana, RFC, tipo de cambio). */
function checksSintacticos(d: DatosPrevalidacion): HallazgoPrevalidacion[] {
  const h: HallazgoPrevalidacion[] = [];
  const { pedimento, cliente } = d;

  // SIN-001: número de pedimento (si ya se asignó) = 15 dígitos.
  if (pedimento.numero !== null && !esNumeroPedimentoValido(pedimento.numero)) {
    h.push({
      criterio: "SINTACTICO",
      severidad: "ERROR",
      codigo: "SIN-001",
      mensaje: `El número de pedimento "${pedimento.numero}" no tiene 15 dígitos (formato Anexo 22): corrígelo antes de transmitir.`,
    });
  }

  // SIN-002: clave de aduana/sección (si ya se asignó) = 3 dígitos.
  if (pedimento.aduana !== null && !esClaveAduanaValida(pedimento.aduana)) {
    h.push({
      criterio: "SINTACTICO",
      severidad: "ERROR",
      codigo: "SIN-002",
      mensaje: `La clave de aduana "${pedimento.aduana}" no son 3 dígitos (p. ej. "240" Nuevo Laredo): captura la clave de la sección de despacho.`,
    });
  }

  // SIN-003: RFC del importador/exportador con formato (12-13 alfanuméricos).
  const rfc = cliente.rfc.trim().toUpperCase();
  if (!RFC_REGEX.test(rfc)) {
    h.push({
      criterio: "SINTACTICO",
      severidad: "ERROR",
      codigo: "SIN-003",
      mensaje: `El RFC del cliente "${cliente.rfc}" no tiene formato válido (12-13 caracteres alfanuméricos): corrige el RFC en el expediente del cliente.`,
    });
  }

  // SIN-004: tipo de cambio > 0.
  if (!Number.isFinite(pedimento.tipoCambioUsd) || pedimento.tipoCambioUsd <= 0) {
    h.push({
      criterio: "SINTACTICO",
      severidad: "ERROR",
      codigo: "SIN-004",
      mensaje:
        "El tipo de cambio del pedimento debe ser mayor a 0 (MXN por USD, DOF del día hábil anterior): captura el tipo de cambio aplicado.",
    });
  }

  return h;
}

/** CATALÓGICO: claves contra catálogos (fracciones TIGIE, clave de pedimento). */
function checksCatalogicos(d: DatosPrevalidacion): HallazgoPrevalidacion[] {
  const h: HallazgoPrevalidacion[] = [];

  // CAT-001: cada fracción declarada debe ser de 8 dígitos (TIGIE).
  d.partidas.forEach((p, i) => {
    if (p.fraccionDeclarada !== null && !esFraccionValida(p.fraccionDeclarada)) {
      h.push({
        criterio: "CATALOGICO",
        severidad: "ERROR",
        codigo: "CAT-001",
        mensaje: `La fracción "${p.fraccionDeclarada}" de la partida ${i + 1} no son 8 dígitos (TIGIE): corrige la fracción arancelaria declarada.`,
      });
    }
  });

  // CAT-002: clave de pedimento no vacía, 1-2 alfanuméricos (Apéndice 2 Anexo 22).
  const clave = d.pedimento.claveDePedimento.trim().toUpperCase();
  if (!CLAVE_PEDIMENTO_REGEX.test(clave)) {
    h.push({
      criterio: "CATALOGICO",
      severidad: "ERROR",
      codigo: "CAT-002",
      mensaje: `La clave de pedimento "${d.pedimento.claveDePedimento}" no es válida (1-2 caracteres alfanuméricos, p. ej. "A1" importación definitiva): captura la clave del Apéndice 2 del Anexo 22.`,
    });
  }

  return h;
}

/** Compara un total declarado contra el recalculado con tolerancia ±1 peso. */
function descuadre(declarado: number, recalculado: number): number | null {
  const dif = declarado - recalculado;
  return Math.abs(dif) <= TOLERANCIA_CUADRE_MXN ? null : dif;
}

/** ESTRUCTURAL: consistencia interna — totales del pedimento = suma de partidas. */
function checksEstructurales(d: DatosPrevalidacion): HallazgoPrevalidacion[] {
  const h: HallazgoPrevalidacion[] = [];

  // EST-001: al menos una partida (un pedimento sin mercancías no es transmisible).
  if (d.partidas.length === 0) {
    h.push({
      criterio: "ESTRUCTURAL",
      severidad: "ERROR",
      codigo: "EST-001",
      mensaje:
        "El pedimento no tiene partidas: captura al menos una mercancía antes de transmitir.",
    });
    return h;
  }

  // EST-002: partidas sin valoración impiden verificar el cuadre (se avisa y
  //          NO se recalcula con datos inventados).
  const sinValoracion = d.partidas.filter(
    (p) => p.valorAduana === null || p.tasaIgiPct === null,
  ).length;
  if (sinValoracion > 0) {
    h.push({
      criterio: "ESTRUCTURAL",
      severidad: "ADVERTENCIA",
      codigo: "EST-002",
      mensaje: `${sinValoracion} partida(s) sin valor en aduana o sin tasa de IGI: no se pudo verificar el cuadre de totales; completa la valoración de las partidas.`,
    });
    return h;
  }

  // EST-003..: recalcular contribuciones por partida (cálculo determinista de
  // contribuciones.ts; si la partida trae DTA fijo capturado, se respeta como
  // cuota) y comparar los TOTALES del pedimento con tolerancia ±1 peso.
  let calculadas: ContribucionesPartida[];
  try {
    calculadas = d.partidas.map((p) =>
      calcularContribucionesPartida({
        valorAduana: p.valorAduana as number,
        tasaIgiPct: p.tasaIgiPct as number,
        tasaIepsPct: p.tasaIepsPct ?? 0,
        dtaFijo: p.dtaImporte ?? undefined,
      }),
    );
  } catch {
    h.push({
      criterio: "ESTRUCTURAL",
      severidad: "ERROR",
      codigo: "EST-003",
      mensaje:
        "Alguna partida tiene valores negativos o no numéricos: revisa el valor en aduana y las tasas capturadas.",
    });
    return h;
  }

  const totales = agregarPedimento(calculadas);
  const comparaciones: readonly {
    codigo: string;
    concepto: string;
    declarado: number;
    recalculado: number;
  }[] = [
    {
      codigo: "EST-004",
      concepto: "valor en aduana total",
      declarado: d.pedimento.valorAduanaTotal,
      recalculado: totales.valorAduanaTotal,
    },
    {
      codigo: "EST-005",
      concepto: "IGI total",
      declarado: d.pedimento.igiTotal,
      recalculado: totales.igiTotal,
    },
    {
      codigo: "EST-006",
      concepto: "DTA total",
      declarado: d.pedimento.dtaTotal,
      recalculado: totales.dtaTotal,
    },
    {
      codigo: "EST-007",
      concepto: "IEPS total",
      declarado: d.pedimento.iepsTotal,
      recalculado: totales.iepsTotal,
    },
    {
      codigo: "EST-008",
      concepto: "IVA total",
      declarado: d.pedimento.ivaTotal,
      recalculado: totales.ivaTotal,
    },
  ];

  for (const c of comparaciones) {
    if (descuadre(c.declarado, c.recalculado) !== null) {
      h.push({
        criterio: "ESTRUCTURAL",
        severidad: "ERROR",
        codigo: c.codigo,
        mensaje: `El ${c.concepto} del pedimento ($${c.declarado.toFixed(2)}) no cuadra con la suma de partidas recalculada ($${c.recalculado.toFixed(2)}; tolerancia ±$${TOLERANCIA_CUADRE_MXN.toFixed(2)}): recalcula el pedimento o corrige las partidas.`,
      });
    }
  }

  return h;
}

/** NORMATIVO: requisitos de la materia aduanera (encargo conferido, 32-D). */
function checksNormativos(d: DatosPrevalidacion): HallazgoPrevalidacion[] {
  const h: HallazgoPrevalidacion[] = [];

  // NOR-001: encargo conferido (B14/B21) vigente — sin él el agente no puede
  //          promover el despacho a nombre del cliente (art. 59-III LA).
  if (!d.encargoVigente) {
    h.push({
      criterio: "NORMATIVO",
      severidad: "ERROR",
      codigo: "NOR-001",
      mensaje:
        "El cliente no tiene encargo conferido vigente B14/B21: registra o renueva el encargo antes de transmitir el pedimento.",
    });
  }

  // NOR-002: opinión 32-D positiva reciente (< 30 días). ADVERTENCIA: es
  //          higiene de cumplimiento, no impide la transmisión (C9).
  if (!d.opinionPositivaReciente) {
    h.push({
      criterio: "NORMATIVO",
      severidad: "ADVERTENCIA",
      codigo: "NOR-002",
      mensaje:
        "El cliente no tiene opinión de cumplimiento 32-D POSITIVA reciente (menos de 30 días): solicita e ingesta una opinión actualizada.",
    });
  }

  return h;
}

// -----------------------------------------------------------------------------
// Motor
// -----------------------------------------------------------------------------

/**
 * Prevalida el pedimento aplicando los cuatro criterios en orden. `aprobado`
 * es true si no hay hallazgos de severidad ERROR (las ADVERTENCIAs informan
 * sin reprobar). C9: el resultado ALERTA, jamás bloquea la operación.
 */
export function prevalidarPedimento(
  datos: DatosPrevalidacion,
): ResultadoPrevalidacion {
  const hallazgos: HallazgoPrevalidacion[] = [
    ...checksSintacticos(datos),
    ...checksCatalogicos(datos),
    ...checksEstructurales(datos),
    ...checksNormativos(datos),
  ];
  const aprobado = hallazgos.every((h) => h.severidad !== "ERROR");
  return { hallazgos, aprobado };
}
