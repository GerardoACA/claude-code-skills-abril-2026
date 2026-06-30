-- =============================================================================
-- PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0)
-- NO ES PARA: cerberus-sidf-mp (producto fiscal en producción). SIDF se usa
--             SOLO como referencia conceptual; este script NO lo toca.
-- -----------------------------------------------------------------------------
-- Archivo:  01-enable-rls-policies.sql
-- Propósito: Activar Row Level Security (RLS) real en Postgres para las tablas
--            tenant-scoped del modelo de datos v2 (sección 4 de diseno-v2-cerberus.md)
--            y crear las políticas de aislamiento por `tenant_id`.
--
-- Fundamento de diseño:
--   - diseno-v2-cerberus.md §4 (modelo de datos: Tenant, Cliente/Importador,
--     Operacion, los 3 Expedientes, Documento, BitacoraAuditoria, etc.)
--   - diseno-v2-cerberus.md §2 IN-SCOPE M0 y §5 Fase 0 punto 3:
--     "RLS endurecido: ningún rol con BYPASSRLS, tenant_id validado contra token,
--      tests de fuga de tenant en CI como control probatorio."
--   - informe-reconciliacion.md §2.6: hoy el aislamiento es SOLO disciplina de
--     aplicación (WHERE tenantId = ...); RLS Postgres NO está activa. Este script
--     cierra esa brecha estructural.
--
-- Mecanismo:
--   - El aislamiento NO confía en ningún valor enviado por el cliente.
--   - Cada transacción setea `app.tenant_id` vía SET LOCAL desde el tenant_id
--     ya validado contra el JWT (ver 03-prisma-tenant-context.ts).
--   - Las políticas comparan la columna `tenant_id` de cada fila contra
--     `current_setting('app.tenant_id')`.
--   - Si `app.tenant_id` no está seteado, `current_setting('app.tenant_id', true)`
--     devuelve NULL y la política NO deja ver NI escribir nada (fail-closed).
--
-- Convención de esquema asumida:
--   - Todas las tablas tenant-scoped tienen una columna `tenant_id UUID NOT NULL`.
--   - La tabla raíz `tenant` se identifica por su propia PK `id` (su "tenant_id"
--     efectivo es su propio id).
--   - Nombres de tabla en snake_case. Si Prisma usa @@map distinto, ajustar aquí.
--
-- IMPORTANTE sobre FORCE:
--   - Usamos FORCE ROW LEVEL SECURITY para que la política aplique INCLUSO al
--     dueño de la tabla. Sin FORCE, el owner evade RLS (otra ruta de fuga).
--   - El rol de la aplicación (02-app-role.sql) NO es owner y NO tiene BYPASSRLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helper: función que lee el tenant del contexto de sesión de forma segura.
--    `true` como segundo argumento => no lanza error si la variable no existe,
--    devuelve NULL. NULL hace que toda comparación falle => fail-closed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

COMMENT ON FUNCTION app_current_tenant_id() IS
  'CERBERUS COMERCIO EXTERIOR: devuelve el tenant del contexto de transacción '
  '(app.tenant_id seteado por SET LOCAL desde el JWT validado). NULL si no hay '
  'contexto => las políticas RLS niegan acceso (fail-closed).';

-- -----------------------------------------------------------------------------
-- 1. Macro lógica aplicada a CADA tabla tenant-scoped:
--      ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--      ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;
--      CREATE POLICY tenant_isolation ON <t>
--        USING       (tenant_id = app_current_tenant_id())   -- SELECT/UPDATE/DELETE
--        WITH CHECK  (tenant_id = app_current_tenant_id());  -- INSERT/UPDATE
--
--    USING controla qué filas son VISIBLES/afectables.
--    WITH CHECK impide INSERT/UPDATE que pongan un tenant_id ajeno
--    (p. ej. un INSERT malicioso con tenant_id de otro cliente).
-- -----------------------------------------------------------------------------

-- ====== TABLA RAÍZ: tenant ====================================================
-- La raíz se aísla por su propia PK: una sesión solo ve SU fila de tenant.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING      (id = app_current_tenant_id())
  WITH CHECK (id = app_current_tenant_id());

-- ====== Tablas tenant-scoped (todas con columna tenant_id) ====================
-- Modelo v2 §4. Si una tabla se añade después, AÑADIRLA AQUÍ y a los tests (04).

DO $$
DECLARE
  t text;
  -- Lista canónica de tablas tenant-scoped del modelo v2.
  -- Mantener sincronizada con prisma/schema.prisma y con 04-tenant-leak.test.ts.
  tenant_scoped text[] := ARRAY[
    'contrato_encargo',
    'patente',
    'persona_fisica_autorizada',
    'cliente_importador',
    'expediente_kyc_1414',
    'expediente_probatorio_despacho',
    'expediente_doble_3142',
    'documento',
    'manifestacion_integridad',
    'evidencia_geo',
    'encargo_conferido',
    'operacion',
    'maquina_estado_despacho',
    'partida_mercancia',
    'valoracion_aduanera',
    'rrna',
    'mve_e2',
    'cove',
    'prevalidacion',
    'cfdi',
    'pago',
    'doda',
    'gafete',
    'resultado_semaforo',
    'dossier_diligencia',
    'validacion',
    'alerta_69b',
    'override_alerta',
    'inventario_erp',
    'capa_peps',
    'bom',
    'merma',
    'requerimiento_autoridad',
    'acceso_autoridad',
    'bitacora_auditoria',
    'sellado_calificado'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_scoped LOOP
    -- Solo actuar si la tabla existe (Fase 0 puede ir creándolas por tandas).
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I '
        'USING (tenant_id = app_current_tenant_id()) '
        'WITH CHECK (tenant_id = app_current_tenant_id());', t
      );
      RAISE NOTICE 'RLS habilitada + policy tenant_isolation en %', t;
    ELSE
      RAISE NOTICE 'TABLA AUSENTE (se omite, créala antes): %', t;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Verificación post-aplicación: ninguna tabla tenant-scoped debe quedar
--    SIN rowsecurity o SIN forcerowsecurity. Esta consulta debe devolver 0 filas.
--    (Se puede correr también como assert en CI, ver 04-tenant-leak.test.ts.)
-- -----------------------------------------------------------------------------
-- SELECT c.relname
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relname = ANY (ARRAY[ ... lista de arriba ... ])
--   AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

-- =============================================================================
-- FIN 01-enable-rls-policies.sql  —  CERBERUS COMERCIO EXTERIOR
-- =============================================================================
