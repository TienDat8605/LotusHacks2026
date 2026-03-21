"""Mistral OCR adapter for text extraction from video frames."""

from __future__ import annotations

import base64
import subprocess
import tempfile
from pathlib import Path

import httpx

from ..config import UGCConfig
from ..errors import OcrError, ProviderError
from ..types import OcrResult


class MistralOcrExtractor:
    """OCR text extraction using Mistral's vision API."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._api_key = cfg.mistral_api_key
        self._model = cfg.ocr_model
        self._provider = "mistral_ocr"
        self._frame_interval = cfg.ocr_frame_interval
        self._max_frames = cfg.ocr_max_frames

    def extract(self, video_path: Path) -> OcrResult:
        """Extract text from video frames using OCR.

        Args:
            video_path: Path to the video file.

        Returns:
            OcrResult with extracted text from frames.

        Raises:
            OcrError: If OCR extraction fails.
        """
        if not self._api_key:
            raise OcrError("MISTRAL_API_KEY is not configured")

        if not video_path.exists():
            raise OcrError(f"Video file not found: {video_path}")

        # Extract frames from video
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
            # Process each frame with OCR
            frame_texts: list[str] = []
            for frame_path in frame_paths:
                text = self._ocr_frame(frame_path)
                if text.strip():
                    frame_texts.append(text.strip())

            # Combine unique texts
            combined_text = "\n".join(dict.fromkeys(frame_texts))

            return OcrResult(
                text=combined_text,
                provider=self._provider,
                model=self._model,
                frame_count=len(frame_paths),
                frame_texts=frame_texts,
            )
        finally:
            # Clean up temporary frame files
            for frame_path in frame_paths:
                if frame_path.exists():
                    frame_path.unlink()

    def _extract_frames(self, video_path: Path) -> list[Path]:
        """Extract frames from video at specified intervals."""
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
                        "2",  # High quality JPEG
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

            # Collect extracted frames and copy to persistent location
            frames = sorted(tmp_path.glob("frame_*.jpg"))
            persistent_frames: list[Path] = []
            for frame in frames:
                # Copy to a new temp file that won't be deleted with the directory
                with tempfile.NamedTemporaryFile(
                    suffix=".jpg", delete=False
                ) as persistent:
                    persistent.write(frame.read_bytes())
                    persistent_frames.append(Path(persistent.name))

            return persistent_frames

    def _ocr_frame(self, frame_path: Path) -> str:
        """Run OCR on a single frame using Mistral vision API."""
        # Read and base64 encode the image
        image_data = frame_path.read_bytes()
        base64_image = base64.b64encode(image_data).decode("utf-8")

        url = "https://api.mistral.ai/v1/chat/completions"

        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": f"data:image/jpeg;base64,{base64_image}",
                        },
                        {
                            "type": "text",
                            "text": (
                                "Extract all visible text from this image. "
                                "Include signs, labels, menus, and any other readable text. "
                                "Return only the extracted text, nothing else. "
                                "If no text is visible, return an empty response."
                            ),
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
                    url,
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
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""

        except httpx.TimeoutException as e:
            raise OcrError(f"Mistral OCR API timeout: {e}")
        except httpx.RequestError as e:
            raise OcrError(f"Mistral OCR API request failed: {e}")
