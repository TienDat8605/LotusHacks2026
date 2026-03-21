import { useMemo } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Poi, SocialParticipant } from '@/api/types';

function userIcon(seed: string, highlighted: boolean) {
  const color = highlighted ? '#b90037' : seedColor(seed);
  const label = initials(seed);
  const ring = highlighted ? '0 0 0 6px rgba(185,0,55,0.18)' : '0 14px 30px rgba(0,0,0,0.18)';
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:9999px;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-sans-serif;font-size:11px;box-shadow:${ring};border:4px solid rgba(255,255,255,0.80);">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function pulseIcon(seed: string) {
  const color = seedColor(seed);
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center;"><span style="position:absolute;width:54px;height:54px;border-radius:9999px;background:${color};opacity:0.18;animation:vibemap-pulse 1.8s ease-out infinite;"></span><span style="position:absolute;width:40px;height:40px;border-radius:9999px;background:${color};opacity:0.24;animation:vibemap-pulse 1.8s ease-out 0.35s infinite;"></span><span style="position:relative;width:18px;height:18px;border-radius:9999px;background:${color};border:4px solid rgba(255,255,255,0.92);box-shadow:0 10px 24px rgba(0,0,0,0.18);"></span></div>`,
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
}

function poiIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:10px;background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-sans-serif;font-size:11px;box-shadow:0 10px 24px rgba(0,0,0,0.16);border:1px solid rgba(255,255,255,0.9);color:#004be3;">★</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
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

export function SocialMap(props: {
  center: { lat: number; lng: number };
  participants: SocialParticipant[];
  recommendations: Poi[];
  currentParticipantId?: string;
}) {
  const liveParticipants = useMemo(
    () => props.participants.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [props.participants]
  );
  const currentParticipant = useMemo(
    () => liveParticipants.find((p) => p.id === props.currentParticipantId) ?? liveParticipants[0],
    [liveParticipants, props.currentParticipantId]
  );

  return (
    <div className="h-64 w-full overflow-hidden rounded-[28px] border border-white/70 shadow-float">
      <style>{'@keyframes vibemap-pulse { 0% { transform: scale(0.45); opacity: 0.45; } 70% { transform: scale(1); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }'}</style>
      <MapContainer
        center={[props.center.lat, props.center.lng]}
        zoom={14}
        scrollWheelZoom={false}
        dragging
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {currentParticipant && (
          <Marker
            key={`${currentParticipant.id}_pulse`}
            position={[currentParticipant.lat as number, currentParticipant.lng as number]}
            icon={pulseIcon(currentParticipant.avatarSeed || currentParticipant.displayName)}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              You are here
            </Tooltip>
          </Marker>
        )}

        {liveParticipants.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat as number, p.lng as number]}
            icon={userIcon(p.avatarSeed || p.displayName, p.id === currentParticipant?.id)}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1}>
              {p.displayName}
            </Tooltip>
          </Marker>
        ))}

        {props.recommendations.slice(0, 4).map((poi) => (
          <Marker key={poi.id} position={[poi.location.lat, poi.location.lng]} icon={poiIcon()}>
            <Tooltip direction="top" offset={[0, -12]} opacity={1}>
              {poi.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
