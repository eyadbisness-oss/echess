import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Crown,
  Flame,
  HelpCircle,
  Lightbulb,
  Play,
  Redo2,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { ChessBoard, type BoardArrow } from '../components/ChessBoard';
import {
  BUILT_IN_PUZZLES,
  getDailyPuzzleForDate,
  getLocalDateKey,
  getPreviousDateKey,
  getRecentDateKeys,
  type ChessPuzzle,
} from '../data/puzzlesAndLessons';
import { computePlayStreakUpdate, evaluateProfileAchievements } from '../data/achievements';
import type { UserProfile } from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';

export function PuzzlesView() {
  const { firebaseUser, profile, isOwner, ownerCheatMode, signInWithGoogle } = useAuth();
  const { t } = useLocale();
  const cheatActive = isOwner && ownerCheatMode;
  const [customPuzzles, setCustomPuzzles] = useState<ChessPuzzle[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string>('All');
  const [puzzleIndex, setPuzzleIndex] = useState(0);

  const todayKey = getLocalDateKey();
  const yesterdayKey = getPreviousDateKey(todayKey);
  const recentDays = useMemo(() => getRecentDateKeys(7), [todayKey]);

  const todaysDailyPuzzle = useMemo(
    () => ({ ...getDailyPuzzleForDate(BUILT_IN_PUZZLES, todayKey), isDaily: true }),
    [todayKey]
  );

  const [chess, setChess] = useState(() => new Chess(todaysDailyPuzzle.fen));
  const [fen, setFen] = useState(todaysDailyPuzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [hintTier, setHintTier] = useState<0 | 1 | 2 | 3>(0);
  const [status, setStatus] = useState<'solving' | 'solved' | 'wrong'>('solving');
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [failedOnCurrent, setFailedOnCurrent] = useState(false);
  const [dailyStreakNotice, setDailyStreakNotice] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, 'customPuzzles'), where('published', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChessPuzzle[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Custom Puzzle'),
            fen: String(data.fen),
            moves: Array.isArray(data.moves) ? data.moves : [],
            rating: Number(data.rating || 1200),
            theme: String(data.theme || 'Tactics'),
            hint: 'Look for forcing checks, captures, and threats.',
            explanation: `Owner-curated puzzle (${data.theme || 'Tactics'}).`,
          };
        });
        setCustomPuzzles(list);
      },
      () => {}
    );
    return () => unsub();
  }, [firebaseUser]);

  // Put today's Daily Puzzle first in the puzzle deck without duplicates
  const allPuzzles = useMemo(() => {
    const restBuiltIn = BUILT_IN_PUZZLES.filter((p) => p.id !== todaysDailyPuzzle.id);
    return [todaysDailyPuzzle, ...restBuiltIn, ...customPuzzles];
  }, [todaysDailyPuzzle, customPuzzles]);

  const themes = useMemo(
    () => ['All', ...Array.from(new Set(allPuzzles.map((p) => p.theme)))],
    [allPuzzles]
  );

  const filteredPuzzles = useMemo(
    () => (selectedTheme === 'All' ? allPuzzles : allPuzzles.filter((p) => p.theme === selectedTheme)),
    [allPuzzles, selectedTheme]
  );

  const activePuzzle = filteredPuzzles[puzzleIndex % filteredPuzzles.length] || todaysDailyPuzzle;
  const isCurrentDaily = activePuzzle.id === todaysDailyPuzzle.id || Boolean(activePuzzle.isDaily);

  // Derived Daily Streak metrics from Firestore profile
  const lastDailyDate = profile?.lastDailyPuzzleDate || '';
  const completedDailyToday = lastDailyDate === todayKey;
  const dailyStreakAlive = lastDailyDate === todayKey || lastDailyDate === yesterdayKey;
  const activeDailyStreak = dailyStreakAlive ? profile?.dailyStreak || 0 : 0;
  const bestDailyStreak = Math.max(profile?.bestDailyStreak || 0, activeDailyStreak);
  const dailyPuzzlesCompleted = profile?.dailyPuzzlesCompleted || 0;

  // Map rolling 7-day strip statuses
  const dayStreakSet = useMemo(() => {
    const completedKeys = new Set<string>();
    if (!dailyStreakAlive || activeDailyStreak <= 0) return completedKeys;
    const endIdx = completedDailyToday ? recentDays.length - 1 : recentDays.length - 2;
    const span = Math.min(activeDailyStreak, endIdx + 1);
    for (let i = 0; i < span; i++) {
      const idx = endIdx - i;
      if (idx >= 0 && recentDays[idx]) {
        completedKeys.add(recentDays[idx].key);
      }
    }
    return completedKeys;
  }, [dailyStreakAlive, activeDailyStreak, completedDailyToday, recentDays]);

  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePuzzleIdRef = useRef<string>(activePuzzle.id);
  activePuzzleIdRef.current = activePuzzle.id;

  const clearReplyTimer = () => {
    if (replyTimerRef.current) {
      clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
  };

  const loadPuzzle = (p: ChessPuzzle) => {
    clearReplyTimer();
    try {
      const c = new Chess(p.fen);
      setChess(c);
      setFen(c.fen());
      setStepIndex(0);
      setHintTier(0);
      setStatus('solving');
      setLastMove(null);
      setRedoStack([]);
      setFailedOnCurrent(false);
      setDailyStreakNotice(null);
    } catch {
      // ignore invalid fen
    }
  };

  useEffect(() => {
    loadPuzzle(activePuzzle);
    return () => clearReplyTimer();
  }, [activePuzzle.id]);

  const jumpToDailyPuzzle = () => {
    setSelectedTheme('All');
    setPuzzleIndex(0);
    loadPuzzle(todaysDailyPuzzle);
  };

  const sideToMove = useMemo(() => new Chess(activePuzzle.fen).turn(), [activePuzzle.fen]);

  const persistPuzzleProgress = async (
    event: 'failed' | 'completed',
    solvedCleanly: boolean,
    completedDaily: boolean
  ) => {
    if (!firebaseUser || !profile) return;

    const currentRating = profile.ratings?.puzzle ?? 1200;
    const updatePayload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    let nextRating = currentRating;
    let nextPuzzleStreak = profile.puzzleStreak || 0;
    let nextBestPuzzleStreak = profile.bestPuzzleStreak || 0;
    let nextPuzzlesSolved = profile.puzzlesSolved || 0;
    let nextDailyStreak = activeDailyStreak;
    let nextBestDailyStreak = bestDailyStreak;
    let nextLastDailyDate = lastDailyDate;
    let nextDailyCompletedCount = dailyPuzzlesCompleted;
    const playStreakPatch = computePlayStreakUpdate(profile, todayKey);
    updatePayload.playStreakDays = playStreakPatch.playStreakDays;
    updatePayload.bestPlayStreakDays = playStreakPatch.bestPlayStreakDays;
    updatePayload.lastPlayDate = playStreakPatch.lastPlayDate;

    if (event === 'failed') {
      nextRating = Math.max(400, currentRating - 12);
      nextPuzzleStreak = 0;
      updatePayload.ratings = { ...profile.ratings, puzzle: nextRating };
      updatePayload.puzzleStreak = 0;
    } else {
      nextPuzzlesSolved = (profile.puzzlesSolved || 0) + 1;
      updatePayload.puzzlesSolved = nextPuzzlesSolved;

      if (solvedCleanly) {
        const delta = Math.max(8, Math.round((activePuzzle.rating - currentRating) * 0.06 + 14));
        nextRating = Math.max(400, currentRating + delta);
        nextPuzzleStreak = (profile.puzzleStreak || 0) + 1;
        nextBestPuzzleStreak = Math.max(profile.bestPuzzleStreak || 0, nextPuzzleStreak);
        updatePayload.ratings = { ...profile.ratings, puzzle: nextRating };
        updatePayload.puzzleStreak = nextPuzzleStreak;
        updatePayload.bestPuzzleStreak = nextBestPuzzleStreak;
      }

      if (completedDaily) {
        if (!completedDailyToday) {
          nextDailyStreak = lastDailyDate === yesterdayKey ? (profile.dailyStreak || 0) + 1 : 1;
          nextBestDailyStreak = Math.max(profile.bestDailyStreak || 0, nextDailyStreak);
          nextLastDailyDate = todayKey;
          nextDailyCompletedCount = dailyPuzzlesCompleted + 1;

          updatePayload.dailyStreak = nextDailyStreak;
          updatePayload.bestDailyStreak = nextBestDailyStreak;
          updatePayload.lastDailyPuzzleDate = nextLastDailyDate;
          updatePayload.dailyPuzzlesCompleted = nextDailyCompletedCount;

          setDailyStreakNotice(
            nextDailyStreak > 1
              ? t('puzzles.streakExtended', { count: nextDailyStreak })
              : t('puzzles.streakStarted')
          );
        } else {
          setDailyStreakNotice(
            t('puzzles.streakAlreadyRecorded', { date: todayKey, count: activeDailyStreak })
          );
        }
      }
    }

    const simulatedProfile: UserProfile = {
      ...profile,
      ratings: { ...profile.ratings, puzzle: nextRating },
      puzzleStreak: nextPuzzleStreak,
      bestPuzzleStreak: nextBestPuzzleStreak,
      puzzlesSolved: nextPuzzlesSolved,
      dailyStreak: nextDailyStreak,
      bestDailyStreak: nextBestDailyStreak,
      lastDailyPuzzleDate: nextLastDailyDate,
      dailyPuzzlesCompleted: nextDailyCompletedCount,
      ...playStreakPatch,
    };

    const evaluatedAchievements = evaluateProfileAchievements(simulatedProfile).slice(0, 60);
    if (evaluatedAchievements.length > (profile.achievements?.length || 0)) {
      updatePayload.achievements = evaluatedAchievements;
    }

    setSavingProgress(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), updatePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    } finally {
      setSavingProgress(false);
    }
  };

  const handleMove = (mv: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    if (status === 'solved') return false;
    const expectedUci = activePuzzle.moves[stepIndex];
    if (!expectedUci) return false;
    const playedUci = `${mv.from}${mv.to}${mv.promotion || ''}`;

    const probe = new Chess(chess.fen());
    const legal = probe.move(mv);
    if (!legal) return false;

    if (playedUci === expectedUci || `${mv.from}${mv.to}` === expectedUci) {
      const playedMv = chess.move(mv);
      setRedoStack([]);
      setLastMove({ from: mv.from, to: mv.to });
      setFen(chess.fen());

      const nextStep = stepIndex + 1;
      if (nextStep >= activePuzzle.moves.length) {
        setStatus('solved');
        if (chess.isCheckmate()) {
          soundEngine.playCheckmate();
        } else {
          soundEngine.playForChessMove(chess, playedMv);
          setTimeout(() => soundEngine.playSuccess(), 140);
        }
        void persistPuzzleProgress('completed', !failedOnCurrent, isCurrentDaily);
      } else {
        soundEngine.playForChessMove(chess, playedMv);
        setStepIndex(nextStep);
        setStatus('solving');
        const puzzleIdAtMove = activePuzzle.id;
        clearReplyTimer();
        replyTimerRef.current = setTimeout(() => {
          replyTimerRef.current = null;
          if (activePuzzleIdRef.current !== puzzleIdAtMove) return;
          const replyUci = activePuzzle.moves[nextStep];
          if (!replyUci || replyUci.length < 4) return;
          try {
            const replyMv = chess.move({
              from: replyUci.slice(0, 2),
              to: replyUci.slice(2, 4),
              promotion: replyUci.length > 4 ? (replyUci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
            });
            if (replyMv) {
              setLastMove({ from: replyMv.from, to: replyMv.to });
              setFen(chess.fen());
              setStepIndex(nextStep + 1);
              soundEngine.playForChessMove(chess, replyMv);
            }
          } catch {
            // ignore stale or invalid reply move
          }
        }, 420);
      }
      return true;
    } else {
      soundEngine.playError();
      setStatus('wrong');
      if (!failedOnCurrent) {
        setFailedOnCurrent(true);
        void persistPuzzleProgress('failed', false, isCurrentDaily);
      }
      return false;
    }
  };

  const handleCheatUndo = () => {
    if (!cheatActive || chess.history().length === 0) return;
    const undone: string[] = [];
    // If at player turn after opponent reply, step back 2 plies; otherwise step back 1 ply
    const mv1 = chess.undo();
    if (mv1) undone.unshift(mv1.san);
    if (chess.turn() !== sideToMove && chess.history().length > 0) {
      const mv2 = chess.undo();
      if (mv2) undone.unshift(mv2.san);
    }
    if (undone.length > 0) {
      setRedoStack((prev) => [...undone, ...prev]);
      const hist = chess.history({ verbose: true });
      const top = hist[hist.length - 1];
      setLastMove(top ? { from: top.from, to: top.to } : null);
      setFen(chess.fen());
      setStepIndex(hist.length);
      setStatus('solving');
      soundEngine.playMove();
    }
  };

  const handleCheatRedo = () => {
    if (!cheatActive || redoStack.length === 0) return;
    const nextStack = [...redoStack];
    const san1 = nextStack.shift();
    if (!san1) return;
    const mv1 = chess.move(san1);
    if (mv1 && chess.turn() !== sideToMove && nextStack.length > 0) {
      const san2 = nextStack.shift();
      if (san2) chess.move(san2);
    }
    setRedoStack(nextStack);
    const hist = chess.history({ verbose: true });
    const top = hist[hist.length - 1];
    setLastMove(top ? { from: top.from, to: top.to } : null);
    setFen(chess.fen());
    setStepIndex(hist.length);
    if (hist.length >= activePuzzle.moves.length) {
      setStatus('solved');
      if (chess.isCheckmate()) soundEngine.playCheckmate();
      else soundEngine.playSuccess();
    } else {
      setStatus('solving');
      soundEngine.playForChessMove(chess, top);
    }
  };

  const handleCheatNextMove = () => {
    if (!cheatActive || status === 'solved') return;
    const uci = activePuzzle.moves[stepIndex];
    if (!uci || uci.length < 4) return;
    handleMove({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    });
  };

  const handleCheatInstantSolve = () => {
    if (!cheatActive || status === 'solved') return;
    let cursor = stepIndex;
    while (cursor < activePuzzle.moves.length) {
      const uci = activePuzzle.moves[cursor];
      if (!uci || uci.length < 4) break;
      const mv = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!mv) break;
      setLastMove({ from: mv.from, to: mv.to });
      cursor++;
    }
    setRedoStack([]);
    setFen(chess.fen());
    setStepIndex(cursor);
    setStatus('solved');
    if (chess.isCheckmate()) soundEngine.playCheckmate();
    else soundEngine.playSuccess();
    void persistPuzzleProgress('completed', !failedOnCurrent, isCurrentDaily);
  };

  const expectedMove = activePuzzle.moves[stepIndex] || '';
  const hintHighlights = hintTier >= 2 && expectedMove ? [expectedMove.slice(0, 2)] : [];
  const hintArrows: BoardArrow[] =
    (hintTier >= 3 || (cheatActive && status !== 'solved')) && expectedMove.length >= 4
      ? [{ from: expectedMove.slice(0, 2), to: expectedMove.slice(2, 4), color: '#10B981' }]
      : [];

  return (
    <div className="max-w-[1260px] mx-auto space-y-5">
      {/* Daily Streak Tracker Banner */}
      <section
        aria-label="Daily Streak Tracker"
        className="bg-[#12171E] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
      >
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              completedDailyToday
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                : activeDailyStreak > 0
                  ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                  : 'bg-[#0B0E11] border-slate-800 text-slate-400'
            }`}
          >
            <Flame className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-100">
                {t('puzzles.streakTracker')}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  completedDailyToday
                    ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-300'
                    : 'bg-amber-950/50 border border-amber-700/50 text-amber-300'
                }`}
              >
                {completedDailyToday ? t('puzzles.completedToday') : t('puzzles.dailyReady')}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {!firebaseUser
                ? t('puzzles.signInStreak')
                : completedDailyToday
                  ? t('puzzles.completedTodayMsg', { date: todayKey })
                  : activeDailyStreak > 0
                    ? t('puzzles.extendStreakMsg', { current: activeDailyStreak, next: activeDailyStreak + 1 })
                    : t('puzzles.startStreakMsg', { title: todaysDailyPuzzle.title })}
            </p>
          </div>
        </div>

        {/* 7-Day Calendar Strip + Metrics */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-1.5" aria-label={t('puzzles.streakTracker')}>
            {recentDays.map((day) => {
              const isToday = day.key === todayKey;
              const isCompleted = dayStreakSet.has(day.key);
              return (
                <div
                  key={day.key}
                  title={`${day.shortDay} (${day.key})`}
                  className={`w-9 py-1.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
                    isCompleted
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                      : isToday
                        ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-300'
                        : 'bg-[#0B0E11] border-slate-800/90 text-slate-500'
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase leading-none">{day.shortDay}</span>
                  <div className="h-4 flex items-center justify-center">
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                    ) : isToday ? (
                      <Calendar className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <span className="text-[10px] font-mono tabular-nums">{day.dayNum}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-s border-slate-800 pt-3 sm:pt-0 sm:ps-5">
            <div>
              <p className="text-[11px] text-slate-400">{t('puzzles.dailyStreak')}</p>
              <p className="font-mono text-lg font-bold text-amber-400 tabular-nums leading-tight">
                {activeDailyStreak} <span className="text-xs font-normal text-slate-400">{t('puzzles.daysUnit')}</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">{t('puzzles.bestDaily')}</p>
              <p className="font-mono text-lg font-bold text-slate-100 tabular-nums leading-tight">
                {bestDailyStreak}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">{t('puzzles.dailySolved')}</p>
              <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums leading-tight">
                {dailyPuzzlesCompleted}
              </p>
            </div>
            {!firebaseUser ? (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="ms-auto px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                {t('app.signIn')}
              </button>
            ) : (
              activePuzzle.id !== todaysDailyPuzzle.id && (
                <button
                  type="button"
                  onClick={jumpToDailyPuzzle}
                  className="ms-auto px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5"
                >
                  <Flame className="w-3.5 h-3.5" />
                  {t('puzzles.todaysDaily')}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col items-center space-y-3">
          <div className="w-full max-w-[540px] flex items-center justify-between bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                {isCurrentDaily && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-semibold uppercase tracking-wide">
                    {t('home.dailyPuzzle')}
                  </span>
                )}
                <span>{activePuzzle.title}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {sideToMove === 'w' ? t('puzzles.whiteToMove') : t('puzzles.blackToMove')} · {t('puzzles.theme')}: {activePuzzle.theme} · {t('puzzles.rating')}{' '}
                <span className="font-mono text-emerald-400 tabular-nums">{activePuzzle.rating}</span>
              </p>
            </div>
            <div className="text-end">
              <p className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                {profile?.ratings?.puzzle ?? 1200}
              </p>
              <p className="text-[11px] text-amber-400 inline-flex items-center gap-1 tabular-nums">
                <Trophy className="w-3 h-3" /> {t('puzzles.tacticsStreak')} {profile?.puzzleStreak ?? 0}
              </p>
            </div>
          </div>

          <ChessBoard
            fen={fen}
            orientation={sideToMove}
            interactive={status !== 'solved'}
            allowedColor={sideToMove}
            boardThemeId={profile?.boardTheme}
            pieceStyle={profile?.pieceStyle}
            showCoordinates={profile?.showCoordinates ?? true}
            autoQueen={profile?.autoQueen ?? false}
            lastMove={lastMove}
            highlightedSquares={hintHighlights}
            arrows={hintArrows}
            onMove={handleMove}
          />
        </div>

        <div className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-bold text-slate-100">{t('puzzles.title')}</h1>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {(puzzleIndex % filteredPuzzles.length) + 1} / {filteredPuzzles.length}
            </span>
          </div>

          {/* Theme Filters */}
          <div className="flex flex-wrap gap-1.5">
            {themes.map((themeItem) => (
              <button
                key={themeItem}
                type="button"
                onClick={() => {
                  setSelectedTheme(themeItem);
                  setPuzzleIndex(0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedTheme === themeItem
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#0B0E11] border border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {themeItem === 'All' ? t('common.all') : themeItem}
              </button>
            ))}
          </div>

          {/* Status Banner */}
          {status === 'solved' && (
            <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('puzzles.solved')}
                </div>
                {savingProgress && (
                  <span className="text-[11px] text-emerald-400/80">{t('puzzles.savingProfile')}</span>
                )}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{activePuzzle.explanation}</p>
              {dailyStreakNotice && (
                <div className="mt-2 pt-2 border-t border-emerald-800/50 flex items-center gap-2 text-xs font-medium text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{dailyStreakNotice}</span>
                </div>
              )}
            </div>
          )}

          {status === 'wrong' && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 text-xs text-rose-200">
              {t('puzzles.wrongMove')}
            </div>
          )}

          {hintTier >= 1 && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> {t('puzzles.hintTier', { tier: hintTier })}
              </p>
              <p className="text-xs text-slate-200">{activePuzzle.hint}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={status === 'solved' || hintTier >= 3}
              onClick={() => setHintTier((tier) => Math.min(3, tier + 1) as 0 | 1 | 2 | 3)}
              className="flex-1 py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              {hintTier === 0 ? t('puzzles.hint') : hintTier === 1 ? t('puzzles.highlightPiece') : t('puzzles.showSolution')}
            </button>
            <button
              type="button"
              onClick={() => loadPuzzle(activePuzzle)}
              className="py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              {t('common.retry')}
            </button>
            <button
              type="button"
              onClick={() => setPuzzleIndex((i) => i + 1)}
              className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              {t('puzzles.nextPuzzle')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {cheatActive && (
            <div className="bg-amber-950/30 border border-amber-600/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('common.ownerCheatActive')}
                </span>
                <span className="font-mono text-[11px] text-amber-400">{t('common.ownerOnly')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleCheatUndo}
                  disabled={chess.history().length === 0}
                  className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                  {t('common.undo')}
                </button>
                <button
                  type="button"
                  onClick={handleCheatRedo}
                  disabled={redoStack.length === 0}
                  className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1"
                >
                  <Redo2 className="w-3.5 h-3.5 text-amber-400" />
                  {t('common.redo')}
                </button>
                <button
                  type="button"
                  onClick={handleCheatNextMove}
                  disabled={status === 'solved'}
                  className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-emerald-300 inline-flex items-center justify-center gap-1"
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('common.bestMove')}
                </button>
                <button
                  type="button"
                  onClick={handleCheatInstantSolve}
                  disabled={status === 'solved'}
                  className="col-span-3 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  {t('puzzles.instantSolve')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
