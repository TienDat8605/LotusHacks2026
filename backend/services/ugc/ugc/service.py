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

from .config import UGCConfig
from .contracts import (
    CharacteristicSerializer,
    CharacteristicJudge,
    DataRecordRepository,
    Geocoder,
    JobRepository,
    OcrExtractor,
    Transcriber,
    VectorIndexer,
    VideoStorage,
)
from .errors import (
    InvalidVideoFormatError,
    VideoTooLargeError,
    JobNotFoundError,
    UGCError,
)
from .types import (
    GeocodeResult,
    IndexResult,
    JobStatus,
    TikTokDataRecord,
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
        geocoder: Geocoder,
        data_records: DataRecordRepository,
    ) -> None:
        self._cfg = cfg
        self._storage = storage
        self._transcriber = transcriber
        self._ocr = ocr
        self._judge = judge
        self._serializer = serializer
        self._indexer = indexer
        self._jobs = jobs
        self._geocoder = geocoder
        self._data_records = data_records

    def health(self) -> dict:
        """Check service health status."""
        errors = self._cfg.validate_for_processing()

        # Check storage path
        storage_ready = self._cfg.storage_path.parent.exists()
        jobs_ready = self._cfg.jobs_path.parent.exists()
        dataset_ready = self._cfg.dataset_path.parent.exists()

        status = "ok" if not errors else "degraded"
        if not storage_ready or not jobs_ready or not dataset_ready:
            status = "unhealthy"

        return {
            "status": status,
            "service": "ugc",
            "storage_ready": storage_ready,
            "jobs_ready": jobs_ready,
            "dataset_ready": dataset_ready,
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
            short_description=metadata.short_description,
            atmosphere=metadata.atmosphere,
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

    def submit_and_process_video(
        self,
        content: bytes,
        metadata: VideoMetadata,
        content_type: str = "video/mp4",
        original_filename: str | None = None,
    ) -> UGCJob:
        """Store a video and run the full pipeline before returning."""
        job = self.submit_video(
            content=content,
            metadata=metadata,
            content_type=content_type,
            original_filename=original_filename,
        )

        try:
            return self.process_job(job.job_id)
        except Exception:
            failed_job = self.get_job(job.job_id)
            if failed_job is not None:
                return failed_job
            raise

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
            provider_map = dict(job.provider_map)
            provider_map["stt"] = f"{transcription.provider}:{transcription.model}"
            job = dataclasses.replace(
                job,
                transcription=transcription,
                provider_map=provider_map,
            )
            trace["stt_status"] = "success"
            trace["stt_text_length"] = len(transcription.text)
            trace["stt_provider_used"] = transcription.provider
            trace["stt_model_used"] = transcription.model
        except Exception as e:
            trace["stt_status"] = "failed"
            trace["stt_error"] = str(e)
            transcription = None

        # Step 2: OCR
        try:
            ocr_result = self._ocr.extract(video_path)
            job = dataclasses.replace(job, ocr=ocr_result)
            if ocr_result.provider == "disabled":
                trace["ocr_status"] = "skipped"
            else:
                trace["ocr_status"] = "success"
                trace["ocr_frame_count"] = ocr_result.frame_count
        except Exception as e:
            trace["ocr_status"] = "failed"
            trace["ocr_error"] = str(e)
            ocr_result = None

        if not transcription or not transcription.text.strip():
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error="No transcription extracted from video",
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            return job

        # Combine evidence
        evidence_parts = []
        if transcription and transcription.text:
            evidence_parts.append(f"[Speech transcript]\n{transcription.text}")
        if ocr_result and ocr_result.text:
            evidence_parts.append(f"[OCR text]\n{ocr_result.text}")

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
        trace["serialized_characteristic"] = char_row.characteristic
        trace["serialized_characteristic_preview"] = char_row.characteristic[:200]
        trace["characteristic_raw"] = char_row.characteristic

        # Step 5: Geocode + persist dataset record
        geocode_result = self._geocode_metadata(job.metadata, trace)
        dataset_record = self._build_dataset_record(
            job=job,
            evidence=evidence,
            characteristic_raw=char_row.characteristic,
            geocode_result=geocode_result,
        )
        try:
            dataset_path = self._data_records.upsert(dataset_record)
            trace["dataset_status"] = "success"
            trace["dataset_path"] = dataset_path
        except Exception as e:
            trace["dataset_status"] = "failed"
            trace["dataset_error"] = str(e)
            job = dataclasses.replace(
                job,
                status=JobStatus.FAILED,
                error=f"Dataset persistence failed: {e}",
                trace=trace,
                updated_at=datetime.now(timezone.utc),
            )
            self._jobs.update(job)
            raise

        # Step 6: Index
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
                index=self._build_failed_index_result(job.video_id, e),
            )

        # Mark as completed
        job = dataclasses.replace(
            job,
            status=JobStatus.COMPLETED,
            trace=trace,
            updated_at=datetime.now(timezone.utc),
        )
        self._jobs.update(job)

        return job

    def _geocode_metadata(
        self,
        metadata: VideoMetadata,
        trace: dict,
    ) -> GeocodeResult | None:
        query_parts = [
            metadata.poi_address or "",
            metadata.poi_name,
            metadata.poi_city,
        ]
        query = ", ".join(part.strip() for part in query_parts if part and part.strip())
        if not query:
            trace["geocode_status"] = "skipped"
            return None

        result = self._geocoder.geocode(query)
        if result is None:
            trace["geocode_status"] = "not_found"
            return None

        trace["geocode_status"] = "success"
        trace["geocode_source"] = result.source
        trace["geocode_lat"] = result.lat
        trace["geocode_lng"] = result.lng
        return result

    def _build_dataset_record(
        self,
        job: UGCJob,
        evidence: str,
        characteristic_raw: str,
        geocode_result: GeocodeResult | None,
    ) -> TikTokDataRecord:
        if job.judge is None:
            raise UGCError("Cannot persist dataset record without a judge result")

        stt_source = ""
        if job.transcription is not None:
            stt_source = job.transcription.provider
            if stt_source == "interfaze_stt":
                stt_source = "interfaze"
            if stt_source.endswith("_stt"):
                stt_source = stt_source[:-4]
        evidence_quotes = [
            f"\"{quote.strip()}\""
            for quote in job.judge.evidence_quotes[:3]
            if quote.strip()
        ]
        if not evidence_quotes:
            evidence_quotes = [
                f"\"{segment.strip()}\""
                for segment in evidence.splitlines()
                if segment.strip()
            ][:3]
        evidence_text = " | ".join(evidence_quotes).strip()
        return TikTokDataRecord(
            video_id=job.video_id,
            video_url="",
            poi_name=job.metadata.poi_name,
            poi_address=job.metadata.poi_address or "",
            poi_city=job.metadata.poi_city,
            lat=geocode_result.lat if geocode_result else "",
            lng=geocode_result.lng if geocode_result else "",
            geo_source=geocode_result.source if geocode_result else "",
            stt_source=stt_source,
            confidence=f"{job.judge.confidence:.2f}",
            characteristic_vi=job.judge.characteristic_vi,
            evidence=evidence_text[:2000],
            characteristic_raw=characteristic_raw,
            video_playcount="",
            location_type="",
            image_url="",
        )

    def _build_failed_index_result(self, video_id: str, error: Exception) -> IndexResult:
        return IndexResult(
            collection=self._cfg.index_collection,
            doc_id=video_id,
            point_id="",
            indexed=False,
            error=str(error),
        )

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
