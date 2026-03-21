"""Interfaze OCR adapter for extracting text from sampled video frames."""

from __future__ import annotations

import base64
import json
import re
import subprocess
import tempfile
from pathlib import Path

import httpx

from ..config import UGCConfig
from ..errors import OcrError, ProviderError
from ..types import OcrResult
from .interfaze_common import build_api_url, extract_chat_text


class InterfazeOcrExtractor:
    """OCR text extraction using Interfaze vision/chat completions."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._api_key = cfg.interfaze_api_key
        self._model = cfg.ocr_model
        self._provider = "interfaze"
        self._frame_interval = cfg.ocr_frame_interval
        self._max_frames = cfg.ocr_max_frames
        self._url = build_api_url(cfg.interfaze_base_url, cfg.interfaze_chat_path)

    def extract(self, video_path: Path) -> OcrResult:
        """Extract text from video frames using Interfaze OCR."""
        if not self._api_key:
            raise OcrError("INTERFAZE_API_KEY is not configured")

        if not video_path.exists():
            raise OcrError(f"Video file not found: {video_path}")

        frame_paths = self._extract_frames(video_path)
        if not frame_paths:
            return OcrResult(
                text="",
                provider=self._provider,
                model=self._model,
                frame_count=0,
                frame_texts=[],
            )

        try:
            frame_texts: list[str] = []
            for frame_path in frame_paths:
                text = self._ocr_frame(frame_path)
                if text.strip():
                    frame_texts.append(text.strip())

            combined_text = "\n".join(dict.fromkeys(frame_texts))
            return OcrResult(
                text=combined_text,
                provider=self._provider,
                model=self._model,
                frame_count=len(frame_paths),
                frame_texts=frame_texts,
            )
        finally:
            for frame_path in frame_paths:
                if frame_path.exists():
                    frame_path.unlink()

    def _extract_frames(self, video_path: Path) -> list[Path]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            output_pattern = tmp_path / "frame_%03d.jpg"

            try:
                result = subprocess.run(
                    [
                        "ffmpeg",
                        "-i",
                        str(video_path),
                        "-vf",
                        f"fps=1/{self._frame_interval}",
                        "-frames:v",
                        str(self._max_frames),
                        "-q:v",
                        "2",
                        "-y",
                        str(output_pattern),
                    ],
                    capture_output=True,
                    timeout=120,
                    check=False,
                )
                if result.returncode != 0:
                    stderr = result.stderr.decode("utf-8", errors="replace")
                    raise OcrError(f"FFmpeg frame extraction failed: {stderr}")
            except FileNotFoundError:
                raise OcrError(
                    "FFmpeg not found. Please install ffmpeg for frame extraction."
                )
            except subprocess.TimeoutExpired:
                raise OcrError("Frame extraction timed out")

            frames = sorted(tmp_path.glob("frame_*.jpg"))
            persistent_frames: list[Path] = []
            for frame in frames:
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as persistent:
                    persistent.write(frame.read_bytes())
                    persistent_frames.append(Path(persistent.name))
            return persistent_frames

    def _ocr_frame(self, frame_path: Path) -> str:
        image_data = frame_path.read_bytes()
        base64_image = base64.b64encode(image_data).decode("utf-8")
        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract all visible text from this image. "
                                "Include signs, menus, labels, overlays, and captions. "
                                "Return only the extracted text. If no text is visible, return an empty response."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 1000,
            "temperature": 0,
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    self._url,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

            if response.status_code != 200:
                raise ProviderError(
                    self._provider,
                    "ocr",
                    f"HTTP {response.status_code}: {response.text}",
                )

            result = response.json()
            choices = result.get("choices", [])
            if not choices:
                return ""
            text = extract_chat_text(choices[0].get("message", {}).get("content", ""))
            return self._normalize_ocr_text(text)
        except httpx.TimeoutException as e:
            raise OcrError(f"Interfaze OCR timeout: {e}")
        except httpx.RequestError as e:
            raise OcrError(f"Interfaze OCR request failed: {e}")

    def _normalize_ocr_text(self, text: str) -> str:
        text = text.strip()
        if not text:
            return ""

        no_text_markers = {
            "I did not find any text in this image.",
            "No text found.",
        }
        if text in no_text_markers:
            return ""

        fenced_match = re.fullmatch(r"```json\s*(\{.*\})\s*```", text, re.DOTALL)
        if fenced_match:
            try:
                payload = json.loads(fenced_match.group(1))
                extracted = str(payload.get("extracted_text", "")).strip()
                return extracted
            except json.JSONDecodeError:
                return ""

        return text
