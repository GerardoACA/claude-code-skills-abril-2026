// CERBERUS COMERCIO EXTERIOR — form Contrato de Encargo (client). NO es SIDF.
// =============================================================================
// Archivo:  src/components/ContratoEncargoForm.tsx  [Agente UI-17, Inc 17]
// Proposito: Formulario client-side (solo lo monta la pagina para rol ADMIN)
//            para generar y versionar un Contrato de Encargo de tratamiento
//            (art. 36 LFPDPPP; arts. 50-55 del Reglamento). Postea a
//            /api/contrato-encargo; muestra errores (incl. 409 version duplicada)
//            y, al exito, un preview del cuerpo derivado + sello sha256. Al
//            terminar refresca el Server Component contenedor (router.refresh)
//            para que la lista de versiones se actualice.
// =============================================================================
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Longitud minima de las instrucciones (alineada con el zod del route). */
const INSTRUCCIONES_MIN = 20;

type RespuestaOk = {
  ok: true;
  contrato: {
    id: string;
    version: string;
    sha256: string;
    vigenteDesde: string;
  };
  cuerpo: string;
};

export function ContratoEncargoForm() {
  const router = useRouter();
  const [version, setVersion] = useState<string>("");
  const [instrucciones, setInstrucciones] = useState<string>("");
  const [subencargados, setSubencargados] = useState<string>("");
  const [vigenteHasta, setVigenteHasta] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);
  const [exito, setExito] = useState<RespuestaOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const versionValida: boolean = version.trim().length >= 1;
  const instruccionesValidas: boolean =
    instrucciones.trim().length >= INSTRUCCIONES_MIN;
  const puedeEnviar: boolean = versionValida && instruccionesValidas && !enviando;

  async function generar(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!puedeEnviar) return;
    setEnviando(true);
    setExito(null);
    setError(null);
    try {
      // vigenteHasta viaja como ISO 8601 (el input date da "YYYY-MM-DD").
      const vigenteHastaIso: string | undefined =
        vigenteHasta.trim().length > 0
          ? new Date(`${vigenteHasta}T00:00:00.000Z`).toISOString()
          : undefined;

      const resp = await fetch("/api/contrato-encargo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: version.trim(),
          instrucciones: instrucciones.trim(),
          ...(subencargados.trim().length > 0
            ? { subencargados: subencargados.trim() }
            : {}),
          ...(vigenteHastaIso !== undefined
            ? { vigenteHasta: vigenteHastaIso }
            : {}),
        }),
      });
      if (!resp.ok) {
        const cuerpo = (await resp.json().catch(() => null)) as {
          error?: string;
          detalles?: string[];
        } | null;
        setError(
          cuerpo?.detalles?.join(" · ") ??
            cuerpo?.error ??
            "No se pudo generar el Contrato de Encargo",
        );
        return;
      }
      const data = (await resp.json()) as RespuestaOk;
      setExito(data);
      setVersion("");
      setInstrucciones("");
      setSubencargados("");
      setVigenteHasta("");
      // Refresca el Server Component para que la lista de versiones se actualice.
      router.refresh();
    } catch {
      setError("Error de red al generar el Contrato de Encargo");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={generar} style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Version (etiqueta, p. ej. &ldquo;v1&rdquo;)
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={enviando}
            placeholder="v1"
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: "0.9rem",
            }}
          />
        </label>

        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Instrucciones del responsable (obligatorio, minimo {INSTRUCCIONES_MIN}{" "}
          caracteres)
          <textarea
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            disabled={enviando}
            rows={5}
            placeholder="Detalla las instrucciones documentadas del responsable al encargado sobre el tratamiento de los datos personales…"
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: `1px solid ${
                instrucciones.length > 0 && !instruccionesValidas
                  ? "#fca5a5"
                  : "#cbd5e1"
              }`,
              borderRadius: 6,
              fontSize: "0.9rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <span
            style={{
              fontSize: "0.78rem",
              color: instruccionesValidas ? "#065f46" : "#92400e",
            }}
          >
            {instrucciones.trim().length}/{INSTRUCCIONES_MIN} caracteres minimos
            {instruccionesValidas ? " — instrucciones suficientes" : ""}
          </span>
        </label>

        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Subencargados autorizados (opcional; lista libre o JSON)
          <textarea
            value={subencargados}
            onChange={(e) => setSubencargados(e.target.value)}
            disabled={enviando}
            rows={3}
            placeholder="Ej.: Proveedor de nube X (hospedaje), despacho contable Y… Si se deja vacio, no se autorizan subencargados."
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: "0.9rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Vigente hasta (opcional)
          <input
            type="date"
            value={vigenteHasta}
            onChange={(e) => setVigenteHasta(e.target.value)}
            disabled={enviando}
            style={{
              display: "block",
              marginTop: "0.25rem",
              padding: "0.45rem 0.6rem",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: "0.9rem",
            }}
          />
        </label>

        <p
          style={{
            margin: 0,
            padding: "0.6rem 0.8rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 6,
            color: "#1e3a8a",
            fontSize: "0.82rem",
          }}
        >
          El cuerpo del contrato se <strong>deriva de forma determinista</strong>{" "}
          de los datos del tenant y se sella con <strong>SHA-256</strong> al
          crearse; el acto queda encadenado en la bitacora de auditoria. La
          version debe ser unica por tenant.
        </p>

        <div>
          <button
            type="submit"
            disabled={!puedeEnviar}
            style={{
              border: "1px solid #2563eb",
              background: puedeEnviar ? "#2563eb" : "#eff6ff",
              color: puedeEnviar ? "#fff" : "#2563eb",
              borderRadius: 6,
              padding: "0.6rem 1.2rem",
              fontSize: "0.95rem",
              cursor: enviando ? "wait" : puedeEnviar ? "pointer" : "not-allowed",
            }}
          >
            {enviando ? "Generando…" : "Generar Contrato de Encargo"}
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
            <p style={{ margin: 0 }}>
              Contrato <strong>{exito.contrato.version}</strong> generado y sellado.
            </p>
            <p
              style={{
                margin: "0.4rem 0 0",
                fontFamily: "monospace",
                fontSize: "0.75rem",
              }}
            >
              sha256 {exito.contrato.sha256.slice(0, 24)}…
            </p>
            <p style={{ margin: "0.6rem 0 0.25rem", fontWeight: 600 }}>
              Vista previa del cuerpo:
            </p>
            <pre
              style={{
                margin: 0,
                maxHeight: 320,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "0.6rem 0.8rem",
                fontSize: "0.78rem",
                color: "#334155",
              }}
            >
              {exito.cuerpo}
            </pre>
          </div>
        ) : null}
        {error ? (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.85rem" }}>{error}</p>
        ) : null}
      </div>
    </form>
  );
}
