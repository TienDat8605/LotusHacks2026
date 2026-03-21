"""Groq Whisper STT adapter for transcription."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import httpx

from ..config import UGCConfig
from ..errors import ProviderError, TranscriptionError
from ..types import TranscriptionResult, TranscriptionSegment


class GroqWhisperTranscriber:
    """Speech-to-text transcription using Groq's Whisper API."""

    def __init__(self, cfg: UGCConfig, model: str | None = None) -> None:
        self._api_key = cfg.groq_api_key
        self._model = model or cfg.stt_model
        self._provider = "groq_whisper"

    def transcribe(self, video_path: Path) -> TranscriptionResult:
        """Transcribe audio from a video file using Groq Whisper.

        Args:
            video_path: Path to the video file.

        Returns:
            TranscriptionResult with extracted text.

        Raises:
            TranscriptionError: If transcription fails.
        """
        if not self._api_key:
            raise TranscriptionError("GROQ_API_KEY is not configured")

        if not video_path.exists():
            raise TranscriptionError(f"Video file not found: {video_path}")

        # Extract audio from video using ffmpeg
        audio_path = self._extract_audio(video_path)

        try:
            return self._call_groq_api(audio_path)
        finally:
            # Clean up temporary audio file
            if audio_path.exists():
                audio_path.unlink()

    def _extract_audio(self, video_path: Path) -> Path:
        """Extract audio track from video to a temporary file."""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            audio_path = Path(tmp.name)

        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-i",
                    str(video_path),
                    "-vn",  # No video
                    "-acodec",
                    "libmp3lame",
                    "-ar",
                    "16000",  # 16kHz for Whisper
                    "-ac",
                    "1",  # Mono
                    "-y",  # Overwrite
                    str(audio_path),
                ],
                capture_output=True,
                timeout=120,
                check=False,
            )
            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")
                raise TranscriptionError(f"FFmpeg audio extraction failed: {stderr}")
        except FileNotFoundError:
            raise TranscriptionError(
                "FFmpeg not found. Please install ffmpeg for audio extraction."
            )
        except subprocess.TimeoutExpired:
            raise TranscriptionError("Audio extraction timed out")

        return audio_path

    def _call_groq_api(self, audio_path: Path) -> TranscriptionResult:
        """Call Groq Whisper API for transcription."""
        url = "https://api.groq.com/openai/v1/audio/transcriptions"

        try:
            with audio_path.open("rb") as audio_file:
                files = {"file": (audio_path.name, audio_file, "audio/mpeg")}
                data = {
                    "model": self._model,
                    "response_format": "verbose_json",
                    "language": "vi",  # Vietnamese
                }

                with httpx.Client(timeout=180.0) as client:
                    response = client.post(
                        url,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        files=files,
                        data=data,
                    )

            if response.status_code != 200:
                raise ProviderError(
                    self._provider,
                    "transcribe",
                    f"HTTP {response.status_code}: {response.text}",
                )

            result = response.json()

            # Parse segments if available
            segments: list[TranscriptionSegment] = []
            raw_segments = result.get("segments", [])
            for seg in raw_segments:
                segments.append(
                    TranscriptionSegment(
                        text=seg.get("text", "").strip(),
                        start=float(seg.get("start", 0)),
                        end=float(seg.get("end", 0)),
                    )
                )

            return TranscriptionResult(
                text=result.get("text", "").strip(),
                provider=self._provider,
                model=self._model,
                segments=segments,
                language=result.get("language"),
                duration_seconds=result.get("duration"),
            )

        except httpx.TimeoutException as e:
            raise TranscriptionError(f"Groq API timeout: {e}")
        except httpx.RequestError as e:
            raise TranscriptionError(f"Groq API request failed: {e}")
