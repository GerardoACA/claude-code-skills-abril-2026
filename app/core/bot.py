"""Orquestador del chatbot.

Punto único de entrada para los mensajes entrantes de cualquier canal:
  1. Resuelve/crea el contacto y la conversación.
  2. Guarda el mensaje entrante.
  3. Si un humano tomó el control, no responde (solo registra).
  4. RAG + Claude -> respuesta -> envía por el canal correspondiente.
  5. Califica el lead y, si procede, canaliza al abogado.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import channels
from app.core import claude_client, consent, handoff, lead_scoring, rag, scheduling
from app.models import (
    Channel,
    Contact,
    Conversation,
    Direction,
    Lead,
    LeadStatus,
    Message,
)

# A partir de cuántos mensajes del cliente intentamos calificar el lead.
_SCORE_AFTER_MESSAGES = 2
# Umbral de score para canalizar al abogado.
_QUALIFY_SCORE = 60
# Cuántos mensajes previos enviamos a Claude como historial.
_HISTORY_LIMIT = 10


def _get_or_create_contact(
    session: Session, channel: Channel, external_id: str, name: str | None
) -> Contact:
    contact = session.scalar(
        select(Contact).where(Contact.channel == channel, Contact.external_id == external_id)
    )
    if contact is None:
        contact = Contact(channel=channel, external_id=external_id, name=name)
        session.add(contact)
        session.flush()
    elif name and not contact.name:
        contact.name = name
    return contact


def _get_or_create_conversation(session: Session, contact: Contact) -> Conversation:
    conv = session.scalar(
        select(Conversation).where(Conversation.contact_id == contact.id)
    )
    if conv is None:
        conv = Conversation(contact_id=contact.id)
        session.add(conv)
        session.flush()
    return conv


def _history_for_claude(session: Session, conv: Conversation) -> list[dict]:
    msgs = session.scalars(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .limit(_HISTORY_LIMIT)
    ).all()
    msgs = list(reversed(msgs))
    role = {Direction.inbound: "user", Direction.outbound: "assistant"}
    return [{"role": role[m.direction], "content": m.text} for m in msgs]


def _maybe_score_and_handoff(session: Session, conv: Conversation, contact: Contact) -> None:
    inbound_count = sum(
        1 for m in conv.messages if m.direction == Direction.inbound
    )
    if inbound_count < _SCORE_AFTER_MESSAGES:
        return

    transcript = "\n".join(
        f"{'Cliente' if m.direction == Direction.inbound else 'Asistente'}: {m.text}"
        for m in conv.messages
    )
    result = lead_scoring.score_lead(transcript)

    lead = contact.lead or Lead(contact_id=contact.id)
    lead.matter = result.get("matter")
    lead.urgency = result.get("urgency")
    lead.score = int(result.get("score", 0))
    lead.summary = result.get("summary")
    if contact.lead is None:
        session.add(lead)
    session.flush()

    qualified = result.get("is_qualified") or lead.score >= _QUALIFY_SCORE
    if qualified and lead.status not in (LeadStatus.qualified, LeadStatus.scheduled):
        lead.status = LeadStatus.qualified
        session.commit()
        handoff.handoff(session, conv, contact, lead)
    else:
        if lead.status == LeadStatus.new:
            lead.status = LeadStatus.qualifying
        session.commit()


def handle_incoming(
    session: Session,
    channel: Channel,
    external_id: str,
    text: str,
    name: str | None = None,
) -> None:
    """Procesa un mensaje entrante de extremo a extremo."""
    contact = _get_or_create_contact(session, channel, external_id, name)
    conv = _get_or_create_conversation(session, contact)

    session.add(
        Message(conversation_id=conv.id, direction=Direction.inbound, text=text)
    )
    session.commit()

    # Si un abogado ya tomó el control, el bot guarda pero no responde.
    if conv.human_takeover:
        return

    # Gate de consentimiento (LFPDPPP): no procesamos consultas sin aceptación.
    consent_reply = consent.process(session, contact, text)
    if consent_reply is not None:
        session.add(
            Message(conversation_id=conv.id, direction=Direction.outbound, text=consent_reply)
        )
        session.commit()
        channels.send(channel, external_id, consent_reply)
        return

    context_chunks = [c.content for c in rag.retrieve(session, text, k=5)]
    history = _history_for_claude(session, conv)
    executor = scheduling.make_executor(session, contact)
    reply = claude_client.generate_reply(
        text,
        context_chunks,
        history,
        tools=scheduling.TOOLS,
        tool_executor=executor,
    )

    session.add(
        Message(conversation_id=conv.id, direction=Direction.outbound, text=reply)
    )
    session.commit()

    channels.send(channel, external_id, reply)

    # Refresca la conversación con los mensajes nuevos antes de calificar.
    session.refresh(conv)
    _maybe_score_and_handoff(session, conv, contact)
