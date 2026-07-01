# Mensaje para el Claude local — Desplegar el estado ACTUAL (KYC + Operación)

> Pega este bloque en tu Claude local (en ~/Desktop/cerberus-workspace). Un solo despliegue trae
> TODO lo nuevo: módulo KYC (Incremento 3) + módulo Operación de despacho (Incremento 4).
> NINGUNO cambió la base de datos, así que NO hay migración nueva ni cambios en Neon.

---

Despliega el estado actual del producto NUEVO cerberus-comercio-exterior (incluye el módulo KYC: clientes + cuestionario 1.4.14 + verificación 69-B; y el módulo de Operación de despacho: encargo conferido + operaciones + máquina de estados). NO es SIDF; no toques cerberus-sidf-mp ni cerberus-platform. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error de build o de pruebas.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026 haz: git checkout claude/arquitecto-j0mw1x && git pull.

2) Sincroniza el código nuevo al producto con rsync, EXCLUYENDO .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md y bootstrap-*.sh, desde
   claude-code-skills-abril-2026/cerberus-comercio-exterior-scaffold/
   hacia ~/Desktop/cerberus-workspace/cerberus-comercio-exterior/

3) cd al producto; npm install; npx prisma generate.
   IMPORTANTE: el schema NO cambió, así que NO hay migración nueva ni cambios en la base Neon.

4) npm run build  y  (set -a; source .env; set +a; npm test). Corrige cualquier error de tipos tú mismo (anota tipos, evita widening de literales, params async de Next 16).

5) git add -A && git commit -m "Módulos KYC y Operación de despacho" && git push  (push a main autorizado).

6) Redespliega a producción: npx vercel --prod.

7) Verifica en vivo en https://cerberus-comercio-exterior.vercel.app (login admin@demo.mx / demo1234):
   - "Clientes": registrar un cliente, abrir su Cuestionario KYC (1.4.14), su Verificación 69-B, y su Encargo conferido.
   - "Operaciones": crear una operación para ese cliente y avanzar su estado (ARMADO → PREVALIDADO → … → VERDE/ROJO); cada cambio queda en la bitácora.
   Dame un resumen corto de qué quedó funcionando y la URL.

Objetivo: que Gerardo abra la app y ya pueda dar de alta clientes, llenar el cuestionario KYC, registrar encargo, crear operaciones y avanzar su estado — sin tocar la terminal.
