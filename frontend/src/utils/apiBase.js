const DEFAULT_BACKEND_PORT = import.meta.env.VITE_API_PORT || '8000';

function isLocalHost(hostname = '') {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function trimTrailingSlash(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

export function resolveApiBase() {
  const configured = trimTrailingSlash(
    import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || '',
  );
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (!isLocalHost(parsed.hostname)) {
        return configured;
      }
    } catch {
      return configured;
    }
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    if (isLocalHost(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_BACKEND_PORT}`;
    }

    return '/api';
  }

  return `http://localhost:${DEFAULT_BACKEND_PORT}`;
}

export const API_BASE = resolveApiBase();
