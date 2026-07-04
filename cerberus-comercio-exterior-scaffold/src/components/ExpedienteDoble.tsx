// CERBERUS COMERCIO EXTERIOR — expediente doble 3.1.42 (dos columnas). NO es SIDF.
// =============================================================================
// Archivo:  src/components/ExpedienteDoble.tsx  (Incremento 54)
// Propósito: Client Component del EXPEDIENTE DOBLE de la regla 3.1.42 RGCE:
//            dos columnas ("Expediente del agente" / "Expediente de la
//            empresa"), cada una con su CHECKLIST de tipos documentales del
//            catálogo (subido: fecha + sha256 abreviado; o pendiente) y su
//            formulario para subir PDF/imagen a la bóveda vía
//            /api/clientes/[id]/expediente-doble (GET/POST multipart).
//            Patrón visual de DocumentosKyc.tsx.
// =============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TIPOS_DOC_DOBLE_3142,
  TIPO_DOC_DOBLE_ETIQUETA,
  PARTES_EXPEDIENTE_DOBLE,
  PARTE_EXPEDIENTE_ETIQUETA,
  type TipoDocDoble3142,
  type ParteExpedienteDoble,
} from "@/lib/expediente-doble-catalogo";

interface DocumentoDoble {
  id: string;
  parte: string | null;
  tipo: string | null;
  tipoAlmacenado: string;
  sha256: string;
  almacenado: boolean;
  vence: string | null;
  creadoEn: string;
}

interface ExpedienteRespuesta {
  id: string;
  custodio: string | null;
  retieneHasta: string | null;
  creadoEn: string;
  documentos: DocumentoDoble[];
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

/** Columna de UNA parte (agente o empresa): checklist + subir archivo. */
function ColumnaParte({
  parte,
  documentos,
  base,
  onSubido,
}: {
  parte: ParteExpedienteDoble;
  documentos: DocumentoDoble[];
  base: string;
  onSubido: () => Promise<void>;
}) {
  const [tipoSel, setTipoSel] = useState<TipoDocDoble3142>("COPIA_PEDIMENTO");
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const deLaParte = documentos.filter((d) => d.parte === parte);

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
      form.set("parte", parte);
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
      await onSubido();
    } catch (e) {
      setResultado({ ok: false, detalle: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <section style={card}>
      <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>
        {PARTE_EXPEDIENTE_ETIQUETA[parte]}
      </h3>

      {/* Checklist por tipo documental del catálogo. */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
        {TIPOS_DOC_DOBLE_3142.map((tipo) => {
          const delTipo = deLaParte.filter((d) => d.tipo === tipo);
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
                background: ultimo === null ? "#f8fafc" : "transparent",
              }}
            >
              <span style={{ fontSize: "0.86rem", color: "#334155" }}>
                {ultimo !== null ? "✅ " : "⚪ "}
                {TIPO_DOC_DOBLE_ETIQUETA[tipo]}
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

      {/* Subida a la bóveda de ESTA parte. */}
      <div style={{ marginTop: "1rem", paddingTop: "0.9rem", borderTop: "1px solid #e2e8f0", display: "grid", gap: "0.75rem" }}>
        <div>
          <label style={label} htmlFor={`ed-tipo-${parte}`}>Tipo de documento</label>
          <select
            id={`ed-tipo-${parte}`}
            style={input}
            value={tipoSel}
            onChange={(e) => {
              if ((TIPOS_DOC_DOBLE_3142 as readonly string[]).includes(e.target.value)) {
                setTipoSel(e.target.value as TipoDocDoble3142);
              }
            }}
          >
            {TIPOS_DOC_DOBLE_3142.map((t) => (
              <option key={t} value={t}>{TIPO_DOC_DOBLE_ETIQUETA[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={label} htmlFor={`ed-file-${parte}`}>Archivo (PDF o imagen, máx. 10 MB)</label>
          <input id={`ed-file-${parte}`} ref={archivoRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" style={input} />
        </div>
        <div>
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
          <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: resultado.ok ? "#065f46" : "#b91c1c" }}>
            {resultado.ok ? "✅ " : "⚠️ "}{resultado.detalle}
          </p>
        )}
      </div>
    </section>
  );
}

export function ExpedienteDoble({ clienteId }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoDoble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(
    () => `/api/clientes/${encodeURIComponent(clienteId)}/expediente-doble`,
    [clienteId],
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
      const expediente = (data as { expediente?: ExpedienteRespuesta | null }).expediente ?? null;
      setDocumentos(expediente?.documentos ?? []);
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

  if (cargando) {
    return <p style={{ color: "#94a3b8" }}>Cargando…</p>;
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {error !== null && (
        <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}>{error}</p>
      )}
      {/* Dos columnas: la copia del AGENTE y la copia de la EMPRESA. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", alignItems: "start" }}>
        {PARTES_EXPEDIENTE_DOBLE.map((parte) => (
          <ColumnaParte
            key={parte}
            parte={parte}
            documentos={documentos}
            base={base}
            onSubido={recargar}
          />
        ))}
      </div>
    </div>
  );
}
