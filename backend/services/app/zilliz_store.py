from __future__ import annotations

from typing import Any

from pymilvus import DataType, MilvusClient

from .schemas import EmbeddedReviewDocument, RetrievedReview


VECTOR_DIM = 1536
VECTOR_FIELD = "embedding"


class ZillizStore:
    def __init__(self, uri: str, token: str, collection_name: str, db_name: str | None = None) -> None:
        kwargs: dict[str, Any] = {"uri": uri, "token": token}
        if db_name:
            kwargs["db_name"] = db_name
        self._client = MilvusClient(**kwargs)
        self._collection_name = collection_name

    def ensure_collection(self) -> None:
        if self._client.has_collection(collection_name=self._collection_name):
            return

        schema = self._client.create_schema(auto_id=False, enable_dynamic_field=False)
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

        index_params = self._client.prepare_index_params()
        index_params.add_index(field_name=VECTOR_FIELD, index_type="AUTOINDEX", metric_type="COSINE")

        self._client.create_collection(
            collection_name=self._collection_name,
            schema=schema,
            index_params=index_params,
        )

    def upsert_documents(self, documents: list[EmbeddedReviewDocument], batch_size: int = 50) -> int:
        total = 0
        for start in range(0, len(documents), batch_size):
            chunk = documents[start : start + batch_size]
            rows = [self._to_row(doc) for doc in chunk]
            self._client.upsert(collection_name=self._collection_name, data=rows)
            total += len(chunk)
        return total

    def search(self, query_embedding: list[float], top_k: int) -> list[RetrievedReview]:
        raw = self._client.search(
            collection_name=self._collection_name,
            data=[query_embedding],
            anns_field=VECTOR_FIELD,
            limit=top_k,
            output_fields=[
                "poi_name",
                "poi_address",
                "poi_city",
                "summary",
                "evidence",
                "lat",
                "lng",
                "video_url",
                "video_id",
            ],
        )

        hits = raw[0] if raw else []
        results: list[RetrievedReview] = []
        for hit in hits:
            entity = hit.get("entity", {})
            results.append(
                RetrievedReview.model_validate(
                    {
                        "poi": {
                            "id": str(hit.get("id")),
                            "name": entity.get("poi_name"),
                            "location": {
                                "lat": entity.get("lat"),
                                "lng": entity.get("lng"),
                            },
                            "address": entity.get("poi_address") or None,
                            "city": entity.get("poi_city") or None,
                            "videoUrl": entity.get("video_url") or None,
                            "videoId": entity.get("video_id") or None,
                            "badges": ["Trending on TikTok"],
                        },
                        "summary": entity.get("summary") or "",
                        "evidence": entity.get("evidence") or "",
                        "score": hit.get("distance") or hit.get("score") or 0.0,
                    }
                )
            )
        return results

    def _to_row(self, document: EmbeddedReviewDocument) -> dict[str, Any]:
        return {
            "id": document.id,
            "poi_name": document.poi.name,
            "poi_address": document.poi.address or "",
            "poi_city": document.poi.city or "",
            "summary": document.summary or "",
            "evidence": document.evidence or "",
            "search_text": document.searchText,
            "lat": document.poi.location.lat,
            "lng": document.poi.location.lng,
            "video_url": document.poi.videoUrl or "",
            "video_id": document.poi.videoId or "",
            VECTOR_FIELD: document.embedding,
        }
