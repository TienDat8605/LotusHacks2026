from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .chat_service import AssistantChatService
from .config import Settings
from .openai_client import OpenAIService
from .schemas import AssistantMessageRequest, AssistantResponse
from .zilliz_store import ZillizStore


settings = Settings.from_env()
app = FastAPI(title="VibeMap AI Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_chat_service() -> AssistantChatService:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required")
    if not settings.zilliz_uri or not settings.zilliz_token:
        raise RuntimeError("ZILLIZ_URI and ZILLIZ_TOKEN are required")

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


chat_service: AssistantChatService | None = None


@app.on_event("startup")
def startup() -> None:
    global chat_service
    chat_service = build_chat_service()


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/assistant/messages", response_model=AssistantResponse)
def send_assistant_message(request: AssistantMessageRequest) -> AssistantResponse:
    if chat_service is None:
        raise HTTPException(status_code=503, detail="AI service is not ready")
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        return chat_service.handle_message(request.threadId.strip() or "default", text)
    except Exception as exc:  # pragma: no cover - runtime safeguard
        raise HTTPException(status_code=500, detail=str(exc)) from exc
