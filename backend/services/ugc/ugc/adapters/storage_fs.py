"""Filesystem video storage adapter."""

from __future__ import annotations

import os
import re
from pathlib import Path

from ..config import UGCConfig
from ..errors import StorageError
from ..types import StorageResult


class FileSystemVideoStorage:
    """Video storage using local filesystem."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._storage_path = cfg.storage_path
        self._allowed_extensions = [".mp4", ".mov", ".webm", ".avi", ".mkv"]

    def store(
        self,
        video_id: str,
        content: bytes,
        original_filename: str | None = None,
    ) -> StorageResult:
        """Store a video file to the filesystem.

        Args:
            video_id: Unique video identifier.
            content: Video file content as bytes.
            original_filename: Original filename for extension.

        Returns:
            StorageResult with storage path and status.

        Raises:
            StorageError: If storage fails.
        """
        # Validate video_id to prevent path traversal
        if not self._is_safe_video_id(video_id):
            raise StorageError(f"Invalid video_id format: {video_id}")

        # Determine extension
        extension = ".mp4"  # Default
        if original_filename:
            _, ext = os.path.splitext(original_filename)
            if ext.lower() in self._allowed_extensions:
                extension = ext.lower()

        # Ensure storage directory exists
        try:
            self._storage_path.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise StorageError(f"Failed to create storage directory: {e}")

        # Build the file path with deterministic naming
        filename = f"video_{video_id}{extension}"
        file_path = self._storage_path / filename

        try:
            file_path.write_bytes(content)
            return StorageResult(
                video_id=video_id,
                path=str(file_path),
                size_bytes=len(content),
                stored=True,
            )
        except OSError as e:
            raise StorageError(f"Failed to write video file: {e}")

    def get_path(self, video_id: str) -> Path | None:
        """Get the storage path for a video.

        Args:
            video_id: The video identifier.

        Returns:
            Path to the video file, or None if not found.
        """
        if not self._is_safe_video_id(video_id):
            return None

        # Check for any extension
        for ext in self._allowed_extensions:
            file_path = self._storage_path / f"video_{video_id}{ext}"
            if file_path.exists():
                return file_path

        return None

    def delete(self, video_id: str) -> bool:
        """Delete a stored video.

        Args:
            video_id: The video identifier.

        Returns:
            True if deleted, False if not found.
        """
        path = self.get_path(video_id)
        if path is None:
            return False

        try:
            path.unlink()
            return True
        except OSError:
            return False

    def _is_safe_video_id(self, video_id: str) -> bool:
        """Validate video_id to prevent path traversal attacks."""
        # Allow only alphanumeric, underscores, and hyphens
        if not video_id:
            return False
        pattern = re.compile(r"^[a-zA-Z0-9_-]+$")
        if not pattern.match(video_id):
            return False
        # Explicitly check for path traversal patterns
        if ".." in video_id or "/" in video_id or "\\" in video_id:
            return False
        return True
