import { create } from 'zustand';
import type { RoutePlan, RoutePlanRequest, TransportMode } from '@/api/types';

type Profile = {
  displayName: string;
  avatarSeed: string;
};

type Preferences = {
  defaultTransportMode: TransportMode;
  defaultTimeBudgetMinutes: number;
};

type VibeMapState = {
  profile: Profile;
  preferences: Preferences;
  routesById: Record<string, RoutePlan>;
  lastPlanRequest: RoutePlanRequest | null;
  setRoute: (route: RoutePlan) => void;
  getRoute: (routeId: string) => RoutePlan | undefined;
  setLastPlanRequest: (req: RoutePlanRequest) => void;
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

const defaultState = {
  profile: { displayName: 'Explorer', avatarSeed: 'urban_pulse' },
  preferences: { defaultTransportMode: 'bike' as const, defaultTimeBudgetMinutes: 150 },
};

export const useVibeMapStore = create<VibeMapState>((set, get) => ({
  profile: load(profileKey, defaultState.profile),
  preferences: load(prefsKey, defaultState.preferences),
  routesById: load(routesKey, {} as Record<string, RoutePlan>),
  lastPlanRequest: load(lastPlanKey, null as RoutePlanRequest | null),

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
    set({
      profile: defaultState.profile,
      preferences: defaultState.preferences,
      routesById: {},
      lastPlanRequest: null,
    });
  },
}));

