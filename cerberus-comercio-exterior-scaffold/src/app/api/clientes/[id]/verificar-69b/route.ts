// CERBERUS COMERCIO EXTERIOR — API verificacion 69-B (ALERTA, no bloqueo). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/verificar-69b/route.ts
// Proposito: STUB demostrativo (SIN API externa todavia) de la verificacion del
//            art. 69-B CFF para un cliente. Determina un estado con logica
//            placeholder simple (por patron del RFC), y crea/actualiza el
//            registro Alerta69b del cliente con un snapshot fechado SIMULADO
//            (SHA-256 + fecha via @/lib/probatoria/hash).
//
// DECISION C9 — ES ALERTA, *NO* BLOQUEO:
//   El software NUNCA bloquea la operacion. Solo MARCA y REGISTRA el estado 69-B
//   para que el responsable (humano) decida. Este endpoint jamas impide nada:
//   ni deniega, ni cancela, ni frena la operacion del cliente. Cuando el estado
//   resulta PRESUNTO/DEFINITIVO, la respuesta se limita a informar que la
//   "alerta quedo registrada" — el flujo de negocio sigue disponible.
//
// Multi-tenant (convencion DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado de la sesion (NextAuth), NUNCA del body/params. Toda escritura
// tenant-scoped corre dentro de withTenantFromSession (abre transaccion + fija
// app.tenant_id para que la RLS filtre por el tenant del token).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Resultado de la verificacion placeholder.
//   El schema (enum Estado69b) NO contempla un estado "LIMPIO": un cliente sin
//   hallazgos simplemente NO tiene alerta. Por eso el resultado logico "LIMPIO"
//   se modela como "no hay alerta que registrar" y NO crea/actualiza fila alguna
//   a un estado inexistente. Los hallazgos si mapean a estados reales del enum:
//   PRESUNTO (listado presuntivo) y DEFINITIVO (listado definitivo).
// -----------------------------------------------------------------------------
type ResultadoLogico = "LIMPIO" | "PRESUNTO" | "DEFINITIVO";

// Estados reales del enum Estado69b del schema (Alerta69b.estado).
type Estado69b = "PRESUNTO" | "DESVIRTUADO" | "DEFINITIVO" | "SENTENCIA_FAVORABLE" | "OVERRIDE" | "CERRADO";

/**
 * Logica PLACEHOLDER (sin API externa). Deriva un estado 69-B a partir de un
 * patron simple del RFC, solo para demostrar el flujo end-to-end. En produccion
 * esto se sustituye por el cotejo real contra el listado del DOF (SAT 69-B).
 *
 * Regla demostrativa (arbitraria y reproducible):
 *   - RFC que contiene "69B" -> DEFINITIVO (listado definitivo simulado)
 *   - RFC cuya suma de codigos de caracter es par -> PRESUNTO (presuntivo)
 *   - resto -> LIMPIO (sin hallazgos)
 */
function evaluar69bPlaceholder(rfc: string): ResultadoLogico {
  const rfcNorm = rfc.trim().toUpperCase();
  if (rfcNorm.includes("69B")) {
    return "DEFINITIVO";
  }
  let suma = 0;
  for (let i = 0; i < rfcNorm.length; i++) {
    suma += rfcNorm.charCodeAt(i);
  }
  return suma % 2 === 0 ? "PRESUNTO" : "LIMPIO";
}

