import {
  BarChart3,
  Clock,
  Cpu,
  Crown,
  Flag,
  Play,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useComputerGame } from '../contexts/ComputerGameContext';
import { ChessBoard, EvaluationBar, type BoardArrow } from '../components/ChessBoard';
import { MoveTimerDisplay } from '../components/MoveTimerDisplay';
import { BOT_PROFILES, type BotDifficulty } from '../engine/stockfishService';
import type { ChessGameRecord } from '../shared/chessTypes';
import { readStoredWarningColor } from '../utils/timerWarning';

export function PlayComputerView({
  onOpenReview,
}: {
  onOpenReview: (pgn: string, meta?: Partial<ChessGameRecord>) => void;
}) {
  const { profile, isOwner, ownerCheatMode } = useAuth();
  const { t } = useLocale();
  const {
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
    turn,
    canUndo,
    canRedo,
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
  } = useComputerGame();

  const bot = BOT_PROFILES[difficulty];
  const cheatActive = isOwner && ownerCheatMode;
  const showEvalAndArrows = practiceMode || cheatActive;
  const warningColor = readStoredWarningColor(profile?.lowTimeWarningColor);
  const topTimeMs = playerSide === 'w' ? blackMs : whiteMs;
  const bottomTimeMs = playerSide === 'w' ? whiteMs : blackMs;
  const totalClockMs = timeControlMin > 0 ? timeControlMin * 60_000 : 600_000;

  const hintArrows: BoardArrow[] =
    showEvalAndArrows && liveEval?.bestMoveUci && liveEval.bestMoveUci.length >= 4 && turn === playerSide
      ? [{ from: liveEval.bestMoveUci.slice(0, 2), to: liveEval.bestMoveUci.slice(2, 4), color: '#10B981' }]
      : [];

  return (
    <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Board Area */}
      <div className="lg:col-span-7 flex flex-col items-center space-y-3">
        <div className="w-full max-w-[560px] flex items-center justify-between gap-3 bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">
              {bot.name} <span className="font-mono text-xs text-emerald-400">({bot.rating})</span>
            </p>
            <p className="text-xs text-slate-400 truncate">
              {botThinking ? t('computer.calculating') : bot.tagline}
            </p>
          </div>
          {timeControlMin > 0 ? (
            <MoveTimerDisplay
              timeLeftMs={topTimeMs}
              totalTimeMs={totalClockMs}
              isActive={gameStarted && !gameOverInfo && turn !== playerSide}
              isGameFinished={Boolean(gameOverInfo)}
              warningColor={warningColor}
              label={`${bot.name} clock`}
            />
          ) : (
            <span className="px-2.5 py-1.5 rounded-lg bg-[#0B0E11] border border-slate-800 font-mono text-xs text-slate-400 inline-flex items-center gap-1.5 shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              ∞
            </span>
          )}
        </div>

        <div className="flex items-stretch justify-center gap-2.5 w-full max-w-[580px]">
          {showEvalAndArrows && <EvaluationBar evaluation={liveEval} orientation={playerSide} />}
          <ChessBoard
            fen={fen}
            orientation={playerSide}
            interactive={gameStarted && !gameOverInfo}
            allowedColor={playerSide}
            boardThemeId={profile?.boardTheme}
            pieceStyle={profile?.pieceStyle}
            showCoordinates={profile?.showCoordinates ?? true}
            autoQueen={profile?.autoQueen ?? false}
            lastMove={lastMove}
            arrows={hintArrows}
            onMove={handlePlayerMove}
          />
        </div>

        <div className="w-full max-w-[560px] flex items-center justify-between gap-3 bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">
              {profile?.displayName || t('common.you')}{' '}
              <span className="font-mono text-xs text-slate-400">
                ({profile?.ratings?.rapid ?? 1200})
              </span>
            </p>
            <p className="text-xs text-slate-400">
              {gameStarted ? (turn === playerSide ? t('computer.yourTurn') : t('computer.botTurn')) : t('computer.configureMatch')}
            </p>
          </div>
          {timeControlMin > 0 ? (
            <MoveTimerDisplay
              timeLeftMs={bottomTimeMs}
              totalTimeMs={totalClockMs}
              isActive={gameStarted && !gameOverInfo && turn === playerSide}
              isGameFinished={Boolean(gameOverInfo)}
              warningColor={warningColor}
              label="Your move clock"
            />
          ) : (
            <span className="px-2.5 py-1.5 rounded-lg bg-[#0B0E11] border border-slate-800 font-mono text-xs text-slate-400 inline-flex items-center gap-1.5 shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              ∞
            </span>
          )}
        </div>
      </div>

      {/* Setup & Controls */}
      <div className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <h1 className="font-display text-lg font-bold text-slate-100">{t('computer.title')}</h1>
              <p className="text-xs text-slate-400">{t('computer.subtitle')}</p>
            </div>
          </div>
        </div>

        {!gameStarted || gameOverInfo ? (
          <div key="computer-setup-menu" className="animate-menu-view space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">{t('computer.personality')}</label>
              <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                {(Object.keys(BOT_PROFILES) as BotDifficulty[]).map((key) => {
                  const b = BOT_PROFILES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDifficulty(key)}
                      className={`p-2.5 rounded-lg border text-start flex items-center justify-between transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] ${
                        difficulty === key
                          ? 'bg-emerald-950/50 border-emerald-500 text-white'
                          : 'bg-[#0B0E11] border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-[#10151C]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{b.name}</p>
                        <p className="text-xs text-slate-400">{b.tagline}</p>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        {b.rating}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('computer.playAs')}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['w', 'b', 'random'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => {
                        if (side !== 'random') setPlayerSide(side);
                        else setPlayerSide(Math.random() < 0.5 ? 'w' : 'b');
                      }}
                      className={`py-2 rounded-lg text-xs font-medium border ${
                        playerSide === side
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-[#0B0E11] border-slate-800 text-slate-300'
                      }`}
                    >
                      {side === 'w' ? t('common.white') : side === 'b' ? t('common.black') : t('computer.randShort')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('computer.clock')}</label>
                <select
                  value={timeControlMin}
                  onChange={(e) => setTimeControlMin(Number(e.target.value))}
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value={0}>{t('computer.unlimited')}</option>
                  <option value={1}>{t('computer.minutes', { count: 1 })}</option>
                  <option value={3}>{t('computer.minutes', { count: 3 })}</option>
                  <option value={5}>{t('computer.minutes', { count: 5 })}</option>
                  <option value={10}>{t('computer.minutes', { count: 10 })}</option>
                  <option value={15}>{t('computer.minutes', { count: 15 })}</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-lg p-3 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-100">{t('computer.practiceMode')}</p>
                <p className="text-[11px] text-slate-400">{t('computer.practiceDesc')}</p>
              </div>
              <input
                type="checkbox"
                checked={practiceMode}
                onChange={(e) => setPracticeMode(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>

            {gameOverInfo && (
              <div className="bg-[#0F141B] border border-emerald-700/50 rounded-xl p-4 space-y-2.5">
                <p className="font-display text-base font-bold text-white">
                  {gameOverInfo.result === '1-0'
                    ? t('computer.whiteWins')
                    : gameOverInfo.result === '0-1'
                    ? t('computer.blackWins')
                    : t('common.draw')}{' '}
                  ({gameOverInfo.termination})
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onOpenReview(pgn, {
                      whiteName: playerSide === 'w' ? profile?.displayName || t('common.you') : bot.name,
                      blackName: playerSide === 'b' ? profile?.displayName || t('common.you') : bot.name,
                      result: gameOverInfo.result,
                      timeControl: timeControlMin > 0 ? `${timeControlMin}+0` : 'Unlimited',
                    })
                  }
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <BarChart3 className="w-4 h-4" />
                  {t('computer.analyzeFullReview')}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => startNewGame()}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              {gameOverInfo ? t('computer.playRematch') : t('computer.startMatch', { name: bot.name })}
            </button>
          </div>
        ) : (
          <div key="computer-active-panel" className="animate-menu-view space-y-4">
            <div className="h-[260px] overflow-y-auto bg-[#0B0E11] border border-slate-800 rounded-lg p-3 font-mono text-xs">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-8">{t('computer.makeOpeningMove')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-y-1.5">
                  {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                    <div key={i} className="contents">
                      <span className="text-slate-500 tabular-nums">{i + 1}.</span>
                      <span className="text-slate-100">{history[i * 2]}</span>
                      <span className="text-slate-300">{history[i * 2 + 1] || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Standard Match Controls */}
            <div className="flex flex-wrap gap-2">
              {practiceMode && !cheatActive && (
                <button
                  type="button"
                  onClick={() => handleUndo(false)}
                  disabled={!canUndo}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-4 h-4" />
                  {t('common.undo')}
                </button>
              )}
              <button
                type="button"
                onClick={() => startNewGame()}
                className="flex-1 py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                {t('computer.restart')}
              </button>
              <button
                type="button"
                onClick={resignGame}
                className="flex-1 py-2.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-xs font-medium text-rose-200 inline-flex items-center justify-center gap-1.5"
              >
                <Flag className="w-4 h-4" />
                {t('online.resign')}
              </button>
            </div>

            {/* Owner Cheat Controls (only when armed in Owner Panel) */}
            {cheatActive && (
              <div className="bg-amber-950/30 border border-amber-600/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('common.ownerCheatActive')}
                  </span>
                  <span className="font-mono text-[11px] text-amber-400">{t('common.ownerOnly')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUndo(false)}
                    disabled={!canUndo}
                    className="py-2 px-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1.5"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                    {t('common.undo')}
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="py-2 px-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1.5"
                  >
                    <Redo2 className="w-3.5 h-3.5 text-amber-400" />
                    {t('common.redo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOwnerAutoMove()}
                    disabled={turn !== playerSide || botThinking}
                    className="py-2 px-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-emerald-300 inline-flex items-center justify-center gap-1.5"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    {t('common.bestMove')}
                  </button>
                  {timeControlMin > 0 && (
                    <button
                      type="button"
                      onClick={handleOwnerAddTime}
                      className="py-2 px-2.5 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      +60s
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleOwnerInstantWin}
                    className="col-span-2 sm:col-span-3 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Crown className="w-4 h-4" />
                    {t('online.instantWin')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
