import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Check,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FlipVertical,
  Globe,
  Link2,
  Loader2,
  Pause,
  Play,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { getPublicAppOrigin } from '../utils/backendUrl';
import { ChessBoard, EvaluationBar, type BoardArrow } from '../components/ChessBoard';
import type {
  AnalyzedMove,
  ChessGameRecord,
  EngineEval,
  GameReviewReport,
  MoveClassification,
} from '../shared/chessTypes';
import {
  classifyChessMove,
  type AnalysisStrength,
  cpToWinProbWhite,
  evalToCpEquivalent,
  formatEvalDisplay,
  stockfishService,
  STRENGTH_DEPTHS,
} from '../engine/stockfishService';
import { ClassificationBadge } from '../components/ClassificationBadge';
import {
  CLASSIFICATION_ORDER,
  CLASSIFICATION_VISUALS,
  estimateGameRating,
  isKeyMomentClassification,
} from '../utils/moveClassification';
import { soundEngine } from '../utils/sound';

const SAMPLE_PGN = `[Event "eChess Showcase"]
[White "Player White"]
[Black "Player Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Nce7 11. O-O O-O 12. Rfe1 c6 13. Ne4 Qb6 14. Qa3 Bf5 15. Nc5 1-0`;

interface AnalysisViewProps {
  initialPgn?: string | null;
  initialMeta?: Partial<ChessGameRecord> | null;
  initialReviewReport?: GameReviewReport | null;
  sharedGameBanner?: { shareId: string; creatorName?: string } | null;
  sharedLoadState?: 'idle' | 'loading' | 'not-found';
}

interface PvPlaybackState {
  lineIndex: number;
  baseLastMove: { from: string; to: string } | null;
  fens: string[];
  pairs: { from: string; to: string }[];
  sanList: string[];
  step: number;
  playing: boolean;
}

function generateShareId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `g_${hex}_${Date.now().toString(36)}`;
}

function sanitizeEval(ev: EngineEval): EngineEval {
  const clean: EngineEval = {
    cp: ev.cp,
    mate: ev.mate ?? null,
    depth: ev.depth,
    bestMoveUci: ev.bestMoveUci || '',
    bestMoveSan: ev.bestMoveSan || '',
    pvSan: Array.isArray(ev.pvSan) ? ev.pvSan.slice(0, 12) : [],
    pvUci: Array.isArray(ev.pvUci) ? ev.pvUci.slice(0, 12) : [],
    multipvIndex: ev.multipvIndex ?? 1,
  };
  if (typeof ev.nodes === 'number') clean.nodes = ev.nodes;
  if (typeof ev.nps === 'number') clean.nps = ev.nps;
  return clean;
}

function sanitizeReviewReportForFirestore(report: GameReviewReport): GameReviewReport {
  return {
    moves: report.moves.slice(0, 400).map((m) => ({
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color,
      san: m.san,
      uci: m.uci,
      from: m.from,
      to: m.to,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      evalBefore: sanitizeEval(m.evalBefore),
      evalAfter: sanitizeEval(m.evalAfter),
      bestAlternativeSan: m.bestAlternativeSan,
      bestAlternativeUci: m.bestAlternativeUci,
      classification: m.classification,
      winProbBefore: m.winProbBefore,
      winProbAfter: m.winProbAfter,
      cpLoss: m.cpLoss,
      explanation: m.explanation,
    })),
    whiteAccuracy: report.whiteAccuracy,
    blackAccuracy: report.blackAccuracy,
    whiteCounts: { ...report.whiteCounts },
    blackCounts: { ...report.blackCounts },
    phases: {
      opening: { ...report.phases.opening },
      middlegame: { ...report.phases.middlegame },
      endgame: { ...report.phases.endgame },
    },
    openingName: (report.openingName || 'Custom Position').slice(0, 120),
    eco: (report.eco || 'A00').slice(0, 12),
  };
}

