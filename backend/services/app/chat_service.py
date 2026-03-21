from __future__ import annotations

from .openai_client import OpenAIService
from .schemas import AssistantResponse, RetrievedReview
from .threads import ThreadStore
from .zilliz_store import ZillizStore


class AssistantChatService:
    def __init__(self, openai_service: OpenAIService, zilliz_store: ZillizStore, top_k: int) -> None:
        self._openai = openai_service
        self._zilliz = zilliz_store
        self._top_k = top_k
        self._threads = ThreadStore()

    def search_only(self, query: str, top_k: int | None = None) -> list[RetrievedReview]:
        query_embedding = self._openai.embed_query(query)
        return self._zilliz.search(query_embedding, top_k or self._top_k)

    def handle_message(self, thread_id: str, text: str) -> AssistantResponse:
        text = text.strip()
        self._threads.add_message(thread_id, "user", text)

        results = self.search_only(text)
        contexts = []
        for result in results:
            line = result.poi.name
            if result.poi.address:
                line += f" | address: {result.poi.address}"
            if result.summary:
                line += f" | review: {result.summary}"
            if result.evidence:
                line += f" | evidence: {result.evidence[:240]}"
            contexts.append(line)

        answer = self._openai.chat_with_context(text, contexts)
        self._threads.add_message(thread_id, "assistant", answer)

        return AssistantResponse(
            messages=self._threads.list_messages(thread_id),
            suggestedPois=[item.poi for item in results],
            followUps=[
                "Show me a quieter option",
                "Give me something more photogenic",
                "Find a cafe for working",
                "Plan a route to the best one",
            ],
        )
