// CERBERUS COMERCIO EXTERIOR — enrutado de notificaciones a destinatarios. NO es SIDF.
// =============================================================================
// Archivo:  src/lib/despacho-notificaciones.ts  (Incremento 36)
// Propósito: Enrutar cada aviso al/los DESTINATARIO(S) del cliente suscritos a
//            esa CATEGORÍA de módulo, por su CANAL (Telegram real; correo
//            enchufable). Separa RESOLUCIÓN (consulta tenant-scoped bajo RLS) de
//            ENVÍO (red, fuera de la transacción). Fail-safe: un envío que falla
//            no aborta los demás.
// =============================================================================

import type { Prisma, PrismaClient } from "@prisma/client";
import { enviarTelegramA } from "@/lib/notificador";
import { withTenant } from "@/lib/tenant-context";
import type { CategoriaNotificacion } from "@/lib/notificaciones-catalogo";

/** Aviso a enrutar: cliente + categoría + texto ya compuesto. */
export interface AvisoTenant {
  readonly tenantId: string;
  readonly clienteId: string;
  readonly categoria: CategoriaNotificacion;
  readonly texto: string;
}

/** Destino resuelto (un destinatario concreto + el texto a enviarle). */
export interface DestinoEnvio {
  readonly destinatarioId: string;
  readonly nombre: string;
  readonly cargo: string;
  readonly canal: string;
  readonly direccion: string;
  readonly categoria: string;
  readonly texto: string;
}

/**
 * Resuelve, dentro de una transacción tenant-scoped (RLS), los destinatarios
 * ACTIVOS de cada cliente suscritos a la categoría del aviso. Devuelve los
 * destinos (sin enviar todavía). Agrupa las consultas por cliente.
 */
export async function resolverDestinos(
  tx: Prisma.TransactionClient,
  avisos: readonly AvisoTenant[],
): Promise<DestinoEnvio[]> {
  const porCliente = new Map<string, AvisoTenant[]>();
  for (const a of avisos) {
    const lista = porCliente.get(a.clienteId) ?? [];
    lista.push(a);
    porCliente.set(a.clienteId, lista);
  }

  const destinos: DestinoEnvio[] = [];
  for (const [clienteId, avisosCliente] of porCliente) {
    const destinatarios = await tx.destinatario.findMany({
      where: { clienteId, activo: true },
      select: { id: true, nombre: true, cargo: true, canal: true, direccion: true, categorias: true },
    });
    for (const a of avisosCliente) {
      for (const d of destinatarios) {
        if (d.categorias.includes(a.categoria)) {
          destinos.push({
            destinatarioId: d.id,
            nombre: d.nombre,
            cargo: d.cargo,
            canal: d.canal,
            direccion: d.direccion,
            categoria: a.categoria,
            texto: a.texto,
          });
        }
      }
    }
  }
  return destinos;
}

export interface ResultadoDespacho {
  enviados: number;
  fallidos: number;
  omitidos: number;
}

/**
 * Envía los destinos por su canal. TELEGRAM se envía de verdad (bot del sistema
 * al chat id del destinatario); EMAIL queda como pendiente (conector futuro).
 * Fail-safe: nunca lanza. Se puede agrupar por destinatario para no spamear:
 * aquí se envía UN mensaje por destino (aviso). Cap opcional para no exceder.
 */
export async function enviarDestinos(
  destinos: readonly DestinoEnvio[],
  maxEnvios = 100,
): Promise<ResultadoDespacho> {
  const res: ResultadoDespacho = { enviados: 0, fallidos: 0, omitidos: 0 };
  let n = 0;
  for (const d of destinos) {
    if (n >= maxEnvios) {
      res.omitidos += 1;
      continue;
    }
    if (d.canal === "TELEGRAM") {
      n += 1;
      const r = await enviarTelegramA(d.direccion, `🐺 CERBERUS · ${d.categoria}\n${d.texto}`);
      if (r.ok) res.enviados += 1;
      else res.fallidos += 1;
    } else {
      // EMAIL u otros canales: aún no implementados (conector futuro).
      res.omitidos += 1;
    }
  }
  return res;
}

/**
 * Orquesta el enrutado completo (para el vigía/cron): agrupa los avisos por
 * tenant, resuelve los destinatarios DENTRO de withTenant (RLS) y ENVÍA fuera de
 * la transacción. Tolerante a fallos por tenant. Devuelve el resumen del envío.
 */
export async function despacharAvisos(
  prisma: PrismaClient,
  avisos: readonly AvisoTenant[],
): Promise<ResultadoDespacho> {
  if (avisos.length === 0) return { enviados: 0, fallidos: 0, omitidos: 0 };

  const porTenant = new Map<string, AvisoTenant[]>();
  for (const a of avisos) {
    const lista = porTenant.get(a.tenantId) ?? [];
    lista.push(a);
    porTenant.set(a.tenantId, lista);
  }

  const destinos: DestinoEnvio[] = [];
  for (const [tenantId, lista] of porTenant) {
    try {
      const d = await withTenant(tenantId, (tx) => resolverDestinos(tx, lista));
      destinos.push(...d);
    } catch (error) {
      console.error(`[despacho] no se pudieron resolver destinatarios del tenant ${tenantId}:`, error);
    }
  }
  return enviarDestinos(destinos);
}
