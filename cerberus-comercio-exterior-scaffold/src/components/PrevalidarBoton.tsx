"use client";

// CERBERUS COMERCIO EXTERIOR — botón de prevalidación interna del pedimento. NO es SIDF.
// =============================================================================
// Archivo:  src/components/PrevalidarBoton.tsx  (Incremento 63)
// Propósito: Client component que dispara POST /api/operaciones/[id]/prevalidar
//            (prevalidador INTERNO: criterios SINTÁCTICO/CATALÓGICO/ESTRUCTURAL/
//            NORMATIVO) y muestra el informe agrupado por criterio: ERROR en
//            rojo, ADVERTENCIA en ámbar, banda verde si quedó aprobado.
//
// C9: la prevalidación interna INFORMA hallazgos, nunca bloquea, y NO sustituye
// al prevalidador autorizado — la nota es visible siempre. El sellado del paso
// PREVALIDACION y la bitácora encadenada ocurren en el servidor.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

type Criterio = "SINTACTICO" | "CATALOGICO" | "ESTRUCTURAL" | "NORMATIVO";
type Severidad = "ERROR" | "ADVERTENCIA";

type Hallazgo = {
  criterio: Criterio;
  severidad: Severidad;
  codigo: string;
  mensaje: string;
};

type Informe = {
  aprobado: boolean;
  hallazgos: Hallazgo[];
};

const CRITERIOS: readonly Criterio[] = [
  "SINTACTICO",
  "CATALOGICO",
  "ESTRUCTURAL",
  "NORMATIVO",
];

const ETIQUETA_CRITERIO: Readonly<Record<Criterio, string>> = {
  SINTACTICO: "Sintáctico (formatos)",
  CATALOGICO: "Catalógico (claves y catálogos)",
  ESTRUCTURAL: "Estructural (cuadre de totales)",
  NORMATIVO: "Normativo (encargo, 32-D)",
};

/** Type guard mínimo del hallazgo recibido del servidor. */
function esHallazgo(v: unknown): v is Hallazgo {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.criterio === "string" &&
    (CRITERIOS as readonly string[]).includes(o.criterio) &&
    (o.severidad === "ERROR" || o.severidad === "ADVERTENCIA") &&
    typeof o.codigo === "string" &&
    typeof o.mensaje === "string"
  );
}

export type PrevalidarBotonProps = {
  operacionId: string;
};

export function PrevalidarBoton({ operacionId }: PrevalidarBotonProps) {
  const router = useRouter();
  const [corriendo, setCorriendo] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);

  async function prevalidar(): Promise<void> {
    setCorriendo(true);
    setError(null);
    setInforme(null);
    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/prevalidar`,
        { method: "POST" },
      );
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // Sin cuerpo JSON: se maneja abajo.
      }
      if (!res.ok) {
        const mensaje =
          data !== null &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `No se pudo prevalidar (HTTP ${res.status}).`;
        setError(mensaje);
        return;
      }
      const o = (data ?? {}) as Record<string, unknown>;
      const hallazgos = Array.isArray(o.hallazgos)
        ? o.hallazgos.filter(esHallazgo)
        : [];
      setInforme({ aprobado: o.aprobado === true, hallazgos });
      // Refrescar el Server Component: el paso PREVALIDACION quedó registrado.
      router.refresh();
    } catch {
      setError("Error de red al contactar el servidor.");
    } finally {
      setCorriendo(false);
    }
  }

  return (
    <div
      style={{
        padding: "1.25rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        disabled={corriendo}
        onClick={() => {
          void prevalidar();
        }}
        style={{
          padding: "0.6rem 1.1rem",
          background: corriendo ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: corriendo ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {corriendo ? "Prevalidando…" : "Prevalidar (interno)"}
      </button>

      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.5rem" }}>
        Prevalidación interna de CERBERUS: no sustituye al prevalidador
        autorizado; detecta hallazgos antes de transmitir (C9).
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

      {informe !== null && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              fontWeight: 700,
              background: informe.aprobado ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${informe.aprobado ? "#bbf7d0" : "#fecaca"}`,
              color: informe.aprobado ? "#166534" : "#991b1b",
            }}
          >
            {informe.aprobado
              ? informe.hallazgos.length === 0
                ? "✓ Aprobado: sin hallazgos"
                : "✓ Aprobado: sin errores (hay advertencias)"
              : "✗ Con errores: revisa los hallazgos antes de transmitir"}
          </div>

          {CRITERIOS.map((criterio) => {
            const delCriterio = informe.hallazgos.filter(
              (h) => h.criterio === criterio,
            );
            if (delCriterio.length === 0) return null;
            return (
              <div key={criterio} style={{ marginTop: "0.85rem" }}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "0.35rem",
                  }}
                >
                  {ETIQUETA_CRITERIO[criterio]}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {delCriterio.map((h, i) => {
                    const esErr = h.severidad === "ERROR";
                    return (
                      <li
                        key={`${h.codigo}-${i}`}
                        style={{
                          padding: "0.55rem 0.8rem",
                          marginBottom: "0.4rem",
                          borderRadius: 8,
                          fontSize: "0.85rem",
                          background: esErr ? "#fef2f2" : "#fffbeb",
                          border: `1px solid ${esErr ? "#fecaca" : "#fde68a"}`,
                          color: esErr ? "#991b1b" : "#b45309",
                        }}
                      >
                        <strong>
                          [{h.codigo}] {h.severidad}
                        </strong>{" "}
                        — {h.mensaje}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PrevalidarBoton;
