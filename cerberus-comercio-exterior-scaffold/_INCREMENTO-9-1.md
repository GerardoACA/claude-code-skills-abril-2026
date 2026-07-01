# BLUEPRINT addendum — Incremento 9.1 (cotejo del dossier alcanzable + fuente ART_49BIS)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe. **CAMBIA EL SCHEMA** (rename de valor de enum) → migración local+Neon+re-RLS.

## Parte A — Cotejo del dossier alcanzable (hallazgo del despliegue Inc 9)
Problema: X-Dossier-Match da "false" siempre, porque el sha256 del dossier se sella ANTES de
crear su propio Documento DOSSIER_DILIGENCIA y el evento DOSSIER_GENERADO; al regenerar, esos 2
registros ya forman parte de la evidencia y el paquete difiere.
Solución: excluir del snapshot la huella del propio dossier:
- En `src/lib/exporte-operacion.ts`: al reunir evidencia, EXCLUIR (a) Documentos con
  `tipo = "DOSSIER_DILIGENCIA"` y (b) eventos de bitácora con `accion = "DOSSIER_GENERADO"`.
  Hazlo con constantes exportadas desde `src/lib/dossier-diligencia.ts` (TIPO_DOSSIER,
  ACCION_DOSSIER) para no duplicar literales. Documenta el porqué (el dossier ancla la evidencia
  DE LA OPERACIÓN, no su propia huella administrativa).
- La página de dossier (dossier/page.tsx) SIGUE listando los Documentos DOSSIER_DILIGENCIA (esa
  lista no usa el snapshot). El route de descarga no cambia su lógica de cotejo.
Resultado esperado: generar dossier → descargar sin actividad posterior → X-Dossier-Match: true.
Si hay actividad posterior real → false (correcto).

## Parte B — Renombrar fuente ART_29BIS → ART_49BIS (corrección del cliente)
El cliente confirmó que la disposición es el **art. 49 Bis del CFF** (no 29 Bis).
- `prisma/schema.prisma`: en el enum `FuenteVerificacion`, renombrar el valor `ART_29BIS` →
  `ART_49BIS` (comenta que la migración hará rename del valor; los datos stub existentes con
  ART_29BIS pueden actualizarse en la migración o dejarse — preferible: la migración SQL que
  genere Prisma; si Prisma propone drop+add, aceptar porque los datos son stub demo).
- `src/lib/verificacion-cumplimiento.ts`: renombrar el literal y su etiqueta legible a
  "Art. 49 Bis CFF" con detalle "(verificación documental en curso por abogado; supuesto de la
  reforma CFF 2026)". Mantener resultado NO_DISPONIBLE por defecto hasta integración real.
- `src/app/clientes/[id]/cumplimiento/page.tsx` y route: actualizar referencias/etiquetas.

## Reparto
UN solo agente (FIX-9-1) hace ambas partes: son cambios quirúrgicos en archivos que conoce el
blueprint. Archivos que toca: prisma/schema.prisma (solo el enum), src/lib/exporte-operacion.ts,
src/lib/dossier-diligencia.ts (solo exportar constantes si no están exportadas),
src/lib/verificacion-cumplimiento.ts, src/app/clientes/[id]/cumplimiento/page.tsx y su route.
No toca nada más.

## Nota de despliegue (migración por el enum)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name art49bis_y_cotejo_dossier` +
  re-aplicar 02-app-role.sql y 01-enable-rls-policies.sql.
- Neon: `migrate deploy` + re-GRANT + 01-enable-rls-policies.sql.
- Verificación en vivo: generar un dossier nuevo y descargarlo SIN actividad posterior →
  X-Dossier-Match: true. La pantalla de cumplimiento debe decir "Art. 49 Bis CFF".
