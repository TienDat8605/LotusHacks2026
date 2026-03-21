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


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("assistant")
settings = Settings.from_env()
logger.info(
    "Assistant config loaded: openai_key_set=%s zilliz_uri_set=%s zilliz_token_set=%s review_data_path=%s",
    bool(settings.openai_api_key),
    bool(settings.zilliz_uri),
    bool(settings.zilliz_token),
    settings.review_data_path,
)
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

    try:
        openai_service = OpenAIService(
            api_key=settings.openai_api_key,
            embed_model=settings.openai_embedding_model,
            chat_model=settings.openai_chat_model,
        )
    except Exception:
        logger.exception("Assistant mode=fallback (failed to initialize OpenAI client)")
        return RuleBasedAssistantService.from_review_file(settings.review_data_path, settings.zilliz_top_k)

    # If vector DB is not configured, still run live OpenAI chat using local review retrieval.
    if not settings.zilliz_uri or not settings.zilliz_token:
        logger.info("Assistant mode=openai-local-retrieval (OPENAI_API_KEY set, Zilliz missing)")
        return RuleBasedAssistantService.from_review_file(
            settings.review_data_path,
            settings.zilliz_top_k,
            openai_service=openai_service,
        )
    logger.info("Assistant mode=openai-zilliz (OPENAI_API_KEY + Zilliz set)")
    try:
        zilliz_store = ZillizStore(
            uri=settings.zilliz_uri,
            token=settings.zilliz_token,
            collection_name=settings.zilliz_collection,
            db_name=settings.zilliz_db_name,
        )
    except Exception:
        logger.exception("Assistant mode=openai-local-retrieval (failed to initialize Zilliz client)")
        return RuleBasedAssistantService.from_review_file(
            settings.review_data_path,
            settings.zilliz_top_k,
            openai_service=openai_service,
        )
    local_fallback = RuleBasedAssistantService.from_review_file(
        settings.review_data_path,
        settings.zilliz_top_k,
        openai_service=openai_service,
    )
    return AssistantChatService(
        openai_service,
        zilliz_store,
        settings.zilliz_top_k,
        fallback_search_service=local_fallback,
    )


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


@app.get("/healthz/assistant")
def healthz_assistant() -> dict[str, object]:
    service = get_assistant_service()
    if isinstance(service, AssistantChatService):
        mode = "openai-zilliz"
    elif settings.openai_api_key:
        mode = "openai-local-retrieval"
    else:
        mode = "fallback"
    return {
        "ok": True,
        "mode": mode,
        "openai_key_set": bool(settings.openai_api_key),
        "zilliz_uri_set": bool(settings.zilliz_uri),
        "zilliz_token_set": bool(settings.zilliz_token),
        "chat_model": settings.openai_chat_model if settings.openai_api_key else "",
        "embedding_model": settings.openai_embedding_model if settings.openai_api_key else "",
        "review_data_path": str(settings.review_data_path),
    }
