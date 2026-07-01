// CERBERUS COMERCIO EXTERIOR — API verificacion de cumplimiento completa. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/clientes/[id]/cumplimiento/route.ts
// Proposito: POST que corre la verificacion de cumplimiento COMPLETA de un cliente
//            (las 6 fuentes: art. 69, 69-B, 69-B Bis, 49 Bis, opinion 32-D y CSD
//            17-H) usando el servicio ASINCRONO `verificarCumplimiento` de
//            @/lib/verificacion-cumplimiento (Incremento 10: consulta los
//            listados REALES del SAT importados en tablas globales), y crea UN
//            registro VerificacionCumplimiento por cada FuenteVerificacion.
//
// DECISION C9 — ES ALERTA, *NO* BLOQUEO:
//   El software NUNCA bloquea la operacion. Solo MARCA y REGISTRA el estado de
//   cumplimiento para que el responsable (humano) decida. Este endpoint jamas
//   impide nada: ni deniega, ni cancela, ni frena la operacion del cliente.
//   Cuando algun resultado es ALERTA/INHABILITADO, la respuesta se limita a
//   informar que la "alerta quedo registrada" — el flujo de negocio sigue
//   disponible. El campo `bloqueado` es SIEMPRE false.
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
import {
  verificarCumplimiento,
  type ResultadoFuente,
} from "@/lib/verificacion-cumplimiento";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Enums EXACTOS del blueprint (Incremento 5). Se declaran como tipos literales
// locales para tipar la respuesta y las escrituras sin acoplarnos al paquete
// generado por Prisma (los strings coinciden 1:1 con los enums del schema).
// -----------------------------------------------------------------------------
type FuenteVerificacion =
  | "ART_69"
  | "ART_69B"
  | "ART_69B_BIS"
  | "ART_49BIS"
  | "OPINION_32D"
  | "CSD_17H";

type ResultadoVerificacion =
  | "AL_CORRIENTE"
  | "NO_DISPONIBLE"
  | "ALERTA"
  | "INHABILITADO_PRESUNTO"
  | "INHABILITADO_DEFINITIVO";

// El shape EXACTO por fuente (fuente, resultado, detalle, snapshotSha256,
// consultadoEn) lo define el servicio en @/lib/verificacion-cumplimiento y se
// importa como `ResultadoFuente`. Aqui solo lo consumimos.

// Resultados que se consideran hallazgo (disparan el texto de "alerta registrada").
// NUNCA implican bloqueo; solo cambian el mensaje informativo (decision C9).
const RESULTADOS_HALLAZGO: ReadonlySet<ResultadoVerificacion> = new Set<ResultadoVerificacion>([
  "ALERTA",
  "INHABILITADO_PRESUNTO",
  "INHABILITADO_DEFINITIVO",
]);

type Params = { params: Promise<{ id: string }> };

// Resumen por fuente que devuelve la respuesta (sin exponer objetos Prisma).
type ResumenFuente = {
  fuente: FuenteVerificacion;
  resultado: ResultadoVerificacion;
  detalle: string | null;
  registroId: string;
};

// Discriminante del resultado de la transaccion, para responder fuera de ella.
type ResultadoTx =
  | { tipo: "no-cliente" }
  | {
      tipo: "ok";
      rfc: string;
      resumen: ResumenFuente[];
      hayHallazgo: boolean;
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

      // 2) Correr el servicio de verificacion de cumplimiento para el RFC
      //    (Incremento 10: ASINCRONO; consulta los listados REALES del SAT).
      //    Se le pasa el `tx`: los modelos globales ImportacionListadoSat /
      //    ListadoSatEntrada NO tienen tenant_id y son accesibles desde la
      //    transaccion aunque la RLS no los cubra (referencia global publica).
      //    La escritura de VerificacionCumplimiento (abajo) sigue tenant-scoped.
      const evaluaciones: ResultadoFuente[] = await verificarCumplimiento(tx, {
        rfc: cliente.rfc,
      });

      // 3) Crear UN registro VerificacionCumplimiento por cada fuente evaluada.
      //    Es ALERTA, NO bloqueo: solo se marca y registra; nunca se impide nada.
      const resumen: ResumenFuente[] = [];
      let hayHallazgo = false;

      for (const ev of evaluaciones) {
        const registro = await tx.verificacionCumplimiento.create({
          data: {
            tenantId,
            clienteId: cliente.id,
            fuente: ev.fuente,
            resultado: ev.resultado,
            detalle: ev.detalle,
            snapshotSha256: ev.snapshotSha256,
            // consultadoEn: lo fija el default(now()) del modelo. `vigenciaHasta`
            // queda null (el servicio STUB no calcula vigencia todavia).
          },
          select: { id: true, fuente: true, resultado: true, detalle: true },
        });

        if (RESULTADOS_HALLAZGO.has(ev.resultado)) {
          hayHallazgo = true;
        }

        resumen.push({
          fuente: registro.fuente as FuenteVerificacion,
          resultado: registro.resultado as ResultadoVerificacion,
          detalle: registro.detalle,
          registroId: registro.id,
        });
      }

      return { tipo: "ok", rfc: cliente.rfc, resumen, hayHallazgo };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la verificacion de cumplimiento" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "no-cliente") {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // IMPORTANTE (C9): la respuesta NUNCA impide la operacion. Aunque haya
  // ALERTA/INHABILITADO, solo se comunica que la alerta quedo registrada; el
  // responsable (humano) decide. `bloqueado` es SIEMPRE false.
  const mensaje = resultado.hayHallazgo
    ? "Verificacion de cumplimiento registrada. Hay ALERTA(S)/inhabilitacion presunta o definitiva: es una ALERTA, NO un bloqueo. El sistema no impide ninguna operacion; el responsable decide."
    : "Verificacion de cumplimiento registrada. Sin hallazgos que ameriten alerta.";

  return NextResponse.json(
    {
      ok: true,
      bloqueado: false, // el software jamas bloquea (decision C9)
      hayAlerta: resultado.hayHallazgo,
      rfc: resultado.rfc,
      mensaje,
      resultados: resultado.resumen,
    },
    { status: 201 },
  );
}
