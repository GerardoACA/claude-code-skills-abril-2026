"use client";

// CERBERUS COMERCIO EXTERIOR — Form CFDI Ingreso + Comercio Exterior 1.1. NO es SIDF.
// =============================================================================
// Archivo:  src/components/CfdiComercioExtForm.tsx  (Incremento 16)
// Propósito: Client component que captura un CFDI de INGRESO con complemento
//            COMERCIO_EXT_11 (exportación definitiva): emisor/receptor,
//            domicilios, país (c_Pais), tipo de cambio USD, total USD y UNA
//            mercancía mínima con fracción arancelaria. Postea a
//            /api/operaciones/[id]/cfdi/comercio-exterior; si el route devuelve
//            400 pinta la LISTA de errores {campo, mensaje} (C9). Al 201 refresca
//            el Server Component (router.refresh).
//
// La validación de negocio (país 3 letras, fracción 8 dígitos, CP, valores)
// vive en el servidor (lib comercio-exterior); aquí solo se capturan y envían.
// =============================================================================

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export type CfdiComercioExtFormProps = {
  operacionId: string;
};

type ErrorValidacion = { campo: string; mensaje: string };

type Campos = {
  emisorRfc: string;
  receptorRfc: string;
  claveDePedimento: string;
  tipoCambioUsd: string;
  totalUsd: string;
  emisorCalle: string;
  emisorCodigoPostal: string;
  emisorEstado: string;
  emisorPais: string;
  receptorNumRegIdTrib: string;
  receptorPais: string;
  noIdentificacion: string;
  fraccionArancelaria: string;
  cantidadAduana: string;
  unidadAduana: string;
  valorUnitarioAduana: string;
  valorDolares: string;
};

const CAMPOS_INICIALES: Campos = {
  emisorRfc: "",
  receptorRfc: "",
  claveDePedimento: "A1",
  tipoCambioUsd: "",
  totalUsd: "",
  emisorCalle: "",
  emisorCodigoPostal: "",
  emisorEstado: "",
  emisorPais: "MEX",
  receptorNumRegIdTrib: "",
  receptorPais: "USA",
  noIdentificacion: "",
  fraccionArancelaria: "",
  cantidadAduana: "",
  unidadAduana: "",
  valorUnitarioAduana: "",
  valorDolares: "",
};

function aNumero(valor: string): number {
  return valor.trim().length === 0 ? Number.NaN : Number(valor);
}

