// CERBERUS COMERCIO EXTERIOR — gate de fuga de tenant (RLS). NO es SIDF.
// =============================================================================
// Archivo:  tests/tenant-leak.test.ts
// Proposito: Suite de FUGA DE TENANT. Intenta leer/escribir datos de OTRO tenant
//            y DEBE fallar. Es un GATE BLOQUEANTE de CI: si cualquiera de estos
//            tests pasa indebidamente (ve/escribe datos ajenos), el pipeline DEBE
//            romper y NO se despliega.
//
// Requisitos del entorno de test:
//   - BD de test con prisma/sql/01-enable-rls-policies.sql y 02-app-role.sql
//     APLICADOS (script db:rls), y el schema migrado (db:migrate) + seed minimo.
//   - DATABASE_URL apunta al rol cerberus_ce_app (SIN BYPASSRLS).
//   - SEED_DATABASE_URL apunta a un rol con privilegios de seed (owner/migrator),
//     usado SOLO para plantar datos cruzando tenants (NO ejercita el camino app).
//
// Convencion: el camino de la app usa withTenant() de src/lib/tenant-context.ts.
// Nota: tenantId es String (blueprint) — se usan ids legibles, no UUID.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-context";

// Cliente de SEED (rol owner) para preparar datos cruzando tenants, fuera del
// camino de la app. Si no hay SEED_DATABASE_URL, cae a DATABASE_URL pero el seed
// debe correr sin contexto RLS o como owner; en CI SIEMPRE setear SEED_DATABASE_URL.
const seed = new PrismaClient(
  process.env.SEED_DATABASE_URL
    ? { datasources: { db: { url: process.env.SEED_DATABASE_URL } } }
    : undefined
);

const TENANT_A = "tenant-a-0001";
const TENANT_B = "tenant-b-0002";

let clienteDeB_id: string;
let operacionDeB_id: string;

beforeAll(async () => {
  // Idempotencia: limpiar datos de corridas previas para estos tenants de prueba
  // (via rol owner, fuera de RLS). Orden respeta FKs: operacion -> cliente -> tenant.
  await seed.operacion.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  await seed.cliente.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });

  // Plantar dos tenants y datos propios de cada uno (via rol owner, fuera de RLS app).
  await seed.tenant.upsert({
    where: { id: TENANT_A },
    update: {},
    create: { id: TENANT_A, nombre: "Tenant A", rfc: "AAA010101AA1" },
  });
  await seed.tenant.upsert({
    where: { id: TENANT_B },
    update: {},
    create: { id: TENANT_B, nombre: "Tenant B", rfc: "BBB010101BB2" },
  });

  const clienteB = await seed.cliente.create({
    data: { tenantId: TENANT_B, rfc: "BBB010101BB1", razonSocial: "Importadora B" },
  });
  clienteDeB_id = clienteB.id;

  const opB = await seed.operacion.create({
    data: { tenantId: TENANT_B, clienteId: clienteB.id, referencia: "OP-B-0001" },
  });
  operacionDeB_id = opB.id;
});

afterAll(async () => {
  await seed.$disconnect();
  await prisma.$disconnect();
});

