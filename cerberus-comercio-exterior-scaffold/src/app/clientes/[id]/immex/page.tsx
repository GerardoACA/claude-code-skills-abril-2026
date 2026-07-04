// CERBERUS COMERCIO EXTERIOR — página saldos IMMEX del cliente (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/immex/page.tsx  (Incremento 23 → 61)
// Propósito: Control de saldos IMMEX del cliente con DOS fuentes cotejables:
//            1) COTEJO CERBERUS (libro interno): reconstruye entradas/descargos
//               de los MovimientoImmex capturados (InventarioImmex → materiales
//               → movimientos), deriva saldos con derivarSaldos (motor PEPS,
//               carril A) y los semaforiza por fecha límite de retorno. NO
//               sustituye el SACI oficial (Anexo 24): sirve para detectar
//               discrepancias y ALERTAR (C9).
//            2) ERP del cliente (conector enchufable @/lib/conector-erp): los
//               saldos que reporta el propio sistema del cliente; mientras no
//               esté conectado (NoOp) se explica qué falta para conectarlo.
//            Bajo las tablas se monta ImmexMovimientosIngesta (captura unitaria
//            ENTRADA/DESCARGO + ingesta masiva CSV, contra las rutas del
//            carril B) para alimentar el libro de cotejo.
//
// Las consultas corren en el servidor. La identidad del cliente y su inventario
// de cotejo se resuelven tenant-scoped (RLS via withTenantFromSession); los
// saldos del ERP vienen del conector.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { obtenerConectorErp, type ResultadoConsultaErp } from "@/lib/conector-erp";
import { derivarSaldos } from "@/lib/immex/derivar-saldos";
import type { MovimientoLite, SaldoDerivado } from "@/lib/immex/tipos";
import { ImmexMovimientosIngesta } from "@/components/ImmexMovimientosIngesta";

export const dynamic = "force-dynamic";

type ClienteDatos = { id: string; rfc: string; razonSocial: string };

/** Proyección tenant-scoped del inventario de cotejo (modelos del schema). */
type InventarioCotejo = {
  certificadoIvaIeps: boolean;
  nivelCiva: string | null;
  materiales: {
    id: string;
    fraccion: string;
    nico: string | null;
    descripcion: string;
    unidadMedida: string;
    movimientos: {
      id: string;
      tipo: "ENTRADA" | "DESCARGO" | "AJUSTE";
      cantidad: unknown; // Prisma.Decimal — se proyecta con Number()
      registradoEn: Date;
      fechaLimiteRetorno: Date | null;
      pedimentoNumero: string | null;
      entradaOrigenId: string | null;
    }[];
  }[];
};

type PageProps = { params: Promise<{ id: string }> };

