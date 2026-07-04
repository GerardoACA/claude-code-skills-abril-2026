"use client";

// CERBERUS COMERCIO EXTERIOR — encabezado del pedimento (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/PedimentoEncabezado.tsx  (Inc 41; prefill 51; 55)
// Propósito: Mostrar el ENCABEZADO del pedimento vigente de la operación
//            (número, aduana, clave, régimen, tipo de cambio; GET al montar)
//            o "Sin pedimento capturado", y un <details> "Capturar / editar
//            encabezado" con el form que hace POST a
//            /api/operaciones/[id]/pedimento/encabezado (upsert sellado +
//            bitácora). Resultado inline ✅/⚠️ y recarga de la página tras el
//            éxito para que todo refleje el encabezado.
//            Inc 51: "Prellenar desde el pedimento (PDF)" — sube el PDF a
//            /pedimento/prefill y rellena los campos (fondo verde, el usuario
//            revisa: C9 sugerir, nunca imponer).
//            Inc 55: el modelo YA tiene `numero` y `aduana`: son campos
//            reales del form (opcionales, validados con los validadores puros
//            de pedimento-validacion) y el prellenado los rellena; en el
//            recuadro "sin campo en el sistema" solo quedan las
//            contribuciones detectadas en el cuadro de liquidación.
// =============================================================================

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { esClaveAduanaValida, esNumeroPedimentoValido } from "@/lib/pedimento-validacion";

export type PedimentoEncabezadoProps = { operacionId: string };

type Encabezado = {
  id: string;
  claveDePedimento: string;
  numero: string | null;
  aduana: string | null;
  regimen: string;
  tipoCambioUsd: number;
  contribucionesTotal: number;
  sha256: string;
  creadoEn: string;
};

