"""Aplicación FastAPI del chatbot del despacho.

Arranque:  uvicorn app.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.webhooks import meta, telegram


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Chatbot Despacho Legal", lifespan=lifespan)

app.include_router(meta.router)
app.include_router(telegram.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
