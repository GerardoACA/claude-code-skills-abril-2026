"""App mínima que conversa con un Anthropic Managed Agent ya creado.

Flujo (según la guía de Managed Agents):
  1. Crea una sesión que referencia un agente PRE-CREADO por su ID.
  2. Abre el stream de eventos ANTES de enviar el mensaje (stream-first).
  3. Envía un evento user.message.
  4. Imprime el texto de los eventos agent.message conforme llega.
  5. Termina al llegar a session.status_idle (con stop_reason terminal) y sale
     limpiamente ante errores o session.status_terminated.

Uso:
  export ANTHROPIC_API_KEY=sk-ant-...
  python main.py "Tu mensaje para el agente"
"""
from __future__ import annotations

import sys

import anthropic

# Recursos pre-creados (el agente NO se crea aquí; se referencia por ID).
AGENT_ID = "agent_0159ujsjyLdydcZ4haG5zU1m"
ENVIRONMENT_ID = "env_01X9JSnGyMeTpzQsKDgiTEKV"

DEFAULT_MESSAGE = "Hola, ¿en qué puedes ayudarme?"


def main() -> int:
    message = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MESSAGE
    client = anthropic.Anthropic()  # usa ANTHROPIC_API_KEY del entorno

    try:
        session = client.beta.sessions.create(
            agent=AGENT_ID,  # string => última versión del agente
            environment_id=ENVIRONMENT_ID,
        )
    except anthropic.APIError as exc:
        print(f"[error] No se pudo crear la sesión: {exc}", file=sys.stderr)
        return 1

    print(f"Sesión: {session.id}")
    print(
        "Verla en Console: "
        f"https://platform.claude.com/workspaces/default/sessions/{session.id}\n"
    )

    try:
        # Stream-first: abrimos el stream y LUEGO enviamos, para no perder eventos.
        with client.beta.sessions.events.stream(session_id=session.id) as stream:
            client.beta.sessions.events.send(
                session_id=session.id,
                events=[
                    {
                        "type": "user.message",
                        "content": [{"type": "text", "text": message}],
                    }
                ],
            )

            for event in stream:
                if event.type == "agent.message":
                    for block in event.content:
                        if block.type == "text":
                            print(block.text, end="", flush=True)

                elif event.type == "session.status_idle":
                    # Idle no siempre es terminal: puede estar esperando una
                    # acción del cliente (confirmación de tool / resultado).
                    stop = getattr(event, "stop_reason", None)
                    if stop is not None and getattr(stop, "type", None) == "requires_action":
                        print(
                            "\n\n[La sesión requiere una acción del cliente "
                            "(tool/confirmación) — no soportado en este demo mínimo].",
                            file=sys.stderr,
                        )
                        return 2
                    print()  # salto de línea final
                    return 0

                elif event.type == "session.status_terminated":
                    print("\n[Sesión terminada].", file=sys.stderr)
                    return 1

                elif event.type == "session.error":
                    err = getattr(event, "error", None)
                    msg = getattr(err, "message", "desconocido") if err else "desconocido"
                    print(f"\n[error de sesión] {msg}", file=sys.stderr)
                    return 1

    except anthropic.APIError as exc:
        print(f"\n[error de API] {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n[interrumpido]", file=sys.stderr)
        return 130

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
