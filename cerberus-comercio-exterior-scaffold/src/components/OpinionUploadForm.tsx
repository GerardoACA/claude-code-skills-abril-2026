"use client";

// CERBERUS COMERCIO EXTERIOR — Form ingesta + validación de la opinión 32-D. NO es SIDF.
// =============================================================================
// Archivo:  src/components/OpinionUploadForm.tsx  (Incremento 22)
// Propósito: Client component para INGESTAR el texto de la opinión de
//            cumplimiento (32-D) que el cliente entrega impresa/PDF y ver el
//            veredicto de autenticidad + el resultado del cotejo en vivo. El
//            usuario pega el texto (o sube un .txt); el análisis y el cotejo
//            ocurren en el servidor. Postea a /api/clientes/[id]/opinion.
// =============================================================================

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export type OpinionUploadFormProps = { clienteId: string };

type Check = { check: string; ok: boolean; detalle: string };
type Veredicto = "AUTENTICA" | "SOSPECHOSA" | "NO_AUTENTICA" | "NO_VERIFICABLE";

type RespuestaOk = {
  ok: true;
  veredicto: Veredicto;
  resumen: string;
  checks: Check[];
  extraido: { rfc: string | null; folio: string | null; sentido: string; fechaEmision: string | null };
  cotejo: { estado: string; detalle: string };
  opinion32d: { resultado: string; detalle: string };
};

const COLOR: Record<Veredicto, { fondo: string; borde: string; texto: string }> = {
  AUTENTICA: { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46" },
  SOSPECHOSA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e" },
  NO_AUTENTICA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c" },
  NO_VERIFICABLE: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" },
};

export function OpinionUploadForm({ clienteId }: OpinionUploadFormProps) {
  const router = useRouter();
  const [texto, setTexto] = useState<string>("");
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaOk | null>(null);

  async function alSeleccionarArchivo(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    // Se lee como texto: sirve para .txt o para el texto exportado de un PDF.
    // Para un PDF binario, pega el texto en el área de abajo.
    try {
      const t = await file.text();
      if (t.trim().length > 0) setTexto(t);
    } catch {
      setError("No se pudo leer el archivo como texto. Pega el contenido en el área de abajo.");
    }
  }

  async function enviar(): Promise<void> {
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/opinion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), ...(nombreArchivo ? { nombreArchivo } : {}) }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `No se pudo procesar (HTTP ${res.status}).`;
        setError(msg);
        return;
      }
      setResultado(data as RespuestaOk);
      setTexto("");
      setNombreArchivo("");
      router.refresh();
    } catch {
      setError("Error de red al contactar el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.65rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.95rem",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.85rem",
    color: "#334155",
    margin: "0.75rem 0 0.25rem",
  };

  return (
    <div style={{ padding: "1.25rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, marginTop: "0.75rem" }}>
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          color: "#1e40af",
          fontSize: "0.85rem",
          marginBottom: "1rem",
        }}
      >
        Pega el texto de la <strong>opinión de cumplimiento (32-D)</strong> que el
        cliente entregó (del PDF/impreso). La IA valida su autenticidad
        (marcadores del SAT, folio, RFC, sentido) para detectar documentos falsos;
        el <strong>cotejo en vivo por folio ante el SAT</strong> lo ratifica cuando
        se conecte (no requiere la e.firma del cliente).
      </div>

      <label htmlFor="op-file" style={labelStyle}>
        Archivo de texto (.txt) o texto exportado del PDF
      </label>
      <input
        id="op-file"
        type="file"
        accept=".txt,.text"
        disabled={enviando}
        onChange={(e) => void alSeleccionarArchivo(e)}
        style={inputStyle}
      />

      <label htmlFor="op-texto" style={labelStyle}>
        …o pega aquí el texto completo de la opinión
      </label>
      <textarea
        id="op-texto"
        value={texto}
        disabled={enviando}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Servicio de Administración Tributaria — Opinión del cumplimiento de obligaciones fiscales (art. 32-D)…"
        rows={8}
        style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.78rem" }}
      />

      <button
        type="button"
        disabled={enviando || texto.trim().length < 40}
        onClick={() => void enviar()}
        style={{
          marginTop: "1rem",
          padding: "0.6rem 1.1rem",
          background: enviando || texto.trim().length < 40 ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Validando…" : "Ingerir y validar autenticidad"}
      </button>

      {error !== null && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {resultado !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.9rem 1.1rem",
            background: COLOR[resultado.veredicto].fondo,
            border: `1px solid ${COLOR[resultado.veredicto].borde}`,
            borderRadius: 8,
            color: COLOR[resultado.veredicto].texto,
          }}
        >
          <strong>Veredicto: {resultado.veredicto}</strong> — {resultado.resumen}
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
            {resultado.checks.map((c, i) => (
              <li key={`${c.check}-${i}`}>
                {c.ok ? "✓" : "✗"} <code style={{ fontSize: "0.8rem" }}>{c.check}</code>: {c.detalle}
              </li>
            ))}
          </ul>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            Extraído — RFC: <strong>{resultado.extraido.rfc ?? "—"}</strong> · Folio:{" "}
            <strong>{resultado.extraido.folio ?? "—"}</strong> · Sentido:{" "}
            <strong>{resultado.extraido.sentido}</strong>
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            Cotejo en vivo: <strong>{resultado.cotejo.estado}</strong> — {resultado.cotejo.detalle}
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            Opinión 32-D → <strong>{resultado.opinion32d.resultado}</strong>. {resultado.opinion32d.detalle}
          </p>
        </div>
      )}
    </div>
  );
}

export default OpinionUploadForm;
