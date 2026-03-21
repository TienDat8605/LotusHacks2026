import type {
  AssistantResponse,
  ChatMessage,
  UploadLocationRequest,
  UploadLocationResponse,
  RoutePlan,
  RoutePlanRequest,
  SocialSession,
} from '@/api/types';

export type ApiMode = 'stub' | 'real';

export type ApiClient = {
  planRoute: (req: RoutePlanRequest) => Promise<RoutePlan>;
  sendAssistantMessage: (threadId: string, text: string) => Promise<AssistantResponse>;
  listSocialSessions: () => Promise<SocialSession[]>;
  joinSocialSession: (sessionId: string, displayName: string) => Promise<{ participantId: string }>;
  listSessionMessages: (sessionId: string) => Promise<ChatMessage[]>;
  sendSessionMessage: (sessionId: string, text: string) => Promise<ChatMessage>;
  sendSessionPing: (sessionId: string) => Promise<{ ok: true }>;
  uploadLocationVideo: (req: UploadLocationRequest) => Promise<UploadLocationResponse>;
};

export function getApiMode(): ApiMode {
  const raw = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'stub';
  return raw === 'real' ? 'real' : 'stub';
}

