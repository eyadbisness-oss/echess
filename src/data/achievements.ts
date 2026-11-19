import type { UserProfile } from '../shared/chessTypes';
import { getLocalDateKey, getPreviousDateKey } from './puzzlesAndLessons';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: 'Games' | 'Tactics' | 'Streaks' | 'Mastery' | 'Social' | 'Customization';
  points: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  requirementHint: string;
}

export interface AchievementProgress {
  current: number;
  target: number;
  unit: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-victory',
    title: 'First Blood',
    description: 'Win your first chess game on eChess.',
    category: 'Games',
    points: 10,
    tier: 'Bronze',
    requirementHint: 'Win 1 game in any mode',
  },
  {
    id: 'ten-wins',
    title: 'Club Contender',
    description: 'Reach 10 total victories across competitive or computer play.',
    category: 'Games',
    points: 25,
    tier: 'Silver',
    requirementHint: 'Win 10 games',
  },
  {
    id: 'fifty-games',
    title: 'Arena Regular',
    description: 'Complete 50 full chess games on the platform.',
    category: 'Games',
    points: 50,
    tier: 'Gold',
    requirementHint: 'Play 50 games',
  },
  {
    id: 'hundred-wins',
    title: 'Centurion',
    description: 'Win 100 games across online matches and computer battles.',
    category: 'Games',
    points: 100,
    tier: 'Diamond',
    requirementHint: 'Win 100 Games',
  },
  {
    id: 'puzzles-solved-10',
    title: 'Tactics Apprentice',
    description: 'Solve 10 chess puzzles correctly.',
    category: 'Tactics',
    points: 20,
    tier: 'Bronze',
    requirementHint: 'Solve 10 Puzzles',
  },
  {
    id: 'puzzles-solved-50',
    title: 'Puzzle Virtuoso',
    description: 'Solve 50 tactical puzzles across any theme.',
    category: 'Tactics',
    points: 75,
    tier: 'Gold',
    requirementHint: 'Solve 50 Puzzles',
  },
  {
    id: 'puzzle-streak-3',
    title: 'Tactical Spark',
    description: 'Solve 3 tactical puzzles in a row without mistakes.',
    category: 'Tactics',
    points: 15,
    tier: 'Bronze',
    requirementHint: 'Reach a 3-puzzle streak',
  },
  {
    id: 'puzzle-streak-10',
    title: 'Calculation Machine',
    description: 'Achieve a 10-puzzle winning streak.',
    category: 'Tactics',
    points: 45,
    tier: 'Gold',
    requirementHint: 'Reach a 10-puzzle streak',
  },
  {
    id: 'puzzle-1500',
    title: 'Tactical Master',
    description: 'Climb above 1500 Puzzle Rating.',
    category: 'Tactics',
    points: 40,
    tier: 'Silver',
    requirementHint: 'Reach 1500+ Puzzle Rating',
  },
  {
    id: 'play-streak-3',
    title: 'Three-Day Habit',
    description: 'Play games or solve puzzles on 3 consecutive days.',
    category: 'Streaks',
    points: 20,
    tier: 'Bronze',
    requirementHint: 'Play on 3 Consecutive Days',
  },
  {
    id: 'play-streak-7',
    title: 'Weekly Ironman',
    description: 'Play games or solve puzzles on 7 consecutive days.',
    category: 'Streaks',
    points: 70,
    tier: 'Gold',
    requirementHint: 'Play on 7 Consecutive Days',
  },
  {
    id: 'daily-streak-3',
    title: 'Daily Tactician',
    description: 'Complete Daily Puzzles on 3 consecutive days.',
    category: 'Streaks',
    points: 25,
    tier: 'Silver',
    requirementHint: 'Reach a 3-day Daily Puzzle streak',
  },
  {
    id: 'daily-streak-7',
    title: 'Weekly Devotee',
    description: 'Maintain a 7-day Daily Puzzle streak.',
    category: 'Streaks',
    points: 60,
    tier: 'Gold',
    requirementHint: 'Reach a 7-day Daily Puzzle streak',
  },
  {
    id: 'brilliant-mind',
    title: 'Brilliant!!',
    description: 'Play a Brilliant move (!!) confirmed by Stockfish Game Review.',
    category: 'Mastery',
    points: 40,
    tier: 'Gold',
    requirementHint: 'Find 1 Brilliant move in Game Review',
  },
  {
    id: 'high-accuracy',
    title: 'Precision Architect',
    description: 'Finish a reviewed game with 90% or higher accuracy.',
    category: 'Mastery',
    points: 50,
    tier: 'Diamond',
    requirementHint: 'Achieve >= 90% accuracy in a reviewed game',
  },
  {
    id: 'rating-1400',
    title: 'Candidate Player',
    description: 'Reach a rating of 1400 in Bullet, Blitz, Rapid, or Classical.',
    category: 'Mastery',
    points: 30,
    tier: 'Silver',
    requirementHint: 'Hit 1400 rating in any live time control',
  },
  {
    id: 'rating-1800',
    title: 'Arena Grandmaster',
    description: 'Break 1800 Elo in any live time control.',
    category: 'Mastery',
    points: 75,
    tier: 'Diamond',
    requirementHint: 'Hit 1800 rating in any live time control',
  },
  {
    id: 'lesson-graduate',
    title: 'Opening Scholar',
    description: 'Complete an interactive chess lesson.',
    category: 'Mastery',
    points: 15,
    tier: 'Bronze',
    requirementHint: 'Complete 1 interactive lesson',
  },
  {
    id: 'board-stylist',
    title: 'Grandmaster Aesthetic',
    description: 'Customize your board theme in Profile Settings.',
    category: 'Customization',
    points: 10,
    tier: 'Bronze',
    requirementHint: 'Select a custom board theme',
  },
  {
    id: 'social-circle',
    title: 'Chess Rivalry',
    description: 'Connect with a friend on eChess.',
    category: 'Social',
    points: 15,
    tier: 'Bronze',
    requirementHint: 'Add or accept 1 friend',
  },
  {
    id: 'bot-slayer-hard',
    title: 'Silicon Slayer',
    description: 'Defeat a Hard, Expert, Master, or Maximum Stockfish bot.',
    category: 'Mastery',
    points: 60,
    tier: 'Gold',
    requirementHint: 'Beat Stockfish Hard+ difficulty',
  },
];

