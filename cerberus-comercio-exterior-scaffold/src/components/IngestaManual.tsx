// CERBERUS COMERCIO EXTERIOR — formulario de ingesta manual de listados (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/IngestaManual.tsx
// Propósito (Incremento 12 — Agente SERVICIO-12): Formulario client-side para
//   que el ADMIN suba un CSV de cualquier fuente del enum FuenteVerificacion
//   (incluida SANCIONES_INT: OFAC/SDN, ONU, UE, UK…) con emisor opcional.
//   [Inc 58] Incluye PADRON (Padrón de Importadores, Módulo 2.1): CSV propio
//   del despacho con columnas rfc,estado (ACTIVO|SUSPENDIDO); al elegirla se
//   muestra la ayuda del formato (el endpoint valida fila por fila).
//   Postea FormData a POST /api/admin/listados/manual, muestra el resultado
//   { fuente, filas, sha256, origen } o el error, y refresca el Server
//   Component contenedor (router.refresh) para actualizar la tabla de últimas
//   importaciones.
//
// VISIBILIDAD: se renderiza SOLO si la prop `esAdmin` es true (el rol proviene
// del JWT verificado en el Server Component que lo monta). La autorización REAL
// la impone el endpoint (401/403): ocultar el formulario es solo UX.
//
// FUENTES: llegan por prop desde el Server Component (FUENTES_VERIFICACION del
// servicio) para mantener UNA fuente de verdad sin arrastrar imports de
// servidor al bundle client. Las etiquetas legibles viven aquí (solo UX).
// =============================================================================
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Tamaño máximo aceptado por el endpoint (25 MB); pre-chequeo de UX. */
const TAMANO_MAX_BYTES = 25 * 1024 * 1024;

// Respuesta feliz de POST /api/admin/listados/manual.
type RespuestaIngesta = {
  fuente: string;
  filas: number;
  sha256: string;
  origen: string;
};

// Etiquetas legibles por fuente (solo presentación; el valor real es el literal
// del enum). Una fuente sin etiqueta se muestra por su literal.
const ETIQUETAS_FUENTE: Record<string, string> = {
  ART_69: "Art. 69 CFF (créditos firmes / no localizados)",
  ART_69B: "Art. 69-B CFF (EFOS/EDOS)",
  ART_69B_BIS: "Art. 69-B Bis (transmisión indebida de pérdidas)",
  ART_49BIS: "Art. 49 Bis CFF (supuesto que inhabilita)",
  OPINION_32D: "Opinión 32-D (cumplimiento de obligaciones)",
  CSD_17H: "CSD 17-H (sello digital)",
  SANCIONES_INT: "Sanciones internacionales (OFAC/SDN, ONU, UE, UK…)",
  PADRON: "Padrón de Importadores (Módulo 2.1)", // [Inc 58]
};

type Props = {
  /** true solo si el rol del JWT verificado es ADMIN (lo pasa el Server Component). */
  esAdmin: boolean;
  /** Literales del enum FuenteVerificacion (FUENTES_VERIFICACION del servicio). */
  fuentes: readonly string[];
};

