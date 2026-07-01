"use client";

// CERBERUS COMERCIO EXTERIOR — Alta de Cliente (Client Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/nuevo/page.tsx
// Proposito: Formulario controlado para dar de alta un Cliente/Importador. Postea
//            a /api/clientes (POST). El tenantId NUNCA se envia desde aqui: lo
//            deriva el route handler del JWT verificado. Al exito redirige a
//            /clientes; en error muestra el mensaje del handler.
//
// Campos: rfc, razonSocial (obligatorios) y domicilioOperacionesCE (texto libre,
// opcional). El domicilio se envia por UX pero el modelo Cliente aun no lo
// persiste (ver nota en src/app/api/clientes/route.ts): no se toca el schema.
// =============================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

type RespuestaOk = { ok: true; cliente: { id: string; rfc: string } };
type RespuestaError = { error?: string };

export default function NuevoClientePage() {
  const router = useRouter();

  const [rfc, setRfc] = useState<string>("");
  const [razonSocial, setRazonSocial] = useState<string>("");
  const [domicilioOperacionesCE, setDomicilioOperacionesCE] = useState<string>("");

  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<boolean>(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setExito(false);
    setEnviando(true);

    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfc,
          razonSocial,
          // Solo se incluye si el usuario escribió algo (campo opcional).
          domicilioOperacionesCE:
            domicilioOperacionesCE.trim().length > 0
              ? domicilioOperacionesCE
              : undefined,
        }),
      });

      if (!res.ok) {
        const cuerpo: RespuestaError = (await res
          .json()
          .catch(() => ({}))) as RespuestaError;
        setError(cuerpo.error ?? `Error ${res.status}`);
        return;
      }

      // Éxito: consumimos la respuesta y redirigimos a la lista.
      (await res.json().catch(() => ({}))) as RespuestaOk | RespuestaError;
      setExito(true);
      router.push("/clientes");
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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb" }}>
          ← Clientes
        </a>
        <h1 style={{ fontSize: "1.75rem", marginTop: "0.75rem" }}>
          Registrar cliente / importador
        </h1>
      </header>

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
          Cliente registrado. Redirigiendo…
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="rfc" style={etiqueta}>
          RFC
        </label>
        <input
          id="rfc"
          name="rfc"
          type="text"
          value={rfc}
          onChange={(e) => setRfc(e.target.value)}
          required
          minLength={12}
          maxLength={13}
          autoComplete="off"
          placeholder="RFC (12-13 caracteres)"
          style={{ ...campo, fontFamily: "monospace", textTransform: "uppercase" }}
        />

        <label htmlFor="razonSocial" style={etiqueta}>
          Razón social
        </label>
        <input
          id="razonSocial"
          name="razonSocial"
          type="text"
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          required
          maxLength={400}
          placeholder="Razón social del importador"
          style={campo}
        />

        <label htmlFor="domicilioOperacionesCE" style={etiqueta}>
          Domicilio de operaciones de comercio exterior{" "}
          <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span>
        </label>
        <textarea
          id="domicilioOperacionesCE"
          name="domicilioOperacionesCE"
          value={domicilioOperacionesCE}
          onChange={(e) => setDomicilioOperacionesCE(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Texto libre"
          style={{ ...campo, resize: "vertical" }}
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
          {enviando ? "Registrando…" : "Registrar cliente"}
        </button>
      </form>
    </main>
  );
}
