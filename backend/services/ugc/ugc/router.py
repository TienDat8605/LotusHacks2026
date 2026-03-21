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
from .types import JobStatus, VideoMetadata


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

    router = APIRouter(prefix="/api/ugc", tags=["ugc"])

    def to_api_status(value: str) -> str:
        if value == JobStatus.PENDING.value:
            return "queued"
        return value

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
        point_of_interest: Annotated[
            str | None, Form(description="Name of the POI")
        ] = None,
        city: Annotated[str | None, Form(description="City of the POI")] = None,
        address: Annotated[
            str | None, Form(description="Address of the POI")
        ] = None,
        short_description: Annotated[
            str | None, Form(description="Short description")
        ] = None,
        atmosphere: Annotated[str | None, Form(description="Atmosphere")] = None,
        poi_name: Annotated[str | None, Form(description="Name of the POI")] = None,
        poi_city: Annotated[str | None, Form(description="City of the POI")] = None,
        poi_address: Annotated[str | None, Form(description="Address of the POI")] = None,
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
        effective_poi_name = (point_of_interest or poi_name or "").strip()
        effective_city = (city or poi_city or "").strip()
        effective_address = (
            (address or poi_address).strip() if (address or poi_address) else None
        )
        effective_short_description = (
            short_description.strip() if short_description else None
        )
        effective_atmosphere = atmosphere.strip() if atmosphere else None

        if not effective_poi_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="point_of_interest is required",
            )
        if not effective_city:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="city is required",
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
            poi_name=effective_poi_name,
            poi_city=effective_city,
            poi_address=effective_address,
            user_id=user_id.strip() if user_id else None,
            short_description=effective_short_description,
            atmosphere=effective_atmosphere,
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
            jobId=job.job_id,
            videoId=job.video_id,
            status=to_api_status(job.status.value),
            createdAt=job.created_at,
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
                providerMap=job.provider_map,
                transcriptionText=job.transcription.text if job.transcription else None,
                ocrText=job.ocr.text if job.ocr else None,
            )

        return JobStatusResponse(
            jobId=job.job_id,
            videoId=job.video_id,
            status=to_api_status(job.status.value),
            createdAt=job.created_at,
            updatedAt=job.updated_at,
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
                providerMap=job.provider_map,
                transcriptionText=job.transcription.text if job.transcription else None,
                ocrText=job.ocr.text if job.ocr else None,
            )

        return JobStatusResponse(
            jobId=job.job_id,
            videoId=job.video_id,
            status=to_api_status(job.status.value),
            createdAt=job.created_at,
            updatedAt=job.updated_at,
            error=job.error,
            result=result,
        )

    return router
