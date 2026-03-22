import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Poi, SocialParticipant } from '@/api/types';
import { cn } from '@/lib/utils';

function userIcon(seed: string, highlighted: boolean) {
  const color = highlighted ? '#004be3' : seedColor(seed);
  const label = initials(seed);
  const ring = highlighted ? '0 0 0 10px rgba(0,75,227,0.18)' : '0 14px 30px rgba(0,0,0,0.18)';
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:9999px;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-sans-serif;font-size:11px;box-shadow:${ring};border:4px solid rgba(255,255,255,0.92);">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function currentLocationIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-8px);"><div style="position:relative;width:28px;height:36px;"><div style="position:absolute;left:2px;top:0;width:24px;height:24px;border-radius:9999px;background:#004be3;box-shadow:0 10px 28px rgba(0,75,227,0.45);border:3px solid rgba(255,255,255,0.95);"></div><div style="position:absolute;left:11px;top:22px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:10px solid #004be3;"></div></div><div style="margin-top:2px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,0.97);border:1px solid rgba(0,75,227,0.28);font-family:ui-sans-serif;font-size:10px;font-weight:900;letter-spacing:0.06em;color:#0038ad;">YOU</div></div>`,
    iconSize: [34, 46],
    iconAnchor: [17, 40],
  });
}

function poiIcon(index: number) {
  const colors = ['#004be3', '#7c3aed', '#f97316'];
  const color = colors[index % colors.length];
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-sans-serif;font-size:12px;box-shadow:0 10px 24px rgba(0,0,0,0.16);border:1px solid rgba(255,255,255,0.9);color:${color};">★</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function initials(seed: string) {
  const s = seed.trim();
  if (!s) return 'U';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? 'U';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (a + b).toUpperCase();
}

function seedColor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 78%, 48%)`;
}

function ParticipantBounds(props: { points: Array<{ lat: number; lng: number }>; fallback: { lat: number; lng: number } }) {
  const map = useMap();
  const pointsKey = useMemo(
    () => props.points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'),
    [props.points]
  );
  const fallbackKey = `${props.fallback.lat.toFixed(5)},${props.fallback.lng.toFixed(5)}`;

  useEffect(() => {
    if (!props.points.length) {
      map.setView([props.fallback.lat, props.fallback.lng], 14, { animate: true });
      return;
    }
    if (props.points.length === 1) {
      map.setView([props.points[0].lat, props.points[0].lng], Math.max(14, map.getZoom()), { animate: true });
      return;
    }
    const bounds = L.latLngBounds(props.points.map((point) => [point.lat, point.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.3), { animate: true, maxZoom: 15 });
  }, [map, pointsKey, fallbackKey]);

  return null;
}

export function SocialMap(props: {
  center: { lat: number; lng: number };
  participants: SocialParticipant[];
  recommendations: Poi[];
  currentParticipantId?: string;
  currentLocation?: { lat: number; lng: number };
  className?: string;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const liveParticipants = useMemo(
    () => props.participants.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [props.participants]
  );
  const pinnedParticipants = useMemo(() => {
    const pins = liveParticipants.map((participant) => ({
      ...participant,
      lat: participant.lat as number,
      lng: participant.lng as number,
    }));
    if (!props.currentParticipantId || !props.currentLocation) return pins;

    let replaced = false;
    const merged = pins.map((participant) => {
      if (participant.id !== props.currentParticipantId) return participant;
      replaced = true;
      return {
        ...participant,
        lat: props.currentLocation!.lat,
        lng: props.currentLocation!.lng,
      };
    });
    if (replaced) return merged;

    const fallback = props.participants.find((participant) => participant.id === props.currentParticipantId);
    return [
      ...merged,
      {
        id: props.currentParticipantId,
        displayName: fallback?.displayName ?? 'You',
        avatarSeed: fallback?.avatarSeed ?? props.currentParticipantId,
        lastSeen: fallback?.lastSeen ?? new Date().toISOString(),
        lat: props.currentLocation.lat,
        lng: props.currentLocation.lng,
      },
    ];
  }, [liveParticipants, props.currentLocation, props.currentParticipantId, props.participants]);
  const currentParticipant = useMemo(
    () => pinnedParticipants.find((p) => p.id === props.currentParticipantId),
    [pinnedParticipants, props.currentParticipantId]
  );
  const currentLocationPoint = useMemo(() => {
    if (props.currentLocation) return props.currentLocation;
    if (props.currentParticipantId) return null;
    if (!currentParticipant) return null;
    return { lat: currentParticipant.lat, lng: currentParticipant.lng };
  }, [props.currentLocation, props.currentParticipantId, currentParticipant]);
  const otherParticipants = useMemo(() => {
    if (!props.currentParticipantId) return pinnedParticipants;
    return pinnedParticipants.filter((participant) => participant.id !== props.currentParticipantId);
  }, [pinnedParticipants, props.currentParticipantId]);
  const participantPoints = useMemo(
    () => otherParticipants.map((participant) => ({ lat: participant.lat, lng: participant.lng })),
    [otherParticipants]
  );
  const mapPoints = useMemo(() => {
    if (!currentLocationPoint) return participantPoints;
    const hasCurrent = participantPoints.some(
      (point) =>
        Math.abs(point.lat - currentLocationPoint.lat) < 1e-6 &&
        Math.abs(point.lng - currentLocationPoint.lng) < 1e-6
    );
    if (hasCurrent) return participantPoints;
    return [...participantPoints, currentLocationPoint];
  }, [participantPoints, currentLocationPoint]);
  const displayParticipants = useMemo(() => {
    if (!props.currentParticipantId) return pinnedParticipants;
    return otherParticipants;
  }, [otherParticipants, pinnedParticipants, props.currentParticipantId]);

  useEffect(() => {
    if (!mapRef.current) return;
    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
  }, []);

  return (
    <div className={cn('h-64 w-full overflow-hidden rounded-[28px] border border-white/70 shadow-float', props.className)}>
      <MapContainer
        center={[props.center.lat, props.center.lng]}
        zoom={14}
        scrollWheelZoom
        dragging
        ref={mapRef}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <ParticipantBounds points={mapPoints} fallback={props.center} />

        {currentLocationPoint && (
          <Marker
            key="current-location"
            position={[currentLocationPoint.lat, currentLocationPoint.lng]}
            icon={currentLocationIcon()}
            zIndexOffset={1800}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1}>
              You
            </Tooltip>
          </Marker>
        )}

        {displayParticipants.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={userIcon(p.avatarSeed || p.displayName, p.id === currentParticipant?.id)}
            zIndexOffset={0}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1}>
              {p.displayName}
            </Tooltip>
          </Marker>
        ))}

        {props.recommendations.slice(0, 3).map((poi, index) => (
          <Marker key={poi.id} position={[poi.location.lat, poi.location.lng]} icon={poiIcon(index)}>
            <Tooltip direction="top" offset={[0, -12]} opacity={1}>
              {poi.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
