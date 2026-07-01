-- CERBERUS COMERCIO EXTERIOR — política de lectura para autenticación. NO es SIDF.
-- =============================================================================
-- PRODUCTO: CERBERUS COMERCIO EXTERIOR (SaaS nuevo, Fase 0/1). NO es SIDF.
-- -----------------------------------------------------------------------------
-- Problema que resuelve:
--   El login busca al Usuario por email ANTES de conocer su tenant, así que no
--   hay contexto `app.tenant_id`. Como `usuario` tiene RLS (política
--   tenant_isolation), esa búsqueda sin contexto no devolvería filas y el login
--   fallaría siempre.
--
-- Solución (sin superusuario, compatible con Neon):
--   Una política PERMISIVA adicional SOLO de SELECT sobre `usuario`, que aplica
--   ÚNICAMENTE cuando NO hay contexto de tenant (es decir, durante el login).
--   - Con `app.tenant_id` seteado (consultas normales dentro de withTenant):
--     esta política es falsa ⇒ rige tenant_isolation ⇒ lectura tenant-scoped.
--   - Sin `app.tenant_id` (login): permite leer para autenticar.
--   Las políticas permisivas se combinan con OR; INSERT/UPDATE/DELETE siguen
--   regidos por tenant_isolation (esta política es FOR SELECT).
--
-- Requiere que 01-enable-rls-policies.sql ya haya habilitado RLS en `usuario`.
-- Se aplica como owner/admin (crea política), no con el rol de la app.
-- =============================================================================

DROP POLICY IF EXISTS usuario_auth_read ON usuario;

CREATE POLICY usuario_auth_read ON usuario
  FOR SELECT
  USING (
    current_setting('app.tenant_id', true) IS NULL
    OR current_setting('app.tenant_id', true) = ''
  );

-- Nota de seguridad: durante el login (sin contexto) el rol de la app puede leer
-- filas de `usuario` de forma global para localizar el email. Las contraseñas se
-- guardan hasheadas (scrypt) y esta ruta solo corre en el servidor (authorize).
-- Para producción con múltiples tenants con emails repetidos, considerar email
-- globalmente único o selección de tenant en el login.
-- =============================================================================
-- FIN 03-auth-lookup.sql — CERBERUS COMERCIO EXTERIOR
-- =============================================================================
