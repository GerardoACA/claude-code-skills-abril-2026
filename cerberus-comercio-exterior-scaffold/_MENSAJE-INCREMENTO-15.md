# Mensaje para el Claude local — Desplegar Incremento 15 (Override firmado de alertas) — CON MIGRACIÓN

> Decisión C11 del cliente + hallazgo crítico del penalista del panel: cuando el responsable
> decide continuar pese a una alerta adversa, el acto queda MOTIVADO (mín. 20 chars), atribuido,
> sellado (sha256) y encadenado en bitácora, con conector FirmadorEfirma (NoOp honesto hoy; la
> FIEL del lado del titular se integra con las APIs del cliente). El override NUNCA altera la
> alerta: la acompaña.

---

Despliega el Incremento 15 (Override firmado de alertas) del producto NUEVO cerberus-comercio-exterior. NO es SIDF. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (model OverrideAlerta + enum EstadoFirmaOverride, tenant-scoped). Migración local + Neon + re-RLS (patrón rodado; las tablas protegidas deben subir de 19 → 20).

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto (exclusiones de siempre: .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh, docs, next-env.d.ts).

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name override_alerta
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build y (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) git add -A && git commit -m "Incremento 15: override firmado de alertas (C11)" && git push

7) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   a. Abre el cliente con el RFC real del 69-B (INHABILITADO_DEFINITIVO) → /cumplimiento: debe
      aparecer el OverrideForm (porque hay resultado adverso).
   b. Intenta un override con motivo de 5 caracteres → 400 con detalle.
   c. Registra un override con motivo válido (>20 chars) → aparece en "Overrides registrados"
      con actor, estadoFirma SIN_FIRMA y su nota honesta; evento OVERRIDE_ALERTA en la bitácora
      (visible en exporte). La alerta original NO cambia.
   Dame un resumen corto y la URL.
