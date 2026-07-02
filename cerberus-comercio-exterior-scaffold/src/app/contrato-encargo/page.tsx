// CERBERUS COMERCIO EXTERIOR — pagina Contrato de Encargo (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/contrato-encargo/page.tsx  [Agente UI-17, Inc 17]
// Proposito: Listar las VERSIONES del Contrato de Encargo de tratamiento del
//            tenant (art. 36 LFPDPPP; arts. 50-55 del Reglamento) y —solo para
//            rol ADMIN— montar el formulario de generacion. Exige sesion valida
//            (si no => /login). Lee las versiones EXCLUSIVAMENTE via
//            withTenantFromSession, de modo que la RLS de Postgres filtra por el
//            tenant del JWT verificado.
//
// El cuerpo del contrato es regenerable de forma determinista; aqui solo se
// listan las versiones selladas (sha256) como evidencia de que-se-firmo.
//
// Server Component (sin "use client"). El unico trozo interactivo es
// <ContratoEncargoForm/>, su propio client component.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { ContratoEncargoForm } from "@/components/ContratoEncargoForm";

// Depende de sesion/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

// Forma de los datos que la pagina renderiza (solo campos mostrados).
type ContratoFila = {
  id: string;
  version: string;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  sha256: string | null;
};

export default async function ContratoEncargoPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const contratos = await withTenantFromSession(
    session,
    async (tx): Promise<ContratoFila[]> => {
      const filas = await tx.contratoEncargo.findMany({
        orderBy: { vigenteDesde: "desc" },
        select: {
          id: true,
          version: true,
          vigenteDesde: true,
          vigenteHasta: true,
          sha256: true,
        },
      });
      return filas as ContratoFila[];
    },
  );

  const esAdmin = session.user.rol === "ADMIN";

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/dashboard" style={{ color: "#2563eb", fontSize: "0.9rem" }}>
          ← Tablero
        </a>
      </p>

      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Contrato de Encargo (LFPDPPP)
      </h1>
      <p style={{ color: "#475569", margin: 0 }}>
        Versiones selladas del contrato de encargo de tratamiento de este tenant.
      </p>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.9rem 1.1rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          color: "#1e3a8a",
          fontSize: "0.9rem",
        }}
      >
        El <strong>Contrato de Encargo</strong> es la condicion que la LFPDPPP
        (art. 36; arts. 50 a 55 de su Reglamento) exige para que la agencia trate
        datos personales <strong>por cuenta del responsable</strong>: fija las
        instrucciones, los subencargados autorizados, las medidas de seguridad, la
        confidencialidad y la devolucion o supresion de los datos al terminar el
        encargo. El cuerpo se regenera de forma determinista y su{" "}
        <strong>SHA-256</strong> sella que-se-firmo (verificable por un perito).
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Versiones ({contratos.length})</h2>
        {contratos.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Aun no se ha generado ninguna version del Contrato de Encargo para este
            tenant.
          </p>
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Version</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Vigencia</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Sello SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c: ContratoFila) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>
                    {c.version}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.85rem",
                      color: "#475569",
                    }}
                  >
                    {c.vigenteDesde.toISOString()}
                    {" → "}
                    {c.vigenteHasta ? c.vigenteHasta.toISOString() : "indefinida"}
                  </td>
                  <td
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      color: "#475569",
                    }}
                  >
                    {c.sha256 ? `${c.sha256.slice(0, 16)}…` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {esAdmin ? (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>Generar nueva version</h2>
          <p style={{ color: "#475569", fontSize: "0.9rem", marginTop: 0 }}>
            Solo un administrador puede generar el contrato. El cuerpo se deriva de
            los datos del tenant y se sella con SHA-256 al crearse; el acto queda
            encadenado en la bitacora de auditoria.
          </p>
          <ContratoEncargoForm />
        </section>
      ) : (
        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "2rem" }}>
          La generacion de nuevas versiones esta reservada al rol ADMIN.
        </p>
      )}
    </main>
  );
}
