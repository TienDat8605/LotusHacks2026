"""Adapter implementations for UGC module."""

from __future__ import annotations

__all__ = [
    "DataJsonRepository",
    "GroqWhisperTranscriber",
    "HttpGeocoder",
    "InterfazeCharacteristicJudge",
    "InterfazeOcrExtractor",
    "InterfazeSpeechTranscriber",
    "MistralOcrExtractor",
    "MistralCharacteristicJudge",
    "NoopOcrExtractor",
    "QdrantVectorIndexer",
    "FileSystemVideoStorage",
    "JsonJobRepository",
    "DefaultCharacteristicSerializer",
    "FallbackTranscriber",
]

from .dataset_json import DataJsonRepository
from .geocode_http import HttpGeocoder
from .index_qdrant import QdrantVectorIndexer
from .judge_interfaze import InterfazeCharacteristicJudge
from .judge_mistral import MistralCharacteristicJudge
from .ocr_noop import NoopOcrExtractor
from .ocr_interfaze import InterfazeOcrExtractor
from .ocr_mistral import MistralOcrExtractor
from .repo_json import JsonJobRepository
from .serializer import DefaultCharacteristicSerializer
from .storage_fs import FileSystemVideoStorage
from .stt_fallback import FallbackTranscriber
from .stt_interfaze import InterfazeSpeechTranscriber
from .stt_groq import GroqWhisperTranscriber
