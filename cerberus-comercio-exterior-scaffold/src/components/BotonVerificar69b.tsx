// CERBERUS COMERCIO EXTERIOR — boton de verificacion 69-B (client component). NO es SIDF.
// =============================================================================
// Archivo:  src/components/BotonVerificar69b.tsx
// Proposito: Boton client-side que dispara POST a /api/clientes/[id]/verificar-69b
//            y, al terminar, refresca el Server Component contenedor (router.refresh)
//            para que el estado 69-B mostrado se actualice.
//
// DECISION C9 — ES ALERTA, NO BLOQUEO: este boton solo pide MARCAR/REGISTRAR el
// estado 69-B. Nunca bloquea la operacion; si el backend devuelve PRESUNTO/DEFINITIVO
// se muestra "alerta registrada", jamas se impide nada al usuario.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RespuestaOk = {
  ok: true;
  bloqueado: boolean;
  resultado: string;
  mensaje: string;
  alertaId?: string;
  snapshotSha256: string;
  snapshotFecha: string;
};

type Props = { clienteId: string };

export function BotonVerificar69b({ clienteId }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verificar(): Promise<void> {
    setCargando(true);
    setMensaje(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/verificar-69b`,
        { method: "POST" },
      );
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        setError(cuerpo?.error ?? "No se pudo completar la verificacion 69-B");
        return;
      }
      const data = (await resp.json()) as RespuestaOk;
      setMensaje(data.mensaje);
      // Refresca el Server Component para reflejar el estado 69-B recien registrado.
      router.refresh();
    } catch {
      setError("Error de red al verificar 69-B");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={verificar}
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
        {cargando ? "Verificando..." : "Verificar 69-B"}
      </button>

      {mensaje ? (
        <p style={{ marginTop: "0.75rem", color: "#065f46", fontSize: "0.9rem" }}>
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        Es una <strong>alerta</strong>, no un bloqueo: el sistema solo marca y
        registra el estado 69-B; el responsable decide.
      </p>
    </div>
  );
}
