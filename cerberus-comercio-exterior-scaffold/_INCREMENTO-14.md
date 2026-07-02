# BLUEPRINT addendum — Incremento 14 (Almacén WORM: persistir el blob del dossier)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16). **NO cambia el schema** (Documento.wormUrl ya existe).

## Objetivo
Cerrar el pendiente anotado desde el Inc 9: el JSON del dossier hoy NO se persiste (solo se
ancla su sha256 y se regenera). Ahora, al generar el dossier, el paquete se GUARDA en un
almacén de objetos inmutable (Vercel Blob — ya usado en el ecosistema del cliente, patrón
dual de sidf-mp) vía un CONECTOR enchufable (patrón TimbradorPac/SelladorCalificado):
- Con BLOB_READ_WRITE_TOKEN configurado → sube el blob y guarda wormUrl en el Documento.
- Sin token → NoOp honesto (wormUrl null, detalle "almacén no configurado"), todo sigue
  funcionando como hoy (regenerable + sha).

## Reparto — UN solo agente (ALMACEN-14)

1. `package.json` — agrega dependencia `@vercel/blob` (^1).
2. `src/lib/almacen-worm.ts` — conector: interfaz `AlmacenWorm { guardar(ruta, contenido, contentType): Promise<ResultadoGuardado> }`
   con `ResultadoGuardado { ok: boolean; url?: string; detalle: string }`;
   `AlmacenNoOp` (default, "Almacén WORM no configurado (BLOB_READ_WRITE_TOKEN ausente); el
   dossier queda anclado por sha256 y es regenerable"); `AlmacenVercelBlob` usando
   `put(ruta, contenido, { access: "public", addRandomSuffix: false, contentType })` de
   @vercel/blob (import estático está bien; la lib no falla al importar sin token, solo al usar);
   factoría `obtenerAlmacen()` → VercelBlob si process.env.BLOB_READ_WRITE_TOKEN, si no NoOp.
   Documenta: WORM lógico = ruta content-addressed (incluye el sha256) + política de "nunca
   sobrescribir" (si la ruta ya existe con addRandomSuffix false, capturar el error y tratarlo
   como ya-guardado idempotente).
3. `src/lib/dossier-diligencia.ts` — EXTENSIÓN quirúrgica en generarDossier: tras crear el
   Documento, serializa el paquete (serializarPaquete — reimportarlo) y llama
   `obtenerAlmacen().guardar(`dossiers/${tenantId}/${operacion.id}/${selloDossier}.json`, json, "application/json")`;
   si ok → `tx.documento.update` con wormUrl; si no → deja wormUrl null (no falla el dossier por
   el almacén: try/catch, el detalle va al payload del evento de bitácora). ResultadoDossier gana
   `wormUrl?: string | null` (compatible).
4. `src/app/operaciones/[id]/dossier/page.tsx` — muestra, por dossier listado, el enlace
   "Copia WORM ↗" cuando wormUrl exista (target _blank), y una nota si no ("sin copia WORM;
   anclado por sha256 y regenerable").
5. `src/app/api/operaciones/[id]/dossier/route.ts` — SIN cambios de lógica de cotejo; solo
   (si trivial) incluir wormUrl del último dossier en headers/campo informativo. Opcional.

## Coordinación
- Nadie toca prisma/schema.prisma (wormUrl ya existe en Documento) ni la lógica de cotejo del
  fix 9.1 (selloContenidoDossier queda intacto: el blob guarda el JSON completo con generadoEn,
  y el sello de contenido sigue siendo el ancla — documentar esta relación en comentarios).
- privacidad: los dossiers contienen datos del tenant → access "public" de Vercel Blob genera
  URLs no adivinables pero públicas; DOCUMENTAR este trade-off en el código y en el mensaje de
  despliegue (mitigación futura: blob privado o proxy autenticado; hoy la URL solo se muestra
  dentro de la sesión del tenant).

## Nota de despliegue
SIN migración. Requiere en Vercel el store de Blob: crear en el dashboard (Storage → Blob) o
`npx vercel blob store add` y que BLOB_READ_WRITE_TOKEN quede en el proyecto (la integración lo
inyecta). Sin token, todo despliega y funciona en modo NoOp honesto.
Verificación: generar un dossier nuevo (operación a ROJO) → en /dossier debe aparecer
"Copia WORM ↗" y el JSON descargable desde esa URL; sin token → nota honesta.
