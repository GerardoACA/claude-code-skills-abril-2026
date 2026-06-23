"""Integración con Google Calendar.

Usa una Service Account para consultar disponibilidad y crear eventos con
enlace de Google Meet. Para un calendario personal del despacho, comparte el
calendario con el correo de la Service Account y usa su ID en GOOGLE_CALENDAR_ID.
"""
from __future__ import annotations

import datetime as dt
import uuid

from google.oauth2 import service_account
from googleapiclient.discovery import build

from app.config import settings

_SCOPES = ["https://www.googleapis.com/auth/calendar"]
_service = None


def _calendar():
    global _service
    if _service is None:
        creds = service_account.Credentials.from_service_account_file(
            settings.google_credentials_file, scopes=_SCOPES
        )
        _service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return _service


def list_free_slots(
    duration_min: int = 45,
    days_ahead: int = 7,
    work_start_hour: int = 9,
    work_end_hour: int = 18,
) -> list[dt.datetime]:
    """Devuelve horarios libres (inicio de slot) en horario laboral para los próximos días."""
    tz = dt.timezone.utc
    now = dt.datetime.now(tz)
    time_min = now
    time_max = now + dt.timedelta(days=days_ahead)

    busy = (
        _calendar()
        .freebusy()
        .query(
            body={
                "timeMin": time_min.isoformat(),
                "timeMax": time_max.isoformat(),
                "items": [{"id": settings.google_calendar_id}],
            }
        )
        .execute()
    )
    busy_periods = [
        (dt.datetime.fromisoformat(b["start"]), dt.datetime.fromisoformat(b["end"]))
        for b in busy["calendars"][settings.google_calendar_id]["busy"]
    ]

    slots: list[dt.datetime] = []
    step = dt.timedelta(minutes=duration_min)
    for day in range(days_ahead):
        date = (now + dt.timedelta(days=day)).date()
        cursor = dt.datetime.combine(date, dt.time(work_start_hour), tzinfo=tz)
        end_of_day = dt.datetime.combine(date, dt.time(work_end_hour), tzinfo=tz)
        while cursor + step <= end_of_day:
            slot_end = cursor + step
            overlaps = any(s < slot_end and cursor < e for s, e in busy_periods)
            if cursor > now and not overlaps:
                slots.append(cursor)
            cursor += step
    return slots


def create_appointment(
    summary: str,
    description: str,
    starts_at: dt.datetime,
    duration_min: int = 45,
    attendee_email: str | None = None,
) -> dict:
    """Crea un evento con enlace de Meet. Devuelve {event_id, meeting_link}."""
    ends_at = starts_at + dt.timedelta(minutes=duration_min)
    event_body = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": starts_at.isoformat(), "timeZone": settings.default_timezone},
        "end": {"dateTime": ends_at.isoformat(), "timeZone": settings.default_timezone},
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    if attendee_email:
        event_body["attendees"] = [{"email": attendee_email}]

    event = (
        _calendar()
        .events()
        .insert(
            calendarId=settings.google_calendar_id,
            body=event_body,
            conferenceDataVersion=1,
            sendUpdates="all",
        )
        .execute()
    )
    return {
        "event_id": event["id"],
        "meeting_link": event.get("hangoutLink"),
        "ends_at": ends_at,
    }
