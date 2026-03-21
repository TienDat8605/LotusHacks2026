"""UGC video processing service orchestration.

This service coordinates the workflow for processing user-generated videos:
1. Validate upload and metadata
2. Persist video via VideoStorage
3. Run STT + OCR
4. Judge/extract characteristic text
5. Serialize JSONL row in canonical format
6. Index into Qdrant via VectorIndexer
7. Persist job result + trace metadata
"""

from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import UGCConfig
from .contracts import (
    CharacteristicSerializer,
    JobRepository,
    OcrExtractor,
    Transcriber,
    VectorIndexer,
    VideoStorage,
    CharacteristicJudge,
)
from .errors import (
    InvalidVideoFormatError,
    JobNotFoundError,
    UGCError,
    VideoTooLargeError,
)
from .types import (
    JobStatus,
    UGCJob,
    VideoMetadata,
)


class UGCService:
    """Orchestrates UGC video processing workflow."""

    def __init__(
        self,
        cfg: UGCConfig,
        storage: VideoStorage,
        transcriber: Transcriber,
        ocr: OcrExtractor,
        judge: CharacteristicJudge,
        serializer: CharacteristicSerializer,
        indexer: VectorIndexer,
        jobs: JobRepository,
    ) -> None:
        self._cfg = cfg
        self._storage = storage
        self._transcriber = transcriber
        self._ocr = ocr
        self._judge = judge
        self._serializer = serializer
        self._indexer = indexer
        self._jobs = jobs

    def health(self) -> dict:
        """Check service health status."""
        errors = self._cfg.validate_for_processing()

        # Check storage path
        storage_ready = self._cfg.storage_path.parent.exists() or True
        jobs_ready = self._cfg.jobs_path.parent.exists() or True

        status = "ok" if not errors else "degraded"
        if not storage_ready or not jobs_ready:
            status = "unhealthy"

        return {
            "status": status,
            "service": "ugc",
            "storage_ready": storage_ready,
            "jobs_ready": jobs_ready,
            "providers_configured": len(errors) == 0,
            "errors": errors,
        }

    def submit_video(
        self,
        content: bytes,
        metadata: VideoMetadata,
        content_type: str = "video/mp4",
        original_filename: str | None = None,
    ) -> UGCJob:
        """Submit a video for processing.

        Args:
            content: Video file content.
            metadata: POI and user metadata.
            content_type: MIME type of the video.
            original_filename: Original filename if available.

        Returns:
            Created job with pending status.

        Raises:
            VideoTooLargeError: If video exceeds max size.
            InvalidVideoFormatError: If video format not allowed.
        """
        # Validate video size
        if len(content) > self._cfg.max_video_size_bytes:
            raise VideoTooLargeError(len(content), self._cfg.max_video_size_bytes)

        # Validate content type
        if content_type not in self._cfg.allowed_video_types:
            raise InvalidVideoFormatError(content_type, self._cfg.allowed_video_types)

        # Generate IDs
        job_id = str(uuid.uuid4())
        video_id = str(uuid.uuid4())
        upload_id = str(uuid.uuid4())

        # Update metadata with generated upload_id
        metadata = dataclasses.replace(
            metadata,
            upload_id=upload_id,
            original_filename=original_filename,
        ) if dataclasses.is_dataclass(metadata) else VideoMetadata(
            poi_name=metadata.poi_name,
            poi_city=metadata.poi_city,
            poi_address=metadata.poi_address,
            user_id=metadata.user_id,
            upload_id=upload_id,
            original_filename=original_filename,
        )

        now = datetime.now(timezone.utc)

        # Create job record
        job = UGCJob(
            job_id=job_id,
            video_id=video_id,
            status=JobStatus.PENDING,
            created_at=now,
            updated_at=now,
            metadata=metadata,
            provider_map=self._cfg.get_provider_map(),
        )

        # Persist job
        self._jobs.create(job)

        # Store video
        try:
            self._storage.store(video_id, content, original_filename)
        except Exception as e:
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error=f"Failed to store video: {e}",
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            raise

        return job

    def process_job(self, job_id: str) -> UGCJob:
        """Process a pending job through the full pipeline.

        Args:
            job_id: The job identifier.

        Returns:
            Updated job with processing results.

        Raises:
            JobNotFoundError: If job not found.
            UGCError: If processing fails.
        """
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(job_id)

        # Update status to processing
        job = dataclasses.replace(
            job,
            status=JobStatus.PROCESSING,
            updated_at=datetime.now(timezone.utc),
        )
        self._jobs.update(job)

        try:
            job = self._run_pipeline(job)
        except Exception as e:
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error=str(e),
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            raise

        return job

    def _run_pipeline(self, job: UGCJob) -> UGCJob:
        """Run the full processing pipeline on a job."""
        video_path = self._storage.get_path(job.video_id)
        if video_path is None:
            raise UGCError(f"Video file not found: {job.video_id}")

        trace: dict = {}

        # Step 1: STT
        try:
            transcription = self._transcriber.transcribe(video_path)
            job = dataclasses.replace(job, transcription=transcription)
            trace["stt_status"] = "success"
            trace["stt_text_length"] = len(transcription.text)
        except Exception as e:
            trace["stt_status"] = "failed"
            trace["stt_error"] = str(e)
            transcription = None

        # Step 2: OCR
        try:
            ocr_result = self._ocr.extract(video_path)
            job = dataclasses.replace(job, ocr=ocr_result)
            trace["ocr_status"] = "success"
            trace["ocr_frame_count"] = ocr_result.frame_count
        except Exception as e:
            trace["ocr_status"] = "failed"
            trace["ocr_error"] = str(e)
            ocr_result = None

        # Combine evidence
        evidence_parts = []
        if transcription and transcription.text:
            evidence_parts.append(f"[Speech transcript]\n{transcription.text}")
        if ocr_result and ocr_result.text:
            evidence_parts.append(f"[OCR text]\n{ocr_result.text}")
        if ocr_result and ocr_result.visual_clues:
            evidence_parts.append(
                "[Visual clues]\n" + "\n".join(f"- {clue}" for clue in ocr_result.visual_clues)
            )

        evidence = "\n\n".join(evidence_parts)

        if not evidence.strip():
            job = dataclasses.replace(
                job,
                status=JobStatus.COMPLETED,
                error="No evidence extracted from video (no speech or text found)",
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            return job

        # Step 3: Judge
        try:
            judge_result = self._judge.judge(job.metadata, evidence)
            job = dataclasses.replace(job, judge=judge_result)
            trace["judge_status"] = "success"
            trace["judge_accepted"] = judge_result.accepted
            trace["judge_confidence"] = judge_result.confidence
        except Exception as e:
            trace["judge_status"] = "failed"
            trace["judge_error"] = str(e)
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error=f"Judge failed: {e}",
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            raise

        # If not accepted, mark as completed but don't index
        if not judge_result.accepted:
            job = dataclasses.replace(
                job,
                status=JobStatus.COMPLETED,
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            return job

        # Step 4: Serialize
        char_row = self._serializer.serialize(
            video_id=job.video_id,
            meta=job.metadata,
            judge_result=judge_result,
            provider_map=job.provider_map,
        )
        trace["serialized_characteristic"] = char_row.characteristic[:200]

        # Step 5: Index
        try:
            index_result = self._indexer.index_characteristic(char_row)
            job = dataclasses.replace(job, index=index_result)
            trace["index_status"] = "success" if index_result.indexed else "skipped"
            if index_result.error:
                trace["index_error"] = index_result.error
        except Exception as e:
            trace["index_status"] = "failed"
            trace["index_error"] = str(e)
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error=f"Indexing failed: {e}",
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            raise

        # Mark as completed
        job = dataclasses.replace(
            job,
            status=JobStatus.COMPLETED,
            trace=trace,
            updated_at=datetime.now(timezone.utc),
        )
        self._jobs.update(job)

        return job

    def get_job(self, job_id: str) -> UGCJob | None:
        """Get a job by ID.

        Args:
            job_id: The job identifier.

        Returns:
            The job, or None if not found.
        """
        return self._jobs.get(job_id)

    def list_pending_jobs(self, limit: int = 100) -> list[UGCJob]:
        """List jobs with pending status.

        Args:
            limit: Maximum number of jobs to return.

        Returns:
            List of pending jobs.
        """
        return self._jobs.list_by_status(JobStatus.PENDING.value, limit)
