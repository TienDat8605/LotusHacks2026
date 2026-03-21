import type { ApiClient } from '@/api/client';
import type {
  AssistantResponse,
  ChatMessage,
  UploadLocationRequest,
  UploadLocationResponse,
  Poi,
  RoutePlan,
  RoutePlanRequest,
  SocialSession,
} from '@/api/types';

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toSafeId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function samplePois(includeTrending: boolean): Poi[] {
  return [
    {
      id: 'poi_ben_thanh',
      name: 'Bến Thành Street Food',
      location: { lat: 10.772, lng: 106.698 },
      category: 'Street Food',
      rating: 4.6,
      badges: includeTrending ? ['Trending on TikTok'] : [],
    },
    {
      id: 'poi_cafe_apts',
      name: 'The Café Apartments',
      location: { lat: 10.775, lng: 106.705 },
      category: 'Cafe',
      rating: 4.8,
      badges: includeTrending ? ['Photogenic'] : [],
    },
    {
      id: 'poi_hidden_gin',
      name: 'Hidden Gin Bar',
      location: { lat: 10.781, lng: 106.703 },
      category: 'Cocktails',
      rating: 4.9,
      badges: ['Curator Pick'],
    },
  ];
}

function makeLegs(pois: Poi[], totalMinutes: number) {
  const legs = [] as RoutePlan['legs'];
  const perLeg = Math.max(10, Math.round(totalMinutes / Math.max(1, pois.length)));
  for (let i = 0; i < Math.max(1, pois.length - 1); i++) {
    const from = pois[i];
    const to = pois[i + 1];
    legs.push({
      fromPoiId: from?.id,
      toPoiId: to?.id,
      durationMinutes: perLeg,
      steps: [
        { instruction: 'Head towards the main boulevard', durationMinutes: Math.max(2, Math.round(perLeg * 0.2)) },
        { instruction: 'Follow the route along the riverside', durationMinutes: Math.max(3, Math.round(perLeg * 0.35)) },
        { instruction: 'Arrive at the next curated stop', durationMinutes: Math.max(2, Math.round(perLeg * 0.15)) },
      ],
    });
  }
  return legs;
}

type StubState = {
  assistantThreads: Record<string, ChatMessage[]>;
  sessionMessages: Record<string, ChatMessage[]>;
  sessions: SocialSession[];
};

const state: StubState = {
  assistantThreads: {},
  sessionMessages: {
    session_urban_pulse: [
      { id: id('m'), role: 'assistant', text: 'Welcome to Urban Pulse. Drop your ETA and I’ll keep the vibe aligned.', createdAt: nowIso() },
      { id: id('m'), role: 'user', text: 'On my way — 10 mins.', createdAt: nowIso() },
    ],
  },
  sessions: [
    { id: 'session_urban_pulse', destinationName: 'Pasteur Street Brewing Co.', participantCount: 12, status: 'live' },
    { id: 'session_rooftop', destinationName: 'Twilight Rooftop', participantCount: 6, status: 'scheduled' },
  ],
};

export function createStubApiClient(): ApiClient {
  return {
    planRoute: async (req: RoutePlanRequest) => {
      await sleep(550);
      const pois = samplePois(req.includeTrending);
      const total = Math.max(30, Math.min(8 * 60, req.timeBudgetMinutes));
      const plan: RoutePlan = {
        id: id('route'),
        title: req.includeTrending ? 'Urban Pulse (Trending Cut)' : 'Urban Pulse',
        pois,
        legs: makeLegs(pois, total),
        totalDurationMinutes: total,
      };
      return plan;
    },

    sendAssistantMessage: async (threadId: string, text: string) => {
      await sleep(450);
      const t = threadId || 'default';
      const prev = state.assistantThreads[t] ?? [];
      const next: ChatMessage[] = [
        ...prev,
        { id: id('u'), role: 'user', text, createdAt: nowIso() },
        {
          id: id('a'),
          role: 'assistant',
          text:
            'District 1 is buzzing. If you want a hidden-gem cocktail vibe, I can curate a route with one photogenic stop and one late-night spot.',
          createdAt: nowIso(),
        },
      ];
      state.assistantThreads[t] = next;

      const suggestedPois = samplePois(true);
      const suggestedPlan: AssistantResponse['suggestedPlan'] = {
        origin: 'Ben Thanh Market, District 1',
        destination: 'Hidden Gin Bar, District 1',
        timeBudgetMinutes: 150,
        transportMode: 'bike',
        includeTrending: true,
      };

      const resp: AssistantResponse = {
        messages: next,
        suggestedPois,
        suggestedPlan,
        followUps: ['What’s the dress code?', 'Show me more rooftops', 'Make it budget-friendly'],
      };

      return resp;
    },

    listSocialSessions: async () => {
      await sleep(220);
      return [...state.sessions];
    },

    joinSocialSession: async (sessionId: string) => {
      await sleep(250);
      const s = state.sessions.find((x) => x.id === sessionId);
      if (s) s.participantCount += 1;
      return { participantId: id('participant') };
    },

    listSessionMessages: async (sessionId: string) => {
      await sleep(180);
      return [...(state.sessionMessages[sessionId] ?? [])];
    },

    sendSessionMessage: async (sessionId: string, text: string) => {
      await sleep(200);
      const msg: ChatMessage = { id: id('m'), role: 'user', text, createdAt: nowIso() };
      state.sessionMessages[sessionId] = [...(state.sessionMessages[sessionId] ?? []), msg];
      return msg;
    },

    sendSessionPing: async () => {
      await sleep(140);
      return { ok: true };
    },

    uploadLocationVideo: async (req: UploadLocationRequest) => {
      await sleep(900);
      const fileStem = req.file.name.replace(/\.[^.]+$/, '') || 'upload';
      const videoId = `video_${toSafeId(fileStem)}_${Date.now().toString(16)}`;
      const resp: UploadLocationResponse = {
        jobId: id('upload_job'),
        videoId,
        status: 'queued',
        createdAt: nowIso(),
      };
      return resp;
    },
  };
}

