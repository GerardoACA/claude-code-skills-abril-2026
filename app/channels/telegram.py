"""Telegram Bot API."""
from __future__ import annotations

import httpx

from app.config import settings


def send(chat_id: str, text: str) -> None:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    resp = httpx.post(url, json={"chat_id": chat_id, "text": text}, timeout=20)
    resp.raise_for_status()
