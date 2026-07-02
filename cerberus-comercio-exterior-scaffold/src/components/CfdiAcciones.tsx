"use client";

// CERBERUS COMERCIO EXTERIOR — Botones Timbrar / Cancelar de un CFDI. NO es SIDF.
// =============================================================================
// Archivo:  src/components/CfdiAcciones.tsx
// Propósito: Client component pequeño por comprobante: botón "Timbrar" (POST a
//            /api/operaciones/[id]/cfdi/[cfdiId]/timbrar; con el conector NoOp
//            muestra el mensaje honesto "Conector PAC no configurado" y el
//            estado queda BORRADOR) y bloque "Cancelar" (motivo M01..M04 +
//            sustituyeUuid si M01; POST a .../cancelar; sobre un no-TIMBRADO el
//            route responde 409 con mensaje claro — decisión C8: el flujo queda
//            modelado desde el inicio). Tras cada respuesta refresca el Server
//            Component para releer estado/detallePac.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EstadoCfdi = "BORRADOR" | "TIMBRADO" | "CANCELADO" | "SUSTITUIDO";

export type MotivoCancelacion = "M01" | "M02" | "M03" | "M04";

const MOTIVOS: readonly MotivoCancelacion[] = ["M01", "M02", "M03", "M04"];

const ETIQUETA_MOTIVO: Readonly<Record<MotivoCancelacion, string>> = {
  M01: "01 — Emitido con errores CON relación (exige UUID sustituto)",
  M02: "02 — Emitido con errores SIN relación",
  M03: "03 — No se llevó a cabo la operación",
  M04: "04 — Operación nominativa en factura global",
};

export type CfdiAccionesProps = {
  operacionId: string;
  cfdiId: string;
  estado: EstadoCfdi;
};

/** Extrae un mensaje legible del cuerpo JSON de la respuesta. */
function mensajeDe(data: unknown, porDefecto: string): string {
  if (data && typeof data === "object") {
    if ("detalle" in data && typeof (data as { detalle: unknown }).detalle === "string") {
      return (data as { detalle: string }).detalle;
    }
    if ("error" in data && typeof (data as { error: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
  }
  return porDefecto;
}

export function CfdiAcciones({ operacionId, cfdiId, estado }: CfdiAccionesProps) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<MotivoCancelacion>("M02");
  const [sustituyeUuid, setSustituyeUuid] = useState<string>("");
  const [ocupado, setOcupado] = useState<boolean>(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const base = `/api/operaciones/${encodeURIComponent(operacionId)}/cfdi/${encodeURIComponent(cfdiId)}`;

  async function llamar(url: string, body: unknown, porDefecto: string): Promise<void> {
    setOcupado(true);
    setAviso(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // Sin cuerpo JSON: se usa el mensaje por defecto.
      }
      setAviso({ ok: res.ok, texto: mensajeDe(data, porDefecto) });
      if (res.ok) {
        // Releer estado/detallePac en el Server Component.
        router.refresh();
      }
    } catch {
      setAviso({ ok: false, texto: "Error de red al contactar el servidor." });
    } finally {
      setOcupado(false);
    }
  }

  const botonStyle = (color: string): React.CSSProperties => ({
    padding: "0.4rem 0.85rem",
    background: ocupado ? "#94a3b8" : color,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: ocupado ? "not-allowed" : "pointer",
    fontSize: "0.85rem",
  });
  const inputStyle: React.CSSProperties = {
    padding: "0.4rem 0.6rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.85rem",
    boxSizing: "border-box",
  };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            void llamar(`${base}/timbrar`, {}, "Intento de timbrado registrado.");
          }}
          style={botonStyle("#2563eb")}
        >
          {ocupado ? "Procesando…" : "Timbrar"}
        </button>

        <select
          aria-label="Motivo de cancelación"
          value={motivo}
          disabled={ocupado}
          onChange={(e) => setMotivo(e.target.value as MotivoCancelacion)}
          style={inputStyle}
        >
          {MOTIVOS.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MOTIVO[m]}
            </option>
          ))}
        </select>

        {motivo === "M01" && (
          <input
            type="text"
            value={sustituyeUuid}
            disabled={ocupado}
            onChange={(e) => setSustituyeUuid(e.target.value)}
            placeholder="UUID del CFDI que sustituye"
            aria-label="UUID del CFDI que sustituye"
            style={{ ...inputStyle, minWidth: 220 }}
          />
        )}

        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            const cuerpo: { motivo: MotivoCancelacion; sustituyeUuid?: string } = { motivo };
            const uuid = sustituyeUuid.trim();
            if (uuid.length > 0) cuerpo.sustituyeUuid = uuid;
            void llamar(`${base}/cancelar`, cuerpo, "Intento de cancelación registrado.");
          }}
          style={botonStyle("#dc2626")}
        >
          {ocupado ? "Procesando…" : "Cancelar CFDI"}
        </button>

        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          Estado actual: {estado}
        </span>
      </div>

      {aviso !== null && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: aviso.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${aviso.ok ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: 8,
            color: aviso.ok ? "#166534" : "#991b1b",
            fontSize: "0.85rem",
          }}
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}

export default CfdiAcciones;