/** Serializacion canonica y estable (claves ordenadas) para sellar el snapshot. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

type Params = { params: Promise<{ id: string }> };

// Discriminante del resultado de la transaccion, para responder fuera de ella.
type ResultadoTx =
  | { tipo: "no-cliente" }
  | {
      tipo: "limpio";
      alertaId: string | null;
      snapshotSha256: string;
      snapshotFecha: string;
    }
  | {
      tipo: "alerta";
      alertaId: string;
      estado: Estado69b;
      snapshotSha256: string;
      snapshotFecha: string;
    };

export async function POST(_req: Request, { params }: Params) {
  // 0) tenantId del JWT verificado, NUNCA del params/body (convencion DURA).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente no especificado" }, { status: 400 });
  }

  let resultado: ResultadoTx;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<ResultadoTx> => {
      // 1) Cargar el cliente (RLS lo limita al tenant del token).
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true },
      });
      if (!cliente) {
        return { tipo: "no-cliente" };
      }

      // 2) STUB: evaluar el estado 69-B con la logica placeholder por RFC.
      const logico = evaluar69bPlaceholder(cliente.rfc);

      // 3) Snapshot fechado SIMULADO del "DOF": sellamos un payload canonico con
      //    SHA-256 (via @/lib/probatoria/hash) y una fecha. En produccion seria el
      //    hash del recorte real del DOF que motivo la etapa.
      const snapshotFecha = new Date();
      const snapshotSha256 = sha256(
        canonical({
          fuente: "STUB_DEMOSTRATIVO_SIN_API_EXTERNA",
          tenantId,
          clienteId: cliente.id,
          rfc: cliente.rfc.trim().toUpperCase(),
          resultadoLogico: logico,
          fecha: snapshotFecha.toISOString(),
        }),
      );

      // 4a) "LIMPIO" => sin hallazgos: NO se crea/actualiza alerta a un estado
      //     inexistente en el enum. Se informa el resultado (y el snapshot que lo
      //     respalda) SIN registrar fila alguna. Nunca se bloquea nada.
      if (logico === "LIMPIO") {
        return {
          tipo: "limpio",
          alertaId: null,
          snapshotSha256,
          snapshotFecha: snapshotFecha.toISOString(),
        };
      }

      // 4b) Hallazgo (PRESUNTO | DEFINITIVO) => estado real del enum Estado69b.
      const estado: Estado69b = logico; // "PRESUNTO" | "DEFINITIVO" son literales validos del enum.

      // Crear/actualizar la Alerta69b del cliente (una alerta "activa" por cliente
      // en este stub). Es ALERTA, NO bloqueo: solo se marca y registra el estado.
      const existente = await tx.alerta69b.findFirst({
        where: { clienteId: cliente.id },
        orderBy: { creadoEn: "desc" },
        select: { id: true },
      });

      const alerta = existente
        ? await tx.alerta69b.update({
            where: { id: existente.id },
            data: {
              estado,
              snapshotDofSha256: snapshotSha256,
              snapshotDofFecha: snapshotFecha,
            },
            select: { id: true, estado: true },
          })
        : await tx.alerta69b.create({
            data: {
              tenantId,
              clienteId: cliente.id,
              estado,
              snapshotDofSha256: snapshotSha256,
              snapshotDofFecha: snapshotFecha,
            },
            select: { id: true, estado: true },
          });

      return {
        tipo: "alerta",
        alertaId: alerta.id,
        estado: alerta.estado as Estado69b,
        snapshotSha256,
        snapshotFecha: snapshotFecha.toISOString(),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la verificacion 69-B" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-cliente") {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // IMPORTANTE (C9): la respuesta NUNCA impide la operacion. Cuando hay hallazgo,
  // solo se comunica que la "alerta quedo registrada"; el responsable decide.
  if (resultado.tipo === "limpio") {
    return NextResponse.json(
      {
        ok: true,
        bloqueado: false, // el software jamas bloquea (decision C9)
        resultado: "LIMPIO",
        mensaje: "Sin hallazgos 69-B. No se registra alerta.",
        snapshotSha256: resultado.snapshotSha256,
        snapshotFecha: resultado.snapshotFecha,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      bloqueado: false, // el software jamas bloquea (decision C9)
      resultado: resultado.estado,
      alertaId: resultado.alertaId,
      mensaje: "Alerta 69-B registrada. Es una ALERTA, no un bloqueo: el responsable decide.",
      snapshotSha256: resultado.snapshotSha256,
      snapshotFecha: resultado.snapshotFecha,
    },
    { status: 201 },
  );
}
