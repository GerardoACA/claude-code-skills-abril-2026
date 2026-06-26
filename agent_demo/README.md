# Demo mínimo de Managed Agent

App de consola que conversa con un Anthropic Managed Agent ya creado, vía el SDK.

- **Agente:** `agent_0159ujsjyLdydcZ4haG5zU1m` (pre-creado; se referencia por ID).
- **Entorno:** `env_01X9JSnGyMeTpzQsKDgiTEKV`.

## Uso

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python main.py "Tu mensaje para el agente"
```

Si no pasas mensaje, usa uno por defecto.

## Qué hace

1. `client.beta.sessions.create(agent=..., environment_id=...)` — crea la sesión.
2. Abre `client.beta.sessions.events.stream(...)` **antes** de enviar (stream-first).
3. Envía un `user.message` con `client.beta.sessions.events.send(...)`.
4. Imprime el texto de los eventos `agent.message` conforme llega.
5. Termina en `session.status_idle` (stop_reason terminal); sale con código != 0
   ante `session.status_terminated`, `session.error` o errores de API.

> El SDK añade el header beta `managed-agents-2026-04-01` automáticamente en las
> llamadas `client.beta.{sessions,agents,...}`.
