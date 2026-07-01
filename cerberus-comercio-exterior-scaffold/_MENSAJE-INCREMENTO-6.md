# Mensaje para el Claude local — Desplegar Incremento 6 (Trámite del despacho) — CON MIGRACIÓN

> Pega este bloque en tu Claude local. ESTE incremento cambia la base (modelo PasoDespacho),
> así que hay migración en local Y Neon + re-aplicar RLS. Mismo patrón que el Incremento 5.

---

Despliega el Incremento 6 (Trámite del despacho: MVE/E2, COVE, Prevalidación, Pago y DODA por operación) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error de build o pruebas.

IMPORTANTE: CAMBIA EL SCHEMA (modelo PasoDespacho + enum TipoPaso). Hay migración y re-RLS. Orden exacto:

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name paso_despacho
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) BUILD + PRUEBAS (arregla errores tú mismo):
   npm run build
   set -a; source .env; set +a; npm test

6) git add -A && git commit -m "Incremento 6: Tramite del despacho (MVE, COVE, prevalidacion, pago, DODA)" && git push

7) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner directa de la base Neon del producto; vercel env pull o tu registro>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - Entra a Operaciones → una operación → "Trámites del despacho →"
   - Registra un paso (p. ej. PAGO con un monto, o MVE con un acuse) y confirma que aparece en el checklist.
   Dame un resumen corto y la URL.

Nota: la tabla nueva paso_despacho debe quedar con RLS y con GRANTS al rol cerberus_ce_app (por eso se re-corren 02 y 01). Confirma que la política usuario_auth_read sigue y que el login funciona.