export function computePlayStreakUpdate(
  profile: UserProfile | null,
  todayKey: string = getLocalDateKey()
): {
  playStreakDays: number;
  bestPlayStreakDays: number;
  lastPlayDate: string;
} {
  const yesterdayKey = getPreviousDateKey(todayKey);
  const lastDate = profile?.lastPlayDate || '';
  const currentStreak = profile?.playStreakDays || 0;
  const bestStreak = profile?.bestPlayStreakDays || 0;

  if (lastDate === todayKey) {
    const safeCurrent = Math.max(1, currentStreak);
    return {
      playStreakDays: safeCurrent,
      bestPlayStreakDays: Math.max(bestStreak, safeCurrent),
      lastPlayDate: todayKey,
    };
  }

  const nextStreak = lastDate === yesterdayKey ? currentStreak + 1 : 1;
  return {
    playStreakDays: nextStreak,
    bestPlayStreakDays: Math.max(bestStreak, nextStreak),
    lastPlayDate: todayKey,
  };
}

export function getActivePlayStreak(
  profile: UserProfile | null,
  todayKey: string = getLocalDateKey()
): number {
  if (!profile?.lastPlayDate) return profile?.playStreakDays || 0;
  const yesterdayKey = getPreviousDateKey(todayKey);
  if (profile.lastPlayDate === todayKey || profile.lastPlayDate === yesterdayKey) {
    return profile.playStreakDays || 0;
  }
  return 0;
}

