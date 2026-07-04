"use client";

// CERBERUS COMERCIO EXTERIOR — ingesta masiva de partidas por CSV (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/PartidasIngestaCsv.tsx  (Incremento 39)
// Propósito: <details> plegable para pegar (o cargar desde archivo .csv) un CSV
//            de partidas y enviarlo a POST /api/operaciones/[id]/partidas/ingesta.
//            El servidor valida por línea, calcula contribuciones y crea las
//            partidas; aquí solo se muestra el resultado (creadas + errores por
//            línea; decisión C9: alertar, no bloquear) y se recarga la página
//            tras el éxito para que la tabla refleje las nuevas partidas.
// =============================================================================

import { useState, type ChangeEvent } from "react";

export type PartidasIngestaCsvProps = { operacionId: string };

type RespuestaIngesta = { ok: boolean; creadas: number; errores: string[] };

const ENCABEZADO_EJEMPLO = "fraccion,descripcion,valorAduana,tasaIgiPct,tasaIepsPct";

export function PartidasIngestaCsv({ operacionId }: PartidasIngestaCsvProps) {
  const [csv, setCsv] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresLineas, setErroresLineas] = useState<string[]>([]);
  const [resultado, setResultado] = useState<RespuestaIngesta | null>(null);

  function leerArchivo(e: ChangeEvent<HTMLInputElement>): void {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === "string") setCsv(lector.result);
    };
    lector.readAsText(archivo);
  }

  async function ingerir(): Promise<void> {
    setEnviando(true);
    setError(null);
    setErroresLineas([]);
    setResultado(null);
    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/partidas/ingesta`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv }),
        },
      );
      let datos: unknown = null;
      try {
        datos = await res.json();
      } catch {
        /* sin cuerpo */
      }
      if (!res.ok) {
        const d = (datos ?? {}) as { error?: unknown; errores?: unknown; detalles?: unknown };
        setError(typeof d.error === "string" ? d.error : `HTTP ${res.status}`);
        const lista = Array.isArray(d.errores) ? d.errores : Array.isArray(d.detalles) ? d.detalles : [];
        setErroresLineas(lista.filter((x): x is string => typeof x === "string"));
        return;
      }
      const r = datos as RespuestaIngesta;
      setResultado(r);
      setErroresLineas(Array.isArray(r.errores) ? r.errores : []);
      // Recarga tras éxito (breve pausa para alcanzar a leer el resultado):
      // la tabla de partidas se vuelve a cargar con las filas nuevas.
      setTimeout(() => location.reload(), 1500);
    } catch {
      setError("Error de red al ingerir el CSV.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <details
      style={{
        marginTop: "1.25rem",
        padding: "0.9rem 1.1rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "1rem", color: "#334155" }}>
        Ingesta masiva (CSV)
      </summary>

      {/* Ayuda: formato esperado de columnas. */}
      <div
        style={{
          marginTop: "0.8rem",
          padding: "0.6rem 0.9rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          color: "#1e40af",
          fontSize: "0.82rem",
        }}
      >
        Formato esperado (máx. 500 filas; separador <code>,</code> o <code>;</code>): primera línea
        el encabezado <code style={{ fontFamily: "monospace" }}>{ENCABEZADO_EJEMPLO}</code> y después
        una fila por partida, p. ej.{" "}
        <code style={{ fontFamily: "monospace" }}>84713001,Laptop industrial,100000,15,0</code>. La
        fracción son 8 dígitos TIGIE, el valor en aduana (MXN) debe ser &gt; 0 y las tasas (%) ≥ 0.
        Las filas con error se reportan pero no bloquean a las válidas.
      </div>

      <div style={{ marginTop: "0.8rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", color: "#334155", marginBottom: "0.2rem" }}>
          CSV de partidas (pégalo aquí o carga un archivo .csv)
        </label>
        <textarea
          value={csv}
          disabled={enviando}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={`${ENCABEZADO_EJEMPLO}\n84713001,Laptop industrial,100000,15,0`}
          style={{
            width: "100%",
            padding: "0.45rem 0.6rem",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontFamily: "monospace",
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
        <input
          type="file"
          accept=".csv"
          disabled={enviando}
          onChange={leerArchivo}
          style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#334155" }}
        />
      </div>

      <button
        type="button"
        disabled={enviando || csv.trim().length === 0}
        onClick={() => void ingerir()}
        style={{
          marginTop: "0.9rem",
          padding: "0.55rem 1.1rem",
          background: enviando || csv.trim().length === 0 ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando || csv.trim().length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {enviando ? "Ingiriendo…" : "Ingerir partidas"}
      </button>

      {/* Resultado exitoso: creadas + errores reportados (no bloqueantes). */}
      {resultado !== null && (
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.6rem 0.9rem",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            color: "#065f46",
            fontSize: "0.85rem",
          }}
        >
          Se crearon <strong>{resultado.creadas}</strong> partida(s)
          {erroresLineas.length > 0 ? ` (${erroresLineas.length} fila(s) con error, ver abajo)` : ""}.
          Recargando…
        </div>
      )}

      {/* Error general (400/404/500 o red). */}
      {error !== null && (
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.6rem 0.9rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Errores por línea (tanto del 201 con filas malas como del 400). */}
      {erroresLineas.length > 0 && (
        <ul
          style={{
            marginTop: "0.6rem",
            marginBottom: 0,
            paddingLeft: "1.2rem",
            color: "#991b1b",
            fontSize: "0.82rem",
          }}
        >
          {erroresLineas.map((mensaje, i) => (
            <li key={`${i}-${mensaje}`}>{mensaje}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
