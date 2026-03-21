export type LatLng = { lat: number; lng: number };

export type TransportMode = 'bike' | 'car' | 'walk' | 'bus';

export type Poi = {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  city?: string;
  videoUrl?: string;
  videoId?: string;
  category?: string;
  rating?: number;
  badges?: string[];
};

export type RoutePlanRequest = {
  origin: string;
  destination: string;
  timeBudgetMinutes: number;
  transportMode: TransportMode;
  includeTrending: boolean;
};

export type RouteLeg = {
  fromPoiId?: string;
  toPoiId?: string;
  durationMinutes: number;
  path?: LatLng[];
  steps: {
    instruction: string;
    distanceMeters?: number;
    durationMinutes?: number;
  }[];
};

export type RoutePlan = {
  id: string;
  title: string;
  origin?: { name?: string; location: LatLng };
  destination?: { name?: string; location: LatLng };
  pois: Poi[];
  legs: RouteLeg[];
  totalDurationMinutes: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

export type SocialSession = {
  id: string;
  destinationName: string;
  participantCount: number;
  status: 'live' | 'scheduled' | 'ended';
};

export type SocialParticipant = {
  id: string;
  displayName: string;
  avatarSeed: string;
  lat?: number;
  lng?: number;
  lastSeen: string;
};

export type AssistantResponse = {
  messages: ChatMessage[];
  suggestedPois?: Poi[];
  suggestedPlan?: Partial<RoutePlanRequest>;
  followUps?: string[];
};
