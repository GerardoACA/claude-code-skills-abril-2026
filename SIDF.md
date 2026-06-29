# SIDF.md — Retomar el trabajo desde otra computadora

Este archivo contiene prompts listos para copiar y pegar en Claude Code
cuando quieras continuar el trabajo de este repositorio desde otra máquina
o en una sesión nueva.

---

## Contexto del proyecto

- Repositorio índice (en español) que cura los **14 mejores skills y
  herramientas de Claude Code — Abril 2026**.
- El contenido principal vive en `README.md` (tabla índice + detalle por
  repositorio + sección de uso + notas).
- Repo en GitHub: `GerardoACA/claude-code-skills-abril-2026`
- Rama de trabajo: `claude/sidf-md-96bq4i`

---

## Prompt — versión corta (retomar y preguntar qué hacer)

```
Retomo el repo GerardoACA/claude-code-skills-abril-2026 desde otra
computadora. Cambia a la rama claude/sidf-md-96bq4i (haz fetch/pull para
tener el último commit), lee el README.md y dime el estado actual.
Luego pregúntame qué hago hoy. Commits en español y push a esa misma
rama; no crees PR salvo que lo pida.
```

---

## Prompt — versión que arranca verificando los enlaces (tarea pendiente)

```
Retomo el repo GerardoACA/claude-code-skills-abril-2026 desde otra
computadora.

1. Cambia a la rama claude/sidf-md-96bq4i (git fetch + pull para tener el
   último commit). Créala desde origin si no existe localmente.
2. Lee el README.md.
3. Verifica que las 14 URLs de GitHub listadas existan realmente
   (revisa el estado HTTP de cada repo). Hazme una tabla con: número,
   repo, estado (OK / roto / redirige).
4. Para los enlaces rotos, propón una corrección (repo correcto si lo
   encuentras) o márcalo claramente en el README. No borres entradas sin
   confirmarlo conmigo.
5. Aplica los cambios, commit en español y push a claude/sidf-md-96bq4i.
   No crees PR salvo que lo pida.
```

---

## Recomendaciones

1. **Antes de cambiar de computadora**, asegúrate de que todo esté pusheado
   a `origin/claude/sidf-md-96bq4i`.
2. En la otra máquina, ten configurado el acceso a GitHub (token o SSH)
   para poder hacer `pull`/`push`.
3. Si usas Claude Code **en la web** (claude.ai/code), no necesitas clonar
   nada: el entorno clona el repo solo; basta con pegar el prompt y pedirle
   que trabaje en la rama indicada.
