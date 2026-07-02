# BLUEPRINT addendum — Incremento 11 (Vigía: sincronización y re-verificación automáticas diarias)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16). **NO cambia el schema** → sin migración.

## Objetivo
Monitoreo continuo: un CRON diario (Vercel Cron) que (1) sincroniza los listados SAT y
(2) re-verifica el cumplimiento de TODOS los clientes de TODOS los tenants, persistiendo las
verificaciones y registrando en la bitácora una alerta cuando el resultado de un cliente
EMPEORA (p. ej. aparece nuevo en 69-B). Siempre alerta, nunca bloqueo (C9).

## Seguridad del cron
- `vercel.json` con `{"crons":[{"path":"/api/cron/vigia","schedule":"0 12 * * *"}]}` (12:00 UTC ≈ 6am CDMX).
- El route del cron valida `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel lo envía
  automáticamente si CRON_SECRET está definido). Sin secreto válido → 401. Documentar que hay
  que crear CRON_SECRET en Vercel env.
- El barrido multi-tenant NO usa sesión: itera tenants con prisma directo (lectura de ids) y
  entra a cada tenant con `withTenant(tenantId, fn)` (de @/lib/tenant-context — no requiere
  sesión), manteniendo el aislamiento RLS por tenant. Actor de bitácora: "vigia@system".

## Reparto

**Agente VIGIA-SYNC:**
1. `src/lib/sincronizar-listados.ts` — extrae la lógica de sincronización HOY duplicada en
   `src/app/api/admin/listados/route.ts` a una función compartida
   `sincronizarListados(prisma): Promise<ResumenFuente[]>` (misma semántica: por fuente con URL,
   descargar→parsear→ImportacionListadoSat+createMany por lotes; una fuente que falla no aborta
   las demás). Exporta tipos del resumen.
2. `src/app/api/admin/listados/route.ts` — refactor para usar la lib compartida (respuesta
   idéntica; no cambies auth ni contratos).
3. `src/app/api/cron/vigia/route.ts` — GET (Vercel Cron usa GET): valida Bearer CRON_SECRET →
   401 si no; corre `sincronizarListados(prisma)` y luego `barridoVigia(prisma)` (la crea el
   Agente VIGIA-BARRIDO en @/lib/vigia-barrido — asume la firma del blueprint); responde
   { sync: ResumenFuente[], barrido: ResumenBarrido }. `export const maxDuration = 300`.
4. `vercel.json` — el cron de arriba (archivo nuevo en la raíz del scaffold).

**Agente VIGIA-BARRIDO:**
1. `src/lib/vigia-barrido.ts` — exporta `barridoVigia(prisma): Promise<ResumenBarrido>` y el
   tipo `ResumenBarrido { tenants: number; clientes: number; alertas: number; detalles: {tenantId, clienteId, rfc, fuente, de, a}[] }`:
   - Lee los ids de todos los Tenant (prisma directo).
   - Por tenant: `withTenant(tenantId, async tx => ...)`: lista sus Cliente; por cada cliente:
     obtiene el resultado MÁS RECIENTE previo por fuente (VerificacionCumplimiento), corre
     `await verificarCumplimiento(tx, { rfc })`, persiste los nuevos registros (igual que el
     route de cumplimiento), y si para alguna fuente el resultado EMPEORÓ (orden de severidad:
     AL_CORRIENTE < NO_DISPONIBLE < ALERTA < INHABILITADO_PRESUNTO < INHABILITADO_DEFINITIVO),
     registra un evento BitacoraAuditoria (accion "VIGIA_ALERTA", actor "vigia@system",
     operacionId null, payloadRef con clienteId/fuente/transición, sha256 encadenado con
     hashPrev del último evento del tenant — mismo patrón existente).
   - Tolerante a fallos: un tenant/cliente que falla no aborta el barrido (acumula y sigue).
2. `src/app/dashboard/page.tsx` — AJUSTE ACOTADO: añade una sección "Alertas de cumplimiento
   (vigía)" que lista los últimos eventos de BitacoraAuditoria del tenant con accion
   "VIGIA_ALERTA" (máximo 10, con fecha y payloadRef legible). No reestructures el resto.

## Coordinación
- VIGIA-SYNC es dueño de: sincronizar-listados.ts, admin/listados/route.ts, cron/vigia/route.ts, vercel.json.
- VIGIA-BARRIDO es dueño de: vigia-barrido.ts y el ajuste del dashboard.
- El cron route (SYNC) importa `barridoVigia` de @/lib/vigia-barrido con la firma EXACTA del blueprint.
- `withTenant` está en @/lib/tenant-context (recibe tenantId directo, sin sesión).
- Nadie toca prisma/schema.prisma.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue
SIN migración. Extra: definir CRON_SECRET en Vercel (openssl rand -hex 24 | npx vercel env add CRON_SECRET production)
y verificar que el cron quede registrado (vercel.json). Prueba manual del cron:
curl -H "Authorization: Bearer $CRON_SECRET" https://cerberus-comercio-exterior.vercel.app/api/cron/vigia
