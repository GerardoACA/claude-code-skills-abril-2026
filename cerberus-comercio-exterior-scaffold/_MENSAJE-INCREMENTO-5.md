# Mensaje para el Claude local — Desplegar Incremento 5 (Verificación de Cumplimiento) — CON MIGRACIÓN

> Pega este bloque en tu Claude local. ESTE incremento SÍ cambia la base de datos (un modelo
> nuevo: VerificacionCumplimiento), así que hay MIGRACIÓN en local Y en Neon, y re-aplicar RLS.

---

Despliega el Incremento 5 (Verificación de Cumplimiento completa: arts. 69, 69-B, 69-B Bis, 29 Bis, opinión 32-D y CSD 17-H) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error de build o pruebas.

IMPORTANTE: este incremento CAMBIA EL SCHEMA (modelo VerificacionCumplimiento). Hay migración y re-aplicación de RLS. Sigue el orden exacto.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026 haz: git checkout claude/arquitecto-j0mw1x && git pull.

2) Sincroniza el código nuevo al producto con rsync, EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs, desde
   claude-code-skills-abril-2026/cerberus-comercio-exterior-scaffold/
   hacia ~/Desktop/cerberus-workspace/cerberus-comercio-exterior/

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name verificacion_cumplimiento
   # Re-aplicar grants del rol app y RLS a la tabla nueva (como admin):
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) BUILD + PRUEBAS (arregla errores tú mismo):
   npm run build
   set -a; source .env; set +a; npm test

6) Commit + push a main:
   git add -A && git commit -m "Incremento 5: Verificacion de Cumplimiento (69/69-B/69-B Bis/29 Bis/32-D/CSD)" && git push

7) MIGRACIÓN EN NEON (usa la cadena OWNER de la base Neon del producto; obténla de Vercel/tu registro):
   NEON_ADMIN="<cadena owner directa de la base Neon de cerberus-comercio-exterior>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   # Re-aplicar grants + RLS a la tabla nueva en Neon:
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) Redespliega: npx vercel --prod.

9) Verifica en https://cerberus-comercio-exterior.vercel.app (login admin@demo.mx / demo1234):
   - Entra a un cliente y ve a su URL /clientes/[id]/cumplimiento
   - Pulsa "Verificar todo" → aparecen las 6 fuentes con su semáforo (69, 69-B, 69-B Bis, 29 Bis, 32-D, CSD)
   - Confirma que es ALERTA, no bloqueo (nunca impide nada)
   Dame un resumen corto y la URL.

Nota: es un STUB (la lógica deriva el estado del patrón del RFC; sin API externa real todavía). La integración real con SAT/DOF/opinión 32-D es trabajo posterior. El "art. 29 Bis" está marcado como referencia a confirmar por abogado.
