# Mensaje para el Claude local — Desplegar Incremento 3 (módulo KYC)

> Gerardo: abre tu Claude local en `~/Desktop/cerberus-workspace` y pega el bloque de abajo.

---

Despliega el Incremento 3 (módulo KYC: registrar clientes, cuestionario del expediente 1.4.14, y verificación 69-B) del producto NUEVO cerberus-comercio-exterior. NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja de forma autónoma; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error de build o de pruebas.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026 haz: git checkout claude/arquitecto-j0mw1x && git pull.

2) Sincroniza el código nuevo al producto con rsync, EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md y bootstrap-*.sh, desde
   claude-code-skills-abril-2026/cerberus-comercio-exterior-scaffold/
   hacia ~/Desktop/cerberus-workspace/cerberus-comercio-exterior/

3) cd ~/Desktop/cerberus-workspace/cerberus-comercio-exterior; npm install; npx prisma generate.
   IMPORTANTE: el schema NO cambió en este incremento, así que NO hay migración nueva ni cambios en la base Neon.

4) npm run build  y  (set -a; source .env; set +a; npm test). Corrige cualquier error de tipos tú mismo (patrón: anota tipos, evita widening de literales).

5) git add -A && git commit -m "Incremento 3: módulo KYC (clientes, cuestionario 1.4.14, verificación 69-B)" && git push  (push a main autorizado).

6) Redespliega a producción: npx vercel --prod.

7) Verifica en vivo en https://cerberus-comercio-exterior.vercel.app :
   - /login con admin@demo.mx / demo1234
   - En el dashboard, entra a "Clientes"
   - Registra un cliente nuevo (RFC + razón social)
   - Abre su Cuestionario KYC (expediente 1.4.14) y guárdalo
   - Abre su Verificación 69-B y córrela (es alerta, no bloqueo)
   Dame un resumen corto de qué quedó funcionando y la URL.

Objetivo: que Gerardo abra la app y ya pueda dar de alta clientes y llenar el cuestionario KYC de verdad, sin que él toque la terminal.
