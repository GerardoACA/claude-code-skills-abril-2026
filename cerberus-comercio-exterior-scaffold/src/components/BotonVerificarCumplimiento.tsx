// CERBERUS COMERCIO EXTERIOR — boton "Verificar todo" cumplimiento (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/BotonVerificarCumplimiento.tsx
// Proposito: Boton client-side que dispara POST a /api/clientes/[id]/cumplimiento
//            (verifica las 6 fuentes) y, al terminar, refresca el Server Component
//            contenedor (router.refresh) para que la tabla/semaforo se actualice.
//
// DECISION C9 — ES ALERTA, NO BLOQUEO: este boton solo pide MARCAR/REGISTRAR el
// estado de cumplimiento. Nunca bloquea la operacion; si el backend devuelve
// ALERTA/INHABILITADO se muestra "alerta registrada", jamas se impide nada.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RespuestaOk = {
  ok: true;
  bloqueado: boolean;
  hayAlerta: boolean;
  rfc: string;
  mensaje: string;
  resultados: {
    fuente: string;
    resultado: string;
    detalle: string | null;
    registroId: string;
  }[];
};

type Props = { clienteId: string };

export function BotonVerificarCumplimiento({ clienteId }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [hayAlerta, setHayAlerta] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function verificar(): Promise<void> {
    setCargando(true);
    setMensaje(null);
    setHayAlerta(false);
    setError(null);
    try {
      const resp = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/cumplimiento`,
        { method: "POST" },
      );
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        setError(cuerpo?.error ?? "No se pudo completar la verificacion de cumplimiento");
        return;
      }
      const data = (await resp.json()) as RespuestaOk;
      setMensaje(data.mensaje);
      setHayAlerta(data.hayAlerta);
      // Refresca el Server Component para reflejar los resultados recien registrados.
      router.refresh();
    } catch {
      setError("Error de red al verificar cumplimiento");
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
        {cargando ? "Verificando..." : "Verificar todo"}
      </button>

      {mensaje ? (
        <p
          style={{
            marginTop: "0.75rem",
            color: hayAlerta ? "#92400e" : "#065f46",
            fontSize: "0.9rem",
          }}
        >
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
        registra el estado de cumplimiento; nunca impide operaciones. El
        responsable decide.
      </p>
    </div>
  );
}
