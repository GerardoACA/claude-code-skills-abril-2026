# BLUEPRINT addendum — Incremento 12 (Ingesta manual de listados + sanciones internacionales)

> Producto NUEVO cerberus-comercio-exterior. NO es SIDF. Respeta _BLUEPRINT.md y anteriores.
> TypeScript build-safe (sin any; Next 16). **CAMBIA EL SCHEMA** → migración local + Neon.

## Objetivo (requisito explícito del cliente, 2-jul-2026)
1. **Ingesta MANUAL**: el admin puede subir un archivo CSV de cualquier fuente (69-B Bis —que sí
   se publica—, 49 Bis, o refrescos manuales de 69/69-B) y el sistema lo importa con el mismo
   rigor probatorio: sha256 del archivo, fecha, origen=MANUAL.
2. **Sanciones internacionales**: nueva fuente SANCIONES_INT (OFAC/SDN, ONU, UE, UK…) por
   ingesta manual (o sync si algún día hay URL estable). Estas listas identifican por NOMBRE →
   el match por nombre es heurístico ⇒ SIEMPRE resultado ALERTA con nota de revisión humana
   (nunca inhabilitación automática por nombre; C9 reforzado). Match por RFC (si la lista lo
   trae) sí puede mapear a INHABILITADO_*.

## Cambios de schema (Agente MODELO-12)
1. enum `FuenteVerificacion`: AGREGAR valor `SANCIONES_INT` (no borres ninguno).
2. `model ImportacionListadoSat`: AGREGAR `origen String @default("AUTOMATICA")` (valores
   AUTOMATICA|MANUAL) y `emisor String?` (p. ej. SAT, OFAC, ONU, UE, UK).
3. `model ListadoSatEntrada`: `rfc String` → **`rfc String?`** (las listas internacionales no
   traen RFC) y AGREGAR índice `@@index([razonSocial])` para el match por nombre.
NO toques nada más del schema.

## Reparto

**Agente MODELO-12 (schema + parser + matching):**
1. `prisma/schema.prisma` — los 3 cambios de arriba, exactos.
2. `src/lib/sat-listados.ts` — EXTENSIÓN quirúrgica: (a) `parsearCsvListado` tolera RFC ausente
   cuando la fuente es SANCIONES_INT (acepta filas con solo nombre; el campo rfc queda null);
   detecta columna de nombre también por "NAME"/"ENTITY"/"NOMBRE"; (b) exporta
   `normalizarNombre(s)` (mayúsculas, sin acentos, sin puntuación, espacios colapsados) para el
   matching; (c) el tipo EntradaParseada pasa rfc a opcional. NO rompas los consumidores
   existentes (sincronizar-listados usa este parser: verifica compatibilidad).
3. `src/lib/verificacion-cumplimiento.ts` — EXTENSIÓN quirúrgica: agrega la fuente
   SANCIONES_INT al barrido de fuentes: última importación de SANCIONES_INT → match del cliente:
   (i) por rfc exacto si la entrada tiene rfc → mapeo normal de situacion; (ii) por
   `normalizarNombre(razonSocial)` del cliente CONTENIDO en o igual al nombre normalizado de la
   entrada (usa findMany acotado con contains insensible o filtra en memoria las candidatas por
   primera palabra) → resultado ALERTA con detalle "coincidencia por NOMBRE (heurística);
   requiere revisión humana" + emisor + snapshot real. Sin importación → NO_DISPONIBLE
   "ingesta manual disponible en Administración". Conserva tipos públicos.

**Agente SERVICIO-12 (ingesta manual + UI):**
1. `src/app/api/admin/listados/manual/route.ts` — POST solo ADMIN (403 si no): recibe
   multipart/form-data con campos `fuente` (valor de FuenteVerificacion), `emisor` (opcional) y
   `archivo` (CSV). Lee el File (await req.formData()), obtiene ArrayBuffer → Buffer, calcula
   sha256 del buffer crudo, decodifica latin1 (con fallback utf-8 si el texto trae reemplazos),
   parsea con parsearCsvListado(texto, fuente), crea ImportacionListadoSat
   (origen "MANUAL", emisor, url "manual://<nombre-archivo>") + entradas por lotes de 1000.
   Responde { fuente, filas, sha256, origen: "MANUAL" }. maxDuration 300. Valida tamaño máx
   (p. ej. 25 MB) y fuente válida con zod.
2. `src/app/admin/listados/page.tsx` — página admin (sesión + rol ADMIN o redirect):
   tabla de últimas importaciones por fuente (fecha, filas, sha256, origen, emisor), el botón
   de sincronización automática existente (reusa el componente SincronizarListados) y el
   formulario de INGESTA MANUAL (selector de fuente incluyendo SANCIONES_INT, campo emisor,
   input file) que postea al route del punto 1. Client component separado para el form:
   `src/components/IngestaManual.tsx`.
3. `src/app/dashboard/page.tsx` — SOLO añade un enlace "Listados (admin)" → /admin/listados
   visible si rol ADMIN (cambio mínimo).
4. `src/app/clientes/[id]/cumplimiento/page.tsx` — asegura que la tabla muestre TAMBIÉN la
   fuente SANCIONES_INT (si itera FUENTES_VERIFICACION del servicio, basta; verifica).

## Coordinación
- Solo MODELO-12 toca schema.prisma, sat-listados.ts y verificacion-cumplimiento.ts.
- SERVICIO-12 asume: enum con SANCIONES_INT; ImportacionListadoSat.origen/emisor; rfc opcional;
  parsearCsvListado(texto, fuente) tolerante; FUENTES del servicio incluyen SANCIONES_INT.
- C9 SIEMPRE: nada bloquea; el match por nombre es ALERTA con revisión humana.
- Al terminar, cada agente devuelve la lista de archivos.

## Nota de despliegue (migración)
- Local: `DATABASE_URL="$ADMIN" npx prisma migrate dev --name ingesta_manual_sanciones` +
  re-aplicar 02-app-role.sql y 01-enable-rls-policies.sql (rutina).
- Neon: `migrate deploy` + re-GRANT + 01.
- Verificación: subir manualmente un CSV pequeño de prueba como SANCIONES_INT (nombre de un
  cliente demo) → "Verificar todo" → ALERTA por coincidencia de nombre con nota de revisión
  humana; y subir un CSV manual de 69-B Bis → la fuente deja de ser NO_DISPONIBLE.
