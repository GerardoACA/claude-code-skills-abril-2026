"use client";

// CERBERUS COMERCIO EXTERIOR — botón "Reintentar cotejo" de una opinión ingestada. NO es SIDF.
// =============================================================================
// Archivo:  src/components/RecotejarOpinionBoton.tsx  (Incremento 57)
// Propósito: Re-ejecutar el cotejo en vivo ante el SAT de una opinión 32-D YA
//            ingestada, sin volver a subir el PDF (POST
//            api/clientes/[id]/opinion/[opinionId]/cotejar). Si el QR nunca se
//            detectó (no hay URL guardada en cotejoDetalle) muestra un campo
//            para pegar la URL del validador: el capturista escanea el QR con
//            su teléfono UNA vez y la pega — no la vuelve a teclear jamás
//            (principio de captura asistida). C9: informa, nunca bloquea.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RecotejarOpinionBotonProps = {
  clienteId: string;
  opinionId: string;
  /** true si la opinión NO tiene URL del validador guardada (QR no detectado). */
  pedirUrl: boolean;
};

type RespuestaCotejar = {
  ok: true;
  cotejo: { estado: string; detalle: string; url: string | null };
  advertencias: string[];
};

export function RecotejarOpinionBoton({ clienteId, opinionId, pedirUrl }: RecotejarOpinionBotonProps) {
  const router = useRouter();
  const [url, setUrl] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esError, setEsError] = useState<boolean>(false);

  const faltaUrl = pedirUrl && url.trim().length === 0;

  async function recotejar(): Promise<void> {
    setEnviando(true);
    setMensaje(null);
    setEsError(false);
    try {
      const res = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/opinion/${encodeURIComponent(opinionId)}/cotejar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(url.trim().length > 0 ? { urlQr: url.trim() } : {}),
        },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `No se pudo re-cotejar (HTTP ${res.status}).`;
        setEsError(true);
        setMensaje(msg);
        return;
      }
      const r = data as RespuestaCotejar;
      setMensaje(`Cotejo: ${r.cotejo.estado}. ${r.advertencias.join(" ")}`.trim());
      router.refresh();
    } catch {
      setEsError(true);
      setMensaje("Error de red al contactar el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: "0.35rem" }}>
      {pedirUrl && (
        <input
          type="url"
          value={url}
          disabled={enviando}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pega la URL del QR (https://…sat.gob.mx/…)"
          title="El QR no se pudo leer del PDF: escanéalo con tu teléfono y pega aquí la URL del validador del SAT."
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "0.25rem 0.4rem",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            fontSize: "0.72rem",
            marginBottom: "0.25rem",
          }}
        />
      )}
      <button
        type="button"
        disabled={enviando || faltaUrl}
        onClick={() => void recotejar()}
        title={
          faltaUrl
            ? "Esta opinión no tiene URL del validador guardada: pega la del QR para poder cotejar."
            : "Vuelve a consultar el validador del SAT con la URL del QR de esta opinión."
        }
        style={{
          padding: "0.2rem 0.55rem",
          background: enviando || faltaUrl ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: enviando || faltaUrl ? "not-allowed" : "pointer",
          fontSize: "0.72rem",
        }}
      >
        {enviando ? "Cotejando…" : "Reintentar cotejo"}
      </button>
      {mensaje !== null && (
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.7rem",
            color: esError ? "#b91c1c" : "#475569",
          }}
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}

export default RecotejarOpinionBoton;
