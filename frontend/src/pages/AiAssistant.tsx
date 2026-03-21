import { Bot, PlusCircle, Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

export default function AiAssistant() {
  usePageMeta({
    title: 'VibeMap — AI Assistant',
    description: 'Ask for places and routes by vibe.',
  });

  const navigate = useNavigate();
  const prefs = useVibeMapStore((s) => s.preferences);
  const setLastPlan = useVibeMapStore((s) => s.setLastPlanRequest);

  const threadId = 'default';
  const [mode, setMode] = useState<'poi' | 'route'>('poi');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestedPois, setSuggestedPois] = useState<Poi[]>([]);
  const [suggestedPlan, setSuggestedPlan] = useState<Partial<RoutePlanRequest> | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const placeholder = useMemo(
    () => (mode === 'poi' ? 'Where to next, explorer?' : 'Plan a route: vibe, time budget, and transport'),
    [mode]
  );

  useEffect(() => {
    if (messages.length) return;
    setMessages([
      {
        id: 'seed',
        role: 'assistant',
        text:
          'Tell me your vibe. I can recommend photogenic stops, hidden gems, or craft-cocktail corners — then turn it into a curated route.',
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim()) return;
    setSending(true);
    setInput('');
    try {
      const api = getApiClient();
      const resp = await api.sendAssistantMessage(threadId, text.trim());
      setMessages(resp.messages);
      setSuggestedPois(resp.suggestedPois ?? []);
      setSuggestedPlan(resp.suggestedPlan ?? null);
      setFollowUps(resp.followUps ?? []);
    } finally {
      setSending(false);
    }
  }

  function handoffToPlanner(plan: Partial<RoutePlanRequest>) {
    const req: RoutePlanRequest = {
      origin: plan.origin ?? 'District 1, Ben Thanh',
      destination: plan.destination ?? 'District 1',
      timeBudgetMinutes: plan.timeBudgetMinutes ?? prefs.defaultTimeBudgetMinutes,
      transportMode: plan.transportMode ?? prefs.defaultTransportMode,
      includeTrending: plan.includeTrending ?? true,
    };
    setLastPlan(req);
    navigate('/plan');
  }

  return (
    <div className="h-full w-full overflow-hidden relative">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(0,75,227,0.20),transparent_40%),radial-gradient(circle_at_60%_55%,rgba(185,0,55,0.14),transparent_45%),radial-gradient(circle_at_35%_85%,rgba(0,103,99,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/20 to-background" />
      </div>

      <div className="relative z-10 h-full flex flex-col justify-end">
        <div className="bg-surface-container-low/95 backdrop-blur-2xl rounded-t-lg mx-2 shadow-ambient border-t border-white/20 h-[78vh] lg:h-[82vh] flex flex-col">
          <div className="flex flex-col items-center pt-3 pb-4">
            <div className="w-10 h-1 bg-surface-container-highest rounded-full mb-6" />
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

          <div className="flex-1 overflow-y-auto px-4 lg:px-6 space-y-8 pb-36">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.role === 'assistant' ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[92%] lg:max-w-[70%] rounded-lg p-5 shadow-float border border-surface-container',
                    m.role === 'assistant'
                      ? 'bg-white rounded-tl-sm'
                      : 'bg-primary text-white border-transparent rounded-tr-sm'
                  )}
                >
                  <div className={cn('text-[15px] leading-relaxed', m.role === 'assistant' ? 'text-on-surface' : 'text-white')}>
                    {m.text}
                  </div>
                  <div className={cn('mt-3 text-[10px] font-bold opacity-70', m.role === 'assistant' ? 'text-outline' : 'text-white')}>
                    {isoTime(m.createdAt)}
                  </div>
                </div>
              </div>
            ))}

            {suggestedPois.length > 0 && (
              <div className="grid grid-cols-12 gap-4">
                {suggestedPois.slice(0, 2).map((p, idx) => (
                  <div
                    key={p.id}
                    className={cn(
                      'col-span-11 bg-white rounded-lg overflow-hidden shadow-float border border-surface-container',
                      idx % 2 === 1 ? 'col-start-2' : 'col-start-1'
                    )}
                  >
                    <div className="relative h-36 bg-[radial-gradient(circle_at_30%_30%,rgba(0,75,227,0.14),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(185,0,55,0.12),transparent_55%)]">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
                      {p.badges?.[0] && (
                        <div className="absolute top-3 left-3 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                          {p.badges[0]}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-headline font-bold text-lg text-on-surface">{p.name}</h3>
                      <p className="text-on-surface-variant text-sm mt-1 mb-4">
                        {p.category ?? 'Curated'}
                        {p.rating ? ` · ${p.rating.toFixed(1)} ★` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => handoffToPlanner({ destination: p.name, includeTrending: true })}
                        className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      >
                        <Send className="h-4 w-4" />
                        Plan route here
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {suggestedPlan && (
              <button
                type="button"
                onClick={() => handoffToPlanner(suggestedPlan)}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-full font-headline font-extrabold shadow-float active:scale-95 transition-transform"
              >
                Use suggested route plan
              </button>
            )}

            {followUps.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {followUps.slice(0, 4).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => send(f)}
                    className="px-4 py-2 rounded-full border border-outline-variant/30 text-sm font-semibold text-on-surface-variant bg-surface-container-lowest active:scale-95 transition-transform"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 pb-10 bg-gradient-to-t from-surface-container-low via-surface-container-low to-transparent">
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
                  disabled={sending}
                  className={cn(
                    'w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-float active:scale-90 transition-transform',
                    sending ? 'opacity-80' : 'opacity-100'
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

