import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { cn } from '@/lib/utils';
import type { LatLng, Poi, RoutePlan } from '@/api/types';

const legColors = ['#0b5fff', '#7c3aed', '#00a884', '#f97316', '#e11d48', '#0ea5e9'];
const defaultCenter: [number, number] = [10.7757, 106.7008];

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
  const background = active
    ? 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(236,72,153,0.92))'
    : 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,255,255,0.72))';
  const color = active ? '#ffffff' : '#334155';
  const border = active ? '1px solid rgba(255,255,255,0.45)' : '1px solid rgba(255,255,255,0.85)';
  const shadow = active ? '0 14px 28px rgba(99,102,241,0.28)' : '0 10px 24px rgba(15,23,42,0.14)';

  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${background};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-family:ui-sans-serif;font-size:11px;backdrop-filter:blur(10px);box-shadow:${shadow};border:${border};">${index}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function pinIcon(label: string, tone: 'start' | 'end') {
  const palette =
    tone === 'start'
      ? {
          background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(236,253,245,0.88))',
          border: 'rgba(16,185,129,0.22)',
          dot: 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(45,212,191,0.9))',
          text: '#047857',
          shadow: '0 14px 28px rgba(16,185,129,0.18)',
        }
      : {
          background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,241,242,0.9))',
          border: 'rgba(244,63,94,0.22)',
          dot: 'linear-gradient(135deg, rgba(244,63,94,0.95), rgba(251,113,133,0.9))',
          text: '#be123c',
          shadow: '0 14px 28px rgba(244,63,94,0.18)',
        };

  return L.divIcon({
    className: '',
    html: `<div style="width:58px;height:34px;border-radius:9999px;background:${palette.background};border:1px solid ${palette.border};backdrop-filter:blur(12px);box-shadow:${palette.shadow};display:flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;font-family:ui-sans-serif;"><span style="width:10px;height:10px;border-radius:9999px;background:${palette.dot};box-shadow:0 0 0 3px rgba(255,255,255,0.72);"></span><span style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${palette.text};">${label}</span></div>`,
    iconSize: [58, 34],
    iconAnchor: [29, 17],
    popupAnchor: [0, -20],
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
  const origin = route?.origin?.location;
  const destination = route?.destination?.location;

  const pois = useMemo(() => route?.pois ?? [], [route]);

  const fitPoints = useMemo(() => {
    const pts = [] as LatLng[];
    if (origin) pts.push(origin);
    for (const p of pois) pts.push(p.location);
    if (destination) pts.push(destination);
    return pts;
  }, [destination, origin, pois]);

  const center: [number, number] = useMemo(() => {
    if (fitPoints.length > 0) return toLatLng(fitPoints[0]);
    return defaultCenter;
  }, [fitPoints]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-lg bg-surface-container', props.className)}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {route && <BoundsFitter points={fitPoints} />}

        {origin && (
          <Marker position={toLatLng(origin)} icon={pinIcon('Start', 'start')}>
            <Tooltip direction="top" offset={[0, -16]} opacity={1}>
              {route?.origin?.name ?? 'Origin'}
            </Tooltip>
          </Marker>
        )}

        {destination && (
          <Marker position={toLatLng(destination)} icon={pinIcon('End', 'end')}>
            <Tooltip direction="top" offset={[0, -16]} opacity={1}>
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
              pathOptions={{ color, weight: 5, opacity: 0.92 }}
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
