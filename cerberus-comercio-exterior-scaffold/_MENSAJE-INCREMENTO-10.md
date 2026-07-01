# Mensaje para el Claude local — Desplegar Incremento 10 (Listados reales del SAT) — CON MIGRACIÓN

> Trae la verificación de cumplimiento REAL: sincroniza los listados públicos del SAT
> (69 / 69-B / 69-B Bis / 49 Bis) y coteja el RFC del cliente contra datos oficiales con
> snapshot sellado. Migración: 2 tablas GLOBALES nuevas (sin tenant_id, por diseño).

---

Despliega el Incremento 10 (integración real de listados SAT) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (modelos globales ImportacionListadoSat y ListadoSatEntrada, SIN tenant_id — es referencia pública compartida, NO les apliques policy de tenant; el script 01 de RLS solo protege tablas con tenant_id, así que déjalo hacer lo suyo).

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name listados_sat
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) OPCIONAL PERO VALIOSO — localizar URLs de listados: la de 69-B ya tiene default
   (http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv). Si puedes,
   localiza y configura también (env en .env local y en Vercel): SAT_URL_69 (listado art. 69,
   p. ej. "no localizados"/"firmes" de datos abiertos del SAT), SAT_URL_69B_BIS y SAT_URL_49BIS
   (listado nuevo de la reforma 2026, publicado en el portal SAT). Si alguna no existe o no la
   encuentras, déjala sin configurar: la fuente mostrará NO_DISPONIBLE con detalle honesto.

7) git add -A && git commit -m "Incremento 10: listados reales SAT (sync + verificacion con snapshot)" && git push

8) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

9) Variables en Vercel: agrega las SAT_URL_* que hayas confirmado (npx vercel env add ... production).

10) npx vercel --prod

11) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
    a. Cliente → /cumplimiento: debe verse "Última sincronización de listados" (aún vacía) y,
       siendo ADMIN, el botón "Sincronizar listados". Púlsalo. El 69-B completo es grande
       (cientos de miles de filas): si Vercel corta por tiempo (504/límite), usa el fallback:
       corre la sincronización desde local apuntando a Neon (npm run dev con DATABASE_URL de
       Neon owner y curl -X POST http://localhost:3000/api/admin/listados con una sesión admin,
       o un script tsx equivalente). Documenta cuál método funcionó.
    b. Tras sincronizar: "Verificar todo" en un cliente demo (RFC inventado) → ART_69B debe dar
       AL_CORRIENTE con snapshotSha256 REAL (el sha del archivo CSV) y fecha de importación.
    c. Registra un cliente con un RFC que exista en el listado 69-B real (toma uno del propio
       CSV, situación "Definitivo") → "Verificar todo" → INHABILITADO_DEFINITIVO con alerta
       (y confirma que NADA se bloquea — C9).
    Dame un resumen corto: qué fuentes quedaron sincronizadas, filas importadas, y la URL.
