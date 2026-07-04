// CERBERUS COMERCIO EXTERIOR — administración de listados (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/admin/listados/page.tsx
// Propósito (Incremento 12 — Agente SERVICIO-12): Página SOLO ADMIN que reúne
//   la operación de listados de referencia:
//     1. Tabla de la ÚLTIMA importación por fuente (fecha, filas, sha256
//        corto, origen AUTOMATICA|MANUAL, emisor).
//     2. Sincronización automática (reusa SincronizarListados, Inc 10).
//     3. Ingesta MANUAL de un CSV (IngestaManual, Inc 12): cualquier fuente
//        del enum, incluida SANCIONES_INT (OFAC/SDN, ONU, UE, UK…).
//
// ACCESO: sesión válida + rol ADMIN; sin sesión => /login; otro rol =>
//   /dashboard (fail-closed). La autorización REAL de las escrituras la
//   imponen los endpoints (401/403).
//
// DECISIÓN DE DISEÑO — TABLAS GLOBALES SIN TENANT (heredada del Inc 10):
//   ImportacionListadoSat es referencia GLOBAL (sin tenant_id): lectura con
//   `prisma` directo, NO withTenantFromSession.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SincronizarListados } from "@/components/SincronizarListados";
import { IngestaManual } from "@/components/IngestaManual";
import {
  FUENTES_VERIFICACION,
  type FuenteVerificacion,
} from "@/lib/verificacion-cumplimiento";

// Depende de sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// Etiquetas legibles por fuente (mismo orden que FUENTES_VERIFICACION).
const ETIQUETAS_FUENTE: Record<FuenteVerificacion, string> = {
  ART_69: "Art. 69 CFF (créditos firmes / no localizados)",
  ART_69B: "Art. 69-B CFF (EFOS/EDOS)",
  ART_69B_BIS: "Art. 69-B Bis (transmisión indebida de pérdidas)",
  ART_49BIS: "Art. 49 Bis CFF (supuesto que inhabilita)",
  OPINION_32D: "Opinión 32-D (cumplimiento de obligaciones)",
  CSD_17H: "CSD 17-H (sello digital)",
  SANCIONES_INT: "Sanciones internacionales (OFAC/SDN, ONU, UE, UK…)",
  PADRON: "Padrón de Importadores (Módulo 2.1)", // [Inc 56]
};

// Última importación por fuente (solo los campos mostrados).
type UltimaImportacionFila = {
  importadoEn: Date;
  filas: number;
  sha256Archivo: string;
  origen: string;
  emisor: string | null;
} | null;

export default async function AdminListadosPage() {
  // 1) Verifica el JWT. Sin sesión => /login; sin rol ADMIN => /dashboard.
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (session.user.rol !== "ADMIN") {
    redirect("/dashboard");
  }

  // 2) Última importación por fuente (referencia GLOBAL: prisma directo).
  const ultimas: UltimaImportacionFila[] = await Promise.all(
    FUENTES_VERIFICACION.map((fuente) =>
      prisma.importacionListadoSat.findFirst({
        where: { fuente },
        orderBy: { importadoEn: "desc" },
        select: {
          importadoEn: true,
          filas: true,
          sha256Archivo: true,
          origen: true,
          emisor: true,
        },
      }),
    ),
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
          ← Tablero
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Listados de referencia (administración)
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        Sincronización automática de los listados públicos del SAT e ingesta
        manual de archivos (69-B Bis, 49 Bis, refrescos de 69/69-B y sanciones
        internacionales). Referencia GLOBAL, igual para todos los tenants.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Última importación por fuente</h2>
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.5rem 0.75rem" }}>Fuente</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Fecha</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Filas</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>sha256</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Origen</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Emisor</th>
            </tr>
          </thead>
          <tbody>
            {FUENTES_VERIFICACION.map((fuente, i) => {
              const imp = ultimas[i] ?? null;
              return (
                <tr key={fuente} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
                    {ETIQUETAS_FUENTE[fuente]}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.85rem",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                      color: "#475569",
                    }}
                  >
                    {imp ? imp.importadoEn.toISOString() : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem" }}>
                    {imp ? imp.filas : "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.75rem",
                      fontFamily: "monospace",
                    }}
                  >
                    {imp ? `${imp.sha256Archivo.slice(0, 16)}…` : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem" }}>
                    {imp ? imp.origen : "—"}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem" }}>
                    {imp ? (imp.emisor ?? "—") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Se muestra la importación más reciente por fuente. Una fuente sin
          importaciones queda NO_DISPONIBLE en la verificación de cumplimiento
          hasta que se sincronice o se ingeste manualmente.
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Sincronización automática (SAT)</h2>
        <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: 0 }}>
          Descarga e importa los listados públicos del SAT con URL configurada
          (arts. 69, 69-B, 69-B Bis, 49 Bis). El cron diario del vigía ejecuta
          esta misma sincronización.
        </p>
        <SincronizarListados esAdmin={true} />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Ingesta manual de un archivo</h2>
        <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: 0 }}>
          Sube un CSV de cualquier fuente (p. ej. 69-B Bis o 49 Bis publicados
          sin URL estable, refrescos manuales de 69/69-B, o listas de sanciones
          internacionales). Se importa con el mismo rigor probatorio: sha256
          del archivo crudo, fecha y origen MANUAL.
        </p>
        <IngestaManual esAdmin={true} fuentes={FUENTES_VERIFICACION} />
      </section>
    </main>
  );
}
