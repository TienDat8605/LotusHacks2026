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

function metersBetween(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 6371000 * c;
}

function overlapsNamedPin(point: LatLng, origin?: LatLng, destination?: LatLng) {
  const overlapMeters = 16;
  if (origin && metersBetween(point, origin) <= overlapMeters) return true;
  if (destination && metersBetween(point, destination) <= overlapMeters) return true;
  return false;
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
          pin: 'linear-gradient(160deg, #10b981, #0ea5a4)',
          chipBackground: 'rgba(240,253,250,0.95)',
          chipBorder: 'rgba(16,185,129,0.35)',
          chipText: '#065f46',
          shadow: '0 12px 24px rgba(16,185,129,0.28)',
          pointer: '#059669',
          glyph: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2.25v7.5l6-3.75z" fill="white"/></svg>`,
        }
      : {
          pin: 'linear-gradient(160deg, #ef4444, #db2777)',
          chipBackground: 'rgba(255,241,242,0.96)',
          chipBorder: 'rgba(244,63,94,0.35)',
          chipText: '#9f1239',
          shadow: '0 12px 24px rgba(244,63,94,0.28)',
          pointer: '#e11d48',
          glyph: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9" stroke="white" stroke-width="1.4" stroke-linecap="round"/><path d="M3.6 2h5L7.35 4.2 8.6 6.4H3.6z" fill="white"/></svg>`,
        };

  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);"><div style="position:relative;width:28px;height:36px;"><div style="position:absolute;left:2px;top:0;width:24px;height:24px;border-radius:9999px;background:${palette.pin};box-shadow:${palette.shadow};display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.95);">${palette.glyph}</div><div style="position:absolute;left:11px;top:22px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:10px solid ${palette.pointer};"></div></div><div style="margin-top:3px;padding:2px 7px;border-radius:999px;background:${palette.chipBackground};border:1px solid ${palette.chipBorder};font-family:ui-sans-serif;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${palette.chipText};">${label}</div></div>`,
    iconSize: [70, 56],
    iconAnchor: [35, 42],
    popupAnchor: [0, -34],
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
  const visiblePois = useMemo(
    () =>
      pois
        .map((poi, index) => ({ poi, index }))
        .filter(({ poi }) => !overlapsNamedPin(poi.location, origin, destination)),
    [destination, origin, pois]
  );

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

        {visiblePois.map(({ poi, index }) => (
          <Marker
            key={poi.id}
            position={toLatLng(poi.location)}
            icon={poiIcon(index + 1, poi.id === props.activePoiId)}
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
