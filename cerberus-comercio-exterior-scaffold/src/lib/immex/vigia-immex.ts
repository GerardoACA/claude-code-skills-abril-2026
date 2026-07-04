// CERBERUS COMERCIO EXTERIOR — barrido IMMEX del vigía (Incremento 61, Carril D). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/immex/vigia-immex.ts
// Propósito: Recorrer TODOS los tenants y, por cada inventario IMMEX de cotejo,
//            derivar los saldos de importación temporal (derivarSaldos) y
//            ALERTAR (C9: nunca bloquea):
//            - SALDO_NO_RETORNADO (ALTA): plazo de retorno ya excedido; si el
//              cliente está certificado IVA/IEPS se señala el riesgo de que el
//              crédito fiscal se vuelva exigible (R8).
//            - PLAZO_RETORNO (MEDIA): saldo pendiente dentro de la ventana de
//              aviso (clasificarVigencia, 30 días).
//            - REGLA_48H (MEDIA): movimiento registrado a más de 48 horas del
//              fin del despacho (Anexo 24); solo los REGISTRADOS en los últimos
//              30 días, para no re-alertar historia antigua.
//            Por tenant con hallazgos registra UN evento encadenado
//            "VIGIA_IMMEX" en la bitácora (patrón de vigia-vigencias) y
//            devuelve los avisos por cliente (categoría IMMEX) para el cron.
//
// Multi-tenant sin sesión (cron): ids con prisma directo; el trabajo de cada
// tenant corre en withTenant (RLS). Tolerante a fallos por tenant.
// =============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { withTenant, listarTenantIds } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { clasificarVigencia } from "@/lib/vigencias";
import type { AvisoTenant } from "@/lib/despacho-notificaciones";
import { derivarSaldos, totalNoRetornado } from "./derivar-saldos";
import { evaluarRegla48h } from "./motor-peps";
import type { AlertaImmex, MovimientoLite, SaldoDerivado } from "./tipos";

export interface ResumenImmex {
  tenants: number;
  vencidos: number;
  porVencer: number;
  items: AlertaImmex[];
  /** Avisos a enrutar a destinatarios suscritos a IMMEX. */
  avisos: AvisoTenant[];
  errores: string[];
}

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Filtro de "historia reciente" para la regla de las 48h: solo alertan los
 * movimientos REGISTRADOS dentro de los últimos `dias` (default 30) respecto a
 * `ahora`, para no re-acusar a diario incumplimientos antiguos ya conocidos.
 * Defensivo: una fecha inválida NO alerta (no consta cuándo se registró).
 */
export function esRecienteParaAlerta(registradoEn: string, ahora: Date, dias = 30): boolean {
  const t = new Date(registradoEn).getTime();
  if (Number.isNaN(t)) return false;
  const edadMs = ahora.getTime() - t;
  return edadMs >= 0 && edadMs <= dias * MS_DIA;
}

/** Icono del aviso según el tipo de alerta IMMEX. */
function iconoAlerta(tipo: AlertaImmex["tipo"]): string {
  if (tipo === "SALDO_NO_RETORNADO") return "⛔";
  if (tipo === "PLAZO_RETORNO") return "⏳";
  return "⚠️";
}

/**
 * Texto del aviso al destinatario (función PURA, testeable):
 * "<icono> IMMEX <tipo>: <referencia> — <contexto> (<dias>d)"; el sufijo de
 * días solo aparece cuando la alerta tiene diasRestantes.
 */
export function componerTextoAvisoImmex(a: AlertaImmex): string {
  const dias = a.diasRestantes === null ? "" : ` (${a.diasRestantes}d)`;
  return `${iconoAlerta(a.tipo)} IMMEX ${a.tipo}: ${a.referencia} — ${a.contexto}${dias}`;
}

