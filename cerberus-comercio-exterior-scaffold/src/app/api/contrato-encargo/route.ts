// CERBERUS COMERCIO EXTERIOR — API Contrato de Encargo LFPDPPP. NO es SIDF.
// =============================================================================
// Archivo:  src/app/api/contrato-encargo/route.ts  [Agente API-17, Inc 17]
// Proposito:
//   POST -> Genera y VERSIONA un Contrato de Encargo de tratamiento (art. 36
//           LFPDPPP; arts. 50-55 del Reglamento). El cuerpo se DERIVA de forma
//           determinista de los datos del tenant (ver @/lib/contrato-encargo) y
//           se sella con SHA-256: el texto no se persiste, el hash lo ancla y es
//           regenerable/verificable por un perito. Solo rol ADMIN puede crear.
//           El acto queda encadenado en BitacoraAuditoria
//           (accion "CONTRATO_ENCARGO_GENERADO").
//   GET  -> Lista los contratos del tenant (fechas serializadas a ISO).
//
// Multi-tenant (convencion DURA del blueprint): el tenantId SIEMPRE proviene del
// JWT verificado (NextAuth), NUNCA del body/params. Toda lectura/escritura
// tenant-scoped corre dentro de withTenantFromSession (transaccion + RLS).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { canonicalizar } from "@/lib/probatoria/hash-chain";
import {
  generarCuerpoContrato,
  selloContrato,
  type DatosContrato,
} from "@/lib/contrato-encargo";

export const runtime = "nodejs";

// -----------------------------------------------------------------------------
// Validacion del body con zod (fail-closed): version obligatoria, instrucciones
// con contenido real (min 20 chars), subencargados/vigenteHasta opcionales.
// -----------------------------------------------------------------------------
const bodySchema = z.object({
  version: z.string().trim().min(1, "La version es obligatoria"),
  instrucciones: z
    .string()
    .trim()
    .min(20, "Las instrucciones son obligatorias y deben tener al menos 20 caracteres"),
  subencargados: z.string().trim().min(1).optional(),
  vigenteHasta: z
    .string()
    .datetime({ message: "vigenteHasta debe ser una fecha ISO 8601" })
    .optional(),
});

// Actor legible para atribucion (email o nombre del token verificado).
function actorDeSesion(session: unknown): string {
  const user = (session as { user?: { email?: unknown; name?: unknown } } | null)
    ?.user;
  return (
    (typeof user?.email === "string" && user.email) ||
    (typeof user?.name === "string" && user.name) ||
    "desconocido"
  );
}

// Fila que devuelve el GET (sin exponer objetos Prisma crudos).
type ContratoResumen = {
  id: string;
  version: string;
  instrucciones: string;
  subencargados: string | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
  sha256: string | null;
  creado: string;
};

// Discriminante del resultado de la transaccion del POST.
type ResultadoPost =
  | { tipo: "sin-tenant" }
  | {
      tipo: "ok";
      contrato: {
        id: string;
        version: string;
        sha256: string;
        vigenteDesde: string;
      };
      cuerpo: string;
    };

