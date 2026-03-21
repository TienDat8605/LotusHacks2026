"""Zilliz vector indexer adapter for assistant search documents."""

from __future__ import annotations

from typing import Any

from openai import OpenAI
from pymilvus import DataType, MilvusClient

from ..config import UGCConfig
from ..errors import IndexingError
from ..types import CharacteristicRow, IndexResult, TikTokDataRecord


VECTOR_DIM = 1536
VECTOR_FIELD = "embedding"


class ZillizVectorIndexer:
    """Vector indexer that writes review-style documents into Zilliz."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._uri = cfg.zilliz_uri
        self._token = cfg.zilliz_token
        self._db_name = cfg.zilliz_db_name
        self._collection = cfg.zilliz_collection
        self._openai_api_key = cfg.openai_api_key
        self._embed_model = cfg.openai_embedding_model
        self._client: MilvusClient | None = None
        self._openai: OpenAI | None = None

    def index_characteristic(
        self,
        row: CharacteristicRow,
        record: TikTokDataRecord | None = None,
    ) -> IndexResult:
        if not self._uri or not self._token:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="Zilliz is not configured",
            )
        if not self._openai_api_key:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="OPENAI_API_KEY is not configured for Zilliz embeddings",
            )
        if record is None:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="Dataset record is required for Zilliz indexing",
            )

        doc_id = str(record.video_id).strip()
        if not doc_id:
            return IndexResult(
                collection=self._collection,
                doc_id="",
                point_id="",
                indexed=False,
                error="video_id is required for Zilliz indexing",
            )

        search_text = self._build_search_text(record)
        if not search_text:
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=doc_id,
                indexed=False,
                error="search_text is empty",
            )

        try:
            embedding = self._embed(search_text)
            self._ensure_collection()
            self._client_or_raise().upsert(
                collection_name=self._collection,
                data=[
                    {
                        "id": doc_id[:128],
                        "poi_name": (record.poi_name or "")[:512],
                        "poi_address": (record.poi_address or "")[:2048],
                        "poi_city": (record.poi_city or "")[:512],
                        "summary": (record.characteristic_vi or "")[:8192],
                        "evidence": (record.evidence or "")[:8192],
                        "search_text": search_text[:16384],
                        "lat": self._parse_coordinate(record.lat),
                        "lng": self._parse_coordinate(record.lng),
                        "video_url": (record.video_url or "")[:2048],
                        "video_id": doc_id[:128],
                        VECTOR_FIELD: embedding,
                    }
                ],
            )
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=doc_id,
                indexed=True,
            )
        except Exception as e:
            return IndexResult(
                collection=self._collection,
                doc_id=doc_id,
                point_id=doc_id,
                indexed=False,
                error=f"Zilliz upsert failed: {e}",
            )

    def _build_search_text(self, record: TikTokDataRecord) -> str:
        parts = [
            record.poi_name.strip(),
            record.poi_address.strip(),
            record.poi_city.strip(),
            record.characteristic_vi.strip(),
            record.evidence.strip(),
        ]
        return "\n".join(part for part in parts if part)

    def _embed(self, text: str) -> list[float]:
        client = self._openai_or_raise()
        response = client.embeddings.create(model=self._embed_model, input=[text])
        if not response.data:
            raise IndexingError("No embedding data in OpenAI response")
        return list(response.data[0].embedding)

    def _parse_coordinate(self, raw: str) -> float:
        try:
            return float(raw)
        except (TypeError, ValueError):
            return 0.0

    def _ensure_collection(self) -> None:
        client = self._client_or_raise()
        if client.has_collection(collection_name=self._collection):
            return

        schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
        schema.add_field(field_name="id", datatype=DataType.VARCHAR, is_primary=True, max_length=128)
        schema.add_field(field_name="poi_name", datatype=DataType.VARCHAR, max_length=512)
        schema.add_field(field_name="poi_address", datatype=DataType.VARCHAR, max_length=2048)
        schema.add_field(field_name="poi_city", datatype=DataType.VARCHAR, max_length=512)
        schema.add_field(field_name="summary", datatype=DataType.VARCHAR, max_length=8192)
        schema.add_field(field_name="evidence", datatype=DataType.VARCHAR, max_length=8192)
        schema.add_field(field_name="search_text", datatype=DataType.VARCHAR, max_length=16384)
        schema.add_field(field_name="lat", datatype=DataType.DOUBLE)
        schema.add_field(field_name="lng", datatype=DataType.DOUBLE)
        schema.add_field(field_name="video_url", datatype=DataType.VARCHAR, max_length=2048)
        schema.add_field(field_name="video_id", datatype=DataType.VARCHAR, max_length=128)
        schema.add_field(field_name=VECTOR_FIELD, datatype=DataType.FLOAT_VECTOR, dim=VECTOR_DIM)

        index_params = client.prepare_index_params()
        index_params.add_index(field_name=VECTOR_FIELD, index_type="AUTOINDEX", metric_type="COSINE")

        client.create_collection(
            collection_name=self._collection,
            schema=schema,
            index_params=index_params,
        )

    def _client_or_raise(self) -> MilvusClient:
        if self._client is None:
            if not self._uri or not self._token:
                raise IndexingError("Zilliz is not configured")
            kwargs: dict[str, Any] = {"uri": self._uri, "token": self._token}
            if self._db_name:
                kwargs["db_name"] = self._db_name
            self._client = MilvusClient(**kwargs)
        return self._client

    def _openai_or_raise(self) -> OpenAI:
        if self._openai is None:
            if not self._openai_api_key:
                raise IndexingError("OPENAI_API_KEY is not configured")
            self._openai = OpenAI(api_key=self._openai_api_key)
        return self._openai
