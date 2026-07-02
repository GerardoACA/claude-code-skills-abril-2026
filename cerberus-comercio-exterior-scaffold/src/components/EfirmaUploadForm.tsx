"use client";

// CERBERUS COMERCIO EXTERIOR — Form de entrega + validación de e.firma. NO es SIDF.
// =============================================================================
// Archivo:  src/components/EfirmaUploadForm.tsx  (Incremento 20)
// Propósito: Client component para ENTREGAR el certificado PÚBLICO de e.firma
//            (.cer) de un cliente/proveedor y ver el veredicto de autenticidad
//            que devuelve el validador automático. Acepta un archivo .cer/.pem
//            (se envía como base64/PEM) o texto PEM pegado, y un sentido de
//            opinión 32-D opcional. Postea a /api/clientes/[id]/efirma.
//
// SEGURIDAD (C14): se advierte de forma prominente que NUNCA se debe subir la
// clave privada (.key); el servidor además la rechaza. Solo el .cer público.
// =============================================================================

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export type EfirmaUploadFormProps = {
  clienteId: string;
};

type CheckEfirma = { check: string; ok: boolean; detalle: string };
type Veredicto = "VALIDA" | "ALERTA" | "INVALIDA" | "NO_VERIFICABLE";

type RespuestaOk = {
  ok: true;
  veredicto: Veredicto;
  resumen: string;
  checks: CheckEfirma[];
  certificado: {
    rfc: string | null;
    titular: string | null;
    serie: string | null;
    emisor: string | null;
    validoDesde: string | null;
    validoHasta: string | null;
  };
  opinion32d: { resultado: string; detalle: string };
};

const SENTIDOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "— No declarar (solo validar e.firma) —" },
  { valor: "POSITIVA", etiqueta: "Positiva" },
  { valor: "SIN_OBLIGACIONES", etiqueta: "Sin obligaciones" },
  { valor: "NEGATIVA", etiqueta: "Negativa" },
  { valor: "NO_INSCRITO", etiqueta: "No inscrito" },
];

/** ArrayBuffer → base64 (sin dependencias). */
function bufferABase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const COLOR_VEREDICTO: Record<Veredicto, { fondo: string; borde: string; texto: string }> = {
  VALIDA: { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46" },
  ALERTA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e" },
  INVALIDA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c" },
  NO_VERIFICABLE: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" },
};

export function EfirmaUploadForm({ clienteId }: EfirmaUploadFormProps) {
  const router = useRouter();
  const [contenido, setContenido] = useState<string>("");
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [sentido, setSentido] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaOk | null>(null);

  async function alSeleccionarArchivo(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNombreArchivo(file.name);
    const buf = await file.arrayBuffer();
    // Detecta PEM (texto) vs DER (binario): si empieza con "-----BEGIN", envía texto.
    const comoTexto = new TextDecoder().decode(buf.slice(0, 40));
    if (comoTexto.includes("BEGIN CERTIFICATE")) {
      setContenido(new TextDecoder().decode(buf));
    } else {
      setContenido(bufferABase64(buf));
    }
  }

  async function enviar(): Promise<void> {
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/efirma`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contenido: contenido.trim(),
            ...(nombreArchivo ? { nombreArchivo } : {}),
            ...(sentido ? { sentidoOpinion: sentido } : {}),
          }),
        },
      );
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
      setContenido("");
      setNombreArchivo("");
      setSentido("");
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
    <div
      style={{
        padding: "1.25rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        marginTop: "0.75rem",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          color: "#991b1b",
          fontSize: "0.85rem",
          marginBottom: "1rem",
        }}
      >
        <strong>Nunca subas la clave privada (.key)</strong> ni su contraseña.
        Solo el <strong>certificado público (.cer)</strong>. El sistema rechaza
        cualquier material privado (decisión C14).
      </div>

      <label htmlFor="efirma-file" style={labelStyle}>
        Certificado público (.cer / .pem)
      </label>
      <input
        id="efirma-file"
        type="file"
        accept=".cer,.pem,.crt,.der"
        disabled={enviando}
        onChange={(e) => void alSeleccionarArchivo(e)}
        style={inputStyle}
      />

      <label htmlFor="efirma-pem" style={labelStyle}>
        …o pega el certificado en formato PEM
      </label>
      <textarea
        id="efirma-pem"
        value={contenido}
        disabled={enviando}
        onChange={(e) => setContenido(e.target.value)}
        placeholder="-----BEGIN CERTIFICATE-----"
        rows={4}
        style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.75rem" }}
      />

      <label htmlFor="efirma-sentido" style={labelStyle}>
        Sentido de la opinión 32-D declarado por el cliente (opcional)
      </label>
      <select
        id="efirma-sentido"
        value={sentido}
        disabled={enviando}
        onChange={(e) => setSentido(e.target.value)}
        style={inputStyle}
      >
        {SENTIDOS.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.etiqueta}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={enviando || contenido.trim().length === 0}
        onClick={() => void enviar()}
        style={{
          marginTop: "1rem",
          padding: "0.6rem 1.1rem",
          background: enviando || contenido.trim().length === 0 ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Validando…" : "Entregar y validar autenticidad"}
      </button>

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

      {resultado !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.9rem 1.1rem",
            background: COLOR_VEREDICTO[resultado.veredicto].fondo,
            border: `1px solid ${COLOR_VEREDICTO[resultado.veredicto].borde}`,
            borderRadius: 8,
            color: COLOR_VEREDICTO[resultado.veredicto].texto,
          }}
        >
          <strong>Veredicto: {resultado.veredicto}</strong> — {resultado.resumen}
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
            {resultado.checks.map((c, i) => (
              <li key={`${c.check}-${i}`}>
                {c.ok ? "✓" : "✗"} <code style={{ fontSize: "0.8rem" }}>{c.check}</code>:{" "}
                {c.detalle}
              </li>
            ))}
          </ul>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            Opinión 32-D → <strong>{resultado.opinion32d.resultado}</strong>.{" "}
            {resultado.opinion32d.detalle}
          </p>
        </div>
      )}
    </div>
  );
}

export default EfirmaUploadForm;
