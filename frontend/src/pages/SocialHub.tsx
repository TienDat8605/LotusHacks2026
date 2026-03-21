import { MessageCircle, Send, Users, Wifi, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiClient } from '@/api/getClient';
import type { ChatMessage, Poi, SocialParticipant, SocialSession } from '@/api/types';
import { SocialMap } from '@/components/social/SocialMap';
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
  const setProfile = useVibeMapStore((s) => s.setProfile);
  const [sessions, setSessions] = useState<SocialSession[]>([]);
  const [activeId, setActiveId] = useState<string>('session_urban_pulse');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<SocialParticipant[]>([]);
  const [recommendations, setRecommendations] = useState<Poi[]>([]);
  const [participantId, setParticipantId] = useState<string>(() => {
    try {
      return localStorage.getItem('vibemap.participantId') ?? '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const geoWatchId = useRef<number | null>(null);

  const active = useMemo(() => sessions.find((s) => s.id === activeId), [sessions, activeId]);
  const onlineCount = useMemo(
    () => participants.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number').length,
    [participants]
  );
  const currentParticipant = useMemo(
    () => participants.find((p) => p.id === participantId) ?? participants.find((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [participantId, participants]
  );

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
      if (!activeId) return;
      const api = getApiClient();
      const list = await api.listParticipants(activeId);
      if (cancelled) return;
      setParticipants(list);
      const recs = await api.listRecommendations(activeId);
      if (cancelled) return;
      setRecommendations(recs);
    }
    void load();
    const t = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [activeId]);

  useEffect(() => {
    if (!participantId || !activeId) return;

    if (!('geolocation' in navigator)) return;

    if (geoWatchId.current != null) {
      navigator.geolocation.clearWatch(geoWatchId.current);
    }
    geoWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const api = getApiClient();
        void api.updateSocialLocation(activeId, participantId, latitude, longitude);
      },
      () => {
        return;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );

    return () => {
      if (geoWatchId.current != null) {
        navigator.geolocation.clearWatch(geoWatchId.current);
        geoWatchId.current = null;
      }
    };
  }, [activeId, participantId]);

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
    const resp = await api.joinSocialSession(activeId, profile.displayName);
    setParticipantId(resp.participantId);
    try {
      localStorage.setItem('vibemap.participantId', resp.participantId);
    } catch {
      return;
    }
    if (resp.avatarSeed) {
      setProfile({ avatarSeed: resp.avatarSeed });
    }
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
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 auto-rows-[minmax(0,1fr)]">
          <section className="lg:col-span-6 xl:col-span-7 h-full overflow-hidden rounded-[32px] bg-surface-container-lowest shadow-float border border-white/70">
            <div className="h-full p-6 lg:p-7 flex flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-outline">Live meetup</div>
                  <h2 className="mt-2 font-headline text-2xl lg:text-3xl font-extrabold">{active?.destinationName ?? 'Meetup Session'}</h2>
                  <p className="mt-2 text-sm text-on-surface-variant max-w-xl">
                    Coordinate the group in real time, keep everyone visible on the map, and move toward the next vibe-worthy stop.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-tertiary-container/25 px-4 py-2 text-on-tertiary-container">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.24em]">
                    {active?.status === 'live' ? 'Live now' : active?.status ?? 'Standby'}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-3xl bg-surface-container-low p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">People synced</div>
                  <div className="mt-2 text-2xl font-headline font-extrabold text-on-surface">{active ? active.participantCount : 0}</div>
                  <div className="mt-1 text-xs text-on-surface-variant">Active in this meetup room</div>
                </div>
                <div className="rounded-3xl bg-surface-container-low p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Sharing live</div>
                  <div className="mt-2 text-2xl font-headline font-extrabold text-on-surface">{onlineCount}</div>
                  <div className="mt-1 text-xs text-on-surface-variant">Visible on the minimap right now</div>
                </div>
                <div className="rounded-3xl bg-surface-container-low p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">You</div>
                  <div className="mt-2 text-lg font-headline font-extrabold text-on-surface truncate">
                    {currentParticipant?.displayName ?? profile.displayName}
                  </div>
                  <div className="mt-1 text-xs text-on-surface-variant">
                    {participantId ? 'Location pulse enabled' : 'Join to start sharing'}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex-1 min-h-0">
                <SocialMap
                  center={{
                    lat:
                      currentParticipant?.lat ??
                      participants.find((p) => typeof p.lat === 'number')?.lat ??
                      recommendations[0]?.location.lat ??
                      10.7757,
                    lng:
                      currentParticipant?.lng ??
                      participants.find((p) => typeof p.lng === 'number')?.lng ??
                      recommendations[0]?.location.lng ??
                      106.7008,
                  }}
                  participants={participants}
                  recommendations={recommendations}
                  currentParticipantId={participantId}
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void join()}
                  disabled={loading}
                  className="min-w-36 bg-primary hover:bg-primary/90 text-white px-5 py-3.5 rounded-2xl font-headline font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Wifi className="h-4 w-4" />
                  Join meetup
                </button>
                <button
                  type="button"
                  onClick={() => void ping()}
                  disabled={loading}
                  className="min-w-36 bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-5 py-3.5 rounded-2xl font-headline font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Zap className="h-4 w-4" />
                  Ping group
                </button>
              </div>
            </div>
          </section>

          <section className="lg:col-span-3 xl:col-span-2 h-full overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-float border border-white/70">
            <div className="p-5 h-full flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline text-lg font-extrabold">Participants</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Compact live roster</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-primary">
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-extrabold">{onlineCount}</span>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto space-y-2.5 pr-1">
                {participants.map((p) => {
                  const online = typeof p.lat === 'number' && typeof p.lng === 'number';
                  const isCurrent = p.id === participantId;
                  return (
                    <div key={p.id} className="rounded-2xl bg-surface-container-low px-3.5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div
                            className={cn(
                              'h-10 w-10 rounded-full flex items-center justify-center text-xs font-extrabold text-white',
                              isCurrent ? 'bg-secondary' : 'bg-primary'
                            )}
                          >
                            {(p.avatarSeed || p.displayName).slice(0, 2).toUpperCase()}
                          </div>
                          <div
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white',
                              online ? 'bg-emerald-500' : 'bg-outline-variant'
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-extrabold text-on-surface">{p.displayName}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-on-surface-variant">
                            {isCurrent ? 'You' : online ? 'Live location' : 'Offline'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="h-9 w-9 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
                          aria-label="Chat"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="lg:col-span-3 xl:col-span-3 h-full overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-float border border-white/70 flex flex-col">
            <div className="p-5 border-b border-surface-container">
              <h2 className="font-headline text-lg font-extrabold">Session Chat</h2>
              <p className="text-xs text-on-surface-variant mt-1">Quick updates for the whole group.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-2xl px-4 py-3',
                    m.role === 'user' ? 'bg-primary/10' : 'bg-surface-container-low'
                  )}
                >
                  <div className="text-sm font-semibold text-on-surface">{m.text}</div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-outline">{isoTime(m.createdAt)}</div>
                </div>
              ))}
              {!messages.length && !loading && <div className="text-sm text-on-surface-variant">No messages yet.</div>}
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

          <section className="lg:col-span-12 overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-float border border-white/70">
            <div className="p-5 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline text-lg font-extrabold">Recommended POIs</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Smaller cards so the meetup map stays the hero.</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Closest for the group</span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {recommendations.slice(0, 4).map((poi) => (
                  <div key={poi.id} className="bg-surface-container-low rounded-2xl p-4">
                    <div className="text-sm font-extrabold text-on-surface line-clamp-1">{poi.name}</div>
                    <div className="text-xs text-on-surface-variant mt-1 line-clamp-2">{poi.address ?? poi.city ?? '—'}</div>
                    {poi.videoUrl ? (
                      <a
                        href={poi.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex mt-3 bg-primary text-white px-3 py-2 rounded-full text-xs font-extrabold"
                      >
                        Open TikTok
                      </a>
                    ) : null}
                  </div>
                ))}
                {!recommendations.length ? (
                  <div className="text-sm text-on-surface-variant">Share location in the room to get recommendations.</div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="lg:col-span-12 overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-float border border-white/70">
            <div className="p-5 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline text-lg font-extrabold">Sessions</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Switch between active meetup rooms.</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Available rooms</span>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {(sessions.length ? sessions : loading ? [] : []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      'text-left rounded-2xl p-4 transition-colors bg-surface-container-low hover:bg-surface-container-high',
                      s.id === activeId && 'ring-2 ring-primary/30 bg-primary/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-on-surface line-clamp-1">{s.destinationName}</div>
                        <div className="text-xs text-on-surface-variant mt-1">{s.participantCount} participants</div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">{s.status}</span>
                    </div>
                  </button>
                ))}
                {loading && <div className="animate-pulse bg-surface-container-low rounded-2xl p-4 h-20" />}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
