// CERBERUS COMERCIO EXTERIOR — pagina cumplimiento (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/cumplimiento/page.tsx
// Proposito: Muestra el estado de cumplimiento COMPLETO del cliente cubriendo las
//            6 fuentes (art. 69, 69-B, 69-B Bis, 49 Bis, opinion 32-D, CSD 17-H).
//            Por cada fuente presenta su RESULTADO MAS RECIENTE y un semaforo de
//            color, mas un boton "Verificar todo". Exige sesion valida (si no =>
//            /login). Carga el Cliente y sus VerificacionCumplimiento
//            EXCLUSIVAMENTE via withTenantFromSession, de modo que la RLS de
//            Postgres filtra por el tenant del JWT verificado.
//
// DECISION C9 — ES ALERTA, NO BLOQUEO: esta pantalla solo INFORMA el estado de
// cumplimiento y ofrece registrarlo. Nunca impide ninguna operacion del cliente.
//
// Server Component (sin "use client"). El unico trozo interactivo es el boton
// BotonVerificarCumplimiento, que es su propio client component.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { BotonVerificarCumplimiento } from "@/components/BotonVerificarCumplimiento";
import { SincronizarListados } from "@/components/SincronizarListados";
// [Agente UI-15, Inc 15] override motivado de alertas (decision C11).
import { OverrideForm, type FuenteAdversa } from "@/components/OverrideForm";

// Depende de sesion/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Enums EXACTOS del blueprint (Incremento 5), como tipos literales locales.
// -----------------------------------------------------------------------------
type FuenteVerificacion =
  | "ART_69"
  | "ART_69B"
  | "ART_69B_BIS"
  | "ART_49BIS"
  | "OPINION_32D"
  | "CSD_17H"
  // [Agente SERVICIO-12, Inc 12] sanciones internacionales (OFAC/ONU/UE/UK).
  | "SANCIONES_INT";

type ResultadoVerificacion =
  | "AL_CORRIENTE"
  | "NO_DISPONIBLE"
  | "ALERTA"
  | "INHABILITADO_PRESUNTO"
  | "INHABILITADO_DEFINITIVO";

// [Agente UI-15, Inc 15] resultados adversos que habilitan registrar override
// y filas de OverrideAlerta que se listan (decision C11).
const RESULTADOS_ADVERSOS: ReadonlySet<ResultadoVerificacion> =
  new Set<ResultadoVerificacion>([
    "ALERTA",
    "INHABILITADO_PRESUNTO",
    "INHABILITADO_DEFINITIVO",
  ]);

type EstadoFirmaOverride = "SIN_FIRMA" | "FIRMADO";

type OverrideFila = {
  id: string;
  fuente: FuenteVerificacion;
  resultado: string;
  motivo: string;
  actor: string;
  estadoFirma: EstadoFirmaOverride;
  firmaDetalle: string | null;
  creadoEn: Date;
};

// Formas de datos que la pagina renderiza (solo campos mostrados).
type ClienteDatos = { id: string; rfc: string; razonSocial: string };
type VerificacionFila = {
  id: string;
  fuente: FuenteVerificacion;
  resultado: ResultadoVerificacion;
  detalle: string | null;
  snapshotSha256: string | null;
  consultadoEn: Date;
  vigenciaHasta: Date | null;
};

// Orden y etiquetas legibles de las 6 fuentes (siempre se muestran todas).
const FUENTES: { fuente: FuenteVerificacion; etiqueta: string }[] = [
  { fuente: "ART_69", etiqueta: "Art. 69 CFF (creditos firmes / no localizados)" },
  { fuente: "ART_69B", etiqueta: "Art. 69-B CFF (EFOS/EDOS)" },
  { fuente: "ART_69B_BIS", etiqueta: "Art. 69-B Bis (transmision indebida de perdidas)" },
  { fuente: "ART_49BIS", etiqueta: "Art. 49 Bis CFF (supuesto que inhabilita)" },
  { fuente: "OPINION_32D", etiqueta: "Opinion 32-D (cumplimiento de obligaciones)" },
  { fuente: "CSD_17H", etiqueta: "CSD 17-H (sello digital)" },
  // [Agente SERVICIO-12, Inc 12] nueva fuente: ingesta manual en /admin/listados;
  // el match por NOMBRE es heuristico => siempre ALERTA con revision humana (C9).
  { fuente: "SANCIONES_INT", etiqueta: "Sanciones internacionales (OFAC/SDN, ONU, UE, UK)" },
];

