// CERBERUS COMERCIO EXTERIOR — API de Clientes/Importadores. NO es SIDF.
// ============================================================================
// Route handler (Next.js App Router) para ALTA y LISTADO de Cliente/Importador.
//
// Multi-tenant (convención DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado de la sesión (NextAuth), NUNCA del body/query del request. Toda
// escritura/lectura tenant-scoped corre dentro de withTenantFromSession (abre
// transacción + SET LOCAL app.tenant_id => la RLS de Postgres filtra por tenant).
//
// Campos reales del modelo Cliente (prisma/schema.prisma): rfc, razonSocial,
// estadoCsd (EstadoCsd @default ACTIVO), etapa69b (Etapa69b @default NINGUNA).
// NOTA: el "domicilio de operaciones de comercio exterior" se recibe como texto
// libre para la UX del alta, pero el schema de Cliente NO tiene un campo para
// persistirlo (y no se toca el schema en este incremento). Por eso se valida y se
// descarta explícitamente aquí; cuando exista el campo, este es el punto de enganche.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";

export const runtime = "nodejs";

// Validación de entrada del alta. Solo se exige lo mínimo del modelo real.
const AltaClienteSchema = z.object({
  rfc: z
    .string()
    .trim()
    .min(12, "El RFC debe tener entre 12 y 13 caracteres")
    .max(13, "El RFC debe tener entre 12 y 13 caracteres")
    .transform((v: string): string => v.toUpperCase()),
  razonSocial: z
    .string()
    .trim()
    .min(1, "La razón social es obligatoria")
    .max(400, "La razón social es demasiado larga"),
  // Texto libre; no se persiste (ver nota de cabecera). Opcional.
  domicilioOperacionesCE: z
    .string()
    .trim()
    .max(1000, "El domicilio es demasiado largo")
    .optional(),
});

type AltaCliente = z.infer<typeof AltaClienteSchema>;

/** Forma de la fila devuelta al cliente tras el alta / en el listado. */
type ClienteResumen = {
  id: string;
  rfc: string;
  razonSocial: string;
  estadoCsd: string;
  etapa69b: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  // 0) tenantId del JWT verificado, NUNCA del body (convención DURA del blueprint).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 1) Parseo del JSON del body (defensivo).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 2) Validación con zod.
  const parsed = AltaClienteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", detalles: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const datos: AltaCliente = parsed.data;

  // 3) Alta tenant-scoped. estadoCsd/etapa69b usan los @default del schema
  //    (ACTIVO / NINGUNA); no se envían para respetar los valores por defecto.
  //    El domicilio (texto libre) NO se persiste: el modelo Cliente no lo tiene.
  try {
    const creado: ClienteResumen = await withTenantFromSession(
      session,
      async (tx): Promise<ClienteResumen> => {
        return tx.cliente.create({
          data: {
            tenantId,
            rfc: datos.rfc,
            razonSocial: datos.razonSocial,
          },
          select: {
            id: true,
            rfc: true,
            razonSocial: true,
            estadoCsd: true,
            etapa69b: true,
          },
        });
      },
    );

    return NextResponse.json({ ok: true, cliente: creado }, { status: 201 });
  } catch (err: unknown) {
    // Violación de unicidad (@@unique([tenantId, rfc])) => RFC ya registrado.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese RFC en este tenant" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo registrar el cliente" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)?.user
    ?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const clientes: ClienteResumen[] = await withTenantFromSession(
      session,
      async (tx): Promise<ClienteResumen[]> => {
        return tx.cliente.findMany({
          select: {
            id: true,
            rfc: true,
            razonSocial: true,
            estadoCsd: true,
            etapa69b: true,
          },
          orderBy: { razonSocial: "asc" },
        });
      },
    );

    return NextResponse.json({ ok: true, clientes }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron listar los clientes" },
      { status: 500 },
    );
  }
}
