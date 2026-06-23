"""Aviso de privacidad y consentimiento (LFPDPPP).

Gate previo al chatbot: ante un contacto nuevo se envía el aviso de privacidad y
se espera la aceptación antes de procesar cualquier consulta. El texto del aviso
es configurable vía la variable de entorno PRIVACY_NOTICE_URL (enlace al aviso
integral del despacho).

Flujo:
  1. Primer mensaje de un contacto nuevo -> se envía el aviso y se marca
     `consent_prompted`. No se procesa la consulta.
  2. Siguiente mensaje: si acepta -> `consent_given=True` y saludo; si no ->
     se reenvía una versión breve del aviso.
  3. A partir de ahí, el flujo normal del bot.
"""
from __future__ import annotations

import datetime as dt
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Contact

_ACCEPT_RE = re.compile(
    r"\b(acepto|aceptar|autorizo|consiento|de acuerdo|adelante|claro|"
    r"s[íi]\s+acepto|s[íi]|ok(ay)?|est[áa]\s+bien)\b",
    re.IGNORECASE,
)


def _notice() -> str:
    enlace = settings.privacy_notice_url or "(enlace al aviso de privacidad del despacho)"
    return (
        "👋 ¡Hola! Soy el asistente virtual del despacho. Antes de continuar:\n\n"
        "🔒 *Aviso de privacidad.* Los datos que compartas (nombre, contacto y los "
        "detalles de tu asunto) se usarán únicamente para atender tu consulta y, en su "
        "caso, agendar una cita con un abogado. No se compartirán con terceros ajenos al "
        "despacho. Puedes consultar el aviso de privacidad integral aquí:\n"
        f"{enlace}\n\n"
        "Para continuar, responde *ACEPTO*. Si no estás de acuerdo, no podremos atender "
        "tu consulta por este medio."
    )


_REPROMPT = (
    "Para poder ayudarte necesito tu consentimiento para tratar tus datos conforme a "
    "nuestro aviso de privacidad. Responde *ACEPTO* para continuar, por favor."
)

_GREETING = (
    "¡Gracias! 🙌 ¿En qué puedo ayudarte? Cuéntame brevemente tu situación o el tipo de "
    "asunto legal y con gusto te oriento o te agendo una cita con un abogado."
)


def is_acceptance(text: str) -> bool:
    return bool(_ACCEPT_RE.search(text.strip()))


def process(session: Session, contact: Contact, text: str) -> str | None:
    """Devuelve un texto a enviar (y detener el flujo) o None para continuar.

    Devuelve None solo cuando el contacto YA tenía consentimiento al entrar.
    """
    if contact.consent_given:
        return None

    if not contact.consent_prompted:
        contact.consent_prompted = True
        session.commit()
        return _notice()

    if is_acceptance(text):
        contact.consent_given = True
        contact.consent_at = dt.datetime.now(dt.timezone.utc)
        session.commit()
        return _GREETING

    return _REPROMPT