export function evaluateProfileAchievements(profile: UserProfile | null): string[] {
  if (!profile) return [];
  const current = new Set(profile.achievements || []);
  const wins = profile.wins || 0;
  const gamesPlayed = profile.gamesPlayed || 0;
  const puzzlesSolved = profile.puzzlesSolved || 0;
  const bestPlayDays = Math.max(
    profile.bestPlayStreakDays || 0,
    profile.playStreakDays || 0,
    profile.bestDailyStreak || 0
  );

  if (wins >= 1) current.add('first-victory');
  if (wins >= 10) current.add('ten-wins');
  if (wins >= 100) current.add('hundred-wins');
  if (gamesPlayed >= 50) current.add('fifty-games');

  if (puzzlesSolved >= 10) current.add('puzzles-solved-10');
  if (puzzlesSolved >= 50) current.add('puzzles-solved-50');
  if ((profile.bestPuzzleStreak || 0) >= 3) current.add('puzzle-streak-3');
  if ((profile.bestPuzzleStreak || 0) >= 10) current.add('puzzle-streak-10');

  if (bestPlayDays >= 3) current.add('play-streak-3');
  if (bestPlayDays >= 7) current.add('play-streak-7');
  if ((profile.bestDailyStreak || 0) >= 3) current.add('daily-streak-3');
  if ((profile.bestDailyStreak || 0) >= 7) current.add('daily-streak-7');

  if ((profile.ratings?.puzzle || 0) >= 1500) current.add('puzzle-1500');
  const maxLive = Math.max(
    profile.ratings?.bullet || 0,
    profile.ratings?.blitz || 0,
    profile.ratings?.rapid || 0,
    profile.ratings?.classical || 0
  );
  if (maxLive >= 1400) current.add('rating-1400');
  if (maxLive >= 1800) current.add('rating-1800');
  if (profile.boardTheme && profile.boardTheme !== 'emerald-arena') {
    current.add('board-stylist');
  }
  return Array.from(current).slice(0, 60);
}

export function getAchievementProgress(
  achId: string,
  profile: UserProfile | null
): AchievementProgress | null {
  if (!profile) return null;
  const wins = profile.wins || 0;
  const games = profile.gamesPlayed || 0;
  const puzzlesSolved = profile.puzzlesSolved || 0;
  const bestPuzzleStreak = Math.max(
    profile.bestPuzzleStreak || 0,
    profile.puzzleStreak || 0
  );
  const bestDailyStreak = Math.max(
    profile.bestDailyStreak || 0,
    profile.dailyStreak || 0
  );
  const bestPlayDays = Math.max(
    profile.bestPlayStreakDays || 0,
    profile.playStreakDays || 0,
    bestDailyStreak
  );
  const maxLive = Math.max(
    profile.ratings?.bullet || 1200,
    profile.ratings?.blitz || 1200,
    profile.ratings?.rapid || 1200,
    profile.ratings?.classical || 1200
  );
  const puzzleRating = profile.ratings?.puzzle || 1200;

  switch (achId) {
    case 'first-victory':
      return { current: Math.min(1, wins), target: 1, unit: 'win' };
    case 'ten-wins':
      return { current: Math.min(10, wins), target: 10, unit: 'wins' };
    case 'fifty-games':
      return { current: Math.min(50, games), target: 50, unit: 'games' };
    case 'hundred-wins':
      return { current: Math.min(100, wins), target: 100, unit: 'wins' };
    case 'puzzles-solved-10':
      return { current: Math.min(10, puzzlesSolved), target: 10, unit: 'puzzles' };
    case 'puzzles-solved-50':
      return { current: Math.min(50, puzzlesSolved), target: 50, unit: 'puzzles' };
    case 'puzzle-streak-3':
      return { current: Math.min(3, bestPuzzleStreak), target: 3, unit: 'streak' };
    case 'puzzle-streak-10':
      return { current: Math.min(10, bestPuzzleStreak), target: 10, unit: 'streak' };
    case 'puzzle-1500':
      return { current: Math.min(1500, puzzleRating), target: 1500, unit: 'elo' };
    case 'play-streak-3':
      return { current: Math.min(3, bestPlayDays), target: 3, unit: 'days' };
    case 'play-streak-7':
      return { current: Math.min(7, bestPlayDays), target: 7, unit: 'days' };
    case 'daily-streak-3':
      return { current: Math.min(3, bestDailyStreak), target: 3, unit: 'days' };
    case 'daily-streak-7':
      return { current: Math.min(7, bestDailyStreak), target: 7, unit: 'days' };
    case 'rating-1400':
      return { current: Math.min(1400, maxLive), target: 1400, unit: 'elo' };
    case 'rating-1800':
      return { current: Math.min(1800, maxLive), target: 1800, unit: 'elo' };
    default:
      return null;
  }
}
