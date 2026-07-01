# BLUEPRINT addendum — Incremento 7 (Expediente Probatorio / Exporte por operación)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (next build estricto; sin any; Next 16 `params` = Promise).
> Lectura tenant-scoped SIEMPRE con withTenantFromSession. tenantId SIEMPRE del JWT.
> **NO cambia el schema** (solo LEE tablas existentes y usa la capa probatoria ya construida).

## Objetivo
Generar el "expediente probatorio" de una operación: reunir su evidencia (eventos de
BitacoraAuditoria, Documentos, PasoDespacho, VerificacionCumplimiento) y producir un EXPORTE
autocontenido y verificable por un perito tercero, usando la capa probatoria existente
(src/lib/probatoria/exporte-probatorio.ts, hash-chain.ts, hash.ts). Descargable como JSON.

## Reutilizar (NO reimplementar)
- `src/lib/probatoria/exporte-probatorio.ts`: `armarExporteProbatorio(entrada: EntradaExporte): PaqueteProbatorio`,
  `serializarPaquete`, `verificarExporte`. `EntradaExporte` = { tenantId, expediente, registros: RegistroProbatorio[], snapshotsExternos? }.
  `RegistroProbatorio` = { eslabon: RegistroEncadenado, payloadCanonico: string, sellado?: ResultadoSellado }.
- `src/lib/probatoria/hash-chain.ts`: `canonicalizar`, `GENESIS_SELLO`, tipo `RegistroEncadenado`.
- LEE esos archivos para conocer las formas EXACTAS antes de escribir.

## Reparto

**Agente SERVICIO-EXPORTE:**
- `src/lib/exporte-operacion.ts`: función `construirEntradaExporte(tx, tenantId, operacion, evidencia)`
  que, a partir de los eventos de BitacoraAuditoria del tenant relacionados con la operación
  (por payloadRef o por orden), los Documentos y PasoDespacho de esa operación, arma un
  `EntradaExporte`: mapea cada evento/documento a un `RegistroProbatorio` (eslabon derivado de
  los campos reales sha256/hashPrev; payloadCanonico con canonicalizar()) y define `expediente`
  = referencia de la operación. Devuelve el EntradaExporte listo para `armarExporteProbatorio`.
  Documenta el mapeo. Sin any.

**Agente UI-EXPEDIENTE:**
- `src/app/operaciones/[id]/expediente/page.tsx` — Server Component (sesión+redirect); carga la
  Operacion (con cliente), sus Documentos, PasoDespacho, y eventos de BitacoraAuditoria vía
  withTenantFromSession; muestra un RESUMEN de la evidencia (conteos, últimos sellos) y un botón
  "Generar exporte probatorio". params async.
- `src/components/BotonExporte.tsx` — client component: llama al route y, con la respuesta,
  dispara la descarga de un archivo JSON (Blob) `exporte-<operacion>.json`.
- `src/app/api/operaciones/[id]/exporte/route.ts` — GET o POST: tenantId del JWT; dentro de
  withTenantFromSession reúne la evidencia de la operación, llama a construirEntradaExporte (de
  @/lib/exporte-operacion) y a armarExporteProbatorio + serializarPaquete (de @/lib/probatoria/
  exporte-probatorio), y responde el JSON del paquete (Content-Type application/json). params async.
- Enlace: añade en `src/app/operaciones/[id]/page.tsx` UN enlace mínimo a `/operaciones/[id]/expediente`
  (una línea; NO reescribas su lógica). Único archivo ajeno que tocas.

## Coordinación
- El Agente UI-EXPEDIENTE usa la función del Agente SERVICIO-EXPORTE (`construirEntradaExporte`)
  y las funciones de la capa probatoria. NO reimplementa el empaquetado.
- Ninguno toca prisma/schema.prisma (no hay migración).
- Revisen campos reales de BitacoraAuditoria (sha256, hashPrev, actor, accion, payloadRef,
  creadoEn), Documento (sha256, tipo), PasoDespacho (tipo, sha256).
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue
SIN migración (no cambió el schema). Despliegue simple: rsync + npm install + prisma generate +
build + tests + push + vercel --prod. (Ver _MENSAJE-DESPLIEGUE-ACTUAL.md como patrón.)
