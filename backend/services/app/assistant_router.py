from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .chat_service import AssistantChatService
from .schemas import AssistantMessageRequest, AssistantResponse, AssistantSearchRequest, RetrievedReview


def create_assistant_router(get_service) -> APIRouter:
    router = APIRouter(prefix="/api/assistant", tags=["assistant"])

    @router.post("/messages", response_model=AssistantResponse)
    def send_assistant_message(request: AssistantMessageRequest) -> AssistantResponse:
        service: AssistantChatService = get_service()
        text = request.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="text is required")
        return service.handle_message(request.threadId.strip() or "default", text)

    @router.post("/test-search", response_model=list[RetrievedReview])
    def test_search(request: AssistantSearchRequest) -> list[RetrievedReview]:
        service: AssistantChatService = get_service()
        query = request.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="query is required")
        return service.search_only(query, request.topK)

    return router
