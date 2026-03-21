"""Custom exceptions for the UGC module."""

from __future__ import annotations


class UGCError(Exception):
    """Base exception for all UGC module errors."""

    pass


class VideoValidationError(UGCError):
    """Raised when video validation fails."""

    pass


class VideoTooLargeError(VideoValidationError):
    """Raised when video exceeds maximum allowed size."""

    def __init__(self, size_bytes: int, max_bytes: int) -> None:
        self.size_bytes = size_bytes
        self.max_bytes = max_bytes
        super().__init__(
            f"Video size {size_bytes} bytes exceeds maximum {max_bytes} bytes"
        )


class InvalidVideoFormatError(VideoValidationError):
    """Raised when video format is not supported."""

    def __init__(self, content_type: str, allowed_types: list[str]) -> None:
        self.content_type = content_type
        self.allowed_types = allowed_types
        super().__init__(
            f"Video format '{content_type}' not supported. Allowed: {allowed_types}"
        )


class TranscriptionError(UGCError):
    """Raised when STT transcription fails."""

    pass


class OcrError(UGCError):
    """Raised when OCR extraction fails."""

    pass


class JudgeError(UGCError):
    """Raised when characteristic judgment fails."""

    pass


class IndexingError(UGCError):
    """Raised when vector indexing fails."""

    pass


class StorageError(UGCError):
    """Raised when video storage operations fail."""

    pass


class JobNotFoundError(UGCError):
    """Raised when a job is not found."""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        super().__init__(f"Job not found: {job_id}")


class ProviderError(UGCError):
    """Raised when an external provider call fails."""

    def __init__(self, provider: str, operation: str, message: str) -> None:
        self.provider = provider
        self.operation = operation
        super().__init__(f"{provider} {operation} failed: {message}")


class ConfigurationError(UGCError):
    """Raised when configuration is invalid or missing."""

    pass
