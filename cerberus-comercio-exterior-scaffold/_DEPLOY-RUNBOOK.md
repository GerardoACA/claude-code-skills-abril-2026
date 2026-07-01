# RUNBOOK de despliegue — CERBERUS COMERCIO EXTERIOR (para ejecutar en la Mac)

> **Para el Claude local (o quien ejecute en la Mac).** Objetivo: dejar la app funcionando en
> vivo en Vercel, con login, tablero multi-tenant y consentimiento, contra una base Neon nueva.
> **NO es SIDF.** No toques cerberus-sidf-mp ni cerberus-platform.
>
> **El usuario NO quiere usar la terminal.** Ejecuta esto de forma autónoma. Usa las herramientas
> de navegador si hace falta (como en MICN/SIDF). Solo pregúntale si quedas realmente bloqueado
> (p. ej. un clic en el dashboard de Vercel que no se pueda hacer por CLI). Corre `npm run build`
> y `npm test` y **arregla cualquier error de tipos/tests** antes de desplegar.

## Rutas
- Repo de conocimiento (andamiaje fuente): `~/Desktop/cerberus-workspace/claude-code-skills-abril-2026`
- Producto: `~/Desktop/cerberus-workspace/cerberus-comercio-exterior`

---

## FASE 1 — Sincronizar el código nuevo al producto

```bash
cd ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026
git checkout claude/arquitecto-j0mw1x && git pull origin claude/arquitecto-j0mw1x

# Copiar el andamiaje al producto SIN pisar .git/.env/.vercel/node_modules
rsync -av --delete \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='.env' --exclude='.vercel' --exclude='package-lock.json' \
  --exclude='_*.md' --exclude='bootstrap-*.sh' \
  cerberus-comercio-exterior-scaffold/ \
  ~/Desktop/cerberus-workspace/cerberus-comercio-exterior/
```

## FASE 2 — Build + base local + pruebas

```bash
cd ~/Desktop/cerberus-workspace/cerberus-comercio-exterior
npm install

# Migrar (por si cambió el schema). Usa un rol admin local para DDL:
ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
DATABASE_URL="$ADMIN" npx prisma migrate dev --name incremento2

# Aplicar RLS + rol app + política de login (como admin). ORDEN: 01, 02, 03.
psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/03-auth-lookup.sql

# Sembrar (como admin, incluye usuario demo con passwordHash y operación demo)
DATABASE_URL="$ADMIN" npx tsx prisma/seed.ts

# Verificar que compila y pasan las pruebas (ARREGLA errores si aparecen):
npm run build
set -a; source .env; set +a; npm test
```
> Si `npm run build` marca un error de tipos, corrígelo (patrón: anota tipos, evita widening de
> literales). Si un test RLS falla, revisa el orden de los .sql. Si el **login** no funciona en
> local (`npm run dev`, probar admin@demo.mx / demo1234), revisa que `03-auth-lookup.sql` se
> aplicó y que `authorize()` consulta `usuario` SIN contexto de tenant.

## FASE 3 — Guardar en GitHub

```bash
git add -A && git commit -m "Incremento 2: login, tablero multi-tenant, consentimiento, auth-RLS policy"
git push
```

## FASE 4 — Base de datos Neon (vía Vercel) + variables

1. **Crear Postgres en Vercel:** dashboard de Vercel → proyecto `cerberus-comercio-exterior` →
   pestaña **Storage** → **Create Database** → **Postgres (Neon)** → región US East → conéctala al
   proyecto. Esto inyecta variables `DATABASE_URL`/`POSTGRES_*`. (Si puedes por CLI/navegador,
   hazlo; si no, es el único punto donde quizá necesites confirmar con el usuario.)
2. **Obtener la cadena de conexión** de esa base (Neon owner) y montar el esquema:
   ```bash
   NEON_ADMIN="<cadena owner de la base Neon nueva, conexión DIRECTA no pooled>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   # crear rol de app en Neon (owner tiene CREATEROLE); usa una clave fuerte:
   APPPASS="$(openssl rand -hex 16)"
   psql "$NEON_ADMIN" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cerberus_ce_app') THEN CREATE ROLE cerberus_ce_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END \$\$;"
   psql "$NEON_ADMIN" -c "ALTER ROLE cerberus_ce_app PASSWORD '${APPPASS}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;"
   psql "$NEON_ADMIN" -c "GRANT USAGE ON SCHEMA public TO cerberus_ce_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -f prisma/sql/01-enable-rls-policies.sql
   psql "$NEON_ADMIN" -f prisma/sql/03-auth-lookup.sql
   DATABASE_URL="$NEON_ADMIN" npx tsx prisma/seed.ts   # datos demo en prod
   # URL de la app (rol app) para Vercel:
   APPURL="postgresql://cerberus_ce_app:${APPPASS}@${NEON_ADMIN#*@}"
   echo "DATABASE_URL para Vercel = $APPURL"
   ```
   > Nota Neon: no hay superusuario; por eso el login usa la POLÍTICA `usuario_auth_read`
   > (03-auth-lookup.sql), no una función SECURITY DEFINER (que quedaría sujeta a FORCE RLS).
3. **Variables en Vercel** (CLI, autenticado):
   ```bash
   printf '%s' "$APPURL" | npx vercel env add DATABASE_URL production
   openssl rand -base64 32 | npx vercel env add NEXTAUTH_SECRET production
   printf '%s' "https://cerberus-comercio-exterior.vercel.app" | npx vercel env add NEXTAUTH_URL production
   ```
   (Si Vercel ya inyectó un DATABASE_URL de la integración, SOBREESCRÍBELO con el del rol app.)

## FASE 5 — Redesplegar y verificar

```bash
npx vercel --prod
```
Verifica en `https://cerberus-comercio-exterior.vercel.app`:
- `/` landing con enlaces.
- `/aviso-privacidad` carga.
- `/login` → entra con **admin@demo.mx / demo1234** → llega a `/dashboard`.
- `/dashboard` muestra SOLO los datos del tenant demo (clientes y operaciones).

## Pendiente menor (opcional)
- Reconectar el repo de GitHub con Vercel (Settings → Git) para auto-deploy en cada push.

## Credenciales demo
- Usuario: **admin@demo.mx** · Contraseña: **demo1234**
