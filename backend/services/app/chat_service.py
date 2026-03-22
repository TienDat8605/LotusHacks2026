from __future__ import annotations

import logging
import re
from itertools import combinations
from pathlib import Path

from .openai_client import OpenAIService
from .reviews import load_review_documents
from .schemas import AssistantResponse, RetrievedReview, ReviewDocument
from .threads import ThreadStore
from .zilliz_store import ZillizStore

logger = logging.getLogger("assistant")


def _is_route_request(text: str) -> bool:
    lowered = text.lower()
    return "suggest a destination and route vibe" in lowered or "backend planner will create stops between" in lowered


def _normalize_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


class AssistantChatService:
    def __init__(
        self,
        openai_service: OpenAIService,
        zilliz_store: ZillizStore,
        top_k: int,
        fallback_search_service: "RuleBasedAssistantService | None" = None,
    ) -> None:
        self._openai = openai_service
        self._zilliz = zilliz_store
        self._top_k = top_k
        self._fallback_search = fallback_search_service
        self._fallback_doc_by_id: dict[str, ReviewDocument] = {}
        self._fallback_doc_by_name: dict[str, ReviewDocument] = {}
        self._fallback_doc_by_name_normalized: dict[str, ReviewDocument] = {}
        if fallback_search_service is not None:
            docs = getattr(fallback_search_service, "_documents", [])
            if isinstance(docs, list):
                for doc in docs:
                    self._fallback_doc_by_id[doc.poi.id] = doc
                    name_key = doc.poi.name.strip().lower()
                    if name_key and name_key not in self._fallback_doc_by_name:
                        self._fallback_doc_by_name[name_key] = doc
                    normalized_name_key = _normalize_lookup_key(doc.poi.name)
                    if normalized_name_key and normalized_name_key not in self._fallback_doc_by_name_normalized:
                        self._fallback_doc_by_name_normalized[normalized_name_key] = doc
        self._threads = ThreadStore()

    def search_only(self, query: str, top_k: int | None = None) -> list[RetrievedReview]:
        query_embedding = self._openai.embed_query(query)
        return self._zilliz.search(query_embedding, top_k or self._top_k)

    def handle_message(self, thread_id: str, text: str) -> AssistantResponse:
        text = text.strip()
        self._threads.add_message(thread_id, "user", text)

        route_mode = _is_route_request(text)
        results: list[RetrievedReview] = []
        try:
            results = self.search_only(text, 12 if route_mode else None)
            if route_mode:
                results = self._pick_compact_route_results(results, 3)
        except Exception:
            logger.exception("Assistant vector search failed")
            if self._fallback_search:
                try:
                    results = self._fallback_search.search_only(text, 12 if route_mode else None)
                    if route_mode:
                        results = self._pick_compact_route_results(results, 3)
                    logger.warning("Assistant switched to local review retrieval after vector search failure")
                except Exception:
                    logger.exception("Assistant local retrieval fallback also failed")

        self._enrich_results_with_fallback_metadata(results)

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

        try:
            answer = self._openai.chat_with_context(text, contexts)
        except Exception:
            logger.exception("Assistant live chat failed, using local evidence fallback")
            if route_mode:
                if results:
                    listed = ", ".join(item.poi.name for item in results)
                    answer = (
                        "AI live model is temporarily unavailable, so I used local review data to build route candidates. "
                        f"Best nearby stops: {listed}."
                    )
                else:
                    answer = "AI live model is temporarily unavailable and I could not find enough places for this route yet."
            else:
                if results:
                    highlights = []
                    for item in results[:3]:
                        detail = item.summary.strip() or "popular on local reviews"
                        highlights.append(f"- {item.poi.name}: {detail[:160]}")
                    answer = (
                        "AI live model is temporarily unavailable. I used local review evidence:\n"
                        + "\n".join(highlights)
                    )
                else:
                    answer = (
                        "AI live model is temporarily unavailable and I could not find matching review evidence for this request yet."
                    )

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
        return _is_route_request(text)

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

    def _enrich_results_with_fallback_metadata(self, results: list[RetrievedReview]) -> None:
        if not results:
            return
        if not self._fallback_doc_by_id and not self._fallback_doc_by_name and not self._fallback_doc_by_name_normalized:
            return

        for result in results:
            doc = self._fallback_doc_by_id.get(result.poi.id)
            if doc is None:
                doc = self._fallback_doc_by_name.get(result.poi.name.strip().lower())
            if doc is None:
                doc = self._fallback_doc_by_name_normalized.get(_normalize_lookup_key(result.poi.name))
            if doc is None:
                continue

            if not result.poi.imageUrl and doc.poi.imageUrl:
                result.poi.imageUrl = doc.poi.imageUrl
            if not result.poi.address and doc.poi.address:
                result.poi.address = doc.poi.address
            if not result.poi.city and doc.poi.city:
                result.poi.city = doc.poi.city
            if not result.poi.videoUrl and doc.poi.videoUrl:
                result.poi.videoUrl = doc.poi.videoUrl
            if not result.poi.videoId and doc.poi.videoId:
                result.poi.videoId = doc.poi.videoId

    @staticmethod
    def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        from math import asin, cos, radians, sin, sqrt

        dlat = radians(lat2 - lat1)
        dlng = radians(lng2 - lng1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
        return 6371.0 * 2 * asin(sqrt(a))


class RuleBasedAssistantService:
    def __init__(self, documents: list[ReviewDocument], top_k: int, openai_service: OpenAIService | None = None) -> None:
        self._documents = documents
        self._top_k = max(1, top_k)
        self._openai = openai_service
        self._threads = ThreadStore()

    @classmethod
    def from_review_file(
        cls,
        path: Path,
        top_k: int,
        openai_service: OpenAIService | None = None,
    ) -> "RuleBasedAssistantService":
        if not path.exists():
            return cls([], top_k, openai_service=openai_service)
        docs = load_review_documents(path)
        return cls(docs, top_k, openai_service=openai_service)

    def search_only(self, query: str, top_k: int | None = None) -> list[RetrievedReview]:
        text = query.strip()
        if not text:
            return []
        limit = max(1, top_k or self._top_k)
        if not self._documents:
            return []

        focus_name = self._extract_focus_name(text)
        terms = self._tokenize(text)

        ranked: list[tuple[float, ReviewDocument]] = []
        for doc in self._documents:
            score = self._score_document(doc, terms, focus_name)
            if score <= 0:
                continue
            ranked.append((score, doc))

        if not ranked:
            ranked = [(0.001, doc) for doc in self._documents[:limit]]

        ranked.sort(key=lambda item: (-item[0], item[1].poi.name))

        out: list[RetrievedReview] = []
        for score, doc in ranked[:limit]:
            out.append(
                RetrievedReview(
                    poi=doc.poi,
                    summary=doc.summary,
                    evidence=doc.evidence,
                    score=score,
                )
            )
        return out

    def handle_message(self, thread_id: str, text: str) -> AssistantResponse:
        text = text.strip()
        self._threads.add_message(thread_id, "user", text)

        route_mode = _is_route_request(text)
        results = self.search_only(text, 3 if route_mode else self._top_k)

        if self._openai:
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
            try:
                answer = self._openai.chat_with_context(text, contexts)
            except Exception:
                logger.exception("Assistant live chat failed in local retrieval mode")
                if route_mode:
                    if results:
                        listed = ", ".join(item.poi.name for item in results)
                        answer = (
                            "AI live model is temporarily unavailable, so I used local review data to build route candidates. "
                            f"Best nearby stops: {listed}."
                        )
                    else:
                        answer = "AI live model is temporarily unavailable and I could not find enough places for this route yet."
                else:
                    if results:
                        highlights = []
                        for item in results[:3]:
                            detail = item.summary.strip() or "popular on local reviews"
                            highlights.append(f"- {item.poi.name}: {detail[:160]}")
                        answer = (
                            "AI live model is temporarily unavailable. I used local review evidence:\n"
                            + "\n".join(highlights)
                        )
                    else:
                        answer = (
                            "AI live model is temporarily unavailable and I could not find matching review evidence for this request yet."
                        )
        elif route_mode:
            if results:
                listed = ", ".join(item.poi.name for item in results)
                answer = (
                    "AI is running in fallback mode right now, so I used local review data to build route candidates. "
                    f"Best nearby stops: {listed}."
                )
            else:
                answer = "AI fallback could not find enough places for this route yet."
        else:
            if results:
                highlights = []
                for item in results[:3]:
                    detail = item.summary.strip() or "popular on local reviews"
                    highlights.append(f"- {item.poi.name}: {detail[:160]}")
                answer = (
                    "AI is in fallback mode (no live model key). I used local review evidence:\n"
                    + "\n".join(highlights)
                )
            else:
                answer = (
                    "AI is in fallback mode and I could not find matching review evidence for this request yet."
                )

        self._threads.add_message(thread_id, "assistant", answer)
        return AssistantResponse(
            messages=self._threads.list_messages(thread_id),
            suggestedPois=[item.poi for item in results],
            suggestedPlan={"requiredPoiIds": [item.poi.id for item in results]} if route_mode and results else None,
            followUps=[
                "Show me a quieter option",
                "Give me something more photogenic",
                "Find a cafe for working",
                "Plan a route to the best one",
            ],
        )

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        clean = re.sub(r"[^a-z0-9\s]+", " ", text.lower())
        terms = [term for term in clean.split() if len(term) >= 2]
        # Keep ordering stable while removing duplicates.
        out: list[str] = []
        seen: set[str] = set()
        for term in terms:
            if term in seen:
                continue
            seen.add(term)
            out.append(term)
        return out

    @staticmethod
    def _extract_focus_name(text: str) -> str:
        lowered = text.lower()
        marker = "vibe check this specific place:"
        index = lowered.find(marker)
        if index == -1:
            return ""
        value = text[index + len(marker) :].strip()
        if not value:
            return ""
        value = value.split(".")[0].strip()
        value = value.split("(")[0].strip()
        return value.lower()

    def _score_document(self, doc: ReviewDocument, terms: list[str], focus_name: str) -> float:
        name = doc.poi.name.lower()
        address = (doc.poi.address or "").lower()
        city = (doc.poi.city or "").lower()
        summary = (doc.summary or "").lower()
        evidence = (doc.evidence or "").lower()

        score = 0.0
        if focus_name:
            if focus_name in name:
                score += 10.0
            elif name in focus_name:
                score += 8.0

        for term in terms:
            if term in name:
                score += 3.0
            elif term in address:
                score += 1.8
            elif term in city:
                score += 1.0
            elif term in summary:
                score += 1.2
            elif term in evidence:
                score += 0.8

        if doc.poi.rating is not None:
            score += max(0.0, doc.poi.rating) * 0.08
        return score
