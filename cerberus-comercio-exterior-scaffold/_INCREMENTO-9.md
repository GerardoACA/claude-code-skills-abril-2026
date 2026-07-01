# BLUEPRINT addendum — Incremento 9 (Dossier de Diligencia automático al caer en ROJO/INCIDENCIA)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (next build estricto; sin any; Next 16 `params` = Promise).
> **NO cambia el schema**: el dossier se materializa como `Documento` (tipo "DOSSIER_DILIGENCIA",
> sha256 del paquete probatorio, operacionId FK directa del Inc 8) + evento de bitácora.

## Objetivo (hallazgo crítico CAAAREM del panel: el dossier es el seguro de la patente)
Cuando una operación transiciona a ROJO o INCIDENCIA, generar AUTOMÁTICAMENTE el dossier de
diligencia: snapshot probatorio del estado de la operación en ese momento, sellado y ligado por
FK. Habilitar después la transición a DOSSIER_GENERADO. El dossier debe poder regenerarse/
descargarse desde la UI.

## Diseño
- El dossier = `Documento` con: `tipo: "DOSSIER_DILIGENCIA"`, `sha256` = sha256 del JSON canónico
  del paquete probatorio generado en ese instante (armarExporteProbatorio + serializarPaquete
  sobre construirEntradaExporte), `operacionId` = FK directa, `tenantId`, y los campos que el
  modelo Documento exija (revisar schema; si exige relación a un expediente, dejarla null si es
  opcional — revisar; si expedienteKycId es opcional, no ligar).
- + Evento BitacoraAuditoria `accion: "DOSSIER_GENERADO"` con operacionId, sha256 encadenado.
- El JSON del dossier NO se persiste como blob todavía (no hay object storage) — se documenta:
  el sha256 ancla el contenido y el paquete es regenerable; almacenamiento WORM del blob = paso
  futuro (cuando se conecte storage). El GET de descarga regenera el paquete y ADVIERTE si su
  sha256 difiere del sellado (evidencia de que hubo cambios posteriores — eso también es señal).

## Reparto

**Agente AUTO-DOSSIER (backend):**
1. `src/lib/dossier-diligencia.ts` — `generarDossier(tx, tenantId, actor, operacion)`:
   construye el paquete (construirEntradaExporte → armarExporteProbatorio → serializarPaquete),
   calcula sha256 del JSON, crea el `Documento` (tipo "DOSSIER_DILIGENCIA", sha256, operacionId)
   y el evento de bitácora encadenado (accion "DOSSIER_GENERADO", operacionId, hashPrev del
   último evento del tenant). Devuelve { documentoId, sha256 }.
2. `src/app/api/operaciones/[id]/estado/route.ts` — cambio quirúrgico: tras una transición
   exitosa a "ROJO" o "INCIDENCIA", llama a generarDossier DENTRO de la misma transacción y
   añade a la respuesta { dossier: { documentoId, sha256 } }. No reestructures el resto.

**Agente UI-DOSSIER (frontend):**
1. `src/app/operaciones/[id]/dossier/page.tsx` — Server Component (sesión+redirect): muestra los
   Documentos tipo "DOSSIER_DILIGENCIA" de la operación (fecha, sha256, estadoProbatorio) vía
   withTenantFromSession, y botón para descargar/regenerar. params async.
2. `src/components/DescargarDossier.tsx` — client component: fetch GET al route de descarga y
   baja `dossier-<referencia>.json` (Blob). Muestra la advertencia si la respuesta indica que el
   sha256 regenerado difiere del sellado.
3. `src/app/api/operaciones/[id]/dossier/route.ts` — GET: tenantId del JWT; regenera el paquete
   con las mismas funciones, calcula su sha256, lo compara con el del último Documento
   "DOSSIER_DILIGENCIA" de la operación y responde el JSON del paquete + headers
   `X-Dossier-Match: true|false` (y en el body un campo si prefieres). params async.
4. `src/app/operaciones/[id]/page.tsx` — SOLO añade UN enlace mínimo a /operaciones/[id]/dossier
   (una línea; respeta los enlaces existentes a /tramites y /expediente).

## Coordinación
- AUTO-DOSSIER es dueño de src/lib/dossier-diligencia.ts y del cambio en estado/route.ts.
- UI-DOSSIER importa generarDossier SOLO si lo necesita (idealmente no: su GET regenera con las
  funciones de exporte directamente). No toca estado/route.ts ni el lib del otro.
- Nadie toca prisma/schema.prisma. Revisar campos reales de Documento antes de escribir.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue
SIN migración. Despliegue simple (patrón _MENSAJE-INCREMENTO-7.md).
