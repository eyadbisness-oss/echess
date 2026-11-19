import { Chess } from 'chess.js';
import type {
  AnalyzedMove,
  EngineEval,
  GameReviewReport,
  MoveClassification,
} from '../shared/chessTypes';
import { detectOpeningFromMoves, isBookPosition } from '../data/openings';

export type AnalysisStrength = 'fast' | 'normal' | 'deep' | 'maximum';

export const STRENGTH_DEPTHS: Record<AnalysisStrength, number> = {
  fast: 10,
  normal: 13,
  deep: 16,
  maximum: 19,
};

export type BotDifficulty =
  | 'beginner'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'expert'
  | 'master'
  | 'maximum';

export const BOT_PROFILES: Record<
  BotDifficulty,
  { name: string; rating: number; skill: number; depth: number; movetime: number; tagline: string }
> = {
  beginner: {
    name: 'Novice Kira',
    rating: 550,
    skill: 0,
    depth: 2,
    movetime: 120,
    tagline: 'Learns the ropes, prone to tactical slips',
  },
  easy: {
    name: 'Club Theo',
    rating: 950,
    skill: 3,
    depth: 4,
    movetime: 200,
    tagline: 'Solid fundamentals, overlooks two-move forks',
  },
  medium: {
    name: 'Tactician Maya',
    rating: 1350,
    skill: 7,
    depth: 6,
    movetime: 320,
    tagline: 'Balanced club contender who punishes blunders',
  },
  hard: {
    name: 'Strategist Viktor',
    rating: 1750,
    skill: 12,
    depth: 9,
    movetime: 500,
    tagline: 'Sharp middlegame planner with deep tactics',
  },
  expert: {
    name: 'Master Elena',
    rating: 2100,
    skill: 16,
    depth: 12,
    movetime: 700,
    tagline: 'FIDE Master strength with relentless endgame technique',
  },
  master: {
    name: 'GM Solaris',
    rating: 2500,
    skill: 19,
    depth: 15,
    movetime: 1000,
    tagline: 'Grandmaster calculation and positional precision',
  },
  maximum: {
    name: 'Stockfish 19 Max',
    rating: 3150,
    skill: 20,
    depth: 17,
    movetime: 1400,
    tagline: 'Unrestricted Stockfish 19 WASM engine strength',
  },
};

function convertUciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of uciMoves.slice(0, 8)) {
    if (!uci || uci.length < 4) break;
    try {
      const mv = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!mv) break;
      sans.push(mv.san);
    } catch {
      break;
    }
  }
  return sans;
}

export function evalToCpEquivalent(ev: EngineEval): number {
  if (ev.mate !== null) {
    return ev.mate > 0 ? 10000 - ev.mate * 10 : -10000 - ev.mate * 10;
  }
  return ev.cp;
}

