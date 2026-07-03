// CERBERUS COMERCIO EXTERIOR — barrido de vencimientos del vigía (Incremento 34). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/vigia-vigencias.ts
// Propósito: Recorrer TODOS los tenants y detectar lo que está VENCIDO o POR
//            VENCER (opiniones 32-D, encargos conferidos, contratos de encargo y
//            documentos), usando @/lib/vigencias. Por cada tenant con hallazgos
//            registra UN evento encadenado "VIGIA_VIGENCIAS" en la bitácora y
//            devuelve los ítems agregados para que el cron los avise (Telegram).
//
// Multi-tenant sin sesión (cron): ids con prisma directo; el trabajo de cada
// tenant corre en withTenant (RLS). C9: alerta, NUNCA bloquea. Tolerante a fallos.
// =============================================================================

import type { PrismaClient, Prisma } from "@prisma/client";
import { withTenant, listarTenantIds } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { clasificarVigencia, ordenUrgencia, type EstadoVigencia } from "@/lib/vigencias";
import type { AvisoTenant } from "@/lib/despacho-notificaciones";

export interface ItemVencimiento {
  readonly tenantId: string;
  /** Cliente asociado (opinión/encargo); null para ítems del tenant (contrato/documento). */
  readonly clienteId: string | null;
  readonly tipo: string;
  readonly referencia: string;
  readonly contexto: string;
  readonly venceIso: string | null;
  readonly estado: EstadoVigencia;
  readonly diasRestantes: number | null;
}

export interface ResumenVigencias {
  tenants: number;
  vencidos: number;
  porVencer: number;
  items: ItemVencimiento[];
  /** Avisos a enrutar a destinatarios suscritos a VIGENCIAS (Inc 36). */
  avisos: AvisoTenant[];
}

function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Reúne, dentro de la transacción del tenant, los ítems con fecha de vencimiento. */
async function reunirVencimientos(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ahora: Date,
): Promise<ItemVencimiento[]> {
  const [opiniones, encargos, contratos, documentos] = await Promise.all([
    tx.opinionCumplimientoIngestada.findMany({
      where: { vigenciaHasta: { not: null } },
      select: { clienteId: true, folio: true, sentido: true, vigenciaHasta: true, cliente: { select: { razonSocial: true } } },
    }),
    tx.encargoConferido.findMany({
      where: { vigenciaFin: { not: null } },
      select: { clienteId: true, tipo: true, estado: true, vigenciaFin: true, cliente: { select: { razonSocial: true } } },
    }),
    tx.contratoEncargo.findMany({ where: { vigenteHasta: { not: null } }, select: { version: true, vigenteHasta: true } }),
    tx.documento.findMany({ where: { vence: { not: null } }, select: { tipo: true, vence: true }, take: 300 }),
  ]);

  const crudos: { clienteId: string | null; tipo: string; referencia: string; contexto: string; vence: Date | null }[] = [
    ...opiniones.map((o) => ({ clienteId: o.clienteId, tipo: "Opinión 32-D", referencia: o.folio ?? "(sin folio)", contexto: `${o.cliente.razonSocial} · ${o.sentido}`, vence: o.vigenciaHasta })),
    ...encargos.map((e) => ({ clienteId: e.clienteId, tipo: `Encargo ${e.tipo}`, referencia: e.estado, contexto: e.cliente.razonSocial, vence: e.vigenciaFin })),
    ...contratos.map((c) => ({ clienteId: null, tipo: "Contrato de encargo", referencia: c.version, contexto: "Tenant", vence: c.vigenteHasta })),
    ...documentos.map((d) => ({ clienteId: null, tipo: "Documento", referencia: d.tipo, contexto: "—", vence: d.vence })),
  ];

  const items: ItemVencimiento[] = [];
  for (const r of crudos) {
    const cl = clasificarVigencia(r.vence, ahora);
    if (cl.estado === "VENCIDO" || cl.estado === "POR_VENCER") {
      items.push({
        tenantId,
        clienteId: r.clienteId,
        tipo: r.tipo,
        referencia: r.referencia,
        contexto: r.contexto,
        venceIso: r.vence ? r.vence.toISOString() : null,
        estado: cl.estado,
        diasRestantes: cl.diasRestantes,
      });
    }
  }
  items.sort((a, b) => ordenUrgencia({ estado: a.estado, diasRestantes: a.diasRestantes }) - ordenUrgencia({ estado: b.estado, diasRestantes: b.diasRestantes }));
  return items;
}

/** Evento encadenado que deja constancia del barrido de vencimientos del tenant. */
async function registrarEventoVigencias(
  tx: Prisma.TransactionClient,
  tenantId: string,
  items: ItemVencimiento[],
): Promise<void> {
  const creadoEn = new Date();
  const previo = await tx.bitacoraAuditoria.findFirst({ orderBy: { creadoEn: "desc" }, select: { sha256: true } });
  const hashPrev: string | null = previo?.sha256 ?? null;
  const vencidos = items.filter((i) => i.estado === "VENCIDO").length;
  const porVencer = items.length - vencidos;
  const payload = { tenantId, accion: "VIGIA_VIGENCIAS", actor: "vigia@system", vencidos, porVencer, creadoEn: creadoEn.toISOString(), hashPrev };
  await tx.bitacoraAuditoria.create({
    data: {
      tenantId,
      actor: "vigia@system",
      accion: "VIGIA_VIGENCIAS",
      operacionId: null,
      payloadRef: JSON.stringify({ vencidos, porVencer, top: items.slice(0, 10).map((i) => `${i.tipo}:${i.referencia}:${i.estado}`) }),
      sha256: sha256(canonical(payload)),
      hashPrev,
      creadoEn,
    },
    select: { id: true },
  });
}

/** Barrido de vencimientos multi-tenant. `ahora` inyectable para pruebas. */
export async function barridoVigencias(prisma: PrismaClient, ahora: Date = new Date()): Promise<ResumenVigencias> {
  const resumen: ResumenVigencias = { tenants: 0, vencidos: 0, porVencer: 0, items: [], avisos: [] };
  // `tenant` tiene FORCE RLS → se enumeran por la función SECURITY DEFINER.
  const tenantIds = await listarTenantIds(prisma);

  for (const tenantId of tenantIds) {
    try {
      const items = await withTenant(tenantId, async (tx): Promise<ItemVencimiento[]> => {
        const encontrados = await reunirVencimientos(tx, tenantId, ahora);
        if (encontrados.length > 0) {
          await registrarEventoVigencias(tx, tenantId, encontrados);
        }
        return encontrados;
      });
      resumen.tenants += 1;
      resumen.items.push(...items);
      resumen.vencidos += items.filter((i) => i.estado === "VENCIDO").length;
      resumen.porVencer += items.filter((i) => i.estado === "POR_VENCER").length;
      // Inc 36: enruta cada vencimiento ligado a un cliente a sus destinatarios
      // suscritos a VIGENCIAS (los de tenant, sin clienteId, quedan en el resumen).
      for (const it of items) {
        if (it.clienteId !== null) {
          const dias = it.diasRestantes === null ? "" : ` (${it.diasRestantes}d)`;
          const icono = it.estado === "VENCIDO" ? "⛔" : "⏳";
          resumen.avisos.push({
            tenantId: it.tenantId,
            clienteId: it.clienteId,
            categoria: "VIGENCIAS",
            texto: `${icono} ${it.tipo} ${it.referencia} — ${it.contexto}${dias}`,
          });
        }
      }
    } catch (error) {
      console.error(`[vigia-vigencias] fallo el barrido del tenant ${tenantId}:`, error);
    }
  }
  return resumen;
}
