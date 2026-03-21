import { ChevronRight, Eye, MapPin, Pencil, Route as RouteIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapCanvas } from '@/components/map/MapCanvas';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';
import type { Poi } from '@/api/types';

function minutesLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function RouteResults() {
  const params = useParams();
  const navigate = useNavigate();
  const getRoute = useVibeMapStore((s) => s.getRoute);
  const route = params.routeId ? getRoute(params.routeId) : undefined;
  const [activePoiId, setActivePoiId] = useState<string | undefined>(route?.pois[0]?.id);
  const [activeLegIndex, setActiveLegIndex] = useState(0);

  usePageMeta({
    title: route ? `VibeMap — ${route.title}` : 'VibeMap — Your Route',
    description: 'Review itinerary, stops, and turn-by-turn directions.',
  });

  const activeLeg = useMemo(() => route?.legs[activeLegIndex], [route?.legs, activeLegIndex]);
  const activePoi = useMemo(() => route?.pois.find((p) => p.id === activePoiId), [route?.pois, activePoiId]);

  if (!route) {
    return (
      <div className="h-full w-full p-6 lg:p-10">
        <div className="max-w-xl bg-surface-container-lowest rounded-lg shadow-float p-8">
          <h1 className="font-headline text-2xl font-extrabold">Route not found</h1>
          <p className="text-on-surface-variant mt-2">Generate a route from the planner to see results here.</p>
          <Link
            to="/plan"
            className="inline-flex mt-6 bg-gradient-to-r from-primary to-primary-container text-white px-5 py-3 rounded-full font-headline font-extrabold"
          >
            Go to planner
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto lg:overflow-hidden">
      <div className="min-h-full grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:h-full lg:p-8">
        <section className="lg:col-span-8 min-h-[24rem] lg:h-full relative rounded-lg shadow-float bg-surface-container overflow-hidden isolate z-0">
          <MapCanvas
            className="h-full"
            title={route.title}
            subtitle={`${minutesLabel(route.totalDurationMinutes)} · ${route.pois.length} stops`}
            route={route}
            activePoiId={activePoiId}
            onPoiClick={(poi) => setActivePoiId(poi.id)}
          />

          <div className="pointer-events-none absolute inset-x-4 top-4 z-[1200] flex justify-between gap-3 lg:inset-x-6 lg:top-6">
            <div className="pointer-events-auto max-w-md rounded-[28px] border border-white/70 bg-white/92 p-4 shadow-float backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Current route</div>
                  <h2 className="mt-2 font-headline text-lg font-extrabold text-on-surface">{route.title}</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {minutesLabel(route.totalDurationMinutes)} total · {route.pois.length} curated stops
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <RouteIcon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Start</div>
                  <div className="mt-1 text-sm font-extrabold text-on-surface line-clamp-2">{route.origin?.name ?? 'Origin'}</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">End</div>
                  <div className="mt-1 text-sm font-extrabold text-on-surface line-clamp-2">{route.destination?.name ?? 'Destination'}</div>
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-start">
              <button
                type="button"
                onClick={() => navigate('/plan')}
                className="glass-card rounded-full px-4 py-2 shadow-float border border-white/60 flex items-center gap-2 text-sm font-bold text-primary"
              >
                <Pencil className="h-4 w-4" />
                Plan new route
              </button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 min-h-[24rem] lg:h-full rounded-lg bg-surface-container-lowest shadow-float flex flex-col relative z-10">
          <div className="p-6 border-b border-surface-container">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-outline">Your Route</div>
                <h2 className="font-headline text-xl font-extrabold mt-2">{route.title}</h2>
                <p className="text-sm text-on-surface-variant mt-1">{minutesLabel(route.totalDurationMinutes)} total</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <RouteIcon className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-extrabold text-sm">Itinerary</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-outline">Stops</span>
              </div>
              <div className="mt-4 space-y-3">
                {route.pois.map((p, idx) => {
                  const active = p.id === activePoiId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePoiId(p.id)}
                      className={cn(
                        'w-full text-left rounded-2xl p-4 transition-colors',
                        active ? 'bg-surface-container-low' : 'bg-surface-container-lowest hover:bg-surface-container-low'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-9 w-9 rounded-full flex items-center justify-center font-headline font-extrabold text-xs',
                            active ? 'bg-tertiary text-white' : 'bg-primary/10 text-primary'
                          )}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-extrabold text-on-surface">{p.name}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5">
                            {(p.address ?? p.city ?? p.category ?? 'Curated') + (p.rating ? ` · ${p.rating.toFixed(1)}` : '')}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-on-surface-variant" />
                      </div>
                      {p.badges?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {p.badges.slice(0, 2).map((b) => (
                            <span
                              key={b}
                              className="px-3 py-1 rounded-full bg-tertiary-container/25 text-on-tertiary-container text-[10px] font-bold uppercase tracking-wider"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-extrabold text-sm">Directions</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-outline">Legs</span>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {route.legs.map((leg, idx) => (
                  <button
                    key={`${leg.fromPoiId ?? 'x'}_${leg.toPoiId ?? 'y'}_${idx}`}
                    type="button"
                    onClick={() => setActiveLegIndex(idx)}
                    className={cn(
                      'flex-shrink-0 px-4 py-2 rounded-full text-xs font-extrabold transition-colors',
                      idx === activeLegIndex
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-low text-on-surface/70 hover:bg-surface-container-high'
                    )}
                  >
                    Leg {idx + 1} · {minutesLabel(leg.durationMinutes)}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {(activeLeg?.steps ?? []).map((s, i) => (
                  <div key={`${i}_${s.instruction}`} className="bg-surface-container-low rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-extrabold text-on-surface">{s.instruction}</div>
                        <div className="text-xs text-on-surface-variant mt-1">
                          {(s.durationMinutes ?? 0) > 0 ? `${s.durationMinutes} mins` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <TikTokPanel poi={activePoi} />

              {activePoiId && (
                <Link
                  to={`/results/${encodeURIComponent(route.id)}/vibe/${encodeURIComponent(activePoiId)}`}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform"
                >
                  <Eye className="h-5 w-5" />
                  Street-view vibe check
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function TikTokPanel(props: { poi?: Poi }) {
  const url = props.poi?.videoUrl;
  const id = props.poi?.videoId;
  const embed = id ? `https://www.tiktok.com/embed/v2/${encodeURIComponent(id)}` : undefined;

  if (!url && !embed) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="font-headline font-extrabold text-sm">TikTok</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-outline">Vibe Proof</span>
      </div>

      <div className="mt-4 bg-surface-container-low rounded-2xl overflow-hidden">
        {embed ? (
          <div className="aspect-[9/16] w-full">
            <iframe
              src={embed}
              className="w-full h-full"
              allow="encrypted-media;"
              referrerPolicy="strict-origin-when-cross-origin"
              title={props.poi?.name ?? 'TikTok'}
            />
          </div>
        ) : null}

        {url ? (
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-on-surface truncate">{props.poi?.name ?? 'Open video'}</div>
              <div className="text-[10px] text-on-surface-variant truncate mt-1">{url}</div>
            </div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 bg-primary text-white px-4 py-2 rounded-full text-xs font-extrabold"
            >
              Open
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