/** Semáforo por fecha límite de retorno (vencido / próximo 30 días / vigente). */
function semaforoRetorno(fechaIso: string): { fondo: string; borde: string; texto: string; etiqueta: string } {
  const t = Date.parse(fechaIso);
  if (Number.isNaN(t)) {
    return { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569", etiqueta: "sin fecha" };
  }
  const dias = (t - Date.now()) / (1000 * 60 * 60 * 24);
  if (dias < 0) return { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c", etiqueta: "vencido" };
  if (dias <= 30) return { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e", etiqueta: "por vencer" };
  return { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46", etiqueta: "vigente" };
}

/**
 * Tabla semaforizada de saldos. La MISMA tabla sirve para las dos fuentes:
 * SaldoDerivado (cotejo) y SaldoImmex (ERP) son forma-compatibles por contrato
 * (src/lib/immex/tipos.ts). Reutiliza semaforoRetorno() sin cambios.
 */
function TablaSaldos({ saldos }: { saldos: readonly SaldoDerivado[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
          <th style={{ padding: "0.5rem 0.75rem" }}>Fracción</th>
          <th style={{ padding: "0.5rem 0.75rem" }}>Pedimento</th>
          <th style={{ padding: "0.5rem 0.75rem" }}>Importado</th>
          <th style={{ padding: "0.5rem 0.75rem" }}>Descargado</th>
          <th style={{ padding: "0.5rem 0.75rem" }}>Saldo</th>
          <th style={{ padding: "0.5rem 0.75rem" }}>Límite retorno</th>
        </tr>
      </thead>
      <tbody>
        {saldos.map((s, i) => {
          const sem = semaforoRetorno(s.fechaLimiteRetorno);
          return (
            <tr key={`${s.pedimentoImportacion}-${s.fraccion}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>
                {s.fraccion}
                <br />
                <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>{s.descripcion}</span>
              </td>
              <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.78rem" }}>
                {s.pedimentoImportacion}
              </td>
              <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{s.cantidadImportada}</td>
              <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>{s.cantidadDescargada}</td>
              <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
                {s.saldoPendiente}
              </td>
              <td style={{ padding: "0.5rem 0.75rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.1rem 0.55rem",
                    borderRadius: 999,
                    background: sem.fondo,
                    border: `1px solid ${sem.borde}`,
                    color: sem.texto,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {s.fechaLimiteRetorno.slice(0, 10)} · {sem.etiqueta}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function ImmexPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  // Cliente + inventario de cotejo en UNA transacción tenant-scoped (RLS).
  const datos = await withTenantFromSession(
    session,
    async (tx): Promise<{ cliente: ClienteDatos | null; inventario: InventarioCotejo | null }> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) return { cliente: null, inventario: null };

      // Libro de cotejo: InventarioImmex (1:1 con cliente) → materiales →
      // movimientos en orden PEPS (registradoEn ascendente).
      const inventario = await tx.inventarioImmex.findFirst({
        where: { clienteId: cliente.id },
        select: {
          certificadoIvaIeps: true,
          nivelCiva: true,
          materiales: {
            orderBy: { fraccion: "asc" },
            select: {
              id: true,
              fraccion: true,
              nico: true,
              descripcion: true,
              unidadMedida: true,
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
                },
              },
            },
          },
        },
      });
      return { cliente, inventario };
    },
  );

  const cliente = datos.cliente;

  if (!cliente) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p>
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Fuente 1 — COTEJO CERBERUS: proyectar los movimientos persistidos a
  // MovimientoLite y derivar los saldos con el motor PEPS (carril A). Se deriva
  // POR MATERIAL para que un descargo jamás consuma entradas de otra fracción.
  // ---------------------------------------------------------------------------
  const inventario = datos.inventario;
  const materiales = inventario?.materiales ?? [];
  const totalMovimientos = materiales.reduce((n, m) => n + m.movimientos.length, 0);
  const saldosCotejo: SaldoDerivado[] = materiales.flatMap((m) =>
    derivarSaldos(
      m.movimientos.map(
        (mov): MovimientoLite => ({
          id: mov.id,
          tipo: mov.tipo,
          cantidad: Number(mov.cantidad),
          registradoEn: mov.registradoEn.toISOString(),
          fechaLimiteRetorno: mov.fechaLimiteRetorno?.toISOString() ?? null,
          pedimentoNumero: mov.pedimentoNumero,
          entradaOrigenId: mov.entradaOrigenId,
          descripcion: m.descripcion,
          fraccion: m.fraccion,
        }),
      ),
    ),
  );

  // ---------------------------------------------------------------------------
  // Fuente 2 — ERP/inventario IMMEX del cliente (NoOp → disponible=false).
  // ---------------------------------------------------------------------------
  const consulta: ResultadoConsultaErp = await obtenerConectorErp().obtenerSaldosImmex({
    rfcCliente: cliente.rfc,
  });

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a
          href={`/clientes/${encodeURIComponent(cliente.id)}/cumplimiento`}
          style={{ color: "#2563eb", fontSize: "0.9rem" }}
        >
          ← Cumplimiento
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Control de saldos IMMEX
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        <strong>{cliente.razonSocial}</strong> ·{" "}
        <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
      </p>

      {/* Para qué se necesita (siempre visible). */}
      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1.1rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          color: "#1e40af",
          fontSize: "0.9rem",
        }}
      >
        <strong>¿Para qué necesitamos los inventarios?</strong> Bajo el régimen
        IMMEX, las mercancías se importan <strong>temporalmente</strong> sin pagar
        IVA/IGI a condición de <strong>retornarlas o descargarlas</strong> en plazo.
        La empresa debe llevar el control de inventarios (<strong>Anexo 24</strong>)
        y de saldos (<strong>Anexo 31</strong>). El SAT/ANAM cruzan los pedimentos
        de importación temporal contra esos saldos: una mercancía no retornada a
        tiempo genera <strong>créditos fiscales</strong> y detona fiscalización.
        CERBERUS coteja DOS fuentes — su <strong>libro interno</strong> y el{" "}
        <strong>ERP del cliente</strong> — para <strong>alertar</strong> de saldos
        por vencer, sin descargo o discrepantes; nunca bloquea ni modifica el ERP
        (C9).
      </div>

      {/* ==================================================================== */}
      {/* Fuente 1: COTEJO CERBERUS (libro interno)                            */}
      {/* ==================================================================== */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>
          Cotejo CERBERUS (libro interno)
          {inventario?.certificadoIvaIeps === true && (
            <span
              style={{
                display: "inline-block",
                marginLeft: "0.6rem",
                padding: "0.1rem 0.55rem",
                borderRadius: 999,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                fontSize: "0.72rem",
                fontWeight: 600,
                verticalAlign: "middle",
              }}
            >
              Certificada IVA/IEPS{inventario.nivelCiva ? ` (${inventario.nivelCiva})` : ""}
            </span>
          )}
        </h2>
        <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
          El libro de cotejo NO sustituye el SACI oficial del cliente (Anexo 24);
          sirve para detectar discrepancias y alertar (C9).
        </p>

        {totalMovimientos > 0 && saldosCotejo.length > 0 ? (
          <>
            <p style={{ color: "#475569", fontSize: "0.85rem", margin: "0 0 0.25rem" }}>
              {saldosCotejo.length} saldo(s) derivados de {totalMovimientos} movimiento(s) en{" "}
              {materiales.length} material(es) — orden PEPS.
            </p>
            <TablaSaldos saldos={saldosCotejo} />
          </>
        ) : (
          <div
            style={{
              padding: "0.9rem 1.1rem",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 10,
              color: "#475569",
              fontSize: "0.9rem",
            }}
          >
            <strong>Aún sin movimientos</strong>; ingresa entradas/descargos abajo.
            Conforme se capturen pedimentos de importación temporal (entradas) y
            retornos (descargos), aquí se derivan los saldos con PEPS y su
            semáforo de vencimiento.
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* Fuente 2: ERP del cliente (conector)                                 */}
      {/* ==================================================================== */}
      {consulta.disponible ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>
            ERP del cliente (conector) · {consulta.saldos.length} saldo(s) · proveedor {consulta.proveedor}
          </h2>
          <TablaSaldos saldos={consulta.saldos} />
        </section>
      ) : (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>ERP del cliente (conector)</h2>
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 10,
              color: "#9a3412",
            }}
          >
            <h3 style={{ fontSize: "1.05rem", marginTop: 0 }}>ERP del cliente no conectado</h3>
            <p style={{ fontSize: "0.9rem" }}>{consulta.detalle}</p>
            <p style={{ fontSize: "0.9rem", marginBottom: 0 }}>
              <strong>Para conectarlo</strong> necesitamos que el cliente nos
              indique <strong>qué ERP o sistema de control de inventarios usa</strong>{" "}
              (SAP, Oracle, TradeLink, sistema del agente aduanal, desarrollo
              propio, etc.). Con eso se configura el adaptador correspondiente
              (variable <code>ERP_PROVIDER</code> + credenciales/endpoint) y esta
              misma pantalla mostrará los saldos por pedimento con su semáforo de
              vencimiento — sin cambiar nada más del sistema. La arquitectura ya
              está lista (conector <code>ConectorErp</code> agnóstico de proveedor).
            </p>
          </div>
        </section>
      )}

      {/* Captura unitaria + ingesta CSV hacia el libro de cotejo (carril B). */}
      <ImmexMovimientosIngesta clienteId={cliente.id} />
    </main>
  );
}
