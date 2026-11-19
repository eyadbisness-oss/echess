import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { BOT_PROFILES, type BotDifficulty, stockfishService } from '../engine/stockfishService';
import { detectOpeningFromMoves } from '../data/openings';
import { computePlayStreakUpdate, evaluateProfileAchievements } from '../data/achievements';
import { soundEngine } from '../utils/sound';
import type { EngineEval } from '../shared/chessTypes';

interface ComputerGameContextValue {
  difficulty: BotDifficulty;
  setDifficulty: (d: BotDifficulty) => void;
  playerSide: 'w' | 'b';
  setPlayerSide: (s: 'w' | 'b') => void;
  practiceMode: boolean;
  setPracticeMode: (v: boolean) => void;
  timeControlMin: number;
  setTimeControlMin: (m: number) => void;
  gameStarted: boolean;
  fen: string;
  pgn: string;
  history: string[];
  turn: 'w' | 'b';
  canUndo: boolean;
  canRedo: boolean;
  lastMove: { from: string; to: string } | null;
  botThinking: boolean;
  gameOverInfo: { result: '1-0' | '0-1' | '1/2-1/2'; termination: string } | null;
  liveEval: EngineEval | null;
  whiteMs: number;
  blackMs: number;
  startNewGame: (sideChoice?: 'w' | 'b' | 'random') => void;
  handlePlayerMove: (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean;
  handleUndo: (singlePly?: boolean) => void;
  handleRedo: () => void;
  handleOwnerAutoMove: () => Promise<void>;
  handleOwnerInstantWin: () => void;
  handleOwnerAddTime: () => void;
  resignGame: () => void;
}

const ComputerGameContext = createContext<ComputerGameContextValue | null>(null);

export function ComputerGameProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, isOwner, ownerCheatMode, unlockAchievement } = useAuth();

  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
  const [playerSide, setPlayerSide] = useState<'w' | 'b'>('w');
  const [practiceMode, setPracticeMode] = useState(false);
  const [timeControlMin, setTimeControlMin] = useState<number>(0);

  const [gameStarted, setGameStarted] = useState(false);
  const chessRef = useRef<Chess>(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [pgn, setPgn] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [gameOverInfo, setGameOverInfo] = useState<{
    result: '1-0' | '0-1' | '1/2-1/2';
    termination: string;
  } | null>(null);
  const [liveEval, setLiveEval] = useState<EngineEval | null>(null);
  const [whiteMs, setWhiteMs] = useState(600_000);
  const [blackMs, setBlackMs] = useState(600_000);

  const botRequestLock = useRef(false);
  const timedOutRef = useRef(false);
  const gameSessionRef = useRef(0);
  const bot = BOT_PROFILES[difficulty];

  const syncFromChess = useCallback(() => {
    const c = chessRef.current;
    setFen(c.fen());
    setPgn(c.pgn());
    setHistory(c.history());
    const verbose = c.history({ verbose: true });
    const top = verbose[verbose.length - 1];
    setLastMove(top ? { from: top.from, to: top.to } : null);
  }, []);

  const finishGame = useCallback(
    async (result: '1-0' | '0-1' | '1/2-1/2', termination: string, instance: Chess) => {
      gameSessionRef.current += 1;
      botRequestLock.current = false;
      setBotThinking(false);
      setGameOverInfo({ result, termination });
      if (termination !== 'checkmate') {
        soundEngine.playGameEnd();
      }

      if (!firebaseUser || !profile) return;
      const playerWon =
        (result === '1-0' && playerSide === 'w') || (result === '0-1' && playerSide === 'b');
      const opening = detectOpeningFromMoves(instance.history());

      try {
        await addDoc(collection(db, 'games'), {
          whiteId: playerSide === 'w' ? firebaseUser.uid : `bot_${difficulty}`,
          blackId: playerSide === 'b' ? firebaseUser.uid : `bot_${difficulty}`,
          whiteName: playerSide === 'w' ? profile.displayName : bot.name,
          blackName: playerSide === 'b' ? profile.displayName : bot.name,
          whiteRating: playerSide === 'w' ? profile.ratings.rapid : bot.rating,
          blackRating: playerSide === 'b' ? profile.ratings.rapid : bot.rating,
          timeControl: timeControlMin > 0 ? `${timeControlMin}+0` : 'Unlimited',
          category: 'bot',
          result,
          termination,
          winnerId:
            result === '1/2-1/2'
              ? ''
              : playerWon
              ? firebaseUser.uid
              : `bot_${difficulty}`,
          pgn: instance.pgn(),
          finalFen: instance.fen(),
          openingName: opening.name,
          eco: opening.eco,
          moveCount: instance.history().length,
          rated: false,
          isTestGame: false,
          createdAt: serverTimestamp(),
          endedAt: serverTimestamp(),
        });

        const nextGamesPlayed = (profile.gamesPlayed || 0) + 1;
        const nextWins = (profile.wins || 0) + (playerWon ? 1 : 0);
        const nextLosses = (profile.losses || 0) + (!playerWon && result !== '1/2-1/2' ? 1 : 0);
        const nextDraws = (profile.draws || 0) + (result === '1/2-1/2' ? 1 : 0);
        const playStreakPatch = computePlayStreakUpdate(profile);

        const baseEval = evaluateProfileAchievements({
          ...profile,
          gamesPlayed: nextGamesPlayed,
          wins: nextWins,
          losses: nextLosses,
          draws: nextDraws,
          ...playStreakPatch,
        });
        const badgeSet = new Set(baseEval);
        if (playerWon && ['hard', 'expert', 'master', 'maximum'].includes(difficulty)) {
          badgeSet.add('bot-slayer-hard');
        }
        const finalBadges = Array.from(badgeSet).slice(0, 60);

        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          gamesPlayed: nextGamesPlayed,
          wins: nextWins,
          losses: nextLosses,
          draws: nextDraws,
          ...playStreakPatch,
          ...(finalBadges.length > (profile.achievements?.length || 0)
            ? { achievements: finalBadges }
            : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Could not save bot game:', err);
      }
    },
    [firebaseUser, profile, playerSide, difficulty, bot.name, bot.rating, timeControlMin]
  );

  const checkAndHandleEnd = useCallback(
    (c: Chess, moverColor: 'w' | 'b') => {
      if (c.isCheckmate()) {
        void finishGame(moverColor === 'w' ? '1-0' : '0-1', 'checkmate', c);
        return true;
      }
      if (c.isStalemate()) {
        void finishGame('1/2-1/2', 'stalemate', c);
        return true;
      }
      if (c.isThreefoldRepetition()) {
        void finishGame('1/2-1/2', 'repetition', c);
        return true;
      }
      if (c.isInsufficientMaterial()) {
        void finishGame('1/2-1/2', 'insufficient', c);
        return true;
      }
      if (c.isDraw()) {
        void finishGame('1/2-1/2', 'fifty-move', c);
        return true;
      }
      return false;
    },
    [finishGame]
  );

  const finishGameRef = useRef(finishGame);
  finishGameRef.current = finishGame;
  const checkAndHandleEndRef = useRef(checkAndHandleEnd);
  checkAndHandleEndRef.current = checkAndHandleEnd;

  const startNewGame = useCallback(
    (sideChoice?: 'w' | 'b' | 'random') => {
      gameSessionRef.current += 1;
      const resolvedSide: 'w' | 'b' =
        sideChoice === 'random'
          ? Math.random() < 0.5
            ? 'w'
            : 'b'
          : sideChoice || playerSide;
      setPlayerSide(resolvedSide);
      const fresh = new Chess();
      chessRef.current = fresh;
      setFen(fresh.fen());
      setPgn('');
      setHistory([]);
      setRedoStack([]);
      setLastMove(null);
      setGameOverInfo(null);
      setLiveEval(null);
      setBotThinking(false);
      botRequestLock.current = false;
      timedOutRef.current = false;
      const ms = timeControlMin > 0 ? timeControlMin * 60_000 : 600_000;
      setWhiteMs(ms);
      setBlackMs(ms);
      setGameStarted(true);
      soundEngine.playCastle();
    },
    [playerSide, timeControlMin]
  );

  // Timed clock loop (100ms precision for smooth <10s tenths countdown)
  useEffect(() => {
    if (!gameStarted || gameOverInfo || timeControlMin === 0) return;
    const interval = setInterval(() => {
      if (timedOutRef.current) return;
      const turn = chessRef.current.turn();
      if (turn === 'w') {
        setWhiteMs((prev) => {
          const next = Math.max(0, prev - 100);
          if (next === 0 && !timedOutRef.current) {
            timedOutRef.current = true;
            setTimeout(() => void finishGameRef.current('0-1', 'timeout', chessRef.current), 0);
          }
          return next;
        });
      } else {
        setBlackMs((prev) => {
          const next = Math.max(0, prev - 100);
          if (next === 0 && !timedOutRef.current) {
            timedOutRef.current = true;
            setTimeout(() => void finishGameRef.current('1-0', 'timeout', chessRef.current), 0);
          }
          return next;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameStarted, gameOverInfo, timeControlMin, fen]);

  // Live Stockfish eval when Practice Mode OR Owner Cheat Mode is active (on player's turn)
  useEffect(() => {
    if (!gameStarted || gameOverInfo) return;
    if (!practiceMode && !(isOwner && ownerCheatMode)) return;
    if (chessRef.current.turn() !== playerSide) return;

    let active = true;
    void stockfishService
      .analyzePosition(fen, {
        depth: 12,
        multiPv: 1,
        movetime: 2500,
        onUpdate: (lines) => {
          if (active && lines[0]) setLiveEval(lines[0]);
        },
      })
      .then((finalLines) => {
        if (active && finalLines[0]) {
          setLiveEval(finalLines[0]);
        }
      })
      .catch(() => {
        // ignore cancelled eval errors
      });

    return () => {
      active = false;
      stockfishService.stopSearch();
    };
  }, [fen, gameStarted, practiceMode, isOwner, ownerCheatMode, gameOverInfo, playerSide]);

  // Bot turn trigger
  useEffect(() => {
    const c = chessRef.current;
    if (!gameStarted || gameOverInfo) return;
    if (c.turn() === playerSide) return;
    if (c.isGameOver()) {
      checkAndHandleEndRef.current(c, playerSide);
      return;
    }

    let cancelled = false;
    const sessionAtStart = gameSessionRef.current;
    const fenAtStart = c.fen();

    botRequestLock.current = true;
    setBotThinking(true);

    const timer = setTimeout(async () => {
      if (cancelled || sessionAtStart !== gameSessionRef.current) return;
      const currentChess = chessRef.current;
      if (currentChess.fen() !== fenAtStart || currentChess.turn() === playerSide) {
        botRequestLock.current = false;
        setBotThinking(false);
        return;
      }
      if (currentChess.isGameOver()) {
        botRequestLock.current = false;
        setBotThinking(false);
        checkAndHandleEndRef.current(currentChess, playerSide);
        return;
      }

      try {
        let bestUci: string | null = null;
        const botWatchdogMs = BOT_PROFILES[difficulty].movetime + 9000;
        let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
        try {
          bestUci = await Promise.race<string | null>([
            stockfishService.getBestBotMove(fenAtStart, difficulty),
            new Promise<null>((resolve) => {
              watchdogTimer = setTimeout(() => {
                void stockfishService.restartEngine('bot turn outer watchdog');
                resolve(null);
              }, botWatchdogMs);
            }),
          ]);
        } catch (err) {
          console.error('Stockfish bot move failed, falling back to legal move:', err);
        } finally {
          if (watchdogTimer) clearTimeout(watchdogTimer);
        }

        if (cancelled || sessionAtStart !== gameSessionRef.current) return;
        const latestChess = chessRef.current;
        if (latestChess.fen() !== fenAtStart || latestChess.turn() === playerSide) return;

        let moved = null;
        if (bestUci && bestUci.length >= 4) {
          try {
            moved = latestChess.move({
              from: bestUci.slice(0, 2),
              to: bestUci.slice(2, 4),
              promotion: bestUci.length > 4 ? (bestUci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
            });
          } catch {
            moved = null;
          }
        }

        // Legal-move fallback ensures the bot can never freeze the match
        if (!moved) {
          const legalMoves = latestChess.moves({ verbose: true });
          if (legalMoves.length === 0) {
            checkAndHandleEndRef.current(latestChess, playerSide);
            return;
          }
          const fallback = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          moved = latestChess.move(fallback);
        }

        if (moved) {
          syncFromChess();
          soundEngine.playForChessMove(latestChess, moved);
          checkAndHandleEndRef.current(latestChess, moved.color);
        }
      } finally {
        if (!cancelled && sessionAtStart === gameSessionRef.current) {
          botRequestLock.current = false;
          setBotThinking(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (sessionAtStart === gameSessionRef.current) {
        botRequestLock.current = false;
        setBotThinking(false);
      }
    };
  }, [fen, gameStarted, gameOverInfo, playerSide, difficulty, syncFromChess]);

  const handlePlayerMove = useCallback(
    (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      const c = chessRef.current;
      if (!gameStarted || gameOverInfo || c.turn() !== playerSide || botThinking) return false;
      try {
        const mv = c.move(move);
        if (!mv) return false;
        setRedoStack([]);
        syncFromChess();
        soundEngine.playForChessMove(c, mv);
        checkAndHandleEnd(c, mv.color);
        return true;
      } catch {
        return false;
      }
    },
    [gameStarted, gameOverInfo, playerSide, botThinking, syncFromChess, checkAndHandleEnd]
  );

  const handleUndo = useCallback(
    (singlePly = false) => {
      if ((!practiceMode && !isOwner) || botThinking || gameOverInfo) return;
      const c = chessRef.current;
      const undone: string[] = [];
      const mv1 = c.undo();
      if (mv1) undone.unshift(mv1.san);
      if (!singlePly && c.turn() !== playerSide) {
        const mv2 = c.undo();
        if (mv2) undone.unshift(mv2.san);
      }
      if (undone.length > 0) {
        gameSessionRef.current += 1;
        setRedoStack((prev) => [...undone, ...prev]);
        syncFromChess();
      }
    },
    [isOwner, practiceMode, botThinking, gameOverInfo, playerSide, syncFromChess]
  );

  const handleRedo = useCallback(() => {
    if (!isOwner || botThinking || gameOverInfo) return;
    if (redoStack.length === 0) return;
    const c = chessRef.current;
    const nextStack = [...redoStack];
    const san1 = nextStack.shift();
    if (san1) {
      const mv1 = c.move(san1);
      if (mv1 && c.turn() !== playerSide && nextStack.length > 0) {
        const san2 = nextStack.shift();
        if (san2) c.move(san2);
      }
      gameSessionRef.current += 1;
      setRedoStack(nextStack);
      syncFromChess();
      const last = c.history({ verbose: true }).pop();
      soundEngine.playForChessMove(c, last);
      if (last) checkAndHandleEnd(c, last.color);
    }
  }, [isOwner, botThinking, gameOverInfo, redoStack, playerSide, syncFromChess, checkAndHandleEnd]);

  const handleOwnerAutoMove = useCallback(async () => {
    if (!isOwner || !gameStarted || gameOverInfo || botThinking) return;
    const c = chessRef.current;
    if (c.turn() !== playerSide) return;
    const sessionAtStart = gameSessionRef.current;
    const fenAtStart = c.fen();
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const bestUci = await Promise.race<string | null>([
        stockfishService.getBestBotMove(fenAtStart, 'maximum'),
        new Promise<null>((resolve) => {
          watchdogTimer = setTimeout(() => {
            void stockfishService.restartEngine('owner auto-move watchdog');
            resolve(null);
          }, 9500);
        }),
      ]);
      if (sessionAtStart !== gameSessionRef.current) return;
      const latestChess = chessRef.current;
      if (latestChess.fen() !== fenAtStart || latestChess.turn() !== playerSide) return;
      if (bestUci && bestUci.length >= 4) {
        const mv = latestChess.move({
          from: bestUci.slice(0, 2),
          to: bestUci.slice(2, 4),
          promotion: bestUci.length > 4 ? (bestUci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
        });
        if (mv) {
          setRedoStack([]);
          syncFromChess();
          soundEngine.playForChessMove(latestChess, mv);
          checkAndHandleEnd(latestChess, mv.color);
        }
      }
    } catch (err) {
      console.error('Owner auto-move failed:', err);
    } finally {
      if (watchdogTimer) clearTimeout(watchdogTimer);
    }
  }, [isOwner, gameStarted, gameOverInfo, botThinking, playerSide, syncFromChess, checkAndHandleEnd]);

  const handleOwnerInstantWin = useCallback(() => {
    if (!isOwner || !gameStarted || gameOverInfo) return;
    void finishGame(playerSide === 'w' ? '1-0' : '0-1', 'owner_override', chessRef.current);
  }, [isOwner, gameStarted, gameOverInfo, playerSide, finishGame]);

  const handleOwnerAddTime = useCallback(() => {
    if (!isOwner || !gameStarted || gameOverInfo) return;
    if (playerSide === 'w') setWhiteMs((t) => t + 60_000);
    else setBlackMs((t) => t + 60_000);
  }, [isOwner, gameStarted, gameOverInfo, playerSide]);

  const resignGame = useCallback(() => {
    if (!gameStarted || gameOverInfo) return;
    void finishGame(playerSide === 'w' ? '0-1' : '1-0', 'resignation', chessRef.current);
  }, [gameStarted, gameOverInfo, playerSide, finishGame]);

  return (
    <ComputerGameContext.Provider
      value={{
        difficulty,
        setDifficulty,
        playerSide,
        setPlayerSide,
        practiceMode,
        setPracticeMode,
        timeControlMin,
        setTimeControlMin,
        gameStarted,
        fen,
        pgn,
        history,
        turn: chessRef.current.turn(),
        canUndo: history.length > 0 && !botThinking && !gameOverInfo,
        canRedo: redoStack.length > 0 && !botThinking && !gameOverInfo,
        lastMove,
        botThinking,
        gameOverInfo,
        liveEval,
        whiteMs,
        blackMs,
        startNewGame,
        handlePlayerMove,
        handleUndo,
        handleRedo,
        handleOwnerAutoMove,
        handleOwnerInstantWin,
        handleOwnerAddTime,
        resignGame,
      }}
    >
      {children}
    </ComputerGameContext.Provider>
  );
}

export function useComputerGame() {
  const ctx = useContext(ComputerGameContext);
  if (!ctx) throw new Error('useComputerGame must be used inside ComputerGameProvider');
  return ctx;
}
