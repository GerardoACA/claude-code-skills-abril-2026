"""Modelos ORM del chatbot.

Esquema mínimo del MVP:
  - Contact      : un cliente (unificado por canal + id externo)
  - Conversation : hilo de conversación por contacto
  - Message      : cada mensaje (entrante/saliente)
  - Lead         : ficha de calificación del cliente potencial
  - Appointment  : cita agendada en Google Calendar
  - KnowledgeChunk : fragmentos de la base de conocimiento + embedding (RAG)
"""
from __future__ import annotations

import datetime as dt
import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# Dimensión del embedding de voyage-3.5 (1024). Ajusta si cambias de modelo.
EMBEDDING_DIM = 1024


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Channel(str, enum.Enum):
    whatsapp = "whatsapp"
    telegram = "telegram"
    instagram = "instagram"


class Direction(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"


class LeadStatus(str, enum.Enum):
    new = "new"
    qualifying = "qualifying"
    qualified = "qualified"      # lead potencial -> handoff al abogado
    scheduled = "scheduled"      # agendó cita
    disqualified = "disqualified"


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("channel", "external_id", name="uq_channel_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel: Mapped[Channel] = mapped_column(Enum(Channel), nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)  # phone, chat_id, IGSID
    name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="contact")
    lead: Mapped["Lead | None"] = relationship(back_populates="contact", uselist=False)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), nullable=False)
    # Si un humano (abogado) tomó el control, el bot deja de responder.
    human_takeover: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    contact: Mapped[Contact] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), nullable=False)
    direction: Mapped[Direction] = mapped_column(Enum(Direction), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), unique=True, nullable=False)
    status: Mapped[LeadStatus] = mapped_column(Enum(LeadStatus), default=LeadStatus.new)
    matter: Mapped[str | None] = mapped_column(String(255))     # materia legal (familiar, penal, ...)
    summary: Mapped[str | None] = mapped_column(Text)           # resumen del caso para el abogado
    score: Mapped[int] = mapped_column(Integer, default=0)      # 0-100
    urgency: Mapped[str | None] = mapped_column(String(32))     # low | medium | high
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    contact: Mapped[Contact] = relationship(back_populates="lead")


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contacts.id"), nullable=False)
    google_event_id: Mapped[str | None] = mapped_column(String(255))
    starts_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    meeting_link: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(255))           # nombre del documento de origen
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
