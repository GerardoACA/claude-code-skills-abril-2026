// CERBERUS COMERCIO EXTERIOR — API de usuarios del tenant (alta y listado). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/usuarios/route.ts  [Inc 18]
// Proposito: Gestion de usuarios POR TENANT.
//   - GET:  lista los usuarios del tenant. Solo ADMIN o AUDITOR pueden verla
//           (el resto => 403). NUNCA se devuelve passwordHash.
//   - POST: alta de usuario (solo ADMIN => 403 si no). La contrasena se guarda
//           HASHEADA (scrypt, via hashPassword); jamas en claro ni se devuelve.
//           Se inserta un evento USUARIO_ALTA en la bitacora encadenada (sin
//           incluir la contrasena ni su hash en el payload).
//
// Multi-tenant (convencion DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda lectura/escritura
// tenant-scoped corre dentro de withTenantFromSession (transaccion + SET LOCAL
// app.tenant_id => la RLS de Postgres filtra por el tenant del token).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/password";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Valores EXACTOS del enum RolUsuario (prisma/schema.prisma). NO inventar.
// -----------------------------------------------------------------------------
const ROLES = ["ADMIN", "AGENTE", "OPERADOR", "AUDITOR", "AUTORIDAD"] as const;
type RolUsuario = (typeof ROLES)[number];

// -----------------------------------------------------------------------------
// Validacion del body de alta con zod (fail-closed): email valido, nombre no
// vacio, rol del enum, password de al menos 8 caracteres.
// -----------------------------------------------------------------------------
const altaSchema = z.object({
  email: z.string().trim().email("El correo no es valido"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  rol: z.enum(ROLES),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres"),
});

// Fila que devuelven GET/POST (NUNCA incluye passwordHash).
type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
};

// =============================================================================
// GET /api/usuarios — lista los usuarios del tenant (RLS filtra por el tenant
// del JWT). Solo ADMIN o AUDITOR (el resto => 403). Sin passwordHash.
// =============================================================================
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rol: unknown = (session as { user?: { rol?: unknown } } | null)?.user?.rol;
  if (rol !== "ADMIN" && rol !== "AUDITOR") {
    return NextResponse.json(
      { error: "Solo un ADMIN o AUDITOR del tenant puede ver los usuarios" },
      { status: 403 },
    );
  }

  try {
    const usuarios: UsuarioResumen[] = await withTenantFromSession(
      session,
      async (tx): Promise<UsuarioResumen[]> => {
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
          (u): UsuarioResumen => ({
            id: u.id,
            email: u.email,
            nombre: u.nombre,
            rol: u.rol as RolUsuario,
            activo: u.activo,
            creadoEn: u.creadoEn.toISOString(),
          }),
        );
      },
    );

    return NextResponse.json({ ok: true, usuarios }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los usuarios" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/usuarios — alta de usuario. Solo ADMIN (403 si no). Password
// hasheada; evento USUARIO_ALTA en bitacora encadenada. 409 si el correo ya
// existe en el tenant (@@unique [tenantId, email]).
// =============================================================================
export async function POST(req: Request): Promise<NextResponse> {
  // 0) tenantId + rol + actor del JWT verificado, NUNCA del body/params.
  const session = await getServerSession(authOptions);
  const user = (session as {
    user?: { tenantId?: unknown; rol?: unknown; email?: unknown; name?: unknown };
  } | null)?.user;
  const tenantId: unknown = user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user?.rol !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un ADMIN del tenant puede crear usuarios" },
      { status: 403 },
    );
  }
  const actor =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  // 1) Body validado con zod (400 con detalle si no cumple).
  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parseado = altaSchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      {
        error: "Body invalido",
        detalles: parseado.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { email, nombre, rol, password } = parseado.data;
  // Normaliza el correo (el login lo busca en minusculas — ver src/lib/auth.ts).
  const emailNorm = email.toLowerCase();

  try {
    const creado: UsuarioResumen = await withTenantFromSession(
      session,
      async (tx): Promise<UsuarioResumen> => {
        // 2) Alta con la contrasena HASHEADA y el tenantId del JWT.
        const u = await tx.usuario.create({
          data: {
            tenantId,
            email: emailNorm,
            nombre,
            rol,
            passwordHash: hashPassword(password),
          },
          select: {
            id: true,
            email: true,
            nombre: true,
            rol: true,
            activo: true,
            creadoEn: true,
          },
        });

        // 3) Bitacora append-only: encadenar con el sha256 del ultimo evento del
        //    tenant. Patron EXACTO del override (POST paso 6). NUNCA se incluye
        //    la contrasena ni el hash en el payload del evento.
        const previo = await tx.bitacoraAuditoria.findFirst({
          orderBy: { creadoEn: "desc" },
          select: { sha256: true },
        });
        const hashPrev: string | null = previo?.sha256 ?? null;

        const payloadEvento = canonicalizar({
          tenantId,
          accion: "USUARIO_ALTA",
          actor,
          usuarioId: u.id,
          email: u.email,
          rol: u.rol,
          activo: u.activo,
          creadoEn: u.creadoEn.toISOString(),
          hashPrev,
        });
        const eventoSha256 = sha256(payloadEvento);

        await tx.bitacoraAuditoria.create({
          data: {
            tenantId,
            actor,
            accion: "USUARIO_ALTA",
            payloadRef: `usuario:${u.id}:rol:${u.rol}`,
            sha256: eventoSha256,
            hashPrev,
          },
          select: { id: true },
        });

        return {
          id: u.id,
          email: u.email,
          nombre: u.nombre,
          rol: u.rol as RolUsuario,
          activo: u.activo,
          creadoEn: u.creadoEn.toISOString(),
        };
      },
    );

    return NextResponse.json({ ok: true, usuario: creado }, { status: 201 });
  } catch (err: unknown) {
    // Violacion de unicidad (@@unique([tenantId, email])) => correo ya usado.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo en el tenant" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear el usuario" },
      { status: 500 },
    );
  }
}
