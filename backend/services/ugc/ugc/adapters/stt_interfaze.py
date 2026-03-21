"""Interfaze STT adapter using its OpenAI-compatible transcription API."""

from __future__ import annotations

import base64
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from ..config import UGCConfig
from ..errors import ProviderError, TranscriptionError
from ..types import TranscriptionResult, TranscriptionSegment
from .interfaze_common import build_api_url, extract_chat_text


class InterfazeSpeechTranscriber:
    """Speech-to-text transcription using Interfaze."""

    _chunk_seconds = 15
    _max_attempts = 3

    def __init__(self, cfg: UGCConfig, model: str | None = None) -> None:
        self._api_key = cfg.interfaze_api_key
        self._model = model or cfg.stt_model
        self._provider = "interfaze"
        self._url = build_api_url(cfg.interfaze_base_url, cfg.interfaze_chat_path)

    def transcribe(self, video_path: Path) -> TranscriptionResult:
        """Transcribe audio from a video file using Interfaze."""
        if not self._api_key:
            raise TranscriptionError("INTERFAZE_API_KEY is not configured")

        if not video_path.exists():
            raise TranscriptionError(f"Video file not found: {video_path}")

        audio_path = self._extract_audio(video_path)
        try:
            return self._transcribe_in_chunks(audio_path)
        finally:
            if audio_path.exists():
                audio_path.unlink()

    def _extract_audio(self, video_path: Path) -> Path:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            audio_path = Path(tmp.name)

        try:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-i",
                    str(video_path),
                    "-vn",
                    "-acodec",
                    "libmp3lame",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-b:a",
                    "32k",
                    "-y",
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

    def _transcribe_in_chunks(self, audio_path: Path) -> TranscriptionResult:
        chunk_paths = self._split_audio(audio_path)
        if not chunk_paths:
            chunk_paths = [audio_path]

        chunk_results: list[TranscriptionResult] = []
        errors: list[str] = []
        try:
            for index, chunk_path in enumerate(chunk_paths):
                offset_seconds = float(index * self._chunk_seconds)
                try:
                    chunk_results.append(
                        self._call_interfaze_chat_chunk(chunk_path, offset_seconds)
                    )
                except TranscriptionError as e:
                    errors.append(str(e))
        finally:
            for chunk_path in chunk_paths:
                if chunk_path != audio_path and chunk_path.exists():
                    chunk_path.unlink()

        if not chunk_results:
            raise TranscriptionError("; ".join(errors) or "Interfaze STT failed")

        all_segments: list[TranscriptionSegment] = []
        texts: list[str] = []
        language = None
        duration_seconds = 0.0
        for result in chunk_results:
            if result.text.strip():
                texts.append(result.text.strip())
            all_segments.extend(result.segments)
            if result.language and not language:
                language = result.language
            if result.duration_seconds:
                duration_seconds += float(result.duration_seconds)

        return TranscriptionResult(
            text="\n".join(texts).strip(),
            provider=self._provider,
            model=self._model,
            segments=all_segments,
            language=language,
            duration_seconds=duration_seconds or None,
        )

    def _split_audio(self, audio_path: Path) -> list[Path]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            output_pattern = tmp_path / "chunk_%03d.mp3"

            try:
                result = subprocess.run(
                    [
                        "ffmpeg",
                        "-i",
                        str(audio_path),
                        "-f",
                        "segment",
                        "-segment_time",
                        str(self._chunk_seconds),
                        "-c",
                        "copy",
                        "-y",
                        str(output_pattern),
                    ],
                    capture_output=True,
                    timeout=120,
                    check=False,
                )
                if result.returncode != 0:
                    return []
            except (FileNotFoundError, subprocess.TimeoutExpired):
                return []

            persistent_chunks: list[Path] = []
            for chunk in sorted(tmp_path.glob("chunk_*.mp3")):
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as persistent:
                    persistent.write(chunk.read_bytes())
                    persistent_chunks.append(Path(persistent.name))
            return persistent_chunks

    def _call_interfaze_chat_chunk(
        self,
        audio_path: Path,
        offset_seconds: float,
    ) -> TranscriptionResult:
        try:
            last_response_text = ""
            last_status = None
            for attempt in range(1, self._max_attempts + 1):
                payload = {
                    "model": self._model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": self._build_transcription_prompt(),
                                },
                                {
                                    "type": "file",
                                    "file": {
                                        "filename": audio_path.name,
                                        "file_data": self._build_file_data_url(audio_path),
                                    },
                                },
                            ],
                        }
                    ],
                    "temperature": 0.0,
                    "max_tokens": 4000,
                }

                with httpx.Client(timeout=180.0) as client:
                    response = client.post(
                        self._url,
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )

                if response.status_code == 200:
                    result = response.json()
                    choices = result.get("choices", [])
                    if not choices:
                        raise TranscriptionError(
                            "Interfaze STT returned no choices from chat completions"
                        )

                    message = choices[0].get("message", {})
                    text = extract_chat_text(message.get("content", "")).strip()
                    if not text:
                        raise TranscriptionError(
                            "Interfaze STT returned an empty transcript from chat completions"
                        )

                    return TranscriptionResult(
                        text=text,
                        provider=self._provider,
                        model=self._model,
                        segments=[
                            TranscriptionSegment(
                                text=text,
                                start=offset_seconds,
                                end=offset_seconds + self._chunk_seconds,
                            )
                        ],
                        language=None,
                        duration_seconds=float(self._chunk_seconds),
                    )

                last_status = response.status_code
                last_response_text = self._summarize_http_error(response)
                if response.status_code < 500 and response.status_code != 522:
                    break
                if attempt < self._max_attempts:
                    time.sleep(1.5 * attempt)

            raise ProviderError(
                self._provider,
                "transcribe",
                f"HTTP {last_status}: {last_response_text}",
            )
        except httpx.TimeoutException as e:
            raise TranscriptionError(f"Interfaze STT timeout: {e}")
        except httpx.RequestError as e:
            raise TranscriptionError(f"Interfaze STT request failed: {e}")

    def _summarize_http_error(self, response: httpx.Response) -> str:
        content_type = response.headers.get("content-type", "")
        body = response.text.strip()
        lowered = body.lower()
        if "text/html" in content_type or lowered.startswith("<!doctype html") or "<html" in lowered:
            if response.status_code == 522:
                return "HTTP 522: Interfaze host timed out before completing transcription"
            return f"HTTP {response.status_code}: Interfaze returned an HTML error page"

        compact = " ".join(body.split())
        if len(compact) > 320:
            compact = f"{compact[:317]}..."
        return f"HTTP {response.status_code}: {compact}"

    def _build_file_data_url(self, audio_path: Path) -> str:
        audio_bytes = audio_path.read_bytes()
        encoded = base64.b64encode(audio_bytes).decode("ascii")
        return f"data:audio/mpeg;base64,{encoded}"

    def _build_transcription_prompt(self) -> str:
        return (
            "Transcribe this audio file. Return only the spoken transcript text. "
            "Preserve the original language. If the speech is Vietnamese, restore "
            "proper Vietnamese diacritics. Do not add markdown, labels, summaries, "
            "speaker names, timestamps, or explanations."
        )
