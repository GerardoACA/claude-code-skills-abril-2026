// CERBERUS COMERCIO EXTERIOR — form de override de alerta (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/OverrideForm.tsx  [Agente UI-15, Inc 15]
// Proposito: Formulario client-side para registrar un OVERRIDE de alerta
//            (decision C11): el responsable decide continuar operando con el
//            cliente pese a un resultado adverso, y lo MOTIVA por escrito
//            (min 20 chars). Postea a /api/clientes/[id]/override y muestra la
//            respuesta del conector de firma (p. ej. la nota honesta SIN_FIRMA
//            del FirmadorNoOp). Al terminar refresca el Server Component
//            contenedor (router.refresh) para que la lista de overrides se
//            actualice.
//
// DECISION C9/C11: el sistema alerta, el RESPONSABLE decide. Este form no
// desbloquea nada (nada esta bloqueado): documenta la decision humana con
// motivo, atribucion, sello sha256 y bitacora encadenada.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Longitud minima del motivo (alineada con el zod del route y el schema). */
const MOTIVO_MIN = 20;

/** Fuente con resultado adverso sobre la que se puede registrar override. */
export type FuenteAdversa = {
  /** Valor EXACTO del enum FuenteVerificacion (p. ej. "ART_69B"). */
  fuente: string;
  /** Etiqueta legible para el selector. */
  etiqueta: string;
  /** Resultado adverso mas reciente (p. ej. "INHABILITADO_PRESUNTO"). */
  resultado: string;
};

type RespuestaOk = {
  ok: true;
  mensaje: string;
  override: {
    id: string;
    fuente: string;
    resultado: string;
    estadoFirma: string;
    sha256: string;
    creadoEn: string;
  };
  firma: { estado: string; detalle: string };
};

type Props = {
  clienteId: string;
  /** Fuentes cuyo ultimo resultado es adverso (ALERTA / INHABILITADO_*). */
  fuentesAdversas: FuenteAdversa[];
};

export function OverrideForm({ clienteId, fuentesAdversas }: Props) {
  const router = useRouter();
  const [fuente, setFuente] = useState<string>(fuentesAdversas[0]?.fuente ?? "");
  const [motivo, setMotivo] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [exito, setExito] = useState<RespuestaOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (fuentesAdversas.length === 0) {
    return null;
  }

  const seleccionada: FuenteAdversa =
    fuentesAdversas.find((f) => f.fuente === fuente) ?? fuentesAdversas[0];
  // Resultado prellenado desde props: copia legible del resultado adverso que
  // se decide sobrellevar (no editable: debe corresponder a la alerta real).
  const resultado: string = seleccionada.resultado;

  const motivoValido: boolean = motivo.trim().length >= MOTIVO_MIN;

  async function registrar(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!motivoValido || enviando) return;
    setEnviando(true);
    setExito(null);
    setError(null);
    try {
      const resp = await fetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/override`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fuente: seleccionada.fuente,
            resultado,
            motivo: motivo.trim(),
          }),
        },
      );
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as {
          error?: string;
          detalles?: string[];
        } | null;
        setError(
          cuerpo?.detalles?.join(" · ") ??
            cuerpo?.error ??
            "No se pudo registrar el override",
        );
        return;
      }
      const data = (await resp.json()) as RespuestaOk;
      setExito(data);
      setMotivo("");
      // Refresca el Server Component para que la seccion "Overrides
      // registrados" muestre el acto recien sellado.
      router.refresh();
    } catch {
      setError("Error de red al registrar el override");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={registrar} style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Fuente con resultado adverso
          <select
            value={seleccionada.fuente}
            onChange={(e) => setFuente(e.target.value)}
            disabled={enviando}
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: "0.9rem",
            }}
          >
            {fuentesAdversas.map((f) => (
              <option key={f.fuente} value={f.fuente}>
                {f.etiqueta} — {f.resultado}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Resultado adverso que se decide sobrellevar
          <input
            type="text"
            value={resultado}
            readOnly
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              fontSize: "0.9rem",
              background: "#f8fafc",
              color: "#475569",
              fontFamily: "monospace",
            }}
          />
        </label>

        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Motivo de la decision (obligatorio, minimo {MOTIVO_MIN} caracteres)
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
            rows={4}
            placeholder="Explica POR QUE el responsable decide continuar operando con este cliente pese al resultado adverso…"
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: `1px solid ${motivo.length > 0 && !motivoValido ? "#fca5a5" : "#cbd5e1"}`,
              borderRadius: 6,
              fontSize: "0.9rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <span
            style={{
              fontSize: "0.78rem",
              color: motivoValido ? "#065f46" : "#92400e",
            }}
          >
            {motivo.trim().length}/{MOTIVO_MIN} caracteres minimos
            {motivoValido ? " — motivo suficiente" : ""}
          </span>
        </label>

        <p
          style={{
            margin: 0,
            padding: "0.6rem 0.8rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            color: "#92400e",
            fontSize: "0.82rem",
          }}
        >
          Este acto queda <strong>sellado, atribuido y auditable</strong> (sha256
          + bitacora encadenada); la decision y responsabilidad de continuar es
          del responsable — decisiones C9/C11. El override <strong>no borra ni
          modifica la alerta</strong>: la acompaña.
        </p>

        <div>
          <button
            type="submit"
            disabled={enviando || !motivoValido}
            style={{
              border: "1px solid #b91c1c",
              background: enviando || !motivoValido ? "#fef2f2" : "#b91c1c",
              color: enviando || !motivoValido ? "#b91c1c" : "#fff",
              borderRadius: 6,
              padding: "0.6rem 1.2rem",
              fontSize: "0.95rem",
              cursor: enviando ? "wait" : motivoValido ? "pointer" : "not-allowed",
            }}
          >
            {enviando ? "Registrando…" : "Registrar override motivado"}
          </button>
        </div>

        {exito ? (
          <div
            style={{
              padding: "0.6rem 0.8rem",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 6,
              color: "#065f46",
              fontSize: "0.85rem",
            }}
          >
            <p style={{ margin: 0 }}>{exito.mensaje}</p>
            <p style={{ margin: "0.4rem 0 0" }}>
              Estado de firma: <strong>{exito.firma.estado}</strong> —{" "}
              {exito.firma.detalle}
            </p>
            <p style={{ margin: "0.4rem 0 0", fontFamily: "monospace", fontSize: "0.75rem" }}>
              sha256 {exito.override.sha256.slice(0, 24)}…
            </p>
          </div>
        ) : null}
        {error ? (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}>{error}</p>
        ) : null}
      </div>
    </form>
  );
}
