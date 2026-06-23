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
3. Comparte el calendario del despacho con el correo de la Service Account (permiso
   *"Hacer cambios en eventos"*).
4. Pon ese calendario en `GOOGLE_CALENDAR_ID`.
5. **Prueba la conexión** antes de seguir:
   ```bash
   python -m scripts.test_calendar                   # lista horarios libres
   python -m scripts.test_calendar --book tu@correo  # crea una cita de prueba
   ```

## Aviso de privacidad y consentimiento (LFPDPPP)

Ante un contacto nuevo, el bot envía primero el **aviso de privacidad** y espera
que responda *ACEPTO* antes de procesar cualquier consulta (`app/core/consent.py`).
Personaliza el enlace al aviso integral con `PRIVACY_NOTICE_URL` en `.env`, y el
texto editando `consent.py`.

> ⚠️ **Cambio de esquema:** se añadieron columnas de consentimiento a `contacts`.
> En una BD nueva se crean solas. Si ya tenías la BD del MVP anterior, recréala
> (`docker compose down -v && docker compose up -d db`) o aplica:
> ```sql
> ALTER TABLE contacts ADD COLUMN consent_prompted boolean DEFAULT false;
> ALTER TABLE contacts ADD COLUMN consent_given boolean DEFAULT false;
> ALTER TABLE contacts ADD COLUMN consent_at timestamptz;
> ```

## Modelos de Claude

Por defecto se usa `claude-sonnet-4-6`: el mejor equilibrio entre calidad,
latencia y costo para un chatbot de alto volumen con *tool use*. Para máxima
capacidad, sube a `claude-opus-4-8` cambiando `CLAUDE_MODEL` en `.env`.

> ℹ️ Sonnet 4.6 y Opus 4.x usan `effort` y *adaptive thinking*. Haiku 4.5 y los
> Sonnet 4.5/anteriores no los soportan (darían 400); `claude_client.py` lo
> detecta y omite esos parámetros automáticamente según el modelo configurado.

## Agendado conversacional (tool use)

El bot agenda citas dentro del chat usando dos herramientas que Claude invoca
según la conversación (`app/core/scheduling.py`):

- `get_available_slots` → consulta Google Calendar y devuelve horarios libres.
- `book_appointment` → crea el evento (con enlace de Meet), guarda la cita en BD
  y marca el lead como `scheduled`.

El flujo: el cliente pide consulta → Claude propone 2-3 horarios en lenguaje
natural → el cliente elige (y opcionalmente da su correo) → Claude confirma y
reserva. `claude_client.generate_reply` ejecuta el bucle de tool use.

## Consideraciones legales (importante en un despacho)

- **LFPDPPP**: trata datos personales y sensibles. Añade aviso de privacidad y
  consentimiento al inicio del chat (puede ir en el prompt del sistema o como
  primer mensaje automático).
- **Secreto profesional**: cifra datos en reposo/tránsito y controla accesos.
- El bot **no da asesoría legal vinculante** (ya está en los guardrails del prompt).

## Siguientes pasos (roadmap)

- [x] Flujo de agendado conversacional (tool use con `get_available_slots` / `book_appointment`).
- [x] Mensaje inicial con aviso de privacidad/consentimiento (LFPDPPP).
- [ ] Panel de control y métricas (leads por canal, conversión a cita).
- [ ] Seguimiento automático (recordatorios con plantillas de WhatsApp).
- [ ] Migraciones con Alembic (hoy se usa `create_all` para el MVP).
- [ ] Detección de urgencias con escalado inmediato.
```
