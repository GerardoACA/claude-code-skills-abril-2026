// CERBERUS COMERCIO EXTERIOR — API cuestionario KYC 1.4.14. NO es SIDF.
// ============================================================================
// Route handler (Next.js App Router) que crea/actualiza el ExpedienteKyc1414 de
// un Cliente a partir del cuestionario del expediente 1.4.14 (Regla 1.4.14 del
// CFF: identificación y conocimiento del cliente / materialidad de operaciones)
// y REGISTRA un Documento con SELLO SHA-256 como prueba del cuestionario capturado.
//
// Convenciones DURAS del blueprint:
//  - Multi-tenant: el tenantId SIEMPRE proviene del JWT verificado (NextAuth),
//    NUNCA del body ni de la ruta. Toda escritura corre dentro de
//    withTenantFromSession (abre transacción + SET LOCAL app.tenant_id => la RLS
//    de Postgres filtra por el tenant del token).
//  - El schema (Agente B) NO tiene columnas libres para el cuerpo del cuestionario;
//    por eso el contenido capturado se serializa de forma canónica y se sella como
//    un Documento (sha256 hex de @/lib/probatoria/hash) ligado al expediente KYC.
//    El expediente en sí solo guarda custodio + plazo de retención (retieneHasta).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withTenantFromSession } from "@/lib/tenant-context";
import { sha256 } from "@/lib/probatoria/hash";
import { proximaActualizacionKyc } from "@/lib/kyc-vigencia";

export const runtime = "nodejs";

/** Serialización canónica y estable (claves ordenadas) para sellar. */
function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// Retención del expediente KYC 1414: ~3 años (art. 1414 CCom, plazo propio).
const RETENCION_ANIOS_KYC = 3;

// ---------------------------------------------------------------------------
// [Inc 44] Validación zod del cuestionario 1.4.14. Los campos nuevos (auditoría
// 1.4.14) son OPCIONALES al leer/parsear expedientes viejos, pero al SELLAR se
// exigen condicionalmente en superRefine: identificación del representante
// legal solo si persona MORAL; id fiscal extranjero solo si residencia
// EXTRANJERO. No hay columnas dedicadas: todo se sella en el JSON del Documento.
// ---------------------------------------------------------------------------
const datosGeneralesSchema = z.object({
  // Tipo de persona del cliente (default MORAL: compatibilidad con envíos viejos).
  tipoPersona: z.enum(["FISICA", "MORAL"]).default("MORAL"),
  nombreComercial: z.string().optional(),
  // Representante legal (aplica solo a persona MORAL).
  representanteLegal: z.string().optional(),
  repLegalTipoIdentificacion: z.enum(["INE", "PASAPORTE", "CEDULA", "OTRO"]).optional(),
  repLegalNumeroIdentificacion: z
    .string()
    .trim()
    .min(4, "El número de identificación del representante debe tener al menos 4 caracteres")
    .max(30, "El número de identificación del representante no puede exceder 30 caracteres")
    .optional(),
  // Fecha del poder notarial del representante (opcional, formato AAAA-MM-DD).
  repLegalPoderFecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha del poder debe tener formato AAAA-MM-DD")
    .optional(),
  // Residencia fiscal (default MEXICO: compatibilidad con envíos viejos).
  residenciaFiscal: z.enum(["MEXICO", "EXTRANJERO"]).default("MEXICO"),
  idFiscalExtranjero: z
    .string()
    .trim()
    .min(4, "El ID fiscal extranjero debe tener al menos 4 caracteres")
    .max(40, "El ID fiscal extranjero no puede exceder 40 caracteres")
    .optional(),
  paisResidencia: z
    .string()
    .trim()
    .min(2, "El país de residencia debe tener al menos 2 caracteres")
    .max(60, "El país de residencia no puede exceder 60 caracteres")
    .optional(),
  correoContacto: z.string().optional(),
  telefonoContacto: z.string().optional(),
  actividadEconomica: z.string().optional(),
});

