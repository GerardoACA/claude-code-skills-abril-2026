"""Adaptadores de canales: envío de mensajes salientes.

Cada canal expone `send(external_id, text)`. El dispatcher elige el adaptador
según el canal del contacto.
"""
from __future__ import annotations

from app.channels import instagram, telegram, whatsapp
from app.models import Channel

_SENDERS = {
    Channel.whatsapp: whatsapp.send,
    Channel.telegram: telegram.send,
    Channel.instagram: instagram.send,
}


def send(channel: Channel, external_id: str, text: str) -> None:
    _SENDERS[channel](external_id, text)
