"use client";

// CERBERUS COMERCIO EXTERIOR — Partidas + contribuciones + pedimento (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/PartidasContribuciones.tsx  (Incremento 31)
// Propósito: Capturar partidas (con valor en aduana y tasas), ver sus
//            contribuciones (IGI/DTA/IEPS/IVA calculadas por el servidor) con la
//            fila de TOTALES, y generar el PEDIMENTO que agrega esos totales.
//            Consume /api/operaciones/[id]/partidas y /pedimento (GET/POST).
// =============================================================================

import { useCallback, useEffect, useState, type ChangeEvent } from "react";

export type PartidasContribucionesProps = { operacionId: string };

type Partida = {
  id: string;
  descripcion: string | null;
  fraccion: string | null;
  nico: string | null;
  origen: string | null;
  valorAduana: number | null;
  tasaIgiPct: number | null;
  igi: number | null;
  dta: number | null;
  ieps: number | null;
  iva: number | null;
  sha256: string | null;
  creadoEn: string;
};

type Pedimento = {
  id: string;
  claveDePedimento: string;
  regimen: string;
  tipoCambioUsd: number;
  valorAduanaTotal: number;
  igiTotal: number;
  dtaTotal: number;
  iepsTotal: number;
  ivaTotal: number;
  contribucionesTotal: number;
  sha256: string;
  creadoEn: string;
};

type ErrorDetalle = { error: string; detalles?: string[] };

const MXN = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const CAMPOS_INICIALES = {
  descripcion: "",
  fraccion: "",
  nico: "",
  umt: "",
  origen: "",
  incoterm: "",
  valorAduana: "",
  tasaIgiPct: "",
  tasaIepsPct: "",
  dtaFijo: "",
};
type Campos = typeof CAMPOS_INICIALES;

const PED_INICIAL = { claveDePedimento: "A1", regimen: "IMPORTACION DEFINITIVA", tipoCambioUsd: "" };

function aNum(v: string): number {
  return v.trim().length === 0 ? Number.NaN : Number(v);
}

async function extraerError(res: Response): Promise<string> {
  try {
    const d: unknown = await res.json();
    if (d && typeof d === "object") {
      const e = d as ErrorDetalle;
      const base = typeof e.error === "string" ? e.error : `HTTP ${res.status}`;
      return Array.isArray(e.detalles) && e.detalles.length > 0 ? `${base}: ${e.detalles.join(", ")}` : base;
    }
  } catch {
    /* sin cuerpo */
  }
  return `HTTP ${res.status}`;
}

