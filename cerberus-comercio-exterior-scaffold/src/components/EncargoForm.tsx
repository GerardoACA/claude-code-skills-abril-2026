// CERBERUS COMERCIO EXTERIOR — Formulario Encargo Conferido (client component). NO es SIDF.
// ============================================================================
// Alta de un EncargoConferido (aviso de encargo B14/B21) para un cliente:
//   - tipo/formato: "B14" | "B21"
//   - vigenciaInicio (obligatoria)
//   - vigenciaFin (opcional)
// Postea a /api/clientes/[id]/encargo. El tenantId NO se envía: lo deriva el route
// handler del JWT verificado. Muestra estados de error y de éxito.
// ============================================================================

"use client";

import { useState, type CSSProperties } from "react";

// --------------------------------------------------------------------------
// Tipos compartidos con la página server (server -> client).
// --------------------------------------------------------------------------
export type ClienteResumen = {
  id: string;
  rfc: string;
  razonSocial: string;
};

/** Estado del encargo — espejo del enum EstadoEncargo del schema. */
export type EstadoEncargo = "VIGENTE" | "REVOCADO" | "VENCIDO";

export type EncargoResumen = {
  id: string;
  tipo: string;
  estado: EstadoEncargo;
  vigenciaInicio: string; // ISO
  vigenciaFin: string | null; // ISO
  aceptacionAgente: boolean;
  creadoEn: string; // ISO
};

type Props = {
  cliente: ClienteResumen;
};

/** Tipos de aviso de encargo soportados por el formulario. */
const TIPOS_ENCARGO = ["B14", "B21"] as const;
type TipoEncargo = (typeof TIPOS_ENCARGO)[number];

type ResultadoOk = {
  id: string;
  tipo: string;
  estado: EstadoEncargo;
  vigenciaInicio: string;
  vigenciaFin: string | null;
};

export function EncargoForm({ cliente }: Props) {
  const [tipo, setTipo] = useState<TipoEncargo>("B14");
  const [vigenciaInicio, setVigenciaInicio] = useState<string>("");
  const [vigenciaFin, setVigenciaFin] = useState<string>("");
  const [aceptacionAgente, setAceptacionAgente] = useState<boolean>(false);

  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoOk | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    if (!vigenciaInicio) {
      setError("La fecha de inicio de vigencia es obligatoria.");
      return;
    }
    if (vigenciaFin && vigenciaFin < vigenciaInicio) {
      setError("La fecha de fin no puede ser anterior a la de inicio.");
      return;
    }

    setEnviando(true);
    try {
      // El tenantId NO se envía: lo deriva el route handler del JWT verificado.
      const res = await fetch(`/api/clientes/${cliente.id}/encargo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          vigenciaInicio,
          vigenciaFin: vigenciaFin || undefined,
          aceptacionAgente,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "No se pudo registrar el encargo conferido";
        setError(msg);
        return;
      }
      const ok = (data as { encargo?: ResultadoOk }).encargo ?? (data as ResultadoOk);
      setResultado(ok);
    } catch {
      setError("Error de red al registrar el encargo conferido.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "0.5rem 0.65rem",
    marginTop: "0.25rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "0.95rem",
  };
  const labelStyle: CSSProperties = {
    display: "block",
    marginTop: "1rem",
    fontSize: "0.9rem",
    color: "#334155",
    fontWeight: 600,
  };

  // ------------------------------------------------------------------------
  // Estado terminal: encargo registrado.
  // ------------------------------------------------------------------------
  if (resultado) {
    return (
      <section
        aria-label="Encargo registrado"
        style={{
          padding: "1.25rem 1.5rem",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          color: "#065f46",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Encargo conferido registrado</h2>
        <p>
          Se registró el encargo <strong>{resultado.tipo}</strong> para{" "}
          <strong>{cliente.razonSocial}</strong> (<code>{cliente.rfc}</code>).
        </p>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.35rem 1rem",
          }}
        >
          <dt>Identificador</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>{resultado.id}</dd>
          <dt>Estado</dt>
          <dd style={{ margin: 0 }}>{resultado.estado}</dd>
          <dt>Vigencia inicio</dt>
          <dd style={{ margin: 0 }}>{resultado.vigenciaInicio.slice(0, 10)}</dd>
          <dt>Vigencia fin</dt>
          <dd style={{ margin: 0 }}>
            {resultado.vigenciaFin ? resultado.vigenciaFin.slice(0, 10) : "—"}
          </dd>
        </dl>
        <p style={{ marginBottom: 0 }}>
          <a href={`/clientes/${cliente.id}/encargo`} style={{ color: "#2563eb" }}>
            Ver encargos del cliente
          </a>{" "}
          ·{" "}
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Alta de encargo conferido">
      <h2 style={{ fontSize: "1.2rem" }}>Registrar encargo conferido</h2>
      <form onSubmit={enviar}>
        <label style={labelStyle}>
          Tipo / formato del aviso
          <select
            style={inputStyle}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoEncargo)}
          >
            {TIPOS_ENCARGO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Vigencia — inicio
          <input
            type="date"
            required
            style={inputStyle}
            value={vigenciaInicio}
            onChange={(e) => setVigenciaInicio(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Vigencia — fin (opcional)
          <input
            type="date"
            style={inputStyle}
            value={vigenciaFin}
            onChange={(e) => setVigenciaFin(e.target.value)}
          />
        </label>

        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <input
            type="checkbox"
            checked={aceptacionAgente}
            onChange={(e) => setAceptacionAgente(e.target.checked)}
          />
          El agente acepta el encargo
        </label>

        {error && (
          <p
            role="alert"
            style={{
              marginTop: "1rem",
              padding: "0.6rem 0.9rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              color: "#991b1b",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ marginTop: "1.75rem" }}>
          <button
            type="submit"
            disabled={enviando}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 6,
              border: "none",
              background: enviando ? "#94a3b8" : "#059669",
              color: "#fff",
              cursor: enviando ? "not-allowed" : "pointer",
            }}
          >
            {enviando ? "Registrando…" : "Registrar encargo"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default EncargoForm;
