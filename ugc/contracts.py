"""Interface contracts (protocols) for the UGC module.

These protocols define the ports that adapters must implement.
Business logic depends only on these interfaces, allowing easy
provider/model swaps without changing orchestration code.
"""

from __future__ import annotations

from abc import abstractmethod
from pathlib import Path
from typing import Protocol

from .types import (
    CharacteristicRow,
    IndexResult,
    JudgeResult,
    OcrResult,
    StorageResult,
    TranscriptionResult,
    UGCJob,
    VideoMetadata,
)


class Transcriber(Protocol):
    """Interface for speech-to-text transcription."""

    @abstractmethod
    def transcribe(self, video_path: Path) -> TranscriptionResult:
        """Transcribe audio from a video file.

        Args:
            video_path: Path to the video file.

        Returns:
            TranscriptionResult with extracted text, provider info, and segments.

        Raises:
            TranscriptionError: If transcription fails.
        """
        ...


class OcrExtractor(Protocol):
    """Interface for OCR text extraction from video frames."""

    @abstractmethod
    def extract(self, video_path: Path) -> OcrResult:
        """Extract text from video frames using OCR.

        Args:
            video_path: Path to the video file.

        Returns:
            OcrResult with extracted text, provider info, and frame count.

        Raises:
            OcrError: If OCR extraction fails.
        """
        ...


class CharacteristicJudge(Protocol):
    """Interface for judging/extracting POI characteristics from evidence."""

    @abstractmethod
    def judge(self, meta: VideoMetadata, evidence: str) -> JudgeResult:
        """Judge whether evidence contains valid POI characteristics.

        Args:
            meta: Video metadata including POI name, city, etc.
            evidence: Combined text evidence from STT and OCR.

        Returns:
            JudgeResult indicating acceptance, extracted characteristic, confidence.

        Raises:
            JudgeError: If judgment fails.
        """
        ...


class CharacteristicSerializer(Protocol):
    """Interface for serializing characteristics to JSONL format."""

    @abstractmethod
    def serialize(
        self,
        video_id: str,
        meta: VideoMetadata,
        judge_result: JudgeResult,
        provider_map: dict[str, str],
    ) -> CharacteristicRow:
        """Serialize a characteristic judgment to JSONL-compatible row.

        Args:
            video_id: The video identifier.
            meta: Video metadata.
            judge_result: The judge result containing characteristic text.
            provider_map: Map of component to provider/model used.

        Returns:
            CharacteristicRow ready for JSONL serialization.
        """
        ...


class VectorIndexer(Protocol):
    """Interface for indexing characteristics into vector storage."""

    @abstractmethod
    def index_characteristic(self, row: CharacteristicRow) -> IndexResult:
        """Index a characteristic row into vector storage.

        Args:
            row: The characteristic row to index.

        Returns:
            IndexResult with collection, doc_id, and indexing status.

        Raises:
            IndexingError: If indexing fails.
        """
        ...


class VideoStorage(Protocol):
    """Interface for video file storage."""

    @abstractmethod
    def store(
        self,
        video_id: str,
        content: bytes,
        original_filename: str | None = None,
    ) -> StorageResult:
        """Store a video file.

        Args:
            video_id: Unique video identifier.
            content: Video file content as bytes.
            original_filename: Original filename for extension inference.

        Returns:
            StorageResult with storage path and status.

        Raises:
            StorageError: If storage fails.
        """
        ...

    @abstractmethod
    def get_path(self, video_id: str) -> Path | None:
        """Get the storage path for a video.

        Args:
            video_id: The video identifier.

        Returns:
            Path to the video file, or None if not found.
        """
        ...

    @abstractmethod
    def delete(self, video_id: str) -> bool:
        """Delete a stored video.

        Args:
            video_id: The video identifier.

        Returns:
            True if deleted, False if not found.
        """
        ...


class JobRepository(Protocol):
    """Interface for job persistence."""

    @abstractmethod
    def create(self, job: UGCJob) -> UGCJob:
        """Create a new job record.

        Args:
            job: The job to create.

        Returns:
            The created job with any server-side modifications.

        Raises:
            UGCError: If creation fails.
        """
        ...

    @abstractmethod
    def get(self, job_id: str) -> UGCJob | None:
        """Get a job by ID.

        Args:
            job_id: The job identifier.

        Returns:
            The job, or None if not found.
        """
        ...

    @abstractmethod
    def update(self, job: UGCJob) -> UGCJob:
        """Update an existing job.

        Args:
            job: The job with updated fields.

        Returns:
            The updated job.

        Raises:
            JobNotFoundError: If job does not exist.
        """
        ...

    @abstractmethod
    def list_by_status(
        self,
        status: str,
        limit: int = 100,
    ) -> list[UGCJob]:
        """List jobs by status.

        Args:
            status: The status to filter by.
            limit: Maximum number of jobs to return.

        Returns:
            List of matching jobs.
        """
        ...
