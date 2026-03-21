import {
  Compass,
  Flame,
  Leaf,
  LogIn,
  LogOut,
  Plus,
  Send,
  Sparkles,
  TrafficCone,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiClient } from '@/api/getClient';
import { resolveApiBase } from '@/api/baseUrl';
import type { ChatMessage, Poi, SocialEvent, SocialParticipant, SocialSession } from '@/api/types';
import { SocialMap } from '@/components/social/SocialMap';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cn } from '@/lib/utils';
import { useVibeMapStore } from '@/stores/vibemapStore';

const apiBase = resolveApiBase(import.meta.env.VITE_API_BASE_URL as string | undefined);

function isoTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function relativeTime(ts: string) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.max(0, Math.round(diff / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day ago`;
  } catch {
    return 'Just now';
  }
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'KP';
  return `${parts[0]?.[0] ?? 'K'}${parts[1]?.[0] ?? parts[0]?.[1] ?? 'P'}`.toUpperCase();
}

function seedColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 72%, 52%)`;
}

function distanceLabel(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.max(1, Math.round(meters))}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 6371000 * c;
}

function generatedRecommendationImage(poi: Poi) {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    `${poi.name}, Ho Chi Minh City social meetup hotspot, modern editorial travel photography, vibrant urban nightlife, cinematic lighting, realistic`
  )}&image_size=landscape_4_3`;
}

function recommendationImageSrc(poi: Poi) {
  const raw = (poi.imageUrl ?? '').trim();
  if (!raw) return generatedRecommendationImage(poi);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, '');
  if (!normalized) return generatedRecommendationImage(poi);
  return apiBase ? `${apiBase}/assets/${normalized}` : `/assets/${normalized}`;
}

type RecommendationAccent = {
  icon: typeof Compass;
  label: string;
  tone: string;
};

type FeedItem =
  | { id: string; type: 'status'; icon: typeof Zap; tone: string; text: string; meta: string }
  | { id: string; type: 'message'; message: ChatMessage; participant?: SocialParticipant };

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

function feedItems(messages: ChatMessage[], participants: SocialParticipant[]): FeedItem[] {
  const items: FeedItem[] = [];

  const latestParticipant = participants[0];
  if (latestParticipant) {
    items.push({
      id: `status-${latestParticipant.id}`,
      type: 'status',
      icon: Zap,
      tone: 'bg-primary/5 border-primary/10 text-slate-700',
      text: `${latestParticipant.displayName} is active in the session.`,
      meta: relativeTime(latestParticipant.lastSeen),
    });
  }

  messages.slice(-4).forEach((message) => {
    const participant = participants.find((entry) => entry.displayName === message.role || entry.id === message.role);
    items.push({ id: message.id, type: 'message', message, participant });
  });

  const delayedParticipant = participants.find((participant) => typeof participant.lat !== 'number' || typeof participant.lng !== 'number');
  if (delayedParticipant) {
    items.push({
      id: `traffic-${delayedParticipant.id}`,
      type: 'status',
      icon: TrafficCone,
      tone: 'bg-slate-100 border-slate-200 text-slate-500',
      text: `${delayedParticipant.displayName} has not shared live location yet.`,
      meta: 'Waiting for update',
    });
  }

  if (messages.length) {
    items.push({
      id: 'bot-vibe',
      type: 'status',
      icon: Sparkles,
      tone: 'bg-secondary-container/10 border-secondary/10 text-secondary-dim',
      text: 'Vibe check: the meetup room is active and nearby recommendations are ready.',
      meta: relativeTime(messages[messages.length - 1].createdAt),
    });
  }

  return items.slice(0, 5);
}

function applySocialEvent(
  event: SocialEvent,
  setParticipants: React.Dispatch<React.SetStateAction<SocialParticipant[]>>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setRecommendations: React.Dispatch<React.SetStateAction<Poi[]>>,
  setSessions: React.Dispatch<React.SetStateAction<SocialSession[]>>,
  setActiveId: React.Dispatch<React.SetStateAction<string>>
) {
  if (event.type === 'snapshot') {
    if (event.participants) setParticipants(event.participants);
    if (event.messages) setMessages(event.messages);
    if (event.recommendations) setRecommendations(event.recommendations.slice(0, 3));
    if (event.session) {
      setActiveId(event.session.id);
      setSessions((current) => {
        const next = current.filter((entry) => entry.id !== event.session?.id);
        return [event.session as SocialSession, ...next];
      });
    }
    return;
  }

  if (event.message) {
    setMessages((current) => [...current, event.message as ChatMessage]);
  }
}

export default function SocialHub() {
  usePageMeta({
    title: 'Kompas — Social',
    description: 'Join live meetups and coordinate on the move.',
  });

  const profile = useVibeMapStore((s) => s.profile);
  const setProfile = useVibeMapStore((s) => s.setProfile);
  const [sessions, setSessions] = useState<SocialSession[]>([]);
  const [activeId, setActiveId] = useState<string>('');
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
  const [joinedSessionId, setJoinedSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem('vibemap.joinedSessionId') ?? '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const geoWatchId = useRef<number | null>(null);
  const lastSentLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const active = useMemo(() => sessions.find((s) => s.id === activeId), [sessions, activeId]);
  const onlineParticipants = useMemo(
    () => participants.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [participants]
  );
  const selfParticipant = useMemo(
    () => participants.find((p) => p.id === participantId),
    [participants, participantId]
  );
  const onlineCount = onlineParticipants.length;
  const currentParticipant = useMemo(
    () => participants.find((p) => p.id === participantId) ?? onlineParticipants[0],
    [participantId, participants, onlineParticipants]
  );
  const userLocationForDistance = useMemo(() => {
    if (currentLocation) return currentLocation;
    if (!selfParticipant) return null;
    if (typeof selfParticipant.lat !== 'number' || typeof selfParticipant.lng !== 'number') return null;
    return { lat: selfParticipant.lat, lng: selfParticipant.lng };
  }, [currentLocation, selfParticipant]);
  const nearbyFriends = useMemo(() => participants.slice(0, 4), [participants]);
  const sessionFeed = useMemo(() => feedItems(messages, participants), [messages, participants]);
  const isInActiveRoom = Boolean(participantId && joinedSessionId && joinedSessionId === activeId);
  const sessionDisplayName = useMemo(() => {
    const raw = (active?.destinationName ?? '').trim();
    if (!raw || raw.toLowerCase() === 'new meetup room') return 'Live Meetup Room';
    return raw;
  }, [active?.destinationName]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const api = getApiClient();
      const list = await api.listSocialSessions();
      if (cancelled) return;
      setSessions(list);
      const joinedActive = joinedSessionId && list.some((x) => x.id === joinedSessionId) ? joinedSessionId : '';
      const nextActive = joinedActive || list.find((x) => x.status === 'live')?.id || list[0]?.id || '';
      setActiveId((current) => current || nextActive);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const api = getApiClient();
    const unsubscribe = api.subscribeToSocialSession(activeId, (event) => {
      applySocialEvent(event, setParticipants, setMessages, setRecommendations, setSessions, setActiveId);
    });
    return () => {
      unsubscribe();
    };
  }, [activeId]);

  useEffect(() => {
    if (!selfParticipant) return;
    if (typeof selfParticipant.lat !== 'number' || typeof selfParticipant.lng !== 'number') return;
    if (currentLocation) return;
    setCurrentLocation({ lat: selfParticipant.lat, lng: selfParticipant.lng });
  }, [selfParticipant, currentLocation]);

  useEffect(() => {
    if (!participantId || !activeId) return;
    if (!('geolocation' in navigator)) return;

    const api = getApiClient();
    const minMoveMeters = 12;
    lastSentLocationRef.current = null;

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      if (Number.isFinite(accuracy) && accuracy > 120) return;

      const next = { lat: latitude, lng: longitude };
      const prev = lastSentLocationRef.current;
      if (prev && metersBetween(prev, next) < minMoveMeters) {
        setCurrentLocation(prev);
        return;
      }

      lastSentLocationRef.current = next;
      setCurrentLocation(next);
      void api.updateSocialLocation(activeId, participantId, next.lat, next.lng);
    };

    if (geoWatchId.current != null) {
      navigator.geolocation.clearWatch(geoWatchId.current);
    }

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {
        return;
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );

    geoWatchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => {
        return;
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );

    return () => {
      if (geoWatchId.current != null) {
        navigator.geolocation.clearWatch(geoWatchId.current);
        geoWatchId.current = null;
      }
    };
  }, [activeId, participantId]);

  async function join(sessionId = activeId) {
    if (!sessionId) return;
    const api = getApiClient();
    const resp = await api.joinSocialSession(sessionId, profile.displayName);
    setParticipantId(resp.participantId);
    setJoinedSessionId(sessionId);
    setCurrentLocation(null);
    lastSentLocationRef.current = null;
    try {
      localStorage.setItem('vibemap.participantId', resp.participantId);
      localStorage.setItem('vibemap.joinedSessionId', sessionId);
    } catch {
      return;
    }
    if (resp.avatarSeed) {
      setProfile({ avatarSeed: resp.avatarSeed });
    }
  }

  async function createRoom() {
    const api = getApiClient();
    const session = await api.createSocialSession(roomName);
    setSessions((current) => [session, ...current.filter((entry) => entry.id !== session.id)]);
    setActiveId(session.id);
    setRoomName('');
    await join(session.id);
  }

  async function joinByCode() {
    if (!joinCode.trim()) return;
    const api = getApiClient();
    const resp = await api.joinSocialSessionByCode(joinCode.trim().toUpperCase(), profile.displayName);
    setSessions((current) => [resp.session, ...current.filter((entry) => entry.id !== resp.session.id)]);
    setActiveId(resp.session.id);
    setParticipantId(resp.participantId);
    setJoinedSessionId(resp.session.id);
    setCurrentLocation(null);
    lastSentLocationRef.current = null;
    setJoinCode('');
    try {
      localStorage.setItem('vibemap.participantId', resp.participantId);
      localStorage.setItem('vibemap.joinedSessionId', resp.session.id);
    } catch {
      return;
    }
    if (resp.avatarSeed) {
      setProfile({ avatarSeed: resp.avatarSeed });
    }
  }

  async function send() {
    if (!input.trim() || !activeId) return;
    setSending(true);
    try {
      const api = getApiClient();
      await api.sendSessionMessage(activeId, input.trim());
      setInput('');
    } finally {
      setSending(false);
    }
  }

  function exitRoom() {
    setParticipantId('');
    setJoinedSessionId('');
    setCurrentLocation(null);
    lastSentLocationRef.current = null;
    try {
      localStorage.removeItem('vibemap.participantId');
      localStorage.removeItem('vibemap.joinedSessionId');
    } catch {
      return;
    }
  }

  const mapCenter = {
    lat: currentLocation?.lat ?? selfParticipant?.lat ?? currentParticipant?.lat ?? onlineParticipants[0]?.lat ?? recommendations[0]?.location.lat ?? 10.7757,
    lng: currentLocation?.lng ?? selfParticipant?.lng ?? currentParticipant?.lng ?? onlineParticipants[0]?.lng ?? recommendations[0]?.location.lng ?? 106.7008,
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="h-full px-4 pb-4 pt-4 lg:px-8 lg:pb-8 lg:pt-6">
        <div className="grid h-full grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8">
          <section className="xl:col-span-8 flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/70 bg-surface-container-lowest shadow-float">
            <div className="relative min-h-[360px] flex-1 overflow-hidden bg-surface-container">
              <SocialMap
                center={mapCenter}
                participants={participants}
                recommendations={recommendations.slice(0, 3)}
                currentParticipantId={participantId}
                currentLocation={currentLocation ?? undefined}
                className="h-full rounded-none border-0 shadow-none"
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />

              <div className="absolute left-6 top-6 flex flex-col gap-3">
                <div className="inline-flex items-center gap-3 rounded-full bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-on-background">Live session</span>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="font-headline text-2xl font-black text-white drop-shadow-md lg:text-3xl">
                    {sessionDisplayName}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-slate-100">
                    Room code: {active?.code ?? '—'} • {active?.participantCount ?? 0} participants joined
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-surface p-6 lg:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-primary" />
                  <h3 className="font-headline text-lg font-bold text-on-surface">Nearby Recommendations</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recommendations.slice(0, 3).map((poi, index) => {
                  const accent = recommendationAccent(poi, index);
                  const AccentIcon = accent.icon;
                  const recommendationDistance = userLocationForDistance
                    ? distanceLabel(metersBetween(userLocationForDistance, poi.location))
                    : '—';
                  return (
                    <article
                      key={poi.id}
                      className="group rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all hover:border-primary/30"
                    >
                      <div className="mb-3 h-24 overflow-hidden rounded-xl bg-slate-100">
                        <img
                          alt={poi.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          src={recommendationImageSrc(poi)}
                          onError={(event) => {
                            const fallback = generatedRecommendationImage(poi);
                            if (event.currentTarget.src !== fallback) {
                              event.currentTarget.src = fallback;
                            }
                          }}
                        />
                      </div>
                      <h4 className="truncate text-sm font-bold text-on-surface">{poi.name}</h4>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-medium text-slate-500">{recommendationDistance}</span>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold', accent.tone)}>
                          <AccentIcon className="h-3.5 w-3.5" />
                          {accent.label}
                        </span>
                      </div>
                    </article>
                  );
                })}
                {!recommendations.length && !loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-on-surface-variant">
                    Share live location in the room to unlock nearby recommendations.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="xl:col-span-4 flex min-h-0 flex-col gap-6">
            <section className="rounded-[28px] border border-slate-200/60 bg-white p-5 shadow-sm">
              {isInActiveRoom ? (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <h3 className="font-headline text-base font-extrabold text-on-surface">Meetup room</h3>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      You are in <span className="font-bold text-on-surface">{sessionDisplayName}</span>.
                    </p>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Code: <span className="font-bold uppercase text-on-surface">{active?.code ?? '—'}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exitRoom}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-extrabold text-on-surface"
                  >
                    <LogOut className="h-4 w-4" />
                    Exit room
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <h3 className="font-headline text-base font-extrabold text-on-surface">Meetup room</h3>
                    <p className="mt-1 text-xs text-on-surface-variant">Create a room or join instantly with a code.</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Room name"
                      className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void createRoom()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Create
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter room code"
                      className="w-full rounded-2xl bg-surface px-4 py-3 text-sm uppercase outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void joinByCode()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-extrabold text-on-surface"
                    >
                      <LogIn className="h-4 w-4" />
                      Join
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200/60 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-4">
                <div className="flex -space-x-3 overflow-hidden">
                  {nearbyFriends.slice(0, 3).map((participant) => (
                    <div
                      key={participant.id}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white text-[10px] font-extrabold text-white"
                      style={{ backgroundColor: seedColor(participant.avatarSeed || participant.displayName) }}
                    >
                      {initials(participant.displayName)}
                    </div>
                  ))}
                  {participants.length > 3 ? (
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white">
                      +{participants.length - 3}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{onlineCount} active</span>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {sessionFeed.map((item: FeedItem) => {
                  if (item.type === 'message') {
                    const author = item.participant?.displayName ?? (item.message.role === 'assistant' ? 'Kompas Bot' : profile.displayName);
                    return (
                      <div key={item.id} className="flex items-start gap-4">
                        <div
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                          style={{ backgroundColor: seedColor(author) }}
                        >
                          {initials(author)}
                        </div>
                        <div className="flex-1 rounded-2xl rounded-tl-none bg-surface p-3">
                          <p className="text-xs text-on-background">{item.message.text}</p>
                          <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-slate-400">
                            {author} • {relativeTime(item.message.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const StatusIcon = item.icon;
                  return (
                    <div key={item.id} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className={cn('flex-1 rounded-2xl rounded-tl-none border p-3', item.tone)}>
                        <p className="text-xs leading-relaxed">{item.text}</p>
                        <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-slate-400">{item.meta}</span>
                      </div>
                    </div>
                  );
                })}
                {!sessionFeed.length && !loading ? <div className="text-sm text-on-surface-variant">No live updates yet.</div> : null}
              </div>

              <div className="border-t border-slate-100 bg-white p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      className="w-full rounded-full border-none bg-surface-container-low px-4 py-2.5 text-xs outline-none ring-0 transition-all placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary/20"
                      placeholder="Message session..."
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-all active:scale-90"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </section>

            <section className="rounded-[28px] bg-surface-container-low p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Friends Nearby</h3>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-primary">
                  <Users className="h-3.5 w-3.5" />
                  {participants.length}
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {nearbyFriends.map((participant) => (
                  <div key={participant.id} className="flex flex-shrink-0 flex-col items-center gap-2">
                    <div
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-full text-xs font-extrabold text-white',
                        participant.id === participantId && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-low'
                      )}
                      style={{ backgroundColor: seedColor(participant.avatarSeed || participant.displayName) }}
                    >
                      {initials(participant.displayName)}
                    </div>
                    <span className="max-w-14 truncate text-[10px] font-semibold text-slate-500">{participant.displayName}</span>
                  </div>
                ))}
                {!nearbyFriends.length && !loading ? <div className="text-xs text-on-surface-variant">Join the meetup to see nearby friends.</div> : null}
              </div>
            </section>

          </div>
        </div>

        <section className="mt-6 rounded-[28px] border border-white/70 bg-surface-container-lowest p-5 shadow-float lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-lg font-extrabold text-on-surface">Sessions</h2>
              <p className="mt-1 text-xs text-on-surface-variant">Switch between active meetup rooms.</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">Available rooms</span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(sessions.length ? sessions : loading ? [] : []).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveId(session.id)}
                className={cn(
                  'rounded-2xl bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container-high',
                  session.id === activeId && 'bg-primary/5 ring-2 ring-primary/30'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-sm font-extrabold text-on-surface">{session.destinationName}</div>
                    <div className="mt-1 text-xs text-on-surface-variant">{session.participantCount} participants • {session.code}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-outline">{session.status}</span>
                </div>
              </button>
            ))}
            {loading ? <div className="h-20 animate-pulse rounded-2xl bg-surface-container-low p-4" /> : null}
          </div>
        </section>

      </div>

      <div className="sr-only">Last message time {messages.length ? isoTime(messages[messages.length - 1].createdAt) : 'none'}</div>
    </div>
  );
}
