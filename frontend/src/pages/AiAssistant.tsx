import { Bot, PlusCircle, Send, Sparkles } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

export default function AiAssistant() {
  usePageMeta({
    title: 'VibeMap - AI Assistant',
    description: 'Ask for places and routes by vibe.',
  });

  const navigate = useNavigate();
  const prefs = useVibeMapStore((s) => s.preferences);
  const setLastPlan = useVibeMapStore((s) => s.setLastPlanRequest);
  const setRoute = useVibeMapStore((s) => s.setRoute);
  const assistant = useVibeMapStore((s) => s.assistant);
  const setAssistantState = useVibeMapStore((s) => s.setAssistantState);
  const replaceAssistantFromResponse = useVibeMapStore((s) => s.replaceAssistantFromResponse);

  const threadId = 'default';
  const [mode, setMode] = useState<'poi' | 'route'>('poi');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planningPoiId, setPlanningPoiId] = useState<string | null>(null);

  const messages = assistant.messages;
  const suggestedPois = assistant.suggestedPois;
  const suggestedPlan = assistant.suggestedPlan;
  const followUps = assistant.followUps;

  const placeholder = useMemo(
    () => (mode === 'poi' ? 'Where to next, explorer?' : 'Plan a route: vibe, time budget, and transport'),
    [mode]
  );

  useEffect(() => {
    if (messages.length) return;
    setAssistantState({
      messages: [
        {
          id: 'seed',
          role: 'assistant',
          text: 'Tell me your vibe. I can search review-based places, show matching shops, and send you straight to a visualized route.',
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }, [messages.length, setAssistantState]);

  async function send(text: string) {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    setInput('');
    const trimmed = text.trim();
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
        mode === 'route'
          ? `Help me turn this into a route plan with a clear destination suggestion: ${trimmed}`
          : trimmed;
      const resp = await api.sendAssistantMessage(threadId, outbound);
      replaceAssistantFromResponse({
        ...resp,
        suggestedPlan:
          resp.suggestedPlan ??
          (mode === 'route' && resp.suggestedPois?.[0]
            ? {
                destination: resp.suggestedPois[0].name,
                includeTrending: true,
              }
            : null),
      });
    } catch (err) {
      setAssistantState({ messages });
      setError(err instanceof Error ? err.message : 'Could not reach the assistant service.');
    } finally {
      setSending(false);
    }
  }

  async function planRouteToPoi(poi: Poi) {
    setPlanningPoiId(poi.id);
    setError(null);

    try {
      const api = getApiClient();
      const request: RoutePlanRequest = {
        origin: 'District 1, Ben Thanh',
        destination: poi.address ?? poi.name,
        timeBudgetMinutes: prefs.defaultTimeBudgetMinutes,
        transportMode: prefs.defaultTransportMode,
        includeTrending: true,
      };
      const route = await api.planRoute(request);
      setLastPlan(request);
      setRoute(route);
      navigate(`/results/${encodeURIComponent(route.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan a route to this place.');
    } finally {
      setPlanningPoiId(null);
    }
  }

  async function useSuggestedPlan(plan: Partial<RoutePlanRequest>) {
    setError(null);
    setPlanningPoiId('suggested-plan');

    try {
      const api = getApiClient();
      const request: RoutePlanRequest = {
        origin: plan.origin ?? 'District 1, Ben Thanh',
        destination: plan.destination ?? suggestedPois[0]?.name ?? 'District 1',
        timeBudgetMinutes: plan.timeBudgetMinutes ?? prefs.defaultTimeBudgetMinutes,
        transportMode: plan.transportMode ?? prefs.defaultTransportMode,
        includeTrending: plan.includeTrending ?? true,
      };
      const route = await api.planRoute(request);
      setLastPlan(request);
      setRoute(route);
      navigate(`/results/${encodeURIComponent(route.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the suggested route.');
    } finally {
      setPlanningPoiId(null);
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
          </div>

          <div className="flex-1 overflow-y-auto px-4 lg:px-6 space-y-6 pb-44">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.role === 'assistant' ? 'justify-start' : 'justify-end')}>
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

            {suggestedPois.length > 0 && (
              <div className="space-y-4">
                <div className="px-1">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-outline">Suggested places</div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  {suggestedPois.slice(0, 3).map((p, idx) => (
                    <div
                      key={p.id}
                      className={cn(
                        'col-span-12 bg-white rounded-lg overflow-hidden shadow-float border border-surface-container',
                        idx === 1 ? 'lg:col-span-11 lg:col-start-2' : 'lg:col-span-11'
                      )}
                    >
                      <div className="relative h-28 bg-[radial-gradient(circle_at_30%_30%,rgba(0,75,227,0.14),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(185,0,55,0.12),transparent_55%)]">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
                        {p.badges?.[0] && (
                          <div className="absolute top-3 left-3 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            {p.badges[0]}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-headline font-bold text-lg text-on-surface">{p.name}</h3>
                        <p className="text-on-surface-variant text-sm mt-1">
                          {p.category ?? 'Curated'}
                          {p.rating ? ` - ${p.rating.toFixed(1)} stars` : ''}
                        </p>
                        {(p.address || p.city) && (
                          <p className="text-on-surface-variant text-sm mt-3 leading-relaxed">
                            {[p.address, p.city].filter(Boolean).join(' - ')}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => void planRouteToPoi(p)}
                          disabled={planningPoiId !== null}
                          className="w-full mt-4 py-3 rounded-full bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70"
                        >
                          <Send className="h-4 w-4" />
                          {planningPoiId === p.id ? 'Planning route...' : 'Plan route here'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestedPlan && (
              <button
                type="button"
                onClick={() => void useSuggestedPlan(suggestedPlan)}
                disabled={planningPoiId !== null}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform disabled:opacity-70"
              >
                {planningPoiId === 'suggested-plan' ? 'Building route...' : 'Use suggested route plan'}
              </button>
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
                  disabled={sending || planningPoiId !== null}
                  className={cn(
                    'w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-float active:scale-90 transition-transform',
                    sending || planningPoiId !== null ? 'opacity-80' : 'opacity-100'
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
