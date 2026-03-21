import { ArrowLeftRight, Bike, Bus, Car, Footprints, LocateFixed, MapPin, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiClient } from '@/api/getClient';
import type { LocationSuggestion, TransportMode } from '@/api/types';
import { MapCanvas } from '@/components/map/MapCanvas';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

const modeItems: { mode: TransportMode; label: string; Icon: typeof Bike }[] = [
  { mode: 'bike', label: 'Bike', Icon: Bike },
  { mode: 'car', label: 'Car', Icon: Car },
  { mode: 'walk', label: 'Walk', Icon: Footprints },
  { mode: 'bus', label: 'Bus', Icon: Bus },
];

const MIN_DISCOVERY_BUDGET = 120;
const MAX_DISCOVERY_BUDGET = 480;
const DISCOVERY_BUDGET_STEP = 60;

function minutesLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function normalizeBudget(minutes: number) {
  const clamped = Math.max(MIN_DISCOVERY_BUDGET, Math.min(MAX_DISCOVERY_BUDGET, Number.isFinite(minutes) ? minutes : MIN_DISCOVERY_BUDGET));
  const stepIndex = Math.round((clamped - MIN_DISCOVERY_BUDGET) / DISCOVERY_BUDGET_STEP);
  return MIN_DISCOVERY_BUDGET + stepIndex * DISCOVERY_BUDGET_STEP;
}

function poiCountForBudget(minutes: number) {
  if (minutes <= 180) return 1;
  if (minutes <= 300) return 2;
  return 3;
}

const hcmcBounds = {
  minLat: 10.3,
  maxLat: 11.25,
  minLng: 106.25,
  maxLng: 107.15,
};

function isWithinHcmc(location: { lat: number; lng: number }) {
  return (
    location.lat >= hcmcBounds.minLat &&
    location.lat <= hcmcBounds.maxLat &&
    location.lng >= hcmcBounds.minLng &&
    location.lng <= hcmcBounds.maxLng
  );
}

function isHcmcSuggestion(item: LocationSuggestion) {
  if (isWithinHcmc(item.location)) return true;
  const haystack = `${item.name} ${item.address ?? ''}`.toLowerCase();
  return haystack.includes('ho chi minh') || haystack.includes('hồ chí minh') || haystack.includes('saigon') || haystack.includes('sài gòn');
}

