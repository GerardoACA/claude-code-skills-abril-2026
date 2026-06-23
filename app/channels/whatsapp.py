"""WhatsApp Cloud API (Meta Graph)."""
from __future__ import annotations

import httpx

from app.config import settings


def send(to: str, text: str) -> None:
    """Envía un mensaje de texto por WhatsApp Cloud API.

    `to` es el número del cliente en formato internacional sin '+'.
    Nota: fuera de la ventana de 24h solo se permiten plantillas aprobadas.
    """
    url = f"{settings.graph_base_url}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.meta_access_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    resp = httpx.post(url, headers=headers, json=payload, timeout=20)
    resp.raise_for_status()
