"use client";

// CERBERUS COMERCIO EXTERIOR — captura/ingesta de movimientos IMMEX (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/ImmexMovimientosIngesta.tsx  (Incremento 61 — carril C)
// Propósito: Tres <details> plegables bajo las tablas de saldos IMMEX del
//            cliente para alimentar el libro de COTEJO de CERBERUS:
//              1) Registrar ENTRADA (importación temporal) — campos del contrato
//                 EntradaImmexInput (src/lib/immex/tipos.ts).
//              2) Registrar DESCARGO (retorno) — campos de DescargoImmexInput.
//              3) Ingesta masiva CSV (pegar o cargar .csv) con selector de tipo.
//            Postea a /api/clientes/[id]/immex/movimientos (unitario) y
//            /api/clientes/[id]/immex/ingesta (CSV) — carril B — y muestra el
//            resultado inline: creadas/errores por línea, faltante PEPS y regla
//            de 48h si el servidor los reporta (C9: se alerta, nunca se
//            bloquea). Tras el éxito recarga la página para que la tabla de
//            cotejo refleje los saldos derivados.
// =============================================================================

import {
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

export type ImmexMovimientosIngestaProps = { clienteId: string };

/** Resultado normalizado de un envío, para pintarlo inline (éxito o error). */
type EstadoEnvio = {
  ok: boolean;
  mensaje: string;
  /** Avisos no bloqueantes (faltante PEPS, regla 48h) — C9: alertar, no bloquear. */
  avisos: string[];
  /** Errores por línea/campo reportados por el servidor. */
  errores: string[];
};

// Encabezados canónicos del CSV (contrato del carril B, ver
// src/lib/immex/ingesta-movimientos.ts — aquí copiados: este componente solo
// puede importar tipos.ts/derivar-saldos.ts del módulo IMMEX).
const ENCABEZADO_ENTRADA =
  "fraccion,descripcion,unidadMedida,cantidad,valorAduana,pedimentoNumero,clavePedimento,fechaLimiteRetorno,despachoConcluidoEn";
const ENCABEZADO_DESCARGO = "fraccion,cantidad,pedimentoNumero,clavePedimento,despachoConcluidoEn";

// -----------------------------------------------------------------------------
// Lectura defensiva de la respuesta del servidor (carril B): se extraen los
// campos conocidos (creadas, errores, faltante, regla48h) sin asumir la forma
// exacta; lo que no venga simplemente no se muestra.
// -----------------------------------------------------------------------------
function extraerAvisos(datos: Record<string, unknown>): string[] {
  const avisos: string[] = [];
  const faltante = datos.faltante;
  if (typeof faltante === "number" && faltante > 0) {
    avisos.push(
      `Descargo con saldo insuficiente (PEPS): faltante ${faltante}. Se registró y quedará alertado (C9), no se bloquea.`,
    );
  }
  const regla = datos.regla48h;
  if (regla !== null && typeof regla === "object") {
    const r = regla as { horas?: unknown; incumple?: unknown };
    if (typeof r.horas === "number" && typeof r.incumple === "boolean") {
      avisos.push(
        r.incumple
          ? `Regla de 48 horas (Anexo 24): pasaron ${r.horas.toFixed(1)} h entre el despacho y el registro — INCUMPLE (se alerta, C9).`
          : `Regla de 48 horas (Anexo 24): registrado a las ${r.horas.toFixed(1)} h del despacho — en plazo.`,
      );
    }
  }
  return avisos;
}

function extraerErrores(datos: Record<string, unknown>): string[] {
  const lista = Array.isArray(datos.errores)
    ? datos.errores
    : Array.isArray(datos.detalles)
      ? datos.detalles
      : [];
  return lista.filter((x): x is string => typeof x === "string");
}

/** Convierte la respuesta HTTP (ok o error) en un EstadoEnvio para la UI. */
function interpretarRespuesta(status: number, httpOk: boolean, datos: unknown): EstadoEnvio {
  const d = (datos !== null && typeof datos === "object" ? datos : {}) as Record<string, unknown>;
  if (!httpOk) {
    return {
      ok: false,
      mensaje: typeof d.error === "string" ? d.error : `HTTP ${status}`,
      avisos: extraerAvisos(d),
      errores: extraerErrores(d),
    };
  }
  const creadas = typeof d.creadas === "number" ? d.creadas : null;
  const errores = extraerErrores(d);
  return {
    ok: true,
    mensaje:
      creadas !== null
        ? `Se registraron ${creadas} movimiento(s)${errores.length > 0 ? ` (${errores.length} fila(s) con error, ver abajo)` : ""}.`
        : "Movimiento registrado en el libro de cotejo.",
    avisos: extraerAvisos(d),
    errores,
  };
}

// -----------------------------------------------------------------------------
// Estilos de la casa (mismos tonos que PartidasIngestaCsv / forms existentes).
// -----------------------------------------------------------------------------
const estiloDetails: CSSProperties = {
  marginTop: "1rem",
  padding: "0.9rem 1.1rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};
const estiloSummary: CSSProperties = {
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "1rem",
  color: "#334155",
};
const estiloLabel: CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  color: "#334155",
  marginBottom: "0.2rem",
};
const estiloInput: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: "0.85rem",
  boxSizing: "border-box",
};
const estiloGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.7rem",
  marginTop: "0.8rem",
};