const CAMPOS_INICIALES = {
  claveDePedimento: "A1",
  regimen: "IMPORTACION DEFINITIVA",
  tipoCambioUsd: "",
  numero: "",
  aduana: "",
};
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
          numero: d.pedimento.numero ?? "",
          aduana: d.pedimento.aduana ?? "",
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
        // [Inc 55] numero y aduana ya son campos reales del modelo: se
        // prellenan en el form (el usuario revisa; C9 sugerir, nunca imponer).
        if (typeof datos.numeroPedimento === "string" && datos.numeroPedimento.length > 0) {
          sig.numero = datos.numeroPedimento;
          nuevos.add("numero");
        }
        if (typeof datos.aduana === "string" && datos.aduana.length > 0) {
          sig.aduana = datos.aduana;
          nuevos.add("aduana");
        }
        return sig;
      });
      setPrellenados(nuevos);

      // 2) Lo detectado que el modelo AÚN no puede guardar (solo las
      //    contribuciones del cuadro de liquidación): se muestra con
      //    honestidad (insumo para la futura migración), no se pierde en silencio.
      const sinCampo: string[] = [];
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
          // [Inc 55] Opcionales: solo se envían si el capturista los llenó
          // (el servidor normaliza el número y valida ambos).
          ...(campos.numero.trim().length > 0 ? { numero: campos.numero.trim() } : {}),
          ...(campos.aduana.trim().length > 0 ? { aduana: campos.aduana.trim() } : {}),
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
  /** Estilo del input: fondo verde suave si el campo se prellenó del PDF. */
  const estiloCampo = (campo: keyof Campos): React.CSSProperties =>
    prellenados.has(campo) ? { ...inputStyle, background: "#f0fdf4" } : inputStyle;
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.8rem",
    color: "#334155",
    marginBottom: "0.2rem",
  };

  // [Inc 55] Validación en cliente de los opcionales (mismos validadores puros
  // que usa el servidor): solo bloquean si se llenaron y son inválidos.
  const numeroInvalido =
    campos.numero.trim().length > 0 && !esNumeroPedimentoValido(campos.numero.trim());
  const aduanaInvalida =
    campos.aduana.trim().length > 0 && !esClaveAduanaValida(campos.aduana.trim());

  const deshabilitado = enviando || campos.claveDePedimento.trim().length === 0 ||
    campos.regimen.trim().length === 0 || campos.tipoCambioUsd.trim().length === 0 ||
    numeroInvalido || aduanaInvalida;

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
          {encabezado.numero !== null && encabezado.numero.length > 0 && (
            <>
              Número <strong>{encabezado.numero}</strong> ·{" "}
            </>
          )}
          {encabezado.aduana !== null && encabezado.aduana.length > 0 && (
            <>
              Aduana <strong>{encabezado.aduana}</strong> ·{" "}
            </>
          )}
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

        {/* Prellenado desde el PDF del pedimento (Inc 51): el capturista no
            teclea lo que el documento ya dice; sube el PDF, se sugiere y él
            revisa (C9). Fail-safe: si falla, la captura manual sigue igual. */}
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.6rem 0.9rem",
            background: "#fffbeb",
            border: "1px dashed #fcd34d",
            borderRadius: 8,
            fontSize: "0.85rem",
            color: "#334155",
          }}
        >
          <label style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem", color: "#92400e" }}>
            Prellenar desde el pedimento (PDF)
          </label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={prefillCargando || enviando}
            onChange={(e) => void prellenarDesdePdf(e)}
            style={{ fontSize: "0.85rem" }}
          />
          {prefillCargando && (
            <span style={{ marginLeft: "0.6rem", color: "#92400e" }}>Leyendo el PDF…</span>
          )}
          <div style={{ marginTop: "0.3rem", fontSize: "0.78rem", color: "#78716c" }}>
            Los campos rellenados quedan en verde; revísalos y corrige antes de guardar.
            Aquí no se almacena el archivo.
          </div>
        </div>

        {/* Detectado en el PDF pero SIN campo en el modelo Pedimento actual
            (desde Inc 55 solo las contribuciones del cuadro de liquidación):
            se informa con honestidad (insumo para la futura migración). */}
        {detectadosSinCampo.length > 0 && (
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.6rem 0.9rem",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              color: "#1e40af",
              fontSize: "0.82rem",
            }}
          >
            <strong>Detectado en el PDF (aún sin campo en el sistema):</strong>{" "}
            {detectadosSinCampo.join(" · ")}
          </div>
        )}

        {/* Advertencias de la extracción (datos descartados, etiquetas ausentes). */}
        {prefillAdvertencias.length > 0 && (
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.6rem 0.9rem",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              color: "#92400e",
              fontSize: "0.82rem",
            }}
          >
            {prefillAdvertencias.map((a) => (
              <div key={a}>⚠️ {a}</div>
            ))}
          </div>
        )}
        {prefillError !== null && (
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.6rem 0.9rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: "0.82rem",
            }}
          >
            {prefillError}
          </div>
        )}

        {/* Ayuda: campos de encabezado disponibles (numero y aduana desde Inc 55). */}
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
          El <strong>número de pedimento</strong> (15 dígitos; se toleran espacios y guiones)
          y la <strong>aduana</strong> (3 dígitos) son opcionales.
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
              style={estiloCampo("claveDePedimento")}
            />
          </div>
          <div>
            <label style={labelStyle}>Régimen</label>
            <input
              value={campos.regimen}
              disabled={enviando}
              onChange={cambiar("regimen")}
              placeholder="IMPORTACION DEFINITIVA"
              style={estiloCampo("regimen")}
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
              style={estiloCampo("tipoCambioUsd")}
            />
          </div>
        </div>

        {/* [Inc 55] Número de pedimento y aduana: campos reales del modelo,
            opcionales; el prellenado del PDF los rellena y el usuario revisa. */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.7rem", marginTop: "0.7rem" }}>
          <div>
            <label style={labelStyle}>Número de pedimento (15 dígitos)</label>
            <input
              value={campos.numero}
              disabled={enviando}
              onChange={cambiar("numero")}
              placeholder="24 38 3801 5012345"
              style={estiloCampo("numero")}
            />
            {numeroInvalido && (
              <div style={{ marginTop: "0.2rem", fontSize: "0.75rem", color: "#991b1b" }}>
                Deben ser exactamente 15 dígitos (se toleran espacios y guiones).
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Aduana (3 dígitos)</label>
            <input
              value={campos.aduana}
              disabled={enviando}
              onChange={cambiar("aduana")}
              placeholder="240"
              style={estiloCampo("aduana")}
            />
            {aduanaInvalida && (
              <div style={{ marginTop: "0.2rem", fontSize: "0.75rem", color: "#991b1b" }}>
                Deben ser exactamente 3 dígitos (p. ej. 240).
              </div>
            )}
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
