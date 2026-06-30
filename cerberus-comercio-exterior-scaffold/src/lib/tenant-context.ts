// CERBERUS COMERCIO EXTERIOR — contexto de tenant (RLS por transaccion). NO es SIDF.
// =============================================================================
// Archivo:  src/lib/tenant-context.ts
// Proposito: Setear `app.tenant_id` POR TRANSACCION, derivado del tenant_id que
//            YA fue validado contra el JWT (ver src/lib/auth.ts), para que las
//            politicas RLS de prisma/sql/01-enable-rls-policies.sql apliquen.
//            La app NUNCA confia en un tenant_id del body/query/headers: solo en
//            el del token verificado (convenciones DURAS del _BLUEPRINT.md).
//
// Principio (defensa en profundidad):
//   - RLS en Postgres es la garantia ESTRUCTURAL (aunque el dev olvide un WHERE).
//   - Esta capa solo INYECTA el contexto correcto; no es la unica defensa.
//   - SET LOCAL ata el GUC al ambito de la TRANSACCION: al COMMIT/ROLLBACK,
//     app.tenant_id se descarta. Esto es esencial con pools de conexiones
//     (PgBouncer/pool de Prisma): el valor NO se filtra a la siguiente peticion
//     que reuse la conexion.
// =============================================================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Error de contexto de tenant. Lanzarlo aborta la transaccion => fail-closed. */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

// -----------------------------------------------------------------------------
// Validacion del tenantId.
//   El blueprint declara `tenantId String` (no necesariamente UUID; Prisma suele
//   emitir cuid()). Aceptamos un identificador "seguro": cadena no vacia con un
//   conjunto acotado de caracteres. Esto evita valores arbitrarios/peligrosos.
//   La parametrizacion via set_config (abajo) ya impide inyeccion SQL; este check
//   es defensa adicional para rechazar entradas absurdas temprano.
// -----------------------------------------------------------------------------
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function assertTenantId(tenantId: unknown): asserts tenantId is string {
  if (typeof tenantId !== "string" || !TENANT_ID_RE.test(tenantId)) {
    throw new TenantContextError(
      "tenantId ausente o con formato invalido (debe provenir del JWT verificado)."
    );
  }
}

// -----------------------------------------------------------------------------
// withTenant: abre una transaccion Prisma, fija app.tenant_id con SET LOCAL
// (via set_config local) y ejecuta `fn` con un cliente transaccional. Toda query
// dentro de `fn` queda sujeta a la RLS filtrada por ese tenant.
//
// - set_config('app.tenant_id', <valor>, true): el 3er argumento true = is_local
//   => equivale a SET LOCAL (vive y muere con la transaccion). Se PARAMETRIZA el
//   valor para evitar inyeccion en el GUC.
// - Cinturon y tirantes: se reconfirma que el GUC quedo seteado antes de ejecutar
//   trabajo; si no se aplico, se aborta (fail-closed).
// -----------------------------------------------------------------------------
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  assertTenantId(tenantId);

  return prisma.$transaction(async (tx) => {
    // Fija el contexto de tenant SOLO para esta transaccion (is_local = true).
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    // Verifica que el GUC quedo en el valor esperado antes de ejecutar trabajo.
    const rows = await tx.$queryRaw<{ tenant: string | null }[]>`
      SELECT current_setting('app.tenant_id', true) AS tenant
    `;
    if (rows[0]?.tenant !== tenantId) {
      throw new TenantContextError(
        "No se pudo fijar app.tenant_id en la transaccion (contexto RLS ausente)."
      );
    }

    return fn(tx);
  });
}

// -----------------------------------------------------------------------------
// withTenantFromSession: azucar para handlers/server actions. Deriva el tenantId
// EXCLUSIVAMENTE de la sesion/token YA verificado por NextAuth (src/lib/auth.ts)
// y corre el trabajo dentro del contexto. Nunca aceptar tenantId del request.
//
// Ejemplo (App Router):
//   import { getServerSession } from "next-auth";
//   import { authOptions } from "@/lib/auth";
//   import { withTenantFromSession } from "@/lib/tenant-context";
//
//   export async function GET() {
//     const session = await getServerSession(authOptions); // verifica el JWT
//     const ops = await withTenantFromSession(session, (tx) =>
//       tx.operacion.findMany()                              // RLS filtra por tenant
//     );
//     return Response.json(ops);
//   }
// -----------------------------------------------------------------------------
type SesionConTenant = { user?: { tenantId?: unknown } | null } | null | undefined;

export async function withTenantFromSession<T>(
  session: SesionConTenant,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const tenantId = session?.user?.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new TenantContextError(
      "La sesion no contiene tenantId (claim ausente en el token verificado)."
    );
  }
  return withTenant(tenantId, fn);
}

// -----------------------------------------------------------------------------
// NOTAS DE OPERACION
//  (a) Pooling: con PgBouncer en modo `transaction` o el pool de Prisma, SET LOCAL
//      es seguro porque vive y muere con la transaccion. NO usar SET (sin LOCAL):
//      ese valor persistiria en la conexion del pool y se filtraria a otro tenant.
//  (b) Nunca exponer un endpoint que reciba tenant_id del cliente y lo pase a
//      withTenant. El tenant_id SIEMPRE proviene del token verificado.
//  (c) Operaciones administrativas que crucen tenants NO deben usar BYPASSRLS:
//      iterar contexto por tenant autorizado, nunca evadir RLS.
//  (d) Migraciones/seed corren con el rol owner/migrator, NO con cerberus_ce_app.
// =============================================================================
// FIN tenant-context.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
