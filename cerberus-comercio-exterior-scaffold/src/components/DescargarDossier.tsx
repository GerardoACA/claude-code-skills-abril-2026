// CERBERUS COMERCIO EXTERIOR — botón "Descargar dossier de diligencia" (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/DescargarDossier.tsx  (Agente UI-DOSSIER, Incremento 9)
// Propósito: Botón client-side que hace fetch (GET) al route del dossier
//            (/api/operaciones/[id]/dossier), lee el header `X-Dossier-Match` y
//            descarga el paquete regenerado como `dossier-<referencia>.json`
//            (Blob + enlace temporal).
//
// Cotejo (header X-Dossier-Match):
//   "true"        → el paquete regenerado coincide con el sha256 sellado.
//   "false"       → DIFIERE del sellado: se muestra ADVERTENCIA — hubo evidencia
//                   posterior al sellado del dossier (eso también es señal).
//   "sin-dossier" → la operación aún no tiene un dossier sellado.
//
// No re-parsea ni re-serializa el JSON del paquete: se descarga EXACTAMENTE el
// texto canónico del servidor, para preservar el `selloPaquete`.
// =============================================================================
"use client";

import { useState } from "react";

type Props = {
  operacionId: string;
  /** Referencia legible de la operación; se usa para nombrar el archivo. */
  referencia: string;
};

type Cotejo = "true" | "false" | "sin-dossier";

/** Sanitiza la referencia para un nombre de archivo seguro y estable. */
function nombreArchivo(referencia: string): string {
  const base = referencia.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  const limpia = base.replace(/^-+|-+$/g, "") || "operacion";
  return `dossier-${limpia}.json`;
}

export function DescargarDossier({ operacionId, referencia }: Props) {
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cotejo, setCotejo] = useState<Cotejo | null>(null);

  async function descargar(): Promise<void> {
    setCargando(true);
    setError(null);
    setCotejo(null);
    try {
      const resp = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/dossier`,
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(cuerpo?.error ?? "No se pudo regenerar el dossier de diligencia");
        return;
      }

      // Veredicto del cotejo regenerado-vs-sellado (header del route).
      const match: string | null = resp.headers.get("X-Dossier-Match");
      const veredicto: Cotejo =
        match === "true" || match === "false" || match === "sin-dossier"
          ? match
          : "sin-dossier";

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
      setCotejo(veredicto);
    } catch {
      setError("Error de red al descargar el dossier de diligencia");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={descargar}
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
        {cargando ? "Regenerando..." : "Descargar dossier (regenerado)"}
      </button>

      {cotejo === "true" ? (
        <p style={{ marginTop: "0.75rem", color: "#065f46", fontSize: "0.9rem" }}>
          Dossier descargado como <code>{nombreArchivo(referencia)}</code>. El
          paquete regenerado COINCIDE con el sha256 sellado del último dossier.
        </p>
      ) : null}
      {cotejo === "false" ? (
        <p
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.75rem",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 6,
            color: "#92400e",
            fontSize: "0.9rem",
          }}
        >
          Advertencia: el paquete regenerado DIFIERE del sha256 sellado en el
          dossier. Esto indica que se registró evidencia posterior al sellado
          (también es señal probatoria). El sha256 sellado sigue anclando el
          contenido del momento de la diligencia.
        </p>
      ) : null}
      {cotejo === "sin-dossier" ? (
        <p style={{ marginTop: "0.75rem", color: "#64748b", fontSize: "0.9rem" }}>
          Dossier descargado como <code>{nombreArchivo(referencia)}</code>. Esta
          operación aún no tiene un dossier sellado con el cual cotejar (se
          genera automáticamente al caer en ROJO o INCIDENCIA).
        </p>
      ) : null}
      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        El JSON se regenera desde la evidencia viva; el sha256 sellado en el
        Documento del dossier ancla el contenido del momento de la diligencia.
      </p>
    </div>
  );
}
