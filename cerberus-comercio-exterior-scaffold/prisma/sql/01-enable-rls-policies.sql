-- CERBERUS COMERCIO EXTERIOR — RLS (politicas de aislamiento por tenant). NO es SIDF.
-- =============================================================================
-- PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0/1)
-- NO ES PARA: cerberus-sidf-mp (producto fiscal en produccion). SIDF se usa SOLO
--             como referencia conceptual; este script NO lo toca.
-- -----------------------------------------------------------------------------
-- Archivo:  prisma/sql/01-enable-rls-policies.sql
-- Proposito: Activar Row Level Security (RLS) real en Postgres para TODAS las
--            tablas tenant-scoped del schema (las que define el Agente B a partir
--            del _BLUEPRINT.md) y crear las politicas de aislamiento por tenant.
--
-- Mecanismo (fail-closed):
--   - El aislamiento NO confia en ningun valor enviado por el cliente.
--   - Cada transaccion setea `app.tenant_id` via set_config(..., is_local=true)
--     desde el tenant_id ya validado contra el JWT (ver src/lib/tenant-context.ts).
--   - Las politicas comparan la columna `tenant_id` de cada fila contra
--     current_setting('app.tenant_id').
--   - Si `app.tenant_id` no esta seteado, current_setting('app.tenant_id', true)
--     devuelve NULL y la politica NO deja ver NI escribir nada (fail-closed).
--
-- Convencion de esquema (blueprint, "Convenciones DURAS"):
--   - Toda tabla tenant-scoped tiene `tenantId String @map("tenant_id")`, es decir
--     una columna fisica `tenant_id` en snake_case.
--   - La tabla raiz `Tenant` se identifica por su propia PK `id` (su tenant_id
--     efectivo es su propio id).
--
-- Robustez frente al naming exacto del Agente B:
--   - Este script descubre dinamicamente las tablas tenant-scoped consultando el
--     catalogo: cualquier tabla BASE de `public` con una columna `tenant_id`
--     queda protegida automaticamente, sin importar el @@map exacto que elija el
--     schema. Asi no se rompe la sincronia entre agentes.
--
-- IMPORTANTE sobre FORCE:
--   - Usamos FORCE ROW LEVEL SECURITY para que la politica aplique INCLUSO al
--     dueno de la tabla. Sin FORCE, el owner evade RLS (otra ruta de fuga).
--   - El rol de la aplicacion (02-app-role.sql) NO es owner y NO tiene BYPASSRLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helper: lee el tenant del contexto de sesion de forma segura.
--    `true` como 2do argumento => no lanza error si la variable no existe,
--    devuelve NULL. NULL hace que toda comparacion falle => fail-closed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

COMMENT ON FUNCTION app_current_tenant_id() IS
  'CERBERUS COMERCIO EXTERIOR: devuelve el tenant del contexto de transaccion '
  '(app.tenant_id seteado por set_config local desde el JWT validado). NULL si no '
  'hay contexto => las politicas RLS niegan acceso (fail-closed).';

-- -----------------------------------------------------------------------------
-- 0b. Helper de sistema (Incremento 11 — Vigia): enumera los ids de TODOS los
--     tenants para el barrido del cron. La tabla `tenant` tiene FORCE RLS y el
--     rol de la app NO tiene BYPASSRLS, asi que NO puede listarlos con una
--     consulta directa (fail-closed la vacia). Esta funcion SECURITY DEFINER se
--     crea con el rol DUENO (que si bypassa RLS) y expone SOLO los ids (no datos)
--     al rol de la app. No debilita el aislamiento: conocer un id no da acceso a
--     datos de otro tenant (eso sigue exigiendo fijar app.tenant_id en servidor).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_listar_tenant_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenant
$$;

COMMENT ON FUNCTION app_listar_tenant_ids() IS
  'CERBERUS COMERCIO EXTERIOR (Inc 11): enumera ids de tenants para el barrido '
  'del vigia. SECURITY DEFINER (owner con BYPASSRLS) porque tenant tiene FORCE RLS. '
  'Solo devuelve ids, no datos tenant-scoped.';

