import type {
  AssistantResponse,
  ChatMessage,
  JoinByCodeResponse,
  Poi,
  UploadLocationRequest,
  UploadLocationResponse,
  RoutePlan,
  RoutePlanRequest,
  SocialEvent,
  SocialParticipant,
  SocialSession,
} from '@/api/types';

export type ApiMode = 'stub' | 'real';

export type ApiClient = {
  planRoute: (req: RoutePlanRequest) => Promise<RoutePlan>;
  sendAssistantMessage: (threadId: string, text: string) => Promise<AssistantResponse>;
  listSocialSessions: () => Promise<SocialSession[]>;
  createSocialSession: (destinationName: string) => Promise<SocialSession>;
  joinSocialSession: (sessionId: string, displayName: string) => Promise<{ participantId: string; avatarSeed: string }>;
  joinSocialSessionByCode: (code: string, displayName: string) => Promise<JoinByCodeResponse>;
  updateSocialLocation: (sessionId: string, participantId: string, lat: number, lng: number) => Promise<SocialParticipant>;
  listParticipants: (sessionId: string) => Promise<SocialParticipant[]>;
  listRecommendations: (sessionId: string) => Promise<Poi[]>;
  listSessionMessages: (sessionId: string) => Promise<ChatMessage[]>;
  sendSessionMessage: (sessionId: string, text: string) => Promise<ChatMessage>;
  sendSessionPing: (sessionId: string) => Promise<{ ok: true }>;
  subscribeToSocialSession: (sessionId: string, onEvent: (event: SocialEvent) => void) => () => void;
  uploadLocationVideo: (req: UploadLocationRequest) => Promise<UploadLocationResponse>;
};

export function getApiMode(): ApiMode {
  const raw = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'stub';
  return raw === 'real' ? 'real' : 'stub';
}
