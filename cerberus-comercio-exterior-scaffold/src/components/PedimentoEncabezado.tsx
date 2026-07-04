"use client";

// CERBERUS COMERCIO EXTERIOR — encabezado del pedimento (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/PedimentoEncabezado.tsx  (Incremento 41; prefill 51)
// Propósito: Mostrar el ENCABEZADO del pedimento vigente de la operación
//            (clave, régimen, tipo de cambio; GET al montar) o "Sin pedimento
//            capturado", y un <details> "Capturar / editar encabezado" con el
//            form que hace POST a /api/operaciones/[id]/pedimento/encabezado
//            (upsert sellado + bitácora). Resultado inline ✅/⚠️ y recarga de
//            la página tras el éxito para que todo refleje el encabezado.
//            El modelo Pedimento NO tiene número de pedimento ni aduana: solo
//            se capturan los campos que existen en el schema.
//            Inc 51: "Prellenar desde el pedimento (PDF)" — sube el PDF a
//            /pedimento/prefill, rellena los campos existentes (fondo verde,
//            el usuario revisa: C9 sugerir, nunca imponer) y muestra en un
//            recuadro informativo lo detectado que AÚN no tiene campo en el
//            modelo (número de pedimento, aduana, RFC, contribuciones).
// =============================================================================

import { useCallback, useEffect, useState, type ChangeEvent } from "react";

export type PedimentoEncabezadoProps = { operacionId: string };

type Encabezado = {
  id: string;
  claveDePedimento: string;
  regimen: string;
  tipoCambioUsd: number;
  contribucionesTotal: number;
  sha256: string;
  creadoEn: string;
};

const CAMPOS_INICIALES = { claveDePedimento: "A1", regimen: "IMPORTACION DEFINITIVA", tipoCambioUsd: "" };
type Campos = typeof CAMPOS_INICIALES;

/** Datos que devuelve /pedimento/prefill (extraídos del PDF del pedimento). */
type DatosPrefill = {
  numeroPedimento?: string;
  clavePedimento?: string;
  tipoCambio?: number;
  aduana?: string;
  rfcImportador?: string;
  regimen?: string;
  contribuciones?: { igi?: number; dta?: number; iva?: number; prv?: number };
};

