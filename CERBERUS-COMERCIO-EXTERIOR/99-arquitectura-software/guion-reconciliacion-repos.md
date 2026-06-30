# Guion de reconciliación — diseño v2 ↔ código existente

> **Objetivo:** antes de construir, comparar el [diseño v2](./diseno-v2-cerberus.md) contra lo que
> ya existe en los repos CERBERUS del cliente, para reutilizar en vez de rediseñar.
> **Estado:** pendiente de acceso a los repos (sesión actual restringida a `claude-code-skills-abril-2026`).
> **Repos objetivo:** `cerberus-sidf-mp`, `cerberus-platform` (+ opcionales `cerberus-legal-knowledge`, `cerberus-seguridad-higiene`).

## Cómo habilitar el análisis
- **Opción A (nube):** nueva sesión seleccionando los 3 repos al crearla.
- **Opción B (local, recomendada):** clonar los repos en una carpeta padre y abrir Claude Code ahí.

---

## Paso 1 — Inventario de cada repo
Para `cerberus-sidf-mp` y `cerberus-platform`:
- Leer `README.md`, `package.json` (stack, deps, scripts), estructura de carpetas.
- Identificar framework (NestJS? Next.js?), ORM (Prisma/TypeORM?), base de datos, auth.
- Detectar si es monolito o servicios; si el KYC está acoplado o aislado.

## Paso 2 — Auditoría del KYC en `cerberus-sidf-mp` (valida supuestos bloqueantes de Fase 0)
Buscar y dictaminar:
1. **Modelo de datos del expediente** → ¿mapea a Regla 1.4.14? ¿incluye domicilio de operaciones CE y las fracciones I, II, V, VI, VII, VIII, IX, X?
2. **e.firma** → ¿qué librería? ¿firma del lado del titular o almacena clave privada? ¿produce firmas con no-repudio?
3. **Valor probatorio** → ¿usa SHA-256? ¿hay sellado de tiempo / NOM-151 / Cincel / blockchain? ¿exporte verificable?
4. **Listas 69-B** → ¿modelado binario o por etapas (presunto/definitivo/desvirtuado)? ¿snapshot fechado del DOF?
5. **Aviso de privacidad / consentimiento** → ¿cubre la finalidad de exposición a la autoridad? ¿hay ARCO?
6. **Multi-tenancy** → ¿RLS? ¿algún rol con BYPASSRLS? ¿aislamiento por tenant?

## Paso 3 — Mapeo de módulos v2 ↔ código existente
Tabla por cada módulo del diseño v2 (M0–M8, MP/MC/MD):

| Módulo v2 | ¿Existe en algún repo? | Repo/ruta | Estado | Acción |
|-----------|------------------------|-----------|--------|--------|
| M0 Núcleo multi-tenant + RLS | ? | ? | existe/parcial/falta | reutilizar/adaptar/construir |
| M1 KYC 1.4.14 | (esperado en sidf-mp) | ? | ? | portar |
| MP Capa probatoria (SHA-256/PSC/NOM-151) | (¿en seguridad-higiene?) | ? | ? | reutilizar |
| ... (resto de módulos) | ? | ? | ? | ? |

## Paso 4 — Reconciliar la capa probatoria
Revisar `cerberus-seguridad-higiene` (usa "Cincel NOM-151 + blockchain"):
- ¿La integración con Cincel (PSC) es un módulo reutilizable tal cual?
- ¿El esquema de blockchain coincide con lo que el cliente quiere (3 hashes + fecha/hora/IP)?
- ¿Ya resuelve el "exporte probatorio" que el panel exigió?

## Paso 5 — Reconciliar la base de conocimiento legal
Revisar `cerberus-legal-knowledge`:
- ¿Ya tiene versionado el corpus legal (RGCE/CFF/LA) que el motor de reglas necesita?
- ¿Es consumible por CERBERUS-comercio-exterior o hay que adaptarlo?

## Entregable final
Un informe `informe-reconciliacion.md` en esta misma carpeta con:
1. Qué del diseño v2 **ya existe** y se reutiliza (con rutas concretas).
2. Qué existe **parcialmente** y hay que adaptar.
3. Qué **falta** y hay que construir.
4. Veredicto sobre los **supuestos bloqueantes de Fase 0** (aviso de privacidad, e.firma, 69-B) confirmados o tumbados contra el código real.
5. Diseño v2 **ajustado** para no duplicar lo construido.
