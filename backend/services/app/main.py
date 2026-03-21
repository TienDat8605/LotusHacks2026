from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ugc.ugc.router import create_ugc_router

from .assistant_router import create_assistant_router
from .chat_service import AssistantChatService, RuleBasedAssistantService
from .config import Settings
from .openai_client import OpenAIService
from .zilliz_store import ZillizStore


settings = Settings.from_env()
logger = logging.getLogger("assistant")
app = FastAPI(title="Kompas Backend Services")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def build_assistant_service() -> AssistantChatService | RuleBasedAssistantService:
    if not settings.openai_api_key:
        # Fallback mode keeps /api/assistant usable even when external AI credentials are absent.
        logger.warning("Assistant mode=fallback (missing OPENAI_API_KEY)")
        return RuleBasedAssistantService.from_review_file(settings.review_data_path, settings.zilliz_top_k)

    openai_service = OpenAIService(
        api_key=settings.openai_api_key,
        embed_model=settings.openai_embedding_model,
        chat_model=settings.openai_chat_model,
    )

    # If vector DB is not configured, still run live OpenAI chat using local review retrieval.
    if not settings.zilliz_uri or not settings.zilliz_token:
        logger.info("Assistant mode=openai-local-retrieval (OPENAI_API_KEY set, Zilliz missing)")
        return RuleBasedAssistantService.from_review_file(
            settings.review_data_path,
            settings.zilliz_top_k,
            openai_service=openai_service,
        )
    logger.info("Assistant mode=openai-zilliz (OPENAI_API_KEY + Zilliz set)")
    zilliz_store = ZillizStore(
        uri=settings.zilliz_uri,
        token=settings.zilliz_token,
        collection_name=settings.zilliz_collection,
        db_name=settings.zilliz_db_name,
    )
    return AssistantChatService(openai_service, zilliz_store, settings.zilliz_top_k)


assistant_service: AssistantChatService | RuleBasedAssistantService | None = None


def get_assistant_service() -> AssistantChatService | RuleBasedAssistantService:
    global assistant_service
    if assistant_service is None:
        assistant_service = build_assistant_service()
    return assistant_service

app.include_router(create_ugc_router(), prefix="/api")
app.include_router(create_assistant_router(get_assistant_service))


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}