function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Alerta de saldo (VENCIDO o POR_VENCER) a partir de un SaldoDerivado. */
function alertaDeSaldo(
  clienteId: string,
  saldo: SaldoDerivado,
  estado: "VENCIDO" | "POR_VENCER",
  certificadoIvaIeps: boolean,
  ahora: Date,
): AlertaImmex {
  const vence = saldo.fechaLimiteRetorno === "" ? null : new Date(saldo.fechaLimiteRetorno);
  const cl = clasificarVigencia(vence, ahora);
  const base = `${saldo.descripcion || saldo.fraccion || "material"} · saldo pendiente ${saldo.saldoPendiente}`;
  if (estado === "VENCIDO") {
    // R8: con certificación IVA/IEPS el no retorno vuelve exigible el crédito fiscal.
    const riesgo = certificadoIvaIeps ? " · riesgo de crédito fiscal IVA/IEPS exigible (certificación)" : "";
    return {
      clienteId,
      tipo: "SALDO_NO_RETORNADO",
      severidad: "ALTA",
      referencia: saldo.pedimentoImportacion || saldo.fraccion || "(sin pedimento)",
      contexto: `plazo de retorno excedido · ${base}${riesgo}`,
      venceIso: vence ? vence.toISOString() : null,
      diasRestantes: cl.diasRestantes,
    };
  }
  return {
    clienteId,
    tipo: "PLAZO_RETORNO",
    severidad: "MEDIA",
    referencia: saldo.pedimentoImportacion || saldo.fraccion || "(sin pedimento)",
    contexto: `plazo de retorno próximo · ${base}`,
    venceIso: vence ? vence.toISOString() : null,
    diasRestantes: cl.diasRestantes,
  };
}

/** Reúne, dentro de la transacción del tenant, las alertas IMMEX. */
async function reunirAlertasImmex(
  tx: Prisma.TransactionClient,
  ahora: Date,
): Promise<AlertaImmex[]> {
  // Inventarios de cotejo con sus materiales y movimientos (proyección mínima).
  const inventarios = await tx.inventarioImmex.findMany({
    select: {
      clienteId: true,
      certificadoIvaIeps: true,
      materiales: {
        select: {
          fraccion: true,
          descripcion: true,
          movimientos: {
            orderBy: { registradoEn: "asc" },
            select: {
              id: true,
              tipo: true,
              cantidad: true,
              registradoEn: true,
              fechaLimiteRetorno: true,
              pedimentoNumero: true,
              entradaOrigenId: true,
              despachoConcluidoEn: true,
            },
          },
        },
      },
    },
  });

  const alertas: AlertaImmex[] = [];
  for (const inv of inventarios) {
    for (const mat of inv.materiales) {
      // Proyección al contrato puro del motor (sin Prisma/Decimal).
      const movimientos: MovimientoLite[] = mat.movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        cantidad: Number(m.cantidad),
        registradoEn: m.registradoEn.toISOString(),
        fechaLimiteRetorno: m.fechaLimiteRetorno ? m.fechaLimiteRetorno.toISOString() : null,
        pedimentoNumero: m.pedimentoNumero,
        entradaOrigenId: m.entradaOrigenId,
        descripcion: mat.descripcion,
        fraccion: mat.fraccion,
      }));

      // 1) Saldos derivados por material → plazos de retorno (R6).
      const saldos = derivarSaldos(movimientos);
      const { vencidos, porVencer } = totalNoRetornado(saldos, ahora);
      for (const s of vencidos) {
        alertas.push(alertaDeSaldo(inv.clienteId, s, "VENCIDO", inv.certificadoIvaIeps, ahora));
      }
      for (const s of porVencer) {
        alertas.push(alertaDeSaldo(inv.clienteId, s, "POR_VENCER", inv.certificadoIvaIeps, ahora));
      }

      // 2) Regla de las 48 horas (R2, Anexo 24): solo movimientos registrados
      //    en los últimos 30 días (no re-alertar historia antigua).
      for (const m of mat.movimientos) {
        if (m.despachoConcluidoEn === null) continue;
        const registradoIso = m.registradoEn.toISOString();
        if (!esRecienteParaAlerta(registradoIso, ahora)) continue;
        const r = evaluarRegla48h(m.despachoConcluidoEn.toISOString(), registradoIso);
        if (!r.incumple) continue;
        alertas.push({
          clienteId: inv.clienteId,
          tipo: "REGLA_48H",
          severidad: "MEDIA",
          referencia: m.pedimentoNumero ?? mat.fraccion,
          contexto: `${mat.descripcion} · registrado ${r.horas}h después del despacho (límite 48h, Anexo 24)`,
          venceIso: null,
          diasRestantes: null,
        });
      }
    }
  }
  return alertas;
}

