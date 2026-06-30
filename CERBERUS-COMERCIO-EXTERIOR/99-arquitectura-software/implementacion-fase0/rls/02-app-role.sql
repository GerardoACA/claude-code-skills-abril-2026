-- =============================================================================
-- PRODUCTO: CERBERUS COMERCIO EXTERIOR  (SaaS nuevo, Fase 0)
-- NO ES PARA: cerberus-sidf-mp. Este rol es exclusivo del producto nuevo.
-- -----------------------------------------------------------------------------
-- Archivo:  02-app-role.sql
-- Propósito: Crear el ROL de base de datos que usa la aplicación (Next.js +
--            Prisma) en runtime. Este rol está SUJETO a RLS: NO tiene BYPASSRLS,
--            NO es SUPERUSER y NO es owner de las tablas.
--
-- Fundamento:
--   - diseno-v2-cerberus.md §5 Fase 0 punto 3 y §6: "ningún rol con BYPASSRLS".
--   - informe-reconciliacion.md §2.6: el aislamiento debe ser estructural
--     (RLS Postgres), no disciplina de aplicación.
--
-- Modelo de roles (separación owner / app):
--   - `cerberus_ce_owner`  : DUEÑO del esquema. Corre migraciones/DDL. NO se usa
--                            para servir tráfico de la app. (Aun así, las tablas
--                            usan FORCE RLS, ver 01, para que ni el owner evada
--                            las políticas en operaciones DML.)
--   - `cerberus_ce_app`    : rol de RUNTIME de la aplicación. Solo DML. Sujeto a
--                            RLS. SIN BYPASSRLS. Es el rol de la cadena de
--                            conexión (DATABASE_URL) de la app.
--   - `cerberus_ce_migrator` (opcional): rol para CI/CD que aplica migraciones;
--                            puede coincidir con el owner. NUNCA es el rol de la app.
--
-- ¡PROHIBIDO! Ningún rol de la aplicación debe tener:
--     - BYPASSRLS  (evade todas las políticas => fuga total de tenant)
--     - SUPERUSER  (implica BYPASSRLS y más)
--     - ser OWNER de las tablas sin FORCE RLS
--   Un control de CI (04-tenant-leak.test.ts) verifica que rolbypassrls = false.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rol OWNER del esquema (migraciones / DDL). NOLOGIN salvo que CI lo necesite.
--    Se le da LOGIN aquí porque las migraciones suelen conectarse con él; si tu
--    CI inyecta credenciales por otro medio, puedes quitar LOGIN/PASSWORD.
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
      NOBYPASSRLS;                  -- explícito: ni el owner evade RLS por atributo
    RAISE NOTICE 'Rol cerberus_ce_owner creado';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Rol de la APLICACIÓN (runtime). Este es el rol de DATABASE_URL de la app.
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
      NOBYPASSRLS;                  -- <== CRÍTICO: la app NUNCA evade RLS
    RAISE NOTICE 'Rol cerberus_ce_app creado';
  END IF;
END $$;

-- Endurecimiento idempotente (por si el rol ya existía con atributos laxos):
ALTER ROLE cerberus_ce_app  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER ROLE cerberus_ce_owner NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- -----------------------------------------------------------------------------
-- 3. Permitir que la app SETEE el GUC de sesión `app.tenant_id`.
--    En Postgres, un parámetro con punto (namespaced) puede setearse con
--    SET LOCAL sin privilegios especiales por ser un "custom setting".
--    No se requiere GRANT especial; se documenta para evitar dudas.
--    (No declarar app.tenant_id como parámetro de servidor: se usa ad-hoc
--     por transacción con SET LOCAL.)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. GRANTS de privilegios DML al rol de la app sobre el esquema public.
--    Nota: RLS sigue aplicando ENCIMA de estos GRANTS. Tener SELECT no significa
--    ver todo: la política tenant_isolation filtra por tenant_id.
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
-- IMPORTANTE: TRUNCATE no respeta políticas RLS por fila; por eso la app NO debe
--             poder TRUNCATE tablas tenant-scoped. (No se incluye en el GRANT.)

-- -----------------------------------------------------------------------------
-- 5. Verificación (debe correr en CI, ver 04): ningún rol de app con BYPASSRLS.
-- -----------------------------------------------------------------------------
-- SELECT rolname, rolbypassrls, rolsuper
-- FROM pg_roles
-- WHERE rolname IN ('cerberus_ce_app', 'cerberus_ce_owner', 'cerberus_ce_migrator');
-- -- Esperado: rolbypassrls = false y rolsuper = false en TODOS.

-- =============================================================================
-- FIN 02-app-role.sql  —  CERBERUS COMERCIO EXTERIOR
-- =============================================================================
