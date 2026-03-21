"""FastAPI router for UGC endpoints.

Provides isolated endpoints for UGC video ingestion, separate from
the legacy pipeline routes.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from .composition import create_ugc_service
from .config import UGCConfig
from .errors import (
    InvalidVideoFormatError,
    JobNotFoundError,
    UGCError,
    VideoTooLargeError,
)
from .schemas import (
    ErrorResponse,
    HealthCheckResponse,
    JobResultDetail,
    JobStatusResponse,
    VideoUploadResponse,
)
from .service import UGCService
from .types import VideoMetadata


def create_ugc_router(
    service: UGCService | None = None,
    cfg: UGCConfig | None = None,
) -> APIRouter:
    """Create the UGC API router.

    Args:
        service: UGC service instance. If None, creates one from config.
        cfg: UGC configuration. If None, loads from environment.

    Returns:
        FastAPI router with UGC endpoints.
    """
    if service is None:
        service = create_ugc_service(cfg)

    router = APIRouter(prefix="/ugc", tags=["ugc"])

    @router.get("/health", response_model=HealthCheckResponse)
    def health() -> HealthCheckResponse:
        """Check UGC service health."""
        health_data = service.health()
        return HealthCheckResponse(**health_data)

    @router.post(
        "/videos",
        response_model=VideoUploadResponse,
        status_code=status.HTTP_202_ACCEPTED,
        responses={
            400: {"model": ErrorResponse, "description": "Invalid request"},
            413: {"model": ErrorResponse, "description": "Video too large"},
            415: {"model": ErrorResponse, "description": "Unsupported media type"},
            500: {"model": ErrorResponse, "description": "Processing error"},
        },
    )
    async def upload_video(
        file: Annotated[UploadFile, File(description="Video file to process")],
        poi_name: Annotated[str, Form(description="Name of the POI")],
        poi_city: Annotated[str, Form(description="City of the POI")],
        poi_address: Annotated[
            str | None, Form(description="Address of the POI")
        ] = None,
        user_id: Annotated[
            str | None, Form(description="User ID of the uploader")
        ] = None,
    ) -> VideoUploadResponse:
        """Upload a video for UGC processing.

        Accepts a video file with POI metadata and enqueues it for
        asynchronous processing. Returns immediately with a job ID
        that can be used to check status.
        """
        # Validate inputs
        if not poi_name or not poi_name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="poi_name is required",
            )
        if not poi_city or not poi_city.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="poi_city is required",
            )

        # Read file content
        try:
            content = await file.read()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read file: {e}",
            )

        # Build metadata
        metadata = VideoMetadata(
            poi_name=poi_name.strip(),
            poi_city=poi_city.strip(),
            poi_address=poi_address.strip() if poi_address else None,
            user_id=user_id.strip() if user_id else None,
        )

        # Submit video
        try:
            job = service.submit_video(
                content=content,
                metadata=metadata,
                content_type=file.content_type or "video/mp4",
                original_filename=file.filename,
            )
        except VideoTooLargeError as e:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Video too large: {e.size_bytes} bytes (max: {e.max_bytes})",
            )
        except InvalidVideoFormatError as e:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported video format: {e.content_type}",
            )
        except UGCError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e),
            )

        return VideoUploadResponse(
            job_id=job.job_id,
            video_id=job.video_id,
            status=job.status.value,
            created_at=job.created_at,
        )

    @router.get(
        "/jobs/{job_id}",
        response_model=JobStatusResponse,
        responses={
            404: {"model": ErrorResponse, "description": "Job not found"},
        },
    )
    def get_job_status(job_id: str) -> JobStatusResponse:
        """Get the status of a UGC processing job."""
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job not found: {job_id}",
            )

        # Build result detail if completed
        result = None
        if job.judge is not None:
            result = JobResultDetail(
                characteristic=job.judge.characteristic_vi if job.judge.accepted else None,
                confidence=job.judge.confidence,
                indexed=job.index.indexed if job.index else False,
                provider_map=job.provider_map,
                transcription_text=job.transcription.text if job.transcription else None,
                ocr_text=job.ocr.text if job.ocr else None,
            )

        return JobStatusResponse(
            job_id=job.job_id,
            video_id=job.video_id,
            status=job.status.value,
            created_at=job.created_at,
            updated_at=job.updated_at,
            error=job.error,
            result=result,
        )

    @router.post(
        "/jobs/{job_id}/process",
        response_model=JobStatusResponse,
        responses={
            404: {"model": ErrorResponse, "description": "Job not found"},
            500: {"model": ErrorResponse, "description": "Processing error"},
        },
    )
    def process_job(job_id: str) -> JobStatusResponse:
        """Manually trigger processing for a pending job.

        This endpoint is useful for synchronous processing or retrying
        failed jobs. In production, jobs would typically be processed
        by a background worker.
        """
        try:
            job = service.process_job(job_id)
        except JobNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job not found: {job_id}",
            )
        except UGCError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e),
            )

        # Build result detail
        result = None
        if job.judge is not None:
            result = JobResultDetail(
                characteristic=job.judge.characteristic_vi if job.judge.accepted else None,
                confidence=job.judge.confidence,
                indexed=job.index.indexed if job.index else False,
                provider_map=job.provider_map,
                transcription_text=job.transcription.text if job.transcription else None,
                ocr_text=job.ocr.text if job.ocr else None,
            )

        return JobStatusResponse(
            job_id=job.job_id,
            video_id=job.video_id,
            status=job.status.value,
            created_at=job.created_at,
            updated_at=job.updated_at,
            error=job.error,
            result=result,
        )

    return router
