// =============================================================================
// PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0)
// NO ES PARA: cerberus-sidf-mp. Esta capa es del producto nuevo.
// -----------------------------------------------------------------------------
// Archivo:  03-prisma-tenant-context.ts
// Propósito: Setear `app.tenant_id` POR TRANSACCIÓN, derivado del tenant_id que
//            ya fue VALIDADO contra el JWT, para que las políticas RLS de
//            01-enable-rls-policies.sql apliquen. La app NUNCA confía en un
//            tenant_id enviado por el cliente: solo en el del token verificado.
//
// Fundamento:
//   - diseno-v2-cerberus.md §5 Fase 0 punto 3: "tenant_id validado contra token".
//   - informe-reconciliacion.md §2.6: hoy el aislamiento es solo de aplicación;
//     este archivo es el puente entre el JWT y la RLS de Postgres.
//
// Principio clave (defensa en profundidad):
//   - RLS en Postgres es la garantía ESTRUCTURAL (aunque el dev olvide un WHERE).
//   - Esta capa solo INYECTA el contexto correcto; no es la única defensa.
//   - SET LOCAL ata el GUC al ámbito de la TRANSACCIÓN: al terminar la
//     transacción, app.tenant_id se descarta. Esto es esencial con pools de
//     conexiones (PgBouncer/Prisma pool): el valor NO se filtra a la siguiente
//     petición que reuse la conexión.
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";

// -----------------------------------------------------------------------------
// 1. Extracción y VALIDACIÓN del tenant desde el JWT.
//    El tenant_id se toma EXCLUSIVAMENTE del claim del token verificado.
//    Nunca de headers crudos, query params ni del body del request.
// -----------------------------------------------------------------------------

const TenantClaim = z.object({
  // El claim que el IdP/NextAuth firma. Ajustar el nombre al de tu JWT.
  tenant_id: z.string().uuid(),
});

/**
 * Deriva el tenant_id confiable a partir de la sesión/token YA VERIFICADO.
 * `verifiedToken` debe venir de una verificación criptográfica de firma del JWT
 * (p. ej. el callback `jwt`/`session` de NextAuth, o jose.jwtVerify).
 * Lanza si el token no trae un tenant_id válido => fail-closed (no se abre TX).
 */
export function tenantIdFromVerifiedToken(verifiedToken: unknown): string {
  const parsed = TenantClaim.safeParse(verifiedToken);
  if (!parsed.success) {
    throw new TenantContextError(
      "El token verificado no contiene un tenant_id válido (claim ausente o mal formado)."
    );
  }
  return parsed.data.tenant_id;
}

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

// -----------------------------------------------------------------------------
// 2. Cliente Prisma base. La cadena DATABASE_URL DEBE apuntar al rol
//    `cerberus_ce_app` (SIN BYPASSRLS, ver 02-app-role.sql).
// -----------------------------------------------------------------------------
export const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 3. runInTenantContext: abre una transacción, setea app.tenant_id con SET LOCAL
//    y ejecuta el callback con un cliente transaccional. Toda query del callback
//    queda sujeta a la RLS filtrada por ese tenant.
//
//    SET LOCAL solo es válido dentro de una transacción; por eso envolvemos en
//    prisma.$transaction. El valor se descarta al COMMIT/ROLLBACK.
//
//    Se usa set_config(..., true) en lugar de `SET LOCAL` con interpolación
//    para PARAMETRIZAR el valor y evitar inyección por SQL en el GUC.
//    El tercer argumento `true` = is_local => equivale a SET LOCAL.
// -----------------------------------------------------------------------------
export async function runInTenantContext<T>(
  tenantId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
    // Defensa adicional: el tenantId debe ser un UUID. Nunca un valor arbitrario.
    throw new TenantContextError("tenantId no es un UUID válido.");
  }

  return prisma.$transaction(async (tx) => {
    // Setea el contexto de tenant SOLO para esta transacción (is_local = true).
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    // Cinturón y tirantes: confirmar que el GUC quedó seteado al valor esperado
    // antes de ejecutar trabajo. Si por algún motivo no se aplicó, abortamos.
    const rows = await tx.$queryRaw<{ tenant: string | null }[]>`
      SELECT current_setting('app.tenant_id', true) AS tenant
    `;
    if (rows[0]?.tenant !== tenantId) {
      throw new TenantContextError(
        "No se pudo fijar app.tenant_id en la transacción (contexto RLS ausente)."
      );
    }

    return work(tx);
  });
}

// -----------------------------------------------------------------------------
// 4. Azúcar para rutas: deriva el tenant del token verificado y corre el trabajo
//    dentro del contexto. Úsese en cada handler de API / server action.
//
//    Ejemplo de uso en una ruta Next.js (App Router):
//
//      import { withTenant, prisma } from "@/lib/rls/prisma-tenant-context";
//
//      export async function GET(req: Request) {
//        const session = await auth();            // verifica el JWT
//        const operaciones = await withTenant(session?.token, (tx) =>
//          tx.operacion.findMany()                // RLS filtra por tenant solo
//        );
//        return Response.json(operaciones);
//      }
// -----------------------------------------------------------------------------
export async function withTenant<T>(
  verifiedToken: unknown,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const tenantId = tenantIdFromVerifiedToken(verifiedToken);
  return runInTenantContext(tenantId, work);
}

// -----------------------------------------------------------------------------
// 5. NOTAS DE OPERACIÓN
//
//  (a) Pooling: con PgBouncer en modo `transaction` o el pool de Prisma, SET LOCAL
//      es seguro porque vive y muere con la transacción. NO usar SET (sin LOCAL):
//      ese valor persistiría en la conexión del pool y se filtraría a otro tenant.
//
//  (b) Nunca exponer un endpoint que reciba tenant_id del cliente y lo pase a
//      runInTenantContext. El tenant_id SIEMPRE proviene del token verificado.
//
//  (c) Operaciones administrativas legítimas que crucen tenants (p. ej. el portal
//      de autoridad con RequerimientoAutoridad) NO deben usar BYPASSRLS. Deben
//      modelarse con su propio scoping (entidad RequerimientoAutoridad del v2 §3)
//      y, si necesitan abarcar varios tenants, hacerlo iterando contexto por
//      tenant autorizado — nunca evadiendo RLS.
//
//  (d) Migraciones/seed corren con el rol owner/migrator, NO con cerberus_ce_app.
// =============================================================================
// FIN 03-prisma-tenant-context.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
