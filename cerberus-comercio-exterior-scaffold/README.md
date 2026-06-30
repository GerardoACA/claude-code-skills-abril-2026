# Cerberus Comercio Exterior

Plataforma **multi-tenant** de cumplimiento y trazabilidad probatoria para agencias
aduanales y agentes de comercio exterior en México. Gestiona encargos conferidos,
expedientes KYC (Art. 1414), expedientes probatorios de despacho, vigilancia del
estado del CSD y alertas del artículo 69-B del CFF, con una cadena de evidencia
basada en hash SHA-256 y sello probatorio conectable.

> Este es el producto **nuevo** `cerberus-comercio-exterior`. **NO es SIDF**
> (`cerberus-sidf-mp`) ni `cerberus-platform`.

## Stack

- **Next.js 16** (App Router) + **TypeScript** estricto
- **Prisma 7** + **PostgreSQL** (con Row-Level Security)
- **NextAuth 4** (JWT con `tenantId` y `rol`)
- **Vitest** para pruebas
- Node 20+, gestor `npm`

## Características de seguridad

- **Aislamiento por inquilino con RLS:** la app se conecta con el rol
  `cerberus_ce_app` (sin `BYPASSRLS`). Las queries de datos de tenant corren dentro
  de `withTenant(tenantId, fn)`, que abre una transacción y fija
  `SET LOCAL app.tenant_id`. El `tenantId` proviene SIEMPRE del JWT verificado.
- **Bitácora de auditoría append-only** encadenada por hash (`sha256` + `hashPrev`).

## Prerrequisitos

- **Node.js 20 o superior** y **npm**.
- **PostgreSQL 14+** accesible localmente o por red.
- Cliente `psql` en el `PATH` (necesario para `npm run db:rls`).
- Dos roles de base de datos:
  - Un rol **owner/admin** con permisos DDL para migraciones y para aplicar el SQL de RLS.
  - El rol de aplicación **`cerberus_ce_app`** (lo crea `prisma/sql/02-app-role.sql`),
    al que apunta `DATABASE_URL` en runtime.

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar el entorno
cp .env.example .env
#    Edita .env: DATABASE_URL (rol cerberus_ce_app), NEXTAUTH_SECRET, NEXTAUTH_URL.

# 3. Aplicar el esquema (crea/actualiza tablas)
npm run db:migrate

# 4. Aplicar políticas RLS y crear el rol de aplicación
npm run db:rls

# 5. Cargar datos semilla
npm run db:seed

# 6. Ejecutar las pruebas (incluye el gate de fuga entre inquilinos)
npm test

# 7. Levantar el servidor de desarrollo
npm run dev
```

La aplicación queda disponible en http://localhost:3000.

## Scripts

| Script             | Descripción                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `npm run dev`      | Servidor de desarrollo de Next.js.                                 |
| `npm run build`    | Compilación de producción.                                         |
| `npm run start`    | Sirve la compilación de producción.                                |
| `npm run lint`     | Linter (eslint-config-next).                                       |
| `npm test`         | Suite Vitest (incluye `tests/tenant-leak.test.ts`).                |
| `npm run db:migrate` | `prisma migrate dev`: aplica/crea migraciones.                   |
| `npm run db:rls`   | Aplica los `.sql` de `prisma/sql/` (políticas RLS y rol de app).   |
| `npm run db:seed`  | Carga datos semilla con `tsx prisma/seed.ts`.                      |

## Integración continua

`/.github/workflows/ci.yml` ejecuta **lint** y **Vitest** en cada push y pull request.
La prueba **`tests/tenant-leak.test.ts` es un gate bloqueante**: si se detecta fuga de
datos entre inquilinos, el CI falla y el merge queda bloqueado.

## Convenciones del proyecto

- Cada archivo abre con la cabecera: `// CERBERUS COMERCIO EXTERIOR — <módulo>. NO es SIDF.`
- Alias de imports: `@/*` → `src/*`.
- El cliente de Prisma se importa SIEMPRE desde `@/lib/prisma` (singleton).
- Comentarios y textos de UI en español.
