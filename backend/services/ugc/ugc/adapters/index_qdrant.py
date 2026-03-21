"""Qdrant vector indexer adapter."""

from __future__ import annotations

import hashlib
import re
import uuid

import httpx
from openai import OpenAI

from ..config import UGCConfig
from ..errors import IndexingError
from ..types import CharacteristicRow, IndexResult, TikTokDataRecord


def _normalize_whitespace(value: str) -> str:
    """Normalize whitespace in a string."""
    return re.sub(r"\s+", " ", value).strip()


def _deterministic_doc_id(
    video_id: str,
    poi: str,
    city: str,
    chunk_text: str,
    chunk_index: int,
) -> str:
    """Create deterministic document ID (consistent with existing indexer)."""
    canonical = "|".join(
        [
            _normalize_whitespace(video_id).lower(),
            _normalize_whitespace(poi).lower(),
            _normalize_whitespace(city).lower(),
            str(chunk_index),
            _normalize_whitespace(chunk_text).lower(),
        ],
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _deterministic_point_id(doc_id: str) -> str:
    """Convert doc_id to Qdrant-compatible UUID."""
    normalized = _normalize_whitespace(str(doc_id)).lower()
    if not normalized:
        raise ValueError("doc_id is required")
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"vibemap:{normalized}"))


class QdrantVectorIndexer:
    """Vector indexer using Qdrant for storage."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._qdrant_url = cfg.qdrant_url
        self._qdrant_api_key = cfg.qdrant_api_key
        self._collection = cfg.index_collection
        self._embed_provider = cfg.embed_provider
        self._openai_api_key = cfg.openai_api_key
        self._mistral_api_key = cfg.mistral_api_key
        self._embed_model = cfg.embed_model

    def index_characteristic(
        self,
        row: CharacteristicRow,
        record: TikTokDataRecord | None = None,
    ) -> IndexResult:
        """Index a characteristic row into Qdrant.

        Args:
            row: The characteristic row to index.

        Returns:
            IndexResult with indexing status.

        Raises:
            IndexingError: If indexing fails.
        """
        if self._embed_provider == "disabled":
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error=None,
            )

        # Parse the characteristic format to extract fields
        fields = self._parse_characteristic_fields(row.characteristic)
        if not fields:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="Could not parse characteristic fields",
            )

        poi = fields.get("poi", "")
        city = fields.get("city", "")
        characteristic_vi = fields.get("characteristic_vi", "")

        if not poi or not characteristic_vi:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="Missing required fields: poi or characteristic_vi",
            )

        confidence = self._parse_confidence(fields.get("confidence", "0"))
        evidence = fields.get("evidence", "")

        # Create document content (matching existing indexer format)
        content_parts = [
            f"POI: {poi}",
            f"City: {city or 'unknown'}",
            f"Video ID: {row.video_id}",
            f"Confidence: {confidence:.2f}",
            f"Characteristic: {characteristic_vi}",
        ]
        if evidence:
            content_parts.append(f"Evidence: {evidence[:600]}")

        page_content = "\n".join(content_parts)

        # Create document ID
        doc_id = _deterministic_doc_id(
            video_id=row.video_id,
            poi=poi,
            city=city,
            chunk_text=characteristic_vi,
            chunk_index=0,
        )
        point_id = _deterministic_point_id(doc_id)

        # Get embedding
        try:
            embedding = self._get_embedding(page_content)
        except Exception as e:
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=point_id,
                indexed=False,
                error=f"Embedding failed: {e}",
            )

        # Prepare metadata
        metadata = {
            "doc_id": doc_id,
            "source": row.source,
            "video_id": row.video_id,
            "pipeline_version": row.pipeline_version,
            "poi": poi,
            "city": city,
            "confidence": confidence,
            "evidence_excerpt": evidence[:600] if evidence else "",
            "chunk_index": 0,
            "chunk_total": 1,
            "user_id": row.user_id or "",
            "upload_id": row.upload_id or "",
            "provider_map": row.provider_map,
            "created_at": row.created_at or "",
        }

        # Upsert to Qdrant
        try:
            self._upsert_point(point_id, embedding, page_content, metadata)
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=point_id,
                indexed=True,
            )
        except Exception as e:
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=point_id,
                indexed=False,
                error=f"Qdrant upsert failed: {e}",
            )

    def _parse_characteristic_fields(self, characteristic: str) -> dict[str, str]:
        """Parse the k=v ; k=v format characteristic string."""
        if not characteristic:
            return {}

        pattern = re.compile(r"([a-zA-Z_]+)\s*=\s*(.*?)(?=\s+;\s+[a-zA-Z_]+\s*=|$)")
        out: dict[str, str] = {}
        for key, value in pattern.findall(characteristic):
            key = key.strip().lower()
            value = value.strip()
            if key and value:
                out[key] = value
        return out

    def _parse_confidence(self, value: str) -> float:
        """Parse confidence value to float."""
        try:
            return float(value)
        except ValueError:
            return 0.0

    def _get_embedding(self, text: str) -> list[float]:
        """Get embedding from the configured provider."""
        if self._embed_provider == "openai_embed":
            if not self._openai_api_key:
                raise IndexingError("OPENAI_API_KEY is not configured for embeddings")
            client = OpenAI(api_key=self._openai_api_key)
            response = client.embeddings.create(model=self._embed_model, input=[text])
            if not response.data:
                raise IndexingError("No embedding data in OpenAI response")
            return list(response.data[0].embedding)

        if self._embed_provider != "mistral_embed":
            raise IndexingError(f"Unsupported embed provider: {self._embed_provider}")

        if not self._mistral_api_key:
            raise IndexingError("MISTRAL_API_KEY is not configured for embeddings")

        url = "https://api.mistral.ai/v1/embeddings"

        payload = {
            "model": self._embed_model,
            "input": [text],
        }

        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {self._mistral_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code != 200:
            raise IndexingError(
                f"Mistral embedding failed: HTTP {response.status_code}"
            )

        result = response.json()
        data = result.get("data", [])
        if not data:
            raise IndexingError("No embedding data in response")

        return data[0].get("embedding", [])

    def _upsert_point(
        self,
        point_id: str,
        vector: list[float],
        page_content: str,
        metadata: dict,
    ) -> None:
        """Upsert a point to Qdrant."""
        url = f"{self._qdrant_url}/collections/{self._collection}/points"

        headers = {"Content-Type": "application/json"}
        if self._qdrant_api_key:
            headers["api-key"] = self._qdrant_api_key

        payload = {
            "points": [
                {
                    "id": point_id,
                    "vector": vector,
                    "payload": {
                        "page_content": page_content,
                        "metadata": metadata,
                    },
                }
            ]
        }

        with httpx.Client(timeout=30.0) as client:
            response = client.put(
                url,
                headers=headers,
                json=payload,
                params={"wait": "true"},
            )

        if response.status_code not in (200, 201):
            raise IndexingError(
                f"Qdrant upsert failed: HTTP {response.status_code}: {response.text}"
            )
