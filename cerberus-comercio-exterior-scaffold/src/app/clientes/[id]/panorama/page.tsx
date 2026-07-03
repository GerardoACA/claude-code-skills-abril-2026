// CERBERUS COMERCIO EXTERIOR — Panorama de cumplimiento del cliente (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/panorama/page.tsx  (Incremento 32)
// Propósito: UN SOLO lugar que consolida el estado de cumplimiento de un cliente:
//            semáforo global + KYC (1.4.14), las 6 fuentes de verificación, la
//            opinión 32-D ingestada (veredicto + cotejo), e.firma, overrides y
//            operaciones/pedimentos, con enlaces a cada detalle. Lectura
//            tenant-scoped (RLS). C9: informa y alerta; nunca bloquea.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

type Fuente = "ART_69" | "ART_69B" | "ART_69B_BIS" | "ART_49BIS" | "OPINION_32D" | "CSD_17H" | "SANCIONES_INT";
type ResultadoVerif = "AL_CORRIENTE" | "NO_DISPONIBLE" | "ALERTA" | "INHABILITADO_PRESUNTO" | "INHABILITADO_DEFINITIVO";

const FUENTES: { fuente: Fuente; etiqueta: string }[] = [
  { fuente: "ART_69", etiqueta: "Art. 69 (créditos firmes)" },
  { fuente: "ART_69B", etiqueta: "Art. 69-B (EFOS)" },
  { fuente: "ART_69B_BIS", etiqueta: "Art. 69-B Bis" },
  { fuente: "ART_49BIS", etiqueta: "Art. 49 Bis" },
  { fuente: "OPINION_32D", etiqueta: "Opinión 32-D" },
  { fuente: "CSD_17H", etiqueta: "CSD 17-H" },
  { fuente: "SANCIONES_INT", etiqueta: "Sanciones internacionales" },
];

type Semaforo = { color: string; fondo: string; borde: string };
const VERDE: Semaforo = { color: "#065f46", fondo: "#ecfdf5", borde: "#a7f3d0" };
const AMBAR: Semaforo = { color: "#92400e", fondo: "#fffbeb", borde: "#fde68a" };
const ROJO: Semaforo = { color: "#b91c1c", fondo: "#fef2f2", borde: "#fecaca" };
const GRIS: Semaforo = { color: "#475569", fondo: "#f8fafc", borde: "#e2e8f0" };

function semaforoResultado(r: ResultadoVerif | null): { sem: Semaforo; etiqueta: string } {
  switch (r) {
    case "AL_CORRIENTE": return { sem: VERDE, etiqueta: "Al corriente" };
    case "ALERTA": return { sem: AMBAR, etiqueta: "Alerta" };
    case "INHABILITADO_PRESUNTO": return { sem: ROJO, etiqueta: "Inhabilitado (presunto)" };
    case "INHABILITADO_DEFINITIVO": return { sem: ROJO, etiqueta: "Inhabilitado (definitivo)" };
    case "NO_DISPONIBLE": return { sem: GRIS, etiqueta: "No disponible" };
    default: return { sem: GRIS, etiqueta: "Sin verificar" };
  }
}

type Datos = {
  cliente: { id: string; rfc: string; razonSocial: string; estadoCsd: string; etapa69b: string } | null;
  kyc: { existe: boolean; documentos: number };
  verificaciones: Partial<Record<Fuente, ResultadoVerif>>;
  opinion: { resultado: string; sentido: string; cotejoEnVivo: string; creadoEn: Date } | null;
  opinionesCount: number;
  efirma: { resultado: string; creadoEn: Date } | null;
  overridesCount: number;
  operacionesCount: number;
  pedimentosCount: number;
};