export function cpToWinProbWhite(cp: number): number {
  const clamped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function formatEvalDisplay(ev: EngineEval | null): string {
  if (!ev) return '0.0';
  if (ev.mate !== null) {
    return ev.mate > 0 ? `M${ev.mate}` : `-M${Math.abs(ev.mate)}`;
  }
  const pawns = ev.cp / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function getMaterialBalanceWhite(fen: string): number {
  const pieceMap: Record<string, number> = {
    P: 1,
    N: 3,
    B: 3,
    R: 5,
    Q: 9,
    p: -1,
    n: -3,
    b: -3,
    r: -5,
    q: -9,
  };
  const board = fen.split(' ')[0];
  let sum = 0;
  for (const ch of board) {
    if (pieceMap[ch]) sum += pieceMap[ch];
  }
  return sum;
}

function getMoverMaterial(fen: string, color: 'w' | 'b'): number {
  return getMaterialBalanceWhite(fen) * (color === 'w' ? 1 : -1);
}

function isTrueMaterialSacrifice(
  fenBefore: string,
  fenAfter: string,
  moveInfo: { from: string; to: string; piece?: string; captured?: string; color: 'w' | 'b' },
  evalAfter: EngineEval
): boolean {
  const color = moveInfo.color;
  const matBefore = getMoverMaterial(fenBefore, color);
  const matAfterMove = getMoverMaterial(fenAfter, color);

  try {
    const afterChess = new Chess(fenAfter);
    const capturedOnMoveVal = moveInfo.captured ? PIECE_VALUES[moveInfo.captured] || 0 : 0;
    const movedPieceVal = PIECE_VALUES[moveInfo.piece || afterChess.get(moveInfo.to as never)?.type || ''] || 0;

    // 1. Check direct hanging or under-defended sacrifice on any piece >= minor (value >= 3)
    const oppMoves = afterChess.moves({ verbose: true });
    for (const oppCap of oppMoves) {
      if (!oppCap.captured) continue;
      const victimVal = PIECE_VALUES[oppCap.captured] || 0;
      if (victimVal < 3) continue; // Ignore simple pawn gambits

      const probe = new Chess(fenAfter);
      const capDone = probe.move(oppCap);
      if (!capDone) continue;

      const matAfterOppCap = getMoverMaterial(probe.fen(), color);
      // Immediate net loss if mover doesn't recapture
      const directDrop = matBefore - matAfterOppCap;

      // Check mover's best immediate recapture on oppCap.to
      const recaptures = probe.moves({ verbose: true }).filter((m) => m.to === oppCap.to && m.captured);
      if (recaptures.length === 0) {
        if (directDrop >= 2 && (oppCap.to === moveInfo.to || movedPieceVal >= 3 || capturedOnMoveVal < victimVal)) {
          return true;
        }
      } else {
        // Pick lowest-value recapturer
        recaptures.sort((a, b) => (PIECE_VALUES[a.piece] || 9) - (PIECE_VALUES[b.piece] || 9));
        const bestRecapProbe = new Chess(probe.fen());
        bestRecapProbe.move(recaptures[0]);
        const matAfterRecap = getMoverMaterial(bestRecapProbe.fen(), color);
        if (matBefore - matAfterRecap >= 2) {
          return true;
        }
      }
    }

    // 2. Check Stockfish PV line over the next 2-3 plies for accepted sacrifice
    if (evalAfter.pvUci && evalAfter.pvUci.length > 0) {
      const pvProbe = new Chess(fenAfter);
      let minMatSeen = matAfterMove;
      for (const uci of evalAfter.pvUci.slice(0, 3)) {
        if (!uci || uci.length < 4) break;
        try {
          const m = pvProbe.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length > 4 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          if (!m) break;
          const mVal = getMoverMaterial(pvProbe.fen(), color);
          if (pvProbe.turn() === color) {
            minMatSeen = Math.min(minMatSeen, mVal);
          }
        } catch {
          break;
        }
      }
      if (matBefore - minMatSeen >= 2 && movedPieceVal >= 3) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export interface ClassifyMoveInput {
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
  evalBefore: EngineEval;
  secondLine: EngineEval | null;
  evalAfter: EngineEval;
  plyIndex: number; // 0-based ply index
  openingName?: string;
}

export interface ClassifiedMoveOutcome {
  classification: MoveClassification;
  wpBefore: number;
  wpAfter: number;
  wpLoss: number;
  cpLoss: number;
  explanation: string;
}

export function classifyChessMove(input: ClassifyMoveInput): ClassifiedMoveOutcome {
  const { fenBefore, fenAfter, move, evalBefore, secondLine, evalAfter, plyIndex, openingName } = input;
  const color = move.color;

  const cpBeforeWhite = evalToCpEquivalent(evalBefore);
  const cpAfterWhite = evalToCpEquivalent(evalAfter);
  const wpBeforeWhite = cpToWinProbWhite(cpBeforeWhite);
  const wpAfterWhite = cpToWinProbWhite(cpAfterWhite);

  const wpBefore = color === 'w' ? wpBeforeWhite : 100 - wpBeforeWhite;
  const wpAfter = color === 'w' ? wpAfterWhite : 100 - wpAfterWhite;
  const wpLoss = Math.max(0, wpBefore - wpAfter);

  const cpBeforeMover = color === 'w' ? cpBeforeWhite : -cpBeforeWhite;
  const cpAfterMover = color === 'w' ? cpAfterWhite : -cpAfterWhite;
  const cpLoss = Math.max(0, cpBeforeMover - cpAfterMover);

  const moverMateBefore =
    evalBefore.mate !== null ? (color === 'w' ? evalBefore.mate : -evalBefore.mate) : null;
  const moverMateAfter =
    evalAfter.mate !== null ? (color === 'w' ? evalAfter.mate : -evalAfter.mate) : null;
  const secondMoverMate =
    secondLine && secondLine.mate !== null
      ? color === 'w'
        ? secondLine.mate
        : -secondLine.mate
      : null;

  const isTopMove = evalBefore.bestMoveUci === move.uci || wpLoss <= 0.8;
  const secondWp = secondLine
    ? color === 'w'
      ? cpToWinProbWhite(evalToCpEquivalent(secondLine))
      : 100 - cpToWinProbWhite(evalToCpEquivalent(secondLine))
    : wpBefore;
  const secondWpGap = secondLine ? Math.max(0, wpBefore - secondWp) : 0;

  let isCheck = false;
  let isCheckmate = false;
  try {
    const afterBoard = new Chess(fenAfter);
    isCheck = afterBoard.inCheck();
    isCheckmate = afterBoard.isCheckmate();
  } catch {
    // ignore
  }

  const isBook = plyIndex < 16 && isBookPosition(fenAfter) && wpLoss <= 3.5;
  const isSacrifice = !isBook && isTrueMaterialSacrifice(fenBefore, fenAfter, move, evalAfter);
  const findsUniqueMate =
    moverMateAfter !== null &&
    moverMateAfter > 0 &&
    (!secondLine || secondMoverMate === null || secondMoverMate <= 0);
  const isOnlyGoodMove =
    (isTopMove || wpLoss <= 1.4) &&
    ((secondWpGap >= 10.5 && wpAfter >= 40) || findsUniqueMate || (wpBefore <= 45 && wpAfter >= 58));

  const missedMate =
    moverMateBefore !== null &&
    moverMateBefore > 0 &&
    (moverMateAfter === null || moverMateAfter <= 0) &&
    wpLoss >= 8;
  const missedWinningTactic = wpBefore >= 74 && wpAfter <= 57 && wpLoss >= 12;
  const allowedMate =
    moverMateAfter !== null &&
    moverMateAfter < 0 &&
    (moverMateBefore === null || moverMateBefore >= 0);

  let classification: MoveClassification = 'good';
  if (isBook) {
    classification = 'book';
  } else if (
    isSacrifice &&
    (evalBefore.bestMoveUci === move.uci || wpLoss <= 2.2) &&
    wpAfter >= 46 &&
    (wpBefore < 91 || (moverMateAfter !== null && moverMateAfter > 0))
  ) {
    classification = 'brilliant';
  } else if (isOnlyGoodMove) {
    classification = 'great';
  } else if (isTopMove || wpLoss <= 0.9) {
    classification = 'best';
  } else if (wpLoss <= 2.8) {
    classification = 'excellent';
  } else if (wpLoss <= 6.5) {
    classification = 'good';
  } else if (missedMate || missedWinningTactic) {
    classification = 'missed_win';
  } else if (allowedMate) {
    classification = 'blunder';
  } else if (wpLoss <= 13.5) {
    classification = 'inaccuracy';
  } else if (wpLoss <= 24.0) {
    classification = 'mistake';
  } else {
    classification = 'blunder';
  }

  const beforeStr = formatEvalDisplay(evalBefore);
  const afterStr = formatEvalDisplay(evalAfter);
  const bestAlt = evalBefore.bestMoveSan || move.san;
  const pvPreview = evalBefore.pvSan && evalBefore.pvSan.length > 1 ? evalBefore.pvSan.slice(0, 3).join(' ') : '';

  let explanation = '';
  switch (classification) {
    case 'book':
      explanation = `${move.san} follows established opening theory${openingName ? ` (${openingName})` : ''}.`;
      break;
    case 'brilliant':
      explanation = `${move.san}!! is a brilliant sacrifice — giving up material for a decisive ${
        isCheckmate ? 'checkmate' : isCheck ? 'forcing attack' : 'tactical initiative'
      } (${afterStr}).`;
      break;
    case 'great':
      explanation = findsUniqueMate
        ? `${move.san}! finds the only forcing mate sequence (${afterStr}).`
        : `${move.san}! is the only strong move in a critical position, turning the evaluation to ${afterStr}.`;
      break;
    case 'best':
      explanation = isCheckmate
        ? `${move.san}# delivers checkmate — the strongest move on the board.`
        : `${move.san} is the top Stockfish choice (${afterStr}).`;
      break;
    case 'excellent':
      explanation = `${move.san} is an accurate continuation (${beforeStr} → ${afterStr}), nearly matching ${bestAlt}.`;
      break;
    case 'good':
      explanation = `${move.san} keeps things solid (${beforeStr} → ${afterStr}), though ${bestAlt} was slightly sharper.`;
      break;
    case 'inaccuracy':
      explanation = `${move.san}?! lets some pressure slip (${beforeStr} → ${afterStr}). ${bestAlt}${
        pvPreview ? ` (${pvPreview})` : ''
      } kept more control.`;
      break;
    case 'mistake':
      explanation = `${move.san}? gives away significant ground (${beforeStr} → ${afterStr}). ${bestAlt}${
        pvPreview ? ` (${pvPreview})` : ''
      } was much stronger.`;
      break;
    case 'missed_win':
      explanation = missedMate
        ? `${move.san} misses a forced checkmate! Playing ${bestAlt} won on the spot.`
        : `${move.san} misses a decisive winning chance (${beforeStr} → ${afterStr}). ${bestAlt} kept a winning advantage.`;
      break;
    case 'blunder':
      explanation = allowedMate
        ? `${move.san}?? walks into a forced checkmate (${afterStr}). ${bestAlt} was essential to defend.`
        : `${move.san}?? is a major blunder (${beforeStr} → ${afterStr}). ${bestAlt}${
            pvPreview ? ` (${pvPreview})` : ''
          } was critical.`;
      break;
  }

  return {
    classification,
    wpBefore: Number(wpBefore.toFixed(1)),
    wpAfter: Number(wpAfter.toFixed(1)),
    wpLoss: Number(wpLoss.toFixed(1)),
    cpLoss: Math.round(cpLoss),
    explanation,
  };
}

class StockfishEngineManager {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;
  private jobSeq = 0;
  private latestCancellableJobId = 0;
  private criticalJobsPending = 0;
  private currentRunningCancellable = false;
  private currentListeners: ((line: string) => void)[] = [];
  private mutex: Promise<void> = Promise.resolve();
  private activeAbortHandler: ((reason: string) => void) | null = null;
  private lastEngineActivityAt = 0;
  private searchesSinceRecycle = 0;
  private restartCount = 0;

  private isWasmFatalLine(line: string): boolean {
    if (!line) return false;
    const lower = line.toLowerCase();
    return (
      lower.includes('runtimeerror') ||
      lower.includes('out of memory') ||
      lower.includes('cannot enlarge memory') ||
      lower.includes('memory access out of bounds') ||
      lower.includes('abort(') ||
      lower.includes('unreachable executed')
    );
  }

  private resetWorker(reason?: string) {
    const abortHandler = this.activeAbortHandler;
    this.activeAbortHandler = null;

    if (this.worker) {
      try {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.onmessageerror = null;
        this.worker.terminate();
      } catch {
        // ignore termination error
      }
    }
    this.worker = null;
    this.readyPromise = null;
    this.isReady = false;
    this.currentRunningCancellable = false;
    this.currentListeners = [];

    if (abortHandler) {
      abortHandler(reason || 'worker reset');
    }
  }

  public async restartEngine(reason = 'manual restart'): Promise<boolean> {
    this.restartCount += 1;
    console.warn(`[Stockfish] Restarting WASM engine (#${this.restartCount}): ${reason}`);
    this.resetWorker(reason);
    this.searchesSinceRecycle = 0;
    try {
      await this.initWorker();
      return this.isReady;
    } catch {
      return false;
    }
  }

  public getEngineStats(): {
    isReady: boolean;
    restartCount: number;
    searchesSinceRecycle: number;
    lastActivityAt: number;
  } {
    return {
      isReady: this.isReady,
      restartCount: this.restartCount,
      searchesSinceRecycle: this.searchesSinceRecycle,
      lastActivityAt: this.lastEngineActivityAt,
    };
  }

  private initWorker(): Promise<void> {
    if (this.readyPromise && this.isReady && this.worker) return this.readyPromise;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker('/stockfish/stockfish-19-lite-single.js');
        this.worker = worker;
        this.lastEngineActivityAt = Date.now();

        let uciOk = false;
        let settled = false;
        const bootTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            this.resetWorker('boot timeout');
            reject(new Error('Stockfish worker boot timeout'));
          }
        }, 12000);

        const onBootLine = (e: MessageEvent<string>) => {
          const line = String(e.data || '').trim();
          this.lastEngineActivityAt = Date.now();

          if (this.isWasmFatalLine(line)) {
            console.error('[Stockfish] WASM fatal error line:', line);
            if (!settled) {
              settled = true;
              clearTimeout(bootTimer);
              this.resetWorker(`wasm fatal: ${line}`);
              reject(new Error('Stockfish WASM fatal error'));
            } else {
              this.resetWorker(`wasm fatal: ${line}`);
            }
            return;
          }

          if (line === 'uciok') {
            uciOk = true;
            // Use 16 MB hash to avoid Emscripten WASM heap pressure on mobile/long reviews
            worker.postMessage('setoption name Hash value 16');
            worker.postMessage('isready');
          } else if (line === 'readyok' && uciOk && !settled) {
            settled = true;
            clearTimeout(bootTimer);
            this.isReady = true;
            resolve();
          }
          // Copy array to avoid mutation issues while iterating
          for (const listener of [...this.currentListeners]) {
            listener(line);
          }
        };

        worker.onmessage = onBootLine;
        worker.onmessageerror = (err) => {
          console.error('[Stockfish] Worker messageerror:', err);
          if (!settled) {
            settled = true;
            clearTimeout(bootTimer);
            this.resetWorker('worker messageerror');
            reject(new Error('Stockfish worker messageerror'));
          } else {
            this.resetWorker('worker messageerror');
          }
        };
        worker.onerror = (err) => {
          console.error('[Stockfish] Worker Error:', err);
          if (!settled) {
            settled = true;
            clearTimeout(bootTimer);
            this.resetWorker('worker error');
            reject(new Error('Failed to load Stockfish WASM worker'));
          } else {
            this.resetWorker('worker runtime error');
          }
        };
        worker.postMessage('uci');
      } catch (err) {
        this.resetWorker('worker init exception');
        reject(err);
      }
    });

    return this.readyPromise;
  }

  private flushWorkerBarrier(worker: Worker): Promise<boolean> {
    if (!this.worker || this.worker !== worker) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (this.activeAbortHandler === onAbort) {
          this.activeAbortHandler = null;
        }
        this.currentListeners = this.currentListeners.filter((l) => l !== onReady);
        resolve(ok);
      };
      const onAbort = () => finish(false);
      const timer = setTimeout(() => finish(false), 2000);
      const onReady = (line: string) => {
        if (line === 'readyok') finish(true);
      };
      this.activeAbortHandler = onAbort;
      this.currentListeners.push(onReady);
      try {
        worker.postMessage('stop');
        worker.postMessage('isready');
      } catch {
        finish(false);
      }
    });
  }

  public async clearHash(): Promise<void> {
    if (!this.worker || !this.isReady) return;
    try {
      this.worker.postMessage('setoption name Clear Hash');
      this.worker.postMessage('isready');
    } catch {
      // ignore if worker is resetting
    }
  }

  public async checkReady(): Promise<boolean> {
    try {
      await this.initWorker();
      return this.isReady;
    } catch {
      return false;
    }
  }

  public stopSearch() {
    this.latestCancellableJobId = ++this.jobSeq;
    if (this.worker && this.isReady && this.currentRunningCancellable) {
      try {
        this.worker.postMessage('stop');
      } catch {
        // ignore if worker already terminated
      }
    }
  }

  public async analyzePosition(
    fen: string,
    options: {
      depth: number;
      multiPv?: number;
      skillLevel?: number;
      movetime?: number;
      cancellable?: boolean;
      onUpdate?: (lines: EngineEval[]) => void;
    }
  ): Promise<EngineEval[]> {
    const isCancellable = options.cancellable !== false;

    // Never let background/UI eval preempt an active or queued critical bot-move calculation
    if (isCancellable && this.criticalJobsPending > 0) {
      return [];
    }

    const myJobId = ++this.jobSeq;
    if (isCancellable) {
      this.latestCancellableJobId = myJobId;
    } else {
      this.criticalJobsPending++;
      // Invalidate older queued cancellable searches so the critical bot move runs next
      this.latestCancellableJobId = myJobId;
    }

    // Wake up the mutex immediately if a cancellable background search is currently occupying the worker
    if (this.worker && this.isReady && this.currentRunningCancellable) {
      try {
        this.worker.postMessage('stop');
      } catch {
        // ignore
      }
    }

    const runAttempt = async (allowRetry: boolean): Promise<EngineEval[]> => {
      if (isCancellable && (myJobId !== this.latestCancellableJobId || this.criticalJobsPending > 0)) {
        return [];
      }

      const chess = new Chess(fen);
      if (chess.isGameOver()) {
        const mateEval: EngineEval = {
          cp: chess.isCheckmate() ? (chess.turn() === 'w' ? -10000 : 10000) : 0,
          mate: chess.isCheckmate() ? 0 : null,
          depth: 0,
          bestMoveUci: '',
          bestMoveSan: '',
          pvSan: [],
          pvUci: [],
          multipvIndex: 1,
        };
        options.onUpdate?.([mateEval]);
        return [mateEval];
      }

      // Proactive worker memory recycle after heavy cumulative search counts
      if (this.searchesSinceRecycle >= 120 && this.worker) {
        this.resetWorker('periodic memory recycle');
        this.searchesSinceRecycle = 0;
      }

      try {
        await this.initWorker();
      } catch {
        if (allowRetry) {
          const restarted = await this.restartEngine('worker boot retry');
          if (restarted) return runAttempt(false);
        }
        return [];
      }

      const worker = this.worker;
      if (!worker) {
        if (allowRetry) {
          const restarted = await this.restartEngine('missing worker instance');
          if (restarted) return runAttempt(false);
        }
        return [];
      }
      if (isCancellable && myJobId !== this.latestCancellableJobId) return [];

      // Wait for UCI readyok barrier so stale bestmove messages from prior searches are flushed
      const barrierOk = await this.flushWorkerBarrier(worker);
      if (isCancellable && myJobId !== this.latestCancellableJobId) return [];
      if (!barrierOk || !this.worker || this.worker !== worker) {
        if (allowRetry) {
          const restarted = await this.restartEngine('readyok barrier stalled');
          if (restarted) return runAttempt(false);
        }
        return [];
      }

      const multiPv = Math.max(1, Math.min(5, options.multiPv ?? 3));
      const skill = options.skillLevel ?? 20;
      const turn = chess.turn();
      const linesMap = new Map<number, EngineEval>();
      const boundFallbackMap = new Map<number, EngineEval>();

      this.currentRunningCancellable = isCancellable;
      this.searchesSinceRecycle += 1;

      const attemptOutcome = await new Promise<{
        lines: EngineEval[];
        stalled: boolean;
        stallReason?: string;
      }>((resolve) => {
        let settled = false;
        let stopIssuedAt: number | null = null;
        let lastSearchActivity = Date.now();
        const stallThresholdMs = options.movetime
          ? Math.max(5000, options.movetime + 3000)
          : 8000;
        const hardTimeoutMs = options.movetime ? options.movetime + 5500 : 24000;

        const finish = (stalled = false, stallReason?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(hardTimer);
          clearInterval(watchdogInterval);
          if (this.activeAbortHandler === onAbort) {
            this.activeAbortHandler = null;
          }
          this.currentRunningCancellable = false;
          this.currentListeners = this.currentListeners.filter((l) => l !== listener);
          const merged = new Map(linesMap);
          for (const [idx, fallbackEval] of boundFallbackMap.entries()) {
            if (!merged.has(idx)) {
              merged.set(idx, fallbackEval);
            }
          }
          const sorted = Array.from(merged.values()).sort(
            (a, b) => a.multipvIndex - b.multipvIndex
          );
          resolve({ lines: sorted, stalled, stallReason });
        };

        const onAbort = (reason: string) => {
          finish(true, reason);
        };
        this.activeAbortHandler = onAbort;

        const hardTimer = setTimeout(() => {
          const hadNoOutput = linesMap.size === 0 && boundFallbackMap.size === 0;
          if (this.worker === worker) {
            try {
              worker.postMessage('stop');
            } catch {
              // ignore
            }
          }
          finish(hadNoOutput, hadNoOutput ? 'hard timeout with no output' : undefined);
        }, hardTimeoutMs);

        const watchdogInterval = setInterval(() => {
          if (settled) return;
          const now = Date.now();
          const idleMs = now - lastSearchActivity;
          const noLinesYet = linesMap.size === 0 && boundFallbackMap.size === 0;

          // If WASM worker stopped emitting any info/bestmove lines or failed to stop in time
          if (noLinesYet && idleMs >= stallThresholdMs) {
            finish(true, `inactivity stall (${idleMs}ms without output)`);
            return;
          }
          if (stopIssuedAt !== null && now - stopIssuedAt >= 2500) {
            finish(noLinesYet, noLinesYet ? 'stop command unresponsive' : undefined);
            return;
          }
          if (!noLinesYet && idleMs >= 11000) {
            // Engine produced lines earlier but hung mid-iteration
            if (this.worker === worker) {
              stopIssuedAt = now;
              try {
                worker.postMessage('stop');
              } catch {
                finish(false);
              }
            } else {
              finish(true, 'worker disconnected mid-search');
            }
          }
        }, 1000);

        const listener = (line: string) => {
          lastSearchActivity = Date.now();

          if (isCancellable && myJobId !== this.latestCancellableJobId) {
            if (!stopIssuedAt && this.worker === worker) {
              stopIssuedAt = Date.now();
              try {
                worker.postMessage('stop');
              } catch {
                finish(false);
              }
            }
            if (line.startsWith('bestmove')) {
              finish(false);
            }
            return;
          }

          if (line.startsWith('info') && line.includes(' pv ')) {
            const depthMatch = line.match(/\bdepth\s+(\d+)/);
            const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
            const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
            const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
            const nodesMatch = line.match(/\bnodes\s+(\d+)/);
            const npsMatch = line.match(/\bnps\s+(\d+)/);
            const pvMatch = line.match(/\bpv\s+(.+)$/);

            if (!pvMatch) return;
            const depth = depthMatch ? Number(depthMatch[1]) : 1;
            const multipvIndex = multipvMatch ? Number(multipvMatch[1]) : 1;
            const pvUci = pvMatch[1].trim().split(/\s+/);
            if (depth <= 0 || pvUci.length === 0) return;
            const isBoundScore = /\b(upperbound|lowerbound)\b/.test(line);
            const rawCp = cpMatch ? Number(cpMatch[1]) : 0;
            const rawMate = mateMatch ? Number(mateMatch[1]) : null;

            const cpWhite = turn === 'b' ? -rawCp : rawCp;
            const mateWhite = rawMate !== null ? (turn === 'b' ? -rawMate : rawMate) : null;

            const pvSan = convertUciLineToSan(fen, pvUci);
            const evalObj: EngineEval = {
              cp: cpWhite,
              mate: mateWhite,
              depth,
              bestMoveUci: pvUci[0] || '',
              bestMoveSan: pvSan[0] || pvUci[0] || '',
              pvSan,
              pvUci,
              multipvIndex,
              nodes: nodesMatch ? Number(nodesMatch[1]) : undefined,
              nps: npsMatch ? Number(npsMatch[1]) : undefined,
            };

            if (isBoundScore) {
              const prevFallback = boundFallbackMap.get(multipvIndex);
              if (!prevFallback || depth >= prevFallback.depth) {
                boundFallbackMap.set(multipvIndex, evalObj);
              }
              return;
            }

            linesMap.set(multipvIndex, evalObj);
            if (!isCancellable || myJobId === this.latestCancellableJobId) {
              const snapshot = Array.from(linesMap.values()).sort(
                (a, b) => a.multipvIndex - b.multipvIndex
              );
              options.onUpdate?.(snapshot);
            }
          } else if (line.startsWith('bestmove')) {
            // Capture fallback bestmove from the bestmove line itself if info pv was skipped (e.g. single legal move)
            const bmMatch = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (bmMatch && linesMap.size === 0) {
              const uci = bmMatch[1];
              const pvSan = convertUciLineToSan(fen, [uci]);
              linesMap.set(1, {
                cp: 0,
                mate: null,
                depth: 1,
                bestMoveUci: uci,
                bestMoveSan: pvSan[0] || uci,
                pvSan,
                pvUci: [uci],
                multipvIndex: 1,
              });
            }
            finish(false);
          }
        };

        this.currentListeners.push(listener);
        try {
          worker.postMessage(`setoption name MultiPV value ${multiPv}`);
          worker.postMessage(`setoption name Skill Level value ${skill}`);
          worker.postMessage(`position fen ${fen}`);
          if (options.movetime) {
            worker.postMessage(`go depth ${options.depth} movetime ${options.movetime}`);
          } else {
            worker.postMessage(`go depth ${options.depth}`);
          }
        } catch {
          finish(true, 'postMessage failed');
        }
      });

      if (attemptOutcome.stalled) {
        const wasCancelled = isCancellable && myJobId !== this.latestCancellableJobId;
        if (!wasCancelled && allowRetry) {
          const restarted = await this.restartEngine(
            attemptOutcome.stallReason || 'engine stalled during search'
          );
          if (restarted) {
            return runAttempt(false);
          }
        } else if (!wasCancelled) {
          // Ensure stalled worker isn't left broken for subsequent jobs
          this.resetWorker(attemptOutcome.stallReason || 'final attempt stalled');
        }
      }

      return attemptOutcome.lines;
    };

    const nextPromise = this.mutex.then(() => runAttempt(true), () => runAttempt(true)).finally(() => {
      if (!isCancellable) {
        this.criticalJobsPending = Math.max(0, this.criticalJobsPending - 1);
      }
    });
    this.mutex = nextPromise.then(
      () => {},
      () => {}
    );
    return nextPromise;
  }

  public async getBestBotMove(fen: string, difficulty: BotDifficulty): Promise<string | null> {
    const profile = BOT_PROFILES[difficulty];
    let lines = await this.analyzePosition(fen, {
      depth: profile.depth,
      multiPv: difficulty === 'beginner' ? 3 : 1,
      skillLevel: profile.skill,
      movetime: profile.movetime,
      cancellable: false,
    });
    if (lines.length === 0) {
      const probe = new Chess(fen);
      if (!probe.isGameOver()) {
        await this.restartEngine('empty bot move recovery');
        lines = await this.analyzePosition(fen, {
          depth: Math.max(2, Math.min(8, profile.depth)),
          multiPv: 1,
          skillLevel: profile.skill,
          movetime: Math.max(400, profile.movetime),
          cancellable: false,
        });
      }
    }
    if (lines.length === 0) return null;
    // For beginner, occasionally pick 2nd line so it feels genuinely novice
    if (difficulty === 'beginner' && lines.length > 1 && Math.random() < 0.35) {
      return lines[1].bestMoveUci || lines[0].bestMoveUci;
    }
    return lines[0].bestMoveUci || null;
  }

  public async analyzeFullGame(
    pgnOrMoves: string | string[],
    strength: AnalysisStrength,
    onProgress?: (
      current: number,
      total: number,
      detail?: { subDepth: number; targetDepth: number }
    ) => void,
    options?: {
      onPartialReport?: (report: GameReviewReport) => void;
      isCancelled?: () => boolean;
    }
  ): Promise<GameReviewReport> {
    const loader = new Chess();
    if (Array.isArray(pgnOrMoves)) {
      for (const m of pgnOrMoves) {
        loader.move(m);
      }
    } else {
      loader.loadPgn(pgnOrMoves);
    }

    const history = loader.history({ verbose: true });
    const replay = new Chess();
    const analyzedMoves: AnalyzedMove[] = [];
    const sanList = history.map((h) => h.san);
    const opening = detectOpeningFromMoves(sanList);

    const emptyCounts = (): Record<MoveClassification, number> => ({
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      missed_win: 0,
    });

    const whiteCounts = emptyCounts();
    const blackCounts = emptyCounts();

    const computeAccuracy = (moves: AnalyzedMove[]): number => {
      if (moves.length === 0) return 100;
      const scores = moves.map((m) => {
        const loss = Math.max(0, m.winProbBefore - m.winProbAfter);
        return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
      });
      return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
    };

    const slicePhase = (moves: AnalyzedMove[], startPly: number, endPly: number) => {
      const sub = moves.filter((m) => m.ply >= startPly && m.ply <= endPly);
      return sub.length > 0 ? computeAccuracy(sub) : computeAccuracy(moves);
    };

    const buildReportSnapshot = (): GameReviewReport => {
      const whiteMoves = analyzedMoves.filter((m) => m.color === 'w');
      const blackMoves = analyzedMoves.filter((m) => m.color === 'b');
      const totalPlies = analyzedMoves.length;
      const openingEnd = Math.min(20, Math.ceil(totalPlies * 0.3));
      const midEnd = Math.max(openingEnd, Math.ceil(totalPlies * 0.72));

      return {
        moves: [...analyzedMoves],
        whiteAccuracy: computeAccuracy(whiteMoves),
        blackAccuracy: computeAccuracy(blackMoves),
        whiteCounts: { ...whiteCounts },
        blackCounts: { ...blackCounts },
        phases: {
          opening: {
            white: slicePhase(whiteMoves, 1, openingEnd),
            black: slicePhase(blackMoves, 1, openingEnd),
          },
          middlegame: {
            white: slicePhase(whiteMoves, openingEnd + 1, midEnd),
            black: slicePhase(blackMoves, openingEnd + 1, midEnd),
          },
          endgame: {
            white: slicePhase(whiteMoves, midEnd + 1, totalPlies + 1),
            black: slicePhase(blackMoves, midEnd + 1, totalPlies + 1),
          },
        },
        openingName: opening.name,
        eco: opening.eco,
      };
    };

    let prevLines: EngineEval[] | null = null;
    const evalDepth =
      strength === 'fast' ? 10 : strength === 'normal' ? 12 : strength === 'deep' ? 14 : 16;
    const evalMovetime =
      strength === 'fast' ? 900 : strength === 'normal' ? 1800 : strength === 'deep' ? 3200 : 5500;

    // Clear hash before starting a full-game analysis to keep memory & evals deterministic
    await this.clearHash();

    for (let i = 0; i < history.length; i++) {
      if (options?.isCancelled?.()) break;

      // Periodic hash clear every 24 plies during long games to prevent WASM memory pressure
      if (i > 0 && i % 24 === 0) {
        await this.clearHash();
      }

      onProgress?.(i + 1, history.length, { subDepth: 0, targetDepth: evalDepth });
      const move = history[i];
      const fenBefore = replay.fen();
      const color = move.color;
      const uci = `${move.from}${move.to}${move.promotion || ''}`;

      if (!prevLines || prevLines.length === 0) {
        prevLines = await this.analyzePosition(fenBefore, {
          depth: evalDepth,
          multiPv: 2,
          skillLevel: 20,
          movetime: evalMovetime,
          cancellable: false,
          onUpdate: (lines) => {
            onProgress?.(i + 1, history.length, {
              subDepth: lines[0]?.depth || 0,
              targetDepth: evalDepth,
            });
          },
        });
      }

      if (options?.isCancelled?.()) break;

      const evalBefore = prevLines[0] || {
        cp: 0,
        mate: null,
        depth: evalDepth,
        bestMoveUci: uci,
        bestMoveSan: move.san,
        pvSan: [move.san],
        pvUci: [uci],
        multipvIndex: 1,
      };
      const secondLine = prevLines[1] || null;

      replay.move(move.san);
      const fenAfter = replay.fen();

      let nextLines: EngineEval[] = [];
      if (replay.isCheckmate()) {
        nextLines = [
          {
            cp: color === 'w' ? 10000 : -10000,
            mate: color === 'w' ? 0 : -0,
            depth: evalDepth,
            bestMoveUci: '',
            bestMoveSan: '',
            pvSan: [],
            pvUci: [],
            multipvIndex: 1,
          },
        ];
      } else if (replay.isDraw()) {
        nextLines = [
          {
            cp: 0,
            mate: null,
            depth: evalDepth,
            bestMoveUci: '',
            bestMoveSan: '',
            pvSan: [],
            pvUci: [],
            multipvIndex: 1,
          },
        ];
      } else {
        nextLines = await this.analyzePosition(fenAfter, {
          depth: evalDepth,
          multiPv: 2,
          skillLevel: 20,
          movetime: evalMovetime,
          cancellable: false,
          onUpdate: (lines) => {
            onProgress?.(i + 1, history.length, {
              subDepth: lines[0]?.depth || 0,
              targetDepth: evalDepth,
            });
          },
        });

        // If the engine returned nothing on a legal position, trigger restart recovery once
        if (nextLines.length === 0 && !options?.isCancelled?.()) {
          await this.restartEngine(`empty eval at ply ${i + 1}`);
          nextLines = await this.analyzePosition(fenAfter, {
            depth: evalDepth,
            multiPv: 2,
            skillLevel: 20,
            movetime: evalMovetime,
            cancellable: false,
            onUpdate: (lines) => {
              onProgress?.(i + 1, history.length, {
                subDepth: lines[0]?.depth || 0,
                targetDepth: evalDepth,
              });
            },
          });
        }
      }

      if (options?.isCancelled?.()) break;

      const evalAfter = nextLines[0] || evalBefore;
      prevLines = nextLines;

      const classified = classifyChessMove({
        fenBefore,
        fenAfter,
        move: {
          from: move.from,
          to: move.to,
          san: move.san,
          uci,
          color,
          piece: move.piece,
          captured: move.captured,
        },
        evalBefore,
        secondLine,
        evalAfter,
        plyIndex: i,
        openingName: opening.name,
      });

      if (color === 'w') whiteCounts[classified.classification]++;
      else blackCounts[classified.classification]++;

      const bestAlt = evalBefore.bestMoveSan || move.san;

      analyzedMoves.push({
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        color,
        san: move.san,
        uci,
        from: move.from,
        to: move.to,
        fenBefore,
        fenAfter,
        evalBefore,
        evalAfter,
        bestAlternativeSan: bestAlt,
        bestAlternativeUci: evalBefore.bestMoveUci || uci,
        classification: classified.classification,
        winProbBefore: classified.wpBefore,
        winProbAfter: classified.wpAfter,
        cpLoss: classified.cpLoss,
        explanation: classified.explanation,
      });

      options?.onPartialReport?.(buildReportSnapshot());
    }

    return buildReportSnapshot();
  }
}

export const stockfishService = new StockfishEngineManager();
