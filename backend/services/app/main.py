from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ugc.ugc.router import create_ugc_router

from .assistant_router import create_assistant_router
from .chat_service import AssistantChatService
from .config import Settings
from .openai_client import OpenAIService
from .zilliz_store import ZillizStore


settings = Settings.from_env()
app = FastAPI(title="Kompas Backend Services")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def build_assistant_service() -> AssistantChatService:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for assistant service")
    if not settings.zilliz_uri or not settings.zilliz_token:
        raise RuntimeError("ZILLIZ_URI and ZILLIZ_TOKEN are required for assistant service")

    openai_service = OpenAIService(
        api_key=settings.openai_api_key,
        embed_model=settings.openai_embedding_model,
        chat_model=settings.openai_chat_model,
    )
    zilliz_store = ZillizStore(
        uri=settings.zilliz_uri,
        token=settings.zilliz_token,
        collection_name=settings.zilliz_collection,
        db_name=settings.zilliz_db_name,
    )
    return AssistantChatService(openai_service, zilliz_store, settings.zilliz_top_k)


assistant_service: AssistantChatService | None = None


def get_assistant_service() -> AssistantChatService:
    global assistant_service
    if assistant_service is None:
        assistant_service = build_assistant_service()
    return assistant_service

app.include_router(create_ugc_router(), prefix="/api")
app.include_router(create_assistant_router(get_assistant_service))


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}
