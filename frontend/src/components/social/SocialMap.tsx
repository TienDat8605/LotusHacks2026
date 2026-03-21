import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
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

function pulseIcon(seed: string) {
  const color = seedColor(seed);
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:72px;height:72px;display:flex;align-items:center;justify-content:center;"><span style="position:absolute;width:72px;height:72px;border-radius:9999px;background:${color};opacity:0.16;animation:vibemap-pulse 1.8s ease-out infinite;"></span><span style="position:absolute;width:52px;height:52px;border-radius:9999px;background:${color};opacity:0.22;animation:vibemap-pulse 1.8s ease-out 0.35s infinite;"></span><span style="position:relative;width:24px;height:24px;border-radius:9999px;background:${color};border:6px solid rgba(255,255,255,0.96);box-shadow:0 18px 36px rgba(0,0,0,0.22);"></span></div>`,
    iconSize: [72, 72],
    iconAnchor: [36, 36],
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

export function SocialMap(props: {
  center: { lat: number; lng: number };
  participants: SocialParticipant[];
  recommendations: Poi[];
  currentParticipantId?: string;
  className?: string;
  fullscreen?: boolean;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const liveParticipants = useMemo(
    () => props.participants.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [props.participants]
  );
  const currentParticipant = useMemo(
    () => liveParticipants.find((p) => p.id === props.currentParticipantId) ?? liveParticipants[0],
    [liveParticipants, props.currentParticipantId]
  );

  useEffect(() => {
    if (!mapRef.current) return;
    window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
  }, [props.fullscreen]);

  return (
    <div className={cn('h-64 w-full overflow-hidden rounded-[28px] border border-white/70 shadow-float', props.className)}>
      <style>{'@keyframes vibemap-pulse { 0% { transform: scale(0.45); opacity: 0.45; } 70% { transform: scale(1); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }'}</style>
      <MapContainer
        center={[props.center.lat, props.center.lng]}
        zoom={14}
        scrollWheelZoom={props.fullscreen}
        dragging
        ref={mapRef}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
