"""Interfaze adapters for STT, OCR, and structured extraction."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import httpx

from ..config import UGCConfig
from ..errors import JudgeError, OcrError, ProviderError, TranscriptionError
from ..types import (
    EvidenceItem,
    ExtractedEntity,
    ExtractedFact,
    JudgeResult,
    OcrResult,
    TranscriptionResult,
    TranscriptionSegment,
    VideoMetadata,
)

OCR_RESPONSE_SCHEMA = {
    "name": "ocr_frame_analysis",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "visible_text": {
                "type": "array",
                "items": {"type": "string"},
            },
            "visual_clues": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["visible_text", "visual_clues"],
    },
}

JUDGE_RESPONSE_SCHEMA = {
    "name": "ugc_location_analysis",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "accepted": {"type": "boolean"},
            "location_explicit": {"type": ["string", "null"]},
            "location_guess": {"type": ["string", "null"]},
            "description": {"type": "string"},
            "characteristic_vi": {"type": "string"},
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "entity_type": {"type": "string"},
                        "source": {"type": "string"},
                    },
                    "required": ["name", "entity_type", "source"],
                },
            },
            "facts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "claim": {"type": "string"},
                        "source": {"type": "string"},
                    },
                    "required": ["claim", "source"],
                },
            },
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "source": {"type": "string"},
                        "kind": {"type": "string"},
                        "detail": {"type": "string"},
                        "quote": {"type": ["string", "null"]},
                    },
                    "required": ["source", "kind", "detail", "quote"],
                },
            },
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
            "evidence_quotes": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "accepted",
            "location_explicit",
            "location_guess",
            "description",
            "characteristic_vi",
            "entities",
            "facts",
            "evidence",
            "confidence",
            "reason",
            "evidence_quotes",
        ],
    },
}

OCR_SYSTEM_PROMPT = """You analyze a single video frame for place evidence.

Extract:
- all visible text exactly as shown
- short visual clues that help identify the place or setting

Rules:
- return JSON only
- do not guess a location unless it is shown explicitly
- keep visual clues short and concrete
"""

JUDGE_SYSTEM_PROMPT = """You analyze UGC evidence about a place.

Return strict JSON that separates what is explicit from what is inferred.

