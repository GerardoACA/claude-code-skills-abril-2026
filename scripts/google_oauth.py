"""Genera el token OAuth de Google para que el servidor agende en tu calendario.

Lo corres UNA sola vez. Abre el navegador, inicias sesión con la cuenta del
calendario (formato212@gmail.com) y autorizas. Se guarda `google_token.json`
con un refresh token; a partir de ahí el bot agenda solo, sin más logins.

Requisito previo (único paso manual en Google Cloud):
  1. Crea un proyecto en https://console.cloud.google.com
  2. Habilita la "Google Calendar API".
  3. En "Credenciales" crea un "ID de cliente de OAuth" de tipo "App de escritorio".
  4. Descarga el JSON y guárdalo como google_client_secret.json en la raíz.

Uso:
  python -m scripts.google_oauth
"""
from __future__ import annotations

import pathlib

from google_auth_oauthlib.flow import InstalledAppFlow

from app.config import settings

_SCOPES = ["https://www.googleapis.com/auth/calendar"]


def main() -> None:
    client_file = settings.google_oauth_client_file
    if not pathlib.Path(client_file).exists():
        print(f"❌ No encuentro {client_file}.")
        print("   Descarga el client_secret de OAuth desde Google Cloud y guárdalo ahí.")
        raise SystemExit(1)

    flow = InstalledAppFlow.from_client_secrets_file(client_file, _SCOPES)
    creds = flow.run_local_server(port=0)  # abre el navegador para autorizar
    pathlib.Path(settings.google_oauth_token_file).write_text(creds.to_json())
    print(f"✓ Token guardado en {settings.google_oauth_token_file}")
    print("  Ya puedes usar el calendario: python -m scripts.test_calendar")


if __name__ == "__main__":
    main()
