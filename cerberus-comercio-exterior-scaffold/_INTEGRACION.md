# Reporte de integración — andamiaje cerberus-comercio-exterior

> **Fecha:** 30 de junio de 2026 · Construido por 5 agentes en paralelo bajo `_BLUEPRINT.md`.
> **Resultado:** integración **coherente**; los seams entre capas encajan sin cambios de código.

## Verificación de seams (cross-agente)
| Seam | Productor | Consumidor | Estado |
|------|-----------|-----------|--------|
| `withTenantFromSession(session, fn)` | D (`src/lib/tenant-context.ts`) | C (`api/consentimiento`) | ✅ existe y firma correcta |
| `authOptions` | D (`src/lib/auth.ts`) | C (`api/consentimiento`, `api/auth`) | ✅ |
| `sha256()` | E (`src/lib/probatoria/hash.ts`) | C, tests | ✅ |
| Campos `VersionAviso` (`version`, `hashAviso`) | B (`schema.prisma`) | C (route) | ✅ |
| Campos `ConsentimientoDatos` (`titularRef`, `versionAvisoEtiqueta`, `selloRegistro`, …) | B | C | ✅ |
| Campos `Cliente.rfc/razonSocial`, `Operacion.referencia/clienteId` | B | D (`tenant-leak.test.ts`) | ✅ |
| Augmentación de tipos NextAuth (`session.user.tenantId`) | D (`auth.ts`) | C | ✅ |
| Cobertura RLS dinámica por columna `tenant_id` | D (`sql/01`, test) | B (schema) | ✅ se autoajusta a los `@@map` de B |

## Lo que SÍ se validó
- `package.json` / `tsconfig.json` parsean; alias `@/*` resuelto en `tsconfig` y `vitest`.
- Relaciones Prisma simétricas (auditoría manual del Agente B).
- **Tests de la capa probatoria: 16/16 pasaron** (Agente E los corrió contra el código real).
- Cada archivo lleva la cabecera `// CERBERUS COMERCIO EXTERIOR … NO es SIDF.`

## Lo que NO se pudo validar aquí (hay que correrlo en local)
- `npm install` no fue posible en el sandbox (registro npm no alcanzable). Por lo tanto:
  - `npx prisma validate` y `prisma migrate` **no se ejecutaron** → correrlos en local.
  - Los **tests de fuga de tenant (RLS)** requieren una base Postgres real → correrlos en local.
- El repo `cerberus-comercio-exterior` en GitHub **no se pudo crear desde la nube** (403 de alcance);
  se crea en local (ver `_GUIA-ARRANQUE-LOCAL.md`).

## Pendientes heredados (no son de código)
- Puntos legales *"a confirmar por abogado humano colegiado"* del aviso v2 y del contrato de encargo
  (art. 37 LFPDPPP, órgano garante, plazos aduaneros).
- Contratar PSC/TSA (Cincel) para que la capa probatoria pase de `EVIDENCIA_PRELIMINAR` a
  `PRUEBA_OPONIBLE` (el gancho `SelladorPscTsa` ya está, falta el proveedor real).
