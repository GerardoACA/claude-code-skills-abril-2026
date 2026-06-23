"""Carga documentos de la base de conocimiento a pgvector.

Uso:
    python -m scripts.ingest ruta/al/documento.txt [otro.md ...]

Trocea cada archivo, genera embeddings con Voyage y los guarda como
KnowledgeChunk. Vuelve a ejecutarlo cuando agregues o actualices documentos.
"""
from __future__ import annotations

import pathlib
import sys

from app.core import rag
from app.db import SessionLocal, init_db


def main(paths: list[str]) -> None:
    if not paths:
        print("Uso: python -m scripts.ingest <archivo> [archivo ...]")
        raise SystemExit(1)

    init_db()
    session = SessionLocal()
    try:
        total = 0
        for p in paths:
            path = pathlib.Path(p)
            if not path.exists():
                print(f"⚠️  No existe: {p}")
                continue
            text = path.read_text(encoding="utf-8")
            n = rag.ingest(session, source=path.name, text=text)
            total += n
            print(f"✓ {path.name}: {n} fragmentos")
        print(f"\nTotal indexado: {total} fragmentos")
    finally:
        session.close()


if __name__ == "__main__":
    main(sys.argv[1:])
