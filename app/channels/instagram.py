"""Instagram Messaging API (Meta Graph).

Envía DMs desde la cuenta de Instagram Business vinculada a la Página.
`to` es el IGSID (Instagram-scoped user id) del cliente.
"""
from __future__ import annotations

import httpx

from app.config import settings


def send(to: str, text: str) -> None:
    url = f"{settings.graph_base_url}/{settings.instagram_account_id}/messages"
    headers = {"Authorization": f"Bearer {settings.meta_access_token}"}
    payload = {"recipient": {"id": to}, "message": {"text": text}}
    resp = httpx.post(url, headers=headers, json=payload, timeout=20)
    resp.raise_for_status()
