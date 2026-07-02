"use client";

// CERBERUS COMERCIO EXTERIOR — Form de CFDI Traslado + Carta Porte 3.1. NO es SIDF.
// =============================================================================
// Archivo:  src/components/CfdiCartaPorteForm.tsx
// Propósito: Client component que captura un CFDI de TRASLADO con complemento
//            CARTA_PORTE_31: emisorRfc, receptorRfc, origen (codigoPostal,
//            fechaSalida), destino (codigoPostal, fechaLlegada, distanciaKm),
//            autotransporte (placaVm, configVehicular, caat opcional), figura
//            (rfcOperador, nombreOperador) y UNA mercancía mínima. Postea a
//            /api/operaciones/[id]/cfdi; si el route devuelve 400 pinta la
//            LISTA de errores de validación {campo, mensaje} (decisión C9: se
//            alerta con la lista; un borrador con errores NO se guarda). Al
//            recibir 201 refresca el Server Component (router.refresh).
//
// La validación de negocio (CP 5 dígitos, placa oficial, claveProdServ 8
// dígitos, fechas coherentes, RFC) vive en el servidor (lib carta-porte del
// Agente MODELO-13); aquí solo se capturan y envían los datos.
// =============================================================================

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export type CfdiCartaPorteFormProps = {
  operacionId: string;
};

/** Error de validación devuelto por el route (forma {campo, mensaje}). */
type ErrorValidacion = { campo: string; mensaje: string };

/** Campos del formulario (todos como texto; el route valida y tipa). */
type Campos = {
  emisorRfc: string;
  receptorRfc: string;
  origenCodigoPostal: string;
  origenFechaSalida: string;
  destinoCodigoPostal: string;
  destinoFechaLlegada: string;
  destinoDistanciaKm: string;
  placaVm: string;
  configVehicular: string;
  caat: string;
  rfcOperador: string;
  nombreOperador: string;
  claveProdServ: string;
  descripcion: string;
  cantidad: string;
  claveUnidad: string;
  pesoKg: string;
};

const CAMPOS_INICIALES: Campos = {
  emisorRfc: "",
  receptorRfc: "",
  origenCodigoPostal: "",
  origenFechaSalida: "",
  destinoCodigoPostal: "",
  destinoFechaLlegada: "",
  destinoDistanciaKm: "",
  placaVm: "",
  configVehicular: "",
  caat: "",
  rfcOperador: "",
  nombreOperador: "",
  claveProdServ: "",
  descripcion: "",
  cantidad: "",
  claveUnidad: "",
  pesoKg: "",
};

/** datetime-local => ISO 8601; si no parsea, se envía tal cual (valida el server). */
function aIso(valor: string): string {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toISOString();
}

/** Texto de <input type="number"> => number (NaN si vacío; el server rechaza). */
function aNumero(valor: string): number {
  return valor.trim().length === 0 ? Number.NaN : Number(valor);
}

