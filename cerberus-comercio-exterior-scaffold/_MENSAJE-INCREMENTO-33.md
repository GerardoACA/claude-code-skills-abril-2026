# Mensaje para el Claude local — Desplegar Incremento 33 (Vigencias y vencimientos) — CON MIGRACIÓN

> Calendario de cumplimiento tenant-wide: opiniones 32-D, encargos conferidos,
> contratos de encargo y documentos, clasificados VENCIDO / POR_VENCER / VIGENTE.
> **CAMBIA EL SCHEMA**: campo `vigenciaHasta` en `OpinionCumplimientoIngestada`
> (el IMSS la declara; el SAT se estima a 30 días de la emisión). Hay migración.

---

```
cd /Users/gca/Desktop/cerberus-workspace/claude-code-skills-abril-2026
git pull origin claude/arquitecto-j0mw1x
NEON_ADMIN='postgresql://neondb_owner:npg_f7YUdjn2ZgJI@ep-square-moon-atqn5meb.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' bash cerberus-comercio-exterior-scaffold/deploy.sh
```

El script detecta la migración (columna `vigencia_hasta`), migra local + Neon, reaplica RLS y despliega.

Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
1. Menú **Vigencias** (en el tablero). Muestra las tarjetas de "Vencidos" y "Por vencer" + la tabla ordenada por urgencia.
2. Ingiere de nuevo una opinión (SAT o IMSS) en un cliente → al recargar Vigencias debe aparecer con su fecha de vencimiento (la del IMSS puede salir como "Vencido" si el acuse es de una fecha pasada; la del SAT a 30 días de la emisión).
3. Las opiniones ingestadas ANTES de este incremento no tienen `vigenciaHasta` (se llenó desde ahora); vuelve a ingerirlas si quieres verlas en el calendario.

Nota: es informativo (C9). Ventana "por vencer" = 30 días.
