# BLUEPRINT addendum — Incremento 5 (Verificación de Cumplimiento completa)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (next build estricto; sin any; sin widening; Next 16 `params` = Promise).
> Escritura tenant-scoped SIEMPRE con withTenantFromSession.
> **ESTE INCREMENTO SÍ CAMBIA EL SCHEMA** (un modelo nuevo). Requiere migración (local + Neon).
> Referencia normativa: CERBERUS-COMERCIO-EXTERIOR/06-rmf-regla-1-4-14/verificacion-cumplimiento-alcance.md

## Objetivo
Ampliar la verificación del cliente/proveedor más allá del 69-B, cubriendo el conjunto de
supuestos que inhabilitan operaciones de quien debe estar al corriente en sus obligaciones
fiscales. Principio C9: el sistema ALERTA y registra; NUNCA bloquea.

## Modelo nuevo (define el Agente MODELO en prisma/schema.prisma)

```prisma
enum FuenteVerificacion {
  ART_69          // créditos firmes / no localizados (listado SAT)
  ART_69B         // EFOS/EDOS (operaciones inexistentes)
  ART_69B_BIS     // transmisión indebida de pérdidas
  ART_29BIS       // supuesto que inhabilita operaciones (referencia a confirmar por abogado)
  OPINION_32D     // opinión de cumplimiento de obligaciones fiscales
  CSD_17H         // restricción/cancelación de sello digital
}

enum ResultadoVerificacion {
  AL_CORRIENTE
  NO_DISPONIBLE
  ALERTA
  INHABILITADO_PRESUNTO
  INHABILITADO_DEFINITIVO
}

model VerificacionCumplimiento {
  id             String                @id @default(cuid())
  tenantId       String                @map("tenant_id")
  tenant         Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clienteId      String                @map("cliente_id")
  cliente        Cliente               @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  fuente         FuenteVerificacion
  resultado      ResultadoVerificacion
  detalle        String?
  snapshotSha256 String?               @db.Char(64) @map("snapshot_sha256")
  consultadoEn   DateTime              @default(now()) @map("consultado_en")
  vigenciaHasta  DateTime?             @map("vigencia_hasta")
  creadoEn       DateTime              @default(now()) @map("creado_en")

  @@index([tenantId, clienteId, fuente])
  @@map("verificacion_cumplimiento")
}
```
- Añadir en `model Tenant` y `model Cliente` la relación inversa: `verificaciones VerificacionCumplimiento[]`.
- No borrar Alerta69b (queda; el módulo nuevo lo supera funcionalmente).

## Reparto

**Agente MODELO-SERVICIO:**
- `prisma/schema.prisma`: agrega los 2 enums y el modelo VerificacionCumplimiento, y las relaciones
  inversas en Tenant y Cliente. NO toques otros modelos.
- `src/lib/verificacion-cumplimiento.ts`: función STUB (sin API externa todavía) que, dado un
  cliente (RFC), devuelve un resultado por cada FuenteVerificacion con lógica placeholder
  (por patrón del RFC), cada uno con un snapshot fechado (sha256 de @/lib/probatoria/hash) y
  detalle. Documenta claramente que es STUB y que la integración real con SAT/DOF es posterior.

**Agente UI-VERIFICACION:**
- `src/app/clientes/[id]/cumplimiento/page.tsx`: Server Component (sesión+redirect); carga el
  Cliente y sus VerificacionCumplimiento con withTenantFromSession; muestra una tabla con TODAS
  las fuentes (69, 69-B, 69-B Bis, 29 Bis, 32-D, CSD) y su resultado/semáforo; botón "Verificar todo".
- `src/components/BotonVerificarCumplimiento.tsx`: client component que llama al route y refresca.
- `src/app/api/clientes/[id]/cumplimiento/route.ts`: POST — tenantId del JWT; dentro de
  withTenantFromSession corre el servicio verificacion-cumplimiento para el cliente y crea un
  registro VerificacionCumplimiento por fuente; si alguno es ALERTA/INHABILITADO, la respuesta lo
  indica pero DEJA CLARO que es ALERTA, NO bloqueo (decisión C9). Nunca impide nada.
- Enlace: en `src/app/clientes/[id]/verificacion/page.tsx` NO lo toques; en su lugar, el Agente
  UI puede añadir el enlace a /cumplimiento desde `src/app/clientes/page.tsx`... NO — para evitar
  colisión, el Agente UI añade el enlace a /cumplimiento SOLO dentro de su propia página nueva y
  de la lista si es trivial. Si hay duda, no toques clientes/page.tsx; deja el acceso por URL.

## Coordinación
- Solo el Agente MODELO-SERVICIO toca prisma/schema.prisma. El Agente UI NO lo toca (asume los
  campos del modelo definidos arriba).
- El Agente UI usa los enums/campos EXACTOS de este blueprint.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (para el runbook / Claude local)
Este incremento requiere MIGRACIÓN:
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name verificacion_cumplimiento`.
- Neon: `DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy`.
- Re-aplicar RLS en la tabla nueva: correr de nuevo `prisma/sql/01-enable-rls-policies.sql` como
  admin (es dinámico por columna tenant_id → protege la tabla nueva) en local Y en Neon, y
  `03-auth-lookup.sql` no aplica aquí. Verificar que `verificacion_cumplimiento` quede con RLS.
