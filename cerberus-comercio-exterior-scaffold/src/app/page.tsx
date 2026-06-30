// CERBERUS COMERCIO EXTERIOR — página de inicio (landing mínima). NO es SIDF.
export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "2.25rem", marginBottom: "0.5rem" }}>
        Cerberus Comercio Exterior
      </h1>
      <p style={{ fontSize: "1.125rem", color: "#475569", lineHeight: 1.6 }}>
        Plataforma multi-tenant de cumplimiento y trazabilidad probatoria para
        agencias aduanales y agentes de comercio exterior en México.
      </p>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>¿Qué resuelve?</h2>
        <ul style={{ color: "#475569", lineHeight: 1.8 }}>
          <li>
            Gestión de encargos conferidos, expedientes KYC (Art. 1414) y
            expedientes probatorios de despacho.
          </li>
          <li>
            Cadena de evidencia con hash SHA-256 y sello probatorio conectable
            (EVIDENCIA_PRELIMINAR / PRUEBA_OPONIBLE).
          </li>
          <li>
            Vigilancia del estado del CSD y alertas del artículo 69-B del CFF.
          </li>
          <li>
            Aislamiento estricto por inquilino (RLS en PostgreSQL) y bitácora de
            auditoría append-only.
          </li>
        </ul>
      </section>

      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid #e2e8f0",
          color: "#94a3b8",
          fontSize: "0.875rem",
        }}
      >
        <a href="/aviso-privacidad" style={{ color: "#2563eb" }}>
          Aviso de privacidad
        </a>
      </footer>
    </main>
  );
}
