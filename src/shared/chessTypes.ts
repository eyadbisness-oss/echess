export type TimeCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';
export type GameCategory = TimeCategory | 'bot' | 'sandbox';
export type PieceStyleId = 'neo' | 'classic' | 'minimal' | 'imperial';
export type UserRole = 'user' | 'moderator' | 'owner';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type MembershipTier = 'free' | 'plus' | 'diamond';
export type AppLocale = 'en' | 'es' | 'fr' | 'ar';

export interface PlayerRatings {
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
  puzzle: number;
}

export interface PlayerRD {
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
  role: UserRole;
  status: AccountStatus;
  membership: MembershipTier;
  boardTheme: string;
  pieceStyle: PieceStyleId;
  soundEnabled: boolean;
  soundVolume?: number;
  showCoordinates: boolean;
  autoQueen: boolean;
  lowTimeWarningColor?: string;
  language?: AppLocale;
  ratings: PlayerRatings;
  rd?: PlayerRD;
  volatility?: PlayerRD;
  puzzleStreak?: number;
  bestPuzzleStreak?: number;
  dailyStreak?: number;
  bestDailyStreak?: number;
  lastDailyPuzzleDate?: string;
  dailyPuzzlesCompleted?: number;
  puzzlesSolved?: number;
  playStreakDays?: number;
  bestPlayStreakDays?: number;
  lastPlayDate?: string;
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  achievements?: string[];
  isTestAccount?: boolean;
  onlineStatus?: 'online' | 'playing' | 'offline';
  lastSeenAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missed_win';

export interface EngineEval {
  cp: number; // Centipawns from White's perspective
  mate: number | null; // Positive = White mates in N, Negative = Black mates in N
  depth: number;
  bestMoveUci: string;
  bestMoveSan: string;
  pvSan: string[];
  pvUci: string[];
  multipvIndex: number;
  nodes?: number;
  nps?: number;
}

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: EngineEval;
  evalAfter: EngineEval;
  bestAlternativeSan: string;
  bestAlternativeUci: string;
  classification: MoveClassification;
  winProbBefore: number; // From mover's perspective 0..100
  winProbAfter: number; // From mover's perspective 0..100
  cpLoss: number;
  explanation: string;
}

export interface GameReviewReport {
  moves: AnalyzedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteCounts: Record<MoveClassification, number>;
  blackCounts: Record<MoveClassification, number>;
  phases: {
    opening: { white: number; black: number };
    middlegame: { white: number; black: number };
    endgame: { white: number; black: number };
  };
  openingName: string;
  eco: string;
}

export interface ChessGameRecord {
  id: string;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  whiteRatingDelta?: number;
  blackRatingDelta?: number;
  timeControl: string;
  category: GameCategory;
  result: '1-0' | '0-1' | '1/2-1/2';
  termination: string;
  winnerId?: string;
  pgn: string;
  finalFen: string;
  openingName?: string;
  eco?: string;
  moveCount?: number;
  rated: boolean;
  isTestGame?: boolean;
  reviewSummary?: {
    whiteAccuracy: number;
    blackAccuracy: number;
  };
  createdAt?: unknown;
  endedAt?: unknown;
}

export interface SharedGameDocument {
  shareId: string;
  creatorUid: string;
  creatorName: string;
  whiteName: string;
  blackName: string;
  result?: string;
  timeControl?: string;
  openingName?: string;
  eco?: string;
  pgn: string;
  hasReviewReport: boolean;
  reviewReport?: GameReviewReport;
  createdAt?: unknown;
}

export interface PlatformFeatures {
  onlineMultiplayer: boolean;
  computerOpponents: boolean;
  puzzles: boolean;
  lessons: boolean;
  openingExplorer: boolean;
  geminiCoach?: boolean;
  tournaments: boolean;
}

export interface PlatformConfig {
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  announcement?: string;
  features: PlatformFeatures;
  activeTimeControls?: string[];
  updatedAt?: unknown;
  updatedBy: string;
}

export interface TimeControlPreset {
  label: string;
  code: string;
  initialMs: number;
  incrementMs: number;
  category: TimeCategory;
}

export const TIME_CONTROLS: TimeControlPreset[] = [
  { label: '1 min', code: '1+0', initialMs: 60_000, incrementMs: 0, category: 'bullet' },
  { label: '2 | 1', code: '2+1', initialMs: 120_000, incrementMs: 1_000, category: 'bullet' },
  { label: '3 min', code: '3+0', initialMs: 180_000, incrementMs: 0, category: 'blitz' },
  { label: '3 | 2', code: '3+2', initialMs: 180_000, incrementMs: 2_000, category: 'blitz' },
  { label: '5 min', code: '5+0', initialMs: 300_000, incrementMs: 0, category: 'blitz' },
  { label: '10 min', code: '10+0', initialMs: 600_000, incrementMs: 0, category: 'rapid' },
  { label: '15 | 10', code: '15+10', initialMs: 900_000, incrementMs: 10_000, category: 'rapid' },
  { label: '30 min', code: '30+0', initialMs: 1_800_000, incrementMs: 0, category: 'classical' },
];