export function PedimentoEncabezado({ operacionId }: PedimentoEncabezadoProps) {
  const [encabezado, setEncabezado] = useState<Encabezado | null>(null);
  const [campos, setCampos] = useState<Campos>(CAMPOS_INICIALES);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Prellenado desde el PDF del pedimento (Inc 51).
  const [prefillCargando, setPrefillCargando] = useState<boolean>(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillAdvertencias, setPrefillAdvertencias] = useState<string[]>([]);
  const [detectadosSinCampo, setDetectadosSinCampo] = useState<string[]>([]);
  const [prellenados, setPrellenados] = useState<ReadonlySet<keyof Campos>>(new Set());

  const url = `/api/operaciones/${encodeURIComponent(operacionId)}/pedimento/encabezado`;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const d = (await res.json()) as { pedimento: Encabezado | null };
      setEncabezado(d.pedimento);
      if (d.pedimento) {
        setCampos({
          claveDePedimento: d.pedimento.claveDePedimento,
          regimen: d.pedimento.regimen,
          tipoCambioUsd: String(d.pedimento.tipoCambioUsd),
        });
      }
    } catch {
      /* fail-safe: sin encabezado visible; el form sigue disponible */
    }
  }, [url]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = (campo: keyof Campos) => (e: ChangeEvent<HTMLInputElement>) => {
    setCampos((prev) => ({ ...prev, [campo]: e.target.value }));
    // Al editar a mano, el campo deja de considerarse "prellenado del PDF".
    setPrellenados((prev) => {
      if (!prev.has(campo)) return prev;
      const sig = new Set(prev);
      sig.delete(campo);
      return sig;
    });
  };

  /** Formatea un importe detectado en el cuadro de liquidación del PDF. */
  const fmtImporte = (n: number): string => `$${n.toLocaleString("es-MX")}`;

  /** Sube el PDF del pedimento al prefill y rellena los campos que existen. */
  async function prellenarDesdePdf(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setPrefillCargando(true);
    setPrefillError(null);
    setPrefillAdvertencias([]);
    setDetectadosSinCampo([]);
    setPrellenados(new Set());
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/pedimento/prefill`,
        { method: "POST", body: fd },
      );
      let datosCrudos: unknown = null;
      try {
        datosCrudos = await res.json();
      } catch {
        /* sin cuerpo */
      }
      const d = (datosCrudos ?? {}) as {
        ok?: boolean;
        detalle?: unknown;
        error?: unknown;
        datos?: DatosPrefill;
        advertencias?: unknown;
      };
      if (!res.ok || d.ok !== true) {
        const base =
          (typeof d.detalle === "string" && d.detalle) ||
          (typeof d.error === "string" && d.error) ||
          `HTTP ${res.status}`;
        setPrefillError(`⚠️ ${base}`);
        return;
      }
      const datos: DatosPrefill = d.datos ?? {};

      // 1) Rellenar los campos del form que EXISTEN en el modelo Pedimento.
      const nuevos = new Set<keyof Campos>();
      setCampos((prev) => {
        const sig = { ...prev };
        if (typeof datos.clavePedimento === "string" && datos.clavePedimento.length > 0) {
          sig.claveDePedimento = datos.clavePedimento;
          nuevos.add("claveDePedimento");
        }
        if (typeof datos.tipoCambio === "number" && Number.isFinite(datos.tipoCambio)) {
          sig.tipoCambioUsd = String(datos.tipoCambio);
          nuevos.add("tipoCambioUsd");
        }
        if (typeof datos.regimen === "string" && datos.regimen.length > 0) {
          sig.regimen = datos.regimen;
          nuevos.add("regimen");
        }
        return sig;
      });
      setPrellenados(nuevos);

      // 2) Lo detectado que el modelo AÚN no puede guardar: se muestra con
      //    honestidad (insumo para la futura migración), no se pierde en silencio.
      const sinCampo: string[] = [];
      if (typeof datos.numeroPedimento === "string") {
        sinCampo.push(`Número de pedimento: ${datos.numeroPedimento}`);
      }
      if (typeof datos.aduana === "string") sinCampo.push(`Aduana: ${datos.aduana}`);
      if (typeof datos.rfcImportador === "string") {
        sinCampo.push(`RFC importador: ${datos.rfcImportador}`);
      }
      const c = datos.contribuciones;
      if (c) {
        const partes = [
          typeof c.igi === "number" ? `IGI ${fmtImporte(c.igi)}` : null,
          typeof c.dta === "number" ? `DTA ${fmtImporte(c.dta)}` : null,
          typeof c.iva === "number" ? `IVA ${fmtImporte(c.iva)}` : null,
          typeof c.prv === "number" ? `PRV ${fmtImporte(c.prv)}` : null,
        ].filter((x): x is string => x !== null);
        if (partes.length > 0) sinCampo.push(`Contribuciones: ${partes.join(", ")}`);
      }
      setDetectadosSinCampo(sinCampo);

      const advertencias = Array.isArray(d.advertencias)
        ? d.advertencias.filter((x): x is string => typeof x === "string")
        : [];
      setPrefillAdvertencias(advertencias);

      if (nuevos.size === 0 && sinCampo.length === 0 && advertencias.length === 0) {
        setPrefillError("⚠️ No se detectaron datos de pedimento en el PDF.");
      }
    } catch {
      setPrefillError("⚠️ Error de red al leer el PDF del pedimento.");
    } finally {
      setPrefillCargando(false);
      input.value = ""; // permite volver a subir el mismo archivo
    }
  }

  async function guardar(): Promise<void> {
    setEnviando(true);
    setExito(null);
    setError(null);
    try {
      const tipoCambio = Number(campos.tipoCambioUsd);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claveDePedimento: campos.claveDePedimento.trim(),
          regimen: campos.regimen.trim(),
          tipoCambioUsd: campos.tipoCambioUsd.trim().length === 0 ? Number.NaN : tipoCambio,
        }),
      });
      let datos: unknown = null;
      try {
        datos = await res.json();
      } catch {
        /* sin cuerpo */
      }
      if (!res.ok) {
        const d = (datos ?? {}) as { error?: unknown; detalles?: unknown };
        const base = typeof d.error === "string" ? d.error : `HTTP ${res.status}`;
        const detalles = Array.isArray(d.detalles)
          ? d.detalles.filter((x): x is string => typeof x === "string")
          : [];
        setError(`⚠️ ${base}${detalles.length > 0 ? `: ${detalles.join(", ")}` : ""}`);
        return;
      }
      setExito("✅ Encabezado del pedimento guardado y sellado. Recargando…");
      // Recarga tras éxito (breve pausa para alcanzar a leer el resultado).
      setTimeout(() => location.reload(), 1500);
    } catch {
      setError("⚠️ Error de red al guardar el encabezado.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.45rem 0.6rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.9rem",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.8rem",
    color: "#334155",
    marginBottom: "0.2rem",
  };

  const deshabilitado = enviando || campos.claveDePedimento.trim().length === 0 ||
    campos.regimen.trim().length === 0 || campos.tipoCambioUsd.trim().length === 0;

  return (
    <section
      style={{
        marginTop: "1.25rem",
        padding: "0.9rem 1.1rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      <h2 style={{ fontSize: "1.1rem", marginTop: 0, marginBottom: "0.4rem", color: "#334155" }}>
        Encabezado del pedimento
      </h2>

      {/* Encabezado actual (el pedimento vigente) o aviso de que no hay. */}
      {encabezado === null ? (
        <p style={{ margin: "0.2rem 0 0.4rem", color: "#94a3b8", fontSize: "0.9rem" }}>
          Sin pedimento capturado.
        </p>
      ) : (
        <div
          style={{
            margin: "0.2rem 0 0.4rem",
            padding: "0.6rem 0.9rem",
            background: "#f0fdfa",
            border: "1px solid #99f6e4",
            borderRadius: 8,
            color: "#115e59",
            fontSize: "0.85rem",
          }}
        >
          Clave <strong>{encabezado.claveDePedimento}</strong> · Régimen{" "}
          <strong>{encabezado.regimen}</strong> · Tipo de cambio{" "}
          <strong>{encabezado.tipoCambioUsd.toFixed(4)}</strong> MXN/USD · Sello{" "}
          <code style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
            {encabezado.sha256.slice(0, 12)}…
          </code>
        </div>
      )}

      <details style={{ marginTop: "0.4rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.95rem", color: "#334155" }}>
          Capturar / editar encabezado
        </summary>

        {/* Ayuda: solo existen estos campos de encabezado en el modelo. */}
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.6rem 0.9rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            color: "#1e40af",
            fontSize: "0.82rem",
          }}
        >
          Captura la <strong>clave de pedimento</strong> (p. ej. A1), el{" "}
          <strong>régimen</strong> y el <strong>tipo de cambio</strong> (MXN/USD, positivo).
          Al guardar, el pedimento de la operación se crea o actualiza, se sella (SHA-256)
          y queda en bitácora. Los totales se recalculan de las partidas actuales.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "0.7rem", marginTop: "0.8rem" }}>
          <div>
            <label style={labelStyle}>Clave de pedimento</label>
            <input
              value={campos.claveDePedimento}
              disabled={enviando}
              onChange={cambiar("claveDePedimento")}
              placeholder="A1"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Régimen</label>
            <input
              value={campos.regimen}
              disabled={enviando}
              onChange={cambiar("regimen")}
              placeholder="IMPORTACION DEFINITIVA"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Tipo de cambio (MXN/USD)</label>
            <input
              type="number"
              value={campos.tipoCambioUsd}
              disabled={enviando}
              onChange={cambiar("tipoCambioUsd")}
              placeholder="17.50"
              style={inputStyle}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => void guardar()}
          style={{
            marginTop: "0.9rem",
            padding: "0.55rem 1.1rem",
            background: deshabilitado ? "#94a3b8" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: deshabilitado ? "not-allowed" : "pointer",
          }}
        >
          {enviando ? "Guardando…" : encabezado === null ? "Capturar encabezado" : "Actualizar encabezado"}
        </button>

        {/* Resultado inline: éxito (✅) o error (⚠️). */}
        {exito !== null && (
          <div
            style={{
              marginTop: "0.8rem",
              padding: "0.6rem 0.9rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              color: "#065f46",
              fontSize: "0.85rem",
            }}
          >
            {exito}
          </div>
        )}
        {error !== null && (
          <div
            style={{
              marginTop: "0.8rem",
              padding: "0.6rem 0.9rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}
      </details>
    </section>
  );
}