export function CfdiComercioExtForm({ operacionId }: CfdiComercioExtFormProps) {
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(CAMPOS_INICIALES);
  const [certificadoOrigen, setCertificadoOrigen] = useState<boolean>(false);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [errores, setErrores] = useState<ErrorValidacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cambiar =
    (campo: keyof Campos) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const valor = e.target.value;
      setCampos((prev) => ({ ...prev, [campo]: valor }));
    };

  async function capturar(): Promise<void> {
    setEnviando(true);
    setErrores([]);
    setError(null);
    setExito(null);

    const numReg = campos.receptorNumRegIdTrib.trim();
    const payload = {
      emisorRfc: campos.emisorRfc.trim().toUpperCase(),
      receptorRfc: campos.receptorRfc.trim().toUpperCase(),
      tipoOperacion: "2",
      claveDePedimento: campos.claveDePedimento.trim(),
      certificadoOrigen,
      tipoCambioUsd: aNumero(campos.tipoCambioUsd),
      totalUsd: aNumero(campos.totalUsd),
      emisor: {
        calle: campos.emisorCalle.trim(),
        codigoPostal: campos.emisorCodigoPostal.trim(),
        estado: campos.emisorEstado.trim(),
        pais: campos.emisorPais.trim().toUpperCase(),
      },
      receptor: {
        pais: campos.receptorPais.trim().toUpperCase(),
        ...(numReg.length > 0 ? { numRegIdTrib: numReg } : {}),
      },
      mercancias: [
        {
          noIdentificacion: campos.noIdentificacion.trim(),
          fraccionArancelaria: campos.fraccionArancelaria.trim(),
          cantidadAduana: aNumero(campos.cantidadAduana),
          unidadAduana: campos.unidadAduana.trim(),
          valorUnitarioAduana: aNumero(campos.valorUnitarioAduana),
          valorDolares: aNumero(campos.valorDolares),
        },
      ],
    };

    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/cfdi/comercio-exterior`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        let mensaje = `No se pudo capturar el CFDI (HTTP ${res.status}).`;
        let lista: ErrorValidacion[] = [];
        try {
          const data: unknown = await res.json();
          if (data && typeof data === "object") {
            if ("error" in data && typeof (data as { error: unknown }).error === "string") {
              mensaje = (data as { error: string }).error;
            }
            if ("errores" in data && Array.isArray((data as { errores: unknown }).errores)) {
              lista = ((data as { errores: unknown[] }).errores).filter(
                (e): e is ErrorValidacion =>
                  typeof e === "object" &&
                  e !== null &&
                  typeof (e as { campo?: unknown }).campo === "string" &&
                  typeof (e as { mensaje?: unknown }).mensaje === "string",
              );
            }
          }
        } catch {
          // Respuesta sin cuerpo JSON: se conserva el mensaje por defecto.
        }
        setError(mensaje);
        setErrores(lista);
        return;
      }

      setExito("CFDI de ingreso con Comercio Exterior 1.1 capturado y sellado como BORRADOR.");
      setCampos(CAMPOS_INICIALES);
      setCertificadoOrigen(false);
      router.refresh();
    } catch {
      setError("Error de red al contactar el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.85rem",
    color: "#334155",
    marginBottom: "0.25rem",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.65rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: "0.95rem",
    boxSizing: "border-box",
  };
  const filaStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    marginBottom: "1rem",
  };
  const seccionStyle: React.CSSProperties = {
    fontSize: "0.95rem",
    color: "#0f172a",
    margin: "1.25rem 0 0.5rem",
  };

  type CampoDef = { campo: keyof Campos; etiqueta: string; placeholder?: string; type?: string };
  const campoInput = ({ campo, etiqueta, placeholder, type }: CampoDef) => (
    <div key={campo}>
      <label htmlFor={`ce-${campo}`} style={labelStyle}>
        {etiqueta}
      </label>
      <input
        id={`ce-${campo}`}
        type={type ?? "text"}
        value={campos[campo]}
        disabled={enviando}
        onChange={cambiar(campo)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );

  return (
    <div style={{ padding: "1.25rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
      <h3 style={{ ...seccionStyle, marginTop: 0 }}>Comprobante (INGRESO · exportación)</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "emisorRfc", etiqueta: "RFC emisor (exportador)", placeholder: "AAA010101AAA" })}
        {campoInput({ campo: "receptorRfc", etiqueta: "RFC receptor", placeholder: "XEXX010101000" })}
      </div>
      <div style={filaStyle}>
        {campoInput({ campo: "claveDePedimento", etiqueta: "Clave de pedimento", placeholder: "A1" })}
        <div>
          <label style={labelStyle}>Certificado de origen</label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", paddingTop: "0.4rem" }}>
            <input
              type="checkbox"
              checked={certificadoOrigen}
              disabled={enviando}
              onChange={(e) => setCertificadoOrigen(e.target.checked)}
            />
            Se acompaña certificado de origen
          </label>
        </div>
      </div>
      <div style={filaStyle}>
        {campoInput({ campo: "tipoCambioUsd", etiqueta: "Tipo de cambio (MXN/USD)", placeholder: "17.25", type: "number" })}
        {campoInput({ campo: "totalUsd", etiqueta: "Total en dólares (USD)", placeholder: "12500.00", type: "number" })}
      </div>

      <h3 style={seccionStyle}>Emisor (domicilio nacional)</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "emisorCalle", etiqueta: "Calle / domicilio", placeholder: "Av. Industria 100" })}
        {campoInput({ campo: "emisorCodigoPostal", etiqueta: "Código postal (5 dígitos)", placeholder: "64000" })}
      </div>
      <div style={filaStyle}>
        {campoInput({ campo: "emisorEstado", etiqueta: "Estado", placeholder: "Nuevo León" })}
        {campoInput({ campo: "emisorPais", etiqueta: "País (c_Pais, 3 letras)", placeholder: "MEX" })}
      </div>

      <h3 style={seccionStyle}>Receptor (extranjero)</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "receptorPais", etiqueta: "País (c_Pais, 3 letras)", placeholder: "USA" })}
        {campoInput({ campo: "receptorNumRegIdTrib", etiqueta: "Reg. identidad fiscal (opcional)", placeholder: "Tax ID extranjero" })}
      </div>

      <h3 style={seccionStyle}>Mercancía</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "noIdentificacion", etiqueta: "No. de identificación / SKU", placeholder: "SKU-001" })}
        {campoInput({ campo: "fraccionArancelaria", etiqueta: "Fracción arancelaria (8 dígitos)", placeholder: "84713001" })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        {campoInput({ campo: "cantidadAduana", etiqueta: "Cantidad (aduana)", placeholder: "100", type: "number" })}
        {campoInput({ campo: "unidadAduana", etiqueta: "Unidad de aduana (c_UnidadAduana)", placeholder: "01" })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        {campoInput({ campo: "valorUnitarioAduana", etiqueta: "Valor unitario aduana", placeholder: "120.00", type: "number" })}
        {campoInput({ campo: "valorDolares", etiqueta: "Valor en dólares (USD)", placeholder: "12000.00", type: "number" })}
      </div>

      <button
        type="button"
        disabled={enviando}
        onClick={() => void capturar()}
        style={{
          padding: "0.6rem 1.1rem",
          background: enviando ? "#94a3b8" : "#0f766e",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Capturando…" : "Capturar y sellar borrador (Comercio Exterior)"}
      </button>

      {error !== null && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#991b1b" }}>
          <div>{error}</div>
          {errores.length > 0 && (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {errores.map((e, i) => (
                <li key={`${e.campo}-${i}`}>
                  <code style={{ fontSize: "0.8rem" }}>{e.campo}</code>: {e.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {exito !== null && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#166534" }}>
          {exito}
        </div>
      )}
    </div>
  );
}

export default CfdiComercioExtForm;
