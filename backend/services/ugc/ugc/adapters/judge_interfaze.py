"""Interfaze chat adapter for characteristic extraction and validation."""

from __future__ import annotations

import json

import httpx

from ..config import UGCConfig
from ..errors import JudgeError, ProviderError
from ..types import JudgeResult, VideoMetadata
from .interfaze_common import build_api_url, extract_chat_text, normalize_json_payload


JUDGE_SYSTEM_PROMPT = """You analyze uploaded Vietnam POI videos and extract useful location context.

Return a JSON object with this exact shape:
{
  "accepted": true,
  "characteristic_vi": "Vietnamese summary of the place",
  "confidence": 0.0,
  "reason": "Why this was accepted or rejected",
  "evidence_quotes": ["Short supporting quote 1", "Short supporting quote 2"]
}

Rules:
- characteristic_vi must be in Vietnamese.
- Write natural Vietnamese with correct diacritics. Do not mix English into the summary unless it is a proper noun or brand name.
- Focus on concrete traits: vibe, food/drink, pricing, service, crowd, timing, or special features.
- Reject evidence that is too generic, too thin, or clearly unrelated to the POI.
- Keep evidence_quotes short and copied from the evidence when possible.
"""


class InterfazeCharacteristicJudge:
    """Characteristic judgment using Interfaze chat completions."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._api_key = cfg.interfaze_api_key
        self._model = cfg.judge_model
        self._provider = "interfaze"
        self._url = build_api_url(cfg.interfaze_base_url, cfg.interfaze_chat_path)

    def judge(self, meta: VideoMetadata, evidence: str) -> JudgeResult:
        """Judge whether evidence contains valid POI characteristics."""
        if not self._api_key:
            raise JudgeError("INTERFAZE_API_KEY is not configured")

        if not evidence.strip():
            return JudgeResult(
                accepted=False,
                characteristic_vi="",
                confidence=0.0,
                reason="No evidence provided",
                evidence_quotes=[],
            )

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": self._build_user_prompt(meta, evidence)},
            ],
            "max_tokens": 1000,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
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
                    "judge",
                    f"HTTP {response.status_code}: {response.text}",
                )

            result = response.json()
            choices = result.get("choices", [])
            if not choices:
                raise JudgeError("No response choices from Interfaze judge API")

            content = extract_chat_text(choices[0].get("message", {}).get("content", ""))
            return self._parse_response(content)
        except httpx.TimeoutException as e:
            raise JudgeError(f"Interfaze judge timeout: {e}")
        except httpx.RequestError as e:
            raise JudgeError(f"Interfaze judge request failed: {e}")

    def _build_user_prompt(self, meta: VideoMetadata, evidence: str) -> str:
        address_part = f"\nAddress: {meta.poi_address}" if meta.poi_address else ""
        short_description_part = (
            f"\nUploader description: {meta.short_description}"
            if meta.short_description
            else ""
        )
        atmosphere_part = (
            f"\nUploader atmosphere tags: {meta.atmosphere}"
            if meta.atmosphere
            else ""
        )
        return f"""POI Name: {meta.poi_name}
City: {meta.poi_city}{address_part}{short_description_part}{atmosphere_part}

Evidence from video:
---
{evidence[:5000]}
---

Analyze whether the evidence is strong enough and extract a concise Vietnamese summary of this POI."""

    def _parse_response(self, content: str) -> JudgeResult:
        try:
            data = json.loads(normalize_json_payload(content))
            return JudgeResult(
                accepted=bool(data.get("accepted", False)),
                characteristic_vi=str(data.get("characteristic_vi", "")),
                confidence=float(data.get("confidence", 0.0)),
                reason=str(data.get("reason", "")),
                evidence_quotes=[
                    str(item).strip()
                    for item in data.get("evidence_quotes", [])
                    if str(item).strip()
                ],
            )
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            raise JudgeError(f"Failed to parse Interfaze judge response: {e}")
