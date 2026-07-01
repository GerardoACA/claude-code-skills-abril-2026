// CERBERUS COMERCIO EXTERIOR — Cuestionario KYC 1.4.14 (client component). NO es SIDF.
// ============================================================================
// Formulario multi-sección del expediente 1.4.14 (Regla 1.4.14 CFF: identificar
// y conocer al cliente + acreditar materialidad de sus operaciones de comercio
// exterior). Secciones:
//   (1) Datos generales
//   (2) Materialidad e infraestructura (contratos, domicilio de operaciones CE)
//   (3) Manifestación de integridad (declaración bajo protesta, no-EFOS, art. 69-B)
//   (4) Resumen y envío
// Postea a /api/clientes/[id]/kyc. El tenantId NO se envía: lo deriva el route
// handler del JWT verificado. La respuesta trae el sello SHA-256 del expediente.
// ============================================================================

"use client";

import { useState, type CSSProperties } from "react";

// --------------------------------------------------------------------------
// Tipos del cliente y expediente que recibe el componente (server -> client).
// --------------------------------------------------------------------------
export type ClienteResumen = {
  id: string;
  rfc: string;
  razonSocial: string;
};

export type ExpedienteResumen = {
  id: string;
  custodio: string | null;
  retieneHasta: string | null; // ISO
  documentosCount: number;
};

type Props = {
  cliente: ClienteResumen;
  expediente: ExpedienteResumen | null;
};

// --------------------------------------------------------------------------
// Estado del formulario (espejo del CuestionarioBody del route handler).
// --------------------------------------------------------------------------
type DatosGenerales = {
  nombreComercial: string;
  representanteLegal: string;
  correoContacto: string;
  telefonoContacto: string;
  actividadEconomica: string;
};

type Materialidad = {
  domicilioOperacionesCE: string;
  tieneContratos: boolean;
  descripcionContratos: string;
  tieneInfraestructura: boolean;
  descripcionInfraestructura: string;
  numeroEmpleados: string;
};

type Integridad = {
  declaraNoEfos: boolean;
  nombreDeclarante: string;
};

type ResultadoOk = {
  expedienteId: string;
  documentoId: string;
  sha256: string;
  timestamp: string;
};

const SECCIONES = ["Datos generales", "Materialidad", "Integridad", "Resumen"] as const;

