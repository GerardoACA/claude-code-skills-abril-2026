"""Herramientas de agendado para el bucle de tool use de Claude.

Expone dos herramientas que Claude puede invocar durante la conversación:
  - get_available_slots : consulta Google Calendar y devuelve horarios libres.
  - book_appointment    : crea la cita (con enlace de Meet) y la guarda en BD.

`make_executor(session, contact)` devuelve el ejecutor que el bucle del
chatbot llamará cuando Claude pida usar una herramienta.
"""
from __future__ import annotations

import datetime as dt
import json
from collections.abc import Callable
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.core import calendar
from app.models import Appointment, Contact, Lead, LeadStatus

# Número máximo de horarios que ofrecemos para no abrumar al cliente.
_MAX_SLOTS = 6
_DURATION_MIN = 45

TOOLS = [
    {
        "name": "get_available_slots",
        "description": (
            "Consulta el calendario del despacho y devuelve los próximos horarios "
            "disponibles para una cita. Úsala cuando el cliente quiera agendar una "
            "consulta. Devuelve una lista de opciones con su identificador ISO."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days_ahead": {
                    "type": "integer",
                    "description": "Cuántos días hacia adelante buscar (por defecto 7).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "book_appointment",
        "description": (
            "Agenda una cita en el horario elegido por el cliente. Llama primero a "
            "get_available_slots y confirma el horario con el cliente antes de reservar. "
            "Pide el correo del cliente para enviarle la invitación cuando sea posible."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "starts_at": {
                    "type": "string",
                    "description": "Inicio de la cita en formato ISO 8601, tal cual lo devolvió get_available_slots.",
                },
                "attendee_email": {
                    "type": "string",
                    "description": "Correo del cliente para enviarle la invitación (opcional).",
                },
            },
            "required": ["starts_at"],
        },
    },
]


def _local(dt_utc: dt.datetime) -> dt.datetime:
    return dt_utc.astimezone(ZoneInfo(settings.default_timezone))


def _label(dt_utc: dt.datetime) -> str:
    """Etiqueta legible en español, p. ej. 'martes 24/06 a las 11:00'."""
    d = _local(dt_utc)
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return f"{dias[d.weekday()]} {d.strftime('%d/%m')} a las {d.strftime('%H:%M')}"


def make_executor(session: Session, contact: Contact) -> Callable[[str, dict], str]:
    """Devuelve un ejecutor de herramientas ligado a la sesión y al contacto."""

    def _get_slots(args: dict) -> str:
        try:
            slots = calendar.list_free_slots(
                duration_min=_DURATION_MIN, days_ahead=int(args.get("days_ahead", 7))
            )
        except Exception as exc:  # calendario no configurado o error de API
            return json.dumps({"error": f"No pude consultar el calendario: {exc}"})
        if not slots:
            return json.dumps({"slots": [], "mensaje": "No hay horarios disponibles próximamente."})
        options = [{"starts_at": s.isoformat(), "etiqueta": _label(s)} for s in slots[:_MAX_SLOTS]]
        return json.dumps({"slots": options}, ensure_ascii=False)

    def _book(args: dict) -> str:
        try:
            starts_at = dt.datetime.fromisoformat(args["starts_at"])
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=dt.timezone.utc)
        except (KeyError, ValueError):
            return json.dumps({"error": "Formato de fecha inválido. Usa el ISO de get_available_slots."})

        cliente = contact.name or "Cliente"
        try:
            result = calendar.create_appointment(
                summary=f"Consulta legal — {cliente}",
                description=f"Cita agendada por el chatbot. Canal: {contact.channel.value}.",
                starts_at=starts_at,
                duration_min=_DURATION_MIN,
                attendee_email=args.get("attendee_email"),
            )
        except Exception as exc:
            return json.dumps({"error": f"No pude crear la cita: {exc}"})

        session.add(
            Appointment(
                contact_id=contact.id,
                google_event_id=result["event_id"],
                starts_at=starts_at,
                ends_at=result["ends_at"],
                meeting_link=result.get("meeting_link"),
            )
        )
        # Marca el lead como agendado.
        lead = contact.lead or Lead(contact_id=contact.id)
        lead.status = LeadStatus.scheduled
        if contact.lead is None:
            session.add(lead)
        session.commit()

        return json.dumps(
            {
                "confirmado": True,
                "cuando": _label(starts_at),
                "enlace": result.get("meeting_link"),
            },
            ensure_ascii=False,
        )

    def execute(name: str, args: dict) -> str:
        if name == "get_available_slots":
            return _get_slots(args)
        if name == "book_appointment":
            return _book(args)
        return json.dumps({"error": f"Herramienta desconocida: {name}"})

    return execute
