"""JSON file-based job repository adapter."""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

from ..config import UGCConfig
from ..errors import JobNotFoundError, UGCError
from ..types import (
    EvidenceItem,
    ExtractedEntity,
    ExtractedFact,
    IndexResult,
    JobStatus,
    JudgeResult,
    OcrResult,
    TranscriptionResult,
    TranscriptionSegment,
    UGCJob,
    VideoMetadata,
)


class JsonJobRepository:
    """Job persistence using JSON files.

    Each job is stored as a separate JSON file for simplicity and
    to avoid file locking issues. This can be swapped for a database-backed
    implementation using the same JobRepository interface.
    """

    def __init__(self, cfg: UGCConfig) -> None:
        self._jobs_path = cfg.jobs_path
        self._lock = threading.Lock()

    def create(self, job: UGCJob) -> UGCJob:
        """Create a new job record.

        Args:
            job: The job to create.

        Returns:
            The created job.

        Raises:
            UGCError: If creation fails.
        """
        with self._lock:
            try:
                self._jobs_path.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise UGCError(f"Failed to create jobs directory: {e}")

            job_file = self._jobs_path / f"{job.job_id}.json"
            if job_file.exists():
                raise UGCError(f"Job already exists: {job.job_id}")

            self._write_job(job_file, job)
            return job

    def get(self, job_id: str) -> UGCJob | None:
        """Get a job by ID.

        Args:
            job_id: The job identifier.

        Returns:
            The job, or None if not found.
        """
        job_file = self._jobs_path / f"{job_id}.json"
        if not job_file.exists():
            return None

        return self._read_job(job_file)

    def update(self, job: UGCJob) -> UGCJob:
        """Update an existing job.

        Args:
            job: The job with updated fields.

        Returns:
            The updated job.

        Raises:
            JobNotFoundError: If job does not exist.
        """
        with self._lock:
            job_file = self._jobs_path / f"{job.job_id}.json"
            if not job_file.exists():
                raise JobNotFoundError(job.job_id)

            self._write_job(job_file, job)
            return job

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
        if not self._jobs_path.exists():
            return []

        jobs: list[UGCJob] = []
        for job_file in self._jobs_path.glob("*.json"):
            if len(jobs) >= limit:
                break

            job = self._read_job(job_file)
            if job and job.status.value == status:
                jobs.append(job)

        return jobs

    def _write_job(self, job_file: Path, job: UGCJob) -> None:
        """Write a job to a JSON file."""
        data = self._job_to_dict(job)
        job_file.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")

    def _read_job(self, job_file: Path) -> UGCJob | None:
        """Read a job from a JSON file."""
        try:
            data = json.loads(job_file.read_text(encoding="utf-8"))
            return self._dict_to_job(data)
        except (json.JSONDecodeError, KeyError, ValueError):
            return None

    def _job_to_dict(self, job: UGCJob) -> dict:
        """Convert a UGCJob to a dictionary for JSON serialization."""
        return {
            "job_id": job.job_id,
            "video_id": job.video_id,
            "status": job.status.value,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
            "metadata": {
                "poi_name": job.metadata.poi_name,
                "poi_city": job.metadata.poi_city,
                "poi_address": job.metadata.poi_address,
                "user_id": job.metadata.user_id,
                "upload_id": job.metadata.upload_id,
                "original_filename": job.metadata.original_filename,
            },
            "provider_map": job.provider_map,
            "transcription": self._transcription_to_dict(job.transcription),
            "ocr": self._ocr_to_dict(job.ocr),
            "judge": self._judge_to_dict(job.judge),
            "index": self._index_to_dict(job.index),
            "error": job.error,
            "trace": job.trace,
        }

    def _dict_to_job(self, data: dict) -> UGCJob:
        """Convert a dictionary to a UGCJob."""
        metadata = VideoMetadata(
            poi_name=data["metadata"]["poi_name"],
            poi_city=data["metadata"]["poi_city"],
            poi_address=data["metadata"].get("poi_address"),
            user_id=data["metadata"].get("user_id"),
            upload_id=data["metadata"].get("upload_id"),
            original_filename=data["metadata"].get("original_filename"),
        )

        return UGCJob(
            job_id=data["job_id"],
            video_id=data["video_id"],
            status=JobStatus(data["status"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            metadata=metadata,
            provider_map=data.get("provider_map", {}),
            transcription=self._dict_to_transcription(data.get("transcription")),
            ocr=self._dict_to_ocr(data.get("ocr")),
            judge=self._dict_to_judge(data.get("judge")),
            index=self._dict_to_index(data.get("index")),
            error=data.get("error"),
            trace=data.get("trace", {}),
        )

    def _transcription_to_dict(self, t: TranscriptionResult | None) -> dict | None:
        if t is None:
            return None
        return {
            "text": t.text,
            "provider": t.provider,
            "model": t.model,
            "segments": [
                {"text": s.text, "start": s.start, "end": s.end} for s in t.segments
            ],
            "language": t.language,
            "duration_seconds": t.duration_seconds,
        }

    def _dict_to_transcription(self, data: dict | None) -> TranscriptionResult | None:
        if data is None:
            return None
        segments = [
            TranscriptionSegment(
                text=s["text"],
                start=s["start"],
                end=s["end"],
            )
            for s in data.get("segments", [])
        ]
        return TranscriptionResult(
            text=data["text"],
            provider=data["provider"],
            model=data["model"],
            segments=segments,
            language=data.get("language"),
            duration_seconds=data.get("duration_seconds"),
        )

    def _ocr_to_dict(self, o: OcrResult | None) -> dict | None:
        if o is None:
            return None
        return {
            "text": o.text,
            "provider": o.provider,
            "model": o.model,
            "frame_count": o.frame_count,
            "frame_texts": o.frame_texts,
            "visual_clues": o.visual_clues,
        }

    def _dict_to_ocr(self, data: dict | None) -> OcrResult | None:
        if data is None:
            return None
        return OcrResult(
            text=data["text"],
            provider=data["provider"],
            model=data["model"],
            frame_count=data["frame_count"],
            frame_texts=data.get("frame_texts", []),
            visual_clues=data.get("visual_clues", []),
        )

    def _judge_to_dict(self, j: JudgeResult | None) -> dict | None:
        if j is None:
            return None
        return {
            "accepted": j.accepted,
            "characteristic_vi": j.characteristic_vi,
            "confidence": j.confidence,
            "reason": j.reason,
            "evidence_quotes": j.evidence_quotes,
            "location_explicit": j.location_explicit,
            "location_guess": j.location_guess,
            "description": j.description,
            "entities": [
                {
                    "name": entity.name,
                    "entity_type": entity.entity_type,
                    "source": entity.source,
                }
                for entity in j.entities
            ],
            "facts": [
                {
                    "claim": fact.claim,
                    "source": fact.source,
                }
                for fact in j.facts
            ],
            "evidence": [
                {
                    "source": item.source,
                    "kind": item.kind,
                    "detail": item.detail,
                    "quote": item.quote,
                }
                for item in j.evidence
            ],
        }

    def _dict_to_judge(self, data: dict | None) -> JudgeResult | None:
        if data is None:
            return None
        return JudgeResult(
            accepted=data["accepted"],
            characteristic_vi=data["characteristic_vi"],
            confidence=data["confidence"],
            reason=data["reason"],
            evidence_quotes=data.get("evidence_quotes", []),
            location_explicit=data.get("location_explicit"),
            location_guess=data.get("location_guess"),
            description=data.get("description", ""),
            entities=[
                ExtractedEntity(
                    name=item.get("name", ""),
                    entity_type=item.get("entity_type", ""),
                    source=item.get("source", "unknown"),
                )
                for item in data.get("entities", [])
            ],
            facts=[
                ExtractedFact(
                    claim=item.get("claim", ""),
                    source=item.get("source", "unknown"),
                )
                for item in data.get("facts", [])
            ],
            evidence=[
                EvidenceItem(
                    source=item.get("source", "unknown"),
                    kind=item.get("kind", "support"),
                    detail=item.get("detail", ""),
                    quote=item.get("quote"),
                )
                for item in data.get("evidence", [])
            ],
        )

    def _index_to_dict(self, i: IndexResult | None) -> dict | None:
        if i is None:
            return None
        return {
            "collection": i.collection,
            "doc_id": i.doc_id,
            "point_id": i.point_id,
            "indexed": i.indexed,
            "error": i.error,
        }

    def _dict_to_index(self, data: dict | None) -> IndexResult | None:
        if data is None:
            return None
        return IndexResult(
            collection=data["collection"],
            doc_id=data["doc_id"],
            point_id=data["point_id"],
            indexed=data["indexed"],
            error=data.get("error"),
        )
