"""API schemas (Pydantic models) for UGC endpoints.

Defines request/response contracts for the UGC API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class VideoUploadMetadata(BaseModel):
    """Metadata for video upload request."""

    poi_name: str = Field(min_length=1, max_length=200)
    poi_city: str = Field(min_length=1, max_length=100)
    poi_address: str | None = Field(default=None, max_length=500)
    user_id: str | None = Field(default=None, max_length=100)

    @field_validator("poi_name", "poi_city")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value must not be empty after stripping whitespace")
        return cleaned


class VideoUploadResponse(BaseModel):
    """Response after video upload is accepted."""

    jobId: str
    videoId: str
    status: Literal["queued", "processing", "completed", "failed"]
    createdAt: datetime


class JobStatusResponse(BaseModel):
    """Response for job status query."""

    jobId: str
    videoId: str
    status: Literal["queued", "processing", "completed", "failed"]
    createdAt: datetime
    updatedAt: datetime
    error: str | None = None
    result: "JobResultDetail | None" = None


class JobResultDetail(BaseModel):
    """Details of a completed job result."""

    characteristic: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    indexed: bool = False
    providerMap: dict[str, str] = Field(default_factory=dict)
    transcriptionText: str | None = None
    ocrText: str | None = None


class HealthCheckResponse(BaseModel):
    """Health check response for UGC service."""

    status: Literal["ok", "degraded", "unhealthy"]
    service: str = "ugc"
    storage_ready: bool
    jobs_ready: bool
    providers_configured: bool
    errors: list[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    code: str
    details: dict[str, Any] = Field(default_factory=dict)


# Update forward references
JobStatusResponse.model_rebuild()
