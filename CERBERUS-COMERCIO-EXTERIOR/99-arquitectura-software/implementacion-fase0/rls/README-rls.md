# RLS multi-tenant — CERBERUS COMERCIO EXTERIOR (Fase 0)

> **Producto:** CERBERUS COMERCIO EXTERIOR (SaaS nuevo, en construcción).
> **NO es para SIDF** (`cerberus-sidf-mp`, producto fiscal en producción). SIDF se
> usa solo como referencia conceptual; nada aquí lo modifica. Ver nota de retrofit
> al final.
> **Roles LFPDPPP:** Responsable = tenant; Encargado = CERBERUS COMERCIO EXTERIOR.

Esta carpeta implementa el **aislamiento estructural entre clientes (tenants)** con
**Row Level Security (RLS) real de PostgreSQL**, cerrando la brecha que el
[informe de reconciliación §2.6](../../informe-reconciliacion.md) marcó como
**TUMBADA**: hoy el aislamiento es solo disciplina de aplicación (`WHERE tenantId = ...`),
no una garantía de la base de datos. El [diseño v2 §5 Fase 0 punto 3](../../diseno-v2-cerberus.md)
lo exige como condición bloqueante: *"ningún rol con BYPASSRLS, `tenant_id` validado
contra token, tests de fuga de tenant en CI como control probatorio."*

## Archivos

| Archivo | Qué hace |
|---|---|
| `01-enable-rls-policies.sql` | `ENABLE` + `FORCE ROW LEVEL SECURITY` y `CREATE POLICY tenant_isolation` para todas las tablas tenant-scoped del modelo v2 (Tenant, Cliente/Importador, Operacion, los 3 Expedientes, Documento, BitacoraAuditoria, etc.). Filtra por `current_setting('app.tenant_id')` vía helper `app_current_tenant_id()`. **Fail-closed**: sin contexto, no se ve nada. |
| `02-app-role.sql` | Crea el rol de aplicación `cerberus_ce_app` **SIN BYPASSRLS, SIN SUPERUSER**, separado del owner (`cerberus_ce_owner`). Grants DML; default privileges para tablas futuras. |
| `03-prisma-tenant-context.ts` | Capa de aplicación: deriva `tenant_id` **del JWT verificado** (nunca del cliente) y lo fija con `SET LOCAL` (`set_config(..., true)`) **por transacción** vía Prisma `$transaction`. |
| `04-tenant-leak.test.ts` | Suite de **tests de fuga de tenant** (lectura/escritura/insert/delete cruzados, fail-closed, atributos de rol). Diseñada como **gate bloqueante de CI** y control probatorio. |
| `README-rls.md` | Este documento: orden de aplicación, riesgos y nota de retrofit. |

## Cómo funciona el aislamiento (resumen)

1. El usuario se autentica; el JWT firmado lleva el claim `tenant_id`.
2. En cada request, la app **verifica el JWT** y extrae `tenant_id` del token
   (`tenantIdFromVerifiedToken`). **Nunca** se toma de headers, query o body.
3. La app abre una transacción y ejecuta
   `SELECT set_config('app.tenant_id', <tenant_del_token>, true)` (= `SET LOCAL`).
4. Toda query dentro de esa transacción la filtra Postgres con la política
   `tenant_isolation`: `tenant_id = app_current_tenant_id()`.
   - `USING` controla qué filas se ven/afectan (SELECT/UPDATE/DELETE).
   - `WITH CHECK` impide INSERT/UPDATE que pongan un `tenant_id` ajeno.
5. Como el rol `cerberus_ce_app` **no tiene BYPASSRLS** y las tablas usan
   `FORCE ROW LEVEL SECURITY`, **no hay ruta para evadir la política** desde la app.

## Por qué ningún rol de la app debe tener BYPASSRLS

`BYPASSRLS` (y `SUPERUSER`, que lo implica) hace que **todas las políticas RLS se
ignoren** para ese rol: una sola query vería *todos los tenants*. Eso reabre exactamente
la fuga que esta carpeta cierra y, en este dominio, es **catastrófico**: viola el
secreto fiscal (art. 69 CFF) y la LFPDPPP (ver [diseño v2 §7](../../diseno-v2-cerberus.md),
"Secreto fiscal multi-tenant"). Por eso:

- `cerberus_ce_app` se crea con `NOBYPASSRLS NOSUPERUSER` y se re-endurece de forma
  idempotente en `02-app-role.sql`.
- El test `ningún rol de la app tiene BYPASSRLS ni SUPERUSER` (grupo 1 de `04`)
  lo **verifica en CI**; si alguien lo cambia, el pipeline rompe.
- Operaciones que legítimamente cruzan tenants (p. ej. el **portal de autoridad**)
  **NO** usan BYPASSRLS: se modelan con `RequerimientoAutoridad` (default-deny,
  con alcance/expiración, v2 §3) e iteran contexto por cada tenant autorizado.

