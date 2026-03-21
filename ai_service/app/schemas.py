from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LatLng(BaseModel):
    lat: float
    lng: float


class Poi(BaseModel):
    id: str
    name: str
    location: LatLng
    address: str | None = None
    city: str | None = None
    videoUrl: str | None = None
    videoId: str | None = None
    category: str | None = None
    rating: float | None = None
    badges: list[str] = Field(default_factory=list)


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    text: str
    createdAt: str


class AssistantMessageRequest(BaseModel):
    threadId: str = "default"
    text: str


class AssistantResponse(BaseModel):
    messages: list[ChatMessage]
    suggestedPois: list[Poi] = Field(default_factory=list)
    suggestedPlan: dict | None = None
    followUps: list[str] = Field(default_factory=list)


class ReviewDocument(BaseModel):
    id: str
    poi: Poi
    summary: str
    evidence: str = ""
    searchText: str


class EmbeddedReviewDocument(BaseModel):
    id: str
    poi: Poi
    summary: str
    evidence: str = ""
    searchText: str
    embeddingModel: str
    embedding: list[float]


class RetrievedReview(BaseModel):
    poi: Poi
    summary: str
    evidence: str = ""
    score: float = 0.0
