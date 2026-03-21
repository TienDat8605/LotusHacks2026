"""Composition root for wiring UGC interfaces to adapter implementations.

This module is the single place where interfaces are bound to concrete
implementations based on configuration. Business logic depends only on
interfaces; provider binding happens here.
"""

from __future__ import annotations

from .adapters import (
    DefaultCharacteristicSerializer,
    FileSystemVideoStorage,
    GroqWhisperTranscriber,
    JsonJobRepository,
    MistralCharacteristicJudge,
    MistralOcrExtractor,
    QdrantVectorIndexer,
)
from .config import UGCConfig
from .service import UGCService


def create_ugc_service(cfg: UGCConfig | None = None) -> UGCService:
    """Create a fully configured UGC service with all adapters wired.

    This is the composition root where all interfaces are bound to their
    concrete implementations based on configuration.

    Args:
        cfg: UGC configuration. If None, loads from environment.

    Returns:
        Configured UGCService ready for use.
    """
    if cfg is None:
        cfg = UGCConfig.from_env()

    # Wire adapters based on configuration
    storage = _create_storage(cfg)
    transcriber = _create_transcriber(cfg)
    ocr = _create_ocr_extractor(cfg)
    judge = _create_judge(cfg)
    serializer = _create_serializer()
    indexer = _create_indexer(cfg)
    jobs = _create_job_repository(cfg)

    return UGCService(
        cfg=cfg,
        storage=storage,
        transcriber=transcriber,
        ocr=ocr,
        judge=judge,
        serializer=serializer,
        indexer=indexer,
        jobs=jobs,
    )


def _create_storage(cfg: UGCConfig) -> FileSystemVideoStorage:
    """Create video storage adapter."""
    # Currently only filesystem storage is supported
    return FileSystemVideoStorage(cfg)


def _create_transcriber(cfg: UGCConfig) -> GroqWhisperTranscriber:
    """Create STT transcriber adapter based on provider config."""
    if cfg.stt_provider == "groq_whisper":
        return GroqWhisperTranscriber(cfg)
    else:
        # Default to Groq Whisper
        return GroqWhisperTranscriber(cfg)


def _create_ocr_extractor(cfg: UGCConfig) -> MistralOcrExtractor:
    """Create OCR extractor adapter based on provider config."""
    if cfg.ocr_provider == "mistral_ocr":
        return MistralOcrExtractor(cfg)
    else:
        # Default to Mistral OCR
        return MistralOcrExtractor(cfg)


def _create_judge(cfg: UGCConfig) -> MistralCharacteristicJudge:
    """Create characteristic judge adapter based on provider config."""
    if cfg.judge_provider == "mistral_chat":
        return MistralCharacteristicJudge(cfg)
    else:
        # Default to Mistral chat
        return MistralCharacteristicJudge(cfg)


def _create_serializer() -> DefaultCharacteristicSerializer:
    """Create characteristic serializer."""
    return DefaultCharacteristicSerializer()


def _create_indexer(cfg: UGCConfig) -> QdrantVectorIndexer:
    """Create vector indexer adapter."""
    return QdrantVectorIndexer(cfg)


def _create_job_repository(cfg: UGCConfig) -> JsonJobRepository:
    """Create job repository adapter."""
    # Currently only JSON file-based repository is supported
    return JsonJobRepository(cfg)
