# BLUEPRINT compartido — andamiaje CERBERUS COMERCIO EXTERIOR (producto nuevo)

> Contrato común para TODOS los agentes de construcción. Respétalo al pie de la letra para que
> las piezas encajen sin conflicto. **Esto es para el producto NUEVO `cerberus-comercio-exterior`,
> NO para SIDF (cerberus-sidf-mp) ni para cerberus-platform.**

## Stack (alineado al ecosistema existente para poder compartir paquetes a futuro)
- **Next.js 16** (App Router) + **TypeScript** (strict)
- **Prisma 7** + **PostgreSQL**
- **NextAuth 4** (JWT con `tenantId` y `rol`)
- **Vitest** para pruebas
- Node 20+, gestor `npm`

## Árbol de archivos OBJETIVO (cada agente escribe SOLO lo suyo; no toca lo de otros)
```
cerberus-comercio-exterior-scaffold/
├── package.json                      [Agente A]
├── tsconfig.json                     [Agente A]
├── next.config.ts                    [Agente A]
├── vitest.config.ts                  [Agente A]
├── .env.example                      [Agente A]
├── .gitignore                        [Agente A]
├── README.md                         [Agente A]
├── .github/workflows/ci.yml          [Agente A]  (corre lint + vitest, incl. tenant-leak)
├── prisma/
│   ├── schema.prisma                 [Agente B]  (ÚNICO dueño del schema; incluye TODOS los modelos)
│   ├── seed.ts                       [Agente B]
│   └── sql/
│       ├── 01-enable-rls-policies.sql [Agente D]
│       └── 02-app-role.sql            [Agente D]
├── src/
│   ├── app/
│   │   ├── layout.tsx                 [Agente A]
│   │   ├── page.tsx                   [Agente A]
│   │   ├── aviso-privacidad/page.tsx  [Agente C]
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts [Agente D]
│   │       └── consentimiento/route.ts     [Agente C]
│   ├── components/
│   │   ├── AvisoPrivacidadIntegral.tsx [Agente C]
│   │   └── ConsentimientoCaptura.tsx   [Agente C]
│   ├── lib/
│   │   ├── prisma.ts                  [Agente A]
│   │   ├── auth.ts                    [Agente D]
│   │   ├── tenant-context.ts          [Agente D]
│   │   └── probatoria/
│   │       ├── hash.ts                [Agente E]
│   │       ├── hash-chain.ts          [Agente E]
│   │       ├── sellador-calificado.ts [Agente E]
│   │       └── exporte-probatorio.ts  [Agente E]
│   └── content/
│       └── aviso-privacidad-v2.md     [Agente C]  (copia del aviso v2)
└── tests/
    ├── tenant-leak.test.ts            [Agente D]
    └── probatoria.test.ts             [Agente E]
```

## Convenciones DURAS (no negociables, para sincronía)
- **Multi-tenant:** toda tabla tenant-scoped tiene `tenantId String` mapeado a columna `tenant_id`
  (`@map("tenant_id")`). Modelo raíz `Tenant`.
- **Datasource Prisma:** `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`.
  Variable de entorno del rol de app: `DATABASE_URL` apunta al rol **`cerberus_ce_app`** (sin BYPASSRLS).
- **Cliente Prisma:** se importa SIEMPRE desde `@/lib/prisma` (singleton).
- **Contexto de tenant:** las queries con datos de tenant corren dentro de `withTenant(tenantId, fn)`
  de `@/lib/tenant-context` (abre transacción + `SET LOCAL app.tenant_id`). El `tenantId` SIEMPRE
  proviene del JWT verificado, NUNCA del body del request.
- **Hashing:** SHA-256 (hex, 64 chars) vía `@/lib/probatoria/hash`. Prohibido inventar otro.
- **Sello probatorio:** interfaz `SelladorCalificado` con impl `NoOp` (default) y `PSC_TSA` (stub
  conectable). Estado del artefacto: `EVIDENCIA_PRELIMINAR` | `PRUEBA_OPONIBLE`.
- **Paths TS:** alias `@/*` → `src/*` (configúralo en tsconfig — Agente A).
- **Idioma:** comentarios y textos de UI en español. Nombres de símbolos en código pueden ser ES/EN consistentes.
- **Cabecera de archivo:** cada archivo abre con un comentario: `// CERBERUS COMERCIO EXTERIOR — <módulo>. NO es SIDF.`

## Modelos Prisma mínimos que el Agente B DEBE incluir (Fase 0/1, con "reserva" del v2)
`Tenant`, `Usuario`, `ContratoEncargo`, `Cliente` (importador; `estadoCsd`, `etapa69b`),
`Patente`, `PersonaFisicaAutorizada`, `EncargoConferido` (vigencia/estado),
`ExpedienteKyc1414`, `ExpedienteProbatorioDespacho`, `ExpedienteDoble3142`,
`Documento` (`sha256`, `estadoProbatorio`, `vence`), `Operacion` + `EstadoDespacho` (enum),
`Partida` (reservada: `fraccionDeclarada`, `nico`, `valorDeclarado`),
`Alerta69b` (enum 6 estados), `VersionAviso`, `ConsentimientoDatos` (alinear con el módulo de privacidad),
`BitacoraAuditoria` (append-only: `sha256`, `hashPrev`, `actor`, `accion`).
Todas (salvo `Tenant`) llevan `tenantId @map("tenant_id")`.

## Fuentes a reutilizar (ya existen en este repo de conocimiento; adáptalas, no las reinventes)
- Aviso v2 y aviso corto: `CERBERUS-COMERCIO-EXTERIOR/07-privacidad-datos-personales/aviso-privacidad-CE-v2.md` y `...-corto-captura.md`
- Implementación de privacidad ya generada: `CERBERUS-COMERCIO-EXTERIOR/07-privacidad-datos-personales/implementacion-ce/*`
- RLS ya generado: `CERBERUS-COMERCIO-EXTERIOR/99-arquitectura-software/implementacion-fase0/rls/*`
- Diseño v2 (modelo de datos §4): `CERBERUS-COMERCIO-EXTERIOR/99-arquitectura-software/diseno-v2-cerberus.md`

## Dependencias que el Agente A DEBE declarar en package.json
runtime: `next@^16`, `react@^19`, `react-dom@^19`, `@prisma/client@^7`, `next-auth@^4`, `zod`.
dev: `typescript`, `prisma@^7`, `vitest`, `@types/node`, `@types/react`, `eslint`, `eslint-config-next`, `tsx`.
scripts: `dev`, `build`, `start`, `lint`, `test` (vitest run), `db:migrate` (prisma migrate dev),
`db:seed` (tsx prisma/seed.ts), `db:rls` (psql aplicando prisma/sql/*.sql).

## Regla de oro
Si algo no está en este blueprint, elige el default más simple y coherente con lo de arriba.
No bloquees esperando confirmación. Deja TODO listo para `npm install && npm run db:migrate && npm test`.