const cuestionarioSchema = z
  .object({
    // (1) Datos generales
    datosGenerales: datosGeneralesSchema,
    // (2) Materialidad e infraestructura (contratos, domicilio de operaciones CE)
    materialidad: z.object({
      domicilioOperacionesCE: z.string().optional(),
      tieneContratos: z.boolean().optional(),
      descripcionContratos: z.string().optional(),
      tieneInfraestructura: z.boolean().optional(),
      descripcionInfraestructura: z.string().optional(),
      numeroEmpleados: z.string().optional(),
    }),
    // (3) Manifestación de integridad (art. 69-B CFF — no EFOS)
    integridad: z.object({
      // Declaración bajo protesta de decir verdad: no tener vínculos con EFOS.
      declaraNoEfos: z.boolean(),
      nombreDeclarante: z.string().optional(),
    }),
    // Custodio responsable del expediente (opcional; si no, el usuario de sesión).
    custodio: z.string().optional(),
  })
  .superRefine((b, ctx) => {
    const dg = b.datosGenerales;
    // Persona MORAL: la identificación del representante legal es obligatoria al sellar.
    if (dg.tipoPersona === "MORAL") {
      if (!dg.repLegalTipoIdentificacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["datosGenerales", "repLegalTipoIdentificacion"],
          message: "Persona moral: indique el tipo de identificación del representante legal",
        });
      }
      if (!dg.repLegalNumeroIdentificacion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["datosGenerales", "repLegalNumeroIdentificacion"],
          message: "Persona moral: indique el número de identificación del representante legal",
        });
      }
    }
    // Residencia EXTRANJERO: id fiscal y país de residencia obligatorios al sellar.
    if (dg.residenciaFiscal === "EXTRANJERO") {
      if (!dg.idFiscalExtranjero) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["datosGenerales", "idFiscalExtranjero"],
          message: "Residencia extranjera: indique el ID fiscal del país de residencia",
        });
      }
      if (!dg.paisResidencia) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["datosGenerales", "paisResidencia"],
          message: "Residencia extranjera: indique el país de residencia",
        });
      }
    }
  });

type Resultado =
  | {
      tipo: "ok";
      expedienteId: string;
      documentoId: string;
      sha256: string;
      timestamp: string;
    }
  | { tipo: "cliente-inexistente" };

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // 0) tenantId del JWT verificado, NUNCA del body/ruta (convención DURA).
  const session = await getServerSession(authOptions);
  const tenantId: unknown = (session as { user?: { tenantId?: unknown } } | null)
    ?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // El clienteId viene de la ruta (segmento dinámico); en Next 15 params es async.
  const { id: clienteId } = await context.params;
  if (!clienteId) {
    return NextResponse.json({ error: "Falta el id del cliente" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!esCuestionarioValido(body)) {
    return NextResponse.json(
      { error: "Cuestionario incompleto o mal formado" },
      { status: 400 },
    );
  }

  // La manifestación de integridad (art. 69-B) es obligatoria para sellar.
  if (!body.integridad.declaraNoEfos) {
    return NextResponse.json(
      {
        error:
          "Debe manifestar bajo protesta de decir verdad no tener vínculos con EFOS (art. 69-B CFF)",
      },
      { status: 422 },
    );
  }

  const custodioSesion: string =
    session?.user?.email ?? session?.user?.name ?? "desconocido";

  let resultado: Resultado;
  try {
    resultado = await withTenantFromSession(session, async (tx): Promise<Resultado> => {
      // 1) El cliente debe existir dentro del tenant (RLS lo limita al tenant).
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId },
        select: { id: true, rfc: true, razonSocial: true },
      });
      if (!cliente) {
        return { tipo: "cliente-inexistente" };
      }

      const ahora = new Date();
      const retieneHasta = new Date(ahora);
      retieneHasta.setFullYear(retieneHasta.getFullYear() + RETENCION_ANIOS_KYC);
      const custodio = body.custodio?.trim() || custodioSesion;

      // 2) Crear/actualizar el ExpedienteKyc1414 (1:1 con Cliente por clienteId único).
      const expediente = await tx.expedienteKyc1414.upsert({
        where: { clienteId: cliente.id },
        create: {
          tenantId,
          clienteId: cliente.id,
          custodio,
          retieneHasta,
        },
        update: {
          custodio,
          retieneHasta,
        },
        select: { id: true },
      });

      // 3) Sello probatorio SHA-256 del cuestionario capturado. Como el schema no
      //    tiene columnas libres para el cuerpo, se sella el payload canónico y se
      //    guarda como Documento ligado al expediente (evidencia preliminar).
      const payloadSellado = {
        tenantId,
        clienteId: cliente.id,
        rfc: cliente.rfc,
        razonSocial: cliente.razonSocial,
        datosGenerales: body.datosGenerales,
        materialidad: body.materialidad,
        integridad: body.integridad,
        custodio,
        capturadoEn: ahora.toISOString(),
      };
      const selloSha256 = sha256(canonical(payloadSellado));

      const documento = await tx.documento.create({
        data: {
          tenantId,
          tipo: "CUESTIONARIO_KYC_1414",
          sha256: selloSha256,
          expedienteKycId: expediente.id,
          vence: retieneHasta,
        },
        select: { id: true, creadoEn: true },
      });

      return {
        tipo: "ok",
        expedienteId: expediente.id,
        documentoId: documento.id,
        sha256: selloSha256,
        timestamp: documento.creadoEn.toISOString(),
      };
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo registrar el cuestionario KYC" },
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
    {
      ok: true,
      expedienteId: resultado.expedienteId,
      documentoId: resultado.documentoId,
      sha256: resultado.sha256,
      timestamp: resultado.timestamp,
    },
    { status: 201 },
  );
}
