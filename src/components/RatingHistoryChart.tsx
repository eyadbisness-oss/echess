import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Activity,
  Filter,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import type { TranslationKey } from '../i18n/translations';
import {
  TIME_CONTROLS,
  type ChessGameRecord,
  type TimeCategory,
  type UserProfile,
} from '../shared/chessTypes';

type CategoryFilter = 'all' | TimeCategory;
type RangeFilter = '7d' | '30d' | '90d' | 'all';

interface SingleSeriesPoint {
  key: string;
  gameIndex: number;
  timestampMs: number;
  dateLabel: string;
  fullDate: string;
  rating: number;
  delta: number;
  opponent: string;
  opponentRating: number;
  outcome: 'Win' | 'Draw' | 'Loss' | 'Baseline';
  timeControl: string;
  category: TimeCategory;
  openingName?: string;
  isBaseline?: boolean;
}

interface MultiSeriesPoint {
  key: string;
  timestampMs: number;
  dateLabel: string;
  fullDate: string;
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
  activeCategory?: TimeCategory;
  delta?: number;
  opponent?: string;
  outcome?: 'Win' | 'Draw' | 'Loss';
  timeControl?: string;
}

const CATEGORY_META: Record<
  TimeCategory,
  { labelKey: TranslationKey; color: string; stroke: string }
> = {
  bullet: { labelKey: 'common.bullet', color: 'text-amber-400', stroke: '#F59E0B' },
  blitz: { labelKey: 'common.blitz', color: 'text-emerald-400', stroke: '#10B981' },
  rapid: { labelKey: 'common.rapid', color: 'text-sky-400', stroke: '#38BDF8' },
  classical: { labelKey: 'common.classical', color: 'text-violet-400', stroke: '#A78BFA' },
};

const TIME_CATEGORIES: TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];

function toMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') return obj.toMillis();
    if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  }
  return 0;
}

