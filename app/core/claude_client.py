"""Cliente de Claude (Anthropic) y prompt del sistema del chatbot legal.

Centraliza la construcción de la respuesta conversacional usando RAG.
Modelo por defecto: claude-opus-4-8 (configurable en .env).
"""
from __future__ import annotations

import anthropic

from app.config import settings

_client: anthropic.Anthropic | None = None


def _anthropic() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


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
3. Cuando el cliente quiera una consulta, ofrécele agendar una cita.

Reglas importantes (guardrails):
- NO das asesoría legal vinculante ni opiniones jurídicas definitivas. Ofreces \
  información general y orientas hacia una consulta con un abogado del despacho.
- NO inventes leyes, artículos, plazos, precios ni datos que no estén en el contexto.
- Responde en el idioma del cliente, de forma breve y clara (mensajería, no ensayos).
- Si detectas una urgencia grave (detención, audiencia inminente, violencia), \
  indícalo y prioriza la canalización inmediata con un abogado.

Mantén un tono cercano pero formal. No uses lenguaje técnico innecesario.
"""


def _format_context(chunks: list[str]) -> str:
    if not chunks:
        return "(No hay información específica en la base de conocimiento para esta consulta.)"
    return "\n\n---\n\n".join(chunks)


def generate_reply(user_message: str, context_chunks: list[str], history: list[dict]) -> str:
    """Genera la respuesta del bot.

    history: lista de mensajes previos en formato [{"role": "user"/"assistant", "content": str}]
    context_chunks: fragmentos recuperados por RAG.
    """
    context_block = _format_context(context_chunks)

    messages = [
        *history,
        {
            "role": "user",
            "content": (
                f"CONTEXTO DEL DESPACHO:\n{context_block}\n\n"
                f"MENSAJE DEL CLIENTE:\n{user_message}"
            ),
        },
    ]

    response = _anthropic().messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={"effort": "low"},  # respuestas rápidas para chat en vivo
        messages=messages,
    )
    return "".join(block.text for block in response.content if block.type == "text").strip()
