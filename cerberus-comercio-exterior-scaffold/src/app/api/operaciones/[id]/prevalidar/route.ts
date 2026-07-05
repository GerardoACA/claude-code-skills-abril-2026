// CERBERUS COMERCIO EXTERIOR — API prevalidación interna del pedimento. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/prevalidar/route.ts  (Incremento 63)
// Propósito: POST (sin body) que corre el PREVALIDADOR INTERNO (motor puro
//            src/lib/prevalidador.ts: criterios SINTÁCTICO, CATALÓGICO,
//            ESTRUCTURAL y NORMATIVO, Reglamento LA DOF 23-feb-2026) sobre el
//            pedimento MÁS RECIENTE de la operación, con las partidas de la
//            operación, el encargo conferido vigente del cliente y su última
//            opinión 32-D. Registra el resultado como PasoDespacho tipo
//            PREVALIDACION (sello = sha256 del informe canónico) y un evento
//            "PREVALIDACION_INTERNA" en la bitácora append-only (sha256
//            encadenado) con el informe completo en payloadRef (JSON).
//
// C9: la prevalidación interna INFORMA, nunca bloquea; NO sustituye al
// prevalidador autorizado (la UI lo dice). Multi-tenant: tenantId SIEMPRE del
// JWT verificado (withTenantFromSession abre transacción + SET LOCAL
// app.tenant_id => RLS), NUNCA del request.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import {
  prevalidarPedimento,
  type DatosPrevalidacion,
  type HallazgoPrevalidacion,
} from "@/lib/prevalidador";

export const runtime = "nodejs";

/** Días de "reciente" para la opinión 32-D (RMF 2.1.37: 30 días naturales). */
const DIAS_OPINION_RECIENTE = 30;

/** Serialización canónica y estable (claves ordenadas, recursivo) para sellar. */
function canonical(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v: unknown) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = obj[k];
          return acc;
        }, {});
    }
    return v;
  });
}

/** Resumen legible del informe: "N errores, M advertencias" + top códigos. */
function resumen(hallazgos: HallazgoPrevalidacion[], aprobado: boolean): string {
  const errores = hallazgos.filter((h) => h.severidad === "ERROR").length;
  const advertencias = hallazgos.length - errores;
  const codigos = [...new Set(hallazgos.map((h) => h.codigo))].slice(0, 5);
  const base = `Prevalidación interna (C9, no sustituye al prevalidador autorizado): ${errores} errores, ${advertencias} advertencias`;
  if (hallazgos.length === 0) {
    return `${base} — sin hallazgos${aprobado ? ", aprobado" : ""}`;
  }
  return `${base} (${codigos.join(", ")})`;
}

