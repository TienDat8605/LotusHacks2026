import { Bot, Compass, Flame, Leaf, MapPin, PlusCircle, Send, Sparkles } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getApiClient } from '@/api/getClient';
import type { ChatMessage, Poi, RoutePlanRequest } from '@/api/types';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

function isoTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderMessageText(text: string) {
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);

    return (
      <Fragment key={`${line}-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={`${part}-${partIndex}`}>{part.slice(2, -2)}</strong>;
          }
          return <Fragment key={`${part}-${partIndex}`}>{part}</Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function buildNamedDestination(poi: Poi) {
  return poi.address ?? poi.name;
}

function buildRouteSummary(origin: string, pois: Poi[]) {
  if (!pois.length) {
    return `I could not build a guided route from **${origin}** because there were no connected POIs.`;
  }

  const stopNames = pois.map((poi) => poi.name).join(' -> ');
  return `I planned your guided route from **${origin}** using these exact places: **${stopNames}**.`;
}

function buildFocusedPoiPrompt(poi: Poi) {
  const where = [poi.address, poi.city].filter(Boolean).join(', ');
  return `Vibe check this specific place: ${poi.name}${where ? ` (${where})` : ''}. Tell me what vibe it has, what to order or try first, best visit time, and why this place matches the vibe.`;
}

function generatedPoiImage(poi: Poi) {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    `${poi.name}, Ho Chi Minh City travel photo, vibrant urban destination, realistic editorial composition`
  )}&image_size=landscape_16_9`;
}

function resolvePoiImageUrl(raw?: string) {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) {
    return value;
  }
  if (value.startsWith('/assets/')) return value;
  if (value.startsWith('assets/')) return `/${value}`;
  if (value.startsWith('/images/')) return `/assets${value}`;
  if (value.startsWith('images/')) return `/assets/${value}`;
  return `/assets/${value.replace(/^\/+/, '')}`;
}

function poiUniqueKey(poi: Poi) {
  const name = (poi.name ?? '').trim().toLowerCase();
  if (name) return name;
  return (poi.id ?? '').trim().toLowerCase();
}

function uniquePois(pois: Poi[], limit = 3) {
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (const poi of pois) {
    const key = poiUniqueKey(poi);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(poi);
    if (out.length >= limit) break;
  }
  return out;
}

type RecommendationAccent = {
  icon: typeof Compass;
  label: string;
  tone: string;
};

function recommendationAccent(poi: Poi, index: number): RecommendationAccent {
  if (poi.badges?.some((badge) => /trend/i.test(badge))) {
    return {
      icon: Flame,
      label: poi.badges.find((badge) => /trend/i.test(badge)) ?? 'Trending',
      tone: 'text-orange-600 bg-orange-500/10',
    };
  }

  if (poi.category?.toLowerCase().includes('park')) {
    return {
      icon: Leaf,
      label: 'Nature',
      tone: 'text-emerald-700 bg-emerald-500/10',
    };
  }

  const fallback: RecommendationAccent[] = [
    { icon: Compass, label: 'Nearby', tone: 'text-primary bg-primary/10' },
    { icon: Sparkles, label: 'Group pick', tone: 'text-fuchsia-700 bg-fuchsia-500/10' },
  ];
  return fallback[index % fallback.length];
}

type AssistantFocusState = {
  source?: string;
  focusPoi?: Poi;
};

