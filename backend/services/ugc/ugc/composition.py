"""Composition root for wiring UGC interfaces to adapter implementations.

This module is the single place where interfaces are bound to concrete
implementations based on configuration. Business logic depends only on
interfaces; provider binding happens here.
"""

from __future__ import annotations

from .adapters import (
    DataJsonRepository,
    DefaultCharacteristicSerializer,
    FallbackTranscriber,
    FileSystemVideoStorage,
    HttpGeocoder,
    GroqWhisperTranscriber,
    InterfazeCharacteristicJudge,
    InterfazeOcrExtractor,
    InterfazeSpeechTranscriber,
    JsonJobRepository,
    MistralCharacteristicJudge,
    MistralOcrExtractor,
    NoopOcrExtractor,
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
    geocoder = _create_geocoder(cfg)
    data_records = _create_data_repository(cfg)

    return UGCService(
        cfg=cfg,
        storage=storage,
        transcriber=transcriber,
        ocr=ocr,
        judge=judge,
        serializer=serializer,
        indexer=indexer,
        jobs=jobs,
        geocoder=geocoder,
        data_records=data_records,
    )


def _create_storage(cfg: UGCConfig) -> FileSystemVideoStorage:
    """Create video storage adapter."""
    # Currently only filesystem storage is supported
    return FileSystemVideoStorage(cfg)


def _create_transcriber(cfg: UGCConfig) -> InterfazeSpeechTranscriber | GroqWhisperTranscriber:
    """Create STT transcriber adapter based on provider config."""
    primary = _create_single_transcriber(cfg, cfg.stt_provider, cfg.stt_model)
    if cfg.stt_fallback_provider == "disabled" or cfg.stt_fallback_provider == cfg.stt_provider:
        return primary
    fallback = _create_single_transcriber(
        cfg,
        cfg.stt_fallback_provider,
        cfg.stt_fallback_model,
    )
    return FallbackTranscriber(
        primary=primary,
        fallback=fallback,
        primary_name=cfg.stt_provider,
        fallback_name=cfg.stt_fallback_provider,
    )


def _create_single_transcriber(
    cfg: UGCConfig,
    provider: str,
    model: str,
) -> InterfazeSpeechTranscriber | GroqWhisperTranscriber:
    if provider == "interfaze_stt":
        return InterfazeSpeechTranscriber(cfg, model=model)
    if provider == "groq_whisper":
        return GroqWhisperTranscriber(cfg, model=model)
    return InterfazeSpeechTranscriber(cfg, model=model)


def _create_ocr_extractor(
    cfg: UGCConfig,
) -> NoopOcrExtractor | InterfazeOcrExtractor | MistralOcrExtractor:
    """Create OCR extractor adapter based on provider config."""
    if cfg.ocr_provider == "disabled":
        return NoopOcrExtractor()
    if cfg.ocr_provider == "interfaze_vision":
        return InterfazeOcrExtractor(cfg)
    if cfg.ocr_provider == "mistral_ocr":
        return MistralOcrExtractor(cfg)
    else:
        return NoopOcrExtractor()


def _create_judge(
    cfg: UGCConfig,
) -> InterfazeCharacteristicJudge | MistralCharacteristicJudge:
    """Create characteristic judge adapter based on provider config."""
    if cfg.judge_provider == "interfaze_chat":
        return InterfazeCharacteristicJudge(cfg)
    if cfg.judge_provider == "mistral_chat":
        return MistralCharacteristicJudge(cfg)
    else:
        return InterfazeCharacteristicJudge(cfg)


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


def _create_geocoder(cfg: UGCConfig) -> HttpGeocoder:
    """Create geocoder adapter."""
    return HttpGeocoder(cfg)


def _create_data_repository(cfg: UGCConfig) -> DataJsonRepository:
    """Create dataset persistence adapter."""
    return DataJsonRepository(cfg)
