// CERBERUS COMERCIO EXTERIOR — tablero ejecutivo (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/tablero-ejecutivo/page.tsx
// Propósito: Dashboard ejecutivo. Agrega, TENANT-SCOPED y SOLO LECTURA, los
//            indicadores clave de cumplimiento y operación del tenant. Exige
//            sesión válida (si no => /login). Las agregaciones se calculan en
//            src/lib/metricas-ejecutivas.ts dentro de withTenantFromSession, de
//            modo que la RLS de PostgreSQL filtra cada count/groupBy por el
//            tenant del JWT verificado.
//
// DECISIÓN C9 — las métricas son INFORMATIVAS: el sistema alerta, no bloquea.
// Ningún número de este tablero impide operación alguna del tenant.
//
// Server Component (sin "use client"). NO cambia el schema (solo lecturas).
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  calcularMetricas,
  type MetricasEjecutivas,
} from "@/lib/metricas-ejecutivas";

// Depende de sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Paleta semáforo coherente con clientes/[id]/cumplimiento/page.tsx.
//   neutro = azul/gris informativo; ámbar = atención; rojo = adverso.
// -----------------------------------------------------------------------------
type Tono = { color: string; fondo: string; borde: string };
const TONO_NEUTRO: Tono = { color: "#1e293b", fondo: "#f8fafc", borde: "#e2e8f0" };
const TONO_VERDE: Tono = { color: "#065f46", fondo: "#ecfdf5", borde: "#a7f3d0" };
const TONO_AMBAR: Tono = { color: "#92400e", fondo: "#fffbeb", borde: "#fde68a" };
const TONO_ROJO: Tono = { color: "#b91c1c", fondo: "#fef2f2", borde: "#fecaca" };

