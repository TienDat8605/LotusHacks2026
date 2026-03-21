import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { cn } from '@/lib/utils';
import type { LatLng, Poi, RoutePlan } from '@/api/types';

const legColors = ['#004be3', '#b90037', '#006763', '#7c3aed', '#ea580c', '#0ea5e9'];

function toLatLng(p: LatLng): [number, number] {
  return [p.lat, p.lng];
}

function BoundsFitter(props: { points: LatLng[] }) {
  const map = useMap();
  const hasFittedRef = useRef(false);
  const pointsKey = useMemo(() => props.points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'), [props.points]);

  useEffect(() => {
    hasFittedRef.current = false;
  }, [pointsKey]);

  useEffect(() => {
    if (props.points.length === 0 || hasFittedRef.current) return;
    const bounds = L.latLngBounds(props.points.map((p) => L.latLng(p.lat, p.lng)));
    map.fitBounds(bounds.pad(0.2), { animate: true });
    hasFittedRef.current = true;
  }, [map, props.points]);

  return null;
}

function poiIcon(index: number, active: boolean) {
  const bg = active ? '#b90037' : 'rgba(0,75,227,0.92)';
  return L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:9999px;background:${bg};color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-family:ui-sans-serif;font-size:12px;box-shadow:0 14px 30px rgba(0,0,0,0.20);border:4px solid rgba(255,255,255,0.65);">${index}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function pinIcon(label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="padding:8px 12px;border-radius:9999px;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.85);box-shadow:0 14px 30px rgba(0,0,0,0.18);font-weight:800;font-family:ui-sans-serif;font-size:12px;color:#0f172a;">${label}</div>`,
    iconSize: [90, 34],
    iconAnchor: [45, 17],
  });
}

function buildLegPath(route: RoutePlan, legIndex: number): LatLng[] {
  const leg = route.legs[legIndex];
  if (leg?.path?.length) return leg.path;

  const origin = route.origin?.location;
  const destination = route.destination?.location;
  const stops = route.pois;

  if (!origin || !destination || stops.length === 0) {
    const pts = stops.map((p) => p.location);
    if (pts.length >= 2 && legIndex < pts.length - 1) return [pts[legIndex], pts[legIndex + 1]];
    return pts;
  }

  const from = legIndex === 0 ? origin : stops[legIndex - 1]?.location;
  const to = legIndex === stops.length ? destination : stops[legIndex]?.location;
  if (!from || !to) return [];
  return [from, to];
}

export function MapCanvas(props: {
  className?: string;
  title?: string;
  subtitle?: string;
  route?: RoutePlan;
  activePoiId?: string;
  onPoiClick?: (poi: Poi) => void;
}) {
  const route = props.route;
  const pois = route?.pois ?? [];
  const origin = route?.origin?.location;
  const destination = route?.destination?.location;

  const fitPoints = useMemo(() => {
    const pts = [] as LatLng[];
    if (origin) pts.push(origin);
    for (const p of pois) pts.push(p.location);
    if (destination) pts.push(destination);
    return pts;
  }, [destination, origin, pois]);

  const center: [number, number] = useMemo(() => {
    if (fitPoints.length > 0) return toLatLng(fitPoints[0]);
    return [10.7757, 106.7008];
  }, [fitPoints]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-lg bg-surface-container', props.className)}>
      {(props.title || props.subtitle) && (
        <div className="pointer-events-none absolute top-4 left-4 z-[1000] glass-card rounded-full px-3 py-2 shadow-float">
          {props.title && <div className="text-xs font-bold text-on-surface">{props.title}</div>}
          {props.subtitle && <div className="text-[10px] font-semibold text-on-surface-variant">{props.subtitle}</div>}
        </div>
      )}

      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {route && <BoundsFitter points={fitPoints} />}

        {origin && (
          <Marker position={toLatLng(origin)} icon={pinIcon('Start')}>
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              {route?.origin?.name ?? 'Origin'}
            </Tooltip>
          </Marker>
        )}

        {destination && (
          <Marker position={toLatLng(destination)} icon={pinIcon('End')}>
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              {route?.destination?.name ?? 'Destination'}
            </Tooltip>
          </Marker>
        )}

        {route?.legs?.map((_, i) => {
          const path = buildLegPath(route, i);
          if (path.length < 2) return null;
          const color = legColors[i % legColors.length];
          return (
            <Polyline
              key={`leg_${i}`}
              positions={path.map(toLatLng)}
              pathOptions={{ color, weight: 6, opacity: 0.9 }}
            />
          );
        })}

        {pois.map((poi, i) => (
          <Marker
            key={poi.id}
            position={toLatLng(poi.location)}
            icon={poiIcon(i + 1, poi.id === props.activePoiId)}
            eventHandlers={{
              click: () => props.onPoiClick?.(poi),
            }}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1}>
              {poi.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