export function AnalysisView({
  initialPgn,
  initialMeta,
  initialReviewReport,
  sharedGameBanner,
  sharedLoadState = 'idle',
}: AnalysisViewProps) {
  const { firebaseUser, profile, unlockAchievement, signInWithGoogle } = useAuth();
  const { t } = useLocale();

  const [pgnText, setPgnText] = useState(initialPgn || SAMPLE_PGN);
  const [fenInput, setFenInput] = useState('');
  const [showImport, setShowImport] = useState(false);

  const [movesSan, setMovesSan] = useState<string[]>([]);
  const [fens, setFens] = useState<string[]>([new Chess().fen()]);
  const [movePairs, setMovePairs] = useState<{ from: string; to: string }[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');

  // Alternative exploration branch when playing moves on the board
  const [sandboxFen, setSandboxFen] = useState<string | null>(null);
  const [sandboxLastMove, setSandboxLastMove] = useState<{ from: string; to: string } | null>(null);
  const [pendingSandboxMove, setPendingSandboxMove] = useState<{
    fenBefore: string;
    fenAfter: string;
    move: {
      from: string;
      to: string;
      san: string;
      uci: string;
      color: 'w' | 'b';
      piece?: string;
      captured?: string;
    };
    moveNumber: number;
    plyIndex: number;
    evalBefore: EngineEval | null;
    secondLine: EngineEval | null;
  } | null>(null);
  const [liveSandboxAnalysis, setLiveSandboxAnalysis] = useState<AnalyzedMove | null>(null);

  const [strength, setStrength] = useState<AnalysisStrength>('normal');
  const [multiPv, setMultiPv] = useState(3);
  const [engineState, setEngineState] = useState<{ fen: string; lines: EngineEval[] }>({
    fen: '',
    lines: [],
  });
  const [analyzingPos, setAnalyzingPos] = useState(false);

  // Full-Game Automatic Review
  const [reviewReport, setReviewReport] = useState<GameReviewReport | null>(initialReviewReport || null);
  const [reviewProgress, setReviewProgress] = useState<{
    current: number;
    total: number;
    subDepth: number;
    targetDepth: number;
  } | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [pvPlayback, setPvPlayback] = useState<PvPlaybackState | null>(null);

  // Parsed PGN Header Metadata & Share Game Modal State
  const [parsedHeaders, setParsedHeaders] = useState<Record<string, string>>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const [activeShareId, setActiveShareId] = useState<string | null>(sharedGameBanner?.shareId || null);
  const [shareSyncedHasReport, setShareSyncedHasReport] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const evalCacheRef = useRef<Map<string, EngineEval[]>>(new Map());
  const reviewRunSeqRef = useRef(0);

  const loadGameFromPgn = (pgn: string, preserveReport?: GameReviewReport | null): string[] => {
    try {
      const c = new Chess();
      c.loadPgn(pgn);
      const rawHeaders = c.header();
      const cleanHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (typeof v === 'string' && v.trim()) cleanHeaders[k] = v.trim();
      }
      setParsedHeaders(cleanHeaders);

      const verbose = c.history({ verbose: true });
      const replay = new Chess();
      const fenList = [replay.fen()];
      const sanList: string[] = [];
      const pairs: { from: string; to: string }[] = [];
      for (const m of verbose) {
        replay.move(m.san);
        fenList.push(replay.fen());
        sanList.push(m.san);
        pairs.push({ from: m.from, to: m.to });
      }
      reviewRunSeqRef.current += 1;
      setReviewProgress(null);
      setFens(fenList);
      setMovesSan(sanList);
      setMovePairs(pairs);
      setCurrentPly(sanList.length > 0 ? 1 : 0);
      setPvPlayback(null);
      setSandboxFen(null);
      setSandboxLastMove(null);
      setPendingSandboxMove(null);
      setLiveSandboxAnalysis(null);
      setReviewReport(preserveReport || null);
      setActiveShareId(null);
      setShareSyncedHasReport(false);
      setShareError(null);
      return sanList;
    } catch {
      return [];
    }
  };

  const runFullReview = async (movesOverride?: string[]) => {
    const targetMoves = movesOverride || movesSan;
    if (targetMoves.length === 0) return;
    const runSeq = ++reviewRunSeqRef.current;
    setAutoPlay(false);
    setPvPlayback(null);
    const evalTarget =
      strength === 'fast' ? 10 : strength === 'normal' ? 12 : strength === 'deep' ? 14 : 16;
    setReviewProgress({ current: 0, total: targetMoves.length, subDepth: 0, targetDepth: evalTarget });

    let lastReviewActivityAt = Date.now();
    const reviewStallWatchdog = setInterval(() => {
      if (reviewRunSeqRef.current !== runSeq) return;
      const engineLastAt = stockfishService.getEngineStats().lastActivityAt;
      const latestSignalAt = Math.max(lastReviewActivityAt, engineLastAt);
      if (Date.now() - latestSignalAt >= 12000) {
        lastReviewActivityAt = Date.now();
        void stockfishService.restartEngine('full-game review stall watchdog');
      }
    }, 3000);

    try {
      const report = await stockfishService.analyzeFullGame(
        targetMoves,
        strength,
        (current, total, detail) => {
          if (reviewRunSeqRef.current !== runSeq) return;
          lastReviewActivityAt = Date.now();
          setReviewProgress({
            current,
            total,
            subDepth: detail?.subDepth ?? 0,
            targetDepth: detail?.targetDepth ?? evalTarget,
          });
        },
        {
          onPartialReport: (partial) => {
            if (reviewRunSeqRef.current === runSeq) {
              lastReviewActivityAt = Date.now();
              setReviewReport(partial);
            }
          },
          isCancelled: () => reviewRunSeqRef.current !== runSeq,
        }
      );
      if (reviewRunSeqRef.current !== runSeq) return;
      setReviewReport(report);
      setSandboxFen(null);
      setSandboxLastMove(null);
      setCurrentPly((prev) => (prev === 0 && report.moves.length > 0 ? 1 : prev));

      if (report.whiteCounts.brilliant > 0 || report.blackCounts.brilliant > 0) {
        await unlockAchievement('brilliant-mind');
      }
      if (report.whiteAccuracy >= 90 || report.blackAccuracy >= 90) {
        await unlockAchievement('high-accuracy');
      }
    } finally {
      clearInterval(reviewStallWatchdog);
      if (reviewRunSeqRef.current === runSeq) {
        setReviewProgress(null);
      }
    }
  };

  useEffect(() => {
    const loadedMoves = loadGameFromPgn(initialPgn || SAMPLE_PGN, initialReviewReport || null);
    if (initialPgn) setPgnText(initialPgn);
    if (sharedGameBanner?.shareId) {
      setActiveShareId(sharedGameBanner.shareId);
      setShareSyncedHasReport(Boolean(initialReviewReport));
    }
    if (initialPgn && !initialReviewReport && loadedMoves.length > 0) {
      void runFullReview(loadedMoves);
    }
    return () => {
      reviewRunSeqRef.current += 1;
    };
  }, [initialPgn, initialReviewReport, sharedGameBanner?.shareId]);

  const activeFen = sandboxFen || fens[currentPly] || new Chess().fen();
  const engineLines = engineState.fen === activeFen ? engineState.lines : [];
  const isPvPlaybackActive = Boolean(pvPlayback);
  const isReviewRunning = Boolean(reviewProgress);

  const cacheCompletedEval = (fen: string, lines: EngineEval[]) => {
    if (lines.length === 0) return;
    const existing = evalCacheRef.current.get(fen);
    const newDepth = lines[0]?.depth ?? 0;
    const existingDepth = existing?.[0]?.depth ?? -1;
    const isTerminal = newDepth === 0 && (lines[0]?.mate === 0 || Math.abs(lines[0]?.cp ?? 0) === 10000);
    if (!existing || isTerminal || newDepth >= existingDepth) {
      evalCacheRef.current.set(fen, lines);
    }
  };

  // Seed eval cache whenever full review completes or streams new moves
  useEffect(() => {
    if (!reviewReport?.moves) return;
    for (const m of reviewReport.moves) {
      cacheCompletedEval(m.fenBefore, [m.evalBefore]);
      cacheCompletedEval(m.fenAfter, [m.evalAfter]);
    }
  }, [reviewReport]);

  // Real-time Stockfish WASM analysis on active position (paused during PV playback or Full Game Review)
  useEffect(() => {
    if (isPvPlaybackActive || isReviewRunning) {
      setAnalyzingPos(false);
      return;
    }
    let active = true;
    const targetDepth = STRENGTH_DEPTHS[strength];
    const cached = evalCacheRef.current.get(activeFen);
    const cachedDepth = cached?.[0]?.depth ?? 0;
    const cachedTerminal =
      cached &&
      cached.length > 0 &&
      cachedDepth === 0 &&
      (cached[0].mate === 0 || Math.abs(cached[0].cp) === 10000);

    if (cached && cached.length >= Math.min(multiPv, 1) && (cachedDepth >= targetDepth || cachedTerminal) && cached.length >= multiPv) {
      setEngineState({ fen: activeFen, lines: cached.slice(0, multiPv) });
      setAnalyzingPos(false);
      return;
    }

    const interactiveMovetime =
      strength === 'fast'
        ? 1500
        : strength === 'normal'
        ? 3000
        : strength === 'deep'
        ? 5500
        : 9000;

    setAnalyzingPos(true);
    setEngineState({ fen: activeFen, lines: [] });

    stockfishService
      .analyzePosition(activeFen, {
        depth: targetDepth,
        multiPv,
        movetime: interactiveMovetime,
        onUpdate: (lines) => {
          if (active) {
            setEngineState({ fen: activeFen, lines });
          }
        },
      })
      .then((finalLines) => {
        if (active) {
          setEngineState({ fen: activeFen, lines: finalLines });
          cacheCompletedEval(activeFen, finalLines);
          setAnalyzingPos(false);
        }
      })
      .catch(() => {
        if (active) setAnalyzingPos(false);
      });

    return () => {
      active = false;
      stockfishService.stopSearch();
    };
  }, [activeFen, strength, multiPv, isPvPlaybackActive, isReviewRunning]);

  // Live Chess.com-style move classification when exploring moves in Sandbox (waits for settled search)
  useEffect(() => {
    if (!pendingSandboxMove || !sandboxFen || pendingSandboxMove.fenAfter !== sandboxFen) return;
    if (analyzingPos || engineState.fen !== sandboxFen) return;
    const evalAfter = engineState.lines[0];
    if (!evalAfter) return;

    let cancelled = false;
    const classifyWithStableBefore = async () => {
      let evalBefore = pendingSandboxMove.evalBefore;
      let secondLine = pendingSandboxMove.secondLine;

      const beforeIsWeak =
        !evalBefore ||
        (evalBefore.depth < 10 && evalBefore.mate === null && Math.abs(evalBefore.cp) < 9000);

      if (beforeIsWeak) {
        const cachedBefore = evalCacheRef.current.get(pendingSandboxMove.fenBefore);
        if (cachedBefore?.[0] && (cachedBefore[0].depth >= 10 || cachedBefore[0].mate !== null)) {
          evalBefore = cachedBefore[0];
          secondLine = cachedBefore[1] || secondLine;
        } else {
          const computed = await stockfishService.analyzePosition(pendingSandboxMove.fenBefore, {
            depth: Math.max(10, Math.min(12, STRENGTH_DEPTHS[strength])),
            multiPv: 2,
            movetime: 1800,
          });
          if (cancelled) return;
          if (computed[0]) {
            cacheCompletedEval(pendingSandboxMove.fenBefore, computed);
            evalBefore = computed[0];
            secondLine = computed[1] || null;
          }
        }
      }

      if (cancelled || !evalBefore) return;

      const classified = classifyChessMove({
        fenBefore: pendingSandboxMove.fenBefore,
        fenAfter: pendingSandboxMove.fenAfter,
        move: pendingSandboxMove.move,
        evalBefore,
        secondLine,
        evalAfter,
        plyIndex: pendingSandboxMove.plyIndex,
      });

      setLiveSandboxAnalysis({
        ply: pendingSandboxMove.plyIndex + 1,
        moveNumber: pendingSandboxMove.moveNumber,
        color: pendingSandboxMove.move.color,
        san: pendingSandboxMove.move.san,
        uci: pendingSandboxMove.move.uci,
        from: pendingSandboxMove.move.from,
        to: pendingSandboxMove.move.to,
        fenBefore: pendingSandboxMove.fenBefore,
        fenAfter: pendingSandboxMove.fenAfter,
        evalBefore,
        evalAfter,
        bestAlternativeSan: evalBefore.bestMoveSan || pendingSandboxMove.move.san,
        bestAlternativeUci: evalBefore.bestMoveUci || pendingSandboxMove.move.uci,
        classification: classified.classification,
        winProbBefore: classified.wpBefore,
        winProbAfter: classified.wpAfter,
        cpLoss: classified.cpLoss,
        explanation: classified.explanation,
      });
    };

    void classifyWithStableBefore();
    return () => {
      cancelled = true;
    };
  }, [pendingSandboxMove, sandboxFen, engineState, analyzingPos, strength]);

  // Auto-play through game moves
  useEffect(() => {
    if (!autoPlay) return;
    if (currentPly >= movesSan.length) {
      setAutoPlay(false);
      return;
    }
    const timer = setTimeout(() => {
      const nextPly = Math.min(movesSan.length, currentPly + 1);
      setPvPlayback(null);
      setSandboxFen(null);
      setSandboxLastMove(null);
      setPendingSandboxMove(null);
      setLiveSandboxAnalysis(null);
      soundEngine.playFromFenAndSan(fens[nextPly] || activeFen, movesSan[nextPly - 1]);
      setCurrentPly(nextPly);
    }, 950);
    return () => clearTimeout(timer);
  }, [autoPlay, currentPly, movesSan, fens, activeFen]);

  // Auto-play through an engine-suggested PV sequence
  useEffect(() => {
    if (!pvPlayback || !pvPlayback.playing) return;
    if (pvPlayback.step >= pvPlayback.sanList.length) {
      setPvPlayback((prev) => (prev ? { ...prev, playing: false } : null));
      return;
    }
    const nextStep = pvPlayback.step + 1;
    const timer = setTimeout(() => {
      setSandboxFen(pvPlayback.fens[nextStep]);
      setSandboxLastMove(pvPlayback.pairs[nextStep - 1] || null);
      soundEngine.playFromFenAndSan(pvPlayback.fens[nextStep], pvPlayback.sanList[nextStep - 1]);
      setPvPlayback((prev) =>
        prev
          ? {
              ...prev,
              step: nextStep,
              playing: nextStep < prev.sanList.length,
            }
          : null
      );
    }, 680);
    return () => clearTimeout(timer);
  }, [pvPlayback]);

  const stopPvPlayback = () => {
    setPvPlayback(null);
    setSandboxFen(null);
    setSandboxLastMove(null);
    setPendingSandboxMove(null);
    setLiveSandboxAnalysis(null);
  };

  const buildPvSequence = (line: EngineEval): Omit<PvPlaybackState, 'step' | 'playing'> | null => {
    const baseFen = pvPlayback ? pvPlayback.fens[0] : activeFen;
    const baseLastMove = pvPlayback
      ? pvPlayback.baseLastMove
      : sandboxFen
      ? sandboxLastMove
      : currentPly > 0
      ? movePairs[currentPly - 1] || null
      : null;

    try {
      const c = new Chess(baseFen);
      const pvFens = [c.fen()];
      const pvPairs: { from: string; to: string }[] = [];
      const pvSans: string[] = [];

      if (line.pvSan.length > 0) {
        for (const san of line.pvSan) {
          const mv = c.move(san);
          if (!mv) break;
          pvFens.push(c.fen());
          pvPairs.push({ from: mv.from, to: mv.to });
          pvSans.push(mv.san);
        }
      } else if (line.pvUci.length > 0) {
        for (const uci of line.pvUci) {
          if (uci.length < 4) break;
          const mv = c.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          if (!mv) break;
          pvFens.push(c.fen());
          pvPairs.push({ from: mv.from, to: mv.to });
          pvSans.push(mv.san);
        }
      }

      if (pvSans.length === 0) return null;
      return {
        lineIndex: line.multipvIndex,
        baseLastMove,
        fens: pvFens,
        pairs: pvPairs,
        sanList: pvSans,
      };
    } catch {
      return null;
    }
  };

  const handleToggleOrJumpPvLine = (line: EngineEval, jumpToStep?: number) => {
    setAutoPlay(false);

    if (typeof jumpToStep === 'number') {
      const seq =
        pvPlayback && pvPlayback.lineIndex === line.multipvIndex
          ? pvPlayback
          : buildPvSequence(line);
      if (!seq) return;
      const clampedStep = Math.max(0, Math.min(seq.sanList.length, jumpToStep));
      setSandboxFen(seq.fens[clampedStep]);
      setSandboxLastMove(clampedStep === 0 ? seq.baseLastMove : seq.pairs[clampedStep - 1] || null);
      if (clampedStep > 0) {
        soundEngine.playFromFenAndSan(seq.fens[clampedStep], seq.sanList[clampedStep - 1]);
      } else {
        soundEngine.playMove();
      }
      setPvPlayback({
        lineIndex: seq.lineIndex,
        baseLastMove: seq.baseLastMove,
        fens: seq.fens,
        pairs: seq.pairs,
        sanList: seq.sanList,
        step: clampedStep,
        playing: false,
      });
      return;
    }

    if (pvPlayback && pvPlayback.lineIndex === line.multipvIndex) {
      if (pvPlayback.playing) {
        setPvPlayback((prev) => (prev ? { ...prev, playing: false } : null));
        return;
      }
      if (pvPlayback.step >= pvPlayback.sanList.length || pvPlayback.step === 0) {
        setSandboxFen(pvPlayback.fens[1]);
        setSandboxLastMove(pvPlayback.pairs[0] || null);
        soundEngine.playFromFenAndSan(pvPlayback.fens[1], pvPlayback.sanList[0]);
        setPvPlayback({
          ...pvPlayback,
          step: 1,
          playing: pvPlayback.sanList.length > 1,
        });
        return;
      }
      setPvPlayback({ ...pvPlayback, playing: true });
      return;
    }

    const seq = buildPvSequence(line);
    if (!seq) return;
    setSandboxFen(seq.fens[1]);
    setSandboxLastMove(seq.pairs[0] || null);
    soundEngine.playFromFenAndSan(seq.fens[1], seq.sanList[0]);
    setPvPlayback({
      ...seq,
      step: 1,
      playing: seq.sanList.length > 1,
    });
  };

  const stepPvPlayback = (delta: -1 | 1) => {
    if (!pvPlayback) return;
    const nextStep = Math.max(0, Math.min(pvPlayback.sanList.length, pvPlayback.step + delta));
    setSandboxFen(pvPlayback.fens[nextStep]);
    setSandboxLastMove(nextStep === 0 ? pvPlayback.baseLastMove : pvPlayback.pairs[nextStep - 1] || null);
    if (nextStep !== pvPlayback.step) {
      if (nextStep > 0) {
        soundEngine.playFromFenAndSan(pvPlayback.fens[nextStep], pvPlayback.sanList[nextStep - 1]);
      } else {
        soundEngine.playMove();
      }
    }
    setPvPlayback({
      ...pvPlayback,
      step: nextStep,
      playing: false,
    });
  };

  const activeAnalyzedMove: AnalyzedMove | null = useMemo(() => {
    if (!reviewReport || currentPly === 0 || sandboxFen) return null;
    return reviewReport.moves[currentPly - 1] || null;
  }, [reviewReport, currentPly, sandboxFen]);

  const liveMainLineAnalysis: AnalyzedMove | null = useMemo(() => {
    if (activeAnalyzedMove || sandboxFen || isReviewRunning || analyzingPos || currentPly <= 0) {
      return null;
    }
    const fenBefore = fens[currentPly - 1];
    const fenAfter = fens[currentPly];
    const san = movesSan[currentPly - 1];
    const pair = movePairs[currentPly - 1];
    if (!fenBefore || !fenAfter || !san || !pair) return null;

    const beforeLines = evalCacheRef.current.get(fenBefore);
    const afterLines =
      engineState.fen === fenAfter && engineState.lines.length > 0
        ? engineState.lines
        : evalCacheRef.current.get(fenAfter);
    if (!beforeLines?.[0] || !afterLines?.[0]) return null;

    try {
      const probe = new Chess(fenBefore);
      const mv = probe.move(san);
      if (!mv) return null;
      const uci = `${mv.from}${mv.to}${mv.promotion || ''}`;
      const classified = classifyChessMove({
        fenBefore,
        fenAfter,
        move: {
          from: mv.from,
          to: mv.to,
          san: mv.san,
          uci,
          color: mv.color,
          piece: mv.piece,
          captured: mv.captured,
        },
        evalBefore: beforeLines[0],
        secondLine: beforeLines[1] || null,
        evalAfter: afterLines[0],
        plyIndex: currentPly - 1,
      });
      return {
        ply: currentPly,
        moveNumber: Math.floor((currentPly - 1) / 2) + 1,
        color: mv.color,
        san: mv.san,
        uci,
        from: mv.from,
        to: mv.to,
        fenBefore,
        fenAfter,
        evalBefore: beforeLines[0],
        evalAfter: afterLines[0],
        bestAlternativeSan: beforeLines[0].bestMoveSan || mv.san,
        bestAlternativeUci: beforeLines[0].bestMoveUci || uci,
        classification: classified.classification,
        winProbBefore: classified.wpBefore,
        winProbAfter: classified.wpAfter,
        cpLoss: classified.cpLoss,
        explanation: classified.explanation,
      };
    } catch {
      return null;
    }
  }, [activeAnalyzedMove, sandboxFen, isReviewRunning, analyzingPos, currentPly, fens, movesSan, movePairs, engineState]);

  const activeDisplayAnalysis: AnalyzedMove | null =
    activeAnalyzedMove || (!pvPlayback && sandboxFen ? liveSandboxAnalysis : liveMainLineAnalysis);

  const keyMomentPlies = useMemo(() => {
    if (!reviewReport) return [];
    return reviewReport.moves
      .filter((m) => isKeyMomentClassification(m.classification))
      .map((m) => m.ply);
  }, [reviewReport]);

  const jumpToKeyMoment = (direction: -1 | 1) => {
    if (keyMomentPlies.length === 0) return;
    setAutoPlay(false);
    setPvPlayback(null);
    setSandboxFen(null);
    setSandboxLastMove(null);
    setPendingSandboxMove(null);
    setLiveSandboxAnalysis(null);

    if (direction > 0) {
      const next = keyMomentPlies.find((p) => p > currentPly) ?? keyMomentPlies[0];
      setCurrentPly(next);
    } else {
      const prevList = keyMomentPlies.filter((p) => p < currentPly);
      const prev = prevList.length > 0 ? prevList[prevList.length - 1] : keyMomentPlies[keyMomentPlies.length - 1];
      setCurrentPly(prev);
    }
  };

  const jumpToClassification = (cls: MoveClassification) => {
    if (!reviewReport) return;
    const matching = reviewReport.moves.filter((m) => m.classification === cls).map((m) => m.ply);
    if (matching.length === 0) return;
    setAutoPlay(false);
    setPvPlayback(null);
    setSandboxFen(null);
    setSandboxLastMove(null);
    setPendingSandboxMove(null);
    setLiveSandboxAnalysis(null);
    const next = matching.find((p) => p > currentPly) ?? matching[0];
    setCurrentPly(next);
  };

  const boardArrows: BoardArrow[] = useMemo(() => {
    const arr: BoardArrow[] = [];
    if (pvPlayback) {
      const upcoming = pvPlayback.pairs[pvPlayback.step];
      if (upcoming) {
        arr.push({ from: upcoming.from, to: upcoming.to, color: '#10B981' });
      }
      return arr;
    }
    if (activeDisplayAnalysis?.bestAlternativeUci && activeDisplayAnalysis.bestAlternativeUci.length >= 4) {
      arr.push({
        from: activeDisplayAnalysis.bestAlternativeUci.slice(0, 2),
        to: activeDisplayAnalysis.bestAlternativeUci.slice(2, 4),
        color: '#10B981',
      });
    } else if (engineLines[0]?.bestMoveUci && engineLines[0].bestMoveUci.length >= 4) {
      arr.push({
        from: engineLines[0].bestMoveUci.slice(0, 2),
        to: engineLines[0].bestMoveUci.slice(2, 4),
        color: '#10B981',
      });
    }
    return arr;
  }, [pvPlayback, activeDisplayAnalysis, engineLines]);

  const handleSandboxMove = (mv: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    try {
      const c = new Chess(activeFen);
      const plyIdx = sandboxFen ? currentPly + (pendingSandboxMove ? 1 : 0) : currentPly;
      const moveNum = c.moveNumber();
      const cachedBefore = evalCacheRef.current.get(activeFen);
      const prevEval =
        cachedBefore?.[0] ||
        (!analyzingPos && engineLines[0]) ||
        activeAnalyzedMove?.evalAfter ||
        liveSandboxAnalysis?.evalAfter ||
        null;
      const prevSecond =
        cachedBefore?.[1] || (!analyzingPos && engineLines[1]) || null;

      const played = c.move(mv);
      if (!played) return false;
      const afterFen = c.fen();
      setPvPlayback(null);
      setAutoPlay(false);
      setLiveSandboxAnalysis(null);

      setPendingSandboxMove({
        fenBefore: activeFen,
        fenAfter: afterFen,
        move: {
          from: played.from,
          to: played.to,
          san: played.san,
          uci: `${played.from}${played.to}${played.promotion || ''}`,
          color: played.color,
          piece: played.piece,
          captured: played.captured,
        },
        moveNumber: moveNum,
        plyIndex: plyIdx,
        evalBefore: prevEval,
        secondLine: prevSecond,
      });

      setSandboxFen(afterFen);
      setSandboxLastMove({ from: played.from, to: played.to });
      soundEngine.playForChessMove(c, played);
      return true;
    } catch {
      return false;
    }
  };

  const playBestAlternative = () => {
    if (!activeDisplayAnalysis) return;
    const uci = activeDisplayAnalysis.bestAlternativeUci;
    if (!uci || uci.length < 4) return;
    try {
      const c = new Chess(activeDisplayAnalysis.fenBefore);
      const mv = c.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (mv) {
        setPvPlayback(null);
        setAutoPlay(false);
        setPendingSandboxMove(null);
        setLiveSandboxAnalysis(null);
        setSandboxFen(c.fen());
        setSandboxLastMove({ from: mv.from, to: mv.to });
        soundEngine.playForChessMove(c, mv);
      }
    } catch {
      // ignore
    }
  };

  const playAnalysisFollowUp = () => {
    const line = engineLines[0] || activeDisplayAnalysis?.evalAfter || activeDisplayAnalysis?.evalBefore;
    if (!line || (line.pvSan.length === 0 && line.pvUci.length === 0)) return;
    handleToggleOrJumpPvLine(line);
  };

  const topEval = engineLines[0] || (activeAnalyzedMove ? activeAnalyzedMove.evalAfter : null);

  const displayWhiteName =
    initialMeta?.whiteName || parsedHeaders.White || 'White';
  const displayBlackName =
    initialMeta?.blackName || parsedHeaders.Black || 'Black';
  const displayResult =
    initialMeta?.result || parsedHeaders.Result || '*';
  const displayTimeControl =
    initialMeta?.timeControl || parsedHeaders.TimeControl || 'Analysis';
  const displayOpening =
    reviewReport?.openingName ||
    initialMeta?.openingName ||
    parsedHeaders.Opening ||
    '';
  const displayEco =
    reviewReport?.eco || initialMeta?.eco || parsedHeaders.ECO || '';

  const buildShareablePgn = (): string => {
    const trimmed = pgnText.trim();
    if (trimmed && movesSan.length > 0) {
      return trimmed.slice(0, 30000);
    }
    const c = new Chess();
    c.header('White', displayWhiteName, 'Black', displayBlackName, 'Result', displayResult);
    for (const san of movesSan) {
      c.move(san);
    }
    return (c.pgn() || `[FEN "${fens[0]}"]`).slice(0, 30000);
  };

  const createOrUpdateShareLink = async () => {
    if (!firebaseUser) return;
    setShareCreating(true);
    setShareError(null);
    try {
      const pgnPayload = buildShareablePgn();
      const sanitizedReport = reviewReport
        ? sanitizeReviewReportForFirestore(reviewReport)
        : undefined;
      const hasReport = Boolean(sanitizedReport);

      if (activeShareId && !sharedGameBanner?.shareId) {
        await updateDoc(doc(db, 'sharedGames', activeShareId), {
          whiteName: displayWhiteName.slice(0, 64),
          blackName: displayBlackName.slice(0, 64),
          result: displayResult.slice(0, 16),
          timeControl: displayTimeControl.slice(0, 24),
          openingName: displayOpening.slice(0, 120),
          eco: displayEco.slice(0, 12),
          hasReviewReport: hasReport,
          ...(sanitizedReport ? { reviewReport: sanitizedReport } : {}),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `sharedGames/${activeShareId}`);
        });
        setShareSyncedHasReport(hasReport);
      } else {
        const newId = generateShareId();
        await setDoc(doc(db, 'sharedGames', newId), {
          shareId: newId,
          creatorUid: firebaseUser.uid,
          creatorName: (
            profile?.displayName ||
            firebaseUser.displayName ||
            'eChess Player'
          ).slice(0, 64),
          whiteName: displayWhiteName.slice(0, 64),
          blackName: displayBlackName.slice(0, 64),
          result: displayResult.slice(0, 16),
          timeControl: displayTimeControl.slice(0, 24),
          openingName: displayOpening.slice(0, 120),
          eco: displayEco.slice(0, 12),
          pgn: pgnPayload,
          hasReviewReport: hasReport,
          ...(sanitizedReport ? { reviewReport: sanitizedReport } : {}),
          createdAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, `sharedGames/${newId}`);
        });
        setActiveShareId(newId);
        setShareSyncedHasReport(hasReport);
      }
    } catch {
      setShareError(t('analysis.shareError'));
    } finally {
      setShareCreating(false);
    }
  };

  const handleOpenShareModal = () => {
    setShowShareModal(true);
    setCopiedLink(false);
    setCopiedPgn(false);
    setShareError(null);
    if (
      firebaseUser &&
      (!activeShareId || (Boolean(reviewReport) && !shareSyncedHasReport && !sharedGameBanner?.shareId))
    ) {
      void createOrUpdateShareLink();
    }
  };

  const shareUrl = activeShareId
    ? `${getPublicAppOrigin()}/?share=${encodeURIComponent(activeShareId)}`
    : '';
  const shareTitle = `${displayWhiteName} vs ${displayBlackName} (${displayResult}) — eChess Game Review`;
  const shareText = reviewReport
    ? `Check out my eChess Game Review: ${displayWhiteName} (${reviewReport.whiteAccuracy}%) vs ${displayBlackName} (${reviewReport.blackAccuracy}%)${displayOpening ? ` · ${displayOpening}` : ''}`
    : `Check out this chess game on eChess: ${displayWhiteName} vs ${displayBlackName} (${displayResult})`;

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyPgn = async () => {
    try {
      await navigator.clipboard.writeText(buildShareablePgn());
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="max-w-[1380px] mx-auto space-y-6">
      {sharedLoadState === 'loading' && (
        <div className="bg-[#12171E] border border-emerald-700/50 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-emerald-200">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>{t('analysis.shareLoadingShared')}</span>
        </div>
      )}

      {sharedLoadState === 'not-found' && (
        <div className="bg-rose-950/30 border border-rose-800/60 rounded-xl p-4 space-y-1">
          <h2 className="text-sm font-semibold text-rose-200">{t('analysis.shareNotFoundTitle')}</h2>
          <p className="text-xs text-rose-300/80">{t('analysis.shareNotFoundDesc')}</p>
        </div>
      )}

      {sharedGameBanner && sharedLoadState === 'idle' && (
        <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-200">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{t('analysis.shareSharedBadge')}</span>
            {sharedGameBanner.creatorName && (
              <span className="text-emerald-300/80">
                · {t('analysis.shareSharedBy', { name: sharedGameBanner.creatorName })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopyShareUrl}
            className="px-3 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-600/40 text-xs font-medium text-emerald-200 inline-flex items-center gap-1.5"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedLink ? t('analysis.shareCopied') : t('analysis.shareCopyLink')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            {t('analysis.title')}
          </h1>
          <p className="text-sm text-slate-400">
            {initialMeta?.whiteName || parsedHeaders.White
              ? `${displayWhiteName} vs ${displayBlackName} · ${displayResult} · ${displayTimeControl}`
              : t('analysis.subtitleDefault')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenShareModal}
            className="px-3.5 py-2 rounded-lg bg-[#12171E] hover:bg-[#19202A] border border-slate-700 text-xs font-semibold text-emerald-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            {t('analysis.shareGame')}
          </button>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-[#12171E] hover:bg-[#19202A] border border-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            {t('analysis.loadPgnFen')}
          </button>
          <button
            type="button"
            disabled={Boolean(reviewProgress) || movesSan.length === 0}
            onClick={() => void runFullReview()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            {reviewProgress ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('analysis.analyzing', { current: reviewProgress.current, total: reviewProgress.total })}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('analysis.runFullReview')}
              </>
            )}
          </button>
        </div>
      </div>

      {showImport && (
        <div className="animate-menu-popover origin-top bg-[#12171E] border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">{t('analysis.pastePgn')}</label>
            <textarea
              value={pgnText}
              onChange={(e) => setPgnText(e.target.value)}
              rows={4}
              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={() => {
                loadGameFromPgn(pgnText);
                setShowImport(false);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              {t('analysis.loadPgn')}
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">{t('analysis.loadCustomFen')}</label>
            <input
              type="text"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={() => {
                try {
                  const c = new Chess(fenInput.trim());
                  setFens([c.fen()]);
                  setMovesSan([]);
                  setMovePairs([]);
                  setCurrentPly(0);
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setReviewReport(null);
                  setParsedHeaders({});
                  setActiveShareId(null);
                  setShareSyncedHasReport(false);
                  setShowImport(false);
                } catch {
                  // ignore invalid FEN
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#1C232E] hover:bg-slate-700 text-slate-100 text-xs font-semibold"
            >
              {t('analysis.setFen')}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Board + Eval Bar + Transport */}
        <div className="lg:col-span-6 flex flex-col items-center space-y-3">
          <div className="flex items-stretch justify-center gap-2.5 w-full max-w-[560px]">
            <EvaluationBar evaluation={topEval} orientation={orientation} />
            <ChessBoard
              fen={activeFen}
              orientation={orientation}
              interactive={true}
              allowBothSides={true}
              boardThemeId={profile?.boardTheme}
              pieceStyle={profile?.pieceStyle}
              showCoordinates={profile?.showCoordinates ?? true}
              autoQueen={profile?.autoQueen ?? false}
              lastMove={
                sandboxFen
                  ? sandboxLastMove
                  : currentPly > 0
                  ? movePairs[currentPly - 1]
                  : null
              }
              moveClassification={
                !pvPlayback && activeDisplayAnalysis
                  ? {
                      square: activeDisplayAnalysis.to,
                      classification: activeDisplayAnalysis.classification,
                      label: t(CLASSIFICATION_VISUALS[activeDisplayAnalysis.classification].labelKey),
                    }
                  : null
              }
              arrows={boardArrows}
              onMove={handleSandboxMove}
            />
          </div>

          {/* Controls */}
          <div className="w-full max-w-[540px] flex items-center justify-between gap-2 bg-[#12171E] border border-slate-800 rounded-xl p-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                  setCurrentPly(0);
                }}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"
                title="First move"
              >
                <ChevronFirst className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                  setCurrentPly((p) => Math.max(0, p - 1));
                }}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"
                title="Previous move"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                  setAutoPlay((a) => !a);
                }}
                className={`p-2 rounded-lg transition-colors ${
                  autoPlay ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'
                }`}
                title="Auto replay"
              >
                {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                  setCurrentPly((p) => Math.min(movesSan.length, p + 1));
                }}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"
                title="Next move"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setPvPlayback(null);
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                  setCurrentPly(movesSan.length);
                }}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"
                title="Last move"
              >
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>

            {sandboxFen && !pvPlayback && (
              <button
                type="button"
                onClick={() => {
                  setSandboxFen(null);
                  setSandboxLastMove(null);
                  setPendingSandboxMove(null);
                  setLiveSandboxAnalysis(null);
                }}
                className="px-2.5 py-1 rounded bg-amber-950/60 border border-amber-700 text-amber-200 text-xs"
              >
                {t('analysis.exitVariation')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"
              title={t('common.flip')}
            >
              <FlipVertical className="w-4 h-4" />
            </button>
          </div>

          {pvPlayback && (
            <div className="w-full max-w-[540px] flex flex-wrap items-center justify-between gap-2 bg-emerald-950/30 border border-emerald-700/50 rounded-xl px-3 py-2">
              <span className="text-xs font-mono font-semibold text-emerald-300 tabular-nums">
                {t('analysis.engineSeqStep', {
                  line: pvPlayback.lineIndex,
                  step: pvPlayback.step,
                  total: pvPlayback.sanList.length,
                })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pvPlayback.step <= 0}
                  onClick={() => stepPvPlayback(-1)}
                  className="p-1.5 rounded-lg bg-[#12171E] hover:bg-slate-800 disabled:opacity-40 text-slate-200"
                  title="Previous engine move"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const activeLine = engineLines.find(
                      (l) => l.multipvIndex === pvPlayback.lineIndex
                    );
                    if (activeLine) handleToggleOrJumpPvLine(activeLine);
                  }}
                  className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                  title={pvPlayback.playing ? t('analysis.pauseLine') : t('analysis.playLine')}
                >
                  {pvPlayback.playing ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={pvPlayback.step >= pvPlayback.sanList.length}
                  onClick={() => stepPvPlayback(1)}
                  className="p-1.5 rounded-lg bg-[#12171E] hover:bg-slate-800 disabled:opacity-40 text-slate-200"
                  title="Next engine move"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={stopPvPlayback}
                  className="ml-1 px-2 py-1 rounded-lg bg-[#12171E] hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1"
                  title={t('analysis.stopLine')}
                >
                  <X className="w-3 h-3" />
                  {t('analysis.stopLine')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Engine Lines + Move List + Review Report */}
        <div className="lg:col-span-6 space-y-4">
          {/* Full-Game Review Dynamic Depth & Move Progress Bar */}
          {reviewProgress && (
            <div className="bg-[#12171E] border border-emerald-600/50 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-emerald-300 inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('analysis.reviewBannerTitle')}
                </span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {t('analysis.reviewMoveProgress', {
                    current: reviewProgress.current,
                    total: reviewProgress.total,
                  })}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#0B0E11] border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (reviewProgress.current / Math.max(1, reviewProgress.total)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                <span>
                  {t('analysis.depthProgress', {
                    current: reviewProgress.subDepth,
                    target: reviewProgress.targetDepth,
                  })}
                </span>
                <span>
                  {Math.min(
                    100,
                    Math.round(
                      (reviewProgress.subDepth / Math.max(1, reviewProgress.targetDepth)) * 100
                    )
                  )}
                  %
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#0B0E11] overflow-hidden">
                <div
                  className="h-full bg-emerald-400/90 transition-all duration-150"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        4,
                        Math.round(
                          (reviewProgress.subDepth / Math.max(1, reviewProgress.targetDepth)) * 100
                        )
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Chess.com-Style Coach Card (Placed First for Immediate Visibility on Mobile & Desktop) */}
          {(activeDisplayAnalysis || (sandboxFen && pendingSandboxMove && !pvPlayback)) && (
            <div
              className={`bg-[#12171E] border rounded-xl p-4 space-y-3 ${
                activeDisplayAnalysis
                  ? CLASSIFICATION_VISUALS[activeDisplayAnalysis.classification].borderClass
                  : 'border-slate-800'
              }`}
            >
              {activeDisplayAnalysis ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ClassificationBadge
                        classification={activeDisplayAnalysis.classification}
                        label={t(CLASSIFICATION_VISUALS[activeDisplayAnalysis.classification].labelKey)}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-slate-100">
                            {activeDisplayAnalysis.moveNumber}
                            {activeDisplayAnalysis.color === 'w' ? '.' : '...'} {activeDisplayAnalysis.san}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              CLASSIFICATION_VISUALS[activeDisplayAnalysis.classification].textClass
                            }`}
                          >
                            {t(CLASSIFICATION_VISUALS[activeDisplayAnalysis.classification].labelKey)}
                          </span>
                          {(sandboxFen || (!reviewReport && liveMainLineAnalysis)) && (
                            <span className="text-[11px] text-slate-400">
                              · {t('analysis.liveClassified')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums font-mono">
                          {t('analysis.coachLabel')} · {formatEvalDisplay(activeDisplayAnalysis.evalBefore)} →{' '}
                          {formatEvalDisplay(activeDisplayAnalysis.evalAfter)}
                        </p>
                      </div>
                    </div>

                    {reviewReport && keyMomentPlies.length > 0 && !sandboxFen && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => jumpToKeyMoment(-1)}
                          className="px-2 py-1 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300"
                        >
                          {t('analysis.prevKeyMoment')}
                        </button>
                        <button
                          type="button"
                          onClick={() => jumpToKeyMoment(1)}
                          className="px-2 py-1 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-800 text-[11px] font-medium text-slate-300"
                        >
                          {t('analysis.nextKeyMoment')}
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">
                    {activeDisplayAnalysis.explanation}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    {activeDisplayAnalysis.bestAlternativeSan !== activeDisplayAnalysis.san ? (
                      <span className="text-xs text-slate-400">
                        {t('analysis.bestMoveWas', { move: activeDisplayAnalysis.bestAlternativeSan })}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400/90 font-medium">
                        {t('analysis.clsBest')}
                      </span>
                    )}

                    <div className="flex items-center gap-2 ms-auto">
                      {engineLines[0] && engineLines[0].pvSan.length > 0 && (
                        <button
                          type="button"
                          onClick={playAnalysisFollowUp}
                          className="px-3 py-1 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3 text-emerald-400" />
                          {t('analysis.showFollowUp')}
                        </button>
                      )}
                      {activeDisplayAnalysis.bestAlternativeSan !== activeDisplayAnalysis.san && (
                        <button
                          type="button"
                          onClick={playBestAlternative}
                          className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-700/60 text-emerald-300 text-xs font-medium"
                        >
                          {t('analysis.replayBestMove')}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2.5 text-xs text-slate-300 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{t('analysis.evaluatingMove')}</span>
                </div>
              )}
            </div>
          )}

          {/* Stockfish Live Lines */}
          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Stockfish 19 WASM
                </h2>
                <span className="text-xs font-mono text-emerald-400 tabular-nums">
                  {analyzingPos
                    ? t('analysis.analyzingDepth', { depth: engineLines[0]?.depth || 1 })
                    : t('analysis.depth', { depth: engineLines[0]?.depth || STRENGTH_DEPTHS[strength] })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={strength}
                  onChange={(e) => setStrength(e.target.value as AnalysisStrength)}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="fast">{t('analysis.strengthFast')}</option>
                  <option value="normal">{t('analysis.strengthNormal')}</option>
                  <option value="deep">{t('analysis.strengthDeep')}</option>
                  <option value="maximum">{t('analysis.strengthMaximum')}</option>
                </select>
                <select
                  value={multiPv}
                  onChange={(e) => setMultiPv(Number(e.target.value))}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value={1}>{t('analysis.lineSingle')}</option>
                  <option value={3}>{t('analysis.linesCount', { count: 3 })}</option>
                  <option value={5}>{t('analysis.linesCount', { count: 5 })}</option>
                </select>
              </div>
            </div>

            {/* Dynamic Engine Search Depth Progress Bar */}
            {(() => {
              const targetDepth = STRENGTH_DEPTHS[strength];
              const rawDepth = engineLines[0]?.depth ?? 0;
              const isHighDepth = targetDepth >= 16;
              const currentDepth = !analyzingPos && rawDepth === 0 ? targetDepth : Math.min(targetDepth, rawDepth);
              const pct = analyzingPos
                ? Math.min(99, Math.max(rawDepth > 0 ? 6 : 3, Math.round((currentDepth / targetDepth) * 100)))
                : 100;
              const nps = engineLines[0]?.nps;

              return (
                <div className="space-y-1.5" aria-label={t('analysis.depthProgress', { current: currentDepth, target: targetDepth })}>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                    <div className="flex items-center gap-2">
                      {isHighDepth && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-semibold text-cyan-300">
                          {t('analysis.highDepthLabel')}
                        </span>
                      )}
                      <span className={analyzingPos ? 'text-emerald-300' : 'text-slate-400'}>
                        {analyzingPos
                          ? t('analysis.depthProgress', { current: currentDepth, target: targetDepth })
                          : t('analysis.depthComplete', { target: currentDepth })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      {typeof nps === 'number' && nps > 0 && (
                        <span>{Math.round(nps / 1000)}k n/s</span>
                      )}
                      <span className="font-semibold text-emerald-400">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#0B0E11] border border-slate-800/90 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        analyzingPos
                          ? isHighDepth
                            ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 animate-pulse'
                            : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              {engineLines.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">{t('analysis.calculatingLines')}</p>
              ) : (
                engineLines.map((line) => {
                  const isLineSelected = pvPlayback?.lineIndex === line.multipvIndex;
                  const isLinePlaying = isLineSelected && pvPlayback?.playing;
                  return (
                    <div
                      key={line.multipvIndex}
                      className={`border rounded-lg px-2.5 py-2 flex items-center gap-2.5 text-xs font-mono transition-colors ${
                        isLineSelected
                          ? 'bg-emerald-950/25 border-emerald-600/60'
                          : 'bg-[#0B0E11] border-slate-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleOrJumpPvLine(line)}
                        className={`p-1.5 rounded-md shrink-0 transition-colors ${
                          isLinePlaying
                            ? 'bg-emerald-600 text-white'
                            : isLineSelected
                            ? 'bg-emerald-600/25 text-emerald-300 hover:bg-emerald-600/40'
                            : 'bg-[#12171E] hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300'
                        }`}
                        title={isLinePlaying ? t('analysis.pauseLine') : t('analysis.playLine')}
                        aria-label={isLinePlaying ? t('analysis.pauseLine') : t('analysis.playLine')}
                      >
                        {isLinePlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="w-13 font-bold text-emerald-400 tabular-nums shrink-0">
                        {formatEvalDisplay(line)}
                      </span>
                      <div
                        dir="ltr"
                        className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none py-0.5 flex-1 min-w-0"
                      >
                        {line.pvSan.map((san, idx) => {
                          const stepNum = idx + 1;
                          const isActiveStep = isLineSelected && pvPlayback?.step === stepNum;
                          return (
                            <button
                              key={`${line.multipvIndex}-${idx}`}
                              type="button"
                              onClick={() => handleToggleOrJumpPvLine(line, stepNum)}
                              className={`px-1.5 py-0.5 rounded transition-colors ${
                                isActiveStep
                                  ? 'bg-emerald-600 text-white font-semibold'
                                  : 'text-slate-200 hover:bg-slate-800 hover:text-emerald-300'
                              }`}
                            >
                              {san}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Move List */}
          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-[210px] overflow-y-auto font-mono text-xs">
              {movesSan.map((san, idx) => {
                const ply = idx + 1;
                const am = reviewReport?.moves[idx];
                const isSelected = currentPly === ply && !sandboxFen;
                return (
                  <button
                    key={ply}
                    type="button"
                    onClick={() => {
                      setAutoPlay(false);
                      setPvPlayback(null);
                      setSandboxFen(null);
                      setSandboxLastMove(null);
                      setPendingSandboxMove(null);
                      setLiveSandboxAnalysis(null);
                      setCurrentPly(ply);
                    }}
                    className={`px-2 py-1.5 rounded text-left flex items-center justify-between gap-1.5 transition-colors ${
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#0B0E11] hover:bg-[#19202A] text-slate-200'
                    }`}
                  >
                    <span className="truncate">
                      {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.` : ''}
                      {san}
                    </span>
                    {am && (
                      <ClassificationBadge
                        classification={am.classification}
                        label={t(CLASSIFICATION_VISUALS[am.classification].labelKey)}
                        size="xs"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full Game Review Report + Interactive Evaluation Graph */}
          {reviewReport && (
            <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-slate-100">
                  {t('analysis.reportTitle')}
                </h3>
                <span className="text-xs text-slate-400 truncate">
                  {reviewReport.eco} · {reviewReport.openingName}
                </span>
              </div>

              {/* Accuracy, Game Rating & Phase Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0B0E11] border border-slate-800 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">{t('analysis.whiteAccuracy')}</p>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {t('analysis.gameRating')}{' '}
                      <strong className="text-slate-100">
                        {estimateGameRating(
                          reviewReport.whiteAccuracy,
                          initialMeta?.blackRating || profile?.ratings?.rapid || 1500
                        )}
                      </strong>
                    </span>
                  </div>
                  <p className="font-mono text-2xl font-bold text-white tabular-nums">
                    {reviewReport.whiteAccuracy}%
                  </p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    {reviewReport.phases.opening.white}% · {reviewReport.phases.middlegame.white}% · {reviewReport.phases.endgame.white}%
                  </p>
                </div>
                <div className="bg-[#0B0E11] border border-slate-800 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">{t('analysis.blackAccuracy')}</p>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {t('analysis.gameRating')}{' '}
                      <strong className="text-slate-100">
                        {estimateGameRating(
                          reviewReport.blackAccuracy,
                          initialMeta?.whiteRating || profile?.ratings?.rapid || 1500
                        )}
                      </strong>
                    </span>
                  </div>
                  <p className="font-mono text-2xl font-bold text-slate-200 tabular-nums">
                    {reviewReport.blackAccuracy}%
                  </p>
                  <p className="text-[11px] text-slate-400 tabular-nums">
                    {reviewReport.phases.opening.black}% · {reviewReport.phases.middlegame.black}% · {reviewReport.phases.endgame.black}%
                  </p>
                </div>
              </div>

              {/* Interactive Move Evaluation Graph */}
              <div>
                <p className="text-xs text-slate-400 mb-1.5">{t('analysis.evalGraphHint')}</p>
                <div className="bg-[#0B0E11] border border-slate-800 rounded-lg p-2">
                  <svg viewBox="0 0 400 90" className="w-full h-24 overflow-visible">
                    <line x1="0" y1="45" x2="400" y2="45" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                    <polyline
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2"
                      points={reviewReport.moves
                        .map((m, idx) => {
                          const x = (idx / Math.max(1, reviewReport.moves.length - 1)) * 400;
                          const wp = cpToWinProbWhite(evalToCpEquivalent(m.evalAfter));
                          const y = 86 - (wp / 100) * 82;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                    />
                    {reviewReport.moves.map((m, idx) => {
                      const x = (idx / Math.max(1, reviewReport.moves.length - 1)) * 400;
                      const wp = cpToWinProbWhite(evalToCpEquivalent(m.evalAfter));
                      const y = 86 - (wp / 100) * 82;
                      const isCurr = currentPly === m.ply && !sandboxFen;
                      const dotColor = isCurr
                        ? '#FFFFFF'
                        : CLASSIFICATION_VISUALS[m.classification].bgHex;
                      return (
                        <circle
                          key={m.ply}
                          cx={x}
                          cy={y}
                          r={isCurr ? 4.8 : isKeyMomentClassification(m.classification) ? 3.4 : 2.3}
                          fill={dotColor}
                          className="cursor-pointer"
                          onClick={() => {
                            setAutoPlay(false);
                            setPvPlayback(null);
                            setSandboxFen(null);
                            setSandboxLastMove(null);
                            setPendingSandboxMove(null);
                            setLiveSandboxAnalysis(null);
                            setCurrentPly(m.ply);
                          }}
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Chess.com-Style Classification Breakdown Table */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                {CLASSIFICATION_ORDER.map((cls) => {
                  const vis = CLASSIFICATION_VISUALS[cls];
                  const wCount = reviewReport.whiteCounts[cls];
                  const bCount = reviewReport.blackCounts[cls];
                  const hasAny = wCount > 0 || bCount > 0;
                  return (
                    <button
                      key={cls}
                      type="button"
                      disabled={!hasAny}
                      onClick={() => jumpToClassification(cls)}
                      className={`flex items-center justify-between gap-2 bg-[#0B0E11] border border-slate-800/90 rounded-lg px-2.5 py-1.5 transition-colors ${
                        hasAny ? 'hover:border-slate-600 cursor-pointer' : 'opacity-60 cursor-default'
                      }`}
                    >
                      <span className="font-mono font-bold text-slate-100 tabular-nums w-6 text-center">
                        {wCount}
                      </span>
                      <span className="flex items-center gap-1.5 min-w-0">
                        <ClassificationBadge
                          classification={cls}
                          label={t(vis.labelKey)}
                          size="xs"
                        />
                        <span className={`font-medium truncate ${vis.textClass}`}>
                          {t(vis.labelKey)}
                        </span>
                      </span>
                      <span className="font-mono font-bold text-slate-300 tabular-nums w-6 text-center">
                        {bCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share Game Modal */}
      {showShareModal && (
        <div className="animate-menu-backdrop fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="animate-menu-modal max-w-lg w-full bg-[#12171E] border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-100">
                    {t('analysis.shareModalTitle')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('analysis.shareModalSubtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                aria-label={t('common.dismiss')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Game Snapshot Summary */}
            <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-100">
                  {displayWhiteName} vs {displayBlackName}
                </span>
                <span className="font-mono text-emerald-400 font-bold">{displayResult}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  {reviewReport ? t('analysis.shareReportIncluded') : t('analysis.sharePgnOnlyIncluded')}
                </span>
                {reviewReport && (
                  <span className="font-mono text-slate-300 tabular-nums">
                    {reviewReport.whiteAccuracy}% / {reviewReport.blackAccuracy}%
                  </span>
                )}
              </div>
            </div>

            {!reviewReport && (
              <p className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
                {t('analysis.shareNoReviewNote')}
              </p>
            )}

            {!firebaseUser && !activeShareId ? (
              <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-4 text-center space-y-3">
                <p className="text-xs text-slate-300">{t('analysis.shareSignInRequired')}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await signInWithGoogle();
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  {t('app.signInGoogle')}
                </button>
              </div>
            ) : shareCreating ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-emerald-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('analysis.shareCreating')}</span>
              </div>
            ) : shareError ? (
              <div className="bg-rose-950/40 border border-rose-700/60 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <p className="text-xs text-rose-200">{shareError}</p>
                <button
                  type="button"
                  onClick={() => void createOrUpdateShareLink()}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shrink-0"
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {!activeShareId && firebaseUser && (
                  <button
                    type="button"
                    onClick={() => void createOrUpdateShareLink()}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <Link2 className="w-4 h-4" />
                    {t('analysis.shareGame')}
                  </button>
                )}

                {activeShareId && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-emerald-400 inline-flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {t('analysis.shareReady')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          dir="ltr"
                          value={shareUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 bg-[#0B0E11] border border-slate-700 rounded-lg px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyShareUrl}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                        >
                          {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedLink ? t('analysis.shareCopied') : t('analysis.shareCopyLink')}
                        </button>
                      </div>
                    </div>

                    {/* Social Media & Quick Export Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                        {t('analysis.shareOnX')}
                      </a>
                      <a
                        href={`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                        {t('analysis.shareOnReddit')}
                      </a>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                        {t('analysis.shareOnWhatsApp')}
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyPgn}
                        className="px-3 py-2 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 ms-auto"
                      >
                        {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        {copiedPgn ? t('analysis.sharePgnCopied') : t('analysis.shareCopyPgn')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
