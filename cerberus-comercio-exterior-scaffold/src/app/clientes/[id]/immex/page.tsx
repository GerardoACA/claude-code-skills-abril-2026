// CERBERUS COMERCIO EXTERIOR — página saldos IMMEX del cliente (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/immex/page.tsx  (Incremento 23)
// Propósito: Dejar LISTO PARA PROCESAR el control de saldos IMMEX del cliente:
//            consume el conector ERP enchufable (@/lib/conector-erp) para leer
//            los saldos por pedimento de importación temporal y —cuando haya
//            integración real— los muestra con semáforo por fecha límite de
//            retorno (C9: alerta, no bloquea). Mientras el ERP del cliente no
//            esté conectado (NoOp), explica CLARAMENTE para qué se necesitan y
//            qué hace falta para conectarlo.
//
// La consulta al ERP corre en el servidor. La identidad del cliente se resuelve
// tenant-scoped (RLS); los saldos IMMEX vienen del ERP del cliente vía conector.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { obtenerConectorErp, type ResultadoConsultaErp } from "@/lib/conector-erp";

export const dynamic = "force-dynamic";

type ClienteDatos = { id: string; rfc: string; razonSocial: string };
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

export default async function ImmexPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  const cliente = await withTenantFromSession(
    session,
    async (tx): Promise<ClienteDatos | null> => {
      return tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
    },
  );

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

  // Consulta al ERP/inventario IMMEX del cliente (NoOp → disponible=false).
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
        CERBERUS lee esos saldos del <strong>ERP del cliente</strong> para{" "}
        <strong>alertar</strong> de saldos por vencer o sin descargo — nunca
        bloquea ni modifica el ERP (C9).
      </div>

      {consulta.disponible ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>
            Saldos por pedimento ({consulta.saldos.length}) · proveedor {consulta.proveedor}
          </h2>
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
              {consulta.saldos.map((s, i) => {
                const sem = semaforoRetorno(s.fechaLimiteRetorno);
                return (
                  <tr key={`${s.pedimentoImportacion}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
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
        </section>
      ) : (
        <section style={{ marginTop: "2rem" }}>
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 10,
              color: "#9a3412",
            }}
          >
            <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>ERP del cliente no conectado</h2>
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
    </main>
  );
}
