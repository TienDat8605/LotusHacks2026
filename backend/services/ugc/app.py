import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ugc.router import create_ugc_router

app = FastAPI()
cors_raw = os.getenv("AI_CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
cors_origins = [part.strip() for part in cors_raw.split(",") if part.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(create_ugc_router(), prefix="/api")