Rules:
- location_explicit: only locations that are directly stated in speech or visible text
- location_guess: your best guess from indirect clues; null if weak
- description: concise summary of what the video says about the place
- characteristic_vi: concise Vietnamese summary for indexing
- entities: named entities with their type and source
- facts: short factual statements grounded in the evidence
- evidence: explain why you believe the result; each item must cite speech, OCR, visual, or inference
- confidence: 0 to 1
- if evidence is weak, set accepted to false and keep uncertain fields null or minimal
- never mix guessed information into explicit fields
"""


class _InterfazeBase:
    def __init__(self, cfg: UGCConfig) -> None:
        self._api_key = cfg.interfaze_api_key
        self._base_url = cfg.interfaze_base_url

    def _auth_headers(self) -> dict[str, str]:
        if not self._api_key:
            raise ProviderError("interfaze", "auth", "INTERFAZE_API_KEY is not configured")
        return {"Authorization": f"Bearer {self._api_key}"}

    def _post_chat_completion(self, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
        url = f"{self._base_url}/chat/completions"

        try:
            with httpx.Client(timeout=timeout) as client:
                headers = {
                    **self._auth_headers(),
                    "Content-Type": "application/json",
                }
                response = client.post(url, headers=headers, json=payload)
                if (
                    response.status_code >= 400
                    and payload.get("response_format", {}).get("type") == "json_schema"
                ):
                    fallback_payload = json.loads(json.dumps(payload))
                    fallback_payload["response_format"] = {"type": "json_object"}
                    response = client.post(url, headers=headers, json=fallback_payload)
        except httpx.TimeoutException as exc:
            raise ProviderError("interfaze", "chat", f"timeout: {exc}")
        except httpx.RequestError as exc:
            raise ProviderError("interfaze", "chat", f"request failed: {exc}")

        if response.status_code != 200:
            raise ProviderError(
                "interfaze",
                "chat",
                f"HTTP {response.status_code}: {response.text}",
            )

        return response.json()

    def _extract_message_content(self, response_json: dict[str, Any]) -> str:
        choices = response_json.get("choices", [])
        if not choices:
            raise ProviderError("interfaze", "chat", "no response choices returned")

        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            text_parts: list[str] = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(str(part.get("text", "")))
            return "".join(text_parts)

        return str(content)

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ProviderError("interfaze", "json", f"invalid JSON response: {exc}")


class InterfazeTranscriber(_InterfazeBase):
    """Speech-to-text transcription using Interfaze."""

    def __init__(self, cfg: UGCConfig) -> None:
        super().__init__(cfg)
        self._model = cfg.stt_model
        self._provider = "interfaze_stt"

    def transcribe(self, video_path: Path) -> TranscriptionResult:
        if not video_path.exists():
            raise TranscriptionError(f"Video file not found: {video_path}")

        audio_path = self._extract_audio(video_path)
        try:
            return self._call_api(audio_path)
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
                    "-y",
                    str(audio_path),
                ],
                capture_output=True,
                timeout=120,
                check=False,
            )
        except FileNotFoundError as exc:
            raise TranscriptionError(
                "FFmpeg not found. Please install ffmpeg for audio extraction."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise TranscriptionError("Audio extraction timed out") from exc

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace")
            raise TranscriptionError(f"FFmpeg audio extraction failed: {stderr}")

        return audio_path

    def _call_api(self, audio_path: Path) -> TranscriptionResult:
        url = f"{self._base_url}/audio/transcriptions"

        try:
            with audio_path.open("rb") as audio_file:
                with httpx.Client(timeout=180.0) as client:
                    response = client.post(
                        url,
                        headers=self._auth_headers(),
                        files={"file": (audio_path.name, audio_file, "audio/mpeg")},
                        data={
                            "model": self._model,
                            "response_format": "verbose_json",
                        },
                    )
        except httpx.TimeoutException as exc:
            raise TranscriptionError(f"Interfaze STT timeout: {exc}")
        except httpx.RequestError as exc:
            raise TranscriptionError(f"Interfaze STT request failed: {exc}")

        if response.status_code != 200:
            raise ProviderError(
                self._provider,
                "transcribe",
                f"HTTP {response.status_code}: {response.text}",
            )

        payload = response.json()
        segments: list[TranscriptionSegment] = []
        for item in payload.get("segments", []):
            segments.append(
                TranscriptionSegment(
                    text=str(item.get("text", "")).strip(),
                    start=float(item.get("start", 0)),
                    end=float(item.get("end", 0)),
                )
            )

        return TranscriptionResult(
            text=str(payload.get("text", "")).strip(),
            provider=self._provider,
            model=self._model,
            segments=segments,
            language=payload.get("language"),
            duration_seconds=payload.get("duration"),
        )


class InterfazeVisionOcrExtractor(_InterfazeBase):
    """OCR and visual clue extraction using Interfaze vision."""

    def __init__(self, cfg: UGCConfig) -> None:
        super().__init__(cfg)
        self._model = cfg.ocr_model
        self._provider = "interfaze_vision"
        self._frame_interval = cfg.ocr_frame_interval
        self._max_frames = cfg.ocr_max_frames

    def extract(self, video_path: Path) -> OcrResult:
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
                visual_clues=[],
            )

        try:
            frame_texts: list[str] = []
            visual_clues: list[str] = []

            for frame_path in frame_paths:
                frame_result = self._analyze_frame(frame_path)
                visible_text = [
                    str(item).strip()
                    for item in frame_result.get("visible_text", [])
                    if str(item).strip()
                ]
                clues = [
                    str(item).strip()
                    for item in frame_result.get("visual_clues", [])
                    if str(item).strip()
                ]

                if visible_text:
                    frame_texts.append("\n".join(visible_text))
                visual_clues.extend(clues)

            combined_text = "\n".join(dict.fromkeys(frame_texts))
            deduped_clues = list(dict.fromkeys(visual_clues))

            return OcrResult(
                text=combined_text,
                provider=self._provider,
                model=self._model,
                frame_count=len(frame_paths),
                frame_texts=frame_texts,
                visual_clues=deduped_clues,
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
            except FileNotFoundError as exc:
                raise OcrError(
                    "FFmpeg not found. Please install ffmpeg for frame extraction."
                ) from exc
            except subprocess.TimeoutExpired as exc:
                raise OcrError("Frame extraction timed out") from exc

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")
                raise OcrError(f"FFmpeg frame extraction failed: {stderr}")

            frames = sorted(tmp_path.glob("frame_*.jpg"))
            persistent_frames: list[Path] = []
            for frame in frames:
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as persistent:
                    persistent.write(frame.read_bytes())
                    persistent_frames.append(Path(persistent.name))

            return persistent_frames

    def _analyze_frame(self, frame_path: Path) -> dict[str, Any]:
        base64_image = base64.b64encode(frame_path.read_bytes()).decode("utf-8")
        payload = {
            "model": self._model,
            "temperature": 0,
            "max_tokens": 600,
            "response_format": {
                "type": "json_schema",
                "json_schema": OCR_RESPONSE_SCHEMA,
            },
            "messages": [
                {"role": "system", "content": OCR_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract visible text and place-identifying visual clues "
                                "from this frame. If there is no text, return an empty "
                                "visible_text array."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                            },
                        },
                    ],
                },
            ],
        }

        try:
            response_json = self._post_chat_completion(payload, timeout=90.0)
            return self._parse_json_content(self._extract_message_content(response_json))
        except ProviderError as exc:
            raise OcrError(str(exc)) from exc


class InterfazeStructuredJudge(_InterfazeBase):
    """Evidence-first structured extraction using Interfaze."""

    def __init__(self, cfg: UGCConfig) -> None:
        super().__init__(cfg)
        self._model = cfg.judge_model
        self._provider = "interfaze_structured"

    def judge(self, meta: VideoMetadata, evidence: str) -> JudgeResult:
        if not evidence.strip():
            return JudgeResult(
                accepted=False,
                characteristic_vi="",
                confidence=0.0,
                reason="No evidence provided",
                evidence_quotes=[],
                description="",
            )

        payload = {
            "model": self._model,
            "temperature": 0,
            "max_tokens": 1600,
            "response_format": {
                "type": "json_schema",
                "json_schema": JUDGE_RESPONSE_SCHEMA,
            },
            "messages": [
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": self._build_user_prompt(meta, evidence)},
            ],
        }

        try:
            response_json = self._post_chat_completion(payload, timeout=120.0)
            response_data = self._parse_json_content(
                self._extract_message_content(response_json)
            )
        except ProviderError as exc:
            raise JudgeError(str(exc)) from exc

        return self._parse_response(response_data)

    def _build_user_prompt(self, meta: VideoMetadata, evidence: str) -> str:
        address_part = f"\nPOI address: {meta.poi_address}" if meta.poi_address else ""
        return (
            f"POI name: {meta.poi_name}\n"
            f"POI city: {meta.poi_city}{address_part}\n\n"
            "Analyze the following evidence from a user-uploaded video.\n"
            "Use the POI metadata only as context, not as direct evidence.\n"
            "If the video does not explicitly mention the location, keep "
            "location_explicit as null.\n\n"
            f"{evidence[:16000]}"
        )

    def _parse_response(self, data: dict[str, Any]) -> JudgeResult:
        entities: list[ExtractedEntity] = []
        for item in data.get("entities", []):
            if not isinstance(item, dict):
                continue
            entities.append(
                ExtractedEntity(
                    name=str(item.get("name", "")).strip(),
                    entity_type=str(item.get("entity_type", "")).strip(),
                    source=str(item.get("source", "")).strip() or "unknown",
                )
            )

        facts: list[ExtractedFact] = []
        for item in data.get("facts", []):
            if not isinstance(item, dict):
                continue
            facts.append(
                ExtractedFact(
                    claim=str(item.get("claim", "")).strip(),
                    source=str(item.get("source", "")).strip() or "unknown",
                )
            )

        evidence_items: list[EvidenceItem] = []
        for item in data.get("evidence", []):
            if not isinstance(item, dict):
                continue
            evidence_items.append(
                EvidenceItem(
                    source=str(item.get("source", "")).strip() or "unknown",
                    kind=str(item.get("kind", "")).strip() or "support",
                    detail=str(item.get("detail", "")).strip(),
                    quote=(
                        str(item.get("quote")).strip()
                        if item.get("quote") is not None
                        else None
                    ),
                )
            )

        description = str(data.get("description", "")).strip()
        characteristic_vi = str(data.get("characteristic_vi", "")).strip() or description

        return JudgeResult(
            accepted=bool(data.get("accepted", False)),
            characteristic_vi=characteristic_vi,
            confidence=max(0.0, min(1.0, float(data.get("confidence", 0.0)))),
            reason=str(data.get("reason", "")).strip(),
            evidence_quotes=[
                str(item).strip()
                for item in data.get("evidence_quotes", [])
                if str(item).strip()
            ],
            location_explicit=(
                str(data.get("location_explicit")).strip()
                if data.get("location_explicit") is not None
                and str(data.get("location_explicit")).strip()
                else None
            ),
            location_guess=(
                str(data.get("location_guess")).strip()
                if data.get("location_guess") is not None
                and str(data.get("location_guess")).strip()
                else None
            ),
            description=description,
            entities=entities,
            facts=facts,
            evidence=evidence_items,
        )
