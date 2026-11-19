import type { PieceStyleId } from '../shared/chessTypes';

interface ChessPieceProps {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  styleId?: PieceStyleId;
  className?: string;
}

export function ChessPieceSvg({ type, color, styleId = 'neo', className = 'w-full h-full' }: ChessPieceProps) {
  const isWhite = color === 'w';

  const palette = (() => {
    switch (styleId) {
      case 'classic':
        return isWhite
          ? { fill: '#FFFDF7', stroke: '#292524', accent: '#D6D3D1', trim: '#57534E' }
          : { fill: '#27272A', stroke: '#09090B', accent: '#52525B', trim: '#A1A1AA' };
      case 'minimal':
        return isWhite
          ? { fill: '#F8FAFC', stroke: '#334155', accent: '#CBD5E1', trim: '#475569' }
          : { fill: '#1E293B', stroke: '#020617', accent: '#475569', trim: '#94A3B8' };
      case 'imperial':
        return isWhite
          ? { fill: '#FAF3E0', stroke: '#78350F', accent: '#F59E0B', trim: '#B45309' }
          : { fill: '#171A21', stroke: '#D97706', accent: '#F59E0B', trim: '#FBBF24' };
      case 'neo':
      default:
        return isWhite
          ? { fill: '#FFFFFF', stroke: '#1E293B', accent: '#E2E8F0', trim: '#334155' }
          : { fill: '#1C222B', stroke: '#090D12', accent: '#3F4A59', trim: '#CBD5E1' };
    }
  })();

  const strokeW = styleId === 'minimal' ? 1.8 : 1.5;

  return (
    <svg viewBox="0 0 45 45" className={className} style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.32))' }}>
      {type === 'p' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
          <path d="M13 37.5h19" stroke={palette.trim} strokeWidth="1.2" fill="none" />
        </g>
      )}

      {type === 'r' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M14 17h17M14 29.5h17" stroke={palette.trim} strokeWidth="1.1" fill="none" />
        </g>
      )}

      {type === 'n' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
          <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" />
          <circle cx="15" cy="15.5" r="1.1" fill={palette.trim} stroke="none" />
          <path d="M14 36.5h22" stroke={palette.trim} strokeWidth="1.1" fill="none" />
        </g>
      )}

      {type === 'b' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
          <circle cx="22.5" cy="8" r="2.5" />
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke={palette.trim} strokeWidth="1.3" fill="none" />
        </g>
      )}

      {type === 'q' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.2" />
          <circle cx="14" cy="9" r="2.2" />
          <circle cx="22.5" cy="8" r="2.2" />
          <circle cx="31" cy="9" r="2.2" />
          <circle cx="39" cy="12" r="2.2" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" stroke={palette.trim} strokeWidth="1.1" fill="none" />
        </g>
      )}

      {type === 'k' && (
        <g fill={palette.fill} stroke={palette.stroke} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" stroke={palette.stroke} strokeWidth="1.8" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" stroke={palette.trim} strokeWidth="1.1" fill="none" />
        </g>
      )}
    </svg>
  );
}