type Resultado =
  | {
      tipo: "ok";
      aprobado: boolean;
      hallazgos: HallazgoPrevalidacion[];
      pasoId: string;
      sello: string;
    }
  | { tipo: "no-encontrada" }
  | { tipo: "sin-pedimento" };

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 0) tenantId + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const user = (
    session as { user?: { tenantId?: unknown; email?: unknown; name?: unknown } } | null
  )?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const actor: string =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  const { id } = await context.params;

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 1) Operación del tenant (RLS) con cliente y partidas.
      const operacion = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          clienteId: true,
          cliente: { select: { rfc: true } },
          partidas: {
            orderBy: { creadoEn: "asc" },
            select: {
              fraccionDeclarada: true,
              valorDeclarado: true,
              valorAduana: true,
              tasaIgiPct: true,
              tasaIepsPct: true,
              igiImporte: true,
              dtaImporte: true,
              iepsImporte: true,
              ivaImporte: true,
            },
          },
        },
      });
      if (!operacion) return { tipo: "no-encontrada" as const };

      // 2) Pedimento MÁS RECIENTE de la operación (el que se prevalida).
      const pedimento = await tx.pedimento.findFirst({
        where: { operacionId: operacion.id },
        orderBy: { creadoEn: "desc" },
        select: {
          numero: true,
          aduana: true,
          claveDePedimento: true,
          regimen: true,
          tipoCambioUsd: true,
          valorAduanaTotal: true,
          igiTotal: true,
          dtaTotal: true,
          iepsTotal: true,
          ivaTotal: true,
          contribucionesTotal: true,
        },
      });
      if (!pedimento) return { tipo: "sin-pedimento" as const };

      const ahora = new Date();

      // 3) Encargo conferido (B14/B21) VIGENTE del cliente: estado VIGENTE y
      //    dentro de la ventana de vigencia (fin null = indefinido).
      const encargo = await tx.encargoConferido.findFirst({
        where: {
          clienteId: operacion.clienteId,
          estado: "VIGENTE",
          vigenciaInicio: { lte: ahora },
          OR: [{ vigenciaFin: null }, { vigenciaFin: { gte: ahora } }],
        },
        select: { id: true },
      });

      // 4) Última opinión 32-D ingestada del cliente: reciente = POSITIVA y
      //    con menos de 30 días naturales (RMF 2.1.37).
      const opinion = await tx.opinionCumplimientoIngestada.findFirst({
        where: { clienteId: operacion.clienteId },
        orderBy: { creadoEn: "desc" },
        select: { sentido: true, creadoEn: true },
      });
      const limiteReciente = new Date(
        ahora.getTime() - DIAS_OPINION_RECIENTE * 24 * 60 * 60 * 1000,
      );
      const opinionPositivaReciente =
        opinion !== null &&
        opinion.sentido === "POSITIVA" &&
        opinion.creadoEn > limiteReciente;

      // 5) Motor puro (Decimal -> number solo para el cálculo/comparación).
      const datos: DatosPrevalidacion = {
        pedimento: {
          numero: pedimento.numero,
          aduana: pedimento.aduana,
          claveDePedimento: pedimento.claveDePedimento,
          regimen: pedimento.regimen,
          tipoCambioUsd: pedimento.tipoCambioUsd.toNumber(),
          valorAduanaTotal: pedimento.valorAduanaTotal.toNumber(),
          igiTotal: pedimento.igiTotal.toNumber(),
          dtaTotal: pedimento.dtaTotal.toNumber(),
          iepsTotal: pedimento.iepsTotal.toNumber(),
          ivaTotal: pedimento.ivaTotal.toNumber(),
          contribucionesTotal: pedimento.contribucionesTotal.toNumber(),
        },
        partidas: operacion.partidas.map((p) => ({
          fraccionDeclarada: p.fraccionDeclarada,
          valorDeclarado: p.valorDeclarado?.toNumber() ?? null,
          valorAduana: p.valorAduana?.toNumber() ?? null,
          tasaIgiPct: p.tasaIgiPct?.toNumber() ?? null,
          tasaIepsPct: p.tasaIepsPct?.toNumber() ?? null,
          igiImporte: p.igiImporte?.toNumber() ?? null,
          dtaImporte: p.dtaImporte?.toNumber() ?? null,
          iepsImporte: p.iepsImporte?.toNumber() ?? null,
          ivaImporte: p.ivaImporte?.toNumber() ?? null,
        })),
        cliente: { rfc: operacion.cliente.rfc },
        encargoVigente: encargo !== null,
        opinionPositivaReciente,
      };
      const { hallazgos, aprobado } = prevalidarPedimento(datos);

      // 6) Informe canónico y su sello (sha256): es el `sello` del paso.
      const informe = {
        version: 1,
        operacionId: operacion.id,
        aprobado,
        hallazgos,
        corridoEn: ahora.toISOString(),
      };
      const informeCanonico = canonical(informe);
      const selloInforme = sha256(informeCanonico);
      const detalle = resumen(hallazgos, aprobado);

      // 7) PasoDespacho PREVALIDACION sellado (sha256 sobre payload canónico,
      //    misma convención que el route de pasos; se crea vía tx directo).
      const payloadPaso = {
        tenantId,
        operacionId: operacion.id,
        tipo: "PREVALIDACION",
        acuse: null,
        sello: selloInforme,
        monto: null,
        detalle,
        completadoEn: ahora.toISOString(),
      };
      const paso = await tx.pasoDespacho.create({
        data: {
          tenantId,
          operacionId: operacion.id,
          tipo: "PREVALIDACION",
          acuse: null,
          sello: selloInforme,
          monto: null,
          detalle,
          sha256: sha256(canonical(payloadPaso)),
          completadoEn: ahora,
        },
        select: { id: true },
      });

      // 8) Bitácora append-only: encadenar con el último evento del tenant y
      //    dejar el INFORME COMPLETO (JSON canónico) en payloadRef.
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev = previo?.sha256 ?? null;
      const payloadEvento = {
        tenantId,
        accion: "PREVALIDACION_INTERNA",
        actor,
        operacionId: operacion.id,
        pasoId: paso.id,
        selloInforme,
        aprobado,
        creadoEn: ahora.toISOString(),
        hashPrev,
      };
      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "PREVALIDACION_INTERNA",
          operacionId: operacion.id,
          payloadRef: informeCanonico,
          sha256: sha256(canonical(payloadEvento)),
          hashPrev,
          creadoEn: ahora,
        },
        select: { id: true },
      });

      return {
        tipo: "ok" as const,
        aprobado,
        hallazgos,
        pasoId: paso.id,
        sello: selloInforme,
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo correr la prevalidación interna" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-encontrada") {
    return NextResponse.json(
      { error: "Operación no encontrada para este tenant" },
      { status: 404 },
    );
  }
  if (resultado.tipo === "sin-pedimento") {
    return NextResponse.json(
      {
        error:
          "La operación no tiene pedimento calculado: captura las partidas y calcula el pedimento antes de prevalidar",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      aprobado: resultado.aprobado,
      hallazgos: resultado.hallazgos,
      pasoId: resultado.pasoId,
      sello: resultado.sello,
    },
    { status: 201 },
  );
}