function rankDiscoverySuggestions(items: LocationSuggestion[]) {
  return [...items].sort((a, b) => {
    const aIn = isHcmcSuggestion(a);
    const bIn = isHcmcSuggestion(b);
    if (aIn !== bIn) return aIn ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function withHcmcContext(query: string) {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('ho chi minh') ||
    lower.includes('hồ chí minh') ||
    lower.includes('saigon') ||
    lower.includes('sài gòn')
  ) {
    return trimmed;
  }
  return `${trimmed}, Ho Chi Minh City`;
}

export default function RoutePlanner() {
  usePageMeta({
    title: 'VibeMap — Route Planner',
    description: 'Design a time-boxed curated route.',
  });

  const navigate = useNavigate();
  const prefs = useVibeMapStore((s) => s.preferences);
  const setRoute = useVibeMapStore((s) => s.setRoute);
  const setLastPlan = useVibeMapStore((s) => s.setLastPlanRequest);

  const [origin, setOrigin] = useState('District 1, Ben Thanh');
  const [destination, setDestination] = useState('Landmark 81, Bình Thạnh');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(normalizeBudget(prefs.defaultTimeBudgetMinutes));
  const [transportMode, setTransportMode] = useState<TransportMode>(prefs.defaultTransportMode);
  const [includeTrending, setIncludeTrending] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'origin' | 'destination' | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<LocationSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<LocationSuggestion[]>([]);
  const [searchingOrigin, setSearchingOrigin] = useState(false);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const blurTimerRef = useRef<number | null>(null);

  function clearBlurTimer() {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }

  function queueCloseSuggestions() {
    clearBlurTimer();
    blurTimerRef.current = window.setTimeout(() => {
      setFocusedField(null);
    }, 120);
  }

  useEffect(() => {
    return () => clearBlurTimer();
  }, []);

  useEffect(() => {
    const query = origin.trim();
    if (query.length < 2) {
      setSearchingOrigin(false);
      setOriginSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingOrigin(true);
      try {
        const api = getApiClient();
        const hcmcQuery = withHcmcContext(query);
        let results = await api.searchLocations(hcmcQuery, 8);
        if (!results.length && hcmcQuery !== query) {
          results = await api.searchLocations(query, 8);
        }
        if (cancelled) return;
        setOriginSuggestions(rankDiscoverySuggestions(results).slice(0, 6));
      } catch {
        if (cancelled) return;
        setOriginSuggestions([]);
      } finally {
        if (!cancelled) {
          setSearchingOrigin(false);
        }
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [origin]);

  useEffect(() => {
    const query = destination.trim();
    if (query.length < 2) {
      setSearchingDestination(false);
      setDestinationSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingDestination(true);
      try {
        const api = getApiClient();
        const hcmcQuery = withHcmcContext(query);
        let results = await api.searchLocations(hcmcQuery, 8);
        if (!results.length && hcmcQuery !== query) {
          results = await api.searchLocations(query, 8);
        }
        if (cancelled) return;
        setDestinationSuggestions(rankDiscoverySuggestions(results).slice(0, 6));
      } catch {
        if (cancelled) return;
        setDestinationSuggestions([]);
      } finally {
        if (!cancelled) {
          setSearchingDestination(false);
        }
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destination]);

  function pickOrigin(suggestion: LocationSuggestion) {
    setOrigin(suggestion.name);
    setOriginSuggestions([]);
    setFocusedField(null);
  }

  function pickDestination(suggestion: LocationSuggestion) {
    setDestination(suggestion.name);
    setDestinationSuggestions([]);
    setFocusedField(null);
  }

  const previewReq = useMemo(
    () => ({ origin, destination, timeBudgetMinutes, transportMode, includeTrending }),
    [origin, destination, timeBudgetMinutes, transportMode, includeTrending]
  );

  const showOriginSuggestions = focusedField === 'origin' && origin.trim().length >= 2;
  const showDestinationSuggestions = focusedField === 'destination' && destination.trim().length >= 2;

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      const api = getApiClient();
      const route = await api.planRoute(previewReq);
      setRoute(route);
      setLastPlan(previewReq);
      navigate(`/results/${encodeURIComponent(route.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-8">
        <section className="lg:col-span-5 h-full overflow-y-auto rounded-lg bg-surface-container-lowest shadow-float">
          <div className="p-6 lg:p-8">
            <header className="mb-10">
              <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">The Curator</h2>
              <p className="text-on-surface-variant text-sm mt-2">Design your perfect Ho Chi Minh City experience.</p>
            </header>

            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-4">
                    Start Point
                  </label>
                  <div className="relative">
                    <div className="flex items-center bg-surface-container-low rounded-xl px-4 py-3">
                      <LocateFixed className="h-5 w-5 text-primary mr-3" />
                      <input
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium w-full text-on-surface"
                        value={origin}
                        onFocus={() => {
                          clearBlurTimer();
                          setFocusedField('origin');
                        }}
                        onBlur={queueCloseSuggestions}
                        onChange={(e) => setOrigin(e.target.value)}
                        placeholder="Search with Vietmap"
                      />
                    </div>
                    {showOriginSuggestions && (
                      <div className="absolute z-40 left-0 right-0 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-float">
                        {searchingOrigin ? (
                          <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant">Searching addresses…</div>
                        ) : originSuggestions.length ? (
                          originSuggestions.map((suggestion) => (
                            <button
                              key={`${suggestion.refId ?? suggestion.name}_${suggestion.location.lat}_${suggestion.location.lng}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickOrigin(suggestion);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
                            >
                              <div className="text-sm font-semibold text-on-surface">{suggestion.name}</div>
                              {suggestion.address && (
                                <div className="text-xs text-on-surface-variant mt-0.5 truncate">{suggestion.address}</div>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant">No address results found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-center -my-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOrigin(destination);
                      setDestination(origin);
                      setOriginSuggestions([]);
                      setDestinationSuggestions([]);
                      setFocusedField(null);
                    }}
                    className="bg-white p-2 rounded-full shadow-float border border-surface-container active:scale-95 transition-transform"
                    aria-label="Swap"
                  >
                    <ArrowLeftRight className="h-4 w-4 text-on-surface-variant" />
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 block ml-4">
                    Destination
                  </label>
                  <div className="relative">
                    <div className="flex items-center bg-surface-container-low rounded-xl px-4 py-3">
                      <MapPin className="h-5 w-5 text-tertiary mr-3" />
                      <input
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium w-full text-on-surface"
                        value={destination}
                        onFocus={() => {
                          clearBlurTimer();
                          setFocusedField('destination');
                        }}
                        onBlur={queueCloseSuggestions}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="Where to? (Vietmap search)"
                      />
                    </div>
                    {showDestinationSuggestions && (
                      <div className="absolute z-40 left-0 right-0 mt-2 max-h-56 overflow-y-auto rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-float">
                        {searchingDestination ? (
                          <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant">Searching addresses…</div>
                        ) : destinationSuggestions.length ? (
                          destinationSuggestions.map((suggestion) => (
                            <button
                              key={`${suggestion.refId ?? suggestion.name}_${suggestion.location.lat}_${suggestion.location.lng}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickDestination(suggestion);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
                            >
                              <div className="text-sm font-semibold text-on-surface">{suggestion.name}</div>
                              {suggestion.address && (
                                <div className="text-xs text-on-surface-variant mt-0.5 truncate">{suggestion.address}</div>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm font-semibold text-on-surface-variant">No address results found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-4">
                  <label className="text-sm font-bold text-on-surface">Time Budget</label>
                  <span className="text-primary font-black text-xl">{minutesLabel(timeBudgetMinutes)}</span>
                </div>
                <input
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                  max={MAX_DISCOVERY_BUDGET}
                  min={MIN_DISCOVERY_BUDGET}
                  step={DISCOVERY_BUDGET_STEP}
                  value={timeBudgetMinutes}
                  onChange={(e) => setTimeBudgetMinutes(normalizeBudget(Number(e.target.value)))}
                  type="range"
                />
                <div className="flex justify-between mt-2 text-[10px] font-bold text-outline uppercase">
                  <span>2 hrs</span>
                  <span>8 hrs</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-on-surface-variant">
                  Planned stops: {poiCountForBudget(timeBudgetMinutes)} POI
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-on-surface mb-4 block">Transport Mode</label>
                <div className="grid grid-cols-4 gap-3">
                  {modeItems.map(({ mode, label, Icon }) => {
                    const active = transportMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTransportMode(mode)}
                        className={cn(
                          'flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95',
                          active
                            ? 'bg-primary text-white shadow-float'
                            : 'bg-surface-container text-on-surface/70 hover:bg-surface-container-high'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 mb-2', active ? 'text-white' : 'text-on-surface/70')} />
                        <span className="text-[10px] font-bold uppercase">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-surface-container-low p-6 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-tertiary-container/25 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-tertiary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Trending on TikTok</h4>
                    <p className="text-xs text-on-surface-variant">Include viral photogenic spots</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIncludeTrending((v) => !v)}
                  className={cn(
                    'h-7 w-12 rounded-full p-1 transition-colors',
                    includeTrending ? 'bg-tertiary' : 'bg-surface-container-highest'
                  )}
                  aria-pressed={includeTrending}
                  aria-label="Toggle trending"
                >
                  <div
                    className={cn(
                      'h-5 w-5 rounded-full bg-white transition-transform',
                      includeTrending ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {error && (
                <div className="bg-tertiary-container/20 text-on-tertiary-container px-4 py-3 rounded-2xl text-sm font-semibold">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={onSubmit}
                disabled={loading}
                className={cn(
                  'w-full bg-gradient-to-r from-primary to-primary-container text-white py-5 rounded-full font-headline font-extrabold text-lg shadow-float active:scale-95 transition-transform',
                  loading ? 'opacity-80' : 'opacity-100'
                )}
              >
                {loading ? 'Curating…' : "Let's Go"}
              </button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 h-full overflow-hidden rounded-lg shadow-float">
          <MapCanvas
            className="h-full"
            title="Preview"
            subtitle={`${previewReq.transportMode.toUpperCase()} · ${minutesLabel(previewReq.timeBudgetMinutes)} · ${previewReq.includeTrending ? 'Trending' : 'Classic'}`}
          />
        </section>
      </div>
    </div>
  );
}
