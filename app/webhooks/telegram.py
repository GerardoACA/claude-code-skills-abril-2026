"""Webhook de Telegram.

Registra el webhook con un secret token; Telegram lo reenvía en el header
X-Telegram-Bot-Api-Secret-Token, que validamos en cada request.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core import bot
from app.db import get_session
from app.models import Channel

router = APIRouter(prefix="/webhooks/telegram", tags=["telegram"])


@router.post("")
async def receive(
    request: Request,
    session: Session = Depends(get_session),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
        return {"status": "invalid secret"}

    update = await request.json()
    message = update.get("message") or update.get("edited_message")
    if not message or "text" not in message:
        return {"status": "ignored"}

    chat = message["chat"]
    sender = message.get("from", {})
    name = " ".join(filter(None, [sender.get("first_name"), sender.get("last_name")])) or None

    bot.handle_incoming(
        session,
        Channel.telegram,
        external_id=str(chat["id"]),
        text=message["text"],
        name=name,
    )
    return {"status": "ok"}
