// CERBERUS COMERCIO EXTERIOR — API Encargo Conferido (B14/B21). NO es SIDF.
// ============================================================================
// Route handler (Next.js App Router) que crea un EncargoConferido para un
// Cliente a partir del formulario de alta (tipo B14/B21, vigencia).
//
// Convenciones DURAS del blueprint:
//  - Multi-tenant: el tenantId SIEMPRE proviene del JWT verificado (NextAuth),
//    NUNCA del body ni de la ruta. Toda escritura corre dentro de
//    withTenantFromSession (abre transacción + SET LOCAL app.tenant_id => la RLS
//    de Postgres filtra por el tenant del token).
//
// Campos REALES del modelo EncargoConferido (prisma/schema.prisma):
//   tipo (String), estado (EstadoEncargo @default VIGENTE), vigenciaInicio
//   (DateTime), vigenciaFin (DateTime?), aceptacionAgente (Boolean @default
//   false), efirmaCliente (String?), clienteId, tenantId. El estado usa el
//   @default VIGENTE del schema: no se envía en el alta.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

export const runtime = "nodejs";

// Validación de entrada del alta. Fechas como cadena (date input) => se parsean
// a Date. El estado NO se acepta del cliente: usa el @default VIGENTE del schema.
const AltaEncargoSchema = z
  .object({
    // Tipo/formato del aviso de encargo conferido.
    tipo: z.enum(["B14", "B21"]),
    // Vigencia inicio (obligatoria). Acepta "YYYY-MM-DD" o ISO completo.
    vigenciaInicio: z
      .string()
      .trim()
      .min(1, "La fecha de inicio de vigencia es obligatoria"),
    // Vigencia fin (opcional).
    vigenciaFin: z.string().trim().min(1).optional(),
    aceptacionAgente: z.boolean().optional(),
    // Firma electrónica del cliente que confiere el encargo (opcional).
    efirmaCliente: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    const inicio = new Date(val.vigenciaInicio);
    if (Number.isNaN(inicio.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vigenciaInicio"],
        message: "Fecha de inicio inválida",
      });
    }
    if (val.vigenciaFin !== undefined) {
      const fin = new Date(val.vigenciaFin);
      if (Number.isNaN(fin.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vigenciaFin"],
          message: "Fecha de fin inválida",
        });
      } else if (!Number.isNaN(inicio.getTime()) && fin < inicio) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vigenciaFin"],
          message: "La fecha de fin no puede ser anterior a la de inicio",
        });
      }
    }
  });

type AltaEncargo = z.infer<typeof AltaEncargoSchema>;

/** Forma de la fila devuelta al cliente tras el alta. */
type EncargoResumen = {
  id: string;
  tipo: string;
  estado: string;
  vigenciaInicio: string;
  vigenciaFin: string | null;
};

type Resultado =
  | { tipo: "ok"; encargo: EncargoResumen }
  | { tipo: "cliente-inexistente" };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA del body/ruta (convención DURA).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // El clienteId viene de la ruta (segmento dinámico); en Next 16 params es Promise.
  const { id: clienteId } = await context.params;
  if (!clienteId) {
    return NextResponse.json({ error: "Falta el id del cliente" }, { status: 400 });
  }

  // 1) Parseo del JSON del body (defensivo).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 2) Validación con zod.
  const parsed = AltaEncargoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const datos: AltaEncargo = parsed.data;

  const vigenciaInicio = new Date(datos.vigenciaInicio);
  const vigenciaFin =
    datos.vigenciaFin !== undefined ? new Date(datos.vigenciaFin) : null;

  // 3) Alta tenant-scoped. estado usa el @default VIGENTE del schema (no se envía).
  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(
      session,
      async (tx): Promise<Resultado> => {
        // El cliente debe existir dentro del tenant (RLS lo limita al tenant).
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteId },
          select: { id: true },
        });
        if (!cliente) {
          return { tipo: "cliente-inexistente" };
        }

        const encargo = await tx.encargoConferido.create({
          data: {
            tenantId,
            clienteId: cliente.id,
            tipo: datos.tipo,
            vigenciaInicio,
            vigenciaFin,
            aceptacionAgente: datos.aceptacionAgente ?? false,
            efirmaCliente: datos.efirmaCliente,
          },
          select: {
            id: true,
            tipo: true,
            estado: true,
            vigenciaInicio: true,
            vigenciaFin: true,
          },
        });

        return {
          tipo: "ok",
          encargo: {
            id: encargo.id,
            tipo: encargo.tipo,
            estado: encargo.estado,
            vigenciaInicio: encargo.vigenciaInicio.toISOString(),
            vigenciaFin: encargo.vigenciaFin
              ? encargo.vigenciaFin.toISOString()
              : null,
          },
        };
      },
    );
  } catch (err: unknown) {
    // FK inválida (cliente de otro tenant filtrado por RLS, etc.).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "Cliente no válido para este tenant" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo registrar el encargo conferido" },
      { status: 500 },
    );
  }

  if (resultado.tipo === "cliente-inexistente") {
    return NextResponse.json(
      { error: "Cliente no encontrado para este tenant" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { ok: true, encargo: resultado.encargo },
    { status: 201 },
  );
}
