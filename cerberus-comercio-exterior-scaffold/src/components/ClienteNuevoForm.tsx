"use client";

// CERBERUS COMERCIO EXTERIOR — Form de alta de cliente con prellenado desde CSF. NO es SIDF.
// =============================================================================
// Archivo:  src/components/ClienteNuevoForm.tsx  (Incremento 46)
// Propósito: Client Component del alta de Cliente/Importador con CAPTURA
//            ASISTIDA: arriba, la vía recomendada — subir la Constancia de
//            Situación Fiscal (PDF) a POST /api/clientes/prefill para prellenar
//            RFC, razón social y domicilio (editables, marcados como
//            precargados); abajo, los mismos campos manuales de siempre. El
//            envío es el POST /api/clientes EXISTENTE, sin cambiar su contrato:
//            el tenantId NUNCA viaja desde aquí (lo deriva el handler del JWT).
//
// C9: el prellenado SUGIERE, nunca impone — el capturista revisa y corrige.
// Fail-safe: si el PDF no se puede leer, se avisa y la captura manual sigue
// disponible. El domicilio se envía por UX pero el modelo Cliente aún no lo
// persiste (ver nota en src/app/api/clientes/route.ts): se usará en el
// expediente KYC.
// =============================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { mapearPrefillCliente } from "@/lib/prefill-cliente";
import type { DatosPrefillCliente } from "@/lib/prefill-cliente";

type RespuestaOk = { ok: true; cliente: { id: string; rfc: string } };
type RespuestaError = { error?: string };

type RespuestaPrefill =
  | { ok: true; tipoDocumento: string; datos: DatosPrefillCliente; camposDetectados: string[] }
  | { ok: false; detalle: string };

/** Tamaño máximo del PDF (10 MB, mismo tope que el route de prefill). */
const PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Fondo verde tenue para los campos precargados desde el documento. */
const FONDO_PRECARGADO = "#f0fdf4";

