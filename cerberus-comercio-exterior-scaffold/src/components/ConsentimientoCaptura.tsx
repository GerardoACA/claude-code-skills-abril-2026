// CERBERUS COMERCIO EXTERIOR — Privacidad (Consentimiento en captura). NO es SIDF.
// ============================================================================
// Aviso corto en PUNTO DE CAPTURA + casilla de consentimiento expreso para
// datos sensibles (firma grafométrica + geolocalización). LFPDPPP art. 17 / 9.
//
// Reglas del dictamen (bloqueantes) que este componente cumple:
//  - Casilla de consentimiento NO pre-marcada (consentimiento activo).
//  - Enlace al Aviso Integral visible ANTES de aceptar.
//  - Ruta alterna "Continuar sin capturar evidencia sensible" (no condiciona
//    el servicio, art. 9).
//  - Registra versión del aviso + timestamp + hash vía POST a
//    /api/consentimiento (route handler App Router; sella con SHA-256).
// ============================================================================

"use client";

import { useState } from "react";

export type ResultadoConsentimiento = {
  consentimientoId: string;
  selloRegistro: string;
  rutaSinEvidencia: boolean;
};

type Props = {
  titularRef: string;
  operacionRef?: string;
  // Versión del aviso CORTO vigente que se muestra y se registra.
  versionAvisoId: string;
  versionEtiqueta: string; // p. ej. "v1"
  hashAvisoEnPantalla: string; // SHA-256 del aviso corto mostrado
  responsableRazonSocial: string; // identidad del tenant (Responsable)
  hrefAvisoIntegral: string; // enlace al aviso integral
  onResuelto: (r: ResultadoConsentimiento) => void;
};

export function ConsentimientoCaptura({
  titularRef,
  operacionRef,
  versionAvisoId,
  versionEtiqueta,
  hashAvisoEnPantalla,
  responsableRazonSocial,
  hrefAvisoIntegral,
  onResuelto,
}: Props) {
  // Estado inicial: casilla NO pre-marcada.
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar(rutaSinEvidencia: boolean) {
    setEnviando(true);
    setError(null);
    try {
      // El tenantId NO se envía: lo deriva el route handler del JWT verificado.
      const res = await fetch("/api/consentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titularRef,
          operacionRef,
          versionAvisoId,
          hashAvisoEnPantalla,
          // Si toma la ruta alterna, no se consiente ningún dato sensible.
          consienteBiometricos: rutaSinEvidencia ? false : acepta,
          consienteGeoloc: rutaSinEvidencia ? false : acepta,
          rutaSinEvidencia,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo registrar el consentimiento");
        return;
      }
      onResuelto({
        consentimientoId: data.consentimientoId,
        selloRegistro: data.selloRegistro,
        rutaSinEvidencia,
      });
    } catch {
      setError("Error de red al registrar el consentimiento");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Consentimiento de datos sensibles" className="consent-captura">
      <h2>Protección de tus datos personales</h2>

      <p>
        <strong>{responsableRazonSocial}</strong> recabará tus datos —incluidos{" "}
        <strong>datos sensibles</strong>: tu <strong>firma manuscrita</strong> (con sus rasgos
        dinámicos) y tu <strong>ubicación (geolocalización)</strong>— para integrar el expediente
        de la operación, acreditar su materialidad y cumplir obligaciones aduaneras y fiscales,
        pudiendo ponerlos a disposición de la autoridad competente cuando lo requiera por ley.
      </p>
      <p>
        El tratamiento de tus datos sensibles requiere tu <strong>consentimiento expreso</strong>.{" "}
        <strong>Negarte no te impide usar el resto del servicio</strong>; solo impide generar esta
        evidencia.
      </p>

      {/* Enlace al Aviso Integral visible antes de aceptar (regla bloqueante). */}
      <p>
        Consulta el{" "}
        <a href={hrefAvisoIntegral} target="_blank" rel="noopener noreferrer">
          Aviso de Privacidad Integral
        </a>{" "}
        para conocer todas las finalidades, transferencias y cómo ejercer tus derechos ARCO.
      </p>

      {/* Casilla NO pre-marcada: defaultChecked ausente, checked controlado en false. */}
      <label className="consent-captura__checkbox">
        <input
          type="checkbox"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          disabled={enviando}
        />{" "}
        Otorgo mi consentimiento expreso para el tratamiento de mis datos sensibles (firma
        grafométrica y geolocalización) conforme al Aviso de Privacidad Integral.
      </label>

      <p className="consent-captura__meta">
        Aviso corto {versionEtiqueta} · hash <code>{hashAvisoEnPantalla.slice(0, 12)}…</code>
      </p>

      {error && (
        <p role="alert" className="consent-captura__error">
          {error}
        </p>
      )}

      <div className="consent-captura__acciones">
        {/* "Continuar" solo habilitado si la casilla está marcada. */}
        <button
          type="button"
          disabled={!acepta || enviando}
          onClick={() => registrar(false)}
        >
          Continuar
        </button>

        {/* Ruta alterna SIEMPRE disponible (art. 9, no condiciona el servicio). */}
        <button
          type="button"
          className="consent-captura__alterna"
          disabled={enviando}
          onClick={() => registrar(true)}
        >
          Continuar sin capturar evidencia sensible
        </button>
      </div>
    </section>
  );
}

export default ConsentimientoCaptura;
