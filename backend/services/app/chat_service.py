from __future__ import annotations

from itertools import combinations

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

        route_mode = self._is_route_request(text)
        results = self.search_only(text, 12 if route_mode else None)
        if route_mode:
            results = self._pick_compact_route_results(results, 3)

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
            suggestedPlan={
                "requiredPoiIds": [item.poi.id for item in results],
            }
            if route_mode and results
            else None,
            followUps=[
                "Show me a quieter option",
                "Give me something more photogenic",
                "Find a cafe for working",
                "Plan a route to the best one",
            ],
        )

    @staticmethod
    def _is_route_request(text: str) -> bool:
        lowered = text.lower()
        return "suggest a destination and route vibe" in lowered or "backend planner will create stops between" in lowered

    def _pick_compact_route_results(self, results: list[RetrievedReview], target_size: int) -> list[RetrievedReview]:
        if len(results) <= target_size:
            return self._order_route_results(results)

        candidate_pool = results[: min(len(results), 10)]
        subset_size = min(target_size, len(candidate_pool))
        best_group: list[RetrievedReview] | None = None
        best_score: float | None = None

        for combo in combinations(candidate_pool, subset_size):
            group = list(combo)
            compactness_penalty = self._pairwise_distance_penalty(group)
            relevance_score = sum(item.score for item in group)
            score = relevance_score - compactness_penalty
            if best_score is None or score > best_score:
                best_score = score
                best_group = group

        if not best_group:
            return self._order_route_results(candidate_pool[:subset_size])

        return self._order_route_results(best_group)

    def _order_route_results(self, results: list[RetrievedReview]) -> list[RetrievedReview]:
        if len(results) <= 2:
            return results

        remaining = results[:]
        ordered = [remaining.pop(0)]
        while remaining:
            last = ordered[-1]
            next_index = min(
                range(len(remaining)),
                key=lambda idx: self._distance_km(last.poi.location.lat, last.poi.location.lng, remaining[idx].poi.location.lat, remaining[idx].poi.location.lng),
            )
            ordered.append(remaining.pop(next_index))
        return ordered

    def _pairwise_distance_penalty(self, results: list[RetrievedReview]) -> float:
        penalty = 0.0
        for left_index, left in enumerate(results):
            for right in results[left_index + 1 :]:
                penalty += self._distance_km(
                    left.poi.location.lat,
                    left.poi.location.lng,
                    right.poi.location.lat,
                    right.poi.location.lng,
                ) * 0.35
        return penalty

    @staticmethod
    def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        from math import asin, cos, radians, sin, sqrt

        dlat = radians(lat2 - lat1)
        dlng = radians(lng2 - lng1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
        return 6371.0 * 2 * asin(sqrt(a))
