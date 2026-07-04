// CERBERUS COMERCIO EXTERIOR — bóveda documental del expediente KYC. NO es SIDF.
// =============================================================================
// Archivo:  src/components/DocumentosKyc.tsx  (Incremento 43)
// Propósito: Client Component con el CHECKLIST de documentos del expediente
//            KYC 1.4.14 del cliente: por cada tipo del catálogo muestra si ya
//            hay documento subido (fecha + sha256 abreviado) o está pendiente,
//            resalta los OBLIGATORIOS según el tipo de persona (física/moral,
//            solo estado local) y permite subir PDF/imagen a la bóveda vía
//            /api/clientes/[id]/kyc/documentos (GET/POST multipart).
// =============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TIPOS_DOC_KYC,
  TIPO_DOC_KYC_ETIQUETA,
  documentosRequeridos,
  type TipoDocKyc,
  type TipoPersona,
} from "@/lib/documentos-kyc-catalogo";

interface DocumentoKyc {
  id: string;
  tipo: string;
  sha256: string;
  almacenado: boolean;
  vence: string | null;
  creadoEn: string;
}

interface Props {
  clienteId: string;
}

const card: React.CSSProperties = {
  padding: "1rem 1.1rem",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};
const label: React.CSSProperties = { fontSize: "0.78rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "0.25rem" };
const input: React.CSSProperties = { width: "100%", padding: "0.5rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" };

/** sha256 abreviado para el checklist (12 hex + elipsis). */
function shaCorto(sha: string): string {
  return `${sha.slice(0, 12)}…`;
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

export function DocumentosKyc({ clienteId }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoKyc[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>("MORAL");
  const [tipoSel, setTipoSel] = useState<TipoDocKyc>("IDENTIFICACION_OFICIAL");
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const base = useMemo(
    () => `/api/clientes/${encodeURIComponent(clienteId)}/kyc/documentos`,
    [clienteId],
  );
  const obligatorios = useMemo(() => documentosRequeridos(tipoPersona), [tipoPersona]);

  async function recargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : "No se pudo cargar";
        throw new Error(msg);
      }
      setDocumentos((data as { documentos?: DocumentoKyc[] }).documentos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function subir() {
    const archivo = archivoRef.current?.files?.[0];
    if (!archivo) {
      setResultado({ ok: false, detalle: "Selecciona un archivo (PDF o imagen)." });
      return;
    }
    setSubiendo(true);
    setResultado(null);
    try {
      const form = new FormData();
      form.set("tipo", tipoSel);
      form.set("file", archivo);
      const res = await fetch(base, { method: "POST", body: form });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : "No se pudo subir";
        throw new Error(msg);
      }
      const detalle =
        typeof data === "object" && data !== null && "detalle" in data
          ? String((data as { detalle: unknown }).detalle)
          : "Documento sellado y agregado al expediente.";
      setResultado({ ok: true, detalle });
      if (archivoRef.current) archivoRef.current.value = "";
      await recargar();
    } catch (e) {
      setResultado({ ok: false, detalle: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Tipo de persona: decide qué documentos son OBLIGATORIOS (estado local). */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ ...label, marginBottom: 0 }}>Tipo de persona</span>
        {(["FISICA", "MORAL"] as const).map((tp) => (
          <button
            type="button"
            key={tp}
            onClick={() => setTipoPersona(tp)}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: 999,
              border: `1px solid ${tipoPersona === tp ? "#2563eb" : "#cbd5e1"}`,
              background: tipoPersona === tp ? "#eff6ff" : "#fff",
              color: tipoPersona === tp ? "#1d4ed8" : "#475569",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tp === "FISICA" ? "Persona física" : "Persona moral"}
          </button>
        ))}
      </div>

      {/* Checklist por tipo documental del catálogo. */}
      <section style={card}>
        <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>
          Checklist del expediente
        </h3>
        {cargando ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Cargando…</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
            {TIPOS_DOC_KYC.map((tipo) => {
              const delTipo = documentos.filter((d) => d.tipo === tipo);
              const ultimo = delTipo[0] ?? null; // el GET viene ordenado desc
              const requerido = obligatorios.includes(tipo);
              return (
                <li
                  key={tipo}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    padding: "0.4rem 0.55rem",
                    borderRadius: 8,
                    background: requerido && ultimo === null ? "#fffbeb" : "transparent",
                  }}
                >
                  <span style={{ fontSize: "0.88rem", color: "#334155" }}>
                    {ultimo !== null ? "✅ " : "⚪ "}
                    {TIPO_DOC_KYC_ETIQUETA[tipo]}
                    {requerido && (
                      <span style={{ marginLeft: "0.5rem", padding: "0.08rem 0.45rem", borderRadius: 999, background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", fontSize: "0.68rem", fontWeight: 700 }}>
                        OBLIGATORIO
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {ultimo !== null ? (
                      <>
                        {fechaCorta(ultimo.creadoEn)} · <code style={{ fontFamily: "monospace" }}>{shaCorto(ultimo.sha256)}</code>
                        {delTipo.length > 1 && ` · ${delTipo.length} versiones`}
                        {!ultimo.almacenado && " · solo sello"}
                      </>
                    ) : (
                      "pendiente"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error !== null && (
          <p style={{ marginTop: "0.75rem", marginBottom: 0, color: "#b91c1c", fontSize: "0.85rem" }}>{error}</p>
        )}
      </section>

      {/* Subida a la bóveda. */}
      <section style={card}>
        <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>
          Subir documento
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.9rem" }}>
          <div>
            <label style={label} htmlFor="dk-tipo">Tipo de documento</label>
            <select id="dk-tipo" style={input} value={tipoSel} onChange={(e) => { if ((TIPOS_DOC_KYC as readonly string[]).includes(e.target.value)) setTipoSel(e.target.value as TipoDocKyc); }}>
              {TIPOS_DOC_KYC.map((t) => (
                <option key={t} value={t}>
                  {TIPO_DOC_KYC_ETIQUETA[t]}{obligatorios.includes(t) ? " (obligatorio)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="dk-file">Archivo (PDF o imagen, máx. 10 MB)</label>
            <input id="dk-file" ref={archivoRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" style={input} />
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button
            type="button"
            onClick={() => void subir()}
            disabled={subiendo}
            style={{ padding: "0.55rem 1.1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: subiendo ? "wait" : "pointer", opacity: subiendo ? 0.7 : 1 }}
          >
            {subiendo ? "Subiendo…" : "Subir al expediente"}
          </button>
        </div>
        {resultado !== null && (
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", fontWeight: 600, color: resultado.ok ? "#065f46" : "#b91c1c" }}>
            {resultado.ok ? "✅ " : "⚠️ "}{resultado.detalle}
          </p>
        )}
      </section>
    </div>
  );
}
