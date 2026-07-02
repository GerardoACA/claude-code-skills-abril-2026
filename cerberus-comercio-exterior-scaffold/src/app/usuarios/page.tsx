// CERBERUS COMERCIO EXTERIOR — Gestion de usuarios del tenant (Server Component). NO es SIDF.
// =============================================================================
// Archivo:  src/app/usuarios/page.tsx  [Inc 18]
// Proposito: Pantalla de administracion de usuarios POR TENANT. Exige sesion
//            valida (si no, redirect("/login")). Solo un ADMIN puede gestionar
//            usuarios: si el rol no es ADMIN se muestra un aviso (no 500) y NO se
//            monta el formulario. Si es ADMIN, lista los usuarios del tenant
//            EXCLUSIVAMENTE via withTenantFromSession (RLS filtra por el tenant
//            del JWT) y monta el panel cliente UsuariosAdmin.
//
// Server Component (sin "use client"). Depende de sesion/DB: no se pre-renderiza.
// =============================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { UsuariosAdmin, type UsuarioFila } from "@/components/UsuariosAdmin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  // 1) Verifica el JWT. Sin sesion => a /login (fail-closed).
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const esAdmin = session.user.rol === "ADMIN";

  // 2) Solo ADMIN gestiona usuarios: aviso claro (no 500) si no lo es.
  if (!esAdmin) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: "2rem", margin: 0 }}>Usuarios del tenant</h1>
          <a href="/dashboard" style={{ color: "#2563eb" }}>
            ← Tablero
          </a>
        </header>
        <div
          style={{
            marginTop: "2rem",
            padding: "0.9rem 1.1rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            color: "#92400e",
            fontSize: "0.95rem",
          }}
        >
          Solo un administrador del tenant puede gestionar usuarios.
        </div>
      </main>
    );
  }

  // 3) Lectura tenant-scoped: RLS filtra por el tenant del token. Sin passwordHash.
  const usuarios: UsuarioFila[] = await withTenantFromSession(
    session,
    async (tx): Promise<UsuarioFila[]> => {
      const filas = await tx.usuario.findMany({
        select: {
          id: true,
          email: true,
          nombre: true,
          rol: true,
          activo: true,
          creadoEn: true,
        },
        orderBy: { creadoEn: "asc" },
      });
      return filas.map(
        (u): UsuarioFila => ({
          id: u.id,
          email: u.email,
          nombre: u.nombre,
          rol: u.rol,
          activo: u.activo,
          creadoEn: u.creadoEn.toISOString(),
        }),
      );
    },
  );

  const emailPropio = session.user.email ?? "";

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>
            Usuarios del tenant
          </h1>
          <p style={{ color: "#475569", margin: 0 }}>
            {usuarios.length} usuario(s) registrados para este tenant.
          </p>
        </div>
        <a href="/dashboard" style={{ color: "#2563eb" }}>
          ← Tablero
        </a>
      </header>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "0.9rem 1.1rem",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          color: "#065f46",
          fontSize: "0.95rem",
        }}
      >
        Aislamiento estricto por inquilino: solo administras usuarios de tu propio
        tenant. El filtrado lo garantiza la seguridad a nivel de fila (RLS) de
        PostgreSQL. Las contrasenas se almacenan hasheadas y nunca se muestran.
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <UsuariosAdmin usuarios={usuarios} emailPropio={emailPropio} />
      </section>
    </main>
  );
}
