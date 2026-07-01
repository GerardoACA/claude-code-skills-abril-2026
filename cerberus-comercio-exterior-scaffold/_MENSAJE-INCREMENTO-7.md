# Mensaje para el Claude local — Desplegar Incremento 7 (Expediente Probatorio / Exporte) — SIN migración

> Pega este bloque en tu Claude local. ESTE incremento NO cambia la base de datos (solo lee y
> empaqueta), así que NO hay migración. Despliegue simple.

---

Despliega el Incremento 7 (Expediente Probatorio: generar y descargar el exporte probatorio autocontenido por operación) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error de build o pruebas.

IMPORTANTE: el schema NO cambió → NO hay migración ni cambios en Neon.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install; npx prisma generate.

4) npm run build  y  (set -a; source .env; set +a; npm test). Corrige cualquier error de tipos tú mismo.

5) git add -A && git commit -m "Incremento 7: Expediente probatorio / exporte por operacion" && git push

6) npx vercel --prod

7) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - Operaciones → una operación → "Expediente probatorio →"
   - Ve el resumen de evidencia y pulsa el botón para generar/descargar el exporte JSON.
   Dame un resumen corto y la URL.

Notas de alcance honestas (documentadas en el código):
- La asociación de evidencia es HEURÍSTICA: los eventos de bitácora se ligan por payloadRef que
  contenga el id de la operación (con fallback a los más recientes del tenant); los Documentos se
  toman por contexto del tenant (el schema no tiene FK Documento→Operacion todavía). Mejora futura:
  agregar FK directas evento/documento → operación.
- El sellado calificado PSC/TSA es paso posterior; sin él el exporte queda EVIDENCIA_PRELIMINAR
  (coherente), pero YA es un paquete autocontenido con cadena reencadenada verificable.
