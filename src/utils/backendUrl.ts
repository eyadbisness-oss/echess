import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_BACKEND_URL =
  'https://ais-pre-a7nojfgqtue6z54w7ypmif-741640521343.europe-west1.run.app';
const BACKEND_URL_STORAGE_KEY = 'echess_backend_url';

export function getDefaultNativeBackendUrl(): string {
  return DEFAULT_NATIVE_BACKEND_URL;
}

export function sanitizeBackendUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.origin;
  } catch {
    return '';
  }
}

export function getCustomBackendOrigin(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY) || '';
    return sanitizeBackendUrl(saved);
  } catch {
    return '';
  }
}

export function setCustomBackendOrigin(rawUrl: string): string {
  const clean = sanitizeBackendUrl(rawUrl);
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, clean);
      } else {
        window.localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
      }
      window.dispatchEvent(new Event('echess-backend-url-changed'));
    } catch {
      // ignore storage failure
    }
  }
  return clean;
}

export function getBackendOrigin(): string {
  const custom = getCustomBackendOrigin();
  if (custom) {
    return custom;
  }
  const configured = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (Capacitor.isNativePlatform()) {
    return DEFAULT_NATIVE_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (
    getCustomBackendOrigin() ||
    Capacitor.isNativePlatform() ||
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim()
  ) {
    return `${getBackendOrigin()}${normalized}`;
  }
  return normalized;
}

export function getWebSocketUrl(path = '/ws'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const origin = getBackendOrigin();
  if (origin.startsWith('https://')) {
    return `wss://${origin.slice('https://'.length)}${normalized}`;
  }
  if (origin.startsWith('http://')) {
    return `ws://${origin.slice('http://'.length)}${normalized}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${normalized}`;
}

export function getPublicAppOrigin(): string {
  if (Capacitor.isNativePlatform()) {
    return getBackendOrigin();
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_NATIVE_BACKEND_URL;
}
