// CERBERUS COMERCIO EXTERIOR — CFDI / Carta Porte 3.1 de la operación (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/operaciones/[id]/cfdi/page.tsx
// Propósito: Cargar una Operacion por id (tenant-scoped vía withTenantFromSession;
//            la RLS de Postgres filtra por el tenant del JWT) junto a sus
//            ComprobanteCfdi (tipo, complemento, estado, uuid, sha corto,
//            detallePac), mostrar la nota de contexto normativo (Carta Porte 3.1
//            obligatoria; multas por documento) y montar el form de captura
//            (CfdiCartaPorteForm) más las acciones Timbrar/Cancelar por
//            comprobante (CfdiAcciones, client components).
//
//            [Inc 45] Cero re-tecleo: en la MISMA transacción tenant-scoped se
//            leen el Tenant (su RFC), el Cliente de la operación, el Pedimento
//            más reciente (claveDePedimento, tipoCambioUsd) y la primera
//            Partida, y se pasan como prop `precarga` a ambos forms de CFDI
//            (Carta Porte: emisor=tenant, receptor=cliente; Comercio Exterior:
//            emisor=cliente exportador). Los campos siguen editables (C9).
//
//            [Inc 53] Cuadre CFDI ↔ Pedimento: en la misma transacción se toma
//            el CFDI más reciente con complemento COMERCIO_EXT_11 (su payload),
//            el pedimento más reciente (valorAduanaTotal, tipoCambioUsd) y las
//            fracciones declaradas de TODAS las partidas, y se corre
//            cuadrarCfdiPedimento (src/lib/cuadre-cfdi-pedimento.ts). El
//            resultado se pinta como recuadro semáforo (verde/ámbar/rojo).
//            C9: el cuadre ALERTA, nunca bloquea.
//
// Fail-closed: sin sesión válida => redirect a /login. Si la operación no
// pertenece al tenant (o no existe), la lectura devuelve null y se muestra aviso.
// En Next 16 `params` es Promise => se await.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  CfdiCartaPorteForm,
  type PrecargaCfdi,
} from "@/components/CfdiCartaPorteForm";
// [Inc 16] Complemento de Comercio Exterior 1.1 (CFDI de ingreso — exportación).
import { CfdiComercioExtForm } from "@/components/CfdiComercioExtForm";
import { CfdiAcciones, type EstadoCfdi } from "@/components/CfdiAcciones";
// [Inc 53] Cuadre CFDI (Comercio Exterior 1.1) ↔ Pedimento (lógica pura).
import {
  cuadrarCfdiPedimento,
  extraerDatosCfdiDePayload,
  type ResultadoCuadre,
} from "@/lib/cuadre-cfdi-pedimento";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Readonly<Record<EstadoCfdi, string>> = {
  BORRADOR: "Borrador sellado",
  TIMBRADO: "Timbrado",
  CANCELADO: "Cancelado",
  SUSTITUIDO: "Sustituido",
};