export default async function PanoramaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;

  const datos: Datos = await withTenantFromSession(session, async (tx): Promise<Datos> => {
    const cliente = await tx.cliente.findFirst({
      where: { id },
      select: { id: true, rfc: true, razonSocial: true, estadoCsd: true, etapa69b: true },
    });
    if (!cliente) {
      return { cliente: null, kyc: { existe: false, documentos: 0 }, verificaciones: {}, opinion: null, opinionesCount: 0, efirma: null, overridesCount: 0, operacionesCount: 0, pedimentosCount: 0 };
    }

    const [kycExp, verifs, opinion, opinionesCount, efirma, overridesCount, operacionesCount, pedimentosCount] =
      await Promise.all([
        tx.expedienteKyc1414.findUnique({ where: { clienteId: cliente.id }, select: { id: true } }),
        tx.verificacionCumplimiento.findMany({
          where: { clienteId: cliente.id },
          select: { fuente: true, resultado: true, consultadoEn: true },
          orderBy: { consultadoEn: "desc" },
        }),
        tx.opinionCumplimientoIngestada.findFirst({
          where: { clienteId: cliente.id },
          select: { resultado: true, sentido: true, cotejoEnVivo: true, creadoEn: true },
          orderBy: { creadoEn: "desc" },
        }),
        tx.opinionCumplimientoIngestada.count({ where: { clienteId: cliente.id } }),
        tx.efirmaEntregada.findFirst({
          where: { clienteId: cliente.id },
          select: { resultado: true, creadoEn: true },
          orderBy: { creadoEn: "desc" },
        }),
        tx.overrideAlerta.count({ where: { clienteId: cliente.id } }),
        tx.operacion.count({ where: { clienteId: cliente.id } }),
        tx.pedimento.count({ where: { operacion: { clienteId: cliente.id } } }),
      ]);

    let documentos = 0;
    if (kycExp) {
      documentos = await tx.documento.count({ where: { expedienteKycId: kycExp.id } });
    }

    const verificaciones: Partial<Record<Fuente, ResultadoVerif>> = {};
    for (const v of verifs) {
      const f = v.fuente as Fuente;
      if (!(f in verificaciones)) verificaciones[f] = v.resultado as ResultadoVerif;
    }

    return {
      cliente,
      kyc: { existe: kycExp !== null, documentos },
      verificaciones,
      opinion: opinion
        ? { resultado: opinion.resultado, sentido: opinion.sentido, cotejoEnVivo: opinion.cotejoEnVivo, creadoEn: opinion.creadoEn }
        : null,
      opinionesCount,
      efirma: efirma ? { resultado: efirma.resultado, creadoEn: efirma.creadoEn } : null,
      overridesCount,
      operacionesCount,
      pedimentosCount,
    };
  });

  if (!datos.cliente) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p><a href="/clientes" style={{ color: "#2563eb" }}>Volver a clientes</a></p>
      </main>
    );
  }

  const c = datos.cliente;

  // Semáforo GLOBAL: rojo si hay inhabilitación/definitivo/CSD cancelado/opinión no auténtica;
  // ámbar si hay alertas/CSD restringido/sin KYC/opinión sospechosa; verde si todo en orden.
  const resultados = Object.values(datos.verificaciones);
  const hayRojo =
    resultados.some((r) => r === "INHABILITADO_PRESUNTO" || r === "INHABILITADO_DEFINITIVO") ||
    c.etapa69b === "DEFINITIVO" ||
    c.estadoCsd === "CANCELADO" ||
    datos.opinion?.resultado === "NO_AUTENTICA";
  const hayAmbar =
    resultados.some((r) => r === "ALERTA") ||
    c.estadoCsd === "RESTRINGIDO" ||
    c.etapa69b === "PRESUNTO" ||
    !datos.kyc.existe ||
    datos.opinion?.resultado === "SOSPECHOSA" ||
    datos.opinion?.sentido === "NEGATIVA";
  const global = hayRojo ? ROJO : hayAmbar ? AMBAR : VERDE;
  const globalTxt = hayRojo ? "REQUIERE ATENCIÓN" : hayAmbar ? "CON OBSERVACIONES" : "EN ORDEN";

  const url = (sub: string) => `/clientes/${encodeURIComponent(c.id)}/${sub}`;
  const card: React.CSSProperties = { padding: "0.9rem 1.1rem", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 };
  const pill = (s: Semaforo, txt: string) => (
    <span style={{ display: "inline-block", padding: "0.12rem 0.55rem", borderRadius: 999, background: s.fondo, border: `1px solid ${s.borde}`, color: s.color, fontSize: "0.78rem", fontWeight: 600 }}>{txt}</span>
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}><a href="/clientes" style={{ color: "#2563eb", fontSize: "0.9rem" }}>← Clientes</a></p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Panorama de cumplimiento</h1>
          <p style={{ color: "#475569", margin: 0 }}>
            <strong>{c.razonSocial}</strong> · <code style={{ fontFamily: "monospace" }}>{c.rfc}</code>
          </p>
        </div>
        <div style={{ textAlign: "center", padding: "0.8rem 1.4rem", background: global.fondo, border: `2px solid ${global.borde}`, borderRadius: 12, color: global.color }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em" }}>ESTADO GLOBAL</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>{globalTxt}</div>
        </div>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.7rem 1rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, color: "#92400e", fontSize: "0.82rem" }}>
        Es un panorama <strong>informativo</strong> (decisión C9): consolida el estado de cumplimiento para que el responsable decida. Nunca bloquea la operación.
      </div>

      {/* Datos base */}
      <section style={{ marginTop: "1.75rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem" }}>
        <div style={card}>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>CSD (17-H)</div>
          <div style={{ marginTop: "0.3rem" }}>{pill(c.estadoCsd === "ACTIVO" ? VERDE : c.estadoCsd === "RESTRINGIDO" ? AMBAR : ROJO, c.estadoCsd)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Etapa 69-B</div>
          <div style={{ marginTop: "0.3rem" }}>{pill(c.etapa69b === "NINGUNA" ? VERDE : c.etapa69b === "DEFINITIVO" ? ROJO : AMBAR, c.etapa69b)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Expediente KYC 1.4.14</div>
          <div style={{ marginTop: "0.3rem" }}>
            {datos.kyc.existe ? pill(VERDE, `Sellado · ${datos.kyc.documentos} doc(s)`) : pill(AMBAR, "Sin expediente")}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Operaciones / Pedimentos</div>
          <div style={{ marginTop: "0.3rem", fontWeight: 700 }}>{datos.operacionesCount} / {datos.pedimentosCount}</div>
        </div>
      </section>

      {/* Verificación de cumplimiento (6+1 fuentes) */}
      <section style={{ marginTop: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1.15rem" }}>Verificación de cumplimiento</h2>
          <a href={url("cumplimiento")} style={{ color: "#2563eb", fontSize: "0.85rem" }}>Ver detalle / verificar →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
          {FUENTES.map(({ fuente, etiqueta }) => {
            const { sem, etiqueta: txt } = semaforoResultado(datos.verificaciones[fuente] ?? null);
            return (
              <div key={fuente} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.82rem", color: "#334155" }}>{etiqueta}</span>
                {pill(sem, txt)}
              </div>
            );
          })}
        </div>
      </section>

      {/* Opinión 32-D + e.firma */}
      <section style={{ marginTop: "1.75rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.8rem" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ fontSize: "1rem", margin: 0 }}>Opinión 32-D</h3>
            <a href={url("opinion")} style={{ color: "#2563eb", fontSize: "0.82rem" }}>Ingerir / ver →</a>
          </div>
          {datos.opinion ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#475569" }}>
              Última ({datos.opinionesCount}): <strong>{datos.opinion.resultado}</strong> · sentido {datos.opinion.sentido} · cotejo {datos.opinion.cotejoEnVivo}
              <br />
              <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>{datos.opinion.creadoEn.toISOString().slice(0, 10)}</span>
            </p>
          ) : (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>Sin opinión ingestada. Sube el PDF (SAT/IMSS).</p>
          )}
        </div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ fontSize: "1rem", margin: 0 }}>e.firma / IMMEX</h3>
            <span>
              <a href={url("efirma")} style={{ color: "#2563eb", fontSize: "0.82rem" }}>e.firma →</a>
              {" · "}
              <a href={url("immex")} style={{ color: "#2563eb", fontSize: "0.82rem" }}>IMMEX →</a>
            </span>
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#475569" }}>
            {datos.efirma ? <>e.firma: <strong>{datos.efirma.resultado}</strong></> : "Sin e.firma entregada."}
            <br />
            Overrides registrados: <strong>{datos.overridesCount}</strong>
          </p>
        </div>
      </section>

      {/* Accesos */}
      <section style={{ marginTop: "1.75rem", padding: "1rem 1.1rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Expedientes y accesos</h2>
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontSize: "0.9rem" }}>
          <a href={url("kyc")} style={{ color: "#2563eb" }}>KYC 1.4.14 →</a>
          <a href={url("verificacion")} style={{ color: "#2563eb" }}>Verificación 69-B →</a>
          <a href={url("cumplimiento")} style={{ color: "#2563eb" }}>Cumplimiento / documentos →</a>
          <a href={url("opinion")} style={{ color: "#2563eb" }}>Opinión 32-D →</a>
          <a href={url("efirma")} style={{ color: "#2563eb" }}>e.firma →</a>
          <a href={url("immex")} style={{ color: "#2563eb" }}>Saldos IMMEX →</a>
          <a href="/operaciones" style={{ color: "#2563eb" }}>Operaciones →</a>
        </div>
      </section>
    </main>
  );
}
