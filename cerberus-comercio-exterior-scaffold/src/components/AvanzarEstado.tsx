"use client";

// CERBERUS COMERCIO EXTERIOR — Botones para avanzar el estado del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/components/AvanzarEstado.tsx
// Propósito: Client component que muestra un botón por cada transición VÁLIDA
//            desde el estado actual (según la máquina de estados del despacho) y
//            postea a /api/operaciones/[id]/estado. Al recibir 200, refresca el
//            Server Component para reflejar el nuevo estado y su bitácora.
//
// Las transiciones válidas se calculan en el servidor (route) y se pasan como
// prop `transicionesPermitidas`; aquí solo se renderizan y se envían.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EstadoDespacho =
  | "ARMADO"
  | "PREVALIDADO"
  | "PRESENTACION_PENDIENTE"
  | "SELECCION"
  | "VERDE"
  | "ROJO"
  | "INCIDENCIA"
  | "DOSSIER_GENERADO";

/** Etiqueta legible por estado (para los botones). */
const ETIQUETA: Readonly<Record<EstadoDespacho, string>> = {
  ARMADO: "Armado",
  PREVALIDADO: "Prevalidado",
  PRESENTACION_PENDIENTE: "Presentación pendiente",
  SELECCION: "Selección (semáforo)",
  VERDE: "Desaduanamiento libre (Verde)",
  ROJO: "Reconocimiento (Rojo)",
  INCIDENCIA: "Incidencia",
  DOSSIER_GENERADO: "Dossier generado",
};

export type AvanzarEstadoProps = {
  operacionId: string;
  estadoActual: EstadoDespacho;
  transicionesPermitidas: readonly EstadoDespacho[];
};

export function AvanzarEstado({
  operacionId,
  estadoActual,
  transicionesPermitidas,
}: AvanzarEstadoProps) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function avanzar(destino: EstadoDespacho): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/estado`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: destino }),
        },
      );

      if (!res.ok) {
        let mensaje = `No se pudo avanzar el estado (HTTP ${res.status}).`;
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

      // Éxito: refrescar el Server Component para releer estado + bitácora.
      router.refresh();
    } catch {
      setError("Error de red al contactar el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  if (transicionesPermitidas.length === 0) {
    return (
      <div
        style={{
          padding: "1rem 1.25rem",
          background: "#f1f5f9",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          color: "#334155",
        }}
      >
        El estado <strong>{ETIQUETA[estadoActual]}</strong> es terminal: no hay
        transiciones disponibles.
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Avanzar desde <strong>{ETIQUETA[estadoActual]}</strong> a:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {transicionesPermitidas.map((destino) => (
          <button
            key={destino}
            type="button"
            disabled={enviando}
            onClick={() => {
              void avanzar(destino);
            }}
            style={{
              padding: "0.6rem 1rem",
              background: enviando ? "#94a3b8" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: enviando ? "not-allowed" : "pointer",
              fontSize: "0.95rem",
            }}
          >
            {enviando ? "Procesando…" : `→ ${ETIQUETA[destino]}`}
          </button>
        ))}
      </div>

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
    </div>
  );
}

export default AvanzarEstado;