export function ClienteNuevoForm() {
  const router = useRouter();

  const [rfc, setRfc] = useState<string>("");
  const [razonSocial, setRazonSocial] = useState<string>("");
  const [domicilioOperacionesCE, setDomicilioOperacionesCE] = useState<string>("");

  // Banderas de "precargado desde la CSF" (se apagan si el usuario edita).
  const [preRfc, setPreRfc] = useState<boolean>(false);
  const [preRazon, setPreRazon] = useState<boolean>(false);
  const [preDomicilio, setPreDomicilio] = useState<boolean>(false);

  const [extrayendo, setExtrayendo] = useState<boolean>(false);
  const [avisoPrefill, setAvisoPrefill] = useState<string | null>(null);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<boolean>(false);

  async function alSeleccionarCsf(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvisoPrefill(null);
    setAdvertencias([]);

    if (file.size > PDF_MAX_BYTES) {
      setAvisoPrefill("El PDF excede el tamaño máximo de 10 MB.");
      return;
    }

    setExtrayendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/clientes/prefill", { method: "POST", body: fd });
      if (!res.ok) {
        const cuerpo: RespuestaError = (await res
          .json()
          .catch(() => ({}))) as RespuestaError;
        setAvisoPrefill(cuerpo.error ?? `Error ${res.status} al leer el PDF`);
        return;
      }

      const cuerpo = (await res.json()) as RespuestaPrefill;
      if (!cuerpo.ok) {
        // Fail-safe del servidor: PDF ilegible => se sigue con captura manual.
        setAvisoPrefill(cuerpo.detalle);
        return;
      }

      const mapeo = mapearPrefillCliente(cuerpo.datos);
      // Solo se sobrescribe con lo que el documento SÍ trajo (C9: sugerir).
      if (mapeo.precargados.rfc) setRfc(mapeo.valores.rfc);
      if (mapeo.precargados.razonSocial) setRazonSocial(mapeo.valores.razonSocial);
      if (mapeo.precargados.domicilioOperacionesCE) {
        setDomicilioOperacionesCE(mapeo.valores.domicilioOperacionesCE);
      }
      setPreRfc(mapeo.precargados.rfc);
      setPreRazon(mapeo.precargados.razonSocial);
      setPreDomicilio(mapeo.precargados.domicilioOperacionesCE);

      const avisos = [...mapeo.advertencias];
      if (cuerpo.tipoDocumento !== "CONSTANCIA_SITUACION_FISCAL") {
        avisos.unshift(
          "El PDF no parece una Constancia de Situación Fiscal: revisa los datos con cuidado.",
        );
      }
      setAdvertencias(avisos);
    } catch {
      setAvisoPrefill("No se pudo conectar con el servidor para leer el PDF.");
    } finally {
      setExtrayendo(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setExito(false);
    setEnviando(true);

    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfc,
          razonSocial,
          // Solo se incluye si hay algo capturado/precargado (campo opcional).
          domicilioOperacionesCE:
            domicilioOperacionesCE.trim().length > 0
              ? domicilioOperacionesCE
              : undefined,
        }),
      });

      if (!res.ok) {
        const cuerpo: RespuestaError = (await res
          .json()
          .catch(() => ({}))) as RespuestaError;
        setError(cuerpo.error ?? `Error ${res.status}`);
        return;
      }

      // Éxito: consumimos la respuesta y redirigimos a la lista.
      (await res.json().catch(() => ({}))) as RespuestaOk | RespuestaError;
      setExito(true);
      router.push("/clientes");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  const etiqueta: React.CSSProperties = {
    display: "block",
    fontSize: "0.9rem",
    color: "#334155",
    marginBottom: "0.25rem",
    fontWeight: 600,
  };
  const campo: React.CSSProperties = {
    width: "100%",
    padding: "0.55rem 0.7rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "1rem",
    marginBottom: "1.1rem",
    boxSizing: "border-box",
  };
  const marcaPrecargado = (activo: boolean): React.CSSProperties =>
    activo ? { background: FONDO_PRECARGADO, borderColor: "#86efac" } : {};

  return (
    <div>
      {/* ----- Vía recomendada: prellenar desde la CSF (captura asistida) ----- */}
      <section
        style={{
          padding: "1rem 1.25rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#1e40af" }}>
          Da de alta desde la CSF (recomendado)
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0.4rem 0 0.75rem" }}>
          Sube la Constancia de Situación Fiscal (PDF, máx. 10 MB): el RFC, la
          razón social y el domicilio se prellenan solos. Revisa y corrige antes
          de registrar — nada se guarda hasta que envíes el formulario.
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={alSeleccionarCsf}
          disabled={extrayendo}
          aria-label="PDF de la Constancia de Situación Fiscal"
          style={{ fontSize: "0.9rem" }}
        />
        {extrayendo ? (
          <p style={{ fontSize: "0.85rem", color: "#1e40af", margin: "0.6rem 0 0" }}>
            Leyendo el PDF…
          </p>
        ) : null}
        {avisoPrefill !== null ? (
          <p role="status" style={{ fontSize: "0.85rem", color: "#92400e", margin: "0.6rem 0 0" }}>
            {avisoPrefill}
          </p>
        ) : null}
      </section>

      {advertencias.length > 0 ? (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            color: "#92400e",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
          }}
        >
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error !== null ? (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
            marginBottom: "1.25rem",
          }}
        >
          {error}
        </div>
      ) : null}

      {exito ? (
        <div
          role="status"
          style={{
            padding: "0.75rem 1rem",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            color: "#065f46",
            marginBottom: "1.25rem",
          }}
        >
          Cliente registrado. Redirigiendo…
        </div>
      ) : null}

      {/* ----- Campos manuales de siempre (editables aun precargados) ----- */}
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="rfc" style={etiqueta}>
          RFC{" "}
          {preRfc ? (
            <span style={{ fontWeight: 400, color: "#15803d" }}>(precargado de la CSF)</span>
          ) : null}
        </label>
        <input
          id="rfc"
          name="rfc"
          type="text"
          value={rfc}
          onChange={(e) => {
            setRfc(e.target.value);
            setPreRfc(false);
          }}
          required
          minLength={12}
          maxLength={13}
          autoComplete="off"
          placeholder="RFC (12-13 caracteres)"
          style={{
            ...campo,
            fontFamily: "monospace",
            textTransform: "uppercase",
            ...marcaPrecargado(preRfc),
          }}
        />

        <label htmlFor="razonSocial" style={etiqueta}>
          Razón social{" "}
          {preRazon ? (
            <span style={{ fontWeight: 400, color: "#15803d" }}>(precargada de la CSF)</span>
          ) : null}
        </label>
        <input
          id="razonSocial"
          name="razonSocial"
          type="text"
          value={razonSocial}
          onChange={(e) => {
            setRazonSocial(e.target.value);
            setPreRazon(false);
          }}
          required
          maxLength={400}
          placeholder="Razón social del importador"
          style={{ ...campo, ...marcaPrecargado(preRazon) }}
        />

        <label htmlFor="domicilioOperacionesCE" style={etiqueta}>
          Domicilio de operaciones de comercio exterior{" "}
          <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span>{" "}
          {preDomicilio ? (
            <span style={{ fontWeight: 400, color: "#15803d" }}>(precargado de la CSF)</span>
          ) : null}
        </label>
        <textarea
          id="domicilioOperacionesCE"
          name="domicilioOperacionesCE"
          value={domicilioOperacionesCE}
          onChange={(e) => {
            setDomicilioOperacionesCE(e.target.value);
            setPreDomicilio(false);
          }}
          maxLength={1000}
          rows={3}
          placeholder="Texto libre"
          style={{ ...campo, resize: "vertical", ...marcaPrecargado(preDomicilio) }}
        />
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "-0.7rem 0 1.1rem" }}>
          El domicilio se usará en el expediente KYC.
        </p>

        <button
          type="submit"
          disabled={enviando}
          style={{
            background: enviando ? "#93c5fd" : "#2563eb",
            color: "#fff",
            padding: "0.6rem 1.2rem",
            border: "none",
            borderRadius: 6,
            fontSize: "1rem",
            cursor: enviando ? "default" : "pointer",
          }}
        >
          {enviando ? "Registrando…" : "Registrar cliente"}
        </button>
      </form>
    </div>
  );
}
