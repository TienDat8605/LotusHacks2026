"""No-op OCR adapter for transcription-only runs."""

from __future__ import annotations

from pathlib import Path

from ..types import OcrResult


class NoopOcrExtractor:
    """Returns an empty OCR result so the pipeline can run transcription-only."""

    def extract(self, video_path: Path) -> OcrResult:
        return OcrResult(
            text="",
            provider="disabled",
            model="disabled",
            frame_count=0,
            frame_texts=[],
        )
