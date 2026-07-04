// CERBERUS COMERCIO EXTERIOR — persistencia de un movimiento IMMEX (cotejo). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/persistir-movimiento.ts  (Incremento 61 — carril B)
// Propósito: Lógica COMPARTIDA entre la ruta de movimientos unitarios
//            (api/clientes/[id]/immex/movimientos) y la de ingesta CSV
//            (api/clientes/[id]/immex/ingesta): dado un tx transaccional YA
//            dentro de withTenant* (RLS activa), asegura el InventarioImmex del
//            cliente, el MaterialImmex por (inventario, fracción, nico), crea
//            los MovimientoImmex SELLADOS (sha256 del payload canónico), aplica
//            PEPS en los descargos vía el motor del carril A, recalcula el
//            saldoActual del material (entradas − descargos), evalúa la regla
//            de 48h si aplica y registra el evento de bitácora encadenado
//            "IMMEX_MOVIMIENTO" con payloadRef JSON. C9: un descargo SIN saldo
//            suficiente se registra igual (faltante con entradaOrigenId null) y
//            se reporta — nunca se rechaza.
// =============================================================================

import type { Prisma } from "@prisma/client";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import { aplicarDescargoPeps, evaluarRegla48h } from "@/lib/immex/motor-peps";
import type {
  DescargoImmexInput,
  EntradaImmexInput,
  MovimientoLite,
  ResultadoRegla48h,
} from "@/lib/immex/tipos";

/**
 * Parámetros de `persistirMovimientoImmex` (unión discriminada por `tipo`).
 * tenantId/actor provienen SIEMPRE de la sesión verificada (jamás del request);
 * clienteId ya debe estar verificado contra el tenant por el caller (RLS).
 */
export type ParamsPersistirMovimiento =
  | {
      tenantId: string;
      clienteId: string;
      actor: string;
      tipo: "ENTRADA";
      entrada: EntradaImmexInput;
    }
  | {
      tenantId: string;
      clienteId: string;
      actor: string;
      tipo: "DESCARGO";
      descargo: DescargoImmexInput;
    };

/** Resultado de persistir un movimiento (o varios: un descargo PEPS crea 1..n). */
export interface ResultadoPersistirMovimiento {
  /** Ids de los MovimientoImmex creados (descargo PEPS: uno por consumo). */
  movimientoIds: string[];
  /** Cantidad del descargo que NO alcanzó saldo (C9: registrada, no rechazada). */
  faltante?: number;
  /** Evaluación de la regla de 48h si el movimiento trajo despachoConcluidoEn. */
  regla48h?: ResultadoRegla48h;
}

/**
 * Persiste un movimiento IMMEX dentro de la transacción `tx` (que DEBE venir de
 * withTenant/withTenantFromSession con la RLS ya fijada al tenant del JWT).
 *
 * Firma: persistirMovimientoImmex(tx, params) => Promise<ResultadoPersistirMovimiento>
 *  - tx:     Prisma.TransactionClient con app.tenant_id ya seteado (SET LOCAL).
 *  - params: ParamsPersistirMovimiento (unión discriminada ENTRADA/DESCARGO).
 */
