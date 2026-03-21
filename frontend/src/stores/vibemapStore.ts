import { create } from 'zustand';
import type { AssistantResponse, ChatMessage, Poi, RoutePlan, RoutePlanRequest, TransportMode } from '@/api/types';

type Profile = {
  displayName: string;
  avatarSeed: string;
};

type Preferences = {
  defaultTransportMode: TransportMode;
  defaultTimeBudgetMinutes: number;
};

type AssistantState = {
  messages: ChatMessage[];
  suggestedPois: Poi[];
  suggestedPlan: Partial<RoutePlanRequest> | null;
  followUps: string[];
};

type VibeMapState = {
  profile: Profile;
  preferences: Preferences;
  routesById: Record<string, RoutePlan>;
  lastPlanRequest: RoutePlanRequest | null;
  assistant: AssistantState;
  setRoute: (route: RoutePlan) => void;
  getRoute: (routeId: string) => RoutePlan | undefined;
  setLastPlanRequest: (req: RoutePlanRequest) => void;
  setAssistantState: (state: Partial<AssistantState>) => void;
  replaceAssistantFromResponse: (resp: AssistantResponse) => void;
  setProfile: (p: Partial<Profile>) => void;
  setPreferences: (p: Partial<Preferences>) => void;
  resetLocal: () => void;
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

const profileKey = 'vibemap.profile';
const prefsKey = 'vibemap.prefs';
const routesKey = 'vibemap.routes';
const lastPlanKey = 'vibemap.lastPlan';
const assistantKey = 'vibemap.assistant';

const defaultState = {
  profile: { displayName: 'Explorer', avatarSeed: 'urban_pulse' },
  preferences: { defaultTransportMode: 'bike' as const, defaultTimeBudgetMinutes: 150 },
  assistant: {
    messages: [
      {
        id: 'seed',
        role: 'assistant',
        text: 'Tell me your vibe. I can search review-based places, show matching shops, and send you straight to a visualized route.',
        createdAt: new Date().toISOString(),
      },
    ],
    suggestedPois: [],
    suggestedPlan: null,
    followUps: [],
  } as AssistantState,
};

export const useVibeMapStore = create<VibeMapState>((set, get) => ({
  profile: load(profileKey, defaultState.profile),
  preferences: load(prefsKey, defaultState.preferences),
  routesById: load(routesKey, {} as Record<string, RoutePlan>),
  lastPlanRequest: load(lastPlanKey, null as RoutePlanRequest | null),
  assistant: load(assistantKey, defaultState.assistant),

  setRoute: (route) => {
    set((s) => {
      const next = { ...s.routesById, [route.id]: route };
      save(routesKey, next);
      return { routesById: next };
    });
  },

  getRoute: (routeId) => get().routesById[routeId],

  setLastPlanRequest: (req) => {
    set({ lastPlanRequest: req });
    save(lastPlanKey, req);
  },

  setAssistantState: (patch) => {
    set((s) => {
      const next = { ...s.assistant, ...patch };
      save(assistantKey, next);
      return { assistant: next };
    });
  },

  replaceAssistantFromResponse: (resp) => {
    const next: AssistantState = {
      messages: resp.messages ?? [],
      suggestedPois: resp.suggestedPois ?? [],
      suggestedPlan: resp.suggestedPlan ?? null,
      followUps: resp.followUps ?? [],
    };
    set({ assistant: next });
    save(assistantKey, next);
  },

  setProfile: (p) => {
    set((s) => {
      const next = { ...s.profile, ...p };
      save(profileKey, next);
      return { profile: next };
    });
  },

  setPreferences: (p) => {
    set((s) => {
      const next = { ...s.preferences, ...p };
      save(prefsKey, next);
      return { preferences: next };
    });
  },

  resetLocal: () => {
    localStorage.removeItem(profileKey);
    localStorage.removeItem(prefsKey);
    localStorage.removeItem(routesKey);
    localStorage.removeItem(lastPlanKey);
    localStorage.removeItem(assistantKey);
    set({
      profile: defaultState.profile,
      preferences: defaultState.preferences,
      routesById: {},
      lastPlanRequest: null,
      assistant: defaultState.assistant,
    });
  },
}));

