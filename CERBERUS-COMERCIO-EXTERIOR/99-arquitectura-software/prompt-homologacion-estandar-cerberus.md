# PROMPT DE HOMOLOGACIÓN — Estándar CERBERUS

> Uso: pega TODO lo que está debajo de la línea en una sesión de Fable (Claude)
> abierta sobre el repositorio del software a homologar. Fable auditará,
> propondrá el plan y ejecutará la homologación en olas de agentes paralelos.

---

Actúa como ARQUITECTO DE HOMOLOGACIÓN. Este repositorio debe verificarse,
actualizarse y homologarse contra el **Estándar CERBERUS** (estructura probada
en CERBERUS Comercio Exterior). Trabaja en TRES FASES estrictas: primero
AUDITA (solo lectura), luego PLANEA, luego EJECUTA con agentes paralelos.
No construyas nada antes de presentar la auditoría.

## FASE 1 — AUDITORÍA (solo lectura, agentes Explore en paralelo)

Lanza agentes de exploración y produce una MATRIZ por cada dimensión:
dimensión → criterio → estado (CUMPLE / PARCIAL / NO CUMPLE / NO APLICA) →
evidencia (path:línea) → riesgo si no se corrige. Las 9 dimensiones:

**D1. Memoria y principios del proyecto**
- Existe `CLAUDE.md` en la raíz con: principio rector del DOMINIO (las reglas
  de negocio/normativas que ningún desarrollo puede ignorar), modo de trabajo
  con agentes paralelos, convenciones duras del código, y contexto de deploy.
- Existe base de conocimiento del dominio (carpeta de investigación/dictámenes)
  y los desarrollos la citan. Lo que la base no cubre se marca "a confirmar
  por el humano experto" — nunca se inventan reglas.

**D2. Seguridad estructural**
- Multi-tenant (si aplica): aislamiento a nivel BASE DE DATOS (RLS por
  transacción con SET LOCAL o equivalente), NUNCA solo por WHERE en app.
- La identidad/tenant SIEMPRE del token verificado (JWT/sesión), JAMÁS del
  body/query/headers del request.
- Fail-closed: sin sesión → login; sin claim → error; contexto no fijado →
  abortar. Validación de TODO input de API con esquema (zod o equivalente).
- Anti-SSRF: todo fetch saliente con host FIJO o allowlist verificada por
  sufijo real de dominio (rechazar `dominio.bueno.evil.com`), timeout y
  AbortController propio por intento.
- Secretos: solo en variables de entorno; NUNCA en código, logs, mensajes de
  UI ni detalles de diagnóstico (mostrar presencia/ausencia, no el valor).

**D3. Capa probatoria/auditoría** (si el dominio tiene valor legal/auditable)
- Sello SHA-256 de todo artefacto relevante; bitácora APPEND-ONLY con
  encadenamiento (sha256 + hashPrev leídos e insertados en LA MISMA
  transacción).
- El CONTENIDO sellado se persiste (payload junto al hash) — un hash sin
  contenido no prueba nada.
- Archivos en almacenamiento WORM content-addressed (`<ámbito>/<id>/<sha256>.<ext>`,
  nunca sobrescribir); si el almacenamiento no está configurado, degradar a
  "solo sello" DICIÉNDOLO (fail-safe honesto).
- Versionado inmutable: re-capturas crean NUEVA versión; las anteriores se
  conservan. Las manifestaciones bajo protesta se re-declaran SIEMPRE (no se
  precargan).

**D4. Conectores enchufables**
- Toda integración externa (mensajería, timbrado, firmas, ERP, webservices)
  sigue el patrón: interface + implementación real + **NoOp honesto** (dice
  "no configurado", no simula éxito) + factory por variables de entorno.
- Fail-safe: un envío/integración que falla NUNCA tumba la operación de
  negocio; devuelve `{ ok:false, detalle }` y la operación continúa (principio
  "alertar, no bloquear").

**D5. Captura asistida (el capturista no re-teclea)**
- Todo formulario ofrece ingesta del documento fuente (PDF/XML/CSV) con
  extracción y prellenado; el usuario revisa y confirma (sugerir, no imponer).
