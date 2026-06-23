"""Cliente de Claude (Anthropic) y prompt del sistema del chatbot legal.

Genera la respuesta conversacional usando RAG y, opcionalmente, un bucle de
tool use (para agendar citas). Compatible con Haiku 4.5 (que no soporta `effort`
ni adaptive thinking) y con modelos superiores.
"""
from __future__ import annotations

from collections.abc import Callable

import anthropic

from app.config import settings

_client: anthropic.Anthropic | None = None

# Límite de iteraciones del bucle de herramientas (evita bucles infinitos).
_MAX_TOOL_ITERATIONS = 5


def _anthropic() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _thinking_kwargs(model: str) -> dict:
    """Devuelve thinking/effort solo en modelos que los soportan.

    Haiku 4.5 y los Sonnet 4.5/anteriores NO aceptan `effort` ni adaptive
    thinking: enviarlos devuelve un 400. Para esos modelos no añadimos nada.
    """
    unsupported = ("haiku", "sonnet-4-5", "sonnet-4-0", "opus-4-0", "opus-4-1")
    if any(tag in model for tag in unsupported):
        return {}
    return {"thinking": {"type": "adaptive"}, "output_config": {"effort": "low"}}


# Prompt del sistema con guardrails para un despacho jurídico.
SYSTEM_PROMPT = """\
Eres el asistente virtual de un despacho de abogados. Atiendes a clientes \
potenciales por mensajería (WhatsApp, Telegram, Instagram).

Tu trabajo:
1. Responder con amabilidad y profesionalismo usando ÚNICAMENTE la información \
   del CONTEXTO del despacho que se te proporciona. Si la respuesta no está en el \
   contexto, dilo con honestidad y ofrece agendar una cita con un abogado.
2. Detectar la materia legal del asunto (p. ej. familiar, penal, laboral, mercantil) \
   y la urgencia.
3. Cuando el cliente quiera una consulta, AGENDA una cita usando tus herramientas:
   - Llama a `get_available_slots` para obtener horarios.
   - Propón al cliente 2 o 3 opciones con palabras (no muestres el formato ISO).
   - Cuando el cliente elija, pídele su correo (opcional) y confirma el horario.
   - Solo entonces llama a `book_appointment` con el `starts_at` ISO correspondiente.
   - Tras reservar, confírmale por escrito el día, la hora y el enlace de la reunión.

Reglas importantes (guardrails):
- NO das asesoría legal vinculante ni opiniones jurídicas definitivas. Ofreces \
  información general y orientas hacia una consulta con un abogado del despacho.
- NO inventes leyes, artículos, plazos, precios ni datos que no estén en el contexto.
- NO inventes horarios: usa únicamente los que devuelva `get_available_slots`.
- Responde en el idioma del cliente, de forma breve y clara (mensajería, no ensayos).
- Si detectas una urgencia grave (detención, audiencia inminente, violencia), \
  indícalo y prioriza la canalización inmediata con un abogado.

Mantén un tono cercano pero formal. No uses lenguaje técnico innecesario.
"""


def _format_context(chunks: list[str]) -> str:
    if not chunks:
        return "(No hay información específica en la base de conocimiento para esta consulta.)"
    return "\n\n---\n\n".join(chunks)


def generate_reply(
    user_message: str,
    context_chunks: list[str],
    history: list[dict],
    tools: list[dict] | None = None,
    tool_executor: Callable[[str, dict], str] | None = None,
) -> str:
    """Genera la respuesta del bot, con bucle de tool use si se pasan herramientas.

    history: [{"role": "user"/"assistant", "content": str}] con los turnos previos.
    tools / tool_executor: definiciones y ejecutor para agendar citas, etc.
    """
    context_block = _format_context(context_chunks)
    messages: list[dict] = [
        *history,
        {
            "role": "user",
            "content": (
                f"CONTEXTO DEL DESPACHO:\n{context_block}\n\n"
                f"MENSAJE DEL CLIENTE:\n{user_message}"
            ),
        },
    ]

    base_kwargs = {
        "model": settings.claude_model,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        **_thinking_kwargs(settings.claude_model),
    }
    if tools:
        base_kwargs["tools"] = tools

    client = _anthropic()
    for _ in range(_MAX_TOOL_ITERATIONS):
        response = client.messages.create(messages=messages, **base_kwargs)

        if response.stop_reason == "tool_use" and tool_executor is not None:
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    output = tool_executor(block.name, dict(block.input))
                    tool_results.append(
                        {"type": "tool_result", "tool_use_id": block.id, "content": output}
                    )
            messages.append({"role": "user", "content": tool_results})
            continue

        return "".join(b.text for b in response.content if b.type == "text").strip()

    # Si se agotaron las iteraciones, devuelve lo último de texto disponible.
    return "".join(b.text for b in response.content if b.type == "text").strip() or (
        "Disculpa, tuve un problema al procesar tu solicitud. ¿Podrías repetirla?"
    )
