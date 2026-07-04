// CERBERUS COMERCIO EXTERIOR — Página cuestionario KYC 1.4.14 (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/clientes/[id]/kyc/page.tsx
// Propósito: Cargar el Cliente por id (tenant-scoped vía withTenantFromSession, la
//            RLS de Postgres filtra por el tenant del JWT) y renderizar el
//            formulario multi-sección del expediente 1.4.14 (client component
//            CuestionarioKyc), pasándole el cliente y su expediente si ya existe.
//
// Fail-closed: sin sesión válida => redirect a /login. Si el cliente no pertenece
// al tenant (o no existe), la lectura devuelve null y se muestra un aviso.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import {
  CuestionarioKyc,
  type ClienteResumen,
  type ExpedienteResumen,
} from "@/components/CuestionarioKyc";
import { DocumentosKyc } from "@/components/DocumentosKyc";
import { extraerInicialesDeSellado, type PrecargaCuestionario } from "@/lib/kyc-precarga";

// Depende de la sesión/DB: no debe pre-renderizarse en build.
export const dynamic = "force-dynamic";

type Cargado = {
  cliente: ClienteResumen;
  expediente: ExpedienteResumen | null;
  /** [Inc 47] Última versión sellada del cuestionario, para precargar. */
  iniciales: PrecargaCuestionario | null;
};

export default async function KycPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 1) Verifica el JWT. Sin sesión => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  // 2) Lectura tenant-scoped: RLS filtra por el tenant del token verificado.
  const cargado: Cargado | null = await withTenantFromSession(
    session,
    async (tx): Promise<Cargado | null> => {
      const cliente = await tx.cliente.findFirst({
        where: { id },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) return null;

      const expediente = await tx.expedienteKyc1414.findUnique({
        where: { clienteId: cliente.id },
        select: {
          id: true,
          custodio: true,
          retieneHasta: true,
          _count: { select: { documentos: true } },
        },
      });

      const expedienteResumen: ExpedienteResumen | null = expediente
        ? {
            id: expediente.id,
            custodio: expediente.custodio,
            retieneHasta: expediente.retieneHasta
              ? expediente.retieneHasta.toISOString()
              : null,
            documentosCount: expediente._count.documentos,
          }
        : null;

      // [Inc 47] Precarga: el payload sellado más reciente vive en la bitácora
      // (acción KYC_SELLADO); el capturista solo modifica lo que cambió.
      const selladoPrevio = await tx.bitacoraAuditoria.findFirst({
        where: {
          accion: "KYC_SELLADO",
          payloadRef: { contains: `"clienteId":"${cliente.id}"` },
        },
        orderBy: { creadoEn: "desc" },
        select: { payloadRef: true },
      });
      const iniciales =
        selladoPrevio?.payloadRef != null
          ? extraerInicialesDeSellado(selladoPrevio.payloadRef)
          : null;

      return { cliente, expediente: expedienteResumen, iniciales };
    },
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/clientes" style={{ color: "#2563eb" }}>
          ← Clientes
        </a>
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Cuestionario KYC — Expediente 1.4.14
      </h1>
      <p style={{ color: "#475569", marginTop: 0 }}>
        Identificación y conocimiento del cliente + materialidad de sus operaciones
        de comercio exterior (Regla 1.4.14 CFF).
      </p>

      {cargado === null ? (
        <div
          style={{
            marginTop: "2rem",
            padding: "1rem 1.25rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
          }}
        >
          Cliente no encontrado para este tenant.{" "}
          <a href="/clientes" style={{ color: "#2563eb" }}>
            Volver a clientes
          </a>
          .
        </div>
      ) : (
        <>
          {/* Bóveda documental del expediente (Inc 43): los documentos REALES
              del cliente van ANTES del cuestionario. */}
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
              Documentos del expediente (1.4.14)
            </h2>
            <DocumentosKyc clienteId={cargado.cliente.id} />
          </section>
          <div style={{ marginTop: "2rem" }}>
            <CuestionarioKyc
              cliente={cargado.cliente}
              expediente={cargado.expediente}
              iniciales={cargado.iniciales}
            />
          </div>
        </>
      )}
    </main>
  );
}
