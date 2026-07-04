// CERBERUS COMERCIO EXTERIOR — derivación de saldos IMMEX desde movimientos. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/derivar-saldos.ts  (Incremento 61 — Carril A)
// Propósito: Lógica PURA (sin I/O ni Prisma) que reconstruye la proyección de
//            saldos del libro de cotejo IMMEX a partir de los movimientos:
//            - derivarSaldos: una fila SaldoDerivado por ENTRADA (patrón
//              SaldoImmex del conector ERP), descargos aplicados vía
//              entradaOrigenId, saldo nunca negativo.
//            - totalNoRetornado: clasifica los saldos pendientes con
//              clasificarVigencia (VENCIDO / POR_VENCER) para el vigía (C9).
// =============================================================================

import { clasificarVigencia } from "@/lib/vigencias";
import type { MovimientoLite, SaldoDerivado } from "./tipos";

/**
 * Deriva la proyección de saldos: cada ENTRADA es una fila. La cantidad
 * descargada es la suma de los DESCARGO cuyo `entradaOrigenId` apunta a esa
 * entrada; el saldo pendiente nunca baja de 0.
 *
 * `incluirSaldadas` (default true = incluye todo): con false se EXCLUYEN las
 * entradas ya saldadas (saldo 0 con descargo completo).
 */
export function derivarSaldos(
  movimientos: MovimientoLite[],
  incluirSaldadas = true,
): SaldoDerivado[] {
  // Suma de descargos por entrada de origen.
  const descargadoPorEntrada = new Map<string, number>();
  for (const mov of movimientos) {
    if (mov.tipo === "DESCARGO" && mov.entradaOrigenId !== null) {
      const previo = descargadoPorEntrada.get(mov.entradaOrigenId) ?? 0;
      descargadoPorEntrada.set(mov.entradaOrigenId, previo + mov.cantidad);
    }
  }

  const saldos: SaldoDerivado[] = [];
  for (const mov of movimientos) {
    if (mov.tipo !== "ENTRADA") continue;
    const cantidadDescargada = descargadoPorEntrada.get(mov.id) ?? 0;
    const saldoPendiente = Math.max(0, mov.cantidad - cantidadDescargada);
    if (!incluirSaldadas && saldoPendiente === 0 && cantidadDescargada >= mov.cantidad) {
      continue; // Ya saldada: se omite solo si el consumidor lo pidió.
    }
    saldos.push({
      fraccion: mov.fraccion ?? "",
      descripcion: mov.descripcion ?? "",
      pedimentoImportacion: mov.pedimentoNumero ?? "",
      cantidadImportada: mov.cantidad,
      cantidadDescargada,
      saldoPendiente,
      fechaLimiteRetorno: mov.fechaLimiteRetorno ?? "",
    });
  }
  return saldos;
}

/**
 * Clasifica los saldos con pendiente > 0 según su fecha límite de retorno:
 * `vencidos` (plazo ya excedido) y `porVencer` (dentro de la ventana de aviso
 * de clasificarVigencia). C9: material para ALERTAR, nunca para bloquear.
 */
export function totalNoRetornado(
  saldos: SaldoDerivado[],
  ahora: Date,
): { vencidos: SaldoDerivado[]; porVencer: SaldoDerivado[] } {
  const vencidos: SaldoDerivado[] = [];
  const porVencer: SaldoDerivado[] = [];
  for (const saldo of saldos) {
    if (saldo.saldoPendiente <= 0) continue;
    const { estado } = clasificarVigencia(new Date(saldo.fechaLimiteRetorno), ahora);
    if (estado === "VENCIDO") vencidos.push(saldo);
    else if (estado === "POR_VENCER") porVencer.push(saldo);
  }
  return { vencidos, porVencer };
}
