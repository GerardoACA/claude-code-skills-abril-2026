// CERBERUS COMERCIO EXTERIOR — reporte mensual de descargos IMMEX (Anexo 30 MVP). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/reporte-mensual.ts  (Incremento 64)
// Propósito: Lógica PURA (sin Prisma, sin IO) del reporte mensual de descargos
//            del libro de cotejo IMMEX — MVP tabular del Anexo 30 (R7 del
//            dictamen dictamen-immex-anexos-24-30-31.md). El formato/layout
//            OFICIAL del Anexo 30 está A CONFIRMAR por abogado; por eso este
//            módulo solo compone las filas DESCARGO del periodo y las exporta
//            a CSV tabular. Consumido por la ruta
//            /api/clientes/[id]/immex/reporte (que sella el CSV y bitacoriza)
//            y probado en tests/immex-reporte.test.ts.
// =============================================================================

/** Vista mínima de un movimiento persistido para componer el reporte (incluye
 *  descripción/fracción/unidad del material al que pertenece). */
export interface MovimientoLiteReporte {
  tipo: "ENTRADA" | "DESCARGO" | "AJUSTE";
  cantidad: number;
  /** ISO 8601 (fecha de registro en el libro; define el periodo del reporte). */
  registradoEn: string;
  pedimentoNumero: string | null;
  clavePedimento: string | null;
  /** PEPS (R4): entrada de la que consumió saldo este descargo (si se aplicó). */
  entradaOrigenId: string | null;
  descripcion: string;
  fraccion: string;
  unidadMedida: string;
}

/** Fila del reporte mensual de descargos (MVP tabular del Anexo 30). */
export interface FilaReporteMensual {
  /** Fecha del descargo (aaaa-mm-dd, UTC). */
  fecha: string;
  fraccion: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  pedimentoDescargo: string;
  clavePedimento: string;
  entradaOrigen: string;
}

/** Resultado de componer el reporte de un periodo. */
export interface ReporteMensual {
  filas: FilaReporteMensual[];
  totalCantidad: number;
  /** Periodo "YYYY-MM". */
  periodo: string;
}

/**
 * Compone el reporte mensual de descargos: filtra los movimientos DESCARGO
 * cuyo `registradoEn` cae dentro del mes pedido (límites en UTC: entra el día
 * 1 a las 00:00:00 y sale el día 1 del mes siguiente, exclusivo) y los ordena
 * por fecha ascendente.
 *
 * @param movimientos Movimientos del libro de cotejo (cualquier tipo; se filtra aquí).
 * @param anio        Año calendario (p. ej. 2026).
 * @param mes         Mes 1-12.
 */
export function componerReporteMensual(
  movimientos: MovimientoLiteReporte[],
  anio: number,
  mes: number,
): ReporteMensual {
  const inicioMs = Date.UTC(anio, mes - 1, 1);
  const finMs = Date.UTC(anio, mes, 1); // exclusivo: primer instante del mes siguiente

  const filas: FilaReporteMensual[] = movimientos
    .filter((m) => {
      if (m.tipo !== "DESCARGO") return false;
      const t = Date.parse(m.registradoEn);
      return !Number.isNaN(t) && t >= inicioMs && t < finMs;
    })
    .sort((a, b) => Date.parse(a.registradoEn) - Date.parse(b.registradoEn))
    .map((m) => ({
      fecha: new Date(m.registradoEn).toISOString().slice(0, 10),
      fraccion: m.fraccion,
      descripcion: m.descripcion,
      cantidad: m.cantidad,
      unidadMedida: m.unidadMedida,
      pedimentoDescargo: m.pedimentoNumero ?? "",
      clavePedimento: m.clavePedimento ?? "",
      entradaOrigen: m.entradaOrigenId ?? "",
    }));

  const totalCantidad = filas.reduce((suma, f) => suma + f.cantidad, 0);
  const periodo = `${anio}-${String(mes).padStart(2, "0")}`;

  return { filas, totalCantidad, periodo };
}

/** Encabezados del CSV (en español; columnas del MVP tabular del Anexo 30). */
export const ENCABEZADOS_REPORTE_CSV = [
  "Fecha",
  "Fracción",
  "Descripción",
  "Cantidad",
  "Unidad de medida",
  "Pedimento de descargo",
  "Clave de pedimento",
  "Entrada de origen",
] as const;

/** Escapa un valor CSV: comillas dobles si trae coma, comilla o salto de línea. */
function escaparCsv(valor: string): string {
  if (/[",\n\r]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/**
 * Serializa el reporte a CSV (separador coma, encabezados en español y línea
 * final de total). Un mes sin descargos produce un CSV válido con solo el
 * encabezado y el total en 0.
 */
export function reporteACsv(
  filas: FilaReporteMensual[],
  totalCantidad: number,
  periodo: string,
): string {
  const lineas: string[] = [ENCABEZADOS_REPORTE_CSV.join(",")];

  for (const f of filas) {
    lineas.push(
      [
        f.fecha,
        f.fraccion,
        f.descripcion,
        String(f.cantidad),
        f.unidadMedida,
        f.pedimentoDescargo,
        f.clavePedimento,
        f.entradaOrigen,
      ]
        .map(escaparCsv)
        .join(","),
    );
  }

  // Línea final de total: total del periodo en la columna Cantidad.
  lineas.push(
    [escaparCsv(`TOTAL ${periodo}`), "", "", String(totalCantidad), "", "", "", ""].join(","),
  );

  return lineas.join("\n") + "\n";
}
// =============================================================================
// FIN reporte-mensual.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
