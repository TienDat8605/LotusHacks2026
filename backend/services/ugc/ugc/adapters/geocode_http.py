"""HTTP geocoder adapter matching the Go service fallback order."""

from __future__ import annotations

from urllib.parse import urlencode

import httpx

from ..config import UGCConfig
from ..types import GeocodeResult


class HttpGeocoder:
    """Best-effort geocoder using ORS, Vietmap, then OSM."""

    def __init__(self, cfg: UGCConfig) -> None:
        self._ors_key = (cfg.ors_api_key or "").strip()
        self._vietmap_key = (cfg.vietmap_api_key or "").strip()

    def geocode(self, query: str) -> GeocodeResult | None:
        query = query.strip()
        if not query:
            return None

        for resolver in (
            self._geocode_ors,
            self._geocode_vietmap,
            self._geocode_osm,
        ):
            try:
                result = resolver(query)
            except Exception:
                result = None
            if result is not None:
                return result
        return None

    def _geocode_ors(self, query: str) -> GeocodeResult | None:
        if not self._ors_key:
            return None

        params = {
            "api_key": self._ors_key,
            "text": query,
            "boundary.country": "VN",
            "size": "1",
        }
        url = f"https://api.openrouteservice.org/geocode/search?{urlencode(params)}"
        with httpx.Client(timeout=8.0) as client:
            response = client.get(url)
        if response.status_code != 200:
            return None

        data = response.json()
        features = data.get("features") or []
        if not features:
            return None
        coords = features[0].get("geometry", {}).get("coordinates") or []
        if len(coords) < 2:
            return None
        return GeocodeResult(lat=str(coords[1]), lng=str(coords[0]), source="ors")

    def _geocode_vietmap(self, query: str) -> GeocodeResult | None:
        if not self._vietmap_key:
            return None

        search_params = {
            "apikey": self._vietmap_key,
            "text": query,
            "focus": "10.775658,106.700757",
            "display_type": "2",
        }
        search_url = f"https://maps.vietmap.vn/api/search/v4?{urlencode(search_params)}"
        with httpx.Client(timeout=8.0) as client:
            search_response = client.get(search_url)
        if search_response.status_code != 200:
            return None
        items = search_response.json()
        if not isinstance(items, list) or not items:
            return None

        ref_id = str(items[0].get("ref_id", "")).strip()
        if not ref_id:
            return None

        place_params = {"apikey": self._vietmap_key, "refid": ref_id}
        place_url = f"https://maps.vietmap.vn/api/place/v4?{urlencode(place_params)}"
        with httpx.Client(timeout=8.0) as client:
            place_response = client.get(place_url)
        if place_response.status_code != 200:
            return None

        place = place_response.json()
        lat = place.get("lat")
        lng = place.get("lng")
        if lat in (None, "", 0) and lng in (None, "", 0):
            return None
        return GeocodeResult(lat=str(lat), lng=str(lng), source="vietmap")

    def _geocode_osm(self, query: str) -> GeocodeResult | None:
        params = {
            "format": "jsonv2",
            "q": query,
            "limit": "1",
            "addressdetails": "1",
            "countrycodes": "vn",
            "dedupe": "1",
        }
        url = f"https://nominatim.openstreetmap.org/search?{urlencode(params)}"
        with httpx.Client(
            timeout=8.0,
            headers={
                "User-Agent": "vibemap/1.0",
                "Accept-Language": "vi,en",
            },
        ) as client:
            response = client.get(url)
        if response.status_code != 200:
            return None

        items = response.json()
        if not isinstance(items, list) or not items:
            return None
        item = items[0]
        lat = str(item.get("lat", "")).strip()
        lng = str(item.get("lon", "")).strip()
        if not lat or not lng:
            return None
        return GeocodeResult(lat=lat, lng=lng, source="osm")
