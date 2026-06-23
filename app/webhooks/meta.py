"""Webhooks de Meta: WhatsApp Cloud API e Instagram Messaging.

Ambos llegan a la misma app de Meta, así que comparten endpoint:
  - GET  /webhooks/meta  -> verificación (hub.challenge)
  - POST /webhooks/meta  -> eventos entrantes (valida firma X-Hub-Signature-256)
"""
from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.core import bot
from app.db import get_session
from app.models import Channel

router = APIRouter(prefix="/webhooks/meta", tags=["meta"])


def _valid_signature(body: bytes, signature: str | None) -> bool:
    if not settings.meta_app_secret:
        return True  # sin app secret configurado, no validamos (solo dev)
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.meta_app_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature.split("=", 1)[1])


@router.get("")
async def verify(request: Request) -> Response:
    """Verificación del webhook (la hace Meta al registrarlo)."""
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and params.get("hub.verify_token") == settings.meta_verify_token
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    return Response(status_code=403)


@router.post("")
async def receive(request: Request, session: Session = Depends(get_session)) -> dict:
    body = await request.body()
    if not _valid_signature(body, request.headers.get("X-Hub-Signature-256")):
        return {"status": "invalid signature"}

    data = await request.json()
    for entry in data.get("entry", []):
        # --- WhatsApp ---
        for change in entry.get("changes", []):
            value = change.get("value", {})
            contacts = {c["wa_id"]: c.get("profile", {}).get("name") for c in value.get("contacts", [])}
            for msg in value.get("messages", []):
                if msg.get("type") != "text":
                    continue
                wa_id = msg["from"]
                bot.handle_incoming(
                    session,
                    Channel.whatsapp,
                    external_id=wa_id,
                    text=msg["text"]["body"],
                    name=contacts.get(wa_id),
                )

        # --- Instagram (messaging) ---
        for event in entry.get("messaging", []):
            message = event.get("message", {})
            text = message.get("text")
            if not text or message.get("is_echo"):
                continue
            bot.handle_incoming(
                session,
                Channel.instagram,
                external_id=event["sender"]["id"],
                text=text,
            )

    return {"status": "ok"}
