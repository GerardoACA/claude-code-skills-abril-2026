# Mensaje para el Claude local — Desplegar Incremento 9.1 — CON MIGRACIÓN (enum)

> Trae 3 cosas en un solo despliegue: (A) cotejo del dossier alcanzable (X-Dossier-Match: true
> cuando no hay actividad posterior), (B) fuente ART_29BIS renombrada a **ART_49BIS** (art. 49
> Bis CFF, confirmado por dictamen legal), y (C) el Aviso de Privacidad corregido conforme a la
> LFPDPPP 2025 (arts. 9/36, garante = Secretaría Anticorrupción y Buen Gobierno).

---

Despliega el Incremento 9.1 del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (rename del valor de enum FuenteVerificacion: ART_29BIS → ART_49BIS). Hay migración local + Neon + re-RLS. Los registros stub existentes con ART_29BIS pueden migrarse o eliminarse (son datos demo); si prisma migrate propone drop+add del valor, acéptalo.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   # Si hay filas stub con ART_29BIS que estorben el rename, elimínalas primero (datos demo):
   #   psql -d cerberus_comercio_exterior -c "DELETE FROM verificacion_cumplimiento WHERE fuente='ART_29BIS';"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name art49bis_y_cotejo_dossier
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) git add -A && git commit -m "Incremento 9.1: cotejo dossier alcanzable, ART_49BIS, aviso LFPDPPP 2025" && git push

7) MIGRACIÓN EN NEON (mismo tratamiento para filas stub si estorban):
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   a. Crea una operación nueva, llévala a ROJO (dossier automático) y descárgalo SIN hacer nada
      más: X-Dossier-Match debe ser **true** ahora. Registra luego un paso y vuelve a descargar:
      debe ser **false** (actividad posterior real — correcto).
   b. En un cliente → /cumplimiento → "Verificar todo": la tabla debe decir **"Art. 49 Bis CFF"**.
   c. /aviso-privacidad: la sección de transferencias debe citar **arts. 9 y 36 LFPDPPP 2025** y
      la sección 10 a la **Secretaría Anticorrupción y Buen Gobierno**.
   Dame un resumen corto y la URL.
