// CERBERUS COMERCIO EXTERIOR — tarjetas de estado de los canales de aviso. NO es SIDF.
// =============================================================================
// Archivo:  src/components/EstadoCanales.tsx  (Incremento 40)
// Propósito: Server Component (sin "use client") que pinta dos tarjetas
//            pequeñas (Telegram / Correo) con un pill verde "Configurado" o
//            ámbar "Sin configurar" y el detalle honesto que calcula
//            evaluarEstadoCanales() en src/lib/estado-canales.ts. Le dice al
//            administrador de un vistazo si las env vars de cada canal existen,
//            SIN exponer jamás el valor de los secretos.
// =============================================================================

import type { EstadoCanales as EstadoCanalesModelo } from "@/lib/estado-canales";

interface Props {
  estado: EstadoCanalesModelo;
}

const tarjeta: React.CSSProperties = {
  flex: "1 1 260px",
  padding: "0.75rem 0.9rem",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};

function PillEstado({ configurado }: { configurado: boolean }) {
  return (
    <span
      style={{
        padding: "0.12rem 0.55rem",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 700,
        background: configurado ? "#ecfdf5" : "#fffbeb",
        border: `1px solid ${configurado ? "#a7f3d0" : "#fde68a"}`,
        color: configurado ? "#065f46" : "#92400e",
      }}
    >
      {configurado ? "Configurado" : "Sin configurar"}
    </span>
  );
}

function TarjetaCanal({ titulo, canal }: { titulo: string; canal: { configurado: boolean; detalle: string } }) {
  return (
    <div style={tarjeta}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{titulo}</span>
        <PillEstado configurado={canal.configurado} />
      </div>
      <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#475569" }}>{canal.detalle}</p>
    </div>
  );
}

export function EstadoCanales({ estado }: Props) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.7rem", marginBottom: "1.75rem" }}>
      <TarjetaCanal titulo="Telegram" canal={estado.telegram} />
      <TarjetaCanal titulo="Correo" canal={estado.email} />
    </div>
  );
}
