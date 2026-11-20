import { useEffect, useState } from 'react';
import {
  Swords,
  Cpu,
  Puzzle,
  BarChart3,
  Trophy,
  BookOpen,
  ArrowRight,
  Award,
  Clock,
} from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMultiplayer } from '../contexts/MultiplayerContext';
import { GeminiChessCoach } from '../components/GeminiChessCoach';
import { ACHIEVEMENTS } from '../data/achievements';
import type { ChessGameRecord } from '../shared/chessTypes';

export type AppView =
  | 'home'
  | 'play-online'
  | 'play-computer'
  | 'puzzles'
  | 'lessons'
  | 'analysis'
  | 'openings'
  | 'history'
  | 'social'
  | 'profile'
  | 'membership'
  | 'settings'
  | 'owner';

interface HomeViewProps {
  onNavigate: (view: AppView) => void;
  onOpenReview: (pgn: string, meta?: Partial<ChessGameRecord>) => void;
}

export function HomeView({ onNavigate, onOpenReview }: HomeViewProps) {
  const { profile, firebaseUser, platformConfig, signInWithGoogle } = useAuth();
  const { t } = useLocale();
  const { onlinePlayers, activeRoom } = useMultiplayer();
  const [recentGames, setRecentGames] = useState<ChessGameRecord[]>([]);

  useEffect(() => {
    if (!firebaseUser) {
      setRecentGames([]);
      return;
    }
    const q = query(
      collection(db, 'games'),
      where('whiteId', '==', firebaseUser.uid),
      orderBy('endedAt', 'desc'),
      limit(5)
    );
    const q2 = query(
      collection(db, 'games'),
      where('blackId', '==', firebaseUser.uid),
      orderBy('endedAt', 'desc'),
      limit(5)
    );

    let whiteList: ChessGameRecord[] = [];
    let blackList: ChessGameRecord[] = [];
    const merge = () => {
      const map = new Map<string, ChessGameRecord>();
      for (const g of [...whiteList, ...blackList]) map.set(g.id, g);
      setRecentGames(Array.from(map.values()).slice(0, 5));
    };

    const u1 = onSnapshot(
      q,
      (snap) => {
        whiteList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChessGameRecord, 'id'>) }));
        merge();
      },
      () => {}
    );
    const u2 = onSnapshot(
      q2,
      (snap) => {
        blackList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChessGameRecord, 'id'>) }));
        merge();
      },
      () => {}
    );

    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  const unlockedCount = profile?.achievements?.length || 0;

  return (
    <div className="space-y-6 max-w-[1360px] mx-auto">
      {platformConfig.announcement && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-4 py-3 text-sm text-emerald-200 flex items-center justify-between gap-4">
          <span>{platformConfig.announcement}</span>
        </div>
      )}

      {activeRoom && activeRoom.status === 'active' && (
        <div className="bg-amber-950/40 border border-amber-700/60 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-200">{t('home.activeMatchTitle')}</p>
            <p className="text-xs text-amber-300/80">
              {activeRoom.white.displayName} vs {activeRoom.black.displayName} · {activeRoom.timeControl}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('play-online')}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {t('home.returnToBoard')}
          </button>
        </div>
      )}

      {/* Hero Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 relative rounded-xl overflow-hidden border border-slate-800 bg-[#12171E] flex flex-col justify-between min-h-[340px]">
          <img
            src="/src/assets/images/echess_hero_arena_1795034539444.jpg"
            alt="eChess tournament board"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E11] via-[#0B0E11]/75 to-transparent" />

          <div className="relative z-10 p-6 sm:p-8 flex flex-col justify-end h-full space-y-5">
            <div className="space-y-2 max-w-xl">
              <p className="text-xs font-medium text-emerald-400 tracking-wide">
                {t('home.heroEyebrow')}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                {t('home.heroTitle')}
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {t('home.heroSubtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {firebaseUser ? (
                <button
                  type="button"
                  onClick={() => onNavigate('play-online')}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-[background-color,transform] duration-150 active:scale-[0.97] whitespace-nowrap"
                >
                  <Swords className="w-4 h-4" />
                  {t('nav.playOnline')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-[background-color,transform] duration-150 active:scale-[0.97] whitespace-nowrap"
                >
                  {t('home.signInToPlay')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('play-computer')}
                className="px-5 py-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-slate-100 text-sm font-semibold inline-flex items-center gap-2 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] whitespace-nowrap"
              >
                <Cpu className="w-4 h-4 text-emerald-400" />
                {t('nav.playComputer')}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('puzzles')}
                className="px-4 py-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-slate-200 text-sm font-medium inline-flex items-center gap-2 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] whitespace-nowrap"
              >
                <Puzzle className="w-4 h-4 text-amber-400" />
                {t('home.dailyPuzzle')}
                {(profile?.dailyStreak || 0) > 0 && (
                  <span className="font-mono text-xs text-amber-400 tabular-nums">
                    · {profile?.dailyStreak}{t('app.daysShort')}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Home-Only Gemini Chess Coach */}
        <div className="lg:col-span-5">
          {platformConfig.features.geminiCoach ? (
            <GeminiChessCoach onOpenSettings={() => onNavigate('settings')} />
          ) : (
            <div className="h-full bg-[#12171E] border border-slate-800 rounded-xl p-6 flex items-center justify-center text-sm text-slate-400">
              {t('home.coachPaused')}
            </div>
          )}
        </div>
      </div>

      {/* Rating & Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: t('common.bullet'), val: profile?.ratings?.bullet ?? 1200 },
          { label: t('common.blitz'), val: profile?.ratings?.blitz ?? 1200 },
          { label: t('common.rapid'), val: profile?.ratings?.rapid ?? 1200 },
          { label: t('common.classical'), val: profile?.ratings?.classical ?? 1200 },
          { label: t('common.puzzles'), val: profile?.ratings?.puzzle ?? 1200 },
          { label: t('home.playersOnline'), val: onlinePlayers.length },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[#12171E] border border-slate-800 rounded-xl px-4 py-3.5"
          >
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="font-mono text-2xl font-bold text-slate-100 tabular-nums mt-1">
              {item.val}
            </p>
          </div>
        ))}
      </div>

      {/* Feature Launchers + Recent Games + Achievements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quick Navigation */}
        <div className="lg:col-span-4 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-100">{t('home.trainingMastery')}</h2>
          <div className="divide-y divide-slate-800/80">
            {[
              { id: 'analysis' as AppView, icon: BarChart3, title: t('home.toolReviewTitle'), desc: t('home.toolReviewDesc') },
              { id: 'openings' as AppView, icon: BookOpen, title: t('home.toolOpeningsTitle'), desc: t('home.toolOpeningsDesc') },
              { id: 'lessons' as AppView, icon: Trophy, title: t('home.toolLessonsTitle'), desc: t('home.toolLessonsDesc') },
              { id: 'settings' as AppView, icon: Award, title: t('home.toolSettingsTitle'), desc: t('home.toolSettingsDesc') },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="group w-full py-3 flex items-center justify-between gap-3 text-start hover:bg-[#171D26] -mx-2 px-2 rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-emerald-400 shrink-0 transition-transform duration-150 group-hover:scale-110" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                      <p className="text-xs text-slate-400 truncate">{item.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0 transition-transform duration-150 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Games */}
        <div className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-100">{t('home.recentGames')}</h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              {t('home.viewAll')}
            </button>
          </div>
          {recentGames.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Clock className="w-6 h-6 text-slate-500 mx-auto" />
              <p className="text-sm text-slate-400">{t('home.noGamesYet')}</p>
              <button
                type="button"
                onClick={() => onNavigate('play-computer')}
                className="text-xs font-medium text-emerald-400 hover:underline"
              >
                {t('home.playFirstBot')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {recentGames.map((g) => (
                <div key={g.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {g.whiteName} vs {g.blackName}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {g.result} · {g.termination} · {g.timeControl} · {g.openingName || 'Chess'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenReview(g.pgn, g)}
                    className="px-3 py-1.5 rounded-lg bg-[#1A222D] hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500/60 text-xs font-medium text-slate-200 transition-colors shrink-0"
                  >
                    {t('common.review')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Achievements Preview */}
        <div className="lg:col-span-3 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-100">{t('home.achievements')}</h2>
            <span className="font-mono text-xs text-emerald-400 tabular-nums">
              {unlockedCount}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {ACHIEVEMENTS.slice(0, 4).map((ach) => {
              const unlocked = profile?.achievements?.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={`p-2.5 rounded-lg border ${
                    unlocked
                      ? 'bg-emerald-950/25 border-emerald-800/50'
                      : 'bg-[#0F1319] border-slate-800/80 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100 truncate">{ach.title}</p>
                    <span className="text-[11px] font-mono text-slate-400">
                      {ach.points} {t('app.pts')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{ach.requirementHint}</p>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('social')}
            className="w-full py-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] text-xs font-medium text-slate-200 transition-colors"
          >
            {t('home.viewAllAchievements')}
          </button>
        </div>
      </div>
    </div>
  );
}
