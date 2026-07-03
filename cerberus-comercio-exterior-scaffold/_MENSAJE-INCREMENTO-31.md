# Mensaje para el Claude local — Desplegar Incremento 31 (Partidas, valoración y contribuciones) — CON MIGRACIÓN

> Nuevo módulo de comercio exterior: captura de PARTIDAS con valor en aduana y
> tasas, CÁLCULO de contribuciones (IGI/DTA/IEPS/IVA) y generación del PEDIMENTO
> que agrega los totales, todo sellado (sha256) y en bitácora. Conector
> ClasificadorArancel (TIGIE) enchufable (NoOp: la tasa de IGI se captura a mano).
>
> **CAMBIA EL SCHEMA**: modelo nuevo `Pedimento` + campos de valoración/
> contribuciones en `Partida`. Hay migración → necesitas `NEON_ADMIN`.

---

Con el deploy.sh el flujo es de una línea; como cambia el esquema, pásale la cadena OWNER de Neon:

```
cd /Users/gca/Desktop/cerberus-workspace/claude-code-skills-abril-2026
git pull origin claude/arquitecto-j0mw1x
NEON_ADMIN='postgresql://neondb_owner:npg_f7YUdjn2ZgJI@ep-square-moon-atqn5meb.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' bash cerberus-comercio-exterior-scaffold/deploy.sh
```

El script detectará la migración nueva (`Pedimento` + campos en `Partida`), migrará local y Neon, reaplicará RLS (la nueva tabla `pedimento` es tenant-scoped → debe quedar con policy `tenant_isolation`) y desplegará. `partida` ya tenía RLS.

Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
1. Abre una operación → **Partidas y contribuciones**.
2. Captura una partida: fracción de 8 dígitos (p. ej. `84713001`), valor en aduana `100000`, tasa IGI `15`. Debe mostrar IGI `$15,000.00`, DTA `$800.00`, IVA `$18,528.00`.
   - Fracción con menos de 8 dígitos → 400 con el detalle.
3. **Generar pedimento** (clave `A1`, régimen `IMPORTACION DEFINITIVA`, tipo de cambio `17.5`) → muestra el total de contribuciones agregado y queda sellado; evento `PEDIMENTO_GENERADO` en bitácora (visible en el exporte/dossier).

Nota: el cálculo es el GENERAL (IGI ad valorem, DTA 8 al millar, IVA 16% sobre valor+IGI+DTA+IEPS). Cuotas específicas/compensatorias, preferencias de TLC, IVA fronterizo 8%, etc., los ajusta el agente; la tasa de IGI por fracción se capturará automáticamente cuando se conecte la TIGIE (variable `ARANCEL_PROVIDER`).
