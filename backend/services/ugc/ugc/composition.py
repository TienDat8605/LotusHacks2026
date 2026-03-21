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
    InterfazeStructuredJudge,
    InterfazeTranscriber,
    InterfazeVisionOcrExtractor,
    JsonJobRepository,
    MistralCharacteristicJudge,
    MistralOcrExtractor,
    QdrantVectorIndexer,
)
from .config import UGCConfig
from .contracts import CharacteristicJudge, OcrExtractor, Transcriber
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


def _create_transcriber(cfg: UGCConfig) -> Transcriber:
    """Create STT transcriber adapter based on provider config."""
    if cfg.stt_provider == "interfaze_stt":
        return InterfazeTranscriber(cfg)
    if cfg.stt_provider == "groq_whisper":
        return GroqWhisperTranscriber(cfg)
    else:
        # Default to Interfaze
        return InterfazeTranscriber(cfg)


def _create_ocr_extractor(cfg: UGCConfig) -> OcrExtractor:
    """Create OCR extractor adapter based on provider config."""
    if cfg.ocr_provider == "interfaze_vision":
        return InterfazeVisionOcrExtractor(cfg)
    if cfg.ocr_provider == "mistral_ocr":
        return MistralOcrExtractor(cfg)
    else:
        # Default to Interfaze vision
        return InterfazeVisionOcrExtractor(cfg)


def _create_judge(cfg: UGCConfig) -> CharacteristicJudge:
    """Create characteristic judge adapter based on provider config."""
    if cfg.judge_provider == "interfaze_structured":
        return InterfazeStructuredJudge(cfg)
    if cfg.judge_provider == "mistral_chat":
        return MistralCharacteristicJudge(cfg)
    else:
        # Default to Interfaze structured extraction
        return InterfazeStructuredJudge(cfg)


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