function estiloBoton(deshabilitado: boolean): CSSProperties {
  return {
    marginTop: "0.9rem",
    padding: "0.55rem 1.1rem",
    background: deshabilitado ? "#94a3b8" : "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: deshabilitado ? "not-allowed" : "pointer",
  };
}

/** Campo etiquetado (uncontrolled: el valor se lee con FormData al enviar). */
function Campo(props: {
  etiqueta: string;
  name: string;
  type?: string;
  step?: string;
  requerido?: boolean;
  placeholder?: string;
}): ReactNode {
  return (
    <div>
      <label style={estiloLabel}>
        {props.etiqueta}
        {props.requerido === true ? " *" : ""}
      </label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        step={props.step}
        required={props.requerido === true}
        placeholder={props.placeholder}
        style={estiloInput}
      />
    </div>
  );
}

/** Bloque inline con el resultado del envío (éxito verde / error rojo + listas). */
function ResultadoInline({ estado }: { estado: EstadoEnvio | null }): ReactNode {
  if (estado === null) return null;
  return (
    <div style={{ marginTop: "0.8rem" }}>
      <div
        style={{
          padding: "0.6rem 0.9rem",
          background: estado.ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${estado.ok ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: 8,
          color: estado.ok ? "#065f46" : "#991b1b",
          fontSize: "0.85rem",
        }}
      >
        {estado.mensaje}
        {estado.ok ? " Recargando…" : ""}
      </div>
      {estado.avisos.length > 0 && (
        <ul
          style={{
            marginTop: "0.6rem",
            marginBottom: 0,
            paddingLeft: "1.2rem",
            color: "#92400e",
            fontSize: "0.82rem",
          }}
        >
          {estado.avisos.map((a, i) => (
            <li key={`${i}-${a}`}>{a}</li>
          ))}
        </ul>
      )}
      {estado.errores.length > 0 && (
        <ul
          style={{
            marginTop: "0.6rem",
            marginBottom: 0,
            paddingLeft: "1.2rem",
            color: "#991b1b",
            fontSize: "0.82rem",
          }}
        >
          {estado.errores.map((e, i) => (
            <li key={`${i}-${e}`}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Componente principal
// =============================================================================
export function ImmexMovimientosIngesta({ clienteId }: ImmexMovimientosIngestaProps) {
  const [enviando, setEnviando] = useState<boolean>(false);
  const [estadoEntrada, setEstadoEntrada] = useState<EstadoEnvio | null>(null);
  const [estadoDescargo, setEstadoDescargo] = useState<EstadoEnvio | null>(null);
  const [estadoCsv, setEstadoCsv] = useState<EstadoEnvio | null>(null);
  const [csv, setCsv] = useState<string>("");
  const [tipoCsv, setTipoCsv] = useState<"ENTRADA" | "DESCARGO">("ENTRADA");

  const baseUrl = `/api/clientes/${encodeURIComponent(clienteId)}/immex`;

  /** POST genérico; interpreta la respuesta y recarga tras el éxito. */
  async function postear(
    url: string,
    cuerpo: Record<string, unknown>,
    setEstado: (e: EstadoEnvio) => void,
  ): Promise<void> {
    setEnviando(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      let datos: unknown = null;
      try {
        datos = await res.json();
      } catch {
        /* sin cuerpo JSON */
      }
      const estado = interpretarRespuesta(res.status, res.ok, datos);
      setEstado(estado);
      if (estado.ok) {
        // Recarga tras éxito (breve pausa para leer el resultado y los avisos):
        // la tabla de saldos del cotejo se rederiva con los movimientos nuevos.
        setTimeout(() => location.reload(), 2000);
      }
    } catch {
      setEstado({ ok: false, mensaje: "Error de red al enviar.", avisos: [], errores: [] });
    } finally {
      setEnviando(false);
    }
  }

  /** Lee un campo de texto del form; "" => undefined (campos opcionales). */
  function texto(fd: FormData, name: string): string | undefined {
    const v = fd.get(name);
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  }

  /** Lee un campo numérico del form; vacío/no numérico => undefined. */
  function numero(fd: FormData, name: string): number | undefined {
    const v = texto(fd, name);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Convierte el valor de un input date/datetime-local a ISO 8601. */
  function iso(fd: FormData, name: string): string | undefined {
    const v = texto(fd, name);
    if (v === undefined) return undefined;
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
  }

  function enviarEntrada(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Cuerpo = { tipo } + campos del contrato EntradaImmexInput (tipos.ts).
    void postear(
      `${baseUrl}/movimientos`,
      {
        tipo: "ENTRADA",
        fraccion: texto(fd, "fraccion") ?? "",
        nico: texto(fd, "nico"),
        descripcion: texto(fd, "descripcion") ?? "",
        unidadMedida: texto(fd, "unidadMedida") ?? "",
        cantidad: numero(fd, "cantidad") ?? 0,
        valorAduana: numero(fd, "valorAduana"),
        pedimentoNumero: texto(fd, "pedimentoNumero") ?? "",
        clavePedimento: texto(fd, "clavePedimento") ?? "",
        fechaLimiteRetorno: iso(fd, "fechaLimiteRetorno") ?? "",
        despachoConcluidoEn: iso(fd, "despachoConcluidoEn"),
      },
      setEstadoEntrada,
    );
  }

  function enviarDescargo(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Cuerpo = { tipo } + campos del contrato DescargoImmexInput (tipos.ts).
    void postear(
      `${baseUrl}/movimientos`,
      {
        tipo: "DESCARGO",
        fraccion: texto(fd, "fraccion") ?? "",
        nico: texto(fd, "nico"),
        cantidad: numero(fd, "cantidad") ?? 0,
        pedimentoNumero: texto(fd, "pedimentoNumero") ?? "",
        clavePedimento: texto(fd, "clavePedimento") ?? "",
        despachoConcluidoEn: iso(fd, "despachoConcluidoEn"),
      },
      setEstadoDescargo,
    );
  }

  function leerArchivoCsv(e: ChangeEvent<HTMLInputElement>): void {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result === "string") setCsv(lector.result);
    };
    lector.readAsText(archivo);
  }

  function enviarCsv(): void {
    void postear(`${baseUrl}/ingesta`, { tipo: tipoCsv, csv }, setEstadoCsv);
  }

  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: 0 }}>
        Alimentar el libro de cotejo
      </h2>
      <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "0.25rem" }}>
        Registra entradas (importación temporal) y descargos (retorno) unitarios,
        o ingesta masiva por CSV. El servidor valida, aplica PEPS y alerta
        (faltante de saldo, regla de 48 h) sin bloquear (C9).
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* 1) ENTRADA unitaria (EntradaImmexInput)                            */}
      {/* ------------------------------------------------------------------ */}
      <details style={estiloDetails}>
        <summary style={estiloSummary}>Registrar ENTRADA (importación temporal)</summary>
        <form onSubmit={enviarEntrada}>
          <div style={estiloGrid}>
            <Campo etiqueta="Fracción (TIGIE)" name="fraccion" requerido placeholder="84713001" />
            <Campo etiqueta="NICO" name="nico" placeholder="00" />
            <Campo etiqueta="Descripción" name="descripcion" requerido placeholder="Lámina de acero" />
            <Campo etiqueta="Unidad de medida" name="unidadMedida" requerido placeholder="Kilogramo" />
            <Campo etiqueta="Cantidad" name="cantidad" type="number" step="0.0001" requerido />
            <Campo etiqueta="Valor en aduana (MXN)" name="valorAduana" type="number" step="0.01" />
            <Campo etiqueta="Pedimento (15 dígitos)" name="pedimentoNumero" requerido placeholder="26 07 3421 6001234" />
            <Campo etiqueta="Clave de pedimento" name="clavePedimento" requerido placeholder="IN" />
            <Campo etiqueta="Fecha límite de retorno" name="fechaLimiteRetorno" type="date" requerido />
            <Campo etiqueta="Despacho concluido (regla 48 h)" name="despachoConcluidoEn" type="datetime-local" />
          </div>
          <button type="submit" disabled={enviando} style={estiloBoton(enviando)}>
            {enviando ? "Enviando…" : "Registrar entrada"}
          </button>
        </form>
        <ResultadoInline estado={estadoEntrada} />
      </details>

      {/* ------------------------------------------------------------------ */}
      {/* 2) DESCARGO unitario (DescargoImmexInput)                          */}
      {/* ------------------------------------------------------------------ */}
      <details style={estiloDetails}>
        <summary style={estiloSummary}>Registrar DESCARGO (retorno)</summary>
        <form onSubmit={enviarDescargo}>
          <div style={estiloGrid}>
            <Campo etiqueta="Fracción (TIGIE)" name="fraccion" requerido placeholder="84713001" />
            <Campo etiqueta="NICO" name="nico" placeholder="00" />
            <Campo etiqueta="Cantidad a descargar" name="cantidad" type="number" step="0.0001" requerido />
            <Campo etiqueta="Pedimento (15 dígitos)" name="pedimentoNumero" requerido placeholder="26 07 3421 6005678" />
            <Campo etiqueta="Clave de pedimento" name="clavePedimento" requerido placeholder="RT" />
            <Campo etiqueta="Despacho concluido (regla 48 h)" name="despachoConcluidoEn" type="datetime-local" />
          </div>
          <button type="submit" disabled={enviando} style={estiloBoton(enviando)}>
            {enviando ? "Enviando…" : "Registrar descargo"}
          </button>
        </form>
        <ResultadoInline estado={estadoDescargo} />
      </details>

      {/* ------------------------------------------------------------------ */}
      {/* 3) Ingesta masiva CSV (POST { tipo, csv } a /ingesta)              */}
      {/* ------------------------------------------------------------------ */}
      <details style={estiloDetails}>
        <summary style={estiloSummary}>Ingesta masiva CSV</summary>
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
          Primera línea el encabezado; después una fila por movimiento. Para
          ENTRADA:{" "}
          <code style={{ fontFamily: "monospace" }}>{ENCABEZADO_ENTRADA}</code>.
          Para DESCARGO:{" "}
          <code style={{ fontFamily: "monospace" }}>{ENCABEZADO_DESCARGO}</code>.
          Las filas con error se reportan pero no bloquean a las válidas (C9).
        </div>

        <div style={{ marginTop: "0.8rem" }}>
          <label style={estiloLabel}>Tipo de movimientos del CSV</label>
          <select
            value={tipoCsv}
            disabled={enviando}
            onChange={(e) => setTipoCsv(e.target.value === "DESCARGO" ? "DESCARGO" : "ENTRADA")}
            style={{ ...estiloInput, width: "auto", minWidth: "16rem" }}
          >
            <option value="ENTRADA">ENTRADA (importación temporal)</option>
            <option value="DESCARGO">DESCARGO (retorno)</option>
          </select>
        </div>

        <div style={{ marginTop: "0.8rem" }}>
          <label style={estiloLabel}>CSV de movimientos (pégalo aquí o carga un archivo .csv)</label>
          <textarea
            value={csv}
            disabled={enviando}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            placeholder={ENCABEZADO_ENTRADA}
            style={{ ...estiloInput, fontFamily: "monospace", resize: "vertical" }}
          />
          <input
            type="file"
            accept=".csv"
            disabled={enviando}
            onChange={leerArchivoCsv}
            style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#334155" }}
          />
        </div>

        <button
          type="button"
          disabled={enviando || csv.trim().length === 0}
          onClick={enviarCsv}
          style={estiloBoton(enviando || csv.trim().length === 0)}
        >
          {enviando ? "Ingiriendo…" : "Ingerir movimientos"}
        </button>
        <ResultadoInline estado={estadoCsv} />
      </details>
    </section>
  );
}
