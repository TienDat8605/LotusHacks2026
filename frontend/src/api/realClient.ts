import type { ApiClient } from '@/api/client';
import type { SocialEvent } from '@/api/types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

function decodeEventPayload(raw: string): SocialEvent | null {
  try {
    const json = atob(raw);
    return JSON.parse(json) as SocialEvent;
  } catch {
    return null;
  }
}

export function createRealApiClient(): ApiClient {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

  return {
    planRoute: (req) => jsonFetch(`${base}/api/routes/plan`, { method: 'POST', body: JSON.stringify(req) }),
    sendAssistantMessage: (threadId, text) =>
      jsonFetch(`${base}/api/assistant/messages`, {
        method: 'POST',
        body: JSON.stringify({ threadId, text }),
      }),
    listSocialSessions: () => jsonFetch(`${base}/api/social/sessions`),
    createSocialSession: (destinationName) =>
      jsonFetch(`${base}/api/social/sessions`, {
        method: 'POST',
        body: JSON.stringify({ destinationName }),
      }),
    joinSocialSession: (sessionId, displayName) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/join`, {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),
    joinSocialSessionByCode: (code, displayName) =>
      jsonFetch(`${base}/api/social/sessions/join-by-code`, {
        method: 'POST',
        body: JSON.stringify({ code, displayName }),
      }),
    updateSocialLocation: (sessionId, participantId, lat, lng) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/location`, {
        method: 'POST',
        body: JSON.stringify({ participantId, lat, lng }),
      }),
    listParticipants: (sessionId) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/participants`),
    listRecommendations: (sessionId) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/recommendations`),
    listSessionMessages: (sessionId) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/messages`),
    sendSessionMessage: (sessionId, text) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    sendSessionPing: (sessionId) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/ping`, {
        method: 'POST',
      }),
    subscribeToSocialSession: (sessionId, onEvent) => {
      const source = new EventSource(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/stream`);
      source.onmessage = (event) => {
        const payload = decodeEventPayload(event.data);
        if (payload) {
          onEvent(payload);
        }
      };
      source.onerror = () => {
        return;
      };
      return () => {
        source.close();
      };
    },
    uploadLocationVideo: async (req) => {
      const form = new FormData();
      form.append('file', req.file);
      form.append('point_of_interest', req.pointOfInterest);
      form.append('city', req.city);
      form.append('address', req.address);
      if (req.shortDescription) form.append('short_description', req.shortDescription);
      if (req.atmosphere) form.append('atmosphere', req.atmosphere);

      const res = await fetch(`${base}/api/ugc/videos`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed: ${res.status}`);
      }
      return (await res.json()) as Awaited<ReturnType<ApiClient['uploadLocationVideo']>>;
    },
  };
}
