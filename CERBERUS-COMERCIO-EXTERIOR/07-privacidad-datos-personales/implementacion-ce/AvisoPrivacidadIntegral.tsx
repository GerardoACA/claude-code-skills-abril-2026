// ============================================================================
// PRODUCTO: CERBERUS COMERCIO EXTERIOR (SaaS nuevo)  —  NO es SIDF.
// Componente que muestra el AVISO DE PRIVACIDAD INTEGRAL (texto v2), con la
// versión y el hash SHA-256 visibles (exigencia de trazabilidad del diseño v2
// y de la sección 11 "Cambios al aviso" / leyenda de versión del aviso v2).
//
// El texto del aviso vive en VersionAviso.cuerpo (BD) o en un .md importado;
// aquí se renderiza como Markdown. La identidad/domicilio/RFC los inyecta el
// tenant (Responsable): este componente NO debe publicarse con [corchetes].
// ============================================================================

"use client";

import ReactMarkdown from "react-markdown";

export type AvisoIntegral = {
  version: string; // p. ej. "v2"
  hashAviso: string; // SHA-256 hex (64) del cuerpo publicado
  fechaActualizacion: string; // ISO o "30 de junio de 2026"
  cuerpoMarkdown: string; // texto íntegro del aviso v2 (fuente del hash)
};

export function AvisoPrivacidadIntegral({ aviso }: { aviso: AvisoIntegral }) {
  const tieneCorchetes = /\[[^\]]+\]/.test(aviso.cuerpoMarkdown);

  return (
    <article
      aria-label="Aviso de Privacidad Integral — CERBERUS Comercio Exterior"
      className="aviso-integral"
    >
      <header className="aviso-integral__meta">
        <h1>Aviso de Privacidad Integral</h1>
        <dl>
          <div>
            <dt>Versión</dt>
            <dd>{aviso.version}</dd>
          </div>
          <div>
            <dt>Última actualización</dt>
            <dd>{aviso.fechaActualizacion}</dd>
          </div>
          <div>
            <dt>Hash de integridad (SHA-256)</dt>
            {/* Hash visible: permite cotejar la versión consentida. */}
            <dd>
              <code data-testid="hash-aviso">{aviso.hashAviso}</code>
            </dd>
          </div>
        </dl>

        {tieneCorchetes && (
          // Regla del aviso v2: inválido mientras haya [corchetes] sin llenar.
          <p role="alert" className="aviso-integral__warning">
            Borrador no publicable: el aviso contiene campos sin completar
            ([corchetes]) y es inválido hasta que el Responsable los llene.
          </p>
        )}
      </header>

      <div className="aviso-integral__cuerpo">
        <ReactMarkdown>{aviso.cuerpoMarkdown}</ReactMarkdown>
      </div>
    </article>
  );
}

export default AvisoPrivacidadIntegral;
