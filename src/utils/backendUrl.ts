import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_BACKEND_URL =
  'https://ais-pre-a7nojfgqtue6z54w7ypmif-741640521343.europe-west1.run.app';

export function getBackendOrigin(): string {
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
  if (Capacitor.isNativePlatform() || (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim()) {
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