- Lo que ya vive en la BD se precarga, no se vuelve a pedir. Campos
  precargados marcados visualmente; el prellenado NUNCA pisa lo tecleado.
- OJO al bug conocido: pdf.js/unpdf DETACHA el ArrayBuffer en la primera
  lectura — cada consumidor de los bytes debe recibir SU PROPIA copia.

**D6. Diagnóstico visible (nunca silencio)**
- Ningún flujo termina "sin pasar nada": toda operación muestra estado +
  advertencias específicas del porqué (cada rechazo interno acumula su aviso).
- Errores por lote (cron/barridos) se exponen en la RESPUESTA (campo
  `errores[]`), no solo en console.error.
- Acciones reintenteables sin re-subir/re-capturar (botón "reintentar" con
  entrada manual de respaldo).

**D7. Calidad de código**
- TypeScript ESTRICTO sin `any` (o el equivalente más estricto del stack).
- Idioma consistente en comentarios/nombres (en estos proyectos: español).
- Cabecera de archivo: identidad del producto + bloque Archivo/Propósito.
- Lógica de negocio en FUNCIONES PURAS separadas del I/O (testeables sin BD);
  parsers defensivos ante entrada ajena (JSON.parse en try/catch, validar
  tipos campo por campo, ignorar lo desconocido).
- Transacciones de trabajo pesado con timeout explícito (el default de 5s de
  Prisma aborta barridos — causa clásica de "0 resultados" silencioso).

**D8. Pruebas y verificación**
- Vitest (o equivalente) sobre TODA la lógica pura; los bugs arreglados dejan
  test de REGRESIÓN que falla sin el fix.
- Gate de integración: typecheck limpio + suite completa + build de producción
  ANTES de cada entrega. Los tests que requieren BD viva se marcan/aíslan.

**D9. Operación y despliegue**
- Script de deploy idempotente que DETECTA cambios de esquema (migración solo
  cuando la hay, con credencial elevada solo entonces).
- Comandos para el usuario: copiables, en bloques heredoc a archivo + `nohup`
  en segundo plano con log en `/tmp` (las terminales se congelan con procesos
  largos; nunca depender de una pestaña viva).
- Evitar cambios de esquema cuando sea razonable; cuando se necesiten,
  agruparlos en UNA ola deliberada.
- Cron/monitoreo (vigía) con notificaciones enchufables y estado de canales
  visible en la UI.

## FASE 2 — PLAN (presentar antes de ejecutar)

Con la matriz: propone el plan de homologación en OLAS priorizadas por riesgo
(seguridad D2 > probatorio D3 > diagnóstico D6 > resto), cada ola descompuesta
en carriles de archivos DISJUNTOS con CONTRATOS (firmas/tipos) definidos por
adelantado. Señala qué requiere migración de esquema (agrúpalo) y qué decisión
humana bloquea qué carril. Presenta el plan y espera confirmación SOLO si hay
decisiones destructivas o ambigüedad real; si el camino es claro, ejecuta.

## FASE 3 — EJECUCIÓN (modo definitivo)

1. Escribe/actualiza el `CLAUDE.md` del repo con los principios de este
   estándar adaptados a su dominio (el principio rector del dominio lo dicta
   el humano experto; márcalo "a confirmar" si no lo tienes).
2. Ejecuta las olas con agentes específicos en PARALELO y sincronizados:
   carriles disjuntos, contratos primero, cada agente verifica su parte
   (tests dirigidos + typecheck) SIN build ni commit.
3. Al cerrar cada ola: integra, corre la verificación completa (typecheck +
   suite entera + build), haz commit con mensaje descriptivo y push.
4. Checkpoints: tras completar cada carril, commit WIP + push (nada se queda
   solo en el árbol de trabajo).
5. Reporta cada ola con: qué se homologó, evidencia de verificación, y qué
   quedó pendiente de decisión humana.

REGLA DE ORO: lo que el estándar exige y el dominio del repo no necesita,
se marca NO APLICA con justificación — homologar no es copiar, es cumplir
los mismos principios con las formas del stack local.
