import type { MoveClassification } from '../shared/chessTypes';
import { CLASSIFICATION_VISUALS } from '../utils/moveClassification';

interface ClassificationBadgeProps {
  classification: MoveClassification;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function ClassificationBadge({
  classification,
  size = 'sm',
  label,
  className = '',
}: ClassificationBadgeProps) {
  const meta = CLASSIFICATION_VISUALS[classification];

  const sizePx =
    size === 'xs'
      ? 'w-4 h-4 text-[9px]'
      : size === 'sm'
      ? 'w-5 h-5 text-[10px]'
      : size === 'md'
      ? 'w-6 h-6 text-[11px]'
      : 'w-8 h-8 text-sm';

  const renderGlyph = () => {
    if (classification === 'best') {
      return (
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill={meta.fgHex} aria-hidden="true">
          <path d="M12 2.4l2.76 5.6 6.18.9-4.47 4.35 1.06 6.15L12 16.5l-5.53 2.9 1.06-6.15L3.06 8.9l6.18-.9L12 2.4z" />
        </svg>
      );
    }
    if (classification === 'excellent') {
      return (
        <svg
          viewBox="0 0 24 24"
          className="w-[62%] h-[62%]"
          fill="none"
          stroke={meta.fgHex}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    }
    if (classification === 'good') {
      return (
        <svg
          viewBox="0 0 24 24"
          className="w-[56%] h-[56%]"
          fill="none"
          stroke={meta.fgHex}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 12.5l4 4L18 8.5" />
        </svg>
      );
    }
    if (classification === 'book') {
      return (
        <svg
          viewBox="0 0 24 24"
          className="w-[60%] h-[60%]"
          fill="none"
          stroke={meta.fgHex}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22V5.5z" />
          <path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5A2.5 2.5 0 0 1 22 22V5.5z" />
        </svg>
      );
    }
    if (classification === 'missed_win') {
      return (
        <svg
          viewBox="0 0 24 24"
          className="w-[56%] h-[56%]"
          fill="none"
          stroke={meta.fgHex}
          strokeWidth="3.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    }
    return (
      <span className="font-mono font-black leading-none tracking-tighter select-none">
        {meta.symbol}
      </span>
    );
  };

  return (
    <span
      role="img"
      aria-label={label || classification}
      title={label || classification}
      className={`inline-flex items-center justify-center rounded-full shrink-0 shadow-sm ring-1 ${sizePx} ${className}`}
      style={{
        backgroundColor: meta.bgHex,
        color: meta.fgHex,
        borderColor: meta.ringHex,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
      }}
    >
      {renderGlyph()}
    </span>
  );
}