export function CfdiCartaPorteForm({ operacionId }: CfdiCartaPorteFormProps) {
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(CAMPOS_INICIALES);
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

    const caat = campos.caat.trim();
    const payload = {
      emisorRfc: campos.emisorRfc.trim().toUpperCase(),
      receptorRfc: campos.receptorRfc.trim().toUpperCase(),
      origen: {
        codigoPostal: campos.origenCodigoPostal.trim(),
        fechaSalida: aIso(campos.origenFechaSalida),
      },
      destino: {
        codigoPostal: campos.destinoCodigoPostal.trim(),
        fechaLlegada: aIso(campos.destinoFechaLlegada),
        distanciaKm: aNumero(campos.destinoDistanciaKm),
      },
      autotransporte: {
        placaVm: campos.placaVm.trim(),
        configVehicular: campos.configVehicular.trim(),
        ...(caat.length > 0 ? { caat } : {}),
      },
      figuraTransporte: {
        rfcOperador: campos.rfcOperador.trim().toUpperCase(),
        nombreOperador: campos.nombreOperador.trim(),
      },
      mercancias: [
        {
          claveProdServ: campos.claveProdServ.trim(),
          descripcion: campos.descripcion.trim(),
          cantidad: aNumero(campos.cantidad),
          claveUnidad: campos.claveUnidad.trim(),
          pesoKg: aNumero(campos.pesoKg),
        },
      ],
    };

    try {
      const res = await fetch(
        `/api/operaciones/${encodeURIComponent(operacionId)}/cfdi`,
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
            if (
              "error" in data &&
              typeof (data as { error: unknown }).error === "string"
            ) {
              mensaje = (data as { error: string }).error;
            }
            if (
              "errores" in data &&
              Array.isArray((data as { errores: unknown }).errores)
            ) {
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

      setExito(
        "CFDI de traslado con Carta Porte 3.1 capturado y sellado como BORRADOR.",
      );
      setCampos(CAMPOS_INICIALES);
      // Refrescar el Server Component para releer la lista de comprobantes.
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

  type CampoDef = {
    campo: keyof Campos;
    etiqueta: string;
    placeholder?: string;
    type?: string;
  };

  const campoInput = ({ campo, etiqueta, placeholder, type }: CampoDef) => (
    <div key={campo}>
      <label htmlFor={`cfdi-${campo}`} style={labelStyle}>
        {etiqueta}
      </label>
      <input
        id={`cfdi-${campo}`}
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
    <div
      style={{
        padding: "1.25rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      <h3 style={{ ...seccionStyle, marginTop: 0 }}>Comprobante (TRASLADO)</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "emisorRfc", etiqueta: "RFC emisor", placeholder: "AAA010101AAA" })}
        {campoInput({ campo: "receptorRfc", etiqueta: "RFC receptor", placeholder: "BBB020202BBB" })}
      </div>

      <h3 style={seccionStyle}>Origen</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "origenCodigoPostal", etiqueta: "Código postal (5 dígitos)", placeholder: "64000" })}
        {campoInput({ campo: "origenFechaSalida", etiqueta: "Fecha/hora de salida", type: "datetime-local" })}
      </div>

      <h3 style={seccionStyle}>Destino</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "destinoCodigoPostal", etiqueta: "Código postal (5 dígitos)", placeholder: "88000" })}
        {campoInput({ campo: "destinoFechaLlegada", etiqueta: "Fecha/hora de llegada", type: "datetime-local" })}
      </div>
      <div style={filaStyle}>
        {campoInput({ campo: "destinoDistanciaKm", etiqueta: "Distancia recorrida (km)", placeholder: "225", type: "number" })}
      </div>

      <h3 style={seccionStyle}>Autotransporte</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "placaVm", etiqueta: "Placa vehículo motor", placeholder: "ABC1234 (sin guiones)" })}
        {campoInput({ campo: "configVehicular", etiqueta: "Configuración vehicular", placeholder: "C2, C3, T3S2…" })}
      </div>
      <div style={filaStyle}>
        {campoInput({ campo: "caat", etiqueta: "CAAT (opcional, cruce fronterizo)", placeholder: "Código Alfanumérico Armonizado" })}
      </div>

      <h3 style={seccionStyle}>Figura de transporte (operador)</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "rfcOperador", etiqueta: "RFC del operador", placeholder: "XAXX010101000" })}
        {campoInput({ campo: "nombreOperador", etiqueta: "Nombre del operador", placeholder: "Nombre completo" })}
      </div>

      <h3 style={seccionStyle}>Mercancía</h3>
      <div style={filaStyle}>
        {campoInput({ campo: "claveProdServ", etiqueta: "Clave producto/servicio (8 dígitos)", placeholder: "78101800" })}
        {campoInput({ campo: "descripcion", etiqueta: "Descripción", placeholder: "Descripción de la mercancía" })}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {campoInput({ campo: "cantidad", etiqueta: "Cantidad", placeholder: "10", type: "number" })}
        {campoInput({ campo: "claveUnidad", etiqueta: "Clave de unidad", placeholder: "KGM, H87…" })}
        {campoInput({ campo: "pesoKg", etiqueta: "Peso (kg)", placeholder: "1250.5", type: "number" })}
      </div>

      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          void capturar();
        }}
        style={{
          padding: "0.6rem 1.1rem",
          background: enviando ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: enviando ? "not-allowed" : "pointer",
          fontSize: "0.95rem",
        }}
      >
        {enviando ? "Capturando…" : "Capturar y sellar borrador"}
      </button>

      {error !== null && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
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
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            color: "#166534",
          }}
        >
          {exito}
        </div>
      )}
    </div>
  );
}

export default CfdiCartaPorteForm;
