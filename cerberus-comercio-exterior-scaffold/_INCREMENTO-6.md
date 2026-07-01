# BLUEPRINT addendum — Incremento 6 (Trámite del despacho: MVE/E2, COVE, Prevalidación, Pago, DODA)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (next build estricto; sin any; sin widening; Next 16 `params` = Promise).
> Escritura tenant-scoped SIEMPRE con withTenantFromSession. tenantId SIEMPRE del JWT.
> **CAMBIA EL SCHEMA** (un modelo + un enum nuevos). Requiere migración (local + Neon) + re-RLS.

## Objetivo
Registrar los pasos documentales del despacho de una operación: Manifestación de Valor (E2),
COVE, Prevalidación (sello), Pago de contribuciones y DODA — cada uno sellado (sha256) y
registrado. Es una lista/checklist por operación. No bloquea; es registro.

## Modelo nuevo (Agente MODELO-6 en prisma/schema.prisma)
```prisma
enum TipoPaso {
  MVE_E2
  COVE
  PREVALIDACION
  PAGO
  DODA
}

model PasoDespacho {
  id           String    @id @default(cuid())
  tenantId     String    @map("tenant_id")
  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  operacionId  String    @map("operacion_id")
  operacion    Operacion @relation(fields: [operacionId], references: [id], onDelete: Cascade)
  tipo         TipoPaso
  acuse        String?   // acuse/folio/referencia (MVE, COVE, DODA)
  sello        String?   // sello de prevalidación
  monto        Decimal?  @db.Decimal(14, 2)  // para PAGO (total de contribuciones)
  detalle      String?
  sha256       String    @db.Char(64)
  completadoEn DateTime  @default(now()) @map("completado_en")

  @@index([tenantId, operacionId, tipo])
  @@map("paso_despacho")
}
```
- Añadir relación inversa `pasos PasoDespacho[]` en `model Operacion` y en `model Tenant`.
- No tocar ni modificar otros modelos.

## Reparto

**Agente MODELO-6:**
- `prisma/schema.prisma`: agrega el enum `TipoPaso` y el modelo `PasoDespacho` EXACTO, y la
  relación inversa `pasos PasoDespacho[]` en Operacion y Tenant. NO toques otros modelos.

**Agente UI-TRAMITES:**
- `src/app/operaciones/[id]/tramites/page.tsx` — Server Component (sesión+redirect); carga la
  Operacion (con cliente) y sus PasoDespacho vía withTenantFromSession; muestra un CHECKLIST de
  los 5 pasos (MVE_E2, COVE, PREVALIDACION, PAGO, DODA) indicando cuáles están completos y sus
  datos (acuse/sello/monto); incrusta el formulario para registrar un paso. params async.
- `src/components/RegistrarPaso.tsx` — client component: selector de tipo de paso + campos según
  el tipo (acuse para MVE/COVE/DODA, sello para PREVALIDACION, monto para PAGO); postea al route.
- `src/app/api/operaciones/[id]/pasos/route.ts` — POST: tenantId del JWT; dentro de
  withTenantFromSession crea un PasoDespacho para la operación con los campos según el tipo,
  sellado con sha256 (@/lib/probatoria/hash) sobre payload canónico; registra también un evento
  en BitacoraAuditoria (accion "PASO_DESPACHO", campos reales: sha256, hashPrev encadenado,
  actor del JWT, payloadRef). GET opcional lista los pasos. params async.
- Enlace: añade en `src/app/operaciones/[id]/page.tsx` UN enlace mínimo a `/operaciones/[id]/tramites`
  (cambio de una línea; NO reescribas su lógica). Ese es el único archivo ajeno que tocas.

## Coordinación
- Solo el Agente MODELO-6 toca prisma/schema.prisma. El Agente UI-TRAMITES NO lo toca (asume los
  campos del modelo de este blueprint) y solo hace el enlace mínimo en operaciones/[id]/page.tsx.
- Usen los campos/enum EXACTOS del blueprint y campos reales de BitacoraAuditoria (revisar).
- `monto` es Prisma `Decimal`: en TS llega como `Prisma.Decimal`; para mostrarlo usar `.toString()`,
  y para escribir aceptar number/string y pasarlo tal cual (Prisma lo convierte). Evitar `any`.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name paso_despacho` + re-aplicar
  `02-app-role.sql` y `01-enable-rls-policies.sql`.
- Neon: `migrate deploy` + re-GRANT + re-aplicar `01-enable-rls-policies.sql`.