// Fuentes que se sincronizan como LISTADO del SAT (Incremento 10). Las tablas
// ImportacionListadoSat/ListadoSatEntrada son GLOBALES (sin tenant_id: los
// listados del SAT son publicos e iguales para todos los tenants), por eso su
// lectura va con `prisma` directo y NO dentro de withTenantFromSession.
const FUENTES_LISTADO: { fuente: FuenteVerificacion; etiqueta: string }[] = [
  { fuente: "ART_69", etiqueta: "Art. 69" },
  { fuente: "ART_69B", etiqueta: "Art. 69-B" },
  { fuente: "ART_69B_BIS", etiqueta: "Art. 69-B Bis" },
  { fuente: "ART_49BIS", etiqueta: "Art. 49 Bis" },
];

// Ultima importacion por fuente (solo campos mostrados).
type UltimaImportacionFila = {
  importadoEn: Date;
  filas: number;
  sha256Archivo: string;
} | null;

// Semaforo por resultado. Verde = al corriente; ambar = alerta/no disponible;
// rojo = inhabilitado (presunto o definitivo). Es informativo (C9), no bloquea.
type Semaforo = { color: string; fondo: string; borde: string; etiqueta: string };

function semaforoDe(resultado: ResultadoVerificacion | null): Semaforo {
  switch (resultado) {
    case "AL_CORRIENTE":
      return { color: "#065f46", fondo: "#ecfdf5", borde: "#a7f3d0", etiqueta: "Al corriente" };
    case "ALERTA":
      return { color: "#92400e", fondo: "#fffbeb", borde: "#fde68a", etiqueta: "Alerta" };
    case "INHABILITADO_PRESUNTO":
      return { color: "#9a3412", fondo: "#fff7ed", borde: "#fdba74", etiqueta: "Inhabilitado (presunto)" };
    case "INHABILITADO_DEFINITIVO":
      return { color: "#b91c1c", fondo: "#fef2f2", borde: "#fecaca", etiqueta: "Inhabilitado (definitivo)" };
    case "NO_DISPONIBLE":
      return { color: "#475569", fondo: "#f8fafc", borde: "#e2e8f0", etiqueta: "No disponible" };
    default:
      return { color: "#94a3b8", fondo: "#f8fafc", borde: "#e2e8f0", etiqueta: "Sin verificar" };
  }
}

type PageProps = { params: Promise<{ id: string }> };

