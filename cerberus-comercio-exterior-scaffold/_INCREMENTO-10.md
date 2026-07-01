# BLUEPRINT addendum — Incremento 10 (Listados reales del SAT: 69 / 69-B / 69-B Bis / 49 Bis)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16 `params` = Promise). **CAMBIA EL SCHEMA** (2 modelos
> nuevos GLOBALES sin tenant_id) → migración local + Neon (+ re-RLS de rutina).

## Objetivo
Sustituir el stub de verificación: descargar los LISTADOS PÚBLICOS del SAT (CSV de datos
abiertos), importarlos a una tabla de referencia global con snapshot sellado (sha256 del
archivo + fecha), y que la Verificación de Cumplimiento consulte el RFC del cliente contra esos
datos REALES. OPINION_32D y CSD_17H permanecen NO_DISPONIBLE (requieren e.firma del
contribuyente; integración posterior).

## Datos de referencia GLOBALES (decisión de diseño)
Los listados del SAT son PÚBLICOS e iguales para todos los tenants → las 2 tablas nuevas NO
llevan tenant_id (evita duplicar millones de filas por tenant). El script dinámico de RLS solo
protege tablas con columna tenant_id, así que no las toca (correcto). La escritura queda
restringida por rol de aplicación: solo el endpoint admin sincroniza.

## Modelos nuevos (Agente MODELO-10)
```prisma
model ImportacionListadoSat {
  id           String   @id @default(cuid())
  fuente       FuenteVerificacion   // ART_69 | ART_69B | ART_69B_BIS | ART_49BIS
  url          String
  sha256Archivo String  @db.Char(64) @map("sha256_archivo")
  filas        Int
  importadoEn  DateTime @default(now()) @map("importado_en")
  entradas     ListadoSatEntrada[]
  @@index([fuente, importadoEn])
  @@map("importacion_listado_sat")
}

model ListadoSatEntrada {
  id            String   @id @default(cuid())
  importacionId String   @map("importacion_id")
  importacion   ImportacionListadoSat @relation(fields: [importacionId], references: [id], onDelete: Cascade)
  fuente        FuenteVerificacion
  rfc           String
  razonSocial   String?  @map("razon_social")
  situacion     String?  // texto de la columna "situación" del CSV (Presunto/Definitivo/etc.)
  @@index([rfc, fuente])
  @@map("listado_sat_entrada")
}
```
(No hay relaciones con Tenant/Cliente: referencia global.)

## Fuentes (URLs conocidas de datos abiertos del SAT — configurables por env)
En `src/lib/sat-listados.ts`, constante `FUENTES_LISTADOS` (cada una overridable por env):
- ART_69B  → env SAT_URL_69B  (default: http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv)
- ART_69   → env SAT_URL_69   (default: los CSV del art. 69 en omawww.sat.gob.mx/cifras_sat — usar
  "no localizados" y "firmes" como arranque; EXCLUIR el supuesto de la fr. VI conforme a la regla
  1.4.14 reformada; documentarlo)
- ART_69B_BIS → env SAT_URL_69B_BIS (si no hay URL pública estable, la fuente queda NO_DISPONIBLE
  con detalle "URL no configurada"; documentar)
- ART_49BIS → env SAT_URL_49BIS (listado nuevo de la reforma 2026; si la URL no está configurada,
  NO_DISPONIBLE con detalle claro. El Claude local puede localizar/ajustar la URL real al desplegar.)
IMPORTANTE: los CSV del SAT suelen venir en codificación LATIN-1/Windows-1252 y con líneas de
preámbulo antes del header; el parser debe decodificar latin1 (Buffer → latin1) y saltar preámbulo.
Parser CSV propio ligero (sin dependencias nuevas): manejar comillas y comas embebidas básicas.

## Reparto

**Agente MODELO-10:**
1. `prisma/schema.prisma`: agrega los 2 modelos EXACTOS de arriba. NO toques otros modelos.
2. `src/lib/sat-listados.ts`: `descargarListado(url): Promise<{ buffer, sha256 }>` (fetch nativo,
   decodificación latin1), `parsearCsvListado(texto, fuente): EntradaParseada[]` (salta preámbulo,
   detecta columnas RFC / razón social / situación por encabezado, tolerante), y
   `FUENTES_LISTADOS` (URLs por fuente con override por env). Sin dependencias externas. Exporta
   tipos. Documenta formato esperado y límites.

**Agente SERVICIO-10:**
1. `src/app/api/admin/listados/route.ts` — POST (solo rol ADMIN del JWT; 403 si no): para cada
   fuente con URL configurada: descarga, parsea, crea ImportacionListadoSat + entradas
   (createMany por lotes de ~1000), responde resumen {fuente, filas, sha256} por fuente. Usa
   `export const maxDuration = 300`. Los modelos globales NO van dentro de withTenantFromSession
   (no tienen tenant_id): usa prisma directo. GET devuelve la última importación por fuente.
2. `src/lib/verificacion-cumplimiento.ts` — REESCRITURA CONTROLADA: `verificarCumplimiento`
   pasa a ser ASÍNCRONA y recibe además el cliente prisma (o tx): para ART_69, ART_69B,
   ART_69B_BIS, ART_49BIS busca la ÚLTIMA ImportacionListadoSat de la fuente y consulta
   ListadoSatEntrada por rfc; mapea situacion → ResultadoVerificacion (Definitivo→
   INHABILITADO_DEFINITIVO, Presunto→INHABILITADO_PRESUNTO, Desvirtuado/Sentencia→AL_CORRIENTE
   con detalle, hallado sin situación→ALERTA, no hallado→AL_CORRIENTE, sin importación→
   NO_DISPONIBLE "sincroniza los listados"). snapshotSha256 = sha256Archivo REAL de la
   importación; detalle incluye fecha de importación. OPINION_32D y CSD_17H quedan
   NO_DISPONIBLE con su detalle actual. Mantén exportados los mismos tipos públicos
   (ResultadoFuente etc.) para no romper consumidores.
3. `src/app/api/clientes/[id]/cumplimiento/route.ts` — ajusta la llamada al servicio asíncrono
   (pasando prisma/tx global para los listados; la escritura de VerificacionCumplimiento sigue
   tenant-scoped dentro de withTenantFromSession como hoy).
4. `src/app/clientes/[id]/cumplimiento/page.tsx` — añade línea "Última sincronización de
   listados" (GET del punto 1 o consulta directa) y nota si nunca se ha sincronizado.
5. `src/components/SincronizarListados.tsx` — client component (botón POST a /api/admin/listados,
   muestra resumen; visible solo si rol ADMIN — pásale el rol como prop desde la página).

## Coordinación
- Solo MODELO-10 toca el schema. SERVICIO-10 asume los modelos del blueprint.
- Cuidado con memoria/tiempo en Vercel: createMany por lotes, sin cargar todo en objetos pesados.
- Fallback documentado: si la sincronización excede límites de Vercel, correr localmente
  `curl -X POST .../api/admin/listados` contra la app local apuntando a Neon (documentar en README del inc).
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name listados_sat` + re-aplicar
  02-app-role.sql y 01-enable-rls-policies.sql (rutina; las tablas nuevas sin tenant_id no
  reciben policy — correcto por diseño).
- Neon: `migrate deploy` + re-GRANT + 01.
- Verificación en vivo: como ADMIN, sincronizar listados (o vía curl local si Vercel corta),
  luego "Verificar todo" en un cliente cuyo RFC exista en el 69-B real → debe salir
  INHABILITADO_* con snapshot real; un RFC limpio → AL_CORRIENTE con sha del archivo.
