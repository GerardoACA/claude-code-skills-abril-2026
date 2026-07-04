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
// [Inc 45] Cero re-tecleo (captura asistida, C9: se asiste, no se impone):
//   - Acepta un prop `precarga` (lo que la BD ya sabe: RFC del tenant como
//     emisor, RFC del cliente como receptor, primera Partida) e inicializa los
//     campos con ello. Todo sigue EDITABLE y lo precargado se marca en verde.
//   - <details> "Prellenar desde XML (CFDI)": sube un XML de factura real y se
//     rellenan los campos VACÍOS con lo extraído (nunca pisa lo tecleado).
//
// La validación de negocio (CP 5 dígitos, placa oficial, claveProdServ 8
// dígitos, fechas coherentes, RFC) vive en el servidor (lib carta-porte del
// Agente MODELO-13); aquí solo se capturan y envían los datos.
// =============================================================================

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  extraerDatosCfdiXml,
  type DatosCfdiExtraidos,
} from "@/lib/extraer-cfdi-xml";

/** [Inc 45] Primera Partida de la operación (lo que la BD ya sabe de la mercancía). */
export type PrecargaPartida = {
  descripcion: string | null;
  /** Fracción arancelaria declarada (puede traer puntos: 8471.30.01). */
  fraccion: string | null;
  nico: string | null;
  umt: string | null;
  /** Valor declarado, serializado como texto (Decimal de Prisma). */
  valorDeclarado: string | null;
};

/**
 * [Inc 45] Datos que la BD ya conoce para prellenar los forms de CFDI. Los arma
 * el Server Component (dentro de withTenantFromSession) y lo consumen ambos
 * forms: Carta Porte (emisor=tenant, receptor=cliente) y Comercio Exterior
 * (emisor=cliente exportador, clave/tipo de cambio del último Pedimento).
 */
export type PrecargaCfdi = {
  tenantRfc: string | null;
  clienteRfc: string | null;
  claveDePedimento: string | null;
  /** Tipo de cambio MXN/USD del Pedimento más reciente, como texto. */
  tipoCambioUsd: string | null;
  partida: PrecargaPartida | null;
};

