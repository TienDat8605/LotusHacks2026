"""Mistral chat adapter for characteristic judgment/extraction."""

from __future__ import annotations

import json

import httpx

from ..config import UGCConfig
from ..errors import JudgeError, ProviderError
from ..types import JudgeResult, VideoMetadata


JUDGE_SYSTEM_PROMPT = """You are an expert at analyzing evidence about Points of Interest (POIs) in Vietnam.

Your task is to determine if the provided evidence contains genuine, useful characteristics about the specified POI.

A characteristic should describe:
- Atmosphere, vibe, or ambiance
- Food/drink quality or specialties
- Service quality
- Unique features or offerings
- Who the place is best suited for
- Best times to visit

Reject evidence that:
- Is generic and could apply to any business
- Contains promotional/advertising language without substance
- Is not relevant to the specified POI
- Contains inappropriate or offensive content

Respond with a JSON object:
{
  "accepted": true/false,
  "characteristic_vi": "Characteristic description in Vietnamese",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation of your decision",
  "evidence_quotes": ["Relevant quote 1", "Relevant quote 2"]
}

The characteristic_vi field should be a concise, useful description in Vietnamese that captures the essence of the POI based on the evidence."""


class MistralCharacteristicJudge:
    """Characteristic judgment using Mistral chat API."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._api_key = cfg.mistral_api_key
        self._model = cfg.judge_model
        self._provider = "mistral_chat"

    def judge(self, meta: VideoMetadata, evidence: str) -> JudgeResult:
        """Judge whether evidence contains valid POI characteristics.

        Args:
            meta: Video metadata including POI name, city.
            evidence: Combined text evidence from STT and OCR.

        Returns:
            JudgeResult with decision and extracted characteristic.

        Raises:
            JudgeError: If judgment fails.
        """
        if not self._api_key:
            raise JudgeError("MISTRAL_API_KEY is not configured")

        if not evidence.strip():
            return JudgeResult(
                accepted=False,
                characteristic_vi="",
                confidence=0.0,
                reason="No evidence provided",
                evidence_quotes=[],
            )

        user_prompt = self._build_user_prompt(meta, evidence)

        url = "https://api.mistral.ai/v1/chat/completions"

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 1000,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
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
                    "judge",
                    f"HTTP {response.status_code}: {response.text}",
                )

            result = response.json()
            choices = result.get("choices", [])
            if not choices:
                raise JudgeError("No response choices from Mistral judge API")

            content = choices[0].get("message", {}).get("content", "")
            return self._parse_response(content)

        except httpx.TimeoutException as e:
            raise JudgeError(f"Mistral judge API timeout: {e}")
        except httpx.RequestError as e:
            raise JudgeError(f"Mistral judge API request failed: {e}")

    def _build_user_prompt(self, meta: VideoMetadata, evidence: str) -> str:
        """Build the user prompt with POI context and evidence."""
        address_part = f"\nAddress: {meta.poi_address}" if meta.poi_address else ""
        return f"""POI Name: {meta.poi_name}
City: {meta.poi_city}{address_part}

Evidence from video:
---
{evidence[:4000]}
---

Analyze this evidence and determine if it contains valid characteristics for this POI."""

    def _parse_response(self, content: str) -> JudgeResult:
        """Parse the JSON response from the judge."""
        try:
            data = json.loads(content)
            return JudgeResult(
                accepted=bool(data.get("accepted", False)),
                characteristic_vi=str(data.get("characteristic_vi", "")),
                confidence=float(data.get("confidence", 0.0)),
                reason=str(data.get("reason", "")),
                evidence_quotes=list(data.get("evidence_quotes", [])),
            )
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            raise JudgeError(f"Failed to parse judge response: {e}")
