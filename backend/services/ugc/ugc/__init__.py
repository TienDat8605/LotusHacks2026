"""UGC (User-Generated Content) video ingestion module.

This module provides a separate pipeline for processing user-uploaded videos,
extracting characteristics via STT/OCR, and indexing them into vector storage.
"""

from __future__ import annotations

__all__ = [
    "UGCConfig",
    "UGCService",
    "create_ugc_service",
]

from .composition import create_ugc_service
from .config import UGCConfig
from .service import UGCService
