from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

from .schemas import ChatMessage


class ThreadStore:
    def __init__(self) -> None:
        self._threads: dict[str, list[ChatMessage]] = defaultdict(list)

    def list_messages(self, thread_id: str) -> list[ChatMessage]:
        return list(self._threads[thread_id])

    def add_message(self, thread_id: str, role: str, text: str) -> ChatMessage:
        message = ChatMessage(
            id=uuid4().hex,
            role=role,  # type: ignore[arg-type]
            text=text,
            createdAt=datetime.now(timezone.utc).isoformat(),
        )
        self._threads[thread_id].append(message)
        return message
