# Mensaje para el Claude local — Desplegar Incremento 9 (Dossier de Diligencia) — SIN migración

> Pega este bloque en tu Claude local. NO cambia la base de datos → despliegue simple.

---

Despliega el Incremento 9 (Dossier de Diligencia automático: al caer una operación en ROJO o INCIDENCIA se genera el dossier sellado; página para verlo/descargarlo con cotejo de integridad) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

IMPORTANTE: el schema NO cambió → NO hay migración ni cambios en Neon.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh y docs.

3) cd al producto; npm install; npx prisma generate.

4) npm run build  y  (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

5) git add -A && git commit -m "Incremento 9: dossier de diligencia automatico en ROJO/INCIDENCIA" && git push

6) npx vercel --prod

7) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - En una operación, avanza estados hasta SELECCION → ROJO. La respuesta debe traer el dossier
     generado (documentoId + sha256).
   - Abre "Dossier de diligencia →" en el detalle: debe listar el dossier sellado.
   - Descárgalo: si nada cambió después del rojo, X-Dossier-Match: true; si registraste evidencia
     posterior, el aviso ámbar de diferencia es CORRECTO (así se detectan cambios post-sellado).
   Dame un resumen corto y la URL.

Nota de alcance (documentada en código): el JSON del dossier no se persiste como blob todavía
(no hay object storage conectado); el sha256 sellado ancla el contenido y el paquete es
regenerable. Almacenamiento WORM del blob = paso futuro.