## Orden de aplicación (migración) y riesgo si se omite

Aplicar **en este orden exacto**. Cada paso depende del anterior.

1. **Esquema base / migraciones Prisma** (crear tablas con `tenant_id UUID NOT NULL`).
   - *Riesgo si se omite/incompleto:* una tabla tenant-scoped sin columna
     `tenant_id` no puede protegerse; queda como fuga silenciosa.
2. **`02-app-role.sql`** — crear roles **antes** de los grants/policies, y
   **antes** de apuntar `DATABASE_URL` de la app al rol `cerberus_ce_app`.
   - *Riesgo si se omite:* la app correría como owner/superuser y **evadiría RLS**
     aunque las políticas existan. Esto anula todo el control.
3. **`01-enable-rls-policies.sql`** — habilitar RLS + crear políticas.
   - *Riesgo si se omite:* sin RLS, el único aislamiento es el `WHERE` de la app
     (el estado actual TUMBADO de §2.6): cualquier query sin filtro, bug de ORM o
     SQL crudo expone datos de otros tenants.
   - *Riesgo de orden inverso:* si se habilita RLS **antes** de que la app setee
     `app.tenant_id` por transacción (paso 4), la app verá **0 filas** en todo
     (fail-closed) y parecerá "caída". Por eso `03` debe estar desplegado en el
     mismo release que activa las políticas.
4. **Desplegar `03-prisma-tenant-context.ts`** en la app (cadena de conexión =
   `cerberus_ce_app`) — para que cada transacción setee el contexto de tenant.
   - *Riesgo si se omite:* con RLS activa y sin contexto, todo devuelve vacío.
5. **`04-tenant-leak.test.ts` en CI como gate bloqueante** (branch protection
   = required) antes de permitir merge/deploy.
   - *Riesgo si se omite:* una regresión (rol con BYPASSRLS, tabla nueva sin
     policy, política mal escrita) llegaría a producción sin detección. El diseño
     v2 §7 trata estos tests como **control probatorio**, no opcional.

### Orden seguro recomendado para producción (sin downtime)

Para evitar la ventana "RLS activa + app vieja sin contexto":

1. Desplegar primero la app con `03` (ya setea `app.tenant_id` en cada TX, aunque
   RLS aún no esté activa — es inocuo).
2. Crear roles y mover `DATABASE_URL` a `cerberus_ce_app`.
3. Aplicar `01` (habilitar políticas).
4. Correr la suite `04` contra producción/staging como verificación final.

### Tablas nuevas: regla permanente

Cada vez que se agregue una tabla tenant-scoped al modelo, **hay que**:
1. Añadirla a la lista de `01-enable-rls-policies.sql`.
2. Añadirla al assert "todas las tablas tenant-scoped tienen RLS" de `04`.
El test del grupo 1 falla si una tabla de la lista quedó sin RLS/forzar, lo que
sirve de recordatorio mecánico.

## Notas técnicas importantes

- **`SET LOCAL` / `set_config(..., true)`**, nunca `SET` global: con pools de
  conexión (PgBouncer/Prisma), un `SET` persistiría en la conexión reutilizada y
  filtraría el tenant a la siguiente petición. `SET LOCAL` muere con la transacción.
- **`FORCE ROW LEVEL SECURITY`**: sin `FORCE`, el *owner* de la tabla evade RLS.
  Lo forzamos para que ni el owner vea filas ajenas en DML.
- **`TRUNCATE` no respeta RLS por fila**: por eso el rol de la app **no** recibe
  privilegio de TRUNCATE sobre tablas tenant-scoped.
- **Parametrización del GUC**: se usa `set_config('app.tenant_id', $1, true)` con
  el valor enlazado, no interpolación de string, para evitar inyección.

## Nota de retrofit a SIDF / platform (FUERA DE ALCANCE de esta entrega)

El mismo patrón (RLS real + rol sin BYPASSRLS + `app.tenant_id` por transacción +
tests de fuga en CI) **debería retrofittearse luego a `cerberus-sidf-mp` y
`cerberus-platform`**, que hoy también dependen solo de aislamiento de aplicación
(ver [informe-reconciliación §9, pendiente 5](../../informe-reconciliacion.md)).
Eso es **trabajo separado y fuera del alcance de esta entrega**: aquí solo se
implementa para el producto nuevo CERBERUS COMERCIO EXTERIOR. En SIDF/platform el
`tenant_id`/`clienteId` ya existe en los modelos, por lo que el esfuerzo sería
análogo (renombrar `clienteId`→`tenant_id` donde aplique, añadir políticas y la
capa de contexto). No se aborda aquí para no tocar productos en producción.
