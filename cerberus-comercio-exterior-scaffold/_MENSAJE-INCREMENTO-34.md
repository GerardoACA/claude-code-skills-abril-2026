# Mensaje para el Claude local — Desplegar Incremento 34 (Vigía → Telegram) — SIN MIGRACIÓN

> El vigía diario ahora, además de re-verificar cumplimiento, barre los
> VENCIMIENTOS (opiniones 32-D, encargos, contratos, documentos) y AVISA POR
> TELEGRAM (conector enchufable; NoOp si no está configurado). Sin cambios de
> esquema → despliegue de una línea.

---

```
cd /Users/gca/Desktop/cerberus-workspace/claude-code-skills-abril-2026
git pull origin claude/arquitecto-j0mw1x
bash cerberus-comercio-exterior-scaffold/deploy.sh
```
(Dirá "Sin cambios de esquema: NO se tocará Neon".)

## Configurar Telegram (para que el vigía avise)
1. En Telegram, habla con **@BotFather** → `/newbot` → copia el **token** (algo como `123456:ABC-...`).
2. Consigue el **chat id** del destino:
   - Crea un grupo/canal, agrega tu bot, y manda un mensaje.
   - Abre `https://api.telegram.org/bot<TU_TOKEN>/getUpdates` y busca `"chat":{"id":-100...}` → ese número es el `TELEGRAM_CHAT_ID` (los grupos empiezan con `-100`). O usa **@userinfobot** para un chat directo.
3. En Vercel (dashboard → Settings → Environment Variables, Production) agrega:
   - `TELEGRAM_BOT_TOKEN` = el token del bot
   - `TELEGRAM_CHAT_ID` = el id del chat
   Luego **Redeploy** (o `npx vercel --prod`) para que tome las variables.

## Probar el aviso a mano (sin esperar al cron)
```
curl -H "Authorization: Bearer $CRON_SECRET" https://cerberus-comercio-exterior.vercel.app/api/cron/vigia
```
La respuesta trae `{ sync, barrido, vigencias:{vencidos,porVencer}, notificacion:{ok,canal,detalle} }`.
- Si hay algún vencimiento o alerta de cumplimiento y Telegram está configurado, llega el mensaje al chat.
- Sin `TELEGRAM_*` → `notificacion.canal = "NINGUNO"` (NoOp honesto), pero el barrido sí queda en bitácora (`VIGIA_VIGENCIAS`) y en `/vigencias`.

Notas:
- Solo avisa cuando HAY algo que reportar (no manda pings vacíos a diario).
- Fail-safe: si Telegram falla, el barrido no se aborta.
- El cron corre 12:00 UTC (~6am CDMX) por `vercel.json`. `CRON_SECRET` ya debe existir del Inc 11.
