import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  MapPin,
  Pencil,
  Play,
  Route as RouteIcon,
  Sparkles,
  Star,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LatLng, Poi, RoutePlan } from '@/api/types';
import { MapCanvas } from '@/components/map/MapCanvas';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

function minutesLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function haversineMeters(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 6371000 * c;
}

function distanceKmFromPath(path?: LatLng[]) {
  if (!path || path.length < 2) return 0;
  let meters = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    meters += haversineMeters(path[i], path[i + 1]);
  }
  return meters / 1000;
}

function routeDistanceKm(route: RoutePlan) {
  let km = 0;
  for (const leg of route.legs) {
    km += distanceKmFromPath(leg.path);
  }
  if (km > 0) return km;
  if (route.origin?.location && route.destination?.location) {
    return haversineMeters(route.origin.location, route.destination.location) / 1000;
  }
  if (route.pois.length < 2) return 0;
  for (let i = 0; i < route.pois.length - 1; i += 1) {
    km += haversineMeters(route.pois[i].location, route.pois[i + 1].location) / 1000;
  }
  return km;
}

function routeTravelMinutes(route: RoutePlan) {
  const byLegs = route.legs.reduce((total, leg) => total + Math.max(0, leg.durationMinutes || 0), 0);
  if (byLegs > 0) return byLegs;
  const km = routeDistanceKm(route);
  if (km <= 0) return Math.max(1, route.totalDurationMinutes);
  return Math.max(1, Math.round((km / 18) * 60));
}

function distanceLabel(km: number) {
  if (km <= 0) return '0 km';
  if (km < 1) return `${Math.max(100, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

function stopTone(index: number) {
  const tones = [
    'bg-primary text-white',
    'bg-fuchsia-500 text-white',
    'bg-emerald-500 text-white',
    'bg-violet-500 text-white',
  ];
  return tones[index % tones.length];
}

function stopBadge(poi?: Poi) {
  if (!poi) return 'Direct route';
  if (poi.badges?.length) return poi.badges[0];
  if (poi.category) return poi.category;
  return 'Curated stop';
}

function normalizeTikTokUrl(value?: string) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?tiktok\.com\//i.test(trimmed) || /^vm\.tiktok\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return undefined;
}

function getTikTokUrl(poi?: Poi) {
  if (!poi) return undefined;
  const normalizedUrl = normalizeTikTokUrl(poi.videoUrl);
  if (normalizedUrl) return normalizedUrl;
  if (poi.videoId) return `https://www.tiktok.com/@vibemap/video/${poi.videoId}`;
  return undefined;
}

function getTikTokEmbedUrl(poi?: Poi) {
  if (!poi) return undefined;
  if (!poi.videoId) return undefined;
  return `https://www.tiktok.com/embed/v3/${poi.videoId}`;
}