export type CfdiCartaPorteFormProps = {
  operacionId: string;
  /** [Inc 45] Prellenado desde BD; opcional para no romper montajes existentes. */
  precarga?: PrecargaCfdi;
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

/** [Inc 45] Fecha del XML (ISO SAT) => valor de <input type="datetime-local">. */
function aDatetimeLocal(valor: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(valor);
  return m !== null ? `${m[1]}T${m[2]}` : valor;
}

/** [Inc 45] Estado inicial: campos base + lo que la BD ya sabe, marcado. */
type EstadoInicial = { campos: Campos; marcados: ReadonlySet<keyof Campos> };

function inicialDesdePrecarga(precarga?: PrecargaCfdi): EstadoInicial {
  const campos: Campos = { ...CAMPOS_INICIALES };
  const marcados = new Set<keyof Campos>();
  const poner = (campo: keyof Campos, valor: string | null | undefined): void => {
    if (typeof valor === "string" && valor.trim().length > 0) {
      campos[campo] = valor;
      marcados.add(campo);
    }
  };
  if (precarga !== undefined) {
    // Carta Porte: quien traslada (emisor) es el TENANT; el receptor es el cliente.
    poner("emisorRfc", precarga.tenantRfc);
    poner("receptorRfc", precarga.clienteRfc);
    poner("descripcion", precarga.partida?.descripcion);
    poner("claveUnidad", precarga.partida?.umt);
  }
  return { campos, marcados };
}

/** Texto de <input type="number"> => number (NaN si vacío; el server rechaza). */
function aNumero(valor: string): number {
  return valor.trim().length === 0 ? Number.NaN : Number(valor);
}

export function CfdiCartaPorteForm({
  operacionId,
  precarga,
}: CfdiCartaPorteFormProps) {
  const router = useRouter();
  // [Inc 45] Estado inicial derivado de lo que la BD ya sabe (cero re-tecleo).
  const inicial = useMemo(() => inicialDesdePrecarga(precarga), [precarga]);
  const [campos, setCampos] = useState<Campos>(inicial.campos);
  // Campos precargados (BD o XML) aún sin editar a mano: se marcan en verde.
  const [resaltados, setResaltados] = useState<ReadonlySet<keyof Campos>>(
    inicial.marcados,
  );
  const [avisoXml, setAvisoXml] = useState<string | null>(null);
  const [advertenciasXml, setAdvertenciasXml] = useState<string[]>([]);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [errores, setErrores] = useState<ErrorValidacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cambiar =
    (campo: keyof Campos) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const valor = e.target.value;
      setCampos((prev) => ({ ...prev, [campo]: valor }));
      // Editado a mano: deja de considerarse "precargado".
      setResaltados((prev) => {
        if (!prev.has(campo)) return prev;
        const sig = new Set(prev);
        sig.delete(campo);
        return sig;
      });
    };

  // [Inc 45] Rellena SOLO los campos vacíos con lo extraído del XML del CFDI:
  // lo tecleado por el capturista nunca se pisa (captura asistida, C9).
  function aplicarDatosXml(datos: DatosCfdiExtraidos): void {
    const candidatos: Partial<Record<keyof Campos, string>> = {};
    if (datos.emisorRfc !== undefined) candidatos.emisorRfc = datos.emisorRfc;
    if (datos.receptorRfc !== undefined)
      candidatos.receptorRfc = datos.receptorRfc;
    const concepto = datos.conceptos[0];
    if (concepto !== undefined) {
      if (concepto.claveProdServ !== undefined)
        candidatos.claveProdServ = concepto.claveProdServ;
      if (concepto.descripcion !== undefined)
        candidatos.descripcion = concepto.descripcion;
      if (concepto.cantidad !== undefined)
        candidatos.cantidad = String(concepto.cantidad);
      if (concepto.claveUnidad !== undefined)
        candidatos.claveUnidad = concepto.claveUnidad;
    }
    const cp = datos.cartaPorte;
    if (cp !== undefined) {
      if (cp.origen?.codigoPostal !== undefined)
        candidatos.origenCodigoPostal = cp.origen.codigoPostal;
      if (cp.origen?.fechaHora !== undefined)
        candidatos.origenFechaSalida = aDatetimeLocal(cp.origen.fechaHora);
      if (cp.destino?.codigoPostal !== undefined)
        candidatos.destinoCodigoPostal = cp.destino.codigoPostal;
      if (cp.destino?.fechaHora !== undefined)
        candidatos.destinoFechaLlegada = aDatetimeLocal(cp.destino.fechaHora);
      if (cp.placaVm !== undefined) candidatos.placaVm = cp.placaVm;
      if (cp.configVehicular !== undefined)
        candidatos.configVehicular = cp.configVehicular;
      if (cp.pesoEnKg !== undefined) candidatos.pesoKg = String(cp.pesoEnKg);
    }

    const siguientes: Campos = { ...campos };
    const llenados: (keyof Campos)[] = [];
    for (const [campo, valor] of Object.entries(candidatos) as [
      keyof Campos,
      string,
    ][]) {
      if (siguientes[campo].trim().length === 0 && valor.trim().length > 0) {
        siguientes[campo] = valor;
        llenados.push(campo);
      }
    }
    setCampos(siguientes);
    if (llenados.length > 0) {
      setResaltados((prev) => new Set([...prev, ...llenados]));
    }
    setAdvertenciasXml(datos.advertencias);
    setAvisoXml(
      llenados.length > 0
        ? `Se prellenaron ${llenados.length} campo(s) desde el XML (solo los que estaban vacíos). Revise antes de capturar.`
        : "El XML no aportó campos nuevos (los campos ya tenían valor o no se encontraron datos).",
    );
  }

  function manejarArchivoXml(e: ChangeEvent<HTMLInputElement>): void {
    const archivo = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo después.
    e.target.value = "";
    if (archivo === undefined) return;
    const lector = new FileReader();
    lector.onload = () => {
      const texto = typeof lector.result === "string" ? lector.result : "";
      aplicarDatosXml(extraerDatosCfdiXml(texto));
    };
    lector.onerror = () => {
      setAvisoXml("No se pudo leer el archivo XML seleccionado.");
    };
    lector.readAsText(archivo);
  }

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
      // [Inc 45] Vuelve al estado precargado desde BD (no al formulario en blanco).
      setCampos(inicial.campos);
      setResaltados(inicial.marcados);
      setAvisoXml(null);
      setAdvertenciasXml([]);
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

  // [Inc 45] Los campos precargados (BD/XML) sin editar se marcan en verde.
  const hintPrecargadoStyle: React.CSSProperties = {
    marginLeft: "0.4rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#15803d",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    padding: "0 0.4rem",
    verticalAlign: "middle",
  };

  const campoInput = ({ campo, etiqueta, placeholder, type }: CampoDef) => {
    const precargado = resaltados.has(campo);
    return (
      <div key={campo}>
        <label htmlFor={`cfdi-${campo}`} style={labelStyle}>
          {etiqueta}
          {precargado && <span style={hintPrecargadoStyle}>precargado</span>}
        </label>
        <input
          id={`cfdi-${campo}`}
          type={type ?? "text"}
          value={campos[campo]}
          disabled={enviando}
          onChange={cambiar(campo)}
          placeholder={placeholder}
          style={
            precargado
              ? { ...inputStyle, background: "#f0fdf4", borderColor: "#bbf7d0" }
              : inputStyle
          }
        />
      </div>
    );
  };

  return (
    <div
      style={{
        padding: "1.25rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
      }}
    >
      {/* [Inc 45] Prellenado asistido desde un XML de CFDI real (nunca pisa lo tecleado). */}
      <details
        style={{
          marginBottom: "1rem",
          padding: "0.6rem 0.9rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          fontSize: "0.9rem",
          color: "#1e3a8a",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Prellenar desde XML (CFDI)
        </summary>
        <p style={{ margin: "0.5rem 0", fontSize: "0.85rem" }}>
          Suba el XML de un CFDI (con o sin complemento Carta Porte): se
          rellenan solo los campos vacíos; lo ya tecleado no se toca.
        </p>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          disabled={enviando}
          onChange={manejarArchivoXml}
        />
        {avisoXml !== null && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{avisoXml}</p>
        )}
        {advertenciasXml.length > 0 && (
          <ul
            style={{
              margin: "0.5rem 0 0",
              paddingLeft: "1.25rem",
              fontSize: "0.8rem",
              color: "#92400e",
            }}
          >
            {advertenciasXml.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </details>

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
