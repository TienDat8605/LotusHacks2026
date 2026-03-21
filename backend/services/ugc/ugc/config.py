"""Configuration for UGC module with environment-driven provider/model switches.

This configuration surface allows swapping providers and models via environment
variables without changing orchestration logic.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

try:
    from dotenv import load_dotenv
except ImportError:

    def load_dotenv(*_args, **_kwargs):  # type: ignore[no-redef]
        return False


# Default provider/model selections
DEFAULT_STT_PROVIDER = "interfaze_stt"
DEFAULT_STT_MODEL = "interfaze-beta"
DEFAULT_STT_FALLBACK_PROVIDER = "disabled"
DEFAULT_STT_FALLBACK_MODEL = "whisper-large-v3-turbo"
DEFAULT_OCR_PROVIDER = "disabled"
DEFAULT_OCR_MODEL = "interfaze-beta"
DEFAULT_JUDGE_PROVIDER = "interfaze_chat"
DEFAULT_JUDGE_MODEL = "interfaze-beta"
DEFAULT_EMBED_PROVIDER = "disabled"
DEFAULT_EMBED_MODEL = "disabled"
DEFAULT_INDEX_COLLECTION = "video_characteristics"
DEFAULT_ZILLIZ_COLLECTION = "review_embeddings"
DEFAULT_INTERFAZE_BASE_URL = "https://api.interfaze.ai/v1"
DEFAULT_INTERFAZE_AUDIO_PATH = "/audio/transcriptions"
DEFAULT_INTERFAZE_CHAT_PATH = "/chat/completions"

# Storage defaults
DEFAULT_STORAGE_PATH = "ugc_videos"
DEFAULT_JOBS_PATH = "ugc_jobs"
DEFAULT_DATASET_PATH = "data.json"
DEFAULT_MAX_VIDEO_SIZE_MB = 100
DEFAULT_ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

# Processing defaults
DEFAULT_OCR_FRAME_INTERVAL = 2.0  # Extract OCR every N seconds
DEFAULT_OCR_MAX_FRAMES = 10

# Pipeline version for JSONL compatibility
UGC_PIPELINE_VERSION = "ugc_v1"


def _optional_env(name: str) -> str | None:
    """Get optional env var, returning None if empty."""
    raw = os.getenv(name)
    if raw is None:
        return None
    cleaned = raw.strip()
    return cleaned or None


def _require_env(name: str, context: str = "") -> str:
    """Get required env var or raise ConfigurationError."""
    from .errors import ConfigurationError

    value = _optional_env(name)
    if not value:
        msg = f"Required environment variable {name} is not set"
        if context:
            msg += f" ({context})"
        raise ConfigurationError(msg)
    return value


def _find_repo_root(start: Path) -> Path | None:
    for p in [start, *start.parents]:
        if (p / "backend").is_dir() and (p / "frontend").is_dir() and (p / "data").is_dir():
            return p
    return None


def _repo_root() -> Path:
    override = _optional_env("UGC_REPO_ROOT")
    if override:
        return Path(override).expanduser().resolve()

    here = Path(__file__).resolve().parent
    found = _find_repo_root(here)
    if found:
        return found

    cwd = Path.cwd().resolve()
    found = _find_repo_root(cwd)
    return found or cwd


def _load_env_file(env_file: Path | None) -> None:
    """Load environment from file, defaulting to project root .env."""
    if env_file:
        load_dotenv(env_file)
        return
    services_env = Path(__file__).resolve().parents[2] / ".env"
    backend_env = Path(__file__).resolve().parents[3] / ".env"
    root_env = _repo_root() / ".env"
    load_dotenv(services_env)
    load_dotenv(backend_env)
    load_dotenv(root_env)


def _resolve_service_path(raw_path: str, services_dir: Path) -> Path:
    """Resolve a possibly-relative service path against the services directory."""
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (services_dir / path).resolve()


@dataclass(frozen=True)
class UGCConfig:
    """Configuration for UGC video ingestion pipeline.

    All provider/model selections are driven by environment variables,
    allowing swaps without code changes.
    """

    # STT (Speech-to-Text) configuration
    stt_provider: Literal["interfaze_stt", "groq_whisper"]
    stt_model: str
    stt_fallback_provider: Literal["disabled", "interfaze_stt", "groq_whisper"]
    stt_fallback_model: str
    interfaze_api_key: str | None
    interfaze_base_url: str
    interfaze_audio_path: str
    interfaze_chat_path: str
    groq_api_key: str | None

    # OCR configuration
    ocr_provider: Literal["disabled", "interfaze_vision", "mistral_ocr"]
    ocr_model: str
    ocr_frame_interval: float
    ocr_max_frames: int

    # Judge/Extractor configuration
    judge_provider: Literal["interfaze_chat", "mistral_chat"]
    judge_model: str

    # Embedding configuration
    embed_provider: Literal["disabled", "openai_embed", "mistral_embed"]
    embed_model: str
    openai_api_key: str | None
    openai_embedding_model: str

    # Shared Mistral API key (for OCR, judge, embed)
    mistral_api_key: str | None

    # Vector storage configuration
    index_collection: str
    zilliz_uri: str | None
    zilliz_token: str | None
    zilliz_db_name: str | None
    zilliz_collection: str
    qdrant_url: str
    qdrant_api_key: str | None

    # File storage configuration
    storage_path: Path
    jobs_path: Path
    dataset_path: Path
    max_video_size_bytes: int
    allowed_video_types: list[str]
    ors_api_key: str | None
    vietmap_api_key: str | None

    # Pipeline metadata
    pipeline_version: str

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "UGCConfig":
        """Load configuration from environment variables.

        Environment Variables:
            UGC_STT_PROVIDER: STT provider (default: interfaze_stt)
            UGC_STT_MODEL: STT model (default: interfaze-beta)
            UGC_STT_FALLBACK_PROVIDER: Optional fallback STT provider (default: disabled)
            UGC_STT_FALLBACK_MODEL: Optional fallback STT model
            UGC_OCR_PROVIDER: OCR provider (default: disabled)
            UGC_OCR_MODEL: OCR model (default: interfaze-beta)
            UGC_JUDGE_PROVIDER: Judge provider (default: interfaze_chat)
            UGC_JUDGE_MODEL: Judge model (default: interfaze-beta)
            UGC_EMBED_PROVIDER: Embed provider (default: disabled)
            UGC_EMBED_MODEL: Embed model (default: disabled)
            OPENAI_API_KEY: OpenAI API key for optional embeddings
            OPENAI_EMBEDDING_MODEL: OpenAI embedding model for Zilliz/optional embeddings
            UGC_INDEX_COLLECTION: Qdrant collection (default: video_characteristics)
            ZILLIZ_URI: Zilliz endpoint URI
            ZILLIZ_TOKEN: Zilliz auth token
            ZILLIZ_DB_NAME: Zilliz database name (optional)
            AI_ZILLIZ_COLLECTION: Zilliz collection (default: review_embeddings)
            UGC_STORAGE_PATH: Video storage directory
            UGC_JOBS_PATH: Jobs data directory
            UGC_MAX_VIDEO_SIZE_MB: Max video size in MB (default: 100)
            INTERFAZE_API_KEY: Interfaze API key for STT/OCR/judge
            INTERFAZE_BASE_URL: Interfaze OpenAI-compatible base URL
            INTERFAZE_AUDIO_PATH: Audio transcription endpoint path
            INTERFAZE_CHAT_PATH: Chat completion endpoint path
            GROQ_API_KEY: Groq API key for legacy STT
            MISTRAL_API_KEY: Mistral API key for OCR/judge/embed
            QDRANT_URL: Qdrant server URL
            QDRANT_API_KEY: Qdrant API key (optional)
            ORS_API_KEY: OpenRouteService key for geocoding
            VIETMAP_API_KEY: Vietmap key for geocoding
        """
        _load_env_file(env_file)

        # Compute storage paths relative to project root
        project_root = _repo_root()
        storage_base = project_root / "data"
        services_dir = Path(__file__).resolve().parents[2]

        storage_path = _resolve_service_path(
            os.getenv("UGC_STORAGE_PATH", str(storage_base / DEFAULT_STORAGE_PATH)),
            services_dir,
        )
        jobs_path = _resolve_service_path(
            os.getenv("UGC_JOBS_PATH", str(storage_base / DEFAULT_JOBS_PATH)),
            services_dir,
        )
        dataset_path = _resolve_service_path(
            os.getenv("UGC_DATASET_PATH", str(storage_base / DEFAULT_DATASET_PATH)),
            services_dir,
        )

        max_size_mb = int(os.getenv("UGC_MAX_VIDEO_SIZE_MB", DEFAULT_MAX_VIDEO_SIZE_MB))
        max_size_bytes = max_size_mb * 1024 * 1024

        allowed_types_raw = os.getenv("UGC_ALLOWED_VIDEO_TYPES", "")
        if allowed_types_raw.strip():
            allowed_types = [t.strip() for t in allowed_types_raw.split(",")]
        else:
            allowed_types = list(DEFAULT_ALLOWED_VIDEO_TYPES)

        return cls(
            # STT
            stt_provider=os.getenv("UGC_STT_PROVIDER", DEFAULT_STT_PROVIDER),  # type: ignore
            stt_model=os.getenv("UGC_STT_MODEL", DEFAULT_STT_MODEL),
            stt_fallback_provider=os.getenv(
                "UGC_STT_FALLBACK_PROVIDER",
                DEFAULT_STT_FALLBACK_PROVIDER,
            ),  # type: ignore
            stt_fallback_model=os.getenv(
                "UGC_STT_FALLBACK_MODEL",
                DEFAULT_STT_FALLBACK_MODEL,
            ),
            interfaze_api_key=_optional_env("INTERFAZE_API_KEY"),
            interfaze_base_url=os.getenv("INTERFAZE_BASE_URL", DEFAULT_INTERFAZE_BASE_URL),
            interfaze_audio_path=os.getenv(
                "INTERFAZE_AUDIO_PATH",
                DEFAULT_INTERFAZE_AUDIO_PATH,
            ),
            interfaze_chat_path=os.getenv(
                "INTERFAZE_CHAT_PATH",
                DEFAULT_INTERFAZE_CHAT_PATH,
            ),
            groq_api_key=_optional_env("GROQ_API_KEY"),
            # OCR
            ocr_provider=os.getenv("UGC_OCR_PROVIDER", DEFAULT_OCR_PROVIDER),  # type: ignore
            ocr_model=os.getenv("UGC_OCR_MODEL", DEFAULT_OCR_MODEL),
            ocr_frame_interval=float(
                os.getenv("UGC_OCR_FRAME_INTERVAL", DEFAULT_OCR_FRAME_INTERVAL)
            ),
            ocr_max_frames=int(
                os.getenv("UGC_OCR_MAX_FRAMES", DEFAULT_OCR_MAX_FRAMES)
            ),
            # Judge
            judge_provider=os.getenv("UGC_JUDGE_PROVIDER", DEFAULT_JUDGE_PROVIDER),  # type: ignore
            judge_model=os.getenv("UGC_JUDGE_MODEL", DEFAULT_JUDGE_MODEL),
            # Embed
            embed_provider=os.getenv("UGC_EMBED_PROVIDER", DEFAULT_EMBED_PROVIDER),  # type: ignore
            embed_model=os.getenv("UGC_EMBED_MODEL", DEFAULT_EMBED_MODEL),
            openai_api_key=_optional_env("OPENAI_API_KEY"),
            openai_embedding_model=os.getenv(
                "OPENAI_EMBEDDING_MODEL",
                "text-embedding-3-small",
            ),
            # Mistral shared key
            mistral_api_key=_optional_env("MISTRAL_API_KEY"),
            # Vector storage
            index_collection=os.getenv("UGC_INDEX_COLLECTION", DEFAULT_INDEX_COLLECTION),
            zilliz_uri=_optional_env("ZILLIZ_URI"),
            zilliz_token=_optional_env("ZILLIZ_TOKEN"),
            zilliz_db_name=_optional_env("ZILLIZ_DB_NAME"),
            zilliz_collection=os.getenv("AI_ZILLIZ_COLLECTION", DEFAULT_ZILLIZ_COLLECTION),
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            qdrant_api_key=_optional_env("QDRANT_API_KEY"),
            # File storage
            storage_path=storage_path,
            jobs_path=jobs_path,
            dataset_path=dataset_path,
            max_video_size_bytes=max_size_bytes,
            allowed_video_types=allowed_types,
            ors_api_key=_optional_env("ORS_API_KEY"),
            vietmap_api_key=_optional_env("VIETMAP_API_KEY"),
            # Pipeline
            pipeline_version=UGC_PIPELINE_VERSION,
        )

    def validate_for_processing(self) -> list[str]:
        """Validate configuration has all required values for processing.

        Returns:
            List of validation error messages (empty if valid).
        """
        errors: list[str] = []

        if self.stt_provider == "interfaze_stt" and not self.interfaze_api_key:
            errors.append("INTERFAZE_API_KEY required for interfaze_stt provider")

        if self.stt_provider == "groq_whisper" and not self.groq_api_key:
            errors.append("GROQ_API_KEY required for groq_whisper STT provider")

        if self.stt_fallback_provider == "interfaze_stt" and not self.interfaze_api_key:
            errors.append("INTERFAZE_API_KEY required for interfaze_stt fallback provider")

        if self.stt_fallback_provider == "groq_whisper" and not self.groq_api_key:
            errors.append("GROQ_API_KEY required for groq_whisper fallback provider")

        if self.ocr_provider == "interfaze_vision" and not self.interfaze_api_key:
            errors.append("INTERFAZE_API_KEY required for interfaze_vision provider")

        if self.ocr_provider == "mistral_ocr" and not self.mistral_api_key:
            errors.append("MISTRAL_API_KEY required for mistral_ocr OCR provider")

        if self.judge_provider == "interfaze_chat" and not self.interfaze_api_key:
            errors.append("INTERFAZE_API_KEY required for interfaze_chat provider")

        if self.judge_provider == "mistral_chat" and not self.mistral_api_key:
            errors.append("MISTRAL_API_KEY required for mistral_chat judge provider")

        if self.embed_provider == "openai_embed" and not self.openai_api_key:
            errors.append("OPENAI_API_KEY required for openai_embed embed provider")

        if self.embed_provider == "mistral_embed" and not self.mistral_api_key:
            errors.append("MISTRAL_API_KEY required for mistral_embed embed provider")

        return errors

    def get_provider_map(self) -> dict[str, str]:
        """Get a map of component to provider/model string for tracing."""
        return {
            "stt": f"{self.stt_provider}:{self.stt_model}",
            "ocr": f"{self.ocr_provider}:{self.ocr_model}",
            "judge": f"{self.judge_provider}:{self.judge_model}",
            "embed": f"{self.embed_provider}:{self.embed_model}",
        }
