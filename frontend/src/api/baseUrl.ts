function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isLocalHost(host: string) {
  const normalized = host.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function resolveApiBase(raw: string | undefined) {
  const value = trimTrailingSlash((raw ?? '').trim());
  if (!value) return '';
  if (typeof window === 'undefined') return value;
  if (value.startsWith('/')) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  const currentHost = window.location.hostname;
  const runningRemote = !isLocalHost(currentHost);
  if (runningRemote && isLocalHost(parsed.hostname)) {
    return '';
  }

  if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && parsed.hostname !== currentHost) {
    return '';
  }

  if (parsed.origin === window.location.origin) return '';
  return value;
}
