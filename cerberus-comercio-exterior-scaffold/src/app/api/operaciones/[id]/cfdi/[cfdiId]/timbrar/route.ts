// CERBERUS COMERCIO EXTERIOR — API timbrado de un CFDI (conector TimbradorPac). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/operaciones/[id]/cfdi/[cfdiId]/timbrar/route.ts
// Propósito: POST que intenta timbrar un ComprobanteCfdi vía obtenerTimbrador()
//            (Agente MODELO-13; patrón SelladorCalificado NoOp/real). Hoy el
//            conector es NoOp: responde honesto ("Conector PAC no configurado"),
//            se persiste su respuesta en detallePac y el estado queda BORRADOR.
//            Cuando el PAC real esté enchufado (env PAC_PROVIDER) y devuelva
//            resultado.ok, el mismo flujo pone estado TIMBRADO + uuid.
//            Siempre registra el evento de bitácora "CFDI_TIMBRAR_INTENTO"
//            encadenado (patrón exacto de pasos/route.ts).
//
// La llamada al PAC ocurre FUERA de la transacción (un PAC real tiene latencia;
// no se debe sostener una transacción de Postgres esperando red). Lectura y
// escritura van cada una en su withTenantFromSession (RLS por tenant del JWT).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { obtenerTimbrador } from "@/lib/timbrador-pac";

export const runtime = "nodejs";

// Tipos derivados del conector del Agente MODELO-13 (formas EXACTAS del
// blueprint: timbrar(input) => Promise<ResultadoTimbrado { ok, estado, uuid?, detalle }>).
type Timbrador = ReturnType<typeof obtenerTimbrador>;
type EntradaTimbrado = Parameters<Timbrador["timbrar"]>[0];

/** Serialización canónica y estable (claves ordenadas) para sellar el evento. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; cfdiId: string }> },
): Promise<NextResponse> {
  // 0) tenantId + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const user = (session as { user?: { tenantId?: unknown; email?: unknown; name?: unknown } } | null)
    ?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const actor: string =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  const { id, cfdiId } = await context.params;

  // 1) Cargar el comprobante del tenant (RLS) y verificar que pertenece a la
  //    operación de la ruta.
  let comprobante: {
    id: string;
    estado: string;
    emisorRfc: string;
    receptorRfc: string;
    payload: string;
    sha256: string;
  } | null;
  try {
    comprobante = await withTenantFromSession(session, async (tx) => {
      const c = await tx.comprobanteCfdi.findFirst({
        where: { id: cfdiId, operacionId: id },
        select: {
          id: true,
          estado: true,
          emisorRfc: true,
          receptorRfc: true,
          payload: true,
          sha256: true,
        },
      });
      return c === null
        ? null
        : {
            id: c.id,
            estado: c.estado as string,
            emisorRfc: c.emisorRfc,
            receptorRfc: c.receptorRfc,
            payload: c.payload,
            sha256: c.sha256,
          };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el comprobante" },
      { status: 500 },
    );
  }

  if (comprobante === null) {
    return NextResponse.json(
      { error: "Comprobante no encontrado para este tenant/operación" },
      { status: 404 },
    );
  }

  // Solo un BORRADOR se timbra; TIMBRADO/CANCELADO/SUSTITUIDO no se re-timbran.
  if (comprobante.estado !== "BORRADOR") {
    return NextResponse.json(
      {
        error: `Solo un comprobante en BORRADOR puede timbrarse; este está en ${comprobante.estado}`,
      },
      { status: 409 },
    );
  }

  // 2) Intento de timbrado vía el conector (NoOp hoy => { ok: false, estado:
  //    "SIN_PAC", detalle: "Conector PAC no configurado..." }). El contrato de
  //    entrada exacto lo fija el adaptador del PAC real del cliente; el NoOp lo
  //    ignora, por eso la aserción documentada vía el tipo derivado.
  const solicitud = {
    cfdiId: comprobante.id,
    operacionId: id,
    emisorRfc: comprobante.emisorRfc,
    receptorRfc: comprobante.receptorRfc,
    payload: comprobante.payload,
    sha256: comprobante.sha256,
  };
  const resultado = await obtenerTimbrador().timbrar(
    solicitud as unknown as EntradaTimbrado,
  );

  const detallePac: string = JSON.stringify(resultado);
  const timbrado: boolean = resultado.ok === true;
  const uuid: string | null =
    typeof resultado.uuid === "string" && resultado.uuid.length > 0
      ? resultado.uuid
      : null;

  // 3) Persistir el resultado + evento de bitácora encadenado (atómico).
  let respuesta: { estado: string; timestamp: string } | null;
  try {
    respuesta = await withTenantFromSession(session, async (tx) => {
      const vigente = await tx.comprobanteCfdi.findFirst({
        where: { id: cfdiId, operacionId: id },
        select: { id: true, estado: true },
      });
      if (!vigente) return null;

      const ahora = new Date();

      // NoOp: solo detallePac, el estado QUEDA en BORRADOR. Flujo futuro con
      // PAC real: resultado.ok => TIMBRADO + uuid (folio fiscal).
      const actualizado = await tx.comprobanteCfdi.update({
        where: { id: vigente.id },
        data: timbrado ? { estado: "TIMBRADO", uuid, detallePac } : { detallePac },
        select: { estado: true },
      });

      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      const payloadEvento = {
        tenantId,
        accion: "CFDI_TIMBRAR_INTENTO",
        actor,
        operacionId: id,
        cfdiId: vigente.id,
        resultadoOk: timbrado,
        resultadoEstado: resultado.estado,
        uuid,
        creadoEn: ahora.toISOString(),
        hashPrev,
      };
      const selloEvento = sha256(canonical(payloadEvento));

      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "CFDI_TIMBRAR_INTENTO",
          operacionId: id,
          payloadRef: `operacion:${id}:cfdi:${vigente.id}:timbrar:${resultado.estado}`,
          sha256: selloEvento,
          hashPrev,
          creadoEn: ahora,
        },
        select: { id: true },
      });

      return { estado: actualizado.estado as string, timestamp: ahora.toISOString() };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el intento de timbrado" },
      { status: 500 },
    );
  }

  if (respuesta === null) {
    return NextResponse.json(
      { error: "Comprobante no encontrado para este tenant/operación" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      timbrado,
      estado: respuesta.estado,
      uuid,
      detalle: resultado.detalle,
      timestamp: respuesta.timestamp,
    },
    { status: 200 },
  );
}
