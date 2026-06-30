// CERBERUS COMERCIO EXTERIOR — configuracion de autenticacion (NextAuth 4). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/auth.ts
// Proposito: Configurar NextAuth 4 con JWT que transporta `tenantId` y `rol`, y
//            callbacks que los inyectan en el token y en la sesion. El `tenantId`
//            del JWT es la UNICA fuente de verdad para el contexto RLS de
//            src/lib/tenant-context.ts (withTenant). Nunca se toma del request.
//
// Estrategia: sesion JWT (sin tabla de sesiones). El token se firma con
//             NEXTAUTH_SECRET y se verifica en cada peticion; de ahi salen los
//             claims `tenantId` y `rol` ya confiables.
//
// Provider: Credentials como base conectable (login email + password verificado
//           contra el modelo Usuario que define el Agente B). El objetivo de Fase
//           0 es dejar el cableado de claims tenantId/rol; la verificacion real de
//           credenciales se endurece despues (hash de password, lockout, etc.).
// =============================================================================

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

// -----------------------------------------------------------------------------
// Roles de la aplicacion (claim `rol`). Mantener alineado con el modelo Usuario.
// -----------------------------------------------------------------------------
export type RolUsuario =
  | "ADMIN"
  | "AGENTE_ADUANAL"
  | "OPERADOR"
  | "AUDITOR"
  | "AUTORIDAD";

// -----------------------------------------------------------------------------
// Augmentacion de tipos: añade tenantId y rol a JWT, Session y User.
// -----------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      rol: RolUsuario;
      email?: string | null;
      name?: string | null;
    };
  }
  interface User {
    id: string;
    tenantId: string;
    rol: RolUsuario;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    tenantId: string;
    rol: RolUsuario;
  }
}

// -----------------------------------------------------------------------------
// authOptions: configuracion central. Importar desde aqui en el route handler y
// en getServerSession(authOptions).
// -----------------------------------------------------------------------------
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contrasena", type: "password" },
      },
      // authorize DEBE devolver un User con tenantId y rol, o null para rechazar.
      // La verificacion de password se endurece en fases posteriores (hash, etc.).
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        // El modelo Usuario lo define el Agente B (incluye tenantId y rol).
        // Nota: este lookup NO pasa por RLS de tenant (login es pre-contexto);
        // por eso se filtra explicitamente por email y se valida la credencial.
        const usuario = await prisma.usuario.findFirst({
          where: { email },
          select: { id: true, tenantId: true, rol: true, email: true, nombre: true },
        });
        if (!usuario) return null;

        // TODO(seguridad): reemplazar por verificacion de hash de password
        // (p. ej. argon2/bcrypt contra usuario.passwordHash). En Fase 0 el
        // cableado de claims es el objetivo; aqui NO se acepta cualquier clave en
        // produccion: exigir que exista un mecanismo de verificacion real.
        const passwordOk = await verificarPassword(usuario.id, password);
        if (!passwordOk) return null;

        return {
          id: usuario.id,
          tenantId: usuario.tenantId,
          rol: usuario.rol as RolUsuario,
          email: usuario.email,
          name: usuario.nombre ?? null,
        };
      },
    }),
  ],

  callbacks: {
    // 1) Al iniciar sesion, copiar tenantId/rol/uid del User al token JWT firmado.
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.tenantId = user.tenantId;
        token.rol = user.rol;
      }
      return token;
    },
    // 2) Exponer tenantId/rol en la sesion (lo que leen los handlers / withTenant).
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.tenantId = token.tenantId;
        session.user.rol = token.rol;
      }
      return session;
    },
  },

  pages: {
    // signIn: "/login", // habilitar cuando exista la pagina (Agente A/C).
  },
};

// -----------------------------------------------------------------------------
// verificarPassword: stub conectable. DEBE reemplazarse por verificacion real de
// hash (argon2/bcrypt). Por defecto rechaza (fail-closed) salvo que se conecte un
// verificador, para no permitir login con cualquier clave por accidente.
// -----------------------------------------------------------------------------
async function verificarPassword(_usuarioId: string, _password: string): Promise<boolean> {
  // Fail-closed: sin verificador real conectado, NO autenticar.
  // El Agente que implemente el flujo de password debe sustituir este cuerpo.
  return false;
}

// =============================================================================
// FIN auth.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
