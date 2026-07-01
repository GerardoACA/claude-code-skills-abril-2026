# Mensaje para pegar en el Claude local de la Mac

> Gerardo: abre tu sesión de Claude Code en la terminal (en `~/Desktop/cerberus-workspace`)
> y **pega TODO el bloque de abajo**. Luego déjalo trabajar; puede tardar. Solo te preguntará
> si queda realmente atorado.

---

Trabaja de forma AUTÓNOMA de principio a fin. No me hagas escribir comandos: hazlo tú.
Solo pregúntame si quedas realmente bloqueado (por ejemplo un clic en el dashboard de Vercel
que no puedas hacer por CLI ni por navegador). Puedes usar las herramientas de navegador para
Vercel/GitHub como se hizo en los proyectos MICN y SIDF.

CONTEXTO: Estamos terminando el producto NUEVO `cerberus-comercio-exterior`. NO es SIDF; no
toques cerberus-sidf-mp ni cerberus-platform. Los repos están en `~/Desktop/cerberus-workspace/`.

TAREAS (en orden):

1) CONSOLIDAR LA BASE DE CONOCIMIENTO en la carpeta del producto:
   - En `~/Desktop/cerberus-workspace/claude-code-skills-abril-2026`, haz
     `git checkout claude/arquitecto-j0mw1x && git pull`.
   - Copia toda la base de conocimiento a una subcarpeta `docs/` del producto:
     `mkdir -p ~/Desktop/cerberus-workspace/cerberus-comercio-exterior/docs` y copia ahí
     el contenido de `claude-code-skills-abril-2026/CERBERUS-COMERCIO-EXTERIOR/`
     (reporte normativo, dictámenes del panel, decisiones, diseño v2, aviso de privacidad,
     contrato de encargo, informe de reconciliación, runbook). Así todo queda en un solo lugar.

2) SINCRONIZAR EL CÓDIGO NUEVO y DESPLEGAR:
   - Sigue al pie de la letra el runbook:
     `claude-code-skills-abril-2026/cerberus-comercio-exterior-scaffold/_DEPLOY-RUNBOOK.md`
     (Fases 1 a 5: sincronizar código, build+base local+pruebas, push a GitHub, base Neon vía
     Vercel + variables, redeploy y verificación).
   - Corre `npm run build` y `npm test` y ARREGLA cualquier error de tipos o de pruebas antes de
     desplegar (no me consultes por errores de código: resuélvelos).
   - Punto delicado ya resuelto en el runbook: el login necesita la política
     `prisma/sql/03-auth-lookup.sql` aplicada (porque `usuario` tiene RLS). Verifícalo.

3) VERIFICAR que en vivo funciona:
   - `https://cerberus-comercio-exterior.vercel.app` : landing, `/aviso-privacidad`, y
     `/login` con **admin@demo.mx / demo1234** que llegue a `/dashboard` mostrando solo los
     datos del tenant demo.

4) AL TERMINAR, déjame un resumen corto: qué quedó en vivo, la URL, y cualquier pendiente
   (por ejemplo confirmaciones legales humanas o contratar el PSC/TSA).

Objetivo: que mañana Gerardo abra la URL y vea la app funcionando con login, tablero y aviso,
sin que él haya tocado la terminal.
