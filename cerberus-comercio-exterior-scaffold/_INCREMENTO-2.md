# BLUEPRINT addendum — Incremento 2 (MVP demostrable: login + tablero + consentimiento)

> Contrato común para los agentes de este incremento. Para el producto NUEVO
> `cerberus-comercio-exterior`. **NO es SIDF.** Respeta las convenciones del `_BLUEPRINT.md`.

## Objetivo
Que la app sea **demostrable end-to-end**: un usuario inicia sesión y ve SOLO los datos de su
tenant (probando RLS en la UI), y puede registrar un consentimiento.

## Convenciones (además de las del _BLUEPRINT.md)
- **TypeScript build-safe:** este proyecto compila con `next build` (tsc estricto). Evita el
  widening de literales; anota tipos donde haga falta (ya nos mordió un error así). Nada de `any`.
- Auth: NextAuth 4 credentials; el `tenantId` y `rol` viajan en el JWT (ya cableado en `src/lib/auth.ts`).
- Password: hashing con `node:crypto` (scrypt), SIN dependencias nuevas. Módulo `src/lib/password.ts`.
- Lectura tenant-scoped SIEMPRE vía `withTenant`/`withTenantFromSession` de `@/lib/tenant-context`.

## Reparto de archivos (cada agente escribe solo lo suyo)
**Agente AUTH:**
- `src/lib/password.ts` — `hashPassword(plain)` y `verifyPassword(plain, stored)` con scrypt (node:crypto).
- `prisma/schema.prisma` — AÑADE `passwordHash String? @map("password_hash")` al modelo `Usuario` (dueño temporal del schema en este incremento; no toques otros modelos).
- `src/lib/auth.ts` — implementa el `authorize()` del CredentialsProvider: busca `Usuario` por email (sin contexto RLS, consulta directa a nivel sistema/o por email único), verifica password, y devuelve `{ id, email, tenantId, rol }`. Mantén los callbacks jwt/session que inyectan tenantId y rol.
- `src/app/login/page.tsx` — página de login simple en español (form email+password que llama a `signIn("credentials")`), y manejo de error.
- `prisma/seed.ts` — AÑADE al usuario demo un `passwordHash` (de una contraseña demo, p. ej. "demo1234"), y crea también 1 `Operacion` demo ligada al cliente demo, para que el tablero tenga datos.

**Agente DASHBOARD:**
- `src/app/dashboard/page.tsx` — Server Component protegido: si no hay sesión, redirige a `/login`. Con sesión, usa `withTenantFromSession` para listar los `Cliente` y `Operacion` del tenant, muestra el nombre del tenant y un botón de cerrar sesión. Deja claro visualmente "estás viendo solo los datos de tu tenant".
- `src/components/CerrarSesion.tsx` — botón client component que llama `signOut()`.
- `src/app/page.tsx` — actualiza la landing para enlazar a `/login`, `/dashboard` y `/aviso-privacidad`.

## Notas de coordinación
- El modelo `Usuario` (email, passwordHash, tenantId, rol) lo define el Agente AUTH; el Agente
  DASHBOARD solo LEE Cliente/Operacion, no toca Usuario ni el schema.
- No instalar node_modules; el entorno local corre `npm install`/`build`/`test` después.
- Al terminar, cada agente devuelve la lista de archivos creados/modificados.
