"""Shared helpers for Interfaze OpenAI-compatible adapters."""

from __future__ import annotations

import json


def build_api_url(base_url: str, path: str) -> str:
    """Join a configured base URL and endpoint path safely."""
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def extract_chat_text(content: object) -> str:
    """Extract plain text from an OpenAI-compatible chat completion content field."""
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                parts.append(cleaned)
            continue
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
            continue
        nested = item.get("content")
        if isinstance(nested, str) and nested.strip():
            parts.append(nested.strip())
    return "\n".join(parts).strip()


def normalize_json_payload(content: str) -> str:
    """Strip common markdown wrappers before JSON parsing."""
    content = content.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines).strip()
    return content


def dump_json(value: object) -> str:
    """Serialize structured prompts predictably."""
    return json.dumps(value, ensure_ascii=False, indent=2)