export function CuestionarioKyc({ cliente, expediente }: Props) {
  const [seccion, setSeccion] = useState<number>(0);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoOk | null>(null);

  const [datosGenerales, setDatosGenerales] = useState<DatosGenerales>({
    nombreComercial: "",
    representanteLegal: "",
    correoContacto: "",
    telefonoContacto: "",
    actividadEconomica: "",
  });

  const [materialidad, setMaterialidad] = useState<Materialidad>({
    domicilioOperacionesCE: "",
    tieneContratos: false,
    descripcionContratos: "",
    tieneInfraestructura: false,
    descripcionInfraestructura: "",
    numeroEmpleados: "",
  });

  const [integridad, setIntegridad] = useState<Integridad>({
    declaraNoEfos: false,
    nombreDeclarante: "",
  });

  const [custodio, setCustodio] = useState<string>(expediente?.custodio ?? "");

  function irA(indice: number): void {
    setError(null);
    setSeccion(Math.min(Math.max(indice, 0), SECCIONES.length - 1));
  }

  async function enviar(): Promise<void> {
    setError(null);
    if (!integridad.declaraNoEfos) {
      setError(
        "Debe marcar la manifestación de integridad (no-EFOS, art. 69-B) antes de enviar.",
      );
      setSeccion(2);
      return;
    }
    setEnviando(true);
    try {
      // El tenantId NO se envía: lo deriva el route handler del JWT verificado.
      const res = await fetch(`/api/clientes/${cliente.id}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datosGenerales,
          materialidad,
          integridad,
          custodio: custodio.trim() || undefined,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "No se pudo registrar el cuestionario";
        setError(msg);
        return;
      }
      const ok = data as ResultadoOk;
      setResultado(ok);
    } catch {
      setError("Error de red al enviar el cuestionario.");
    } finally {
      setEnviando(false);
    }
  }

  // ------------------------------------------------------------------------
  // Estado terminal: cuestionario sellado.
  // ------------------------------------------------------------------------
  if (resultado) {
    return (
      <section
        aria-label="Cuestionario sellado"
        style={{
          padding: "1.25rem 1.5rem",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          color: "#065f46",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Expediente 1.4.14 registrado y sellado</h2>
        <p>
          Se guardó el expediente KYC de <strong>{cliente.razonSocial}</strong> (
          <code>{cliente.rfc}</code>) y se registró un documento con sello de
          integridad SHA-256.
        </p>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem" }}>
          <dt>Expediente</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>{resultado.expedienteId}</dd>
          <dt>Documento</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>{resultado.documentoId}</dd>
          <dt>SHA-256</dt>
          <dd style={{ margin: 0, fontFamily: "monospace", wordBreak: "break-all" }}>
            {resultado.sha256}
          </dd>
          <dt>Fecha</dt>
          <dd style={{ margin: 0 }}>{resultado.timestamp}</dd>
        </dl>
        <p style={{ marginBottom: 0 }}>
          <a href={`/clientes/${cliente.id}/verificacion`} style={{ color: "#2563eb" }}>
            Ir a verificación 69-B
          </a>{" "}
          ·{" "}
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </section>
    );
  }

  const inputStyle: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "0.5rem 0.65rem",
    marginTop: "0.25rem",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: "0.95rem",
  };
  const labelStyle: CSSProperties = {
    display: "block",
    marginTop: "1rem",
    fontSize: "0.9rem",
    color: "#334155",
    fontWeight: 600,
  };

  return (
    <section aria-label="Cuestionario KYC 1.4.14">
      {/* Cabecera del cliente */}
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "0.9rem 1.1rem",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
        }}
      >
        <strong>{cliente.razonSocial}</strong> · RFC{" "}
        <code>{cliente.rfc}</code>
        {expediente ? (
          <p style={{ margin: "0.35rem 0 0", color: "#64748b", fontSize: "0.85rem" }}>
            Expediente existente ({expediente.documentosCount} documento(s)
            sellado(s)). Enviar de nuevo agrega una nueva versión sellada.
          </p>
        ) : (
          <p style={{ margin: "0.35rem 0 0", color: "#64748b", fontSize: "0.85rem" }}>
            Aún no existe expediente 1.4.14 para este cliente. Este cuestionario lo
            crea.
          </p>
        )}
      </div>

      {/* Navegación de secciones */}
      <nav style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {SECCIONES.map((nombre, i) => (
          <button
            key={nombre}
            type="button"
            onClick={() => irA(i)}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: i === seccion ? "#2563eb" : "#fff",
              color: i === seccion ? "#fff" : "#334155",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {i + 1}. {nombre}
          </button>
        ))}
      </nav>

      {/* (1) Datos generales */}
      {seccion === 0 && (
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            1. Datos generales
          </legend>
          <label style={labelStyle}>
            Nombre comercial
            <input
              style={inputStyle}
              value={datosGenerales.nombreComercial}
              onChange={(e) =>
                setDatosGenerales({ ...datosGenerales, nombreComercial: e.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Representante legal
            <input
              style={inputStyle}
              value={datosGenerales.representanteLegal}
              onChange={(e) =>
                setDatosGenerales({ ...datosGenerales, representanteLegal: e.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Correo de contacto
            <input
              type="email"
              style={inputStyle}
              value={datosGenerales.correoContacto}
              onChange={(e) =>
                setDatosGenerales({ ...datosGenerales, correoContacto: e.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Teléfono de contacto
            <input
              style={inputStyle}
              value={datosGenerales.telefonoContacto}
              onChange={(e) =>
                setDatosGenerales({ ...datosGenerales, telefonoContacto: e.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Actividad económica
            <input
              style={inputStyle}
              value={datosGenerales.actividadEconomica}
              onChange={(e) =>
                setDatosGenerales({ ...datosGenerales, actividadEconomica: e.target.value })
              }
            />
          </label>
        </fieldset>
      )}

      {/* (2) Materialidad e infraestructura */}
      {seccion === 1 && (
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            2. Materialidad e infraestructura
          </legend>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
            Elementos que acreditan la existencia real de las operaciones de comercio
            exterior del cliente (contratos, domicilio de operaciones, infraestructura).
          </p>
          <label style={labelStyle}>
            Domicilio de operaciones de comercio exterior
            <input
              style={inputStyle}
              value={materialidad.domicilioOperacionesCE}
              onChange={(e) =>
                setMaterialidad({ ...materialidad, domicilioOperacionesCE: e.target.value })
              }
            />
          </label>

          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={materialidad.tieneContratos}
              onChange={(e) =>
                setMaterialidad({ ...materialidad, tieneContratos: e.target.checked })
              }
            />
            Cuenta con contratos que soportan sus operaciones
          </label>
          {materialidad.tieneContratos && (
            <label style={labelStyle}>
              Descripción de los contratos
              <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={materialidad.descripcionContratos}
                onChange={(e) =>
                  setMaterialidad({ ...materialidad, descripcionContratos: e.target.value })
                }
              />
            </label>
          )}

          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={materialidad.tieneInfraestructura}
              onChange={(e) =>
                setMaterialidad({ ...materialidad, tieneInfraestructura: e.target.checked })
              }
            />
            Cuenta con infraestructura (bodegas, personal, activos)
          </label>
          {materialidad.tieneInfraestructura && (
            <label style={labelStyle}>
              Descripción de la infraestructura
              <textarea
                style={{ ...inputStyle, minHeight: 70 }}
                value={materialidad.descripcionInfraestructura}
                onChange={(e) =>
                  setMaterialidad({
                    ...materialidad,
                    descripcionInfraestructura: e.target.value,
                  })
                }
              />
            </label>
          )}

          <label style={labelStyle}>
            Número de empleados
            <input
              style={inputStyle}
              value={materialidad.numeroEmpleados}
              onChange={(e) =>
                setMaterialidad({ ...materialidad, numeroEmpleados: e.target.value })
              }
            />
          </label>
        </fieldset>
      )}

      {/* (3) Manifestación de integridad (art. 69-B, no-EFOS) */}
      {seccion === 2 && (
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            3. Manifestación de integridad
          </legend>
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
            Conforme al art. 69-B del Código Fiscal de la Federación (empresas que
            facturan operaciones simuladas — EFOS/EDOS).
          </p>
          {/* Casilla NO pre-marcada: consentimiento/manifestación activa. */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.6rem",
              marginTop: "1rem",
              padding: "0.9rem 1rem",
              border: "1px solid #fcd34d",
              background: "#fffbeb",
              borderRadius: 8,
            }}
          >
            <input
              type="checkbox"
              checked={integridad.declaraNoEfos}
              onChange={(e) =>
                setIntegridad({ ...integridad, declaraNoEfos: e.target.checked })
              }
              style={{ marginTop: "0.2rem" }}
            />
            <span>
              Declaro <strong>bajo protesta de decir verdad</strong> que el cliente no
              tiene vínculos con Empresas que Facturan Operaciones Simuladas (EFOS) ni
              se encuentra en los supuestos del artículo 69-B del CFF.
            </span>
          </label>
          <label style={labelStyle}>
            Nombre de quien declara
            <input
              style={inputStyle}
              value={integridad.nombreDeclarante}
              onChange={(e) =>
                setIntegridad({ ...integridad, nombreDeclarante: e.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Custodio del expediente (opcional)
            <input
              style={inputStyle}
              value={custodio}
              onChange={(e) => setCustodio(e.target.value)}
              placeholder="Se usa tu usuario si lo dejas vacío"
            />
          </label>
        </fieldset>
      )}

      {/* (4) Resumen */}
      {seccion === 3 && (
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontSize: "1.15rem", fontWeight: 700 }}>4. Resumen</legend>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
            Revisa antes de sellar. Al enviar se crea/actualiza el expediente 1.4.14 y
            se registra un documento con sello SHA-256.
          </p>
          <ul style={{ lineHeight: 1.7 }}>
            <li>
              <strong>Cliente:</strong> {cliente.razonSocial} ({cliente.rfc})
            </li>
            <li>
              <strong>Nombre comercial:</strong>{" "}
              {datosGenerales.nombreComercial || "—"}
            </li>
            <li>
              <strong>Representante legal:</strong>{" "}
              {datosGenerales.representanteLegal || "—"}
            </li>
            <li>
              <strong>Domicilio operaciones CE:</strong>{" "}
              {materialidad.domicilioOperacionesCE || "—"}
            </li>
            <li>
              <strong>Contratos:</strong>{" "}
              {materialidad.tieneContratos ? "Sí" : "No"}
            </li>
            <li>
              <strong>Infraestructura:</strong>{" "}
              {materialidad.tieneInfraestructura ? "Sí" : "No"}
            </li>
            <li>
              <strong>Manifestación no-EFOS (69-B):</strong>{" "}
              {integridad.declaraNoEfos ? "Declarada" : "Pendiente"}
            </li>
            <li>
              <strong>Custodio:</strong> {custodio.trim() || "(tu usuario)"}
            </li>
          </ul>
        </fieldset>
      )}

      {error && (
        <p
          role="alert"
          style={{
            marginTop: "1rem",
            padding: "0.6rem 0.9rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            color: "#991b1b",
          }}
        >
          {error}
        </p>
      )}

      {/* Controles de navegación / envío */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginTop: "1.75rem",
        }}
      >
        <button
          type="button"
          onClick={() => irA(seccion - 1)}
          disabled={seccion === 0 || enviando}
          style={{
            padding: "0.55rem 1.1rem",
            borderRadius: 6,
            border: "1px solid #cbd5e1",
            background: "#fff",
            cursor: seccion === 0 ? "not-allowed" : "pointer",
          }}
        >
          Anterior
        </button>

        {seccion < SECCIONES.length - 1 ? (
          <button
            type="button"
            onClick={() => irA(seccion + 1)}
            disabled={enviando}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !integridad.declaraNoEfos}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: 6,
              border: "none",
              background: integridad.declaraNoEfos ? "#059669" : "#94a3b8",
              color: "#fff",
              cursor: enviando || !integridad.declaraNoEfos ? "not-allowed" : "pointer",
            }}
          >
            {enviando ? "Sellando…" : "Registrar y sellar expediente"}
          </button>
        )}
      </div>
    </section>
  );
}

export default CuestionarioKyc;