export function PartidasContribuciones({ operacionId }: PartidasContribucionesProps) {
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [pedimentos, setPedimentos] = useState<Pedimento[]>([]);
  const [campos, setCampos] = useState<Campos>(CAMPOS_INICIALES);
  const [ped, setPed] = useState(PED_INICIAL);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [generando, setGenerando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPed, setErrorPed] = useState<string | null>(null);

  const base = `/api/operaciones/${encodeURIComponent(operacionId)}`;

  const cargar = useCallback(async () => {
    try {
      const [rp, rq] = await Promise.all([fetch(`${base}/partidas`), fetch(`${base}/pedimento`)]);
      if (rp.ok) {
        const d = (await rp.json()) as { partidas: Partida[] };
        setPartidas(d.partidas);
      }
      if (rq.ok) {
        const d = (await rq.json()) as { pedimentos: Pedimento[] };
        setPedimentos(d.pedimentos);
      }
    } catch {
      setError("No se pudieron cargar las partidas.");
    }
  }, [base]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = (campo: keyof Campos) => (e: ChangeEvent<HTMLInputElement>) =>
    setCampos((prev) => ({ ...prev, [campo]: e.target.value }));

  async function capturar(): Promise<void> {
    setEnviando(true);
    setError(null);
    const body: Record<string, unknown> = {
      descripcion: campos.descripcion.trim(),
      fraccion: campos.fraccion.trim(),
      valorAduana: aNum(campos.valorAduana),
      tasaIgiPct: aNum(campos.tasaIgiPct),
    };
    if (campos.nico.trim()) body.nico = campos.nico.trim();
    if (campos.umt.trim()) body.umt = campos.umt.trim();
    if (campos.origen.trim()) body.origen = campos.origen.trim();
    if (campos.incoterm.trim()) body.incoterm = campos.incoterm.trim();
    if (campos.tasaIepsPct.trim()) body.tasaIepsPct = aNum(campos.tasaIepsPct);
    if (campos.dtaFijo.trim()) body.dtaFijo = aNum(campos.dtaFijo);
    try {
      const res = await fetch(`${base}/partidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await extraerError(res));
        return;
      }
      setCampos(CAMPOS_INICIALES);
      await cargar();
    } catch {
      setError("Error de red al capturar la partida.");
    } finally {
      setEnviando(false);
    }
  }

  async function generarPedimento(): Promise<void> {
    setGenerando(true);
    setErrorPed(null);
    try {
      const res = await fetch(`${base}/pedimento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claveDePedimento: ped.claveDePedimento.trim(),
          regimen: ped.regimen.trim(),
          tipoCambioUsd: aNum(ped.tipoCambioUsd),
        }),
      });
      if (!res.ok) {
        setErrorPed(await extraerError(res));
        return;
      }
      setPed(PED_INICIAL);
      await cargar();
    } catch {
      setErrorPed("Error de red al generar el pedimento.");
    } finally {
      setGenerando(false);
    }
  }

  const tot = partidas.reduce(
    (a, p) => ({
      valor: a.valor + (p.valorAduana ?? 0),
      igi: a.igi + (p.igi ?? 0),
      dta: a.dta + (p.dta ?? 0),
      ieps: a.ieps + (p.ieps ?? 0),
      iva: a.iva + (p.iva ?? 0),
    }),
    { valor: 0, igi: 0, dta: 0, ieps: 0, iva: 0 },
  );
  const totalContribuciones = tot.igi + tot.dta + tot.ieps + tot.iva;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.45rem 0.6rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.9rem",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.8rem", color: "#334155", marginBottom: "0.2rem" };
  const th: React.CSSProperties = { padding: "0.4rem 0.5rem", textAlign: "right", fontSize: "0.8rem" };
  const thL: React.CSSProperties = { ...th, textAlign: "left" };
  const td: React.CSSProperties = { padding: "0.4rem 0.5rem", textAlign: "right", fontSize: "0.82rem" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  const campo = (k: keyof Campos, etiqueta: string, placeholder?: string, type?: string) => (
    <div>
      <label style={labelStyle}>{etiqueta}</label>
      <input type={type ?? "text"} value={campos[k]} disabled={enviando} onChange={cambiar(k)} placeholder={placeholder} style={inputStyle} />
    </div>
  );

  return (
    <div style={{ marginTop: "1.5rem" }}>
      {/* Captura de partida */}
      <section style={{ padding: "1.1rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Capturar partida</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", marginBottom: "0.7rem" }}>
          {campo("descripcion", "Descripción", "Descripción de la mercancía")}
          {campo("fraccion", "Fracción arancelaria (8 dígitos)", "84713001")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.7rem", marginBottom: "0.7rem" }}>
          {campo("nico", "NICO", "00")}
          {campo("umt", "UMT", "Kg")}
          {campo("origen", "País de origen", "USA")}
          {campo("incoterm", "Incoterm", "FOB")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.7rem" }}>
          {campo("valorAduana", "Valor en aduana (MXN)", "100000", "number")}
          {campo("tasaIgiPct", "Tasa IGI (%)", "15", "number")}
          {campo("tasaIepsPct", "Tasa IEPS (%) opc.", "0", "number")}
          {campo("dtaFijo", "DTA fijo (MXN) opc.", "8 al millar si vacío", "number")}
        </div>
        <button
          type="button"
          disabled={enviando}
          onClick={() => void capturar()}
          style={{ marginTop: "0.9rem", padding: "0.55rem 1.1rem", background: enviando ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: enviando ? "not-allowed" : "pointer" }}
        >
          {enviando ? "Calculando…" : "Capturar y calcular contribuciones"}
        </button>
        {error !== null && (
          <div style={{ marginTop: "0.8rem", padding: "0.6rem 0.9rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: "0.85rem" }}>{error}</div>
        )}
      </section>

      {/* Tabla de partidas + totales */}
      <section style={{ marginTop: "1.75rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Partidas ({partidas.length})</h2>
        {partidas.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Aún no hay partidas capturadas.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={thL}>Fracción</th>
                  <th style={thL}>Descripción</th>
                  <th style={thL}>Origen</th>
                  <th style={th}>Valor aduana</th>
                  <th style={th}>IGI</th>
                  <th style={th}>DTA</th>
                  <th style={th}>IEPS</th>
                  <th style={th}>IVA</th>
                </tr>
              </thead>
              <tbody>
                {partidas.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...tdL, fontFamily: "monospace" }}>{p.fraccion ?? "—"}</td>
                    <td style={tdL}>{p.descripcion ?? "—"}</td>
                    <td style={tdL}>{p.origen ?? "—"}</td>
                    <td style={td}>{MXN(p.valorAduana)}</td>
                    <td style={td}>{MXN(p.igi)}</td>
                    <td style={td}>{MXN(p.dta)}</td>
                    <td style={td}>{MXN(p.ieps)}</td>
                    <td style={td}>{MXN(p.iva)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                  <td style={tdL} colSpan={3}>Totales</td>
                  <td style={td}>{MXN(tot.valor)}</td>
                  <td style={td}>{MXN(tot.igi)}</td>
                  <td style={td}>{MXN(tot.dta)}</td>
                  <td style={td}>{MXN(tot.ieps)}</td>
                  <td style={td}>{MXN(tot.iva)}</td>
                </tr>
                <tr style={{ fontWeight: 700, color: "#065f46" }}>
                  <td style={tdL} colSpan={7}>Total de contribuciones (IGI + DTA + IEPS + IVA)</td>
                  <td style={td}>{MXN(totalContribuciones)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Generar pedimento */}
      <section style={{ marginTop: "1.75rem", padding: "1.1rem", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10 }}>
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Generar pedimento</h2>
        <p style={{ color: "#115e59", fontSize: "0.85rem", marginTop: 0 }}>
          Agrega las contribuciones de las partidas y sella el pedimento (queda en bitácora).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "0.7rem" }}>
          <div>
            <label style={labelStyle}>Clave de pedimento</label>
            <input value={ped.claveDePedimento} disabled={generando} onChange={(e) => setPed({ ...ped, claveDePedimento: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Régimen</label>
            <input value={ped.regimen} disabled={generando} onChange={(e) => setPed({ ...ped, regimen: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Tipo de cambio (MXN/USD)</label>
            <input type="number" value={ped.tipoCambioUsd} disabled={generando} onChange={(e) => setPed({ ...ped, tipoCambioUsd: e.target.value })} placeholder="17.50" style={inputStyle} />
          </div>
        </div>
        <button
          type="button"
          disabled={generando || partidas.length === 0}
          onClick={() => void generarPedimento()}
          style={{ marginTop: "0.9rem", padding: "0.55rem 1.1rem", background: generando || partidas.length === 0 ? "#94a3b8" : "#0f766e", color: "#fff", border: "none", borderRadius: 8, cursor: generando || partidas.length === 0 ? "not-allowed" : "pointer" }}
        >
          {generando ? "Generando…" : "Generar y sellar pedimento"}
        </button>
        {partidas.length === 0 && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#92400e" }}>Captura al menos una partida antes de generar el pedimento.</p>
        )}
        {errorPed !== null && (
          <div style={{ marginTop: "0.8rem", padding: "0.6rem 0.9rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b", fontSize: "0.85rem" }}>{errorPed}</div>
        )}
      </section>

      {/* Pedimentos generados */}
      {pedimentos.length > 0 && (
        <section style={{ marginTop: "1.75rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Pedimentos generados ({pedimentos.length})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={thL}>Fecha</th>
                  <th style={thL}>Clave</th>
                  <th style={thL}>Régimen</th>
                  <th style={th}>T. cambio</th>
                  <th style={th}>Contribuciones</th>
                  <th style={thL}>Sello</th>
                </tr>
              </thead>
              <tbody>
                {pedimentos.map((q) => (
                  <tr key={q.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...tdL, color: "#94a3b8", whiteSpace: "nowrap" }}>{new Date(q.creadoEn).toLocaleString("es-MX")}</td>
                    <td style={tdL}>{q.claveDePedimento}</td>
                    <td style={tdL}>{q.regimen}</td>
                    <td style={td}>{q.tipoCambioUsd.toFixed(4)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{MXN(q.contribucionesTotal)}</td>
                    <td style={{ ...tdL, fontFamily: "monospace", fontSize: "0.72rem" }}>{q.sha256.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default PartidasContribuciones;
