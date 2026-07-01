# Mensaje para el Claude local — Desplegar Incremento 8 (Evidencia exacta) — CON MIGRACIÓN

> Pega este bloque en tu Claude local. Cambia el schema (2 FKs opcionales), así que hay
> migración local + Neon + re-RLS. Mismo patrón de Inc 5/6 que salió limpio.

---

Despliega el Incremento 8 (Evidencia exacta: FKs operacionId en Documento y BitacoraAuditoria, y exporte probatorio con asociación directa) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (columnas opcionales operacion_id en documento y bitacora_auditoria). Migración y re-RLS. Orden exacto:

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name evidencia_fk_operacion
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) git add -A && git commit -m "Incremento 8: evidencia exacta (FKs operacion en documento y bitacora)" && git push

7) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner de la base Neon del producto (vercel env pull)>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - En una operación: avanza un estado o registra un paso NUEVO (para que el evento lleve la FK).
   - Genera el exporte probatorio de esa operación y confirma en el JSON que los registros nuevos
     traen "asociacion": "fk_directa" (los viejos seguirán como heurística — esperado).
   - Confirma que el login sigue funcionando (usuario_auth_read).
   Dame un resumen corto y la URL.
