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


@dataclass(frozen=True)
class JudgeResult:
    """Result of characteristic judgment/extraction."""

    accepted: bool
    characteristic_vi: str
    confidence: float
    reason: str
    evidence_quotes: list[str] = field(default_factory=list)


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


@dataclass(frozen=True)
class GeocodeResult:
    """Result of geocoding a location query."""

    lat: str
    lng: str
    source: str


@dataclass
class VideoMetadata:
    """Metadata about an uploaded video."""

    poi_name: str
    poi_city: str
    poi_address: str | None = None
    short_description: str | None = None
    atmosphere: str | None = None
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


@dataclass(frozen=True)
class TikTokDataRecord:
    """Persisted record compatible with the existing TikTok-shaped dataset."""

    video_id: str
    video_url: str
    poi_name: str
    poi_address: str
    poi_city: str
    lat: str
    lng: str
    geo_source: str
    stt_source: str
    confidence: str
    characteristic_vi: str
    evidence: str
    characteristic_raw: str
    video_playcount: str
    location_type: str
    image_url: str

    def to_dict(self) -> dict[str, str]:
        return {
            "video_id": self.video_id,
            "video_url": self.video_url,
            "poi_name": self.poi_name,
            "poi_address": self.poi_address,
            "poi_city": self.poi_city,
            "lat": self.lat,
            "lng": self.lng,
            "geo_source": self.geo_source,
            "stt_source": self.stt_source,
            "confidence": self.confidence,
            "characteristic_vi": self.characteristic_vi,
            "evidence": self.evidence,
            "characteristic_raw": self.characteristic_raw,
            "video_playcount": self.video_playcount,
            "location_type": self.location_type,
            "image_url": self.image_url,
        }
