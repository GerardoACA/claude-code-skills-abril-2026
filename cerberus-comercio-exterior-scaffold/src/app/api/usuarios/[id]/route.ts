// CERBERUS COMERCIO EXTERIOR — API de usuario (cambio de rol / activacion). NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/usuarios/[id]/route.ts  [Inc 18]
// Proposito: PATCH para cambiar el rol y/o activar/desactivar a un usuario del
//            tenant. Solo ADMIN (403 si no). Se registra un evento
//            USUARIO_ACTUALIZADO en la bitacora encadenada.
//
// Reglas de seguridad (para no quedarse sin administradores):
//   - Un ADMIN NO puede cambiar su propio rol ni desactivarse a si mismo => 400.
//   - Identificacion del "propio usuario": se compara el EMAIL del usuario
//     objetivo (leido dentro del tenant/RLS) contra session.user.email. Se elige
//     el email porque es el claim estable y unico por tenant (@@unique
//     [tenantId, email]) presente en la sesion de NextAuth; evita una consulta
//     extra por id y funciona aunque el front envie un id distinto.
//
// Multi-tenant (convencion DURA): el tenantId SIEMPRE proviene del JWT
// verificado, NUNCA del body/params. Todo corre dentro de withTenantFromSession
// (transaccion + SET LOCAL app.tenant_id => la RLS filtra por el tenant del token).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";

export const runtime = "nodejs";

// Valores EXACTOS del enum RolUsuario (prisma/schema.prisma). NO inventar.
const ROLES = ["ADMIN", "AGENTE", "OPERADOR", "AUDITOR", "AUTORIDAD"] as const;
type RolUsuario = (typeof ROLES)[number];

// Body: al menos uno de { rol, activo }. fail-closed si viene vacio.
const patchSchema = z
  .object({
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => v.rol !== undefined || v.activo !== undefined, {
    message: "Debes indicar al menos 'rol' o 'activo'",
  });

type Params = { params: Promise<{ id: string }> };

type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
};

// Discriminante del resultado de la transaccion.
type ResultadoPatch =
  | { tipo: "no-usuario" }
  | { tipo: "auto" }
  | { tipo: "ok"; usuario: UsuarioResumen };

export async function PATCH(
  req: Request,
  { params }: Params,
): Promise<NextResponse> {
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
      { error: "Solo un ADMIN del tenant puede editar usuarios" },
      { status: 403 },
    );
  }
  const emailPropio: string | null =
    typeof user?.email === "string" ? user.email.toLowerCase() : null;
  const actor =
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido";

  const { id: usuarioId } = await params;
  if (!usuarioId) {
    return NextResponse.json(
      { error: "Usuario no especificado" },
      { status: 400 },
    );
  }

  // 1) Body validado con zod (400 con detalle si no cumple).
  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parseado = patchSchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      {
        error: "Body invalido",
        detalles: parseado.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { rol, activo } = parseado.data;

  let salida: ResultadoPatch;
  try {
    salida = await withTenantFromSession(
      session,
      async (tx): Promise<ResultadoPatch> => {
        // 2) Verificar que el usuario existe en el tenant (RLS + fail-closed).
        const objetivo = await tx.usuario.findFirst({
          where: { id: usuarioId },
          select: { id: true, email: true },
        });
        if (!objetivo) {
          return { tipo: "no-usuario" };
        }

        // 3) Un ADMIN no puede auto-degradarse ni desactivarse. Se compara el
        //    email del objetivo contra el propio (para no quedarse sin admins).
        const esUnoMismo =
          emailPropio !== null && objetivo.email.toLowerCase() === emailPropio;
        if (esUnoMismo && (rol !== undefined || activo === false)) {
          return { tipo: "auto" };
        }

        // 4) Aplicar el update (solo campos presentes en el body).
        const u = await tx.usuario.update({
          where: { id: objetivo.id },
          data: {
            ...(rol !== undefined ? { rol } : {}),
            ...(activo !== undefined ? { activo } : {}),
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

        // 5) Bitacora append-only encadenada (patron EXACTO del override).
        const previo = await tx.bitacoraAuditoria.findFirst({
          orderBy: { creadoEn: "desc" },
          select: { sha256: true },
        });
        const hashPrev: string | null = previo?.sha256 ?? null;

        const payloadEvento = canonicalizar({
          tenantId,
          accion: "USUARIO_ACTUALIZADO",
          actor,
          usuarioId: u.id,
          email: u.email,
          rol: u.rol,
          activo: u.activo,
          hashPrev,
        });
        const eventoSha256 = sha256(payloadEvento);

        await tx.bitacoraAuditoria.create({
          data: {
            tenantId,
            actor,
            accion: "USUARIO_ACTUALIZADO",
            payloadRef: `usuario:${u.id}:rol:${u.rol}:activo:${u.activo}`,
            sha256: eventoSha256,
            hashPrev,
          },
          select: { id: true },
        });

        return {
          tipo: "ok",
          usuario: {
            id: u.id,
            email: u.email,
            nombre: u.nombre,
            rol: u.rol as RolUsuario,
            activo: u.activo,
            creadoEn: u.creadoEn.toISOString(),
          },
        };
      },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar el usuario" },
      { status: 500 },
    );
  }

  if (salida.tipo === "no-usuario") {
    return NextResponse.json(
      { error: "Usuario no encontrado para este tenant" },
      { status: 404 },
    );
  }
  if (salida.tipo === "auto") {
    return NextResponse.json(
      {
        error:
          "No puedes cambiar tu propio rol ni desactivar tu cuenta (para no dejar al tenant sin administrador).",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, usuario: salida.usuario }, { status: 200 });
}
