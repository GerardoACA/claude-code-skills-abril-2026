"use client";

// CERBERUS COMERCIO EXTERIOR — Alta de Operación (Client Component). NO es SIDF.
// =============================================================================
// Archivo:  src/components/OperacionForm.tsx
// Proposito: Formulario controlado para crear una Operacion de despacho. Recibe la
//            lista de clientes del tenant como prop (cargada por el server wrapper
//            en src/app/operaciones/nueva/page.tsx) y postea a /api/operaciones.
//            El tenantId NUNCA se envia desde aqui: lo deriva el route handler del
//            JWT verificado. Al exito redirige a /operaciones; en error muestra el
//            mensaje del handler.
//
// Campos: clienteId (selección de la lista) y referencia (obligatorios). El estado
// de la operación no se elige: nace en ARMADO (@default del schema).
// =============================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

/** Cliente seleccionable, provisto por el server wrapper. */
export type ClienteOpcion = {
  id: string;
  rfc: string;
  razonSocial: string;
};

type Props = {
  clientes: ClienteOpcion[];
};

type RespuestaOk = { ok: true; operacion: { id: string; referencia: string } };
type RespuestaError = { error?: string };

export default function OperacionForm({ clientes }: Props) {
  const router = useRouter();

  const [clienteId, setClienteId] = useState<string>("");
  const [referencia, setReferencia] = useState<string>("");

  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<boolean>(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setExito(false);

    if (clienteId.length === 0) {
      setError("Selecciona un cliente");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/operaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, referencia }),
      });

      if (!res.ok) {
        const cuerpo: RespuestaError = (await res
          .json()
          .catch(() => ({}))) as RespuestaError;
        setError(cuerpo.error ?? `Error ${res.status}`);
        return;
      }

      (await res.json().catch(() => ({}))) as RespuestaOk | RespuestaError;
      setExito(true);
      router.push("/operaciones");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  const etiqueta: React.CSSProperties = {
    display: "block",
    fontSize: "0.9rem",
    color: "#334155",
    marginBottom: "0.25rem",
    fontWeight: 600,
  };
  const campo: React.CSSProperties = {
    width: "100%",
    padding: "0.55rem 0.7rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "1rem",
    marginBottom: "1.1rem",
    boxSizing: "border-box",
  };

  return (
    <>
      {error !== null ? (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {exito ? (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            color: "#065f46",
            marginBottom: "1.25rem",
          }}
        >
          Operación creada. Redirigiendo…
        </div>
      ) : null}

      {clientes.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>
          No hay clientes registrados para este tenant.{" "}
          <a href="/clientes/nuevo" style={{ color: "#2563eb" }}>
            Registra un cliente
          </a>{" "}
          antes de crear una operación.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="clienteId" style={etiqueta}>
            Cliente / importador
          </label>
          <select
            id="clienteId"
            name="clienteId"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            required
            style={campo}
          >
            <option value="">— Selecciona un cliente —</option>
            {clientes.map((c: ClienteOpcion) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial} ({c.rfc})
              </option>
            ))}
          </select>

          <label htmlFor="referencia" style={etiqueta}>
            Referencia interna del despacho
          </label>
          <input
            id="referencia"
            name="referencia"
            type="text"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
            placeholder="p. ej. REF-2026-0001"
            style={campo}
          />

          <button
            type="submit"
            disabled={enviando}
            style={{
              background: enviando ? "#93c5fd" : "#2563eb",
              color: "#fff",
              padding: "0.6rem 1.2rem",
              border: "none",
              borderRadius: 6,
              fontSize: "1rem",
              cursor: enviando ? "default" : "pointer",
            }}
          >
            {enviando ? "Creando…" : "Crear operación"}
          </button>
        </form>
      )}
    </>
  );
}
