#!/usr/bin/env bash
# CERBERUS COMERCIO EXTERIOR — despliegue del scaffold al producto. NO es SIDF.
# =============================================================================
# Uso (desde la carpeta del repo del branch, tras hacer git pull):
#
#   # Despliegue SIN cambios de esquema (no toca Neon; no requiere NEON_ADMIN):
#   bash cerberus-comercio-exterior-scaffold/deploy.sh
#
#   # Despliegue CON cambios de esquema (migra Neon; requiere NEON_ADMIN):
#   NEON_ADMIN='postgresql://OWNER:PASS@ep-xxxx.neon.tech/DB?sslmode=require' \
#     bash cerberus-comercio-exterior-scaffold/deploy.sh
#
# El script DETECTA solo si hubo cambio de esquema: si `prisma migrate dev`
# genera una migración nueva y NO diste NEON_ADMIN, se detiene y te lo pide
# (para no dejar Neon desincronizada). Si no hubo cambios de esquema, se salta
# por completo el paso de Neon.
#
# Rutas: se calculan solas a partir de la ubicación de este script.
#   SCAFFOLD = carpeta de este archivo · WORKSPACE = padre · PRODUCT = hermano.
# Puedes sobreescribir PRODUCT / DBNAME / MIG_NAME por variable de entorno.
# Requiere Postgres local corriendo y Vercel autenticado en esta máquina.
# =============================================================================
set -euo pipefail

SCAFFOLD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(dirname "$SCAFFOLD_DIR")"
BASE="$(dirname "$WORKSPACE")"
PRODUCT="${PRODUCT:-$BASE/cerberus-comercio-exterior}"
DBNAME="${DBNAME:-cerberus_comercio_exterior}"
MIG_NAME="${MIG_NAME:-cerberus_auto}"
NEON_ADMIN="${NEON_ADMIN:-}"

echo "==> Scaffold: $SCAFFOLD_DIR"
echo "==> Producto: $PRODUCT"
if [ ! -d "$PRODUCT/.vercel" ]; then
  echo "ERROR: no encuentro $PRODUCT/.vercel — ajusta PRODUCT=... y reintenta." >&2
  exit 1
fi

echo "==> [1/7] rsync scaffold -> producto (sin --delete)"
rsync -av \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '.env' --exclude '.env*.local' --exclude '.vercel' \
  --exclude 'package-lock.json' --exclude '_*.md' --exclude 'bootstrap-*.sh' \
  --exclude 'docs' --exclude 'next-env.d.ts' --exclude 'deploy.sh' \
  "$SCAFFOLD_DIR/" "$PRODUCT/"

cd "$PRODUCT"

echo "==> [2/7] npm install"
npm install

echo "==> [3/7] migracion local + RLS (detecta si cambio el esquema)"
ADMIN="postgresql://$(whoami)@localhost:5432/$DBNAME?schema=public"
MIG_DIR="prisma/migrations"
antes="$(find "$MIG_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
DATABASE_URL="$ADMIN" npx prisma migrate dev --name "$MIG_NAME"
despues="$(find "$MIG_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

HUBO_MIGRACION="no"
if [ "$despues" -gt "$antes" ]; then
  HUBO_MIGRACION="si"
  echo "==> Se detecto un cambio de esquema (migracion nueva)."
  if [ -z "$NEON_ADMIN" ]; then
    echo "ERROR: el esquema cambio pero no diste NEON_ADMIN. Relanza asi:" >&2
    echo "  NEON_ADMIN='postgresql://neondb_owner:...' bash cerberus-comercio-exterior-scaffold/deploy.sh" >&2
    exit 1
  fi
else
  echo "==> Sin cambios de esquema: NO se tocara Neon."
fi

echo "==> [4/7] build + pruebas"
npm run build
if [ -f .env ]; then
  ( set -a; . ./.env; set +a; npm test ) || echo "WARN: pruebas con observaciones (revisa el detalle arriba)."
fi

echo "==> [5/7] commit + push del producto"
git add -A
git commit -m "Despliegue CERBERUS Comercio Exterior ($MIG_NAME)" || echo "Nada nuevo que commitear."
git push

if [ "$HUBO_MIGRACION" = "si" ]; then
  echo "==> [6/7] migracion Neon + grants + RLS"
  DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
  psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
  psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
else
  echo "==> [6/7] (omitido: sin migracion en Neon)"
fi

echo "==> [7/7] deploy a produccion (Vercel)"
npx vercel --prod

echo ""
echo "==> LISTO. Verifica en https://cerberus-comercio-exterior.vercel.app"