// =============================================================================
// POST /api/contrato-encargo — genera, sella y versiona el contrato (solo ADMIN).
// =============================================================================
export async function POST(req: Request): Promise<NextResponse> {
  // 0) tenantId + rol + actor del JWT verificado, NUNCA del body.
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const rol: unknown = (session as { user?: { rol?: unknown } } | null)?.user?.rol;
  if (rol !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede generar el Contrato de Encargo" },
      { status: 403 },
    );
  }
  const actor = actorDeSesion(session);

  // 1) Body validado con zod (400 con detalle si no cumple).
  let bodyCrudo: unknown;
  try {
    bodyCrudo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parseado = bodySchema.safeParse(bodyCrudo);
  if (!parseado.success) {
    return NextResponse.json(
      {
        error: "Body invalido",
        detalles: parseado.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { version, instrucciones, subencargados, vigenteHasta } = parseado.data;

  let salida: ResultadoPost;
  try {
    salida = await withTenantFromSession(session, async (tx): Promise<ResultadoPost> => {
      // 2) Cargar el tenant (nombre + rfc) para derivar el cuerpo del contrato.
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId },
        select: { nombre: true, rfc: true },
      });
      if (!tenant) {
        return { tipo: "sin-tenant" };
      }

      // 3) Datos deterministas del contrato. vigenteDesde = ahora (ISO estable).
      const vigenteDesde = new Date();
      const datos: DatosContrato = {
        nombreTenant: tenant.nombre,
        rfcTenant: tenant.rfc,
        version,
        instrucciones,
        subencargados,
        vigenteDesde: vigenteDesde.toISOString(),
      };
      // 4) Derivar cuerpo + sello. El texto NO se persiste; el sha256 lo ancla.
      const cuerpo = generarCuerpoContrato(datos);
      const sello = selloContrato(datos);

      // 5) Crear el ContratoEncargo. La unique [tenantId, version] se traduce a
      //    409 arriba (Prisma P2002).
      const contrato = await tx.contratoEncargo.create({
        data: {
          tenantId,
          version,
          instrucciones,
          subencargados: subencargados ?? null,
          vigenteDesde,
          vigenteHasta: vigenteHasta !== undefined ? new Date(vigenteHasta) : null,
          sha256: sello,
        },
        select: { id: true, version: true, sha256: true, vigenteDesde: true },
      });

      // 6) Bitacora append-only: encadenar con el sha256 del ultimo evento del
      //    tenant (lectura + insert atomicos en la transaccion). Patron EXACTO
      //    del override (src/app/api/clientes/[id]/override/route.ts).
      const previo = await tx.bitacoraAuditoria.findFirst({
        orderBy: { creadoEn: "desc" },
        select: { sha256: true },
      });
      const hashPrev: string | null = previo?.sha256 ?? null;

      const payloadEvento = canonicalizar({
        tenantId,
        accion: "CONTRATO_ENCARGO_GENERADO",
        actor,
        contratoId: contrato.id,
        version: contrato.version,
        contratoSha256: sello,
        vigenteDesde: vigenteDesde.toISOString(),
        hashPrev,
      });
      const eventoSha256 = sha256(payloadEvento);

      await tx.bitacoraAuditoria.create({
        data: {
          tenantId,
          actor,
          accion: "CONTRATO_ENCARGO_GENERADO",
          payloadRef: `contrato-encargo:${contrato.id}:version:${contrato.version}`,
          sha256: eventoSha256,
          hashPrev,
          creadoEn: vigenteDesde,
        },
        select: { id: true },
      });

      return {
        tipo: "ok",
        contrato: {
          id: contrato.id,
          version: contrato.version,
          sha256: sello,
          vigenteDesde: contrato.vigenteDesde.toISOString(),
        },
        cuerpo,
      };
    });
  } catch (e) {
    // Violacion de unique [tenantId, version] => 409 con mensaje claro.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        {
          error: `Ya existe un Contrato de Encargo con la version "${version}" para este tenant. Usa una etiqueta de version distinta.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo generar el Contrato de Encargo" },
      { status: 500 },
    );
  }

  if (salida.tipo === "sin-tenant") {
    return NextResponse.json(
      { error: "No se encontro el tenant de la sesion" },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { ok: true, contrato: salida.contrato, cuerpo: salida.cuerpo },
    { status: 201 },
  );
}

// =============================================================================
// GET /api/contrato-encargo — lista los contratos del tenant (fechas ISO).
// =============================================================================
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let contratos: ContratoResumen[];
  try {
    contratos = await withTenantFromSession(
      session,
      async (tx): Promise<ContratoResumen[]> => {
        const filas = await tx.contratoEncargo.findMany({
          orderBy: { vigenteDesde: "desc" },
          select: {
            id: true,
            version: true,
            instrucciones: true,
            subencargados: true,
            vigenteDesde: true,
            vigenteHasta: true,
            sha256: true,
          },
        });
        return filas.map(
          (f): ContratoResumen => ({
            id: f.id,
            version: f.version,
            instrucciones: f.instrucciones,
            subencargados: f.subencargados,
            vigenteDesde: f.vigenteDesde.toISOString(),
            vigenteHasta: f.vigenteHasta ? f.vigenteHasta.toISOString() : null,
            sha256: f.sha256,
            creado: f.vigenteDesde.toISOString(),
          }),
        );
      },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudieron consultar los contratos de encargo" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, contratos }, { status: 200 });
}
