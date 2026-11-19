import type { MoveClassification } from '../shared/chessTypes';
import type { TranslationKey } from '../i18n/translations';

export interface ClassificationVisualMeta {
  classification: MoveClassification;
  labelKey: TranslationKey;
  symbol: string;
  bgHex: string;
  ringHex: string;
  fgHex: string;
  textClass: string;
  softBgClass: string;
  borderClass: string;
}

export const CLASSIFICATION_ORDER: MoveClassification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'missed_win',
  'blunder',
];

export const CLASSIFICATION_VISUALS: Record<MoveClassification, ClassificationVisualMeta> = {
  brilliant: {
    classification: 'brilliant',
    labelKey: 'analysis.clsBrilliant',
    symbol: '!!',
    bgHex: '#1BA39C',
    ringHex: '#5EEAD4',
    fgHex: '#FFFFFF',
    textClass: 'text-teal-300',
    softBgClass: 'bg-teal-950/40',
    borderClass: 'border-teal-500/40',
  },
  great: {
    classification: 'great',
    labelKey: 'analysis.clsGreat',
    symbol: '!',
    bgHex: '#3B82F6',
    ringHex: '#93C5FD',
    fgHex: '#FFFFFF',
    textClass: 'text-sky-300',
    softBgClass: 'bg-sky-950/40',
    borderClass: 'border-sky-500/40',
  },
  best: {
    classification: 'best',
    labelKey: 'analysis.clsBest',
    symbol: '★',
    bgHex: '#7FA650',
    ringHex: '#A3E635',
    fgHex: '#FFFFFF',
    textClass: 'text-lime-300',
    softBgClass: 'bg-lime-950/35',
    borderClass: 'border-lime-500/35',
  },
  excellent: {
    classification: 'excellent',
    labelKey: 'analysis.clsExcellent',
    symbol: '✓',
    bgHex: '#96BC4B',
    ringHex: '#BEF264',
    fgHex: '#FFFFFF',
    textClass: 'text-emerald-300',
    softBgClass: 'bg-emerald-950/35',
    borderClass: 'border-emerald-500/35',
  },
  good: {
    classification: 'good',
    labelKey: 'analysis.clsGood',
    symbol: '·',
    bgHex: '#64748B',
    ringHex: '#94A3B8',
    fgHex: '#FFFFFF',
    textClass: 'text-slate-300',
    softBgClass: 'bg-slate-800/40',
    borderClass: 'border-slate-600/40',
  },
  book: {
    classification: 'book',
    labelKey: 'analysis.clsBook',
    symbol: 'B',
    bgHex: '#A88865',
    ringHex: '#D6B892',
    fgHex: '#FFFFFF',
    textClass: 'text-amber-200',
    softBgClass: 'bg-amber-950/35',
    borderClass: 'border-amber-600/40',
  },
  inaccuracy: {
    classification: 'inaccuracy',
    labelKey: 'analysis.clsInaccuracy',
    symbol: '?!',
    bgHex: '#F7C631',
    ringHex: '#FDE047',
    fgHex: '#1E293B',
    textClass: 'text-amber-300',
    softBgClass: 'bg-amber-950/35',
    borderClass: 'border-amber-500/40',
  },
  mistake: {
    classification: 'mistake',
    labelKey: 'analysis.clsMistake',
    symbol: '?',
    bgHex: '#E68A2E',
    ringHex: '#FDBA74',
    fgHex: '#FFFFFF',
    textClass: 'text-orange-300',
    softBgClass: 'bg-orange-950/40',
    borderClass: 'border-orange-500/40',
  },
  missed_win: {
    classification: 'missed_win',
    labelKey: 'analysis.clsMissedWin',
    symbol: '✕',
    bgHex: '#E05347',
    ringHex: '#FCA5A5',
    fgHex: '#FFFFFF',
    textClass: 'text-rose-300',
    softBgClass: 'bg-rose-950/40',
    borderClass: 'border-rose-500/40',
  },
  blunder: {
    classification: 'blunder',
    labelKey: 'analysis.clsBlunder',
    symbol: '??',
    bgHex: '#CA3431',
    ringHex: '#F87171',
    fgHex: '#FFFFFF',
    textClass: 'text-rose-400',
    softBgClass: 'bg-rose-950/50',
    borderClass: 'border-rose-600/50',
  },
};

export function isKeyMomentClassification(cls: MoveClassification): boolean {
  return (
    cls === 'brilliant' ||
    cls === 'great' ||
    cls === 'missed_win' ||
    cls === 'mistake' ||
    cls === 'blunder'
  );
}

/**
 * Computes a Chess.com-style estimated performance rating from move accuracy and opponent baseline rating.
 */
export function estimateGameRating(accuracy: number, baselineRating = 1500): number {
  const clampedAcc = Math.max(15, Math.min(100, accuracy));
  const clampedBase = Math.max(400, Math.min(2800, baselineRating));
  // Smooth CAPS-style mapping: 80% accuracy ~ baseline + 50, 95% ~ +650, 50% ~ -550
  const delta = Math.round(((clampedAcc - 76) / 24) * 520 + (clampedAcc >= 92 ? (clampedAcc - 92) * 32 : 0));
  return Math.max(200, Math.min(3200, Math.round((clampedBase + delta) / 10) * 10));
}