// Tarjeta grande: número prominente + etiqueta. `tono` resalta adversos/rojo.
function Tarjeta({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: number;
  tono: Tono;
}) {
  return (
    <div
      style={{
        flex: "1 1 150px",
        minWidth: 150,
        padding: "1.1rem 1.25rem",
        background: tono.fondo,
        border: `1px solid ${tono.borde}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: "2.1rem",
          fontWeight: 700,
          lineHeight: 1.1,
          color: tono.color,
        }}
      >
        {valor}
      </div>
      <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "#475569" }}>
        {etiqueta}
      </div>
    </div>
  );
}

// Semáforo por estado de operación: ROJO/INCIDENCIA en rojo, VERDE en verde,
// selección/pendientes en ámbar, resto neutro. Solo colorea (informativo, C9).
function tonoOperacion(estado: string): Tono {
  switch (estado) {
    case "ROJO":
    case "INCIDENCIA":
      return TONO_ROJO;
    case "SELECCION":
    case "PRESENTACION_PENDIENTE":
      return TONO_AMBAR;
    case "VERDE":
    case "DOSSIER_GENERADO":
      return TONO_VERDE;
    default:
      return TONO_NEUTRO;
  }
}

// Semáforo por etapa 69-B: DEFINITIVO adverso (rojo), PRESUNTO atención (ámbar),
// DESVIRTUADO/SENTENCIA_FAVORABLE favorables (verde), NINGUNA neutro.
function tonoEtapa69b(etapa: string): Tono {
  switch (etapa) {
    case "DEFINITIVO":
      return TONO_ROJO;
    case "PRESUNTO":
      return TONO_AMBAR;
    case "DESVIRTUADO":
    case "SENTENCIA_FAVORABLE":
      return TONO_VERDE;
    default:
      return TONO_NEUTRO;
  }
}

// Semáforo por estado CFDI: CANCELADO/SUSTITUIDO en ámbar, TIMBRADO verde,
// BORRADOR neutro.
function tonoCfdi(estado: string): Tono {
  switch (estado) {
    case "CANCELADO":
    case "SUSTITUIDO":
      return TONO_AMBAR;
    case "TIMBRADO":
      return TONO_VERDE;
    default:
      return TONO_NEUTRO;
  }
}

// Píldora coloreada para la primera columna de las mini-tablas.
function Pildora({ texto, tono }: { texto: string; tono: Tono }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.6rem",
        borderRadius: 999,
        background: tono.fondo,
        border: `1px solid ${tono.borde}`,
        color: tono.color,
        fontSize: "0.8rem",
        fontWeight: 600,
      }}
    >
      {texto}
    </span>
  );
}

// Mini-tabla genérica de distribución (clave con píldora + total).
function MiniTabla({
  titulo,
  encabezado,
  filas,
}: {
  titulo: string;
  encabezado: string;
  filas: ReadonlyArray<{ clave: string; total: number; tono: Tono }>;
}) {
  return (
    <section style={{ flex: "1 1 280px", minWidth: 280 }}>
      <h2 style={{ fontSize: "1.15rem" }}>{titulo}</h2>
      {filas.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Sin datos para este tenant.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>{encabezado}</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <Pildora texto={f.clave} tono={f.tono} />
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                  }}
                >
                  {f.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function TableroEjecutivoPage() {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Agregaciones tenant-scoped: la RLS filtra cada count/groupBy por el
  //    tenant del token verificado (el tx ya trae el contexto de tenant).
  const metricas: MetricasEjecutivas = await withTenantFromSession(
    session,
    (tx) => calcularMetricas(tx)
  );

  const tenantId = session.user.tenantId;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ marginBottom: "0.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
              ← Tablero
            </a>
            <a href="/clientes" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
              Clientes
            </a>
            <a href="/operaciones" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
              Operaciones
            </a>
          </p>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>
            Tablero ejecutivo — Cerberus Comercio Exterior
          </h1>
          <p style={{ color: "#94a3b8", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Tenant: <code>{tenantId}</code>
          </p>
        </div>
      </header>

      {/* Aviso C9: las métricas son informativas; el sistema alerta, no bloquea. */}
      <div
        style={{
          marginTop: "1.5rem",
          padding: "0.9rem 1.1rem",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          color: "#065f46",
          fontSize: "0.95rem",
        }}
      >
        Las métricas son <strong>informativas</strong>: el sistema alerta, no
        bloquea (decisión C9). Todos los indicadores se agregan SOLO del propio
        tenant, garantizado por la seguridad a nivel de fila (RLS) de PostgreSQL,
        no por un simple <code>WHERE</code> de la aplicación.
      </div>

      {/* Fila de tarjetas grandes. Adversos (verificaciones, alertas del vigía)
          se resaltan con tono ámbar/rojo cuando hay ocurrencias. */}
      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
          Indicadores clave
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <Tarjeta etiqueta="Clientes / importadores" valor={metricas.totalClientes} tono={TONO_NEUTRO} />
          <Tarjeta etiqueta="Operaciones de despacho" valor={metricas.totalOperaciones} tono={TONO_NEUTRO} />
          <Tarjeta
            etiqueta="Operaciones en rojo / incidencia"
            valor={metricas.operacionesRojo}
            tono={metricas.operacionesRojo > 0 ? TONO_ROJO : TONO_VERDE}
          />
          <Tarjeta
            etiqueta="Clientes con CSD no activo"
            valor={metricas.clientesConCsdNoActivo}
            tono={metricas.clientesConCsdNoActivo > 0 ? TONO_AMBAR : TONO_VERDE}
          />
          <Tarjeta
            etiqueta="Verificaciones adversas"
            valor={metricas.verificacionesAdversas}
            tono={metricas.verificacionesAdversas > 0 ? TONO_ROJO : TONO_VERDE}
          />
          <Tarjeta
            etiqueta="Overrides registrados"
            valor={metricas.totalOverrides}
            tono={TONO_NEUTRO}
          />
          <Tarjeta
            etiqueta="Overrides sin firma"
            valor={metricas.overridesSinFirma}
            tono={metricas.overridesSinFirma > 0 ? TONO_AMBAR : TONO_VERDE}
          />
          <Tarjeta
            etiqueta="Alertas del vigía"
            valor={metricas.alertasVigia}
            tono={metricas.alertasVigia > 0 ? TONO_AMBAR : TONO_VERDE}
          />
          <Tarjeta
            etiqueta="Dossieres de diligencia"
            valor={metricas.dossieresGenerados}
            tono={TONO_NEUTRO}
          />
        </div>
      </section>

      {/* Secciones con mini-tablas de distribución. */}
      <div
        style={{
          marginTop: "2.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "2rem",
        }}
      >
        <MiniTabla
          titulo="Operaciones por estado"
          encabezado="Estado del despacho"
          filas={metricas.operacionesPorEstado.map((o) => ({
            clave: o.estado,
            total: o.total,
            tono: tonoOperacion(o.estado),
          }))}
        />
        <MiniTabla
          titulo="Clientes por etapa 69-B"
          encabezado="Etapa art. 69-B CFF"
          filas={metricas.clientesPorEtapa69b.map((c) => ({
            clave: c.etapa,
            total: c.total,
            tono: tonoEtapa69b(c.etapa),
          }))}
        />
        <MiniTabla
          titulo="CFDI por estado"
          encabezado="Estado del CFDI"
          filas={metricas.cfdiPorEstado.map((c) => ({
            clave: c.estado,
            total: c.total,
            tono: tonoCfdi(c.estado),
          }))}
        />
      </div>

      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid #e2e8f0",
          color: "#94a3b8",
          fontSize: "0.875rem",
        }}
      >
        <a href="/aviso-privacidad" style={{ color: "#2563eb" }}>
          Aviso de privacidad
        </a>
      </footer>
    </main>
  );
}
