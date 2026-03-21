from __future__ import annotations

import json
import re
from pathlib import Path

from .schemas import LatLng, Poi, ReviewDocument


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _stable_id(name: str) -> str:
    slug = _NON_ALNUM.sub("_", name.strip().lower()).strip("_")
    slug = slug[:48].strip("_")
    return f"review_{slug or 'item'}"


def load_review_documents(path: Path) -> list[ReviewDocument]:
    items = json.loads(path.read_text(encoding="utf-8"))
    docs: list[ReviewDocument] = []
    seen: dict[str, int] = {}

    for idx, item in enumerate(items):
        name = (item.get("poi_name") or "").strip()
        lat_raw = (item.get("lat") or "").strip()
        lng_raw = (item.get("lng") or "").strip()
        if not name or not lat_raw or not lng_raw:
            continue

        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except ValueError:
            continue

        doc_id = _stable_id(name)
        count = seen.get(doc_id, 0) + 1
        seen[doc_id] = count
        if count > 1:
            doc_id = f"{doc_id}_{count}"

        address = (item.get("poi_address") or "").strip() or None
        city = (item.get("poi_city") or "").strip() or None
        video_url = (item.get("video_url") or "").strip() or None
        video_id = (item.get("video_id") or "").strip() or None
        summary = (item.get("characteristic_vi") or "").strip()
        evidence = (item.get("evidence") or "").strip()

        poi = Poi(
            id=doc_id,
            name=name,
            location=LatLng(lat=lat, lng=lng),
            address=address,
            city=city,
            videoUrl=video_url,
            videoId=video_id,
            badges=["Trending on TikTok"],
        )

        search_parts = [name]
        if address:
            search_parts.append(address)
        if city:
            search_parts.append(city)
        if summary:
            search_parts.append(summary)
        if evidence:
            search_parts.append(evidence)

        docs.append(
            ReviewDocument(
                id=doc_id,
                poi=poi,
                summary=summary,
                evidence=evidence,
                searchText="\n".join(search_parts),
            )
        )

    return docs
