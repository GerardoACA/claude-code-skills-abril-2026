// CERBERUS COMERCIO EXTERIOR — Calendario de vigencias/vencimientos (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/vigencias/page.tsx  (Incremento 33)
// Propósito: Vista tenant-wide de todo lo que VENCE: opiniones 32-D, encargos
//            conferidos, contratos de encargo y documentos. Clasifica cada
//            vencimiento (VENCIDO / POR_VENCER / VIGENTE) con @/lib/vigencias y
//            los ordena por urgencia. Lectura tenant-scoped (RLS). C9: informa y
//            alerta; nunca bloquea.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { clasificarVigencia, ordenUrgencia, type EstadoVigencia } from "@/lib/vigencias";

export const dynamic = "force-dynamic";

type Item = {
  tipo: string;
  referencia: string;
  contexto: string;
  vence: Date | null;
};

const SEM: Record<EstadoVigencia, { fondo: string; borde: string; color: string; etiqueta: string }> = {
  VENCIDO: { fondo: "#fef2f2", borde: "#fecaca", color: "#b91c1c", etiqueta: "Vencido" },
  POR_VENCER: { fondo: "#fffbeb", borde: "#fde68a", color: "#92400e", etiqueta: "Por vencer" },
  VIGENTE: { fondo: "#ecfdf5", borde: "#a7f3d0", color: "#065f46", etiqueta: "Vigente" },
  SIN_FECHA: { fondo: "#f8fafc", borde: "#e2e8f0", color: "#475569", etiqueta: "Sin fecha" },
};

export default async function VigenciasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const items: Item[] = await withTenantFromSession(session, async (tx): Promise<Item[]> => {
    const [opiniones, encargos, contratos, documentos] = await Promise.all([
      tx.opinionCumplimientoIngestada.findMany({
        where: { vigenciaHasta: { not: null } },
        select: { folio: true, sentido: true, vigenciaHasta: true, cliente: { select: { razonSocial: true, rfc: true } } },
        orderBy: { vigenciaHasta: "asc" },
      }),
      tx.encargoConferido.findMany({
        where: { vigenciaFin: { not: null } },
        select: { tipo: true, estado: true, vigenciaFin: true, cliente: { select: { razonSocial: true } } },
        orderBy: { vigenciaFin: "asc" },
      }),
      tx.contratoEncargo.findMany({
        where: { vigenteHasta: { not: null } },
        select: { version: true, vigenteHasta: true },
        orderBy: { vigenteHasta: "asc" },
      }),
      tx.documento.findMany({
        where: { vence: { not: null } },
        select: { tipo: true, vence: true },
        orderBy: { vence: "asc" },
        take: 300,
      }),
    ]);

    const lista: Item[] = [];
    for (const o of opiniones) {
      lista.push({
        tipo: "Opinión 32-D",
        referencia: o.folio ?? "(sin folio)",
        contexto: `${o.cliente.razonSocial} · ${o.sentido}`,
        vence: o.vigenciaHasta,
      });
    }
    for (const e of encargos) {
      lista.push({
        tipo: `Encargo ${e.tipo}`,
        referencia: e.estado,
        contexto: e.cliente.razonSocial,
        vence: e.vigenciaFin,
      });
    }
    for (const c of contratos) {
      lista.push({ tipo: "Contrato de encargo", referencia: c.version, contexto: "Tenant", vence: c.vigenteHasta });
    }
    for (const d of documentos) {
      lista.push({ tipo: "Documento", referencia: d.tipo, contexto: "—", vence: d.vence });
    }
    return lista;
  });

  const ahora = new Date();
  const filas = items
    .map((it) => ({ it, cl: clasificarVigencia(it.vence, ahora) }))
    .sort((a, b) => ordenUrgencia(a.cl) - ordenUrgencia(b.cl));

  const nVencidos = filas.filter((f) => f.cl.estado === "VENCIDO").length;
  const nPorVencer = filas.filter((f) => f.cl.estado === "POR_VENCER").length;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}><a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>← Tablero</a></p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Vigencias y vencimientos</h1>
      <p style={{ color: "#475569", margin: 0 }}>
        Opiniones 32-D, encargos conferidos, contratos de encargo y documentos, ordenados por urgencia.
      </p>

      <div style={{ display: "flex", gap: "0.8rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ padding: "0.8rem 1.2rem", background: SEM.VENCIDO.fondo, border: `1px solid ${SEM.VENCIDO.borde}`, borderRadius: 10, color: SEM.VENCIDO.color }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{nVencidos}</div>
          <div style={{ fontSize: "0.8rem" }}>Vencidos</div>
        </div>
        <div style={{ padding: "0.8rem 1.2rem", background: SEM.POR_VENCER.fondo, border: `1px solid ${SEM.POR_VENCER.borde}`, borderRadius: 10, color: SEM.POR_VENCER.color }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{nPorVencer}</div>
          <div style={{ fontSize: "0.8rem" }}>Por vencer (30 días)</div>
        </div>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.7rem 1rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, color: "#92400e", fontSize: "0.82rem" }}>
        Informativo (C9). La opinión del <strong>IMSS</strong> declara su vigencia (a veces el mismo día); la del <strong>SAT</strong> se estima en <strong>30 días</strong> desde la emisión (RMF 2.1.37).
      </div>

      <section style={{ marginTop: "1.75rem" }}>
        {filas.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No hay elementos con fecha de vencimiento registrada.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Estado</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Tipo</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Referencia</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Contexto</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Vence</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Días</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ it, cl }, i) => {
                  const s = SEM[cl.estado];
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.45rem 0.6rem" }}>
                        <span style={{ display: "inline-block", padding: "0.12rem 0.55rem", borderRadius: 999, background: s.fondo, border: `1px solid ${s.borde}`, color: s.color, fontSize: "0.78rem", fontWeight: 600 }}>{s.etiqueta}</span>
                      </td>
                      <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.85rem" }}>{it.tipo}</td>
                      <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.85rem", fontFamily: "monospace" }}>{it.referencia}</td>
                      <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.85rem", color: "#475569" }}>{it.contexto}</td>
                      <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>
                        {it.vence ? it.vence.toISOString().slice(0, 10) : "—"}
                      </td>
                      <td style={{ padding: "0.45rem 0.6rem", fontSize: "0.85rem", textAlign: "right", fontWeight: 600, color: s.color }}>
                        {cl.diasRestantes === null ? "—" : cl.diasRestantes}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
