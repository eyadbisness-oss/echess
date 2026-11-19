import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { BookOpen, FlipVertical, RotateCcw, Undo2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { ChessBoard, EvaluationBar } from '../components/ChessBoard';
import { detectOpeningFromMoves, getOpeningContinuations } from '../data/openings';
import { formatEvalDisplay, stockfishService } from '../engine/stockfishService';
import type { EngineEval } from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';

export function OpeningsView() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [chess, setChess] = useState(() => new Chess());
  const [fen, setFen] = useState(new Chess().fen());
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [engineEval, setEngineEval] = useState<EngineEval | null>(null);

  const history = useMemo(() => chess.history(), [fen]);
  const openingInfo = useMemo(() => detectOpeningFromMoves(history), [history]);
  const continuations = useMemo(() => getOpeningContinuations(fen), [fen]);

  useEffect(() => {
    let active = true;
    stockfishService.analyzePosition(fen, {
      depth: 12,
      multiPv: 1,
      onUpdate: (lines) => {
        if (active && lines[0]) setEngineEval(lines[0]);
      },
    });
    return () => {
      active = false;
    };
  }, [fen]);

  const playSanOrCoords = (mv: string | { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    try {
      const result = chess.move(mv);
      if (!result) return false;
      setLastMove({ from: result.from, to: result.to });
      setFen(chess.fen());
      soundEngine.playForChessMove(chess, result);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-6 flex flex-col items-center space-y-3">
        <div className="flex items-stretch justify-center gap-2.5 w-full max-w-[560px]">
          <EvaluationBar evaluation={engineEval} orientation={orientation} />
          <ChessBoard
            fen={fen}
            orientation={orientation}
            interactive={true}
            allowBothSides={true}
            boardThemeId={profile?.boardTheme}
            pieceStyle={profile?.pieceStyle}
            showCoordinates={profile?.showCoordinates ?? true}
            autoQueen={profile?.autoQueen ?? false}
            lastMove={lastMove}
            onMove={(mv) => playSanOrCoords(mv)}
          />
        </div>

        <div className="w-full max-w-[540px] flex items-center justify-between gap-2 bg-[#12171E] border border-slate-800 rounded-xl p-2">
          <button
            type="button"
            onClick={() => {
              chess.undo();
              setFen(chess.fen());
              setLastMove(null);
            }}
            disabled={history.length === 0}
            className="px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-xs text-slate-200 inline-flex items-center gap-1.5"
          >
            <Undo2 className="w-4 h-4" />
            {t('openings.stepBack')}
          </button>
          <button
            type="button"
            onClick={() => {
              const fresh = new Chess();
              setChess(fresh);
              setFen(fresh.fen());
              setLastMove(null);
            }}
            className="px-3 py-2 rounded-lg hover:bg-slate-800 text-xs text-slate-200 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            {t('openings.resetStart')}
          </button>
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
            className="px-3 py-2 rounded-lg hover:bg-slate-800 text-xs text-slate-200 inline-flex items-center gap-1.5"
          >
            <FlipVertical className="w-4 h-4" />
            {t('common.flip')}
          </button>
        </div>
      </div>

      <div className="lg:col-span-6 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
              <BookOpen className="w-4 h-4" />
              <span>ECO {openingInfo.eco}</span>
            </div>
            <h1 className="font-display text-xl font-bold text-slate-100">{openingInfo.name}</h1>
            <p className="text-xs text-slate-300 leading-relaxed">{openingInfo.plan}</p>
          </div>
          <div className="text-end shrink-0">
            <p className="text-[11px] text-slate-400">{t('openings.stockfishEval')}</p>
            <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
              {formatEvalDisplay(engineEval)}
            </p>
          </div>
        </div>

        {/* Current Line */}
        <div dir="ltr" className="bg-[#0B0E11] border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 min-h-[42px]">
          {history.length === 0
            ? t('openings.emptyLine')
            : history.map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}.${m} ` : `${m} `)).join('')}
        </div>

        {/* Book Continuations */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-300">{t('openings.bookContinuations')}</h2>
          {continuations.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              {t('openings.endOfBranch')}
            </p>
          ) : (
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-[#0B0E11]">
              {continuations.map((cont) => (
                <button
                  key={cont.san}
                  type="button"
                  onClick={() => playSanOrCoords(cont.san)}
                  className="w-full px-3.5 py-2.5 hover:bg-[#171E28] flex items-center justify-between gap-3 text-start transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-bold text-slate-100 me-2">{cont.san}</span>
                    <span className="text-xs text-slate-400 truncate">{cont.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {t('openings.gamesCount', { count: (cont.games / 1000).toFixed(0) })}
                    </span>
                    <div className="w-24 h-2 rounded-full overflow-hidden flex bg-slate-800">
                      <div style={{ width: `${cont.whiteWinPct}%` }} className="bg-slate-100" />
                      <div style={{ width: `${cont.drawPct}%` }} className="bg-slate-500" />
                      <div style={{ width: `${cont.blackWinPct}%` }} className="bg-slate-900" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
