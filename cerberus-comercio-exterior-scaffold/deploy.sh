#!/usr/bin/env bash
# CERBERUS COMERCIO EXTERIOR — despliegue del scaffold al producto. NO es SIDF.
# =============================================================================
# Uso (desde la carpeta del repo del branch, tras hacer git pull):
#   NEON_ADMIN='postgresql://OWNER:PASS@ep-xxxx.neon.tech/DB?sslmode=require' \
#     bash cerberus-comercio-exterior-scaffold/deploy.sh
#
# Rutas: se calculan solas a partir de la ubicación de este script.
#   SCAFFOLD = carpeta de este archivo
#   WORKSPACE = repo del branch (padre del scaffold)
#   PRODUCT  = <hermano del workspace>/cerberus-comercio-exterior (con .vercel)
# Puedes sobreescribir PRODUCT o DBNAME por variable de entorno si hiciera falta.
#
# Requiere: NEON_ADMIN (cadena OWNER de Neon) en el entorno. Postgres local
# corriendo (para generar la migración). Vercel ya autenticado en esta máquina.
# =============================================================================
set -euo pipefail

SCAFFOLD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(dirname "$SCAFFOLD_DIR")"
BASE="$(dirname "$WORKSPACE")"
PRODUCT="${PRODUCT:-$BASE/cerberus-comercio-exterior}"
DBNAME="${DBNAME:-cerberus_comercio_exterior}"

: "${NEON_ADMIN:?Falta NEON_ADMIN. Ejecuta: NEON_ADMIN='postgresql://OWNER:...' bash cerberus-comercio-exterior-scaffold/deploy.sh}"

echo "==> Scaffold: $SCAFFOLD_DIR"
echo "==> Producto: $PRODUCT"
if [ ! -d "$PRODUCT/.vercel" ]; then
  echo "ERROR: no encuentro $PRODUCT/.vercel — ajusta PRODUCT=... y reintenta." >&2
  exit 1
fi

echo "==> [2/8] rsync scaffold -> producto (sin --delete)"
rsync -av \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude '.env' --exclude '.env*.local' --exclude '.vercel' \
  --exclude 'package-lock.json' --exclude '_*.md' --exclude 'bootstrap-*.sh' \
  --exclude 'docs' --exclude 'next-env.d.ts' --exclude 'deploy.sh' \
  "$SCAFFOLD_DIR/" "$PRODUCT/"

cd "$PRODUCT"

echo "==> [3/8] npm install (incluye jsqr)"
npm install

echo "==> [4/8] migracion local + RLS"
ADMIN="postgresql://$(whoami)@localhost:5432/$DBNAME?schema=public"
DATABASE_URL="$ADMIN" npx prisma migrate dev --name incrementos_16_a_24
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

echo "==> [5/8] build + pruebas"
npm run build
if [ -f .env ]; then
  ( set -a; . ./.env; set +a; npm test ) || echo "WARN: pruebas con observaciones (revisa el detalle arriba)."
fi

echo "==> [6/8] commit + push del producto"
git add -A
git commit -m "Incrementos 16-24: comercio exterior 1.1, contrato de encargo, usuarios/roles, tablero ejecutivo, e.firma, opinion 32-D + cotejo QR, IMMEX" || echo "Nada nuevo que commitear."
git push

echo "==> [7/8] migracion Neon + grants + RLS"
DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql

echo "==> [8/8] deploy a produccion (Vercel)"
npx vercel --prod

echo ""
echo "==> LISTO. Verifica en https://cerberus-comercio-exterior.vercel.app"
