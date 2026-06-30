# Guía de arranque local — cerberus-comercio-exterior

> Pasos para crear el repo nuevo en GitHub, instalar el andamiaje y correrlo en tu Mac.
> Prerequisitos: **Node 20+**, **PostgreSQL** instalado y corriendo, **git** y (opcional) **gh** (GitHub CLI).

## Paso 1 — Traer el andamiaje actualizado a tu Mac
```bash
cd ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026
git pull origin claude/arquitecto-j0mw1x
```

## Paso 2 — Crear la carpeta del producto nuevo a partir del andamiaje
```bash
cd ~/Desktop/cerberus-workspace
cp -R claude-code-skills-abril-2026/cerberus-comercio-exterior-scaffold cerberus-comercio-exterior
cd cerberus-comercio-exterior
# (opcional) quitar la documentación interna del scaffold
rm -f _BLUEPRINT.md _INTEGRACION.md _GUIA-ARRANQUE-LOCAL.md
git init -b main
```

## Paso 3 — Crear el repo en GitHub y enlazarlo
Con GitHub CLI (lo más simple):
```bash
gh repo create cerberus-comercio-exterior --private --source=. --remote=origin
```
O manual (si ya lo creaste en la web):
```bash
git remote add origin https://github.com/GerardoACA/cerberus-comercio-exterior.git
```

## Paso 4 — Instalar dependencias
```bash
npm install
```

## Paso 5 — Configurar la base de datos
```bash
cp .env.example .env
# Edita .env: pon tu cadena de Postgres. Crea la base:
createdb cerberus_ce
```
> El `DATABASE_URL` de la app debe apuntar al rol **`cerberus_ce_app`** (sin BYPASSRLS).
> Para las migraciones, usa primero un rol con permisos de owner; ver `prisma/sql/README` y
> `prisma/sql/02-app-role.sql`.

## Paso 6 — Migrar, aplicar RLS y sembrar (EN ESTE ORDEN)
```bash
npm run db:migrate     # crea las tablas (como owner)
npm run db:rls         # aplica prisma/sql/02-app-role.sql y 01-enable-rls-policies.sql
npm run db:seed        # datos demo (1 tenant, 1 usuario, 1 cliente, 1 versión de aviso)
```
> ⚠️ El orden importa: las políticas RLS deben aplicarse DESPUÉS de crear las tablas y el rol.
> Detalle en `prisma/sql/` y en `README-rls` (de la base de conocimiento).

## Paso 7 — Correr las pruebas (incluye el gate de fuga de tenant)
```bash
npm test
```
Esperado: pasan los tests de la capa probatoria **y** los de **fuga de tenant** (RLS). Si los de
RLS fallan, casi siempre es porque no se aplicó `db:rls` o el `DATABASE_URL` no apunta al rol
`cerberus_ce_app`. Estos tests son el **gate bloqueante**: no subir a producción si fallan.

## Paso 8 — Arrancar la app y verla
```bash
npm run dev
# abre http://localhost:3000  y  http://localhost:3000/aviso-privacidad
```

## Paso 9 — Primer push
```bash
git add -A && git commit -m "Initial scaffold: cerberus-comercio-exterior MVP Fase 0/1"
git push -u origin main
```

---

## Si algo falla
- `prisma validate` / errores de schema → corre `npx prisma validate` y dime el error.
- Tests RLS en rojo → revisa orden del Paso 6 y el rol del `DATABASE_URL`.
- Cualquier traba, pégame la salida de la terminal y lo resolvemos.

## Recordatorios honestos
- Esto es un **andamiaje de arranque**: compila y está integrado, pero la única validación que
  corrió de verdad fueron los tests de la capa probatoria. El resto se prueba aquí, en local.
- Quedan pendientes **legales** (puntos *a confirmar* del aviso y el contrato) y **contratar
  el PSC/TSA** para activar la prueba oponible. El código ya los tiene "enchufables".