function formatShortDate(ms: number, includeTime: boolean): string {
  if (!ms) return 'Start';
  const d = new Date(ms);
  if (includeTime) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(ms: number): string {
  if (!ms) return 'Initial Rating';
  const d = new Date(ms);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type TranslateFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function translateOutcome(outcome: 'Win' | 'Draw' | 'Loss' | 'Baseline' | undefined, t: TranslateFn): string {
  if (outcome === 'Win') return t('common.win');
  if (outcome === 'Draw') return t('common.draw');
  if (outcome === 'Loss') return t('common.loss');
  return outcome || '';
}

function SingleTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: Array<{ payload: SingleSeriesPoint }>;
  t: TranslateFn;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  const deltaSign = pt.delta > 0 ? '+' : '';
  return (
    <div className="bg-[#0B0E11] border border-slate-700 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 min-w-[190px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-slate-400">{pt.fullDate}</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300 uppercase">
          {pt.timeControl}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-bold text-white tabular-nums">
          {pt.rating}
        </span>
        {!pt.isBaseline && (
          <span
            className={`font-mono font-bold tabular-nums ${
              pt.delta > 0
                ? 'text-emerald-400'
                : pt.delta < 0
                  ? 'text-rose-400'
                  : 'text-slate-400'
            }`}
          >
            {deltaSign}
            {pt.delta}
          </span>
        )}
      </div>
      {!pt.isBaseline ? (
        <div className="pt-1 border-t border-slate-800 space-y-0.5">
          <p className="text-slate-200 font-medium">
            <span
              className={
                pt.outcome === 'Win'
                  ? 'text-emerald-400'
                  : pt.outcome === 'Loss'
                    ? 'text-rose-400'
                    : 'text-slate-300'
              }
            >
              {translateOutcome(pt.outcome, t)}
            </span>{' '}
            vs {pt.opponent} ({pt.opponentRating})
          </p>
          {pt.openingName && (
            <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
              {pt.openingName}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">{t('chart.startingBaseline')}</p>
      )}
    </div>
  );
}

function MultiTooltip({
  active,
  payload,
  t,
}: {
  active?: boolean;
  payload?: Array<{ payload: MultiSeriesPoint }>;
  t: TranslateFn;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  return (
    <div className="bg-[#0B0E11] border border-slate-700 rounded-xl p-3 shadow-2xl text-xs space-y-2 min-w-[210px]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
        <span className="font-mono text-slate-400">{pt.fullDate}</span>
        {pt.timeControl && (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300">
            {pt.timeControl}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {TIME_CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORY_META[cat].stroke }}
              />
              {t(CATEGORY_META[cat].labelKey)}
            </span>
            <span className="font-mono font-bold text-slate-100 tabular-nums">
              {pt[cat]}
            </span>
          </div>
        ))}
      </div>
      {pt.opponent && pt.activeCategory && (
        <div className="pt-1.5 border-t border-slate-800 text-[11px] text-slate-300">
          <span className="font-semibold text-slate-200">
            {t(CATEGORY_META[pt.activeCategory].labelKey)}
          </span>{' '}
          {translateOutcome(pt.outcome, t)} vs {pt.opponent}{' '}
          <span
            className={`font-mono font-semibold ${
              (pt.delta || 0) > 0
                ? 'text-emerald-400'
                : (pt.delta || 0) < 0
                  ? 'text-rose-400'
                  : 'text-slate-400'
            }`}
          >
            ({(pt.delta || 0) > 0 ? '+' : ''}
            {pt.delta || 0})
          </span>
        </div>
      )}
    </div>
  );
}

export function RatingHistoryChart({
  profile,
  onPlayOnline,
}: {
  profile: UserProfile;
  onPlayOnline?: () => void;
}) {
  const { firebaseUser, isOwner } = useAuth();
  const { t, isRtl } = useLocale();
  const [games, setGames] = useState<ChessGameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('blitz');
  const [timeControlFilter, setTimeControlFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');

  useEffect(() => {
    if (!firebaseUser || !profile.uid) {
      setGames([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isOwnOrAdmin = profile.uid === firebaseUser.uid || isOwner;

    const qWhite = isOwnOrAdmin
      ? query(
          collection(db, 'games'),
          where('whiteId', '==', profile.uid),
          limit(250)
        )
      : query(
          collection(db, 'games'),
          where('whiteId', '==', profile.uid),
          where('rated', '==', true),
          limit(250)
        );

    const qBlack = isOwnOrAdmin
      ? query(
          collection(db, 'games'),
          where('blackId', '==', profile.uid),
          limit(250)
        )
      : query(
          collection(db, 'games'),
          where('blackId', '==', profile.uid),
          where('rated', '==', true),
          limit(250)
        );

    let whiteDocs: ChessGameRecord[] = [];
    let blackDocs: ChessGameRecord[] = [];
    let whiteLoaded = false;
    let blackLoaded = false;

    const sync = () => {
      const merged = new Map<string, ChessGameRecord>();
      for (const g of [...whiteDocs, ...blackDocs]) {
        merged.set(g.id, g);
      }
      const sorted = Array.from(merged.values()).sort((a, b) => {
        const ta = toMillis(a.endedAt) || toMillis(a.createdAt);
        const tb = toMillis(b.endedAt) || toMillis(b.createdAt);
        return ta - tb;
      });
      setGames(sorted);
      if (whiteLoaded && blackLoaded) setLoading(false);
    };

    const u1 = onSnapshot(
      qWhite,
      (snap) => {
        whiteDocs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChessGameRecord, 'id'>),
        }));
        whiteLoaded = true;
        sync();
      },
      (err) => {
        whiteLoaded = true;
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'games');
        } catch {
          // Logged via handleFirestoreError
        }
      }
    );

    const u2 = onSnapshot(
      qBlack,
      (snap) => {
        blackDocs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChessGameRecord, 'id'>),
        }));
        blackLoaded = true;
        sync();
      },
      (err) => {
        blackLoaded = true;
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'games');
        } catch {
          // Logged via handleFirestoreError
        }
      }
    );

    return () => {
      u1();
      u2();
    };
  }, [firebaseUser, profile.uid, isOwner]);

  // All rated games in standard time control categories
  const ratedGames = useMemo(
    () =>
      games.filter(
        (g) =>
          g.rated &&
          TIME_CATEGORIES.includes(g.category as TimeCategory)
      ),
    [games]
  );

  // Available specific time controls for dropdown
  const availableTimeControls = useMemo(() => {
    const presetList =
      categoryFilter === 'all'
        ? TIME_CONTROLS
        : TIME_CONTROLS.filter((t) => t.category === categoryFilter);
    const codes = new Set<string>(presetList.map((t) => t.code));
    for (const g of ratedGames) {
      if (categoryFilter === 'all' || g.category === categoryFilter) {
        if (g.timeControl) codes.add(g.timeControl);
      }
    }
    return Array.from(codes);
  }, [categoryFilter, ratedGames]);

  // Reset specific timeControl filter if switching categories makes it invalid
  useEffect(() => {
    if (
      timeControlFilter !== 'all' &&
      !availableTimeControls.includes(timeControlFilter)
    ) {
      setTimeControlFilter('all');
    }
  }, [availableTimeControls, timeControlFilter]);

  const cutoffMs = useMemo(() => {
    if (rangeFilter === 'all') return 0;
    const days = rangeFilter === '7d' ? 7 : rangeFilter === '30d' ? 30 : 90;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }, [rangeFilter]);

  const filteredGames = useMemo(() => {
    return ratedGames.filter((g) => {
      if (categoryFilter !== 'all' && g.category !== categoryFilter) {
        return false;
      }
      if (
        timeControlFilter !== 'all' &&
        g.timeControl !== timeControlFilter
      ) {
        return false;
      }
      const ts = toMillis(g.endedAt) || toMillis(g.createdAt);
      if (cutoffMs > 0 && ts < cutoffMs) return false;
      return true;
    });
  }, [ratedGames, categoryFilter, timeControlFilter, cutoffMs]);

  const singleViewCat: TimeCategory | null = useMemo(() => {
    if (categoryFilter !== 'all') return categoryFilter;
    if (timeControlFilter !== 'all') {
      const preset = TIME_CONTROLS.find((t) => t.code === timeControlFilter);
      if (preset) return preset.category;
      const sample = filteredGames[0];
      if (sample && TIME_CATEGORIES.includes(sample.category as TimeCategory)) {
        return sample.category as TimeCategory;
      }
    }
    return null;
  }, [categoryFilter, timeControlFilter, filteredGames]);

  const singleSeries = useMemo<SingleSeriesPoint[]>(() => {
    if (!singleViewCat) return [];
    const currentRating = profile.ratings?.[singleViewCat] ?? 1200;

    if (filteredGames.length === 0) {
      const now = Date.now();
      return [
        {
          key: 'baseline-empty',
          gameIndex: 0,
          timestampMs: now,
          dateLabel: t('chart.now'),
          fullDate: formatFullDate(now),
          rating: currentRating,
          delta: 0,
          opponent: '-',
          opponentRating: currentRating,
          outcome: 'Baseline',
          timeControl:
            timeControlFilter !== 'all' ? timeControlFilter : singleViewCat,
          category: singleViewCat,
          isBaseline: true,
        },
      ];
    }

    const timestamps = filteredGames.map(
      (g) => toMillis(g.endedAt) || toMillis(g.createdAt) || Date.now()
    );
    const sameDay =
      timestamps.length > 1 &&
      new Date(timestamps[0]).toDateString() ===
        new Date(timestamps[timestamps.length - 1]).toDateString();

    const first = filteredGames[0];
    const firstIsWhite = first.whiteId === profile.uid;
    const firstPre = firstIsWhite
      ? first.whiteRating ?? 1200
      : first.blackRating ?? 1200;
    const firstTs = timestamps[0];

    const pts: SingleSeriesPoint[] = [
      {
        key: 'start',
        gameIndex: 0,
        timestampMs: Math.max(0, firstTs - 60_000),
        dateLabel: t('chart.start'),
        fullDate: `${t('chart.start')} · ${formatFullDate(firstTs)}`,
        rating: firstPre,
        delta: 0,
        opponent: '-',
        opponentRating: firstPre,
        outcome: 'Baseline',
        timeControl: first.timeControl,
        category: singleViewCat,
        isBaseline: true,
      },
    ];

    filteredGames.forEach((g, idx) => {
      const isWhite = g.whiteId === profile.uid;
      const pre = isWhite ? g.whiteRating ?? 1200 : g.blackRating ?? 1200;
      const delta = isWhite
        ? g.whiteRatingDelta ?? 0
        : g.blackRatingDelta ?? 0;
      const post = pre + delta;
      const ts = timestamps[idx];
      const outcome: 'Win' | 'Draw' | 'Loss' =
        g.result === '1/2-1/2'
          ? 'Draw'
          : (g.result === '1-0' && isWhite) || (g.result === '0-1' && !isWhite)
            ? 'Win'
            : 'Loss';

      pts.push({
        key: g.id,
        gameIndex: idx + 1,
        timestampMs: ts,
        dateLabel: formatShortDate(ts, sameDay),
        fullDate: formatFullDate(ts),
        rating: post,
        delta,
        opponent: isWhite ? g.blackName : g.whiteName,
        opponentRating: isWhite
          ? g.blackRating ?? 1200
          : g.whiteRating ?? 1200,
        outcome,
        timeControl: g.timeControl,
        category: singleViewCat,
        openingName: g.openingName,
      });
    });

    return pts;
  }, [singleViewCat, filteredGames, profile.uid, profile.ratings, timeControlFilter, t]);

  const multiSeries = useMemo<MultiSeriesPoint[]>(() => {
    if (singleViewCat !== null) return [];

    // Seed initial pre-ratings per category using earliest rated game or current profile rating
    const running: Record<TimeCategory, number> = {
      bullet: profile.ratings?.bullet ?? 1200,
      blitz: profile.ratings?.blitz ?? 1200,
      rapid: profile.ratings?.rapid ?? 1200,
      classical: profile.ratings?.classical ?? 1200,
    };

    for (const cat of TIME_CATEGORIES) {
      const firstForCat = filteredGames.find((g) => g.category === cat);
      if (firstForCat) {
        const isW = firstForCat.whiteId === profile.uid;
        running[cat] = isW
          ? firstForCat.whiteRating ?? 1200
          : firstForCat.blackRating ?? 1200;
      }
    }

    if (filteredGames.length === 0) {
      const now = Date.now();
      return [
        {
          key: 'multi-start',
          timestampMs: now,
          dateLabel: t('chart.now'),
          fullDate: formatFullDate(now),
          ...running,
        },
      ];
    }

    const timestamps = filteredGames.map(
      (g) => toMillis(g.endedAt) || toMillis(g.createdAt) || Date.now()
    );
    const sameDay =
      timestamps.length > 1 &&
      new Date(timestamps[0]).toDateString() ===
        new Date(timestamps[timestamps.length - 1]).toDateString();

    const pts: MultiSeriesPoint[] = [
      {
        key: 'multi-baseline',
        timestampMs: Math.max(0, timestamps[0] - 60_000),
        dateLabel: t('chart.start'),
        fullDate: `${t('chart.start')} · ${formatFullDate(timestamps[0])}`,
        ...running,
      },
    ];

    filteredGames.forEach((g, idx) => {
      const cat = g.category as TimeCategory;
      const isWhite = g.whiteId === profile.uid;
      const pre = isWhite ? g.whiteRating ?? 1200 : g.blackRating ?? 1200;
      const delta = isWhite
        ? g.whiteRatingDelta ?? 0
        : g.blackRatingDelta ?? 0;
      running[cat] = pre + delta;
      const ts = timestamps[idx];
      const outcome: 'Win' | 'Draw' | 'Loss' =
        g.result === '1/2-1/2'
          ? 'Draw'
          : (g.result === '1-0' && isWhite) || (g.result === '0-1' && !isWhite)
            ? 'Win'
            : 'Loss';

      pts.push({
        key: g.id,
        timestampMs: ts,
        dateLabel: formatShortDate(ts, sameDay),
        fullDate: formatFullDate(ts),
        ...running,
        activeCategory: cat,
        delta,
        opponent: isWhite ? g.blackName : g.whiteName,
        outcome,
        timeControl: g.timeControl,
      });
    });

    return pts;
  }, [singleViewCat, filteredGames, profile.uid, profile.ratings, t]);

  const stats = useMemo(() => {
    const wins = filteredGames.filter((g) => {
      const isW = g.whiteId === profile.uid;
      return (g.result === '1-0' && isW) || (g.result === '0-1' && !isW);
    }).length;
    const total = filteredGames.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    if (singleViewCat) {
      const values = singleSeries.map((p) => p.rating);
      const latest = values[values.length - 1] ?? (profile.ratings?.[singleViewCat] ?? 1200);
      const first = values[0] ?? latest;
      const peak = values.length > 0 ? Math.max(...values) : latest;
      const net = latest - first;
      return { current: latest, peak, net, total, winRate };
    }

    // All-formats summary uses highest active rating or Blitz
    const allRatings = TIME_CATEGORIES.map((c) => profile.ratings?.[c] ?? 1200);
    const highest = Math.max(...allRatings);
    const netAll = filteredGames.reduce((acc, g) => {
      const isW = g.whiteId === profile.uid;
      return acc + (isW ? g.whiteRatingDelta ?? 0 : g.blackRatingDelta ?? 0);
    }, 0);
    return {
      current: highest,
      peak: highest,
      net: netAll,
      total,
      winRate,
    };
  }, [filteredGames, singleViewCat, singleSeries, profile.uid, profile.ratings]);

  const activeStroke = singleViewCat
    ? CATEGORY_META[singleViewCat].stroke
    : '#10B981';

  return (
    <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-5 space-y-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-100 inline-flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            {t('chart.title')}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('chart.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div
            className="flex flex-wrap items-center gap-1 bg-[#12171E] border border-slate-800 rounded-lg p-1"
            role="tablist"
            aria-label={t('chart.title')}
          >
            {(
              [
                { id: 'all', label: t('common.all') },
                { id: 'bullet', label: t('common.bullet') },
                { id: 'blitz', label: t('common.blitz') },
                { id: 'rapid', label: t('common.rapid') },
                { id: 'classical', label: t('common.classical') },
              ] as { id: CategoryFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={categoryFilter === opt.id}
                onClick={() => setCategoryFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  categoryFilter === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Specific Time Control Filter */}
          <div className="inline-flex items-center gap-1.5 bg-[#12171E] border border-slate-800 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              aria-label={t('chart.allTimeControls')}
              value={timeControlFilter}
              onChange={(e) => setTimeControlFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#12171E]">
                {t('chart.allTimeControls')}
              </option>
              {availableTimeControls.map((tc) => (
                <option key={tc} value={tc} className="bg-[#12171E]">
                  {tc}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1 bg-[#12171E] border border-slate-800 rounded-lg p-1">
            {(
              [
                { id: '7d', label: `7${t('app.daysShort').toUpperCase()}` },
                { id: '30d', label: `30${t('app.daysShort').toUpperCase()}` },
                { id: '90d', label: `90${t('app.daysShort').toUpperCase()}` },
                { id: 'all', label: t('common.all') },
              ] as { id: RangeFilter; label: string }[]
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeFilter(r.id)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                  rangeFilter === r.id
                    ? 'bg-[#1D2633] text-emerald-300 border border-emerald-700/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#12171E] border border-slate-800/80 rounded-lg px-3.5 py-2.5">
          <p className="text-[11px] text-slate-400">
            {singleViewCat
              ? t('chart.formatRating', { format: t(CATEGORY_META[singleViewCat].labelKey) })
              : t('chart.bestFormatRating')}
          </p>
          <p className="font-mono text-xl font-bold text-slate-100 tabular-nums mt-0.5">
            {stats.current}
          </p>
        </div>

        <div className="bg-[#12171E] border border-slate-800/80 rounded-lg px-3.5 py-2.5">
          <p className="text-[11px] text-slate-400">{t('chart.netChange')}</p>
          <p
            className={`font-mono text-xl font-bold tabular-nums mt-0.5 inline-flex items-center gap-1 ${
              stats.net > 0
                ? 'text-emerald-400'
                : stats.net < 0
                  ? 'text-rose-400'
                  : 'text-slate-300'
            }`}
          >
            {stats.net > 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : stats.net < 0 ? (
              <TrendingDown className="w-4 h-4" />
            ) : null}
            {stats.net > 0 ? '+' : ''}
            {stats.net}
          </p>
        </div>

        <div className="bg-[#12171E] border border-slate-800/80 rounded-lg px-3.5 py-2.5">
          <p className="text-[11px] text-slate-400">{t('chart.peakInView')}</p>
          <p className="font-mono text-xl font-bold text-amber-400 tabular-nums mt-0.5">
            {stats.peak}
          </p>
        </div>

        <div className="bg-[#12171E] border border-slate-800/80 rounded-lg px-3.5 py-2.5">
          <p className="text-[11px] text-slate-400">{t('chart.ratedGames')}</p>
          <p className="font-mono text-xl font-bold text-slate-100 tabular-nums mt-0.5">
            {stats.total}{' '}
            <span className="text-xs font-normal text-slate-400">
              ({stats.winRate}% {t('chart.winShort')})
            </span>
          </p>
        </div>
      </div>

      {/* Recharts Graph Canvas */}
      <div dir="ltr" className="relative h-[300px] w-full pt-2">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            {t('chart.loading')}
          </div>
        ) : (
          <>
            {singleViewCat !== null ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={singleSeries}
                  margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient
                      id="ratingAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={activeStroke}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor={activeStroke}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1E293B"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#1E293B' }}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    domain={[
                      (min: number) => Math.max(200, Math.floor((min - 35) / 10) * 10),
                      (max: number) => Math.ceil((max + 35) / 10) * 10,
                    ]}
                  />
                  <ReferenceLine
                    y={1200}
                    stroke="#334155"
                    strokeDasharray="4 4"
                  />
                  <Tooltip content={<SingleTooltip t={t} />} />
                  <Area
                    type="monotone"
                    dataKey="rating"
                    stroke={activeStroke}
                    strokeWidth={2.5}
                    fill="url(#ratingAreaGrad)"
                    dot={{
                      r: filteredGames.length > 35 ? 0 : 3.5,
                      fill: activeStroke,
                      stroke: '#0B0E11',
                      strokeWidth: 1.5,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: activeStroke,
                      stroke: '#FFFFFF',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={multiSeries}
                  margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1E293B"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#1E293B' }}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    domain={[
                      (min: number) => Math.max(200, Math.floor((min - 35) / 10) * 10),
                      (max: number) => Math.ceil((max + 35) / 10) * 10,
                    ]}
                  />
                  <ReferenceLine
                    y={1200}
                    stroke="#334155"
                    strokeDasharray="4 4"
                  />
                  <Tooltip content={<MultiTooltip t={t} />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                  {TIME_CATEGORIES.map((cat) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      name={t(CATEGORY_META[cat].labelKey)}
                      stroke={CATEGORY_META[cat].stroke}
                      strokeWidth={2.25}
                      dot={{
                        r: filteredGames.length > 30 ? 0 : 3,
                        fill: CATEGORY_META[cat].stroke,
                      }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}

            {filteredGames.length === 0 && (
              <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="bg-[#12171E]/95 border border-slate-700/80 rounded-xl px-5 py-4 text-center space-y-2 max-w-sm pointer-events-auto shadow-xl">
                  <p className="text-xs font-semibold text-slate-200">
                    {t('chart.noMatches', {
                      filter:
                        timeControlFilter !== 'all'
                          ? timeControlFilter
                          : categoryFilter !== 'all'
                            ? t(CATEGORY_META[categoryFilter].labelKey)
                            : '',
                    })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {t('chart.baselineHint', { rating: stats.current })}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {(categoryFilter !== 'all' ||
                      timeControlFilter !== 'all' ||
                      rangeFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('all');
                          setTimeControlFilter('all');
                          setRangeFilter('all');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-[11px] font-medium text-slate-200"
                      >
                        {t('chart.resetFilters')}
                      </button>
                    )}
                    {onPlayOnline && profile.uid === firebaseUser?.uid && (
                      <button
                        type="button"
                        onClick={onPlayOnline}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white"
                      >
                        {t('chart.playRatedMatch')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
