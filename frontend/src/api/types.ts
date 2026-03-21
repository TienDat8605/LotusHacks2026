export type LatLng = { lat: number; lng: number };

export type TransportMode = 'bike' | 'car' | 'walk' | 'bus';

export type Poi = {
  id: string;
  name: string;
  location: LatLng;
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
  steps: {
    instruction: string;
    distanceMeters?: number;
    durationMinutes?: number;
  }[];
};

export type RoutePlan = {
  id: string;
  title: string;
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

export type UploadLocationResponse = {
  jobId: string;
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: string;
};

