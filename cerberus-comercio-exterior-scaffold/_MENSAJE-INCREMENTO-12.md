# Mensaje para el Claude local — Desplegar Incremento 12 (Ingesta manual + sanciones internacionales) — CON MIGRACIÓN

> Trae: (1) ingesta MANUAL de listados por CSV (69-B Bis, 49 Bis, refrescos), (2) nueva fuente
> SANCIONES_INT (OFAC/ONU/UE/UK) con match por nombre = SIEMPRE alerta con revisión humana,
> (3) página /admin/listados. Migración: enum + columnas origen/emisor + rfc opcional.

---

Despliega el Incremento 12 (ingesta manual de listados + sanciones internacionales) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (valor SANCIONES_INT en FuenteVerificacion; ImportacionListadoSat.origen y .emisor; ListadoSatEntrada.rfc pasa a opcional + índice por razonSocial). Migración local + Neon.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs (vercel.json SÍ se copia).

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name ingesta_manual_sanciones
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) git add -A && git commit -m "Incremento 12: ingesta manual de listados + sanciones internacionales" && git push

7) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   a. Dashboard → "Listados (admin)" → /admin/listados: tabla de importaciones + sincronización + INGESTA MANUAL.
   b. Prueba de sanciones: crea un CSV pequeño de prueba (columnas NOMBRE,SITUACION; una fila con
      la razón social EXACTA de un cliente demo) y súbelo como fuente SANCIONES_INT con emisor
      "OFAC (prueba)". Luego en ese cliente → "Verificar todo" → SANCIONES_INT debe dar ALERTA
      con "coincidencia por NOMBRE (heurística); requiere revisión humana" y nada bloqueado.
   c. Prueba de ingesta 69-B Bis: si localizas el CSV publicado del 69-B Bis (o usa un extracto),
      súbelo como ART_69B_BIS → la fuente deja de ser NO_DISPONIBLE y muestra origen MANUAL con
      sha real del archivo.
   Dame un resumen corto: qué se ingirió, filas, y la URL.
