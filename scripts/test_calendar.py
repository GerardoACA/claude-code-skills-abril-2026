"""Prueba la integración con Google Calendar de forma aislada.

Verifica que tus credenciales y permisos funcionan ANTES de conectar los canales.

Requisitos:
  - google_credentials.json (Service Account) en la ruta de GOOGLE_CREDENTIALS_FILE
  - GOOGLE_CALENDAR_ID en .env apuntando a un calendario compartido con la
    Service Account (permiso "Hacer cambios en eventos")
  - Google Calendar API habilitada en el proyecto de Google Cloud

Uso:
  python -m scripts.test_calendar                  # lista horarios libres
  python -m scripts.test_calendar --book tu@correo # agenda una cita de prueba
"""
from __future__ import annotations

import argparse
import datetime as dt
from zoneinfo import ZoneInfo

from app.config import settings
from app.core import calendar


def _fmt(d: dt.datetime) -> str:
    local = d.astimezone(ZoneInfo(settings.default_timezone))
    return local.strftime("%a %d/%m %H:%M")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prueba Google Calendar")
    parser.add_argument("--book", metavar="EMAIL", help="Agenda una cita de prueba en el primer hueco")
    parser.add_argument("--days", type=int, default=7, help="Días hacia adelante a consultar")
    args = parser.parse_args()

    print(f"Calendario: {settings.google_calendar_id}")
    print(f"Credenciales: {settings.google_credentials_file}")
    print(f"Zona horaria: {settings.default_timezone}\n")

    print("Consultando horarios libres...")
    slots = calendar.list_free_slots(days_ahead=args.days)
    if not slots:
        print("⚠️  No se encontraron horarios libres en el rango.")
        return

    print(f"✓ {len(slots)} horarios libres. Primeros 8:")
    for s in slots[:8]:
        print(f"   - {_fmt(s)}  ({s.isoformat()})")

    if args.book:
        first = slots[0]
        print(f"\nAgendando cita de prueba el {_fmt(first)} para {args.book}...")
        result = calendar.create_appointment(
            summary="CITA DE PRUEBA — chatbot despacho",
            description="Evento de prueba creado por scripts/test_calendar.py. Puedes borrarlo.",
            starts_at=first,
            attendee_email=args.book,
        )
        print("✓ Cita creada:")
        print(f"   event_id: {result['event_id']}")
        print(f"   Meet:     {result.get('meeting_link')}")
        print("\n   Revisa tu Google Calendar y bórrala cuando quieras.")
    else:
        print("\n(Usa --book tu@correo.com para crear una cita de prueba.)")


if __name__ == "__main__":
    main()