// -----------------------------------------------------------------------------
// GRUPO 1 — Atributos de rol y cobertura de RLS (control probatorio estructural).
// -----------------------------------------------------------------------------
describe("CE-RLS / atributos de rol y cobertura (control probatorio)", () => {
  it("el rol de la app NO tiene BYPASSRLS ni SUPERUSER", async () => {
    const rows = await prisma.$queryRaw<
      { rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]
    >`
      SELECT rolname, rolbypassrls, rolsuper
      FROM pg_roles
      WHERE rolname = 'cerberus_ce_app'
    `;
    expect(rows.length, "rol cerberus_ce_app debe existir").toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.rolbypassrls, "cerberus_ce_app NO debe tener BYPASSRLS").toBe(false);
      expect(r.rolsuper, "cerberus_ce_app NO debe ser SUPERUSER").toBe(false);
    }
  });

  it("la conexion de test corre como cerberus_ce_app (no como superuser)", async () => {
    const rows = await prisma.$queryRaw<{ current_user: string; is_super: boolean }[]>`
      SELECT current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super
    `;
    // No exigimos el nombre exacto (algunos setups usan un alias), pero NUNCA superuser.
    expect(rows[0]?.is_super, "la app de test NUNCA debe correr como superuser").toBe(false);
  });

  it("TODA tabla tenant-scoped (con columna tenant_id) tiene RLS habilitada Y forzada", async () => {
    // Descubrimiento dinamico: independiente del @@map exacto del Agente B.
    // Debe devolver 0 filas. Cualquier fila = tabla sin proteccion => CI rojo.
    const unprotected = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN pg_attribute a  ON a.attrelid = c.oid
      WHERE ns.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenant_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)
    `;
    expect(
      unprotected,
      `Tablas tenant-scoped sin RLS habilitada+forzada: ${JSON.stringify(unprotected)}`
    ).toHaveLength(0);
  });

  it("la tabla raiz `tenant` tambien tiene RLS habilitada Y forzada", async () => {
    const rows = await prisma.$queryRaw<{ rls: boolean; force: boolean }[]>`
      SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'tenant'
    `;
    expect(rows.length, "la tabla tenant debe existir").toBeGreaterThan(0);
    expect(rows[0]?.rls, "tenant debe tener RLS habilitada").toBe(true);
    expect(rows[0]?.force, "tenant debe tener RLS forzada (FORCE)").toBe(true);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 2 — Lectura cruzada: A no puede ver datos de B.
// -----------------------------------------------------------------------------
describe("CE-RLS / lectura cross-tenant DEBE fallar", () => {
  it("Tenant A no ve clientes de Tenant B (findMany no los incluye)", async () => {
    const visibles = await withTenant(TENANT_A, (tx) => tx.cliente.findMany());
    expect(visibles.some((c) => c.id === clienteDeB_id)).toBe(false);
    expect(visibles.every((c) => c.tenantId === TENANT_A)).toBe(true);
  });

  it("Tenant A NO puede leer una Operacion de B ni por id directo", async () => {
    const op = await withTenant(TENANT_A, (tx) =>
      tx.operacion.findUnique({ where: { id: operacionDeB_id } })
    );
    // RLS oculta la fila => findUnique devuelve null aunque el id exista.
    expect(op).toBeNull();
  });

  it("Tenant A NO puede leer un Cliente de B con SQL crudo (RLS filtra el WHERE)", async () => {
    const rows = await withTenant(TENANT_A, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM cliente WHERE tenant_id = ${TENANT_B}`
    );
    expect(rows).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 3 — Escritura cruzada: A no puede modificar/insertar/borrar como B.
// -----------------------------------------------------------------------------
describe("CE-RLS / escritura cross-tenant DEBE fallar", () => {
  it("Tenant A NO puede actualizar una Operacion de B (updateMany afecta 0 filas)", async () => {
    const res = await withTenant(TENANT_A, (tx) =>
      tx.operacion.updateMany({
        where: { id: operacionDeB_id },
        data: { referencia: "HACKEADA" },
      })
    );
    expect(res.count).toBe(0); // RLS impide ver la fila => 0 afectadas
  });

  it("Tenant A NO puede INSERTAR una fila etiquetada como Tenant B (WITH CHECK la rechaza)", async () => {
    await expect(
      withTenant(TENANT_A, (tx) =>
        tx.cliente.create({
          data: { tenantId: TENANT_B, rfc: "XXX010101XX1", razonSocial: "Inyectado" },
        })
      )
    ).rejects.toThrow(); // viola la policy WITH CHECK (tenant_id = current)
  });

  it("Tenant A NO puede borrar datos de B (deleteMany afecta 0 filas)", async () => {
    const res = await withTenant(TENANT_A, (tx) =>
      tx.cliente.deleteMany({ where: { id: clienteDeB_id } })
    );
    expect(res.count).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 4 — Fail-closed: sin app.tenant_id no se ve NADA.
// -----------------------------------------------------------------------------
describe("CE-RLS / sin app.tenant_id no se ve nada (fail-closed)", () => {
  it("una transaccion SIN set_config no devuelve filas tenant-scoped", async () => {
    // Ejecutamos directo sin withTenant (no se setea app.tenant_id).
    const rows = await prisma.$transaction(async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM cliente`;
    });
    expect(rows).toHaveLength(0); // app_current_tenant_id() = NULL => 0 filas
  });

  it("withTenant rechaza un tenantId vacio o con formato invalido (fail-closed)", async () => {
    await expect(withTenant("", async () => 1)).rejects.toThrow();
    await expect(withTenant("a b; DROP", async () => 1)).rejects.toThrow();
  });
});

// -----------------------------------------------------------------------------
// GRUPO 5 — La bitacora de auditoria tambien esta aislada por tenant.
// -----------------------------------------------------------------------------
describe("CE-RLS / BitacoraAuditoria aislada", () => {
  it("Tenant A no lee eventos de auditoria de Tenant B", async () => {
    const rows = await withTenant(TENANT_A, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM bitacora_auditoria WHERE tenant_id = ${TENANT_B}`
    );
    expect(rows).toHaveLength(0);
  });
});

// =============================================================================
// GATE DE CI:
//   - Levantar Postgres de test, aplicar 01 + 02 (db:rls), migrar (db:migrate),
//     sembrar (db:seed), correr `npm test` (vitest run) con esta suite.
//   - Job REQUIRED en branch protection: si falla, NO se mergea.
//   - Tratar el reporte como artefacto probatorio.
// =============================================================================
// FIN tenant-leak.test.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
