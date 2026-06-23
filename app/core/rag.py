"""RAG: embeddings con Voyage AI + recuperación en pgvector.

- `embed_texts` / `embed_query`: generan vectores con Voyage.
- `ingest`: trocea texto y guarda los fragmentos con su embedding.
- `retrieve`: busca los fragmentos más relevantes para una consulta.
"""
from __future__ import annotations

import voyageai
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import KnowledgeChunk

_client: voyageai.Client | None = None


def _voyage() -> voyageai.Client:
    global _client
    if _client is None:
        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def embed_texts(texts: list[str], input_type: str = "document") -> list[list[float]]:
    """Genera embeddings para una lista de textos.

    input_type="document" al indexar, "query" al consultar (mejora la relevancia).
    """
    result = _voyage().embed(texts, model=settings.voyage_model, input_type=input_type)
    return result.embeddings


def embed_query(text: str) -> list[float]:
    return embed_texts([text], input_type="query")[0]


def chunk_text(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    """Troceo simple por párrafos con solapamiento.

    Para una base de conocimiento legal real conviene trocear por secciones/artículos;
    esto es suficiente para arrancar el MVP.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_chars:
            current = f"{current}\n\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            # Arrastra un poco de contexto para no cortar ideas.
            current = (current[-overlap:] + "\n\n" + para).strip() if current else para
    if current:
        chunks.append(current)
    return chunks


def ingest(session: Session, source: str, text: str) -> int:
    """Indexa un documento completo. Devuelve el número de fragmentos guardados."""
    chunks = chunk_text(text)
    if not chunks:
        return 0
    embeddings = embed_texts(chunks, input_type="document")
    for content, vector in zip(chunks, embeddings):
        session.add(KnowledgeChunk(source=source, content=content, embedding=vector))
    session.commit()
    return len(chunks)


def retrieve(session: Session, query: str, k: int = 5) -> list[KnowledgeChunk]:
    """Devuelve los k fragmentos más cercanos a la consulta (distancia coseno)."""
    query_vec = embed_query(query)
    stmt = (
        select(KnowledgeChunk)
        .order_by(KnowledgeChunk.embedding.cosine_distance(query_vec))
        .limit(k)
    )
    return list(session.scalars(stmt))
