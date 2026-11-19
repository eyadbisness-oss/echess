import type { PieceStyleId } from '../shared/chessTypes';

export interface BoardTheme {
  id: string;
  name: string;
  category: 'Classic' | 'Wood' | 'Stone' | 'Modern' | 'Futuristic';
  description: string;
  lightSquare: string;
  darkSquare: string;
  lightTextureCss?: string;
  darkTextureCss?: string;
  boardFrameBg: string;
  boardFrameBorder: string;
  coordLight: string;
  coordDark: string;
  lastMoveLight: string;
  lastMoveDark: string;
  selectedBg: string;
  legalDotColor: string;
  accentHex: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'emerald-arena',
    name: 'Emerald Arena',
    category: 'Modern',
    description: 'Signature eChess tournament palette in crisp ivory and muted emerald slate.',
    lightSquare: '#E7ECE8',
    darkSquare: '#2D6A4F',
    boardFrameBg: '#11161C',
    boardFrameBorder: '#1E293B',
    coordLight: '#2D6A4F',
    coordDark: '#D8F3DC',
    lastMoveLight: 'rgba(16, 185, 129, 0.34)',
    lastMoveDark: 'rgba(52, 211, 153, 0.34)',
    selectedBg: 'rgba(16, 185, 129, 0.52)',
    legalDotColor: 'rgba(15, 23, 42, 0.28)',
    accentHex: '#10B981',
  },
  {
    id: 'classic-walnut',
    name: 'Classic Walnut',
    category: 'Wood',
    description: 'Warm inlaid honey maple paired with deep oiled European walnut.',
    lightSquare: '#E8CFA8',
    darkSquare: '#8B5A2B',
    lightTextureCss:
      'repeating-linear-gradient(92deg, rgba(139,90,43,0.03) 0px, rgba(139,90,43,0.03) 2px, transparent 2px, transparent 8px)',
    darkTextureCss:
      'repeating-linear-gradient(92deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 2px, transparent 2px, transparent 7px)',
    boardFrameBg: '#2C1B10',
    boardFrameBorder: '#4A2F1C',
    coordLight: '#6F441E',
    coordDark: '#EED9B8',
    lastMoveLight: 'rgba(245, 158, 11, 0.35)',
    lastMoveDark: 'rgba(251, 191, 36, 0.32)',
    selectedBg: 'rgba(217, 119, 6, 0.45)',
    legalDotColor: 'rgba(44, 27, 16, 0.28)',
    accentHex: '#D97706',
  },
  {
    id: 'carrara-marble',
    name: 'Carrara Marble',
    category: 'Stone',
    description: 'Honed Italian white marble with dark verde charcoal veining.',
    lightSquare: '#EFECE6',
    darkSquare: '#47555E',
    lightTextureCss:
      'linear-gradient(135deg, rgba(148,163,184,0.12) 0%, transparent 45%, rgba(148,163,184,0.08) 70%, transparent 100%)',
    darkTextureCss:
      'linear-gradient(125deg, rgba(255,255,255,0.06) 0%, transparent 40%, rgba(255,255,255,0.04) 75%, transparent 100%)',
    boardFrameBg: '#1B2126',
    boardFrameBorder: '#334155',
    coordLight: '#47555E',
    coordDark: '#E2E8F0',
    lastMoveLight: 'rgba(56, 189, 248, 0.28)',
    lastMoveDark: 'rgba(56, 189, 248, 0.28)',
    selectedBg: 'rgba(14, 165, 233, 0.42)',
    legalDotColor: 'rgba(15, 23, 42, 0.25)',
    accentHex: '#38BDF8',
  },
  {
    id: 'obsidian-slate',
    name: 'Obsidian Slate',
    category: 'Modern',
    description: 'Low-glare matte ash and deep volcanic basalt for long study sessions.',
    lightSquare: '#8E99A8',
    darkSquare: '#2A313C',
    boardFrameBg: '#12151A',
    boardFrameBorder: '#272E38',
    coordLight: '#1E242D',
    coordDark: '#CBD5E1',
    lastMoveLight: 'rgba(16, 185, 129, 0.34)',
    lastMoveDark: 'rgba(16, 185, 129, 0.32)',
    selectedBg: 'rgba(16, 185, 129, 0.50)',
    legalDotColor: 'rgba(255, 255, 255, 0.24)',
    accentHex: '#10B981',
  },
  {
    id: 'neon-cyber',
    name: 'Futuristic Cyber',
    category: 'Futuristic',
    description: 'Carbon-lattice matrix with precision emerald-cyan circuit highlights.',
    lightSquare: '#1C2A38',
    darkSquare: '#0D141C',
    lightTextureCss:
      'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.08) 0%, transparent 72%)',
    darkTextureCss:
      'linear-gradient(135deg, rgba(6,182,212,0.06) 0%, transparent 50%)',
    boardFrameBg: '#070B10',
    boardFrameBorder: '#0F766E',
    coordLight: '#34D399',
    coordDark: '#2DD4BF',
    lastMoveLight: 'rgba(16, 185, 129, 0.34)',
    lastMoveDark: 'rgba(20, 184, 166, 0.36)',
    selectedBg: 'rgba(52, 211, 153, 0.45)',
    legalDotColor: 'rgba(52, 211, 153, 0.45)',
    accentHex: '#2DD4BF',
  },
  {
    id: 'tournament-green',
    name: 'Tournament Classic',
    category: 'Classic',
    description: 'Traditional federation vinyl green and warm cream buff.',
    lightSquare: '#EEEED2',
    darkSquare: '#769656',
    boardFrameBg: '#1B2216',
    boardFrameBorder: '#354428',
    coordLight: '#5C7742',
    coordDark: '#EEEED2',
    lastMoveLight: 'rgba(246, 246, 105, 0.55)',
    lastMoveDark: 'rgba(186, 202, 43, 0.55)',
    selectedBg: 'rgba(246, 246, 105, 0.72)',
    legalDotColor: 'rgba(0, 0, 0, 0.22)',
    accentHex: '#84CC16',
  },
  {
    id: 'royal-mahogany',
    name: 'Royal Mahogany',
    category: 'Wood',
    description: 'Antique rosewood crimson and aged satin ivory.',
    lightSquare: '#F0DEC8',
    darkSquare: '#7A3032',
    lightTextureCss:
      'repeating-linear-gradient(88deg, rgba(122,48,50,0.03) 0px, transparent 5px)',
    darkTextureCss:
      'repeating-linear-gradient(88deg, rgba(0,0,0,0.08) 0px, transparent 6px)',
    boardFrameBg: '#271214',
    boardFrameBorder: '#4D2225',
    coordLight: '#7A3032',
    coordDark: '#F0DEC8',
    lastMoveLight: 'rgba(245, 158, 11, 0.36)',
    lastMoveDark: 'rgba(245, 158, 11, 0.34)',
    selectedBg: 'rgba(234, 179, 8, 0.48)',
    legalDotColor: 'rgba(39, 18, 20, 0.26)',
    accentHex: '#E11D48',
  },
  {
    id: 'nordic-birch',
    name: 'Nordic Birch',
    category: 'Classic',
    description: 'Pale Scandinavian birchwood and cool fjord slate blue.',
    lightSquare: '#E3E9F0',
    darkSquare: '#4B6B8A',
    boardFrameBg: '#151E28',
    boardFrameBorder: '#2C4157',
    coordLight: '#4B6B8A',
    coordDark: '#E3E9F0',
    lastMoveLight: 'rgba(56, 189, 248, 0.35)',
    lastMoveDark: 'rgba(125, 211, 252, 0.35)',
    selectedBg: 'rgba(14, 165, 233, 0.48)',
    legalDotColor: 'rgba(15, 23, 42, 0.24)',
    accentHex: '#0EA5E9',
  },
];

export interface PieceStyleOption {
  id: PieceStyleId;
  name: string;
  description: string;
}

export const PIECE_STYLES: PieceStyleOption[] = [
  { id: 'neo', name: 'eChess Neo', description: 'Crisp high-contrast tournament silhouettes' },
  { id: 'classic', name: 'Staunton Classic', description: 'Traditional carved tournament proportions' },
  { id: 'minimal', name: 'Geometric Minimal', description: 'Clean architectural flat-edge pieces' },
  { id: 'imperial', name: 'Imperial Gold-Trim', description: 'Warm ivory & obsidian pieces with subtle rim' },
];

export function getBoardThemeById(themeId?: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === themeId) || BOARD_THEMES[0];
}