-- Solo el rol de la app puede ejecutarla (no PUBLIC). Guardado por si 01 se
-- aplica antes de crear el rol (02-app-role.sql).
REVOKE ALL ON FUNCTION app_listar_tenant_ids() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cerberus_ce_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_listar_tenant_ids() TO cerberus_ce_app';
    RAISE NOTICE 'GRANT EXECUTE app_listar_tenant_ids() a cerberus_ce_app';
  ELSE
    RAISE NOTICE 'rol cerberus_ce_app ausente: se omite GRANT de app_listar_tenant_ids (reaplica 01 tras 02)';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. TABLA RAIZ: tenant. Se aisla por su propia PK: una sesion solo ve SU fila.
--    (Se asume @@map("tenant") en el schema del Agente B; si el modelo Tenant
--     no se mapeara a "tenant", el bloque dinamico del paso 2 NO lo cubre porque
--     la raiz no tiene columna tenant_id, por eso se trata aqui explicitamente.)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenant'
  ) THEN
    EXECUTE 'ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.tenant FORCE  ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.tenant';
    EXECUTE
      'CREATE POLICY tenant_isolation ON public.tenant '
      'USING (id = app_current_tenant_id()) '
      'WITH CHECK (id = app_current_tenant_id())';
    RAISE NOTICE 'RLS habilitada + policy tenant_isolation en tabla raiz tenant';
  ELSE
    RAISE NOTICE 'TABLA AUSENTE: tenant (creala con el schema antes de aplicar RLS)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Tablas tenant-scoped: DESCUBRIMIENTO DINAMICO.
--    Toda tabla BASE de `public` que tenga columna `tenant_id` recibe:
--      ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
--      ALTER TABLE ... FORCE  ROW LEVEL SECURITY;
--      CREATE POLICY tenant_isolation
--        USING      (tenant_id = app_current_tenant_id())   -- SELECT/UPDATE/DELETE
--        WITH CHECK (tenant_id = app_current_tenant_id());  -- INSERT/UPDATE
--
--    Modelos tenant-scoped esperados del blueprint (Fase 0/1) — referencia, el
--    descubrimiento NO depende de esta lista pero documenta lo que debe quedar
--    protegido: Usuario, ContratoEncargo, Cliente, Patente,
--    PersonaFisicaAutorizada, EncargoConferido, ExpedienteKyc1414,
--    ExpedienteProbatorioDespacho, ExpedienteDoble3142, Documento, Operacion,
--    Partida, Alerta69b, VersionAviso, ConsentimientoDatos, BitacoraAuditoria.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a  ON a.attrelid = c.oid
    WHERE ns.nspname = 'public'
      AND c.relkind = 'r'                 -- solo tablas base ordinarias
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.tabla);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I '
      'USING (tenant_id = app_current_tenant_id()) '
      'WITH CHECK (tenant_id = app_current_tenant_id())', r.tabla
    );
    n := n + 1;
    RAISE NOTICE 'RLS habilitada + policy tenant_isolation en %', r.tabla;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'No se encontro ninguna tabla con columna tenant_id. '
                 'Aplica las migraciones del schema (Agente B) ANTES de este script.';
  ELSE
    RAISE NOTICE 'Total de tablas tenant-scoped protegidas: %', n;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Verificacion post-aplicacion (debe devolver 0 filas): ninguna tabla con
--    columna tenant_id puede quedar SIN rowsecurity o SIN forcerowsecurity.
--    El gate de CI (tests/tenant-leak.test.ts) corre el equivalente como assert.
-- -----------------------------------------------------------------------------
-- SELECT c.relname
-- FROM pg_class c
-- JOIN pg_namespace ns ON ns.oid = c.relnamespace
-- JOIN pg_attribute a  ON a.attrelid = c.oid
-- WHERE ns.nspname = 'public'
--   AND c.relkind = 'r'
--   AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
--   AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);

-- =============================================================================
-- FIN 01-enable-rls-policies.sql  —  CERBERUS COMERCIO EXTERIOR
-- =============================================================================
