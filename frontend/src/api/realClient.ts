import type { ApiClient } from '@/api/client';

function mapUploadLocationResponse(payload: any) {
  return {
    jobId: payload.job_id,
    videoId: payload.video_id,
    status: payload.status,
    createdAt: payload.created_at,
  };
}

function mapUgcJobStatusResponse(payload: any) {
  return {
    jobId: payload.job_id,
    videoId: payload.video_id,
    status: payload.status,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    error: payload.error ?? null,
    result: payload.result
      ? {
          characteristic: payload.result.characteristic ?? null,
          confidence: payload.result.confidence ?? null,
          locationExplicit: payload.result.location_explicit ?? null,
          locationGuess: payload.result.location_guess ?? null,
          description: payload.result.description ?? null,
          entities: (payload.result.entities ?? []).map((item: any) => ({
            name: item.name,
            entityType: item.entity_type,
            source: item.source,
          })),
          facts: (payload.result.facts ?? []).map((item: any) => ({
            claim: item.claim,
            source: item.source,
          })),
          evidence: (payload.result.evidence ?? []).map((item: any) => ({
            source: item.source,
            kind: item.kind,
            detail: item.detail,
            quote: item.quote ?? null,
          })),
          indexed: Boolean(payload.result.indexed),
          providerMap: payload.result.provider_map ?? {},
          transcriptionText: payload.result.transcription_text ?? null,
          ocrText: payload.result.ocr_text ?? null,
          ocrVisualClues: payload.result.ocr_visual_clues ?? [],
        }
      : null,
  };
}

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

export function createRealApiClient(): ApiClient {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const ugcBase = (import.meta.env.VITE_UGC_API_BASE_URL as string | undefined) ?? base;

  return {
    planRoute: (req) => jsonFetch(`${base}/api/routes/plan`, { method: 'POST', body: JSON.stringify(req) }),
    sendAssistantMessage: (threadId, text) =>
      jsonFetch(`${base}/api/assistant/messages`, {
        method: 'POST',
        body: JSON.stringify({ threadId, text }),
      }),
    listSocialSessions: () => jsonFetch(`${base}/api/social/sessions`),
    joinSocialSession: (sessionId, displayName) =>
      jsonFetch(`${base}/api/social/sessions/${encodeURIComponent(sessionId)}/join`, {
        method: 'POST',
        body: JSON.stringify({ displayName }),
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
    uploadLocationVideo: async (req) => {
      const form = new FormData();
      form.append('file', req.file);
      form.append('poi_name', req.pointOfInterest);
      form.append('poi_city', req.city);
      form.append('poi_address', req.address);

      const res = await fetch(`${ugcBase}/ugc/videos`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed: ${res.status}`);
      }
      return mapUploadLocationResponse(await res.json());
    },
    processLocationVideo: async (jobId) => {
      const res = await fetch(`${ugcBase}/ugc/jobs/${encodeURIComponent(jobId)}/process`, {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed: ${res.status}`);
      }
      return mapUgcJobStatusResponse(await res.json());
    },
    getLocationVideoJob: async (jobId) => {
      const res = await fetch(`${ugcBase}/ugc/jobs/${encodeURIComponent(jobId)}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed: ${res.status}`);
      }
      return mapUgcJobStatusResponse(await res.json());
    },
  };
}
