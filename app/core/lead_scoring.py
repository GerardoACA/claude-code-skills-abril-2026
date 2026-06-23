"""Calificación de leads con salida estructurada de Claude.

Analiza la conversación y devuelve materia, urgencia, score (0-100) y un resumen
del caso para el abogado. Usa structured outputs (output_config.format) para
garantizar JSON válido.
"""
from __future__ import annotations

import json

import anthropic

from app.config import settings

_client: anthropic.Anthropic | None = None


def _anthropic() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


LEAD_SCHEMA = {
    "type": "object",
    "properties": {
        "matter": {
            "type": "string",
            "description": "Materia legal del asunto (familiar, penal, laboral, mercantil, civil, amparo, otro)",
        },
        "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
        "score": {
            "type": "integer",
            "description": "Probabilidad de 0 a 100 de que sea un cliente potencial valioso para el despacho",
        },
        "is_qualified": {
            "type": "boolean",
            "description": "True si debe canalizarse a un abogado ahora",
        },
        "summary": {
            "type": "string",
            "description": "Resumen breve del caso para el abogado: hechos, materia, urgencia y pretensión",
        },
    },
    "required": ["matter", "urgency", "score", "is_qualified", "summary"],
    "additionalProperties": False,
}

SCORING_SYSTEM = """\
Eres un analista del despacho. A partir de la conversación con un cliente potencial,
clasifica el caso. Sé conservador con `is_qualified`: ponlo en true solo si hay un
asunto legal concreto y el cliente muestra intención real de contratar o consultar.
Si la información es insuficiente, baja el score y deja is_qualified en false.
"""


def score_lead(transcript: str) -> dict:
    """Devuelve un dict con matter, urgency, score, is_qualified, summary."""
    response = _anthropic().messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=SCORING_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": LEAD_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": f"Conversación con el cliente:\n\n{transcript}",
            }
        ],
    )
    text = next((b.text for b in response.content if b.type == "text"), "{}")
    return json.loads(text)