/** Evento encadenado que deja constancia del barrido IMMEX del tenant. */
async function registrarEventoImmex(
  tx: Prisma.TransactionClient,
  tenantId: string,
  alertas: AlertaImmex[],
): Promise<void> {
  const creadoEn = new Date();
  const previo = await tx.bitacoraAuditoria.findFirst({ orderBy: { creadoEn: "desc" }, select: { sha256: true } });
  const hashPrev: string | null = previo?.sha256 ?? null;
  const vencidos = alertas.filter((a) => a.tipo === "SALDO_NO_RETORNADO").length;
  const porVencer = alertas.filter((a) => a.tipo === "PLAZO_RETORNO").length;
  const regla48h = alertas.filter((a) => a.tipo === "REGLA_48H").length;
  const payload = { tenantId, accion: "VIGIA_IMMEX", actor: "vigia@system", vencidos, porVencer, regla48h, creadoEn: creadoEn.toISOString(), hashPrev };
  await tx.bitacoraAuditoria.create({
    data: {
      tenantId,
      actor: "vigia@system",
      accion: "VIGIA_IMMEX",
      operacionId: null,
      payloadRef: JSON.stringify({ vencidos, porVencer, regla48h, top: alertas.slice(0, 10).map((a) => `${a.tipo}:${a.referencia}:${a.severidad}`) }),
      sha256: sha256(canonical(payload)),
      hashPrev,
      creadoEn,
    },
    select: { id: true },
  });
}

/** Barrido IMMEX multi-tenant. `ahora` inyectable para pruebas. */
export async function barridoImmex(prisma: PrismaClient, ahora: Date = new Date()): Promise<ResumenImmex> {
  const resumen: ResumenImmex = { tenants: 0, vencidos: 0, porVencer: 0, items: [], avisos: [], errores: [] };
  // `tenant` tiene FORCE RLS → se enumeran por la función SECURITY DEFINER.
  const tenantIds = await listarTenantIds(prisma);

  for (const tenantId of tenantIds) {
    try {
      const alertas = await withTenant(
        tenantId,
        async (tx): Promise<AlertaImmex[]> => {
          const encontradas = await reunirAlertasImmex(tx, ahora);
          if (encontradas.length > 0) {
            await registrarEventoImmex(tx, tenantId, encontradas);
          }
          return encontradas;
        },
        { timeout: 60_000, maxWait: 15_000 },
      );
      resumen.tenants += 1;
      resumen.items.push(...alertas);
      resumen.vencidos += alertas.filter((a) => a.tipo === "SALDO_NO_RETORNADO").length;
      resumen.porVencer += alertas.filter((a) => a.tipo === "PLAZO_RETORNO").length;
      // Cada alerta se enruta a los destinatarios del cliente suscritos a IMMEX.
      for (const a of alertas) {
        resumen.avisos.push({
          tenantId,
          clienteId: a.clienteId,
          categoria: "IMMEX",
          texto: componerTextoAvisoImmex(a),
        });
      }
    } catch (error) {
      // Tolerante a fallos: un tenant caído no aborta el barrido de los demás.
      const detalle = error instanceof Error ? error.message : String(error);
      resumen.errores.push(`tenant ${tenantId}: ${detalle}`);
      console.error(`[vigia-immex] falló el barrido del tenant ${tenantId}:`, error);
    }
  }
  return resumen;
}
