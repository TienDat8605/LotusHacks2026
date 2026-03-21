"""Persistence adapter for the shared TikTok-style data.json dataset."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from ..config import UGCConfig
from ..errors import UGCError
from ..types import TikTokDataRecord


class DataJsonRepository:
    """Upsert records into the shared data.json dataset."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._dataset_path = cfg.dataset_path
        self._lock = threading.Lock()

    def upsert(self, record: TikTokDataRecord) -> str:
        """Insert or replace a record by video_id."""
        with self._lock:
            self._dataset_path.parent.mkdir(parents=True, exist_ok=True)
            items = self._read_items()
            serialized = record.to_dict()

            replaced = False
            for index, item in enumerate(items):
                if str(item.get("video_id", "")).strip() == record.video_id:
                    items[index] = serialized
                    replaced = True
                    break

            if not replaced:
                items.append(serialized)

            try:
                self._dataset_path.write_text(
                    json.dumps(items, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            except OSError as e:
                raise UGCError(f"Failed to write dataset file: {e}")

        return str(self._dataset_path)

    def _read_items(self) -> list[dict]:
        if not self._dataset_path.exists():
            return []
        try:
            raw = self._dataset_path.read_text(encoding="utf-8").strip()
            if not raw:
                return []
            data = json.loads(raw)
        except (OSError, json.JSONDecodeError) as e:
            raise UGCError(f"Failed to read dataset file: {e}")

        if not isinstance(data, list):
            raise UGCError("Dataset file must contain a JSON array")
        return [item for item in data if isinstance(item, dict)]