const COLOR_ESTADO: Readonly<Record<EstadoCfdi, { fondo: string; borde: string; texto: string }>> = {
  BORRADOR: { fondo: "#fffbeb", borde: "#fde68a", texto: "#b45309" },
  TIMBRADO: { fondo: "#f0fdf4", borde: "#bbf7d0", texto: "#166534" },
  CANCELADO: { fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b" },
  SUSTITUIDO: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" },
};

/** Comprobante ya serializado (fechas ISO, enums como string) para render. */
type ComprobanteSerializado = {
  id: string;
  tipo: string;
  complemento: string;
  estado: EstadoCfdi;
  emisorRfc: string;
  receptorRfc: string;
  uuid: string | null;
  sha256: string;
  detallePac: string | null;
  creadoEn: string;
};

type OperacionCfdi = {
  id: string;
  referencia: string;
  cliente: {
    id: string;
    rfc: string;
    razonSocial: string;
  };
  comprobantes: ComprobanteSerializado[];
  /** [Inc 45] Lo que la BD ya sabe para prellenar ambos forms de CFDI. */
  precarga: PrecargaCfdi;
  /** [Inc 53] Cuadre CFDI ↔ Pedimento (null si no hay CFDI de comercio ext). */
  cuadre: ResultadoCuadre | null;
};

// [Inc 53] Estilos de la casa para el semáforo del cuadre.
const COLOR_CUADRE: Readonly<
  Record<ResultadoCuadre["estado"], { fondo: string; borde: string; texto: string; titulo: string }>
> = {
  CUADRA: {
    fondo: "#ecfdf5",
    borde: "#a7f3d0",
    texto: "#065f46",
    titulo: "CFDI y pedimento cuadran",
  },
  NO_COMPARABLE: {
    fondo: "#fffbeb",
    borde: "#fde68a",
    texto: "#92400e",
    titulo: "Cuadre CFDI ↔ pedimento no comparable",
  },
  DISCREPANCIA: {
    fondo: "#fef2f2",
    borde: "#fecaca",
    texto: "#991b1b",
    titulo: "Discrepancia entre CFDI y pedimento",
  },
};

export default async function CfdiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const operacion: OperacionCfdi | null = await withTenantFromSession(
    session,
    async (tx): Promise<OperacionCfdi | null> => {
      const op = await tx.operacion.findFirst({
        where: { id },
        select: {
          id: true,
          referencia: true,
          cliente: {
            select: { id: true, rfc: true, razonSocial: true },
          },
        },
      });
      if (!op) return null;

      const comprobantes = await tx.comprobanteCfdi.findMany({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "desc" },
        select: {
          id: true,
          tipo: true,
          complemento: true,
          estado: true,
          emisorRfc: true,
          receptorRfc: true,
          uuid: true,
          sha256: true,
          detallePac: true,
          creadoEn: true,
          // [Inc 53] Solo para el cuadre en servidor; NO se serializa al cliente.
          payload: true,
        },
      });

      // [Inc 45] Precarga para cero re-tecleo (misma transacción => misma RLS):
      // el Tenant (la RLS solo deja ver SU fila), el Pedimento más reciente y
      // la primera Partida de la operación. Los Decimal se serializan a string
      // (los client components no reciben Decimal por la frontera RSC).
      const tenant = await tx.tenant.findFirst({ select: { rfc: true } });
      const pedimento = await tx.pedimento.findFirst({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "desc" },
        // [Inc 53] valorAduanaTotal se suma para el cuadre CFDI ↔ pedimento.
        select: { claveDePedimento: true, tipoCambioUsd: true, valorAduanaTotal: true },
      });
      const partida = await tx.partida.findFirst({
        where: { operacionId: op.id },
        orderBy: { creadoEn: "asc" },
        select: {
          descripcion: true,
          fraccionDeclarada: true,
          nico: true,
          umt: true,
          valorDeclarado: true,
        },
      });

      // [Inc 53] Cuadre CFDI ↔ Pedimento: el SAT cruza el CFDI con Complemento
      // de Comercio Exterior contra el pedimento (fracción y valores). Se toma
      // el comprobante MÁS RECIENTE no cancelado con complemento
      // COMERCIO_EXT_11 y se cruza contra el pedimento más reciente con las
      // fracciones declaradas de TODAS las partidas (misma transacción => RLS).
      const cfdiComercioExt = comprobantes.find(
        (c) => (c.complemento as string) === "COMERCIO_EXT_11" && (c.estado as string) !== "CANCELADO",
      );
      let cuadre: ResultadoCuadre | null = null;
      if (cfdiComercioExt !== undefined) {
        const datosCfdi = extraerDatosCfdiDePayload(cfdiComercioExt.payload);
        if (datosCfdi === null) {
          // Fail-safe: payload sellado ilegible => se explica, no se lanza (C9).
          cuadre = {
            estado: "NO_COMPARABLE",
            hallazgos: [
              "El payload sellado del CFDI no contiene un complemento de Comercio Exterior legible; no se pudo correr el cuadre.",
            ],
          };
        } else {
          const partidas = await tx.partida.findMany({
            where: { operacionId: op.id },
            select: { fraccionDeclarada: true },
          });
          cuadre = cuadrarCfdiPedimento(
            datosCfdi,
            pedimento !== null
              ? {
                  valorAduanaTotalMxn: Number(pedimento.valorAduanaTotal),
                  tipoCambioUsd: Number(pedimento.tipoCambioUsd),
                  fraccionesPartidas: partidas.map((p) => p.fraccionDeclarada),
                }
              : null,
          );
        }
      }

      const precarga: PrecargaCfdi = {
        tenantRfc: tenant !== null ? tenant.rfc : null,
        clienteRfc: op.cliente.rfc,
        claveDePedimento: pedimento !== null ? pedimento.claveDePedimento : null,
        tipoCambioUsd:
          pedimento !== null ? pedimento.tipoCambioUsd.toString() : null,
        partida:
          partida !== null
            ? {
                descripcion: partida.descripcion,
                fraccion: partida.fraccionDeclarada,
                nico: partida.nico,
                umt: partida.umt,
                valorDeclarado:
                  partida.valorDeclarado !== null
                    ? partida.valorDeclarado.toString()
                    : null,
              }
            : null,
      };

      return {
        id: op.id,
        referencia: op.referencia,
        cliente: op.cliente,
        comprobantes: comprobantes.map((c) => ({
          id: c.id,
          tipo: c.tipo as string,
          complemento: c.complemento as string,
          estado: c.estado as EstadoCfdi,
          emisorRfc: c.emisorRfc,
          receptorRfc: c.receptorRfc,
          uuid: c.uuid,
          sha256: c.sha256,
          detallePac: c.detallePac,
          creadoEn: c.creadoEn.toISOString(),
        })),
        precarga,
        cuadre,
      };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a
          href={`/operaciones/${encodeURIComponent(id)}`}
          style={{ color: "#2563eb" }}
        >
          ← Operación
        </a>
      </p>

      {operacion === null ? (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem 1.25rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          Operación no encontrada para este tenant.{" "}
          <a href="/operaciones" style={{ color: "#2563eb" }}>
            Volver a operaciones
          </a>
          .
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
            CFDI / Carta Porte — {operacion.referencia}
          </h1>
          <p style={{ color: "#475569", marginTop: 0 }}>
            Cliente: <strong>{operacion.cliente.razonSocial}</strong> (
            {operacion.cliente.rfc})
          </p>

          {/* Nota de contexto normativo (reporte §1). */}
          <div
            style={{
              marginTop: "1rem",
              padding: "0.9rem 1.1rem",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              color: "#92400e",
              fontSize: "0.9rem",
            }}
          >
            El complemento <strong>Carta Porte 3.1</strong> es obligatorio para el
            traslado de mercancías (exigible desde el 17 de julio de 2024). Emitir
            sin él o con datos inválidos expone a multas de hasta{" "}
            <strong>~$97,330 MXN por documento</strong>: se validan códigos
            postales, placas y claves de producto/servicio antes de sellar el
            borrador. El timbrado se hace vía el conector PAC (hoy sin configurar:
            los comprobantes quedan en borrador sellado).
          </div>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Comprobantes de la operación</h2>
            {operacion.comprobantes.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Aún no hay comprobantes capturados para esta operación.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {operacion.comprobantes.map((c) => {
                  const color = COLOR_ESTADO[c.estado];
                  return (
                    <li
                      key={c.id}
                      style={{
                        padding: "0.9rem 1.1rem",
                        marginBottom: "0.6rem",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "0.75rem",
                        }}
                      >
                        <strong style={{ color: "#0f172a" }}>
                          {c.tipo} · {c.complemento.replaceAll("_", " ")}
                        </strong>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            padding: "0.1rem 0.5rem",
                            borderRadius: 999,
                            background: color.fondo,
                            border: `1px solid ${color.borde}`,
                            color: color.texto,
                          }}
                        >
                          {ETIQUETA_ESTADO[c.estado]}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "#475569",
                        }}
                      >
                        <div>
                          Emisor: <strong>{c.emisorRfc}</strong> · Receptor:{" "}
                          <strong>{c.receptorRfc}</strong>
                        </div>
                        <div>
                          UUID (folio fiscal):{" "}
                          {c.uuid !== null ? (
                            <code style={{ fontSize: "0.8rem" }}>{c.uuid}</code>
                          ) : (
                            <em>sin timbrar</em>
                          )}
                        </div>
                        {c.detallePac !== null && (
                          <div>
                            Respuesta del conector PAC:{" "}
                            <code style={{ fontSize: "0.75rem" }}>
                              {c.detallePac}
                            </code>
                          </div>
                        )}
                        <div style={{ color: "#94a3b8", marginTop: "0.25rem" }}>
                          Sellado {new Date(c.creadoEn).toLocaleString("es-MX")}
                          {" · "}
                          <code style={{ fontSize: "0.75rem" }}>
                            {c.sha256.slice(0, 12)}…
                          </code>
                        </div>
                      </div>

                      <CfdiAcciones
                        operacionId={operacion.id}
                        cfdiId={c.id}
                        estado={c.estado}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>
              Capturar CFDI de traslado (Carta Porte 3.1)
            </h2>
            <CfdiCartaPorteForm
              operacionId={operacion.id}
              precarga={operacion.precarga}
            />
          </section>

          {/* [Inc 16] Complemento de Comercio Exterior 1.1 — CFDI de INGRESO que
              ampara la exportación definitiva de mercancías (clave de pedimento
              A1). Se valida país (c_Pais), fracción arancelaria (8 dígitos),
              tipo de cambio y valores en dólares antes de sellar el borrador. */}
          <section style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                padding: "0.9rem 1.1rem",
                background: "#f0fdfa",
                border: "1px solid #99f6e4",
                borderRadius: 10,
                color: "#115e59",
                fontSize: "0.9rem",
                marginBottom: "1rem",
              }}
            >
              El <strong>Complemento de Comercio Exterior 1.1</strong> es obligatorio
              en el CFDI de ingreso que ampara la <strong>exportación definitiva</strong>{" "}
              (clave de pedimento A1) de mercancías. Se validan país del receptor,
              fracción arancelaria, tipo de cambio y valores en dólares antes de
              sellar el borrador. El timbrado va por el conector PAC (hoy sin
              configurar: queda en borrador sellado).
            </div>
            <h2 style={{ fontSize: "1.1rem" }}>
              Capturar CFDI de ingreso (Comercio Exterior 1.1)
            </h2>
            <CfdiComercioExtForm
              operacionId={operacion.id}
              precarga={operacion.precarga}
            />
          </section>
        </>
      )}
    </main>
  );
}
