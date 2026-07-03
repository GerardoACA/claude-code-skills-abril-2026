# Incremento 36 — Destinatarios y ruteo de notificaciones por cliente

## Qué hace
Cada **cliente** define **quién** de su organización (CEO, CFO, OCN, operaciones,
legal…) recibe **qué categoría** de aviso y por qué **canal**:

- **Categorías (por módulo):** Cumplimiento (69-B), Vigencias/vencimientos,
  Opinión 32-D, Despacho, KYC 1.4.14, Sanciones internacionales.
- **Canales:** Telegram (real, se envía de inmediato) · Correo (enchufable, pendiente de conector).
- El **vigía/cron** enruta automáticamente cada novedad al/los destinatario(s)
  suscritos a esa categoría — además del resumen global que ya llegaba a tu chat.

## Dónde se usa
- Nueva página: **Cliente → Panorama → “Notificaciones →”**
  (`/clientes/<id>/notificaciones`). Alta/edición/baja de destinatarios,
  activar/desactivar, y selección de categorías por persona.

## ⚠️ Este despliegue CAMBIA EL ESQUEMA (tabla nueva `destinatario`)
Requiere `NEON_ADMIN` para migrar Neon. La tabla lleva `tenant_id`, así que el
script de RLS le aplica **aislamiento por tenant automáticamente** (misma
política `tenant_isolation` que el resto).

## Desplegar (desde tu Mac, en la carpeta del repo del branch)
```bash
git pull origin claude/arquitecto-j0mw1x

NEON_ADMIN='postgresql://neondb_owner:PASS@ep-xxxx.neon.tech/DB?sslmode=require' \
  bash cerberus-comercio-exterior-scaffold/deploy.sh
```
El script detecta el cambio de esquema, genera la migración, aplica RLS,
construye, corre pruebas y despliega a Vercel.

## Cómo probarlo
1. Entra a un cliente → **Panorama → Notificaciones**.
2. Agrega un destinatario: nombre, cargo (p. ej. **CFO**), canal **Telegram**,
   pega su **chat id**, y marca las categorías (p. ej. **Vigencias** y **Opinión 32-D**).
3. Lanza el vigía manualmente:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/vigia
   ```
4. En la respuesta verás el bloque `despacho: { enviados, fallidos, omitidos }`.
   Si hay vencimientos/alertas de ese cliente, al chat del destinatario le llega
   un mensaje `🐺 CERBERUS · <CATEGORÍA>` con el detalle.

## Notas
- El **correo** aún no se envía (queda como canal enchufable); esos destinos se
  cuentan en `omitidos`.
- Sigue llegando **el resumen global** a `TELEGRAM_CHAT_ID` (sin cambios); esto
  es adicional y **específico por actor**.
- Recuerda: si aún no habías desplegado el **Inc 35** (arreglo de `tenants:0` del
  vigía), este despliegue lo incluye — deberías ver `tenants: 1` y ya no `0`.
