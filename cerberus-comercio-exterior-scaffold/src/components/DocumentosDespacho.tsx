// CERBERUS COMERCIO EXTERIOR — bóveda documental del expediente del despacho. NO es SIDF.
// =============================================================================
// Archivo:  src/components/DocumentosDespacho.tsx  (Incremento 50)
// Propósito: Client Component con el CHECKLIST de documentos del expediente
//            probatorio del despacho de una operación: por cada tipo del
//            catálogo muestra si ya hay documento subido (fecha + sha256
//            abreviado + versiones) o está pendiente, y permite subir
//            PDF/XML/imagen a la bóveda vía /api/operaciones/[id]/documentos
//            (GET/POST multipart). Si el XML subido trae datos CFDI/carta
//            porte, se muestran resumidos (captura asistida: el capturista
//            revisa lo leído, no lo teclea).
// =============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TIPOS_DOC_DESPACHO,
  TIPO_DOC_DESPACHO_ETIQUETA,
  type TipoDocDespacho,
} from "@/lib/documentos-despacho-catalogo";

interface DocumentoDespacho {
  id: string;
  tipo: string;
  sha256: string;
  almacenado: boolean;
  vence: string | null;
  creadoEn: string;
}

/** Resumen de lo extraído del XML por el POST (contrato de la ruta). */
interface ExtraidoDespacho {
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  moneda?: string;
  conceptos?: string[];
  cartaPorte?: { origenCp?: string; destinoCp?: string; placaVm?: string };
}

interface Props {
  operacionId: string;
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

/** Resume lo extraído del XML en una línea legible para el capturista. */
function resumenExtraido(e: ExtraidoDespacho): string {
  const partes: string[] = [];
  if (e.emisorRfc !== undefined) partes.push(`emisor ${e.emisorRfc}`);
  if (e.receptorRfc !== undefined) partes.push(`receptor ${e.receptorRfc}`);
  if (e.total !== undefined) partes.push(`total ${e.total}${e.moneda !== undefined ? ` ${e.moneda}` : ""}`);
  if (e.conceptos !== undefined && e.conceptos.length > 0) {
    partes.push(`${e.conceptos.length} concepto(s): ${e.conceptos.slice(0, 2).join("; ")}${e.conceptos.length > 2 ? "…" : ""}`);
  }
  if (e.cartaPorte !== undefined) {
    const cp: string[] = [];
    if (e.cartaPorte.origenCp !== undefined) cp.push(`origen CP ${e.cartaPorte.origenCp}`);
    if (e.cartaPorte.destinoCp !== undefined) cp.push(`destino CP ${e.cartaPorte.destinoCp}`);
    if (e.cartaPorte.placaVm !== undefined) cp.push(`placa ${e.cartaPorte.placaVm}`);
    if (cp.length > 0) partes.push(`carta porte: ${cp.join(", ")}`);
  }
  return partes.join(" · ");
}

export function DocumentosDespacho({ operacionId }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoDespacho[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoSel, setTipoSel] = useState<TipoDocDespacho>("PEDIMENTO");
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);
  const [extraido, setExtraido] = useState<ExtraidoDespacho | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const base = useMemo(
    () => `/api/operaciones/${encodeURIComponent(operacionId)}/documentos`,
    [operacionId],
  );

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
      setDocumentos((data as { documentos?: DocumentoDespacho[] }).documentos ?? []);
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
      setResultado({ ok: false, detalle: "Selecciona un archivo (PDF, XML o imagen)." });
      return;
    }
    setSubiendo(true);
    setResultado(null);
    setExtraido(null);
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
      const ext = (data as { extraido?: ExtraidoDespacho | null }).extraido;
      setExtraido(typeof ext === "object" && ext !== null ? ext : null);
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
      {/* Checklist por tipo documental del catálogo. */}
      <section style={card}>
        <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>
          Checklist del expediente del despacho
        </h3>
        {cargando ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Cargando…</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
            {TIPOS_DOC_DESPACHO.map((tipo) => {
              const delTipo = documentos.filter((d) => d.tipo === tipo);
              const ultimo = delTipo[0] ?? null; // el GET viene ordenado desc
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
                  }}
                >
                  <span style={{ fontSize: "0.88rem", color: "#334155" }}>
                    {ultimo !== null ? "✅ " : "⚪ "}
                    {TIPO_DOC_DESPACHO_ETIQUETA[tipo]}
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
            <label style={label} htmlFor="dd-tipo">Tipo de documento</label>
            <select id="dd-tipo" style={input} value={tipoSel} onChange={(e) => { if ((TIPOS_DOC_DESPACHO as readonly string[]).includes(e.target.value)) setTipoSel(e.target.value as TipoDocDespacho); }}>
              {TIPOS_DOC_DESPACHO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_DOC_DESPACHO_ETIQUETA[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="dd-file">Archivo (PDF, XML o imagen, máx. 10 MB)</label>
            <input id="dd-file" ref={archivoRef} type="file" accept="application/pdf,application/xml,text/xml,.xml,image/png,image/jpeg,image/webp,image/heic" style={input} />
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
        {extraido !== null && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#1e40af", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "0.5rem 0.7rem" }}>
            Datos leídos del XML: {resumenExtraido(extraido)}
          </p>
        )}
      </section>
    </div>
  );
}
