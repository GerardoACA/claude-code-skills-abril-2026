"use client";

// CERBERUS COMERCIO EXTERIOR — reporte mensual de descargos IMMEX (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/ImmexReporteMensual.tsx  (Incremento 64)
// Propósito: Sección compacta bajo la página de saldos IMMEX del cliente:
//            selector de mes + botón "Generar" que consulta
//            /api/clientes/[id]/immex/reporte?periodo=YYYY-MM y muestra el
//            resumen (periodo, nº de filas, total, sha256 abreviado) con un
//            enlace "Descargar CSV" (misma URL con formato=csv). Es el MVP
//            tabular del Anexo 30 (R7): el layout OFICIAL está pendiente de
//            confirmación normativa — la nota es visible en la UI.
// =============================================================================

import { useState, type CSSProperties } from "react";

export type ImmexReporteMensualProps = { clienteId: string };

/** Resumen mostrado tras generar el reporte. */
type ResumenReporte = {
  periodo: string;
  filas: number;
  totalCantidad: number;
  sha256: string;
};

const estiloBoton: CSSProperties = {
  padding: "0.4rem 0.9rem",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#1e293b",
  color: "#f8fafc",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

/** Mes actual en UTC (aaaa-mm), valor inicial del selector. */
function mesActualUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ImmexReporteMensual({ clienteId }: ImmexReporteMensualProps) {
  const [periodo, setPeriodo] = useState<string>(mesActualUtc());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenReporte | null>(null);

  const urlBase = `/api/clientes/${encodeURIComponent(clienteId)}/immex/reporte?periodo=${encodeURIComponent(periodo)}`;

  async function generar(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      setError("Selecciona un mes válido (aaaa-mm).");
      return;
    }
    setCargando(true);
    setError(null);
    setResumen(null);
    try {
      const res = await fetch(urlBase, { method: "GET" });
      const datos: unknown = await res.json();
      const d = (datos ?? {}) as Record<string, unknown>;
      if (!res.ok || d.ok !== true) {
        setError(typeof d.error === "string" ? d.error : "No se pudo generar el reporte.");
        return;
      }
      setResumen({
        periodo: typeof d.periodo === "string" ? d.periodo : periodo,
        filas: Array.isArray(d.filas) ? d.filas.length : 0,
        totalCantidad: typeof d.totalCantidad === "number" ? d.totalCantidad : 0,
        sha256: typeof d.sha256 === "string" ? d.sha256 : "",
      });
    } catch {
      setError("Error de red al generar el reporte.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>
        Reporte mensual de descargos (MVP Anexo 30)
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0 0 0.6rem" }}>
        Exporte tabular MVP: el layout oficial del Anexo 30 está pendiente de
        confirmación normativa.
      </p>

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.85rem", color: "#334155" }}>
          Mes:{" "}
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            style={{
              padding: "0.3rem 0.5rem",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: "0.85rem",
            }}
          />
        </label>
        <button type="button" onClick={() => void generar()} disabled={cargando} style={estiloBoton}>
          {cargando ? "Generando…" : "Generar"}
        </button>
      </div>

      {error !== null && (
        <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: "0.6rem" }}>{error}</p>
      )}

      {resumen !== null && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            fontSize: "0.85rem",
            color: "#334155",
          }}
        >
          <p style={{ margin: 0 }}>
            Periodo <strong>{resumen.periodo}</strong> · {resumen.filas} fila(s) de descargo ·
            total <strong>{resumen.totalCantidad}</strong>
          </p>
          <p style={{ margin: "0.25rem 0 0" }}>
            Sello SHA-256:{" "}
            <code style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
              {resumen.sha256.slice(0, 12)}…
            </code>{" "}
            ·{" "}
            <a href={`${urlBase}&formato=csv`} style={{ color: "#2563eb" }} download>
              Descargar CSV
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
// =============================================================================
// FIN ImmexReporteMensual.tsx  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
