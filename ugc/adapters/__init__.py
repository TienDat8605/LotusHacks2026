"""Adapter implementations for UGC module."""

from __future__ import annotations

__all__ = [
    "GroqWhisperTranscriber",
    "MistralOcrExtractor",
    "MistralCharacteristicJudge",
    "QdrantVectorIndexer",
    "FileSystemVideoStorage",
    "JsonJobRepository",
    "DefaultCharacteristicSerializer",
]

from .index_qdrant import QdrantVectorIndexer
from .judge_mistral import MistralCharacteristicJudge
from .ocr_mistral import MistralOcrExtractor
from .repo_json import JsonJobRepository
from .serializer import DefaultCharacteristicSerializer
from .storage_fs import FileSystemVideoStorage
from .stt_groq import GroqWhisperTranscriber