export function IngestaManual({ esAdmin, fuentes }: Props) {
  const router = useRouter();
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const [fuente, setFuente] = useState<string>(fuentes[0] ?? "");
  const [emisor, setEmisor] = useState<string>("");
  const [cargando, setCargando] = useState<boolean>(false);
  const [resultado, setResultado] = useState<RespuestaIngesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Solo ADMIN ve el formulario (el endpoint además responde 401/403).
  if (!esAdmin) {
    return null;
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setResultado(null);
    setError(null);

    const archivo = inputArchivoRef.current?.files?.[0] ?? null;
    if (!archivo) {
      setError("Selecciona un archivo CSV para importar");
      return;
    }
    if (archivo.size > TAMANO_MAX_BYTES) {
      setError("El archivo excede el tamaño máximo de 25 MB");
      return;
    }

    setCargando(true);
    try {
      const datos = new FormData();
      datos.set("fuente", fuente);
      if (emisor.trim().length > 0) {
        datos.set("emisor", emisor.trim());
      }
      datos.set("archivo", archivo);

      const resp = await fetch("/api/admin/listados/manual", {
        method: "POST",
        body: datos,
      });
      const cuerpo = (await resp.json().catch(() => null)) as
        | (Partial<RespuestaIngesta> & { error?: string })
        | null;

      if (
        !resp.ok ||
        cuerpo === null ||
        typeof cuerpo.fuente !== "string" ||
        typeof cuerpo.filas !== "number" ||
        typeof cuerpo.sha256 !== "string" ||
        typeof cuerpo.origen !== "string"
      ) {
        setError(cuerpo?.error ?? "No se pudo importar el archivo");
        return;
      }

      setResultado({
        fuente: cuerpo.fuente,
        filas: cuerpo.filas,
        sha256: cuerpo.sha256,
        origen: cuerpo.origen,
      });
      // Limpia el archivo elegido y refresca la tabla de últimas importaciones.
      if (inputArchivoRef.current) {
        inputArchivoRef.current.value = "";
      }
      router.refresh();
    } catch {
      setError("Error de red al importar el archivo");
    } finally {
      setCargando(false);
    }
  }

  const estiloCampo: React.CSSProperties = {
    display: "block",
    width: "100%",
    maxWidth: 420,
    padding: "0.45rem 0.6rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "0.9rem",
    marginTop: "0.25rem",
  };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <form onSubmit={enviar}>
        <label style={{ display: "block", fontSize: "0.9rem", color: "#334155" }}>
          Fuente
          <select
            name="fuente"
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            disabled={cargando}
            style={estiloCampo}
          >
            {fuentes.map((f) => (
              <option key={f} value={f}>
                {ETIQUETAS_FUENTE[f] ?? f}
              </option>
            ))}
          </select>
        </label>

        {fuente === "PADRON" ? (
          // [Inc 58] El SAT no publica CSV público del padrón: el despacho
          // prepara el archivo, así que se le indica el formato exacto.
          <p style={{ marginTop: "0.5rem", color: "#475569", fontSize: "0.85rem" }}>
            Formato del CSV del padrón: encabezado <code>rfc,estado</code> y una
            fila por RFC con estado <strong>ACTIVO</strong> o{" "}
            <strong>SUSPENDIDO</strong> (tolerante a mayúsculas/minúsculas y
            espacios). Una fila con RFC o estado inválido rechaza el archivo
            completo indicando la línea.
          </p>
        ) : null}

        <label
          style={{
            display: "block",
            fontSize: "0.9rem",
            color: "#334155",
            marginTop: "0.75rem",
          }}
        >
          Emisor (opcional; p. ej. SAT, OFAC, ONU, UE, UK)
          <input
            type="text"
            name="emisor"
            value={emisor}
            onChange={(e) => setEmisor(e.target.value)}
            maxLength={120}
            placeholder="OFAC"
            disabled={cargando}
            style={estiloCampo}
          />
        </label>

        <label
          style={{
            display: "block",
            fontSize: "0.9rem",
            color: "#334155",
            marginTop: "0.75rem",
          }}
        >
          Archivo CSV (máx. 25 MB)
          <input
            type="file"
            name="archivo"
            ref={inputArchivoRef}
            accept=".csv,text/csv"
            disabled={cargando}
            style={{ ...estiloCampo, border: "none", paddingLeft: 0 }}
          />
        </label>

        <button
          type="submit"
          disabled={cargando}
          style={{
            marginTop: "1rem",
            border: "1px solid #1d4ed8",
            background: cargando ? "#eff6ff" : "#1d4ed8",
            color: cargando ? "#1d4ed8" : "#fff",
            borderRadius: 6,
            padding: "0.6rem 1.2rem",
            fontSize: "0.95rem",
            cursor: cargando ? "wait" : "pointer",
          }}
        >
          {cargando ? "Importando archivo..." : "Importar archivo"}
        </button>
      </form>

      {cargando ? (
        <p style={{ marginTop: "0.75rem", color: "#475569", fontSize: "0.9rem" }}>
          Subiendo y sellando el archivo (sha256 del crudo) e importando sus
          filas por lotes. Puede tardar; no cierres esta pestaña.
        </p>
      ) : null}

      {resultado ? (
        <p style={{ marginTop: "0.75rem", color: "#065f46", fontSize: "0.9rem" }}>
          Importación <strong>{resultado.origen}</strong> de{" "}
          <strong>{resultado.fuente}</strong>: {resultado.filas} filas.{" "}
          <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            sha256 {resultado.sha256.slice(0, 16)}…
          </code>
        </p>
      ) : null}

      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#b91c1c", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: "0.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        La importación manual sella el archivo con SHA-256 y queda registrada
        con origen MANUAL y emisor. En SANCIONES_INT el match por NOMBRE es
        heurístico: siempre produce ALERTA con revisión humana, nunca bloqueo
        (decisión C9).
      </p>
    </div>
  );
}