export default function AiAssistant() {
  usePageMeta({
    title: 'Kompas - AI Assistant',
    description: 'Ask for places and routes by vibe.',
  });

  const navigate = useNavigate();
  const location = useLocation();
  const prefs = useVibeMapStore((s) => s.preferences);
  const lastPlanRequest = useVibeMapStore((s) => s.lastPlanRequest);
  const setLastPlan = useVibeMapStore((s) => s.setLastPlanRequest);
  const setRoute = useVibeMapStore((s) => s.setRoute);
  const assistant = useVibeMapStore((s) => s.assistant);
  const setAssistantState = useVibeMapStore((s) => s.setAssistantState);
  const replaceAssistantFromResponse = useVibeMapStore((s) => s.replaceAssistantFromResponse);

  const threadId = 'default';
  const [mode, setMode] = useState<'poi' | 'route'>('poi');
  const [input, setInput] = useState('');
  const [origin, setOrigin] = useState(lastPlanRequest?.origin ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planningKey, setPlanningKey] = useState<string | null>(null);
  const [poiImageErrors, setPoiImageErrors] = useState<Record<string, boolean>>({});
  const handledFocusKeyRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const messages = assistant.messages;
  const suggestedPois = assistant.suggestedPois;
  const suggestedPlan = assistant.suggestedPlan;
  const followUps = assistant.followUps;
  const uniqueSuggestedPois = useMemo(() => uniquePois(suggestedPois, 3), [suggestedPois]);

  const placeholder = useMemo(
    () => (mode === 'poi' ? 'Where to next, explorer?' : 'Plan a route: date vibe, budget, and mood'),
    [mode]
  );
  const suggestionAnchorIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') return index;
    }
    return -1;
  }, [messages]);
  const focusState = (location.state as AssistantFocusState | null) ?? null;
  const focusedPoiFromState = focusState?.focusPoi;

  useEffect(() => {
    if (messages.length) return;
    setAssistantState({
      messages: [
        {
          id: 'seed',
          role: 'assistant',
          text: 'Tell me your vibe. In Ask POI mode I will recommend one place and route you there. In Plan Route mode I will suggest a destination vibe and the route planner will fill in stops between your start and end points.',
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }, [messages.length, setAssistantState]);

  useEffect(() => {
    if (!focusedPoiFromState) return;
    const key = `${focusedPoiFromState.id}|${focusedPoiFromState.name}|${focusedPoiFromState.address ?? ''}`;
    if (handledFocusKeyRef.current === key) return;
    handledFocusKeyRef.current = key;

    setMode('poi');
    const prompt = buildFocusedPoiPrompt(focusedPoiFromState);
    void send(prompt, { focusPoi: focusedPoiFromState, forceMode: 'poi' });
    navigate('/assistant', { replace: true, state: null });
  }, [focusedPoiFromState, navigate]);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, uniqueSuggestedPois.length, sending, planningKey, error, mode]);

  async function send(text: string, options?: { focusPoi?: Poi; forceMode?: 'poi' | 'route' }) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const activeMode = options?.forceMode ?? mode;
    const focusedPoi = options?.focusPoi;

    setSending(true);
    setError(null);
    setInput('');

    const optimisticMessage: ChatMessage = {
      id: `local_${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    setAssistantState({ messages: [...messages, optimisticMessage] });

    try {
      const api = getApiClient();
      const outbound =
        focusedPoi
          ? `The user wants a vibe check for this exact place only. POI name: ${focusedPoi.name}. Address: ${focusedPoi.address ?? 'unknown'}. City: ${focusedPoi.city ?? 'Ho Chi Minh City'}. Focus your answer on this POI and do not switch to other places unless the user explicitly asks for alternatives. User request: ${trimmed}`
          : activeMode === 'route'
          ? `Suggest a destination and route vibe for this request. The backend planner will create stops between the user's start and destination: ${trimmed}`
          : `Recommend the single best matching place for this request and explain why: ${trimmed}`;

      const resp = await api.sendAssistantMessage(threadId, outbound);
      const incomingSuggested = focusedPoi
        ? [focusedPoi, ...(resp.suggestedPois ?? []).filter((poi) => poi.id !== focusedPoi.id)]
        : resp.suggestedPois ?? [];
      const mergedSuggested = uniquePois([...incomingSuggested, ...assistant.suggestedPois], 3);

      replaceAssistantFromResponse({
        ...resp,
        suggestedPois: mergedSuggested,
        suggestedPlan:
          focusedPoi
            ? null
            : activeMode === 'route'
            ? resp.suggestedPlan ?? {
                origin,
                destination: mergedSuggested[mergedSuggested.length - 1]?.name,
                timeBudgetMinutes: prefs.defaultTimeBudgetMinutes,
                transportMode: prefs.defaultTransportMode,
                includeTrending: true,
              }
            : null,
      });
    } catch (err) {
      setAssistantState({ messages });
      setError(err instanceof Error ? err.message : 'Could not reach the assistant service.');
    } finally {
      setSending(false);
    }
  }

  async function routeToSinglePoi(poi: Poi) {
    const trimmedOrigin = origin.trim();
    if (!trimmedOrigin) {
      setError('Please enter your starting location first.');
      return;
    }

    setPlanningKey(poi.id);
    setError(null);

    try {
      const api = getApiClient();
      const request: RoutePlanRequest = {
        origin: trimmedOrigin,
        destination: buildNamedDestination(poi),
        timeBudgetMinutes: prefs.defaultTimeBudgetMinutes,
        transportMode: prefs.defaultTransportMode,
        includeTrending: true,
      };
      const route = await api.planNormalRoute(request);
      const routeWithDestinationPoi = route.pois.length
        ? route
        : {
            ...route,
            destination: {
              name: poi.name,
              location: route.destination?.location ?? poi.location,
            },
            pois: [poi],
          };
      setLastPlan(request);
      setRoute(routeWithDestinationPoi);
      navigate(`/results/${encodeURIComponent(routeWithDestinationPoi.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the route to this place.');
    } finally {
      setPlanningKey(null);
    }
  }

  async function planSuggestedRoute() {
    const trimmedOrigin = origin.trim();
    const fallbackPoiIds = uniqueSuggestedPois.map((poi) => poi.id);
    const exactPoiIds = suggestedPlan?.requiredPoiIds?.length
      ? Array.from(new Set(suggestedPlan.requiredPoiIds.filter(Boolean))).slice(0, 3)
      : fallbackPoiIds;

    if (!trimmedOrigin) {
      setError('Please enter your starting location first.');
      return;
    }
    if (!exactPoiIds.length) {
      setError('I do not have enough suggested places to build this route yet.');
      return;
    }

    setPlanningKey('itinerary');
    setError(null);

    try {
      const api = getApiClient();
      const selectedPois = uniqueSuggestedPois.slice(0, 3);
      const request = {
        origin: trimmedOrigin,
        transportMode: suggestedPlan?.transportMode ?? prefs.defaultTransportMode,
        includeTrending: suggestedPlan?.includeTrending ?? true,
        poiIds: exactPoiIds.slice(0, 3),
        poiNames: selectedPois.map((poi) => poi.name),
      };
      const route = await api.connectPoisRoute(request);
      const plannedMessage: ChatMessage = {
        id: `planned_${Date.now()}`,
        role: 'assistant',
        text: buildRouteSummary(request.origin, route.pois),
        createdAt: new Date().toISOString(),
      };

      setAssistantState({
        messages: [...messages, plannedMessage],
        suggestedPois: uniquePois(route.pois, 3),
        suggestedPlan: {
          origin: request.origin,
          transportMode: request.transportMode,
          includeTrending: request.includeTrending,
          requiredPoiIds: request.poiIds,
        },
      });
      setLastPlan({
        origin: request.origin,
        destination: route.pois[route.pois.length - 1]?.name ?? 'Guided Route',
        timeBudgetMinutes: prefs.defaultTimeBudgetMinutes,
        transportMode: request.transportMode,
        includeTrending: request.includeTrending,
        requiredPoiIds: request.poiIds,
      });
      setRoute(route);
      navigate(`/results/${encodeURIComponent(route.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the suggested route.');
    } finally {
      setPlanningKey(null);
    }
  }

  return (
    <div className="h-full w-full overflow-hidden relative">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(0,75,227,0.20),transparent_40%),radial-gradient(circle_at_60%_55%,rgba(185,0,55,0.14),transparent_45%),radial-gradient(circle_at_35%_85%,rgba(0,103,99,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/20 to-background" />
      </div>

      <div className="relative z-10 h-full flex flex-col justify-end">
        <div className="bg-surface-container-low/95 backdrop-blur-2xl rounded-t-lg mx-2 shadow-ambient border-t border-white/20 h-[90vh] lg:h-[92vh] flex flex-col">
          <div className="flex flex-col items-center pt-2 pb-3">
            <div className="w-10 h-1 bg-surface-container-highest rounded-full mb-5" />
            <div className="bg-surface-container-highest/60 p-1 rounded-full flex gap-1 w-[92%] max-w-2xl">
              <button
                type="button"
                onClick={() => setMode('poi')}
                className={cn(
                  'flex-1 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
                  mode === 'poi' ? 'bg-white text-primary shadow-float' : 'text-on-surface-variant hover:bg-surface-container-high'
                )}
              >
                <Bot className="h-4 w-4" />
                Ask POI
              </button>
              <button
                type="button"
                onClick={() => setMode('route')}
                className={cn(
                  'flex-1 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
                  mode === 'route' ? 'bg-white text-primary shadow-float' : 'text-on-surface-variant hover:bg-surface-container-high'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Plan Route
              </button>
            </div>

            <div className="w-[92%] max-w-2xl mt-4">
              <div className="flex items-center gap-3 rounded-2xl bg-white/80 border border-white/60 px-4 py-3 shadow-float">
                <MapPin className="h-4 w-4 text-primary" />
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Starting from..."
                  className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/70"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 lg:px-6 space-y-6 pb-44">
            {messages.map((m, messageIndex) => (
              <Fragment key={m.id}>
                <div className={cn('flex', m.role === 'assistant' ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'max-w-[94%] lg:max-w-[76%] rounded-lg p-5 shadow-float border border-surface-container',
                      m.role === 'assistant' ? 'bg-white rounded-tl-sm' : 'bg-primary text-white border-transparent rounded-tr-sm'
                    )}
                  >
                    <div
                      className={cn(
                        'text-[15px] leading-relaxed whitespace-pre-wrap',
                        m.role === 'assistant' ? 'text-on-surface' : 'text-white'
                      )}
                    >
                      {renderMessageText(m.text)}
                    </div>
                    <div className={cn('mt-3 text-[10px] font-bold opacity-70', m.role === 'assistant' ? 'text-outline' : 'text-white')}>
                      {isoTime(m.createdAt)}
                    </div>
                  </div>
                </div>

                {messageIndex === suggestionAnchorIndex && uniqueSuggestedPois.length > 0 && (
                  <div className="space-y-4">
                    <div className="px-1">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-outline">
                        {mode === 'poi' ? 'Suggested places' : 'Planned route stops'}
                      </div>
                    </div>

                    <div className={cn('grid gap-3', mode === 'poi' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
                      {uniqueSuggestedPois.map((p, idx) => {
                        const accent = recommendationAccent(p, idx);
                        const AccentIcon = accent.icon;
                        return (
                          <article
                            key={p.id}
                            className="group rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all hover:border-primary/30"
                          >
                            <div className="mb-3 h-24 overflow-hidden rounded-xl bg-slate-100">
                              <img
                                src={poiImageErrors[p.id] ? generatedPoiImage(p) : resolvePoiImageUrl(p.imageUrl) || generatedPoiImage(p)}
                                alt={p.name}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                                onError={(event) => {
                                  if (poiImageErrors[p.id]) return;
                                  setPoiImageErrors((prev) => ({ ...prev, [p.id]: true }));
                                  event.currentTarget.src = generatedPoiImage(p);
                                }}
                              />
                            </div>
                            <h4 className="truncate text-sm font-bold text-on-surface">{p.name}</h4>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                              <span className="truncate font-medium text-slate-500">
                                {[p.address, p.city].filter(Boolean).join(' · ') || p.category || 'Curated'}
                              </span>
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold', accent.tone)}>
                                <AccentIcon className="h-3.5 w-3.5" />
                                {mode === 'route' ? `Stop ${idx + 1}` : accent.label}
                              </span>
                            </div>
                            {mode === 'poi' && (
                              <button
                                type="button"
                                onClick={() => void routeToSinglePoi(p)}
                                disabled={planningKey !== null}
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.14em] text-white transition-transform active:scale-95 disabled:opacity-70"
                              >
                                <Send className="h-3.5 w-3.5" />
                                {planningKey === p.id ? 'Routing...' : 'Show route'}
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>

                    {mode === 'route' && (
                      <button
                        type="button"
                        onClick={() => void planSuggestedRoute()}
                        disabled={planningKey !== null}
                        className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform disabled:opacity-70"
                      >
                        {planningKey === 'itinerary' ? 'Building route...' : 'Show route for this plan'}
                      </button>
                    )}
                  </div>
                )}
              </Fragment>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[94%] lg:max-w-[76%] rounded-lg rounded-tl-sm p-5 shadow-float border border-surface-container bg-white">
                  <div className="text-[15px] leading-relaxed text-on-surface-variant">
                    Searching reviews and composing a reply...
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="max-w-[94%] lg:max-w-[76%] rounded-lg rounded-tl-sm p-5 shadow-float border border-red-200 bg-red-50">
                  <div className="text-[15px] leading-relaxed text-red-700">{error}</div>
                </div>
              </div>
            )}

            {mode === 'route' && (
              <div className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
                Route mode uses the backend multi-stop planner between your typed start location and the final AI destination. After planning, the cards above switch to the actual connected stops from that route.
              </div>
            )}

            {followUps.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {followUps.slice(0, 4).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => void send(f)}
                    className="px-4 py-2 rounded-full border border-outline-variant/30 text-sm font-semibold text-on-surface-variant bg-surface-container-lowest active:scale-95 transition-transform"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-surface-container-low via-surface-container-low to-transparent">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-surface-container-lowest rounded-full p-2 flex items-center gap-2 shadow-float border border-white">
                <button
                  type="button"
                  className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  aria-label="Add"
                >
                  <PlusCircle className="h-5 w-5" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/60 font-semibold"
                  placeholder={placeholder}
                />
                <button
                  type="submit"
                  disabled={sending || planningKey !== null}
                  className={cn(
                    'w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-float active:scale-90 transition-transform',
                    sending || planningKey !== null ? 'opacity-80' : 'opacity-100'
                  )}
                  aria-label="Send"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
