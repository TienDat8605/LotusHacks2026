"""Fallback transcriber that retries another provider after primary failure."""

from __future__ import annotations

from pathlib import Path

from ..contracts import Transcriber
from ..errors import TranscriptionError
from ..types import TranscriptionResult


def _compact_error(error: Exception, limit: int = 240) -> str:
    text = " ".join(str(error).split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3]}..."


class FallbackTranscriber:
    """Try a primary transcriber first, then fall back to another provider."""

    def __init__(
        self,
        primary: Transcriber,
        fallback: Transcriber,
        primary_name: str,
        fallback_name: str,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._primary_name = primary_name
        self._fallback_name = fallback_name

    def transcribe(self, video_path: Path) -> TranscriptionResult:
        try:
            return self._primary.transcribe(video_path)
        except Exception as primary_error:
            try:
                return self._fallback.transcribe(video_path)
            except Exception as fallback_error:
                raise TranscriptionError(
                    f"{self._primary_name} failed: {_compact_error(primary_error)}; "
                    f"{self._fallback_name} failed: {_compact_error(fallback_error)}"
                ) from fallback_error
