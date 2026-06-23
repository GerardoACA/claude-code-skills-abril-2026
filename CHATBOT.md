# Chatbot del Despacho — MVP

Automatización de atención a clientes para un despacho de abogados:
**DMs de redes (WhatsApp, Telegram, Instagram) → chatbot con base de conocimiento
(RAG + Claude) → agendado de citas (Google Calendar) → calificación de leads →
canalización al abogado.** Todo propio, sin proveedores terceros tipo ManyChat/Landbot.

## Arquitectura

```
Instagram DM ─┐
WhatsApp     ─┼─ webhooks ─► FastAPI (app/) ─► bot.handle_incoming()
Telegram     ─┘                                   │
                                                  ├─ RAG (Voyage + pgvector)
                                                  ├─ Claude (respuesta)
                                                  ├─ Lead scoring (Claude, JSON)
                                                  ├─ Google Calendar (citas)
                                                  └─ Handoff al abogado (Telegram)
```

## Componentes

| Módulo | Qué hace |
|---|---|
| `app/main.py` | App FastAPI + registro de routers |
| `app/webhooks/meta.py` | Webhook único de WhatsApp + Instagram (Meta Graph) |
| `app/webhooks/telegram.py` | Webhook de Telegram |
| `app/core/bot.py` | Orquestador: persiste, RAG, responde, califica, canaliza |
| `app/core/rag.py` | Embeddings (Voyage) + búsqueda vectorial (pgvector) |
| `app/core/claude_client.py` | Prompt del sistema + generación de respuesta |
| `app/core/lead_scoring.py` | Calificación del lead con salida estructurada |
| `app/core/calendar.py` | Disponibilidad y creación de citas en Google Calendar |
| `app/core/handoff.py` | Notifica al abogado y activa modo humano |
| `app/channels/` | Envío de mensajes por cada canal |
| `app/models.py` | Esquema de BD (contactos, conversaciones, mensajes, leads, citas, knowledge) |
| `scripts/ingest.py` | Carga la base de conocimiento a pgvector |

## Puesta en marcha (local)

```bash
# 1. Dependencias
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configuración
cp .env.example .env        # rellena tus claves

# 3. Base de datos (PostgreSQL + pgvector)
docker compose up -d db

# 4. Cargar la base de conocimiento (FAQs, servicios, honorarios, criterios...)
python -m scripts.ingest docs_despacho/faq.md docs_despacho/servicios.md

# 5. Arrancar la API
uvicorn app.main:app --reload
```

O todo con Docker: `docker compose up --build`.

## Conectar los canales

Necesitas exponer la API por HTTPS (en desarrollo: `ngrok http 8000`).

### WhatsApp + Instagram (Meta)
1. Crea una app en developers.facebook.com con los productos *WhatsApp*, *Messenger* e *Instagram*.
2. Configura el webhook apuntando a `https://TU_DOMINIO/webhooks/meta`
   con el **Verify Token** = `META_VERIFY_TOKEN` de tu `.env`.
3. Suscríbete a los campos `messages` (WhatsApp) y `messages` de Instagram.
4. Rellena en `.env`: `META_ACCESS_TOKEN`, `META_APP_SECRET`,
   `WHATSAPP_PHONE_NUMBER_ID`, `INSTAGRAM_ACCOUNT_ID`.

### Telegram
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url="https://TU_DOMINIO/webhooks/telegram" \
  -d secret_token="$TELEGRAM_WEBHOOK_SECRET"
```

### Google Calendar
1. Crea una **Service Account** en Google Cloud y descarga el JSON a `google_credentials.json`.
2. Habilita la *Google Calendar API*.
3. Comparte el calendario del despacho con el correo de la Service Account (permiso de edición).
4. Pon ese calendario en `GOOGLE_CALENDAR_ID`.

## Modelos de Claude

Por defecto se usa `claude-opus-4-8` (el más capaz). Para alto volumen puedes
cambiar `CLAUDE_MODEL` en `.env` a `claude-sonnet-4-6` (mejor costo/latencia) o
`claude-haiku-4-5` (el más económico) — es decisión tuya según el presupuesto.

## Consideraciones legales (importante en un despacho)

- **LFPDPPP**: trata datos personales y sensibles. Añade aviso de privacidad y
  consentimiento al inicio del chat (puede ir en el prompt del sistema o como
  primer mensaje automático).
- **Secreto profesional**: cifra datos en reposo/tránsito y controla accesos.
- El bot **no da asesoría legal vinculante** (ya está en los guardrails del prompt).

## Siguientes pasos (roadmap)

- [ ] Flujo de agendado conversacional (que el bot ofrezca y confirme horarios con `calendar.py`).
- [ ] Mensaje inicial con aviso de privacidad/consentimiento.
- [ ] Panel de control y métricas (leads por canal, conversión a cita).
- [ ] Seguimiento automático (recordatorios con plantillas de WhatsApp).
- [ ] Migraciones con Alembic (hoy se usa `create_all` para el MVP).
- [ ] Detección de urgencias con escalado inmediato.
```
