import { AlertTriangle, Clock } from 'lucide-react';
import {
  DEFAULT_LOW_TIME_WARNING_COLOR,
  getReadableWarningTextColor,
  hexToRgba,
  sanitizeWarningHexColor,
} from '../utils/timerWarning';
import { useLocale } from '../contexts/LocaleContext';

export const LOW_TIME_THRESHOLD_MS = 10_000;

export interface MoveTimerDisplayProps {
  timeLeftMs: number;
  totalTimeMs?: number;
  isActive: boolean;
  isGameFinished?: boolean;
  warningColor?: string | null;
  warningThresholdMs?: number;
  label?: string;
}

export function formatMoveClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped === 0) {
    return '0:00.0';
  }
  if (clamped < LOW_TIME_THRESHOLD_MS) {
    const totalTenths = Math.ceil(clamped / 100);
    const secs = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `0:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MoveTimerDisplay({
  timeLeftMs,
  totalTimeMs = 300_000,
  isActive,
  isGameFinished = false,
  warningColor = DEFAULT_LOW_TIME_WARNING_COLOR,
  warningThresholdMs = LOW_TIME_THRESHOLD_MS,
  label,
}: MoveTimerDisplayProps) {
  const { t } = useLocale();
  const safeMs = Math.max(0, timeLeftMs);
  const safeWarningHex = sanitizeWarningHexColor(warningColor);
  const readableWarningText = getReadableWarningTextColor(safeWarningHex);

  const isFlagged = safeMs <= 0;
  const isLowTime = !isFlagged && safeMs < warningThresholdMs;

  // Progress bar: when under 10 seconds, show a dedicated 10-second critical drain bar
  // so low-time urgency is immediately visible regardless of the starting time control.
  const progressPct = isFlagged
    ? 0
    : isLowTime
    ? Math.max(2, Math.min(100, (safeMs / warningThresholdMs) * 100))
    : Math.max(2, Math.min(100, (safeMs / Math.max(1, totalTimeMs)) * 100));

  const containerStyle: React.CSSProperties | undefined = isLowTime || isFlagged
    ? {
        backgroundColor: hexToRgba(safeWarningHex, isActive ? 0.2 : 0.1),
        borderColor: isActive ? safeWarningHex : hexToRgba(safeWarningHex, 0.55),
        color: readableWarningText,
        boxShadow: isActive ? `0 0 16px ${hexToRgba(safeWarningHex, 0.35)}` : undefined,
      }
    : undefined;

  const barFillStyle: React.CSSProperties = {
    width: `${progressPct.toFixed(1)}%`,
    backgroundColor: isLowTime || isFlagged
      ? safeWarningHex
      : isActive
      ? '#10b981'
      : '#475569',
  };

  return (
    <div
      role="timer"
      aria-label={label || `Clock ${formatMoveClock(safeMs)}`}
      data-low-time={isLowTime ? 'true' : 'false'}
      style={containerStyle}
      className={`relative overflow-hidden min-w-[112px] sm:min-w-[126px] rounded-lg border px-3 pt-1.5 pb-2 transition-colors duration-200 select-none ${
        isLowTime || isFlagged
          ? ''
          : isActive && !isGameFinished
          ? 'bg-emerald-950/55 border-emerald-500/80 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
          : 'bg-[#0B0E11] border-slate-800 text-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          {isLowTime && isActive && !isGameFinished ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: safeWarningHex }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: safeWarningHex }}
              />
            </span>
          ) : isLowTime ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: readableWarningText }} />
          ) : (
            <Clock
              className={`w-3.5 h-3.5 shrink-0 ${
                isActive && !isGameFinished ? 'text-emerald-400' : 'text-slate-500'
              }`}
            />
          )}

          <span className="font-mono text-base sm:text-lg font-bold tabular-nums leading-none tracking-tight">
            {formatMoveClock(safeMs)}
          </span>
        </span>

        {isLowTime && (
          <span
            className="text-[10px] font-mono font-bold uppercase px-1 py-0.5 rounded leading-none"
            style={{
              backgroundColor: hexToRgba(safeWarningHex, 0.22),
              color: readableWarningText,
            }}
          >
            {t('timer.lowTime')}
          </span>
        )}
      </div>

      {/* Visual Countdown Progress Track */}
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-900/90 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-150 ease-linear"
          style={barFillStyle}
        />
      </div>
    </div>
  );
}
