"use client";

// CERBERUS COMERCIO EXTERIOR — Form ingesta + validación de la opinión de cumplimiento. NO es SIDF.
// =============================================================================
// Archivo:  src/components/OpinionUploadForm.tsx  (Incrementos 22/26/29)
// Propósito: Ingerir la opinión de cumplimiento (SAT 32-D o IMSS) y ver el
//            veredicto de autenticidad + el cotejo del sello. Método PRINCIPAL:
//            subir el PDF — el servidor extrae la Cadena Original y el Sello,
//            detecta el emisor, valida y coteja (SAT: verificación criptográfica
//            del sello con el certificado descargado por serie). Como respaldo
//            manual (plegable) se puede pegar el texto o la URL del QR.
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
  extraido: { emisor: string; rfc: string | null; folio: string | null; sentido: string; fechaEmision: string | null };
  cotejo: { estado: string; detalle: string; url: string | null };
  opinion32d: { resultado: string; detalle: string };
  /** URL del QR leída automáticamente del propio PDF (Inc 49B), si se detectó. */
  urlQrDetectada: string | null;
};

const COLOR: Record<Veredicto, { fondo: string; borde: string; texto: string }> = {
  AUTENTICA: { fondo: "#ecfdf5", borde: "#a7f3d0", texto: "#065f46" },
  SOSPECHOSA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e" },
  NO_AUTENTICA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#b91c1c" },
  NO_VERIFICABLE: { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" },
};

/** ArrayBuffer -> base64 (sin dependencias). */
function bufABase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function OpinionUploadForm({ clienteId }: OpinionUploadFormProps) {
  const router = useRouter();
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [pdfEstado, setPdfEstado] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [texto, setTexto] = useState<string>("");
  const [urlQr, setUrlQr] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaOk | null>(null);

  async function alSeleccionarPdf(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNombreArchivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      setPdfBase64(bufABase64(buf));
      setPdfEstado(`${file.name} (${Math.round(file.size / 1024)} KB) listo. Se extraerán cadena original y sello.`);
    } catch {
      setPdfEstado(null);
      setError("No se pudo leer el PDF.");
    }
  }

  const listo = pdfBase64.length > 0 || texto.trim().length >= 40 || urlQr.trim().length > 0;

  async function enviar(): Promise<void> {
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/opinion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(pdfBase64 ? { pdfBase64 } : {}),
          ...(texto.trim() ? { texto: texto.trim() } : {}),
          ...(nombreArchivo ? { nombreArchivo } : {}),
          ...(urlQr.trim() ? { urlQr: urlQr.trim() } : {}),
        }),
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
      setPdfBase64("");
      setPdfEstado(null);
      setNombreArchivo("");
      setTexto("");
      setUrlQr("");
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
        Sube el <strong>PDF</strong> de la opinión de cumplimiento —del{" "}
        <strong>SAT (32-D)</strong> o del <strong>IMSS</strong>—. El PDF ya trae la{" "}
        <strong>Cadena Original</strong>, el <strong>Sello Digital</strong> y el QR:
        el sistema los extrae, detecta el emisor, valida la autenticidad y{" "}
        <strong>coteja el sello criptográficamente</strong> (para el SAT, con el
        certificado que descarga del repositorio oficial por número de serie).
      </div>

      <label htmlFor="op-pdf" style={{ ...labelStyle, marginTop: 0 }}>
        <strong>PDF de la opinión</strong> (SAT o IMSS)
      </label>
      <input
        id="op-pdf"
        type="file"
        accept="application/pdf,.pdf"
        disabled={enviando}
        onChange={(e) => void alSeleccionarPdf(e)}
        style={inputStyle}
      />
      {pdfEstado !== null && (
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#065f46" }}>✓ {pdfEstado}</p>
      )}

      <button
        type="button"
        disabled={enviando || !listo}
        onClick={() => void enviar()}
        style={{
          marginTop: "1rem",
          padding: "0.6rem 1.1rem",
          background: enviando || !listo ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando || !listo ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Validando…" : "Ingerir y validar autenticidad"}
      </button>

      {/* Respaldo manual, plegado por defecto: solo si NO se tiene el PDF. */}
      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "#475569" }}>
          ¿No tienes el PDF? Opciones manuales
        </summary>
        <label htmlFor="op-texto" style={labelStyle}>
          Pega el texto de la opinión (mín. 40 caracteres)
        </label>
        <textarea
          id="op-texto"
          value={texto}
          disabled={enviando}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Servicio de Administración Tributaria — Opinión del cumplimiento… (o el texto del IMSS)"
          rows={6}
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.78rem" }}
        />
        <label htmlFor="op-urlqr" style={labelStyle}>
          …o pega la URL del QR (para el cotejo en vivo del SAT)
        </label>
        <input
          id="op-urlqr"
          type="url"
          value={urlQr}
          disabled={enviando}
          onChange={(e) => setUrlQr(e.target.value)}
          placeholder="https://…sat.gob.mx/…"
          style={inputStyle}
        />
      </details>

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
            Emisor: <strong>{resultado.extraido.emisor}</strong> · RFC:{" "}
            <strong>{resultado.extraido.rfc ?? "—"}</strong> · Folio:{" "}
            <strong>{resultado.extraido.folio ?? "—"}</strong> · Sentido:{" "}
            <strong>{resultado.extraido.sentido}</strong>
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            Cotejo: <strong>{resultado.cotejo.estado}</strong> — {resultado.cotejo.detalle}
            {resultado.urlQrDetectada !== null && (
              <> (QR leído automáticamente del PDF)</>
            )}
          </p>
          {resultado.cotejo.url !== null && (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              <a
                href={resultado.cotejo.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1d4ed8", fontWeight: 600 }}
              >
                Abrir cotejo en el portal del SAT →
              </a>
            </p>
          )}
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
            Opinión 32-D → <strong>{resultado.opinion32d.resultado}</strong>. {resultado.opinion32d.detalle}
          </p>
        </div>
      )}
    </div>
  );
}

export default OpinionUploadForm;
