-- CERBERUS COMERCIO EXTERIOR — rol de aplicacion sujeto a RLS. NO es SIDF.
-- =============================================================================
-- PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0/1)
-- NO ES PARA: cerberus-sidf-mp. Este rol es exclusivo del producto nuevo.
-- -----------------------------------------------------------------------------
-- Archivo:  prisma/sql/02-app-role.sql
-- Proposito: Crear el ROL de base de datos que usa la aplicacion (Next.js +
--            Prisma) en runtime. Este rol esta SUJETO a RLS: NO tiene BYPASSRLS,
--            NO es SUPERUSER y NO es owner de las tablas.
--
-- Modelo de roles (separacion owner / app):
--   - cerberus_ce_owner  : DUENO del esquema. Corre migraciones/DDL. NO sirve
--                          trafico de la app. (Aun asi, las tablas usan FORCE RLS,
--                          ver 01, para que ni el owner evada las politicas en DML.)
--   - cerberus_ce_app    : rol de RUNTIME de la aplicacion. Solo DML. Sujeto a RLS.
--                          SIN BYPASSRLS. Es el rol de DATABASE_URL de la app.
--   - cerberus_ce_migrator (opcional): rol de CI/CD que aplica migraciones; puede
--                          coincidir con el owner. NUNCA es el rol de la app.
--
-- PROHIBIDO! Ningun rol de la aplicacion debe tener:
--     - BYPASSRLS  (evade todas las politicas => fuga total de tenant)
--     - SUPERUSER  (implica BYPASSRLS y mas)
--     - ser OWNER de las tablas sin FORCE RLS
--   El gate de CI (tests/tenant-leak.test.ts) verifica rolbypassrls = false.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rol OWNER del esquema (migraciones / DDL). LOGIN porque las migraciones se
--    conectan con el; inyectar la password por secreto en CI/CD, no hardcodear.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cerberus_ce_owner') THEN
    CREATE ROLE cerberus_ce_owner
      LOGIN
      PASSWORD 'CHANGE_ME_owner'   -- inyectar por secreto en CI/CD, no hardcodear
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;                  -- explicito: ni el owner evade RLS por atributo
    RAISE NOTICE 'Rol cerberus_ce_owner creado';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Rol de la APLICACION (runtime). Este es el rol de DATABASE_URL de la app.
--    SIN BYPASSRLS. SIN SUPERUSER. Solo DML.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cerberus_ce_app') THEN
    CREATE ROLE cerberus_ce_app
      LOGIN
      PASSWORD 'CHANGE_ME_app'      -- inyectar por secreto, no hardcodear
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;                  -- <== CRITICO: la app NUNCA evade RLS
    RAISE NOTICE 'Rol cerberus_ce_app creado';
  END IF;
END $$;

-- Endurecimiento idempotente (por si el rol ya existia con atributos laxos):
ALTER ROLE cerberus_ce_app   NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE cerberus_ce_owner NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- -----------------------------------------------------------------------------
-- 3. GUC de sesion `app.tenant_id`:
--    En Postgres un parametro namespaced (con punto) puede setearse con
--    set_config(..., is_local=true) sin privilegios especiales por ser un
--    "custom setting". No se requiere GRANT especial; se documenta para claridad.
--    NO se declara app.tenant_id como parametro de servidor: se usa ad-hoc por
--    transaccion (SET LOCAL / set_config local), ver src/lib/tenant-context.ts.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. GRANTS de privilegios DML al rol de la app sobre el esquema public.
--    RLS sigue aplicando ENCIMA de estos GRANTS: tener SELECT no significa ver
--    todo; la politica tenant_isolation filtra por tenant_id.
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO cerberus_ce_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO cerberus_ce_app;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO cerberus_ce_app;

-- Que las tablas/secuencias FUTURAS (creadas por el owner) hereden los grants:
ALTER DEFAULT PRIVILEGES FOR ROLE cerberus_ce_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cerberus_ce_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cerberus_ce_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cerberus_ce_app;

-- IMPORTANTE: NO conceder DROP/ALTER/TRUNCATE a la app.
-- TRUNCATE no respeta politicas RLS por fila; por eso la app NO debe poder
-- TRUNCATE tablas tenant-scoped. (No se incluye en el GRANT.)

-- -----------------------------------------------------------------------------
-- 5. Verificacion (corre en CI, ver tests/tenant-leak.test.ts): ningun rol de
--    app con BYPASSRLS ni SUPERUSER.
-- -----------------------------------------------------------------------------
-- SELECT rolname, rolbypassrls, rolsuper
-- FROM pg_roles
-- WHERE rolname IN ('cerberus_ce_app', 'cerberus_ce_owner', 'cerberus_ce_migrator');
-- -- Esperado: rolbypassrls = false y rolsuper = false en TODOS.

-- =============================================================================
-- FIN 02-app-role.sql  —  CERBERUS COMERCIO EXTERIOR
-- =============================================================================
