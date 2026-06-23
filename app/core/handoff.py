"""Canalización (handoff) de leads calificados al abogado.

Marca la conversación como tomada por humano y notifica al abogado por Telegram
con la ficha del caso generada por Claude.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.channels import telegram
from app.config import settings
from app.models import Channel, Contact, Conversation, Lead


def notify_lawyer(contact: Contact, lead: Lead) -> None:
    """Envía la ficha del lead al chat del abogado configurado."""
    if not settings.lawyer_telegram_chat_id:
        return
    msg = (
        "🚨 *Nuevo lead calificado*\n\n"
        f"Canal: {contact.channel.value}\n"
        f"Contacto: {contact.name or contact.external_id}\n"
        f"Materia: {lead.matter or '—'}\n"
        f"Urgencia: {lead.urgency or '—'}\n"
        f"Score: {lead.score}/100\n\n"
        f"Resumen del caso:\n{lead.summary or '—'}"
    )
    telegram.send(settings.lawyer_telegram_chat_id, msg)


def handoff(session: Session, conversation: Conversation, contact: Contact, lead: Lead) -> None:
    """Activa el modo humano y notifica al abogado (una sola vez)."""
    if conversation.human_takeover:
        return
    conversation.human_takeover = True
    session.commit()
    notify_lawyer(contact, lead)
