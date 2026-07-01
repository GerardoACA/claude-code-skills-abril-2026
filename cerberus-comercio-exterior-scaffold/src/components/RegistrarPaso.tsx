"use client";

// CERBERUS COMERCIO EXTERIOR — Formulario para registrar un paso del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/components/RegistrarPaso.tsx
// Propósito: Client component con un selector de tipo de paso y los campos según
//            el tipo (acuse para MVE_E2/COVE/DODA, sello para PREVALIDACION,
//            monto para PAGO); postea a /api/operaciones/[id]/pasos. Al recibir
//            201 refresca el Server Component para reflejar el checklist.
//
// El sellado (sha256) y el encadenamiento de bitácora ocurren en el servidor;
// aquí solo se capturan y envían los datos según el tipo.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TipoPaso = "MVE_E2" | "COVE" | "PREVALIDACION" | "PAGO" | "DODA";

const TIPOS: readonly TipoPaso[] = [
  "MVE_E2",
  "COVE",
  "PREVALIDACION",
  "PAGO",
  "DODA",
];

/** Etiqueta legible por tipo de paso. */
const ETIQUETA: Readonly<Record<TipoPaso, string>> = {
  MVE_E2: "Manifestación de Valor (E2)",
  COVE: "COVE",
  PREVALIDACION: "Prevalidación",
  PAGO: "Pago de contribuciones",
  DODA: "DODA",
};

/** Qué campo captura cada tipo de paso. */
function campoDe(tipo: TipoPaso): "acuse" | "sello" | "monto" {
  if (tipo === "PREVALIDACION") return "sello";
  if (tipo === "PAGO") return "monto";
  return "acuse";
}

export type RegistrarPasoProps = {
  operacionId: string;
};

/** Cuerpo enviado al route según el tipo de paso. */
type PayloadPaso = {
  tipo: TipoPaso;
  acuse?: string;
  sello?: string;
  monto?: string;
  detalle?: string;
};

export function RegistrarPaso({ operacionId }: RegistrarPasoProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPaso>("MVE_E2");
  const [acuse, setAcuse] = useState<string>("");
  const [sello, setSello] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [detalle, setDetalle] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const campo = campoDe(tipo);

  async function registrar(): Promise<void> {
    setEnviando(true);
    setError(null);
    setExito(null);

    const detalleLimpio = detalle.trim();
    const payload: PayloadPaso = { tipo };
    if (detalleLimpio.length > 0) payload.detalle = detalleLimpio;
    if (campo === "acuse") payload.acuse = acuse.trim();
    if (campo === "sello") payload.sello = sello.trim();
    if (campo === "monto") payload.monto = monto.trim();

    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/pasos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        let mensaje = `No se pudo registrar el paso (HTTP ${res.status}).`;
        try {
          const data: unknown = await res.json();
          if (
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
          ) {
            mensaje = (data as { error: string }).error;
          }
        } catch {
          // Respuesta sin cuerpo JSON: se conserva el mensaje por defecto.
        }
        setError(mensaje);
        return;
      }

      setExito(`Paso ${ETIQUETA[tipo]} registrado y sellado.`);
      setAcuse("");
      setSello("");
      setMonto("");
      setDetalle("");
      // Refrescar el Server Component para releer el checklist.
      router.refresh();
    } catch {
      setError("Error de red al contactar el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.85rem",
    color: "#334155",
    marginBottom: "0.25rem",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.65rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.95rem",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        padding: "1.25rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="tipo-paso" style={labelStyle}>
          Tipo de paso
        </label>
        <select
          id="tipo-paso"
          value={tipo}
          disabled={enviando}
          onChange={(e) => {
            setTipo(e.target.value as TipoPaso);
            setError(null);
            setExito(null);
          }}
          style={inputStyle}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA[t]}
            </option>
          ))}
        </select>
      </div>

      {campo === "acuse" && (
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="acuse" style={labelStyle}>
            Acuse / folio / referencia
          </label>
          <input
            id="acuse"
            type="text"
            value={acuse}
            disabled={enviando}
            onChange={(e) => setAcuse(e.target.value)}
            placeholder="Acuse del trámite"
            style={inputStyle}
          />
        </div>
      )}

      {campo === "sello" && (
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="sello" style={labelStyle}>
            Sello de prevalidación
          </label>
          <input
            id="sello"
            type="text"
            value={sello}
            disabled={enviando}
            onChange={(e) => setSello(e.target.value)}
            placeholder="Sello devuelto por el prevalidador"
            style={inputStyle}
          />
        </div>
      )}

      {campo === "monto" && (
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="monto" style={labelStyle}>
            Monto de contribuciones (MXN)
          </label>
          <input
            id="monto"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={monto}
            disabled={enviando}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="detalle" style={labelStyle}>
          Detalle (opcional)
        </label>
        <input
          id="detalle"
          type="text"
          value={detalle}
          disabled={enviando}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Nota o referencia adicional"
          style={inputStyle}
        />
      </div>

      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          void registrar();
        }}
        style={{
          padding: "0.6rem 1.1rem",
          background: enviando ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Registrando…" : "Registrar paso"}
      </button>

      {error !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      )}

      {exito !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            color: "#166534",
          }}
        >
          {exito}
        </div>
      )}
    </div>
  );
}

export default RegistrarPaso;
