import { ChevronRight, Eye, MapPin, Pencil, Route as RouteIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
    <div className="h-full w-full overflow-hidden">
      <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-8">
        <section className="lg:col-span-8 h-full relative overflow-hidden rounded-lg shadow-float">
          <MapCanvas
            className="h-full"
            title={route.title}
            subtitle={`${minutesLabel(route.totalDurationMinutes)} · ${route.pois.length} stops`}
            route={route}
            activePoiId={activePoiId}
            onPoiClick={(poi) => setActivePoiId(poi.id)}
          />

          <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/plan')}
              className="glass-card rounded-full px-4 py-2 shadow-float border border-white/60 flex items-center gap-2 text-sm font-bold text-primary"
            >
              <Pencil className="h-4 w-4" />
              Edit plan
            </button>
          </div>
        </section>

        <section className="lg:col-span-4 h-full overflow-hidden rounded-lg bg-surface-container-lowest shadow-float flex flex-col">
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
                            {(p.category ?? 'Curated') + (p.rating ? ` · ${p.rating.toFixed(1)}` : '')}
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