function getTikTokThumbnailUrl(poi?: Poi) {
  const videoUrl = getTikTokUrl(poi);
  if (!videoUrl) return undefined;
  return `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
}

function videoLabel(poi?: Poi) {
  if (!poi) return 'No stop selected';
  if (getTikTokUrl(poi)) return 'TikTok ready';
  if (poi.videoId) return `TikTok clip ${poi.videoId}`;
  return 'TikTok preview pending';
}

function fallbackThumbnailUrl(poi?: Poi) {
  if (!poi) {
    return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
      'Ho Chi Minh City direct route map preview, minimal modern navigation illustration, clean streets and river composition, realistic travel app cover'
    )}&image_size=portrait_16_9`;
  }
  if (poi.videoUrl) {
    return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
      `${poi.name}, Ho Chi Minh City TikTok travel video thumbnail, vertical social media cover, cinematic street food and nightlife, vibrant neon lighting, realistic mobile video still`
    )}&image_size=portrait_16_9`;
  }

  if (poi.videoId) {
    return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
      `${poi.name}, TikTok style thumbnail cover, vertical travel reel poster, Ho Chi Minh City urban exploration, bold title card, realistic social media thumbnail`
    )}&image_size=portrait_16_9`;
  }

  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    `${poi.name}, curated destination thumbnail, vertical short video cover, Ho Chi Minh City lifestyle, modern editorial travel frame, realistic`
  )}&image_size=portrait_16_9`;
}

export default function RouteResults() {
  const params = useParams();
  const getRoute = useVibeMapStore((s) => s.getRoute);
  const route = params.routeId ? getRoute(params.routeId) : undefined;
  const [activePoiId, setActivePoiId] = useState<string | undefined>(route?.pois[0]?.id);
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [panelMode, setPanelMode] = useState<'results' | 'tiktok'>('results');
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<string, boolean>>({});
  const [embedErrors, setEmbedErrors] = useState<Record<string, boolean>>({});

  usePageMeta({
    title: route ? `Kompas — ${route.title}` : 'Kompas — Your Route',
    description: 'Review itinerary, stops, and turn-by-turn directions.',
  });

  const activeLeg = useMemo(() => route?.legs[activeLegIndex], [route?.legs, activeLegIndex]);
  const activePoi = useMemo(() => route?.pois.find((p) => p.id === activePoiId) ?? route?.pois[0], [route?.pois, activePoiId]);
  const totalStops = route?.pois.length ?? 0;
  const totalDistance = route ? distanceLabel(routeDistanceKm(route)) : '0 km';
  const travelMinutes = route ? routeTravelMinutes(route) : 0;
  const selectedPoi = activePoi ?? route?.pois[0];
  const selectedTikTokUrl = selectedPoi ? getTikTokUrl(selectedPoi) : undefined;
  const selectedEmbedUrl = selectedPoi ? getTikTokEmbedUrl(selectedPoi) : undefined;
  const selectedThumbnailUrl = selectedPoi ? getTikTokThumbnailUrl(selectedPoi) : undefined;
  const shouldUseFallbackThumbnail = selectedPoi ? thumbnailErrors[selectedPoi.id] || !selectedThumbnailUrl : true;
  const shouldUseEmbedFallback = selectedPoi ? embedErrors[selectedPoi.id] || !selectedEmbedUrl : true;

  if (!route) {
    return (
      <div className="h-full w-full p-6 lg:p-10">
        <div className="max-w-xl rounded-[28px] bg-surface-container-lowest p-8 shadow-float">
          <h1 className="font-headline text-2xl font-extrabold">Route not found</h1>
          <p className="mt-2 text-on-surface-variant">Generate a route from Discovery to see results here.</p>
          <Link
            to="/plan"
            className="mt-6 inline-flex rounded-full bg-gradient-to-r from-primary to-primary-container px-5 py-3 font-headline font-extrabold text-white"
          >
            Back to Discovery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto lg:overflow-hidden">
      <div className="grid min-h-full grid-cols-1 gap-4 p-4 lg:h-full lg:grid-cols-12 lg:p-8">
        <section className="relative isolate min-h-[28rem] overflow-hidden rounded-[32px] bg-surface-container shadow-float lg:col-span-8 lg:h-full">
          <MapCanvas className="h-full" route={route} activePoiId={activePoi?.id} onPoiClick={(poi) => setActivePoiId(poi.id)} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />

          <div className="absolute bottom-4 left-4 z-[1200] lg:bottom-6 lg:left-6">
            <div className="w-[15.5rem] rounded-[22px] border border-white/60 bg-white/86 p-3.5 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <RouteIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-outline">Discovery route</div>
                  <h1 className="mt-1 truncate font-headline text-sm font-black text-on-surface">{route.title}</h1>
                  <p className="mt-1 truncate text-[11px] font-medium text-on-surface-variant">
                    {route.origin?.name ?? 'Origin'} → {route.destination?.name ?? 'Destination'}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-surface-container-low px-2 py-2 text-center">
                  <div className="font-headline text-sm font-black text-on-surface">{minutesLabel(travelMinutes)}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Travel</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low px-2 py-2 text-center">
                  <div className="font-headline text-sm font-black text-on-surface">{totalDistance}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Dist</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low px-2 py-2 text-center">
                  <div className="font-headline text-sm font-black text-on-surface">{totalStops}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-outline">Stops</div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  to="/plan"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-surface-container-high bg-surface-container-lowest px-3 py-2 text-[11px] font-bold text-on-surface transition-colors hover:bg-surface-container-low"
                >
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                  Edit
                </Link>
                <Link
                  to={activePoi ? `/results/${encodeURIComponent(route.id)}/vibe/${encodeURIComponent(activePoi.id)}` : `/results/${encodeURIComponent(route.id)}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-container px-3 py-2 text-[11px] font-headline font-extrabold text-white shadow-lg transition-transform active:scale-95"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Vibe check
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 flex min-h-[28rem] flex-col overflow-hidden rounded-[32px] bg-surface-container-lowest shadow-float lg:col-span-4 lg:h-full">
          {panelMode === 'results' ? (
            <>
              <div className="border-b border-surface-container p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Discovery</div>
                    <h2 className="mt-2 font-headline text-2xl font-black text-on-surface">Route Results</h2>
                    <p className="mt-1 text-sm text-on-surface-variant">Tap an itinerary stop to open its TikTok panel.</p>
                  </div>
                  <div className="rounded-full bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    Live plan
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-8 overflow-y-auto p-6">
                <div className="rounded-[28px] bg-surface-container-low p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Selected stop</div>
                      <h3 className="mt-2 font-headline text-lg font-extrabold text-on-surface">{activePoi?.name ?? 'Choose a stop'}</h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                      <Star className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                    {activePoi
                      ? activePoi.address ?? activePoi.city ?? activePoi.category ?? 'Curated stop on your route.'
                      : 'Tap a stop on the map or itinerary to inspect it.'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{stopBadge(activePoi)}</span>
                    {activePoi?.rating ? (
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface">
                        {activePoi.rating.toFixed(1)} rating
                      </span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline text-sm font-extrabold text-on-surface">Itinerary</h3>
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Stops</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {route.pois.length === 0 ? (
                      <div className="rounded-[24px] border border-surface-container bg-surface-container-lowest px-4 py-4 text-sm text-on-surface-variant">
                        This is a direct A→B route with no intermediate stops.
                      </div>
                    ) : (
                      route.pois.map((poi, idx) => {
                        const active = poi.id === activePoi?.id;
                        return (
                          <button
                            key={poi.id}
                            type="button"
                            onClick={() => {
                              setActivePoiId(poi.id);
                              setActiveLegIndex(Math.min(idx, Math.max(route.legs.length - 1, 0)));
                              setPanelMode('tiktok');
                            }}
                            className={cn(
                              'w-full rounded-[24px] border p-4 text-left transition-all',
                              active
                                ? 'border-primary/20 bg-primary/5 shadow-sm'
                                : 'border-surface-container bg-surface-container-lowest hover:bg-surface-container-low'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-black', stopTone(idx))}>
                                {idx + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-extrabold text-on-surface">{poi.name}</div>
                                <div className="mt-1 truncate text-xs text-on-surface-variant">
                                  {poi.address ?? poi.city ?? poi.category ?? 'Curated stop'}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-on-surface-variant" />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                                {stopBadge(poi)}
                              </span>
                              <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                                TikTok panel
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline text-sm font-extrabold text-on-surface">Current leg</h3>
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">
                      {route.legs.length ? `${Math.min(activeLegIndex + 1, route.legs.length)}/${route.legs.length}` : '0/0'}
                    </span>
                  </div>

                  <div className="mt-4 rounded-[28px] bg-surface-container-low p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Travel time</div>
                        <div className="mt-2 font-headline text-2xl font-black text-on-surface">
                          {activeLeg ? minutesLabel(activeLeg.durationMinutes) : '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveLegIndex((value) => (route.legs.length ? (value + 1) % route.legs.length : 0))}
                        className="rounded-full bg-white px-4 py-2 text-xs font-bold text-primary shadow-sm transition-transform active:scale-95"
                      >
                        Next leg
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {activeLeg?.steps?.length ? (
                        activeLeg.steps.map((step, index) => (
                          <div key={`${step.instruction}-${index}`} className="flex gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-on-surface">{step.instruction}</div>
                              <div className="mt-1 text-xs text-on-surface-variant">
                                {step.distanceMeters ? `${step.distanceMeters}m` : 'Short hop'}
                                {step.durationMinutes ? ` · ${minutesLabel(step.durationMinutes)}` : ''}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface-variant shadow-sm">
                          No step-by-step instructions available for this leg yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-surface-container p-6">
                <button
                  type="button"
                  onClick={() => setPanelMode('results')}
                  className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-surface-container"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Return to route results
                </button>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">TikTok panel</div>
                    <h2 className="mt-2 font-headline text-2xl font-black text-on-surface">{activePoi?.name ?? 'Selected stop'}</h2>
                    <p className="mt-1 text-sm text-on-surface-variant">Focused social preview for this itinerary stop.</p>
                  </div>
                  <div className="rounded-full bg-tertiary-container/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-on-tertiary-container">
                    Social clip
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                <div className="overflow-hidden rounded-[28px] bg-surface-container-low shadow-sm">
                  <div className="relative aspect-[9/16] w-full overflow-hidden bg-slate-950">
                    {selectedTikTokUrl && !shouldUseEmbedFallback ? (
                      <iframe
                        src={selectedEmbedUrl}
                        title={`${selectedPoi?.name ?? 'Selected stop'} TikTok video`}
                        className="h-full w-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        onError={() => {
                          if (selectedPoi) {
                            setEmbedErrors((current) => ({ ...current, [selectedPoi.id]: true }));
                          }
                        }}
                      />
                    ) : (
                      <a
                        href={selectedTikTokUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group block h-full w-full"
                        aria-label={`Open TikTok video for ${selectedPoi?.name ?? 'selected stop'}`}
                      >
                        <img
                          src={shouldUseFallbackThumbnail ? fallbackThumbnailUrl(selectedPoi) : selectedThumbnailUrl}
                          alt={`${selectedPoi?.name ?? 'Selected stop'} TikTok thumbnail`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          onError={() => {
                            if (selectedPoi) {
                              setThumbnailErrors((current) => ({ ...current, [selectedPoi.id]: true }));
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-xl transition-transform duration-300 group-hover:scale-105">
                            <Play className="ml-1 h-7 w-7 fill-current" />
                          </div>
                        </div>
                        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-sm">
                            <Sparkles className="h-3.5 w-3.5" />
                            {videoLabel(selectedPoi)}
                          </div>
                          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-sm">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open TikTok
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                          <div className="text-lg font-black">{selectedPoi?.name ?? 'Selected stop'}</div>
                          <div className="mt-2 text-sm text-white/80">
                            {selectedPoi?.address ?? selectedPoi?.city ?? selectedPoi?.category ?? 'Curated stop on your route'}
                          </div>
                        </div>
                      </a>
                    )}
                    {selectedTikTokUrl && !shouldUseEmbedFallback ? (
                      <a
                        href={selectedTikTokUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open on TikTok
                      </a>
                    ) : null}
                    {!selectedTikTokUrl ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-6 text-center text-white">
                        <div className="rounded-full bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">
                          TikTok unavailable
                        </div>
                        <div className="max-w-xs text-sm text-white/75">This stop does not have a TikTok link yet, so only the preview artwork is available.</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[28px] bg-surface-container-low p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">TikTok URL</div>
                    {selectedTikTokUrl ? (
                      <a
                        href={selectedTikTokUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-sm transition-transform active:scale-95"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open link
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-on-surface shadow-sm break-all">
                    {selectedTikTokUrl ?? 'No TikTok URL available for this stop yet.'}
                  </div>
                  <div className="mt-3 text-xs text-on-surface-variant">
                    The panel now opens the TikTok clip directly from the preview surface and falls back to a generated cover when a live thumbnail cannot be loaded.
                  </div>
                </div>

                <div className="rounded-[28px] bg-surface-container-low p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Stop details</div>
                      <div className="mt-2 font-headline text-lg font-extrabold text-on-surface">{activePoi?.name ?? 'Selected stop'}</div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                      <MapPin className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{stopBadge(activePoi)}</span>
                    {activePoi?.rating ? (
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface">
                        {activePoi.rating.toFixed(1)} rating
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
                    {activePoi?.address ?? activePoi?.city ?? activePoi?.category ?? 'Curated stop on your route.'}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
