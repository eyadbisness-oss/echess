export const DEFAULT_LOW_TIME_WARNING_COLOR = '#ef4444';
const STORAGE_KEY = 'echess_low_time_warning_color';

export interface LowTimeColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const LOW_TIME_COLOR_PRESETS: LowTimeColorPreset[] = [
  { id: 'crimson', label: 'Crimson', hex: '#ef4444' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'magenta', label: 'Magenta', hex: '#ec4899' },
  { id: 'violet', label: 'Violet', hex: '#a855f7' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function sanitizeWarningHexColor(value?: string | null): string {
  if (typeof value === 'string' && HEX_COLOR_REGEX.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_LOW_TIME_WARNING_COLOR;
}

export function readStoredWarningColor(profileColor?: string | null): string {
  if (profileColor && HEX_COLOR_REGEX.test(profileColor)) {
    return profileColor.toLowerCase();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && HEX_COLOR_REGEX.test(raw)) {
      return raw.toLowerCase();
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LOW_TIME_WARNING_COLOR;
}

export function persistLocalWarningColor(hex: string): void {
  const safe = sanitizeWarningHexColor(hex);
  try {
    window.localStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // ignore storage errors
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const safe = sanitizeWarningHexColor(hex);
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Ensures any user-chosen custom hex color stays legible on dark clock surfaces (#0B0E11).
 * If the luminance is very dark, blends toward white so digits remain crisp.
 */
export function getReadableWarningTextColor(hex: string): string {
  const safe = sanitizeWarningHexColor(hex);
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance >= 0.42) {
    return safe;
  }
  const mix = 0.55;
  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

export function parseTimeControlInitialMs(timeControl?: string): number {
  if (!timeControl) return 300_000;
  const baseStr = timeControl.split('+')[0];
  const mins = Number(baseStr);
  if (Number.isFinite(mins) && mins > 0) {
    return mins * 60_000;
  }
  return 300_000;
}
