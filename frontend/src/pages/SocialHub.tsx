import { MessageCircle, Send, Wifi, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getApiClient } from '@/api/getClient';
import type { ChatMessage, SocialSession } from '@/api/types';
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

export default function SocialHub() {
  usePageMeta({
    title: 'VibeMap — Social',
    description: 'Join live meetups and coordinate on the move.',
  });

  const profile = useVibeMapStore((s) => s.profile);
  const [sessions, setSessions] = useState<SocialSession[]>([]);
  const [activeId, setActiveId] = useState<string>('session_urban_pulse');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const active = useMemo(() => sessions.find((s) => s.id === activeId), [sessions, activeId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const api = getApiClient();
      const list = await api.listSocialSessions();
      if (cancelled) return;
      setSessions(list);
      const nextActive = list.find((x) => x.status === 'live')?.id ?? list[0]?.id;
      if (nextActive) setActiveId(nextActive);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const api = getApiClient();
      const list = await api.listSessionMessages(activeId);
      if (cancelled) return;
      setMessages(list);
    }
    if (!activeId) return;
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  async function join() {
    const api = getApiClient();
    await api.joinSocialSession(activeId, profile.displayName);
    const list = await api.listSocialSessions();
    setSessions(list);
  }

  async function ping() {
    const api = getApiClient();
    await api.sendSessionPing(activeId);
  }

  async function send() {
    if (!input.trim()) return;
    setSending(true);
    try {
      const api = getApiClient();
      const msg = await api.sendSessionMessage(activeId, input.trim());
      setMessages((m) => [...m, msg]);
      setInput('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full p-4 lg:p-8">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
          <section className="lg:col-span-4 h-full overflow-hidden rounded-lg bg-surface-container-lowest shadow-float">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-xl font-extrabold">Meetup Session</h2>
                <span className="px-3 py-1 bg-tertiary-container/30 text-on-tertiary-container text-[10px] font-bold rounded-full uppercase tracking-wider">
                  {active?.status === 'live' ? 'Live Now' : active?.status ?? '—'}
                </span>
              </div>

              <div className="mt-5 rounded-lg overflow-hidden bg-surface-container h-44 relative">
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
                <div className="absolute top-1/4 left-1/3 w-4 h-4 bg-tertiary rounded-full animate-ping" />
                <div className="absolute top-1/4 left-1/3 w-4 h-4 bg-tertiary rounded-full" />
              </div>

              <div className="mt-6">
                <p className="text-xs text-outline font-bold uppercase tracking-widest">Destination</p>
                <h3 className="font-headline text-lg font-extrabold mt-2">{active?.destinationName ?? '—'}</h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  {active ? `${active.participantCount} participants` : '—'}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void join()}
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90 text-white py-3 rounded-xl font-headline font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Wifi className="h-4 w-4" />
                  Join
                </button>
                <button
                  type="button"
                  onClick={() => void ping()}
                  disabled={loading}
                  className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface py-3 rounded-xl font-headline font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Zap className="h-4 w-4" />
                  Ping
                </button>
              </div>

              <div className="mt-8">
                <p className="text-xs text-outline font-bold uppercase tracking-widest">Sessions</p>
                <div className="mt-3 space-y-2">
                  {(sessions.length ? sessions : loading ? [] : []).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveId(s.id)}
                      className={cn(
                        'w-full text-left rounded-2xl p-4 transition-colors',
                        s.id === activeId ? 'bg-surface-container-low' : 'hover:bg-surface-container-low'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-extrabold">{s.destinationName}</div>
                          <div className="text-xs text-on-surface-variant mt-1">{s.participantCount} participants</div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-outline">{s.status}</span>
                      </div>
                    </button>
                  ))}
                  {loading && (
                    <div className="animate-pulse bg-surface-container-low rounded-2xl p-4 h-16" />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="lg:col-span-4 h-full overflow-hidden rounded-lg bg-surface-container-lowest shadow-float">
            <div className="p-6 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-xl font-extrabold">Participants</h2>
                <span className="text-sm font-extrabold text-primary">8 Online</span>
              </div>

              <div className="mt-6 flex-1 overflow-y-auto space-y-3">
                {[
                  { name: 'Minh Tran', status: 'Arriving in 5 mins', online: true },
                  { name: 'Linh Nguyen', status: 'Already there', online: true },
                  { name: 'Quang Pham', status: 'On the move', online: false },
                ].map((p) => (
                  <div key={p.name} className="p-4 bg-surface-container-low rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-extrabold text-primary">{p.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div
                          className={cn(
                            'absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full',
                            p.online ? 'bg-emerald-500' : 'bg-outline-variant'
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-extrabold">{p.name}</div>
                        <div className="text-xs text-primary font-bold mt-1">{p.status}</div>
                      </div>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
                        aria-label="Chat"
                      >
                        <MessageCircle className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-4 h-full overflow-hidden rounded-lg bg-surface-container-lowest shadow-float flex flex-col">
            <div className="p-6 border-b border-surface-container">
              <h2 className="font-headline text-xl font-extrabold">Session Chat</h2>
              <p className="text-sm text-on-surface-variant mt-1">Keep the group synced and the vibe aligned.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-2xl p-4',
                    m.role === 'user' ? 'bg-primary/10' : 'bg-surface-container-low'
                  )}
                >
                  <div className="text-sm font-semibold">{m.text}</div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-outline">{isoTime(m.createdAt)}</div>
                </div>
              ))}
              {!messages.length && !loading && (
                <div className="text-sm text-on-surface-variant">No messages yet.</div>
              )}
            </div>

            <div className="p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="bg-surface-container-lowest rounded-full p-2 flex items-center gap-2 shadow-float border border-white"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant/60 font-semibold px-2"
                  placeholder="Send a quick update…"
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
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

