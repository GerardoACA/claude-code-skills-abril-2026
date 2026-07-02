# Mensaje para el Claude local — Desplegar Incremento 14 (Almacén WORM del dossier) — SIN migración

> Persiste el blob del dossier en Vercel Blob (conector enchufable; NoOp honesto sin token).
> Requiere crear el store de Blob en Vercel y que BLOB_READ_WRITE_TOKEN esté en el proyecto.

---

Despliega el Incremento 14 (almacén WORM: el JSON del dossier se persiste en Vercel Blob con ruta content-addressed y wormUrl en el Documento) del producto NUEVO cerberus-comercio-exterior. NO es SIDF. Trabaja autónomo; no me preguntes salvo bloqueo real; arregla tú mismo cualquier error.

El schema NO cambió → SIN migración. Pero hay un paso de infraestructura: el store de Vercel Blob.

1) En ~/Desktop/cerberus-workspace/claude-code-skills-abril-2026: git checkout claude/arquitecto-j0mw1x && git pull.

2) rsync del scaffold al producto (exclusiones de siempre: .git, node_modules, .next, .env, .vercel, package-lock.json, _*.md, bootstrap-*.sh, docs, next-env.d.ts).

3) cd al producto; npm install (instalará @vercel/blob). Si el shim src/types/vercel-blob.d.ts causa conflicto de tipos con el paquete real, elimínalo (está documentado como borrable).

4) npm run build y (set -a; source .env; set +a; npm test). Arregla errores tú mismo.

5) INFRAESTRUCTURA BLOB: crea el store de Blob para el proyecto (dashboard de Vercel → Storage → Create → Blob → conectar a cerberus-comercio-exterior, o vía CLI si está disponible). Verifica que BLOB_READ_WRITE_TOKEN quede inyectado en el proyecto (vercel env ls). Si no puedes crearlo sin intervención del usuario, despliega igual (modo NoOp honesto) y repórtalo como pendiente.

6) git add -A && git commit -m "Incremento 14: almacen WORM del dossier (Vercel Blob conectable)" && git push

7) npx vercel --prod

8) Verifica en https://cerberus-comercio-exterior.vercel.app (admin@demo.mx / demo1234):
   - Crea una operación nueva y llévala a ROJO → dossier automático.
   - En /dossier: si el token está configurado, debe verse "Copia WORM ↗" y la URL debe servir
     el JSON íntegro del paquete; si no hay token, la nota honesta "sin copia WORM; anclado por
     sha256 y regenerable".
   - Nota de diseño: el sha256 del Documento es el sello de CONTENIDO (excluye generadoEn); el
     blob guarda el JSON ÍNTEGRO — son cosas distintas a propósito (documentado en el código).
   Dame un resumen corto y la URL.

Trade-off documentado: las URLs de Vercel Blob "public" no son adivinables pero sí públicas;
mitigación futura si se desea endurecer: blob privado o proxy autenticado.