export async function persistirMovimientoImmex(
  tx: Prisma.TransactionClient,
  params: ParamsPersistirMovimiento,
): Promise<ResultadoPersistirMovimiento> {
  const ts = new Date();
  const { tenantId, clienteId, actor } = params;

  // 1) Inventario del cliente (1:1): se crea al primer movimiento (upsert).
  const inventario = await tx.inventarioImmex.upsert({
    where: { clienteId },
    create: { tenantId, clienteId },
    update: {},
    select: { id: true },
  });

  // 2) Material por (inventario, fracción, nico). No se usa upsert compuesto
  //    porque `nico` es NULLable (Prisma no acepta null en whereUnique compuesto).
  const fraccion = params.tipo === "ENTRADA" ? params.entrada.fraccion : params.descargo.fraccion;
  const nico =
    (params.tipo === "ENTRADA" ? params.entrada.nico : params.descargo.nico) ?? null;

  let material = await tx.materialImmex.findFirst({
    where: { inventarioId: inventario.id, fraccion, nico },
    select: { id: true },
  });
  if (!material) {
    material = await tx.materialImmex.create({
      data: {
        tenantId,
        inventarioId: inventario.id,
        fraccion,
        nico,
        // Un descargo sin entrada previa igual se registra (C9): material
        // placeholder con datos mínimos; la ENTRADA trae los reales.
        descripcion:
          params.tipo === "ENTRADA"
            ? params.entrada.descripcion
            : "(descargo sin entrada previa)",
        unidadMedida: params.tipo === "ENTRADA" ? params.entrada.unidadMedida : "N/D",
      },
      select: { id: true },
    });
  }

  const movimientoIds: string[] = [];
  let faltante: number | undefined;

  if (params.tipo === "ENTRADA") {
    const e = params.entrada;
    const pedimentoNumero = e.pedimentoNumero.trim();
    const sello = sha256(
      canonicalizar({
        tenantId,
        materialId: material.id,
        tipo: "ENTRADA",
        fraccion,
        nico,
        cantidad: e.cantidad,
        valorAduana: e.valorAduana ?? null,
        pedimentoNumero,
        clavePedimento: e.clavePedimento,
        fechaLimiteRetorno: e.fechaLimiteRetorno,
        despachoConcluidoEn: e.despachoConcluidoEn ?? null,
        registradoEn: ts.toISOString(),
      }),
    );
    const mov = await tx.movimientoImmex.create({
      data: {
        tenantId,
        materialId: material.id,
        tipo: "ENTRADA",
        cantidad: e.cantidad,
        valorAduana: e.valorAduana ?? null,
        pedimentoNumero,
        clavePedimento: e.clavePedimento,
        fechaLimiteRetorno: new Date(e.fechaLimiteRetorno),
        despachoConcluidoEn: e.despachoConcluidoEn ? new Date(e.despachoConcluidoEn) : null,
        registradoEn: ts,
        sha256: sello,
      },
      select: { id: true },
    });
    movimientoIds.push(mov.id);
  } else {
    // 3) DESCARGO: PEPS contra las entradas más antiguas (motor del carril A).
    const d = params.descargo;
    const pedimentoNumero = d.pedimentoNumero.trim();
    const previos = await tx.movimientoImmex.findMany({
      where: { materialId: material.id },
      orderBy: { registradoEn: "asc" },
      select: {
        id: true,
        tipo: true,
        cantidad: true,
        registradoEn: true,
        fechaLimiteRetorno: true,
        pedimentoNumero: true,
        entradaOrigenId: true,
      },
    });
    const lite: MovimientoLite[] = previos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: Number(m.cantidad),
      registradoEn: m.registradoEn.toISOString(),
      fechaLimiteRetorno: m.fechaLimiteRetorno ? m.fechaLimiteRetorno.toISOString() : null,
      pedimentoNumero: m.pedimentoNumero,
      entradaOrigenId: m.entradaOrigenId,
    }));

    const resultado = aplicarDescargoPeps(lite, d.cantidad);

    // Un MovimientoImmex DESCARGO por consumo, ligado a su ENTRADA de origen;
    // el faltante (si hay) se registra con entradaOrigenId null (C9).
    const porCrear: Array<{ cantidad: number; entradaOrigenId: string | null }> = [
      ...resultado.consumos.map((c) => ({
        cantidad: c.cantidad,
        entradaOrigenId: c.entradaId as string | null,
      })),
      ...(resultado.faltante > 0
        ? [{ cantidad: resultado.faltante, entradaOrigenId: null }]
        : []),
    ];
    if (resultado.faltante > 0) faltante = resultado.faltante;

    for (const pieza of porCrear) {
      const sello = sha256(
        canonicalizar({
          tenantId,
          materialId: material.id,
          tipo: "DESCARGO",
          fraccion,
          nico,
          cantidad: pieza.cantidad,
          pedimentoNumero,
          clavePedimento: d.clavePedimento,
          entradaOrigenId: pieza.entradaOrigenId,
          despachoConcluidoEn: d.despachoConcluidoEn ?? null,
          registradoEn: ts.toISOString(),
        }),
      );
      const mov = await tx.movimientoImmex.create({
        data: {
          tenantId,
          materialId: material.id,
          tipo: "DESCARGO",
          cantidad: pieza.cantidad,
          pedimentoNumero,
          clavePedimento: d.clavePedimento,
          entradaOrigenId: pieza.entradaOrigenId,
          despachoConcluidoEn: d.despachoConcluidoEn ? new Date(d.despachoConcluidoEn) : null,
          registradoEn: ts,
          sha256: sello,
        },
        select: { id: true },
      });
      movimientoIds.push(mov.id);
    }
  }

  // 4) saldoActual del material = Σ entradas − Σ descargos (caché derivable;
  //    la fuente de verdad son los movimientos).
  const agregados = await tx.movimientoImmex.groupBy({
    by: ["tipo"],
    where: { materialId: material.id },
    _sum: { cantidad: true },
  });
  let sumaEntradas = 0;
  let sumaDescargos = 0;
  for (const a of agregados) {
    const suma = Number(a._sum.cantidad ?? 0);
    if (a.tipo === "ENTRADA") sumaEntradas = suma;
    else if (a.tipo === "DESCARGO") sumaDescargos = suma;
  }
  await tx.materialImmex.update({
    where: { id: material.id },
    data: { saldoActual: sumaEntradas - sumaDescargos },
    select: { id: true },
  });

  // 5) Regla de 48h (R2, Anexo 24): si el movimiento trae despachoConcluidoEn,
  //    se evalúa contra el momento de registro. C9: solo se reporta, no bloquea.
  const despachoConcluidoEn =
    params.tipo === "ENTRADA"
      ? params.entrada.despachoConcluidoEn
      : params.descargo.despachoConcluidoEn;
  const regla48h: ResultadoRegla48h | undefined = despachoConcluidoEn
    ? evaluarRegla48h(despachoConcluidoEn, ts.toISOString())
    : undefined;

  // 6) Evento de bitácora ENCADENADO (hashPrev) con payloadRef JSON.
  const previo = await tx.bitacoraAuditoria.findFirst({
    orderBy: { creadoEn: "desc" },
    select: { sha256: true },
  });
  const hashPrev: string | null = previo?.sha256 ?? null;
  const payloadRef = JSON.stringify({
    clienteId,
    materialId: material.id,
    tipo: params.tipo,
    fraccion,
    movimientoIds,
    faltante: faltante ?? 0,
  });
  const payloadEvento = canonicalizar({
    tenantId,
    accion: "IMMEX_MOVIMIENTO",
    actor,
    payloadRef,
    creadoEn: ts.toISOString(),
    hashPrev,
  });
  await tx.bitacoraAuditoria.create({
    data: {
      tenantId,
      actor,
      accion: "IMMEX_MOVIMIENTO",
      payloadRef,
      sha256: sha256(payloadEvento),
      hashPrev,
      creadoEn: ts,
    },
    select: { id: true },
  });

  return {
    movimientoIds,
    ...(faltante !== undefined ? { faltante } : {}),
    ...(regla48h !== undefined ? { regla48h } : {}),
  };
}
// =============================================================================
// FIN persistir-movimiento.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
