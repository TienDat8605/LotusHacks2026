"""Shared data types for the UGC module."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class JobStatus(str, Enum):
    """Status of a UGC processing job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class TranscriptionSegment:
    """A segment of transcribed audio with timing information."""

    text: str
    start: float
    end: float


@dataclass(frozen=True)
class TranscriptionResult:
    """Result of STT transcription."""

    text: str
    provider: str
    model: str
    segments: list[TranscriptionSegment] = field(default_factory=list)
    language: str | None = None
    duration_seconds: float | None = None


@dataclass(frozen=True)
class OcrResult:
    """Result of OCR extraction from video frames."""

    text: str
    provider: str
    model: str
    frame_count: int
    frame_texts: list[str] = field(default_factory=list)
    visual_clues: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ExtractedEntity:
    """Named entity extracted from the combined video evidence."""

    name: str
    entity_type: str
    source: str


@dataclass(frozen=True)
class ExtractedFact:
    """A factual statement extracted from the evidence."""

    claim: str
    source: str


@dataclass(frozen=True)
class EvidenceItem:
    """Evidence explaining why the model reached its conclusion."""

    source: str
    kind: str
    detail: str
    quote: str | None = None


@dataclass(frozen=True)
class JudgeResult:
    """Result of characteristic judgment/extraction."""

    accepted: bool
    characteristic_vi: str
    confidence: float
    reason: str
    evidence_quotes: list[str] = field(default_factory=list)
    location_explicit: str | None = None
    location_guess: str | None = None
    description: str = ""
    entities: list[ExtractedEntity] = field(default_factory=list)
    facts: list[ExtractedFact] = field(default_factory=list)
    evidence: list[EvidenceItem] = field(default_factory=list)


@dataclass(frozen=True)
class IndexResult:
    """Result of indexing a characteristic into vector storage."""

    collection: str
    doc_id: str
    point_id: str
    indexed: bool
    error: str | None = None


@dataclass(frozen=True)
class StorageResult:
    """Result of storing a video file."""

    video_id: str
    path: str
    size_bytes: int
    stored: bool


@dataclass
class VideoMetadata:
    """Metadata about an uploaded video."""

    poi_name: str
    poi_city: str
    poi_address: str | None = None
    user_id: str | None = None
    upload_id: str | None = None
    original_filename: str | None = None


@dataclass
class UGCJob:
    """A UGC video processing job."""

    job_id: str
    video_id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    metadata: VideoMetadata
    provider_map: dict[str, str] = field(default_factory=dict)
    transcription: TranscriptionResult | None = None
    ocr: OcrResult | None = None
    judge: JudgeResult | None = None
    index: IndexResult | None = None
    error: str | None = None
    trace: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CharacteristicRow:
    """A row in the characteristic JSONL format (backward compatible + UGC extension)."""

    video_id: str
    characteristic: str
    pipeline_version: str
    source: str = "ugc"
    user_id: str | None = None
    upload_id: str | None = None
    provider_map: dict[str, str] = field(default_factory=dict)
    created_at: str | None = None
