# BLUEPRINT addendum — Incremento 8 (Evidencia exacta: FKs operación en Documento y Bitácora)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (next build estricto; sin any; Next 16 `params` = Promise).
> **CAMBIA EL SCHEMA** (2 columnas FK opcionales). Migración local + Neon + re-RLS (patrón probado).

## Objetivo
Que la evidencia quede ligada EXACTAMENTE a su operación (no por heurística):
- `Documento.operacionId String?` (FK opcional a Operacion) + relación inversa `documentos Documento[]` en Operacion.
- `BitacoraAuditoria.operacionId String?` (FK opcional a Operacion) + relación inversa `eventos BitacoraAuditoria[]` en Operacion.
Las FKs son OPCIONALES (String?) para no romper datos existentes; la heurística queda como fallback.

## Reparto

**Agente MODELO-8:**
- `prisma/schema.prisma`:
  - En `model Documento`: agrega `operacionId String? @map("operacion_id")` y `operacion Operacion? @relation(fields: [operacionId], references: [id])`, e índice `@@index([tenantId, operacionId])`.
  - En `model BitacoraAuditoria`: agrega lo mismo (`operacionId String? @map("operacion_id")`, relación opcional, índice `@@index([tenantId, operacionId])`).
  - En `model Operacion`: agrega las inversas `documentos Documento[]` y `eventos BitacoraAuditoria[]`.
  - NO toques nada más.

**Agente REFACTOR-EVIDENCIA:**
(asume las FKs del blueprint; NO toca el schema)
1. `src/app/api/operaciones/[id]/estado/route.ts` — al crear el evento de BitacoraAuditoria, añade `operacionId: <id de la operación>` en el create (además del payloadRef existente). Cambio mínimo; no reestructures.
2. `src/app/api/operaciones/[id]/pasos/route.ts` — ídem: el evento de bitácora que se crea lleva `operacionId`. Cambio mínimo.
3. `src/lib/exporte-operacion.ts` — actualiza la recolección:
   - Eventos: primero `where: { operacionId: operacion.id }`; si vacío, cae a la heurística actual (payloadRef / recientes) y lo marca en `asociacion` como hasta ahora. Marca los directos como `asociacion: "fk_directa"`.
   - Documentos: primero `where: { operacionId: operacion.id }`; si vacío, mantiene el contexto de tenant actual con su marca. Directos = `asociacion: "fk_directa"`.
   - No cambies las formas de EntradaExporte/RegistroProbatorio ni el reencadenado.

## Coordinación
- Solo MODELO-8 toca prisma/schema.prisma. REFACTOR-EVIDENCIA solo toca los 3 archivos listados.
- Los creates de bitácora usan los campos reales existentes + el nuevo operacionId (opcional).
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración — patrón de Inc 5/6 que salió limpio)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name evidencia_fk_operacion` + re-aplicar 02-app-role.sql y 01-enable-rls-policies.sql.
- Neon: `migrate deploy` + re-GRANT + re-aplicar 01-enable-rls-policies.sql.
- Sin datos que backfillear (FKs opcionales; lo viejo sigue saliendo por heurística).
