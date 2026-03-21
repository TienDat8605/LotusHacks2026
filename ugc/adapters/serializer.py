"""Default characteristic serializer adapter."""

from __future__ import annotations

from datetime import datetime, timezone

from ..config import UGC_PIPELINE_VERSION
from ..types import CharacteristicRow, JudgeResult, VideoMetadata


class DefaultCharacteristicSerializer:
    """Serializes characteristics to JSONL-compatible format.

    Produces rows compatible with the existing indexer format while
    adding UGC-specific metadata.
    """

    def serialize(
        self,
        video_id: str,
        meta: VideoMetadata,
        judge_result: JudgeResult,
        provider_map: dict[str, str],
    ) -> CharacteristicRow:
        """Serialize a characteristic judgment to JSONL-compatible row.

        The characteristic field uses the existing k=v ; k=v format for
        backward compatibility with parse_characteristic_fields.

        Args:
            video_id: The video identifier.
            meta: Video metadata.
            judge_result: The judge result containing characteristic text.
            provider_map: Map of component to provider/model used.

        Returns:
            CharacteristicRow ready for JSONL serialization.
        """
        # Build characteristic string in existing format: k=v ; k=v ; ...
        parts = [
            f"poi = {meta.poi_name}",
            f"city = {meta.poi_city}",
            f"characteristic_vi = {judge_result.characteristic_vi}",
            f"confidence = {judge_result.confidence:.2f}",
        ]

        if judge_result.evidence_quotes:
            evidence = " | ".join(judge_result.evidence_quotes[:3])
            parts.append(f"evidence = {evidence}")

        if meta.poi_address:
            parts.append(f"address = {meta.poi_address}")

        characteristic = " ; ".join(parts)

        return CharacteristicRow(
            video_id=video_id,
            characteristic=characteristic,
            pipeline_version=UGC_PIPELINE_VERSION,
            source="ugc",
            user_id=meta.user_id,
            upload_id=meta.upload_id,
            provider_map=provider_map,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
