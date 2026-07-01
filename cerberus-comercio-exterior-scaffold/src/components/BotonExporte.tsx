// CERBERUS COMERCIO EXTERIOR — botón "Generar exporte probatorio" (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/BotonExporte.tsx
// Propósito: Botón client-side que hace fetch (GET) al route del exporte
//            (/api/operaciones/[id]/exporte) y, con la respuesta (JSON canónico
//            del PaqueteProbatorio), dispara la DESCARGA de un archivo local
//            `exporte-<referencia>.json` usando un Blob + un enlace temporal.
//
// No re-parsea ni re-serializa el JSON del paquete: se descarga EXACTAMENTE el
// texto canónico que produjo el servidor, para preservar la canonicalización que
// respalda el `selloPaquete` (que un perito verificará sobre este mismo texto).
// =============================================================================
"use client";

import { useState } from "react";

type Props = {
  operacionId: string;
  /** Referencia legible de la operación; se usa para nombrar el archivo. */
  referencia: string;
};

/** Sanitiza la referencia para un nombre de archivo seguro y estable. */
function nombreArchivo(referencia: string): string {
  const base = referencia.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  const limpia = base.replace(/^-+|-+$/g, "") || "operacion";
  return `exporte-${limpia}.json`;
}

export function BotonExporte({ operacionId, referencia }: Props) {
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean>(false);

  async function generar(): Promise<void> {
    setCargando(true);
    setError(null);
    setOk(false);
    try {
      const resp = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/exporte`,
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(cuerpo?.error ?? "No se pudo generar el exporte probatorio");
        return;
      }

      // Texto canónico tal cual lo emitió el servidor (no re-serializar).
      const texto: string = await resp.text();

      const blob = new Blob([texto], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo(referencia);
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        // Liberar el objeto URL tras disparar la descarga.
        URL.revokeObjectURL(url);
      }
      setOk(true);
    } catch {
      setError("Error de red al generar el exporte probatorio");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generar}
        disabled={cargando}
        style={{
          border: "1px solid #2563eb",
          background: cargando ? "#eff6ff" : "#2563eb",
          color: cargando ? "#2563eb" : "#fff",
          borderRadius: 6,
          padding: "0.6rem 1.2rem",
          fontSize: "0.95rem",
          cursor: cargando ? "wait" : "pointer",
        }}
      >
        {cargando ? "Generando..." : "Generar exporte probatorio"}
      </button>

      {ok ? (
        <p style={{ marginTop: "0.75rem", color: "#065f46", fontSize: "0.9rem" }}>
          Exporte generado y descargado como{" "}
          <code>{nombreArchivo(referencia)}</code>.
        </p>
      ) : null}
      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        El paquete es autocontenido y verificable por un perito tercero (SHA-256,
        cadena append-only y sello del paquete) sin acceso al sistema vivo.
      </p>
    </div>
  );
}
