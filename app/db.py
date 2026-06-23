"""Configuración de SQLAlchemy + pgvector.

Provee el `engine`, el `SessionLocal` y un helper `get_session()` para FastAPI.
`init_db()` crea la extensión vector y todas las tablas (suficiente para el MVP;
en producción usarías Alembic para migraciones).
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Crea la extensión pgvector y todas las tablas declaradas."""
    # Importa los modelos para que se registren en el metadata antes de create_all.
    from app import models  # noqa: F401

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión de BD por request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
