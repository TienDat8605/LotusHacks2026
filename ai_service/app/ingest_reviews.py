from __future__ import annotations

import json
from pathlib import Path

from .config import Settings
from .openai_client import OpenAIService
from .reviews import load_review_documents
from .schemas import EmbeddedReviewDocument
from .zilliz_store import ZillizStore


def build_embedded_documents() -> list[EmbeddedReviewDocument]:
    settings = Settings.from_env()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for offline embedding generation")
    if not settings.zilliz_uri or not settings.zilliz_token:
        raise RuntimeError("ZILLIZ_URI and ZILLIZ_TOKEN are required for Zilliz upload")

    docs = load_review_documents(settings.review_data_path)
    openai_service = OpenAIService(
        api_key=settings.openai_api_key,
        embed_model=settings.openai_embedding_model,
        chat_model=settings.openai_chat_model,
    )

    embedded: list[EmbeddedReviewDocument] = []
    batch_size = 50
    for start in range(0, len(docs), batch_size):
        chunk = docs[start : start + batch_size]
        vectors = openai_service.embed_texts([doc.searchText for doc in chunk])
        for doc, vector in zip(chunk, vectors, strict=True):
            embedded.append(
                EmbeddedReviewDocument(
                    id=doc.id,
                    poi=doc.poi,
                    summary=doc.summary,
                    evidence=doc.evidence,
                    searchText=doc.searchText,
                    embeddingModel=openai_service.embed_model,
                    embedding=vector,
                )
            )

    settings.embedded_review_path.parent.mkdir(parents=True, exist_ok=True)
    payload = [doc.model_dump(mode="json") for doc in embedded]
    settings.embedded_review_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    zilliz = ZillizStore(
        uri=settings.zilliz_uri,
        token=settings.zilliz_token,
        collection_name=settings.zilliz_collection,
        db_name=settings.zilliz_db_name,
    )
    zilliz.ensure_collection()
    zilliz.upsert_documents(embedded)
    return embedded


def main() -> None:
    embedded = build_embedded_documents()
    print(f"Embedded and uploaded {len(embedded)} review documents.")


if __name__ == "__main__":
    main()
