"""Standalone FastAPI app for the UGC service."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ugc.composition import create_ugc_service
from ugc.router import create_ugc_router

app = FastAPI(title="VibeMap UGC Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(create_ugc_router(create_ugc_service()))


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}
