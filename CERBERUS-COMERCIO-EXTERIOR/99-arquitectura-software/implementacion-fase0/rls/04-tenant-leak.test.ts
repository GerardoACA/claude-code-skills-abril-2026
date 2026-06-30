// =============================================================================
// PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0)
// NO ES PARA: cerberus-sidf-mp. Esta suite prueba el aislamiento del producto nuevo.
// -----------------------------------------------------------------------------
// Archivo:  04-tenant-leak.test.ts
// Propósito: Suite de tests de FUGA DE TENANT. Intentan leer/escribir datos de
//            OTRO tenant y DEBEN fallar. Pensada para correr en CI como GATE
//            BLOQUEANTE: si cualquiera de estos tests pasa indebidamente (es
//            decir, logra ver datos ajenos), el pipeline DEBE romper y NO se
//            despliega.
//
// Fundamento:
//   - diseno-v2-cerberus.md §5 Fase 0 punto 3 y §7: "tests de fuga de tenant en
//     CI tratados como CONTROL PROBATORIO, no como prueba unitaria opcional."
//   - informe-reconciliacion.md §2.6: el aislamiento debe ser estructural.
//
// Runner: ejemplos en sintaxis Vitest/Jest (describe/it/expect). Adaptar import.
// Requisitos:
//   - La BD de test debe tener aplicados 01-enable-rls-policies.sql y
//     02-app-role.sql.
//   - La conexión de la app de test usa el rol cerberus_ce_app (SIN BYPASSRLS).
//   - Se siembran 2 tenants (A y B) con datos propios usando un rol con
//     privilegios de seed (owner/migrator), NO el rol de la app.
//
// CONVENCIÓN: usamos las utilidades de 03-prisma-tenant-context.ts.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runInTenantContext, prisma } from "./03-prisma-tenant-context";

// Cliente con privilegios de SEED (rol owner) para preparar datos cruzando tenants.
// Su DATABASE_URL apunta al owner; NO se usa para ejercitar el camino de la app.
const seed = new PrismaClient({
  datasources: { db: { url: process.env.SEED_DATABASE_URL } },
});

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

let clienteDeB_id: string;
let operacionDeB_id: string;

beforeAll(async () => {
  // Sembrar dos tenants y datos propios de cada uno (vía rol owner, fuera de RLS app).
  await seed.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`;
  await seed.tenant.upsert({ where: { id: TENANT_A }, update: {}, create: { id: TENANT_A, nombre: "Tenant A" } });
  await seed.tenant.upsert({ where: { id: TENANT_B }, update: {}, create: { id: TENANT_B, nombre: "Tenant B" } });

  const clienteB = await seed.clienteImportador.create({
    data: { tenantId: TENANT_B, rfc: "BBB010101BB1", razonSocial: "Importadora B" },
  });
  clienteDeB_id = clienteB.id;

  const opB = await seed.operacion.create({
    data: { tenantId: TENANT_B, clienteImportadorId: clienteB.id, referencia: "OP-B-0001" },
  });
  operacionDeB_id = opB.id;
});

afterAll(async () => {
  await seed.$disconnect();
  await prisma.$disconnect();
});

// -----------------------------------------------------------------------------
// GRUPO 1 — Atributo del rol: la app NO debe poder evadir RLS.
// -----------------------------------------------------------------------------
describe("CE-RLS / atributos de rol (control probatorio)", () => {
  it("ningún rol de la app tiene BYPASSRLS ni SUPERUSER", async () => {
    const rows = await prisma.$queryRaw<
      { rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]
    >`
      SELECT rolname, rolbypassrls, rolsuper
      FROM pg_roles
      WHERE rolname IN ('cerberus_ce_app')
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.rolbypassrls).toBe(false); // CRÍTICO
      expect(r.rolsuper).toBe(false);     // CRÍTICO
    }
  });

  it("todas las tablas tenant-scoped tienen RLS habilitada Y forzada", async () => {
    // Debe devolver 0 filas. Cualquier fila = tabla sin protección => CI rojo.
    const unprotected = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY (ARRAY[
          'tenant','contrato_encargo','patente','persona_fisica_autorizada',
          'cliente_importador','expediente_kyc_1414','expediente_probatorio_despacho',
          'expediente_doble_3142','documento','manifestacion_integridad','evidencia_geo',
          'encargo_conferido','operacion','maquina_estado_despacho','partida_mercancia',
          'valoracion_aduanera','rrna','mve_e2','cove','prevalidacion','cfdi','pago',
          'doda','gafete','resultado_semaforo','dossier_diligencia','validacion',
          'alerta_69b','override_alerta','inventario_erp','capa_peps','bom','merma',
          'requerimiento_autoridad','acceso_autoridad','bitacora_auditoria','sellado_calificado'
        ])
        AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)
    `;
    expect(unprotected, `Tablas sin RLS/forzar: ${JSON.stringify(unprotected)}`).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 2 — Lectura cruzada: A no puede ver datos de B.
// -----------------------------------------------------------------------------
describe("CE-RLS / lectura cross-tenant DEBE fallar", () => {
  it("Tenant A no ve clientes de Tenant B (findMany no los incluye)", async () => {
    const visibles = await runInTenantContext(TENANT_A, (tx) =>
      tx.clienteImportador.findMany()
    );
    // Ninguna fila de B debe aparecer.
    expect(visibles.some((c) => c.id === clienteDeB_id)).toBe(false);
    expect(visibles.every((c) => c.tenantId === TENANT_A)).toBe(true);
  });

  it("Tenant A NO puede leer una Operacion de B ni por id directo", async () => {
    const op = await runInTenantContext(TENANT_A, (tx) =>
      tx.operacion.findUnique({ where: { id: operacionDeB_id } })
    );
    // RLS oculta la fila => findUnique devuelve null aunque el id exista.
    expect(op).toBeNull();
  });

  it("Tenant A NO puede leer un Documento de B con SQL crudo", async () => {
    const rows = await runInTenantContext(TENANT_A, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM documento WHERE tenant_id = ${TENANT_B}`
    );
    // Aunque el WHERE pida tenant B, RLS filtra: 0 filas.
    expect(rows).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 3 — Escritura cruzada: A no puede modificar/insertar como B.
