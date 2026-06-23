"""Configuración central de la aplicación.

Lee variables de entorno (o el archivo .env) usando pydantic-settings.
Importa `settings` desde cualquier módulo.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base de datos
    database_url: str = "postgresql+psycopg://chatbot:chatbot@localhost:5432/chatbot"

    # Claude / Anthropic
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # Embeddings (Voyage AI)
    voyage_api_key: str = ""
    voyage_model: str = "voyage-3.5"

    # Meta (WhatsApp + Instagram)
    meta_access_token: str = ""
    meta_verify_token: str = "cambia-esto-por-un-secreto"
    meta_app_secret: str = ""
    whatsapp_phone_number_id: str = ""
    instagram_account_id: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_webhook_secret: str = "cambia-esto-por-un-secreto"

    # Handoff al abogado
    lawyer_telegram_chat_id: str = ""

    # Google Calendar
    google_credentials_file: str = "./google_credentials.json"
    google_calendar_id: str = "primary"
    default_timezone: str = "America/Mexico_City"

    # Graph API
    graph_api_version: str = "v21.0"

    @property
    def graph_base_url(self) -> str:
        return f"https://graph.facebook.com/{self.graph_api_version}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
