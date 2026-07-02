# Mensaje para el Claude local — Desplegar Incremento 11 (Vigía) — SIN migración

> Monitoreo continuo: cron diario de Vercel que sincroniza los listados SAT y re-verifica a
> todos los clientes de todos los tenants, alertando en dashboard/bitácora cuando alguien
> empeora. NO cambia el schema. Requiere crear la env CRON_SECRET en Vercel.

---

Despliega el Incremento 11 (Vigía: cron diario de sincronización + barrido de re-verificación con alertas) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: el schema NO cambió → sin migración. Novedades: vercel.json con el cron y la variable CRON_SECRET.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs. (OJO: vercel.json SÍ debe copiarse — no está en las exclusiones.)

3) cd al producto; npm install; npx prisma generate.

4) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

5) CRON_SECRET:
   SECRET="$(openssl rand -hex 24)"
   printf '%s' "$SECRET" | npx vercel env add CRON_SECRET production
   echo "CRON_SECRET=$SECRET" >> .env   # para pruebas locales

6) git add -A && git commit -m "Incremento 11: vigia (cron diario de listados + barrido con alertas)" && git push

7) npx vercel --prod
   (vercel.json registra el cron /api/cron/vigia a las 12:00 UTC ≈ 6am CDMX; verifica en el
   dashboard de Vercel → Settings → Cron Jobs que aparezca.)

8) Verifica en vivo:
   a. Dispara el cron manualmente:
      curl -s -H "Authorization: Bearer $SECRET" https://cerberus-comercio-exterior.vercel.app/api/cron/vigia
      → debe responder { sync: [...], barrido: { tenants, clientes, alertas, detalles } }.
   b. Sin secreto → 401:
      curl -s -o /dev/null -w "%{http_code}" https://cerberus-comercio-exterior.vercel.app/api/cron/vigia
   c. En el dashboard (admin@demo.mx / demo1234): la sección "Alertas de cumplimiento (vigía)".
      Si en el Inc 10 registraste el cliente con RFC real del 69-B, su primera verificación ya
      quedó como baseline; el barrido solo alerta ante TRANSICIONES (empeoramientos nuevos).
      Para provocar una alerta de prueba: registra un cliente NUEVO con otro RFC real del
      listado 69-B (situación Definitivo) SIN verificarlo manualmente... nota: sin baseline no
      alerta; entonces verifícalo una vez manualmente cuando los listados AÚN no lo cubran no
      es posible — alternativa simple: acepta que las alertas aparecerán cuando el SAT publique
      cambios reales; para la demo basta confirmar que el endpoint corre y el dashboard muestra
      "Sin alertas del vigía".
   Dame un resumen corto: respuesta del cron (tenants/clientes barridos), estado del cron en
   Vercel, y la URL.