export default async function CumplimientoPage({ params }: PageProps) {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id: clienteId } = await params;

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const datos = await withTenantFromSession(
    session,
    async (
      tx,
    ): Promise<{
      cliente: ClienteDatos | null;
      verificaciones: VerificacionFila[];
      overrides: OverrideFila[];
    }> => {
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) {
        return { cliente: null, verificaciones: [], overrides: [] };
      }
      const verificaciones = await tx.verificacionCumplimiento.findMany({
        where: { clienteId: cliente.id },
        select: {
          id: true,
          fuente: true,
          resultado: true,
          detalle: true,
          snapshotSha256: true,
          consultadoEn: true,
          vigenciaHasta: true,
        },
        orderBy: { consultadoEn: "desc" },
      });
      // [Agente UI-15, Inc 15] overrides registrados del cliente (RLS filtra
      // por el tenant del token; acto ADICIONAL: nunca altera la alerta).
      const overrides = await tx.overrideAlerta.findMany({
        where: { clienteId: cliente.id },
        select: {
          id: true,
          fuente: true,
          resultado: true,
          motivo: true,
          actor: true,
          estadoFirma: true,
          firmaDetalle: true,
          creadoEn: true,
        },
        orderBy: { creadoEn: "desc" },
      });
      return {
        cliente,
        verificaciones: verificaciones as VerificacionFila[],
        overrides: overrides as OverrideFila[],
      };
    },
  );

  if (!datos.cliente) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Cliente no encontrado</h1>
        <p style={{ color: "#94a3b8" }}>
          No existe un cliente con ese identificador para tu tenant.
        </p>
        <p>
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
        </p>
      </main>
    );
  }

  const cliente = datos.cliente;

  // 3) Ultima sincronizacion de listados del SAT (Incremento 10). Referencia
  //    GLOBAL sin tenant_id: consulta prisma DIRECTA (fuera de RLS por diseno),
  //    la importacion mas reciente por cada fuente de listado.
  const ultimasImportaciones: UltimaImportacionFila[] = await Promise.all(
    FUENTES_LISTADO.map(({ fuente }) =>
      prisma.importacionListadoSat.findFirst({
        where: { fuente },
        orderBy: { importadoEn: "desc" },
        select: { importadoEn: true, filas: true, sha256Archivo: true },
      }),
    ),
  );
  const hayAlgunaSincronizacion = ultimasImportaciones.some((imp) => imp !== null);
  // El rol proviene del JWT verificado (claims tipados en src/lib/auth.ts).
  const esAdmin = session.user.rol === "ADMIN";

  // Resultado MAS RECIENTE por fuente (las verificaciones vienen ordenadas desc
  // por consultadoEn, asi que la primera de cada fuente es la vigente).
  const masReciente = new Map<FuenteVerificacion, VerificacionFila>();
  for (const v of datos.verificaciones) {
    if (!masReciente.has(v.fuente)) {
      masReciente.set(v.fuente, v);
    }
  }

  // [Agente UI-15, Inc 15] fuentes cuyo ULTIMO resultado es adverso
  // (ALERTA / INHABILITADO_*): sobre ellas se puede registrar un override.
  const fuentesAdversas: FuenteAdversa[] = FUENTES.flatMap(({ fuente, etiqueta }) => {
    const fila = masReciente.get(fuente);
    if (!fila || !RESULTADOS_ADVERSOS.has(fila.resultado)) return [];
    return [{ fuente, etiqueta, resultado: fila.resultado }];
  });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
          ← Clientes
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Verificacion de cumplimiento
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        <strong>{cliente.razonSocial}</strong> ·{" "}
        <code style={{ fontFamily: "monospace" }}>{cliente.rfc}</code>
      </p>
      {/* [Inc 20] Entrega + validación de autenticidad de la e.firma para
          sustentar la opinión 32-D (el cliente entrega su .cer público; la
          clave privada nunca entra al sistema — C14). */}
      <p style={{ margin: "0.5rem 0 0" }}>
        <a
          href={`/clientes/${encodeURIComponent(cliente.id)}/efirma`}
          style={{ color: "#2563eb", fontSize: "0.9rem" }}
        >
          Gestionar e.firma / opinión 32-D →
        </a>
      </p>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1.1rem",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 8,
          color: "#92400e",
          fontSize: "0.9rem",
        }}
      >
        Esto es una <strong>alerta</strong>, no un bloqueo (decision C9). El
        sistema solo marca y registra el estado de cumplimiento (arts. 69, 69-B,
        69-B Bis, 49 Bis, opinion 32-D y CSD 17-H) para que el responsable decida.
        <strong> Nunca impide ninguna operacion del cliente.</strong>
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Estado por fuente</h2>
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Fuente</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Semaforo</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Detalle</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Consultado</th>
            </tr>
          </thead>
          <tbody>
            {FUENTES.map(({ fuente, etiqueta }) => {
              const fila = masReciente.get(fuente) ?? null;
              const s = semaforoDe(fila ? fila.resultado : null);
              return (
                <tr key={fuente} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
                    {etiqueta}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.6rem",
                        borderRadius: 999,
                        background: s.fondo,
                        border: `1px solid ${s.borde}`,
                        color: s.color,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                      }}
                    >
                      {s.etiqueta}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.85rem",
                      color: "#475569",
                    }}
                  >
                    {fila?.detalle ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.85rem",
                      color: "#94a3b8",
                    }}
                  >
                    {fila ? fila.consultadoEn.toISOString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Se muestra el resultado mas reciente por fuente. La ausencia de registro
          se muestra como &ldquo;Sin verificar&rdquo;.
        </p>
      </section>

      {/* [Agente UI-15, Inc 15] Overrides registrados + form (decision C11).
          El override documenta la decision HUMANA de continuar pese al resultado
          adverso: motivado, atribuido, sellado, encadenado. NUNCA borra la alerta. */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Overrides registrados</h2>
        {datos.overrides.length > 0 ? (
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fecha</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fuente</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Resultado</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Motivo</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Actor</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Firma</th>
              </tr>
            </thead>
            <tbody>
              {datos.overrides.map((o: OverrideFila) => (
                <tr key={o.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "#94a3b8" }}>
                    {o.creadoEn.toISOString()}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {o.fuente}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {o.resultado}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", color: "#475569" }}>
                    {o.motivo}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {o.actor}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}>
                    {o.estadoFirma === "FIRMADO" ? (
                      <span style={{ color: "#065f46", fontWeight: 600 }}>
                        FIRMADO
                        {o.firmaDetalle ? ` — ${o.firmaDetalle}` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#92400e" }}>
                        SIN_FIRMA — pendiente de firma electronica (e.firma); el
                        acto queda igualmente motivado, sellado y atribuido.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            No hay overrides registrados para este cliente.
          </p>
        )}

        {fuentesAdversas.length > 0 ? (
          <>
            <h3 style={{ fontSize: "1rem", marginTop: "1.25rem", marginBottom: 0 }}>
              Registrar override
            </h3>
            <p style={{ color: "#475569", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
              Hay fuentes con resultado adverso. El responsable puede documentar
              aqui su decision de continuar operando con este cliente, con motivo
              obligatorio (decision C11).
            </p>
            <OverrideForm clienteId={cliente.id} fuentesAdversas={fuentesAdversas} />
          </>
        ) : (
          <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.75rem" }}>
            El registro de override se habilita cuando alguna fuente tiene
            resultado adverso (ALERTA o inhabilitacion presunta/definitiva).
          </p>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Verificar</h2>
        <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: 0 }}>
          Ejecuta la verificacion de cumplimiento de las 6 fuentes. Los arts.
          69, 69-B, 69-B Bis y 49 Bis se consultan contra los listados REALES
          del SAT importados (opinion 32-D y CSD 17-H siguen pendientes de
          integracion). Registra un snapshot fechado sellado con SHA-256 por
          cada fuente.
        </p>
        <BotonVerificarCumplimiento clienteId={cliente.id} />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Ultima sincronizacion de listados</h2>
        {hayAlgunaSincronizacion ? (
          <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
            {FUENTES_LISTADO.map(({ fuente, etiqueta }, i) => {
              const imp = ultimasImportaciones[i] ?? null;
              return (
                <li
                  key={fuente}
                  style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.25rem" }}
                >
                  <strong>{etiqueta}</strong>:{" "}
                  {imp ? (
                    <>
                      {imp.importadoEn.toISOString()} · {imp.filas} filas ·{" "}
                      <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        sha256 {imp.sha256Archivo.slice(0, 16)}…
                      </code>
                    </>
                  ) : (
                    "sin sincronizar"
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={{ color: "#92400e", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Los listados del SAT <strong>nunca se han sincronizado</strong>: la
            verificacion de los arts. 69 / 69-B / 69-B Bis / 49 Bis saldra
            NO_DISPONIBLE hasta que un administrador los sincronice.
          </p>
        )}
        <SincronizarListados esAdmin={esAdmin} />
      </section>

      {datos.verificaciones.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>
            Historial ({datos.verificaciones.length})
          </h2>
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Fuente</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Resultado</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Consultado</th>
              </tr>
            </thead>
            <tbody>
              {datos.verificaciones.map((v: VerificacionFila) => (
                <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {v.fuente}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {v.resultado}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}>
                    {v.consultadoEn.toISOString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
