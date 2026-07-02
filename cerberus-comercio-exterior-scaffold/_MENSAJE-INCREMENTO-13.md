# Mensaje para el Claude local — Desplegar Incremento 13 (CFDI + Carta Porte 3.1) — CON MIGRACIÓN

> CFDI de Traslado con complemento Carta Porte 3.1 por operación: captura con validaciones del
> estándar (CP, placas, claves, fechas, RFC), borrador sellado (SHA-256 + bitácora encadenada),
> y conector TimbradorPac enchufable (NoOp hoy; el PAC real del cliente se conecta después).
> Cancelación (motivos M01-M04) modelada desde el inicio (decisión C8).

---

Despliega el Incremento 13 (CFDI + Carta Porte 3.1 con conector PAC) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (model ComprobanteCfdi + 4 enums, tabla tenant-scoped). Migración local + Neon + re-RLS (patrón rodado).

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh, docs y next-env.d.ts. (Tras el backport ya no debe haber regresiones; si el diff muestra alguna, repórtala.)

3) cd al producto; npm install.

4) MIGRACIÓN LOCAL:
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name comprobante_cfdi
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

5) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

6) git add -A && git commit -m "Incremento 13: CFDI + Carta Porte 3.1 (validaciones, borrador sellado, conector PAC)" && git push

7) MIGRACIÓN EN NEON:
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

8) npx vercel --prod

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   a. Operación → "CFDI / Carta Porte →": captura un traslado con datos INVÁLIDOS (CP de 4
      dígitos, placa con guiones raros, fechaLlegada < fechaSalida) → la lista de errores
      {campo, mensaje} debe pintarse clara.
   b. Corrige los datos → 201: el comprobante aparece como BORRADOR con su sha256, y el evento
      CFDI_BORRADOR queda en la bitácora (visible en el exporte probatorio de la operación).
   c. Botón "Timbrar" → mensaje honesto del conector: "Conector PAC no configurado; el
      comprobante queda en BORRADOR sellado" (detallePac) + evento CFDI_TIMBRAR_INTENTO.
   d. Botón "Cancelar" sobre el BORRADOR → 409 con mensaje claro (solo se cancela lo TIMBRADO).
   Dame un resumen corto y la URL.

Nota: la tabla comprobante_cfdi ES tenant-scoped → debe quedar con RLS (el 01 dinámico la
protege; confirma en la salida "tablas protegidas" que el conteo subió).
