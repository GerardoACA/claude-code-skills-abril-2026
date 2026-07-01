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

import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

// -----------------------------------------------------------------------------
// Roles de la aplicacion (claim `rol`). Alineado con el enum RolUsuario del
// schema Prisma (prisma/schema.prisma): ADMIN, AGENTE, OPERADOR, AUDITOR,
// AUTORIDAD.
// -----------------------------------------------------------------------------
export type RolUsuario =
  | "ADMIN"
  | "AGENTE"
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
      // Verificacion real de password: hash scrypt en Usuario.passwordHash
      // (ver src/lib/password.ts), comparacion timing-safe.
      async authorize(credentials): Promise<User | null> {
        const email: string = credentials?.email?.trim().toLowerCase() ?? "";
        const password: string = credentials?.password ?? "";
        if (!email || !password) return null;

        // El modelo Usuario (incluye tenantId, rol, passwordHash) es identificado
        // por email (identificador unico). Este lookup NO pasa por RLS de tenant:
        // el login es pre-contexto, por eso se filtra explicitamente por email.
        const usuario = await prisma.usuario.findFirst({
          where: { email, activo: true },
          select: {
            id: true,
            tenantId: true,
            rol: true,
            email: true,
            nombre: true,
            passwordHash: true,
          },
        });
        if (!usuario) return null;

        // Fail-closed: sin hash almacenado no se puede autenticar localmente.
        if (!usuario.passwordHash) return null;

        const passwordOk: boolean = verifyPassword(password, usuario.passwordHash);
        if (!passwordOk) return null;

        const user: User = {
          id: usuario.id,
          tenantId: usuario.tenantId,
          rol: usuario.rol as RolUsuario,
          email: usuario.email,
          name: usuario.nombre,
        };
        return user;
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
    // Pagina de login personalizada (src/app/login/page.tsx).
    signIn: "/login",
  },
};

// =============================================================================
// FIN auth.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
