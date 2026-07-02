// CERBERUS COMERCIO EXTERIOR — métricas ejecutivas (agregaciones RLS). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/metricas-ejecutivas.ts
// Propósito: Calcular, SOLO LECTURA, los indicadores clave de cumplimiento y
//            operación del tenant para el tablero ejecutivo (/tablero-ejecutivo).
//
// IMPORTANTE (RLS): TODAS las agregaciones de aquí corren sobre el
// `Prisma.TransactionClient` que recibe `calcularMetricas`. Ese `tx` YA trae
// fijado `app.tenant_id` (lo inyecta withTenantFromSession → withTenant vía
// SET LOCAL), de modo que la seguridad a nivel de fila (RLS) de PostgreSQL
// filtra CADA count/groupBy por el tenant del JWT verificado. Este módulo NO
// recibe ni acepta tenantId por parámetro: el aislamiento es estructural.
//
// DECISIÓN C9 — las métricas son INFORMATIVAS: el sistema alerta, no bloquea.
// Ningún indicador impide operación alguna; solo agrega el estado para decidir.
// =============================================================================

import type { Prisma } from "@prisma/client";

// -----------------------------------------------------------------------------
// Tipos exportados (contrato entre esta lib y la página del tablero).
// -----------------------------------------------------------------------------

/** Par etiqueta→total para una distribución (enum en string + conteo plano). */
export interface DistribucionFila {
  /** Valor del enum agrupado, ya convertido a string plano. */
  readonly clave: string;
  /** Conteo de filas para esa clave (número plano, no el _count de Prisma). */
  readonly total: number;
}

/** Distribución de clientes por etapa del art. 69-B CFF. */
export interface EtapaFila {
  readonly etapa: string;
  readonly total: number;
}

/** Distribución de operaciones por estado del despacho. */
export interface EstadoOperacionFila {
  readonly estado: string;
  readonly total: number;
}

/** Distribución de CFDI por estado del ciclo de vida. */
export interface EstadoCfdiFila {
  readonly estado: string;
  readonly total: number;
}

/** Objeto agregado completo que consume el tablero ejecutivo. */
export interface MetricasEjecutivas {
  // --- Clientes ---
  readonly totalClientes: number;
  readonly clientesPorEtapa69b: ReadonlyArray<EtapaFila>;
  /** Clientes cuyo CSD NO está ACTIVO (RESTRINGIDO o CANCELADO). */
  readonly clientesConCsdNoActivo: number;

  // --- Operaciones ---
  readonly totalOperaciones: number;
  readonly operacionesPorEstado: ReadonlyArray<EstadoOperacionFila>;
  /** Operaciones en ROJO o INCIDENCIA (foco operativo). */
  readonly operacionesRojo: number;

  // --- Cumplimiento ---
  /** Verificaciones con resultado adverso (ALERTA / INHABILITADO_*). */
  readonly verificacionesAdversas: number;
  readonly totalOverrides: number;
  readonly overridesSinFirma: number;
  readonly alertasVigia: number;

  // --- CFDI ---
  readonly cfdiPorEstado: ReadonlyArray<EstadoCfdiFila>;

  // --- Expedientes / documentos ---
  readonly dossieresGenerados: number;
}

// -----------------------------------------------------------------------------
// Helper: convierte el resultado de un groupBy de Prisma (enum en el campo
// agrupado + { _count: { _all } }) en filas planas { clave, total }. Se pasa el
// nombre del campo agrupado para leerlo de cada fila sin usar `any`.
// -----------------------------------------------------------------------------
function aDistribucion<K extends string>(
  filas: ReadonlyArray<Record<K, unknown> & { _count: { _all: number } }>,
  campo: K
): DistribucionFila[] {
  return filas.map((fila) => ({
    // Los enums de Prisma llegan como strings; String() los normaliza a texto plano.
    clave: String(fila[campo]),
    total: Number(fila._count._all),
  }));
}

// -----------------------------------------------------------------------------
// calcularMetricas: ejecuta todas las agregaciones tenant-scoped bajo RLS.
// Se lanzan en paralelo (Promise.all) porque son lecturas independientes dentro
// de la MISMA transacción/contexto de tenant.
// -----------------------------------------------------------------------------
export async function calcularMetricas(
  tx: Prisma.TransactionClient
): Promise<MetricasEjecutivas> {
  const [
    totalClientes,
    clientesPorEtapaRaw,
    clientesConCsdNoActivo,
    totalOperaciones,
    operacionesPorEstadoRaw,
    operacionesRojo,
    verificacionesAdversas,
    totalOverrides,
    overridesSinFirma,
    cfdiPorEstadoRaw,
    alertasVigia,
    dossieresGenerados,
  ] = await Promise.all([
    // --- Clientes ---
    tx.cliente.count(),
    tx.cliente.groupBy({ by: ["etapa69b"], _count: { _all: true } }),
    tx.cliente.count({ where: { estadoCsd: { not: "ACTIVO" } } }),

    // --- Operaciones ---
    tx.operacion.count(),
    tx.operacion.groupBy({ by: ["estado"], _count: { _all: true } }),
    tx.operacion.count({ where: { estado: { in: ["ROJO", "INCIDENCIA"] } } }),

    // --- Cumplimiento ---
    tx.verificacionCumplimiento.count({
      where: {
        resultado: {
          in: ["ALERTA", "INHABILITADO_PRESUNTO", "INHABILITADO_DEFINITIVO"],
        },
      },
    }),
    tx.overrideAlerta.count(),
    tx.overrideAlerta.count({ where: { estadoFirma: "SIN_FIRMA" } }),

    // --- CFDI ---
    tx.comprobanteCfdi.groupBy({ by: ["estado"], _count: { _all: true } }),

    // --- Bitácora / documentos ---
    tx.bitacoraAuditoria.count({ where: { accion: "VIGIA_ALERTA" } }),
    tx.documento.count({ where: { tipo: "DOSSIER_DILIGENCIA" } }),
  ]);

  const clientesPorEtapa69b: EtapaFila[] = aDistribucion(
    clientesPorEtapaRaw,
    "etapa69b"
  ).map((fila) => ({ etapa: fila.clave, total: fila.total }));

  const operacionesPorEstado: EstadoOperacionFila[] = aDistribucion(
    operacionesPorEstadoRaw,
    "estado"
  ).map((fila) => ({ estado: fila.clave, total: fila.total }));

  const cfdiPorEstado: EstadoCfdiFila[] = aDistribucion(
    cfdiPorEstadoRaw,
    "estado"
  ).map((fila) => ({ estado: fila.clave, total: fila.total }));

  return {
    totalClientes,
    clientesPorEtapa69b,
    clientesConCsdNoActivo,
    totalOperaciones,
    operacionesPorEstado,
    operacionesRojo,
    verificacionesAdversas,
    totalOverrides,
    overridesSinFirma,
    alertasVigia,
    cfdiPorEstado,
    dossieresGenerados,
  };
}
