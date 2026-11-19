import { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Crown,
  Flame,
  Lock,
  Puzzle,
  Shield,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react';
import {
  ACHIEVEMENTS,
  getAchievementProgress,
  type AchievementDefinition,
} from '../data/achievements';
import { useLocale } from '../contexts/LocaleContext';
import type { UserProfile } from '../shared/chessTypes';

const TIER_STYLES: Record<
  AchievementDefinition['tier'],
  { badge: string; border: string; iconBg: string }
> = {
  Bronze: {
    badge: 'text-amber-500 border-amber-700/50 bg-amber-950/30',
    border: 'border-amber-700/50 bg-amber-950/15',
    iconBg: 'bg-amber-500/15 text-amber-400',
  },
  Silver: {
    badge: 'text-slate-200 border-slate-500/60 bg-slate-800/60',
    border: 'border-slate-500/60 bg-slate-800/35',
    iconBg: 'bg-slate-400/15 text-slate-200',
  },
  Gold: {
    badge: 'text-amber-300 border-amber-500/60 bg-amber-500/15',
    border: 'border-amber-500/60 bg-amber-950/25',
    iconBg: 'bg-amber-400/20 text-amber-300',
  },
  Diamond: {
    badge: 'text-cyan-300 border-cyan-500/60 bg-cyan-950/35',
    border: 'border-cyan-500/60 bg-cyan-950/20',
    iconBg: 'bg-cyan-400/20 text-cyan-300',
  },
};

function getCategoryIcon(category: AchievementDefinition['category']) {
  switch (category) {
    case 'Games':
      return Swords;
    case 'Tactics':
      return Puzzle;
    case 'Streaks':
      return Flame;
    case 'Mastery':
      return Crown;
    case 'Social':
      return Shield;
    case 'Customization':
      return Sparkles;
    default:
      return Award;
  }
}

export function AchievementBadgesGrid({
  profile,
  title,
  subtitle,
  compact = false,
}: {
  profile: UserProfile | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const { t } = useLocale();
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [catFilter, setCatFilter] = useState<'All' | AchievementDefinition['category']>('All');

  const categoryLabels: Record<AchievementDefinition['category'], string> = {
    Games: t('badges.catGames'),
    Tactics: t('badges.catTactics'),
    Streaks: t('badges.catStreaks'),
    Mastery: t('badges.catMastery'),
    Social: t('badges.catSocial'),
    Customization: t('badges.catCustomization'),
  };

  const tierLabels: Record<AchievementDefinition['tier'], string> = {
    Bronze: t('badges.tierBronze'),
    Silver: t('badges.tierSilver'),
    Gold: t('badges.tierGold'),
    Diamond: t('badges.tierDiamond'),
  };

  const unlockedSet = useMemo(
    () => new Set(profile?.achievements || []),
    [profile?.achievements]
  );

  const totalPoints = useMemo(
    () =>
      ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).reduce(
        (sum, a) => sum + a.points,
        0
      ),
    [unlockedSet]
  );

  const maxPoints = useMemo(
    () => ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0),
    []
  );

  const filteredAchievements = useMemo(() => {
    const items = ACHIEVEMENTS.filter((ach) => {
      const isUnlocked = unlockedSet.has(ach.id);
      if (statusFilter === 'unlocked' && !isUnlocked) return false;
      if (statusFilter === 'locked' && isUnlocked) return false;
      if (catFilter !== 'All' && ach.category !== catFilter) return false;
      return true;
    });
    // Show unlocked first in profile/compact mode unless filtered
    return [...items].sort((a, b) => {
      const ua = unlockedSet.has(a.id) ? 1 : 0;
      const ub = unlockedSet.has(b.id) ? 1 : 0;
      return ub - ua;
    });
  }, [unlockedSet, statusFilter, catFilter]);

  return (
    <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-100 inline-flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            {title ?? t('badges.defaultTitle')}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle ?? t('badges.defaultSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-[#12171E] border border-slate-800 font-mono text-xs text-emerald-400 tabular-nums">
            {t('badges.countLabel', { unlocked: unlockedSet.size, total: ACHIEVEMENTS.length })}
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#12171E] border border-slate-800 font-mono text-xs text-amber-300 tabular-nums">
            {totalPoints} / {maxPoints} {t('app.pts')}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 bg-[#12171E] border border-slate-800 rounded-lg p-1">
          {(
            [
              { id: 'all', label: t('badges.filterAll') },
              { id: 'unlocked', label: t('badges.filterUnlocked') },
              { id: 'locked', label: t('badges.filterInProgress') },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setStatusFilter(st.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === st.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-1">
            {(['All', 'Games', 'Tactics', 'Streaks', 'Mastery', 'Social', 'Customization'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    catFilter === cat
                      ? 'bg-[#1D2633] text-emerald-300 border border-emerald-700/60'
                      : 'bg-[#12171E] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cat === 'All' ? t('common.all') : categoryLabels[cat]}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Badges Grid */}
      {filteredAchievements.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          {t('badges.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAchievements.map((ach) => {
            const unlocked = unlockedSet.has(ach.id);
            const progress = getAchievementProgress(ach.id, profile);
            const pct = progress
              ? Math.min(100, Math.round((progress.current / progress.target) * 100))
              : unlocked
                ? 100
                : 0;
            const tierStyle = TIER_STYLES[ach.tier];
            const Icon = getCategoryIcon(ach.category);

            return (
              <div
                key={ach.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  unlocked
                    ? tierStyle.border
                    : 'bg-[#12171E]/80 border-slate-800/90 opacity-85'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          unlocked
                            ? tierStyle.iconBg
                            : 'bg-slate-800/80 text-slate-500'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display text-sm font-bold text-slate-100 truncate">
                          {ach.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400">
                          {categoryLabels[ach.category]} · {ach.points} {t('app.pts')}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold shrink-0 inline-flex items-center gap-1 ${
                        unlocked
                          ? tierStyle.badge
                          : 'border-slate-700 bg-slate-900 text-slate-500'
                      }`}
                    >
                      {unlocked ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          {tierLabels[ach.tier]}
                        </>
                      ) : (
                        <>
                          <Lock className="w-2.5 h-2.5" />
                          {tierLabels[ach.tier]}
                        </>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {ach.description}
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{ach.requirementHint}</span>
                    {progress && (
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          unlocked ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
                        {progress.current}/{progress.target}
                      </span>
                    )}
                  </div>
                  {progress && (
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          unlocked ? 'bg-emerald-500' : 'bg-amber-500/80'
                        }`}
                        style={{ width: `${unlocked ? 100 : pct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
