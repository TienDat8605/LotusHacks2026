export type LatLng = { lat: number; lng: number };

export type LocationSuggestion = {
  refId?: string;
  name: string;
  address?: string;
  location: LatLng;
};

export type TransportMode = 'bike' | 'car' | 'walk' | 'bus';

export type Poi = {
  id: string;
  name: string;
  location: LatLng;
  address?: string;
  city?: string;
  imageUrl?: string;
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
  requiredPoiIds?: string[];
};

export type ConnectPoisRouteRequest = {
  origin: string;
  poiIds: string[];
  poiNames?: string[];
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
  role: string;
  text: string;
  createdAt: string;
};

export type SocialSession = {
  id: string;
  destinationName: string;
  participantCount: number;
  status: 'live' | 'scheduled' | 'ended';
  code: string;
};

export type SocialParticipant = {
  id: string;
  displayName: string;
  avatarSeed: string;
  lat?: number;
  lng?: number;
  lastSeen: string;
};

export type SocialEvent = {
  type: 'snapshot' | 'message';
  session?: SocialSession;
  participant?: SocialParticipant;
  participants?: SocialParticipant[];
  message?: ChatMessage;
  messages?: ChatMessage[];
  recommendations?: Poi[];
};

export type JoinByCodeResponse = {
  session: SocialSession;
  participantId: string;
  avatarSeed: string;
};

export type AssistantResponse = {
  messages: ChatMessage[];
  suggestedPois?: Poi[];
  suggestedPlan?: Partial<RoutePlanRequest>;
  followUps?: string[];
};

export type UploadLocationRequest = {
  file: File;
  pointOfInterest: string;
  city: string;
  address: string;
  shortDescription?: string;
  atmosphere?: string;
};

export type UploadLocationResult = {
  characteristic?: string | null;
  characteristicRaw?: string | null;
  confidence?: number | null;
  indexed?: boolean;
  datasetStored?: boolean;
  datasetPath?: string | null;
  providerMap?: Record<string, string>;
  transcriptionText?: string | null;
  ocrText?: string | null;
};

export type UploadLocationResponse = {
  jobId: string;
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt?: string;
  error?: string | null;
  result?: UploadLocationResult | null;
};