// -----------------------------------------------------------------------------
describe("CE-RLS / escritura cross-tenant DEBE fallar", () => {
  it("Tenant A NO puede actualizar una Operacion de B (updateMany afecta 0 filas)", async () => {
    const res = await runInTenantContext(TENANT_A, (tx) =>
      tx.operacion.updateMany({
        where: { id: operacionDeB_id },
        data: { referencia: "HACKEADA" },
      })
    );
    expect(res.count).toBe(0); // RLS impide ver la fila => 0 afectadas
  });

  it("Tenant A NO puede INSERTAR una fila etiquetada como Tenant B (WITH CHECK la rechaza)", async () => {
    await expect(
      runInTenantContext(TENANT_A, (tx) =>
        tx.clienteImportador.create({
          data: { tenantId: TENANT_B, rfc: "XXX010101XX1", razonSocial: "Inyectado" },
        })
      )
    ).rejects.toThrow(); // viola la policy WITH CHECK (tenant_id = current)
  });

  it("Tenant A NO puede borrar datos de B (deleteMany afecta 0 filas)", async () => {
    const res = await runInTenantContext(TENANT_A, (tx) =>
      tx.clienteImportador.deleteMany({ where: { id: clienteDeB_id } })
    );
    expect(res.count).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// GRUPO 4 — Fail-closed: sin contexto de tenant, no se ve NADA.
// -----------------------------------------------------------------------------
describe("CE-RLS / sin app.tenant_id no se ve nada (fail-closed)", () => {
  it("una transacción SIN set_config no devuelve filas tenant-scoped", async () => {
    // Ejecutamos directo sin runInTenantContext (no se setea app.tenant_id).
    const rows = await prisma.$transaction(async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM cliente_importador`;
    });
    expect(rows).toHaveLength(0); // app_current_tenant_id() = NULL => 0 filas
  });
});

// -----------------------------------------------------------------------------
// GRUPO 5 — La bitácora de auditoría también está aislada por tenant.
// -----------------------------------------------------------------------------
describe("CE-RLS / BitacoraAuditoria aislada", () => {
  it("Tenant A no lee eventos de auditoría de Tenant B", async () => {
    const rows = await runInTenantContext(TENANT_A, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM bitacora_auditoria WHERE tenant_id = ${TENANT_B}`
    );
    expect(rows).toHaveLength(0);
  });
});

// =============================================================================
// GATE DE CI (recomendado en el workflow):
//   - Levantar Postgres de test, aplicar 01 + 02, migrar esquema, sembrar.
//   - Correr esta suite con `--reporter=verbose`.
//   - Marcar el job como REQUIRED en branch protection: si falla, NO se mergea.
//   - Tratar el resultado como artefacto probatorio (guardar el reporte).
// =============================================================================
// FIN 04-tenant-leak.test.ts  —  CERBERUS COMERCIO EXTERIOR
// =============================================================================
