# Mensaje para el Claude local — Desplegar Incrementos 16 a 21 (lote) — CON MIGRACIÓN

> Un solo despliegue cubre seis incrementos. **CAMBIA EL SCHEMA** (modelo nuevo
> `EfirmaEntregada` + enum `ResultadoValidacionEfirma`) → hay migración. Si el
> Incremento 15 (override, modelo `OverrideAlerta`) aún NO se había migrado en
> tu entorno, ESTA migración lo incluye también (migrate dev captura todo lo
> pendiente): así el override firmado se despliega junto con este lote.
>
> Qué entra:
> - **Inc 16** — CFDI de INGRESO con **Complemento de Comercio Exterior 1.1**
>   (exportación definitiva A1): validación (país c_Pais, fracción 8 dígitos,
>   tipo de cambio, valores USD), ruta separada, form y sección en la página CFDI.
> - **Inc 17** — **Contrato de Encargo** LFPDPPP generable por tenant (cuerpo
>   derivado + sello sha256, versionado, encadenado en bitácora; solo ADMIN).
> - **Inc 18** — **Gestión de usuarios y roles** por tenant (alta con hash scrypt,
>   cambio de rol/estado, sin auto-degradación; solo ADMIN).
> - **Inc 19** — **Tablero ejecutivo** con métricas agregadas (RLS por tenant).
> - **Inc 20** — **e.firma entregada + validación de autenticidad**: el cliente
>   entrega su **certificado público .cer**; un validador automático (X.509 con
>   node:crypto) comprueba emisor SAT, vigencia, RFC y huella, y **rechaza
>   cualquier clave privada** (C14). Alimenta la fuente OPINION_32D. **← migración.**
> - **Inc 21** — **conector ERP/IMMEX** enchufable (NoOp honesto) + doc: listo
>   para conectar CUALQUIER ERP del cliente. **PAC y PSC siguen diferidos** (NoOp).

---

Despliega los Incrementos 16 a 21 (lote) del producto NUEVO cerberus-comercio-exterior. NO es SIDF. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: CAMBIA EL SCHEMA (modelo `EfirmaEntregada` + enum `ResultadoValidacionEfirma`, tenant-scoped). Migración local + Neon + re-RLS (patrón rodado). Si `OverrideAlerta` del Inc 15 no estaba migrado, se incluye en la misma migración.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: `git checkout claude/arquitecto-j0mw1x && git pull`.

2) rsync del scaffold al producto (exclusiones de siempre: .git, node_modules, .next, .env, .env*.local, .vercel, package-lock.json, _*.md, bootstrap-*.sh, docs, next-env.d.ts).

3) cd al producto; `npm install`.

4) MIGRACIÓN LOCAL:
   ```
   ADMIN="postgresql://$(whoami)@localhost:5432/cerberus_comercio_exterior?schema=public"
   DATABASE_URL="$ADMIN" npx prisma migrate dev --name incrementos_16_a_21
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/02-app-role.sql
   psql -d cerberus_comercio_exterior -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
   ```
   (El 01 es dinámico: aplicará RLS a `efirma_entregada` —y a `override_alerta` si no la tenía—. Verifica que ambas tablas queden con RLS habilitada.)

5) `npm run build` y `(set -a; source .env; set +a; npm test)`. Arregla errores tú mismo.
   Nota: `tsc --noEmit` y `prisma validate` ya pasan limpio en el scaffold; `prisma generate` corre en postinstall.

6) `git add -A && git commit -m "Incrementos 16-21: comercio exterior 1.1, contrato de encargo, usuarios/roles, tablero ejecutivo, e.firma+validacion, conector ERP/IMMEX" && git push`

7) MIGRACIÓN EN NEON:
   ```
   NEON_ADMIN="<cadena owner de la base Neon del producto>"
   DATABASE_URL="$NEON_ADMIN" npx prisma migrate deploy
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cerberus_ce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cerberus_ce_app;"
   psql "$NEON_ADMIN" -v ON_ERROR_STOP=1 -f prisma/sql/01-enable-rls-policies.sql
   ```

8) `npx vercel --prod`

9) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - **Inc 20 (e.firma):** en un cliente → "Cumplimiento" → "Gestionar e.firma / opinión 32-D".
     a. Sube un .cer de e.firma del SAT → veredicto VALIDA/ALERTA con los checks (emisor SAT, vigencia, RFC, huella) y la opinión 32-D queda registrada en la tabla de cumplimiento.
     b. Intenta pegar/subir un archivo con "PRIVATE KEY" → 400 "solo acepta el certificado público (.cer)" (C14). NUNCA se almacena clave privada.
   - **Inc 16 (Comercio Exterior 1.1):** abre una operación → CFDI → sección "Capturar CFDI de ingreso (Comercio Exterior 1.1)". Captura con fracción de 8 dígitos y país "USA" → BORRADOR sellado; con fracción inválida → 400 con la lista de errores.
   - **Inc 17 (Contrato de Encargo):** menú "Contrato de encargo" → como ADMIN genera "v1" con instrucciones (≥20 chars) → aparece con su sha256; repetir "v1" → 409.
   - **Inc 18 (Usuarios):** menú "Usuarios" (solo ADMIN) → alta de un OPERADOR; cambia su rol/activo; verifica que NO puedes desactivar tu propia cuenta.
   - **Inc 19 (Tablero ejecutivo):** menú "Tablero ejecutivo" → tarjetas y mini-tablas con las métricas del tenant.
   - **Inc 21 (Conectores/IMMEX):** menú "Conectores" (solo ADMIN) → tabla con PAC, e.firma, WORM y ERP/IMMEX en estado "No configurado" (NoOp) + explicación del régimen IMMEX.
   Dame un resumen corto y la URL.

Notas:
- PAC y PSC permanecen como conectores NoOp (diferidos, por decisión). Nada que configurar aquí.
- El validador de e.firma es determinista y verificable (no una caja negra): la validación criptográfica de la CADENA completa contra la raíz del SAT / OCSP / servicio "ValidaFIEL" es el siguiente escalón, enchufable sin tocar el contrato.
