# Mensaje para el Claude local — Desplegar Incrementos 22 y 23 — CON MIGRACIÓN

> Cambio de enfoque pedido por el cliente: los clientes/proveedores NO entregan
> su e.firma (.cer), pero SÍ la **opinión de cumplimiento impresa/PDF**. Ahora se
> **ingiere esa opinión** y la IA **valida su autenticidad** (detecta falsos), con
> **cotejo en vivo** por folio ante el SAT listo para conectar (no requiere e.firma).
> En IMMEX se deja **todo listo para conectar el ERP** que el cliente indique, con
> la explicación del porqué.
>
> Qué entra:
> - **Inc 22** — **Opinión 32-D ingestada + validación de autenticidad + cotejo en
>   vivo (conector)**: modelo `OpinionCumplimientoIngestada`, validador
>   `validador-opinion.ts` (marcadores SAT, folio/acuse, RFC, sentido,
>   consistencia → AUTENTICA/SOSPECHOSA/NO_AUTENTICA/NO_VERIFICABLE), conector
>   `verificador-opinion-sat.ts` (NoOp), ruta/página/form. Alimenta OPINION_32D.
>   **← migración** (modelo + 3 enums).
> - **Inc 23** — **Saldos IMMEX**: página `/clientes/[id]/immex` que consume el
>   conector ERP (Inc 21) y muestra saldos por pedimento con semáforo de
>   vencimiento; explica para qué se necesitan (Anexo 24/31) y que basta con que
>   el cliente indique su ERP. **Sin cambios de modelo.**
> - El camino de la **e.firma .cer** (Inc 20) queda como **alterno**; el principal
>   es la opinión ingestada.

---

Despliega los Incrementos 22 y 23 del producto NUEVO cerberus-comercio-exterior. NO es SIDF. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (modelo `OpinionCumplimientoIngestada` + enums `ResultadoValidacionOpinion`, `EstadoCotejoSat`, `SentidoOpinion`; tenant-scoped). Migración local + Neon + re-RLS (patrón rodado).

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: `git checkout claude/arquitecto-j0mw1x && git pull`.

2) rsync del scaffold al producto (exclusiones de siempre: .git, node_modules, .next, .env, .env*.local, .vercel, package-lock.json, _*.md, bootstrap-*.sh, docs, next-env.d.ts).

3) cd al producto; `npm install`.

4) MIGRACIÓN LOCAL:
   ```
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name opinion_ingestada
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
   ```
   (El 01 es dinámico: aplicará RLS a `opinion_cumplimiento_ingestada`. Verifica que quede con RLS habilitada.)

5) `npm run build` y `(set -a; source .env; set +a; npm test)`. Arregla errores tú mismo.
   (En el scaffold `tsc --noEmit` y `prisma validate` ya pasan limpio; pruebas probatoria 16/16.)

6) `git add -A && git commit -m "Incrementos 22-23: opinion 32-D ingestada + validacion de autenticidad + cotejo en vivo (conector) + saldos IMMEX" && git push`

7) MIGRACIÓN EN NEON:
   ```
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
   ```

7-bis) COTEJO EN VIVO REAL (opcional pero YA IMPLEMENTADO — no es NoOp):
   El verificador de opinión ante el SAT ya trae un cliente HTTP real
   (`VerificadorOpinionSatHttp`). Para encenderlo, define en el proyecto de
   Vercel (Production) las variables de entorno y vuelve a desplegar:
   ```
   vercel env add SAT_OPINION_PROVIDER production   # valor: HTTP
   vercel env add SAT_OPINION_URL production        # endpoint que valida el folio ante el SAT
   vercel env add SAT_OPINION_API_KEY production     # (opcional) token Bearer
   ```
   Contrato del endpoint (POST JSON):
   - Request:  { "rfc": string, "folio": string, "sentidoDeclarado": string }
   - Response: { "encontrada": boolean, "sentido"?: "POSITIVA"|"NEGATIVA"|"SIN_OBLIGACIONES"|"NO_INSCRITO", "detalle"?: string }
   Mapeo: encontrada=false → DISCREPANCIA; sentido ≠ declarado → DISCREPANCIA;
   coincide → CONFIRMADA; error/timeout/JSON inválido → NO_DISPONIBLE (fail-safe).
   Si NO defines estas variables, el cotejo queda en NO_DISPONIBLE (NoOp honesto)
   y la opinión se resuelve por el análisis de autenticidad del texto. Apunta
   SAT_OPINION_URL a tu gateway / PAC / servicio que valide el folio (el folio te
   lo entrega el cliente; el cotejo por folio NO requiere su e.firma).

8) `npx vercel --prod`

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234). En un cliente → "Verificación de cumplimiento":
   - **Inc 22 (opinión):** clic en "Ingerir opinión 32-D y validar autenticidad".
     a. Pega un texto que simule una opinión del SAT (incluye "Servicio de Administración Tributaria", "Opinión del cumplimiento", "32-D", un "Folio: ABC123456", el RFC del cliente y "Positivo") → veredicto **AUTENTICA**, folio y sentido extraídos, cotejo **NO_DISPONIBLE** (conector), y OPINION_32D queda **AL_CORRIENTE** en la tabla de cumplimiento.
     b. Pega un texto sin marcadores del SAT o con otro RFC → **NO_AUTENTICA** → OPINION_32D **ALERTA**. Evento `OPINION_INGESTADA` en bitácora (encadenado), visible en el exporte.
   - **Inc 23 (IMMEX):** en el mismo cliente → "Saldos IMMEX (ERP)" → se ve la explicación del "para qué" y, como el ERP no está conectado (NoOp), el bloque "ERP del cliente no conectado" pidiendo qué ERP usa. (Cuando se defina `ERP_PROVIDER` y su adaptador, la misma pantalla mostrará los saldos con semáforo.)
   Dame un resumen corto y la URL.

Notas:
- El **cotejo en vivo** por folio ante el SAT YA está IMPLEMENTADO (cliente HTTP
  real `VerificadorOpinionSatHttp`, con pruebas `tests/verificador-opinion.test.ts`):
  se enciende con las variables del paso 7-bis; sin ellas queda en NO_DISPONIBLE
  honesto. Un cotejo **CONFIRMADA** del SAT tiene PRIORIDAD sobre la heurística de
  texto; una **DISCREPANCIA** (folio inexistente o sentido distinto) genera ALERTA.
- PAC y PSC siguen diferidos (NoOp).
