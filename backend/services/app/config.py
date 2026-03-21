from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _load_env() -> None:
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / ".env",
        here.parents[0] / ".env",
        here.parents[1] / ".env",
        here.parents[2] / ".env",
        here.parents[3] / ".env",
    ]
    seen: set[Path] = set()
    for candidate in candidates:
        path = candidate.resolve()
        if path in seen or not path.exists():
            continue
        load_dotenv(path, override=False)
        seen.add(path)


def _optional(name: str) -> str | None:
    raw = os.getenv(name)
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def _optional_from_file(name: str) -> str | None:
    file_path = _optional(f"{name}_FILE")
    if not file_path:
        return None
    try:
        content = Path(file_path).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return content or None


def _optional_secret(name: str) -> str | None:
    direct = _optional(name)
    if direct:
        return direct
    return _optional_from_file(name)


def _optional_any(*names: str) -> str | None:
    for name in names:
        value = _optional_secret(name)
        if value:
            return value
    return None


@dataclass(frozen=True)
class Settings:
    openai_api_key: str | None
    openai_chat_model: str
    openai_embedding_model: str
    review_data_path: Path
    embedded_review_path: Path
    zilliz_uri: str | None
    zilliz_token: str | None
    zilliz_db_name: str | None
    zilliz_collection: str
    zilliz_top_k: int
    host: str
    port: int
    cors_origins: list[str]

    @classmethod
    def from_env(cls) -> "Settings":
        _load_env()
        service_dir = Path(__file__).resolve().parents[1]
        review_data = os.getenv("AI_REVIEW_DATA_PATH", "../../data/data.json")
        embedded_path = os.getenv("AI_EMBEDDED_REVIEW_PATH", "../../data/review_embeddings.json")
        cors_raw = os.getenv("AI_CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
        cors_origins = [part.strip() for part in cors_raw.split(",") if part.strip()]

        return cls(
            openai_api_key=_optional_any("OPENAI_API_KEY", "OPENAI_KEY", "OPENAI_APIKEY"),
            openai_chat_model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
            openai_embedding_model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            review_data_path=(service_dir / review_data).resolve(),
            embedded_review_path=(service_dir / embedded_path).resolve(),
            zilliz_uri=_optional_secret("ZILLIZ_URI"),
            zilliz_token=_optional_secret("ZILLIZ_TOKEN"),
            zilliz_db_name=_optional("ZILLIZ_DB_NAME"),
            zilliz_collection=os.getenv("AI_ZILLIZ_COLLECTION", "review_embeddings"),
            zilliz_top_k=max(1, int(os.getenv("AI_ZILLIZ_TOP_K", "5"))),
            host=os.getenv("AI_SERVICE_HOST", "0.0.0.0"),
            port=int(os.getenv("AI_SERVICE_PORT", "8090")),
            cors_origins=cors_origins,
        )
