import type { ApiClient } from '@/api/client';
import { getApiMode } from '@/api/client';
import { createRealApiClient } from '@/api/realClient';
import { createStubApiClient } from '@/api/stubClient';

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (client) return client;
  client = getApiMode() === 'real' ? createRealApiClient() : createStubApiClient();
  return client;
}

