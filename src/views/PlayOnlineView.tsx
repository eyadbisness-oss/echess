import { useEffect, useMemo, useState } from 'react';
import { Clock, Crown, Flag, Handshake, Loader2, Redo2, RotateCcw, Search, Sparkles, Swords, Undo2, Users, X } from 'lucide-react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMultiplayer } from '../contexts/MultiplayerContext';
import { ChessBoard, EvaluationBar, type BoardArrow } from '../components/ChessBoard';
import { MoveTimerDisplay } from '../components/MoveTimerDisplay';
import { stockfishService } from '../engine/stockfishService';
import { TIME_CONTROLS, type ChessGameRecord, type EngineEval } from '../shared/chessTypes';
import { parseTimeControlInitialMs, readStoredWarningColor } from '../utils/timerWarning';

interface ChallengeDoc {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerRating?: number;
  targetId: string;
  targetName: string;
  timeControl: string;
  category: string;
  colorPreference?: string;
  rated: boolean;
  status: string;
  gameId?: string;
}

// Clock formatting is handled by MoveTimerDisplay

export function PlayOnlineView({
  onOpenReview,
}: {
  onOpenReview: (pgn: string, meta?: Partial<ChessGameRecord>) => void;
}) {
  const { firebaseUser, profile, platformConfig, isOwner, ownerCheatMode } = useAuth();
  const { t } = useLocale();
  const {
    connected,
    onlinePlayers,
    inQueue,
    queueTimeControl,
    activeRoom,
    rematchPending,
    errorMsg,
    joinQueue,
    leaveQueue,
    startChallengeRoom,
    sendMove,
    resignGame,
    offerDraw,
    acceptDraw,
    declineDraw,
    requestRematch,
    clearCompletedRoom,
    ownerCheatAction,
  } = useMultiplayer();

  const [selectedTc, setSelectedTc] = useState('5+0');
  const [rated, setRated] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  const [incomingChallenges, setIncomingChallenges] = useState<ChallengeDoc[]>([]);
  const [ownerEval, setOwnerEval] = useState<EngineEval | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, 'challenges'),
      where('targetId', '==', firebaseUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChallengeDoc, 'id'>) }))
          .filter((c) => c.status === 'pending');
        setIncomingChallenges(list);
      },
      () => {}
    );
    return () => unsub();
  }, [firebaseUser]);

  // Also listen for accepted challenges I sent so both players jump into the room automatically
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, 'challenges'),
      where('challengerId', '==', firebaseUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        for (const d of snap.docs) {
          const ch = { id: d.id, ...(d.data() as Omit<ChallengeDoc, 'id'>) };
          if (ch.status === 'accepted' && ch.gameId && !activeRoom) {
            const whiteUid = ch.colorPreference === 'black' ? ch.targetId : ch.challengerId;
            const blackUid = whiteUid === ch.challengerId ? ch.targetId : ch.challengerId;
            startChallengeRoom({
              roomId: ch.gameId,
              whiteUid,
              blackUid,
              whiteName: whiteUid === ch.challengerId ? ch.challengerName : ch.targetName,
              blackName: blackUid === ch.challengerId ? ch.challengerName : ch.targetName,
              whiteRating: ch.challengerRating || 1200,
              blackRating: 1200,
              timeControl: ch.timeControl,
              rated: ch.rated,
            });
          }
        }
      },
      () => {}
    );
    return () => unsub();
  }, [firebaseUser, activeRoom, startChallengeRoom]);

  const handleAcceptChallenge = async (ch: ChallengeDoc) => {
    if (!firebaseUser || !profile) return;
    const roomId = `chal_${ch.id}_${Date.now()}`;
    await updateDoc(doc(db, 'challenges', ch.id), {
      status: 'accepted',
      gameId: roomId,
      updatedAt: serverTimestamp(),
    });
    const whiteUid =
      ch.colorPreference === 'black'
        ? ch.targetId
        : ch.colorPreference === 'white'
        ? ch.challengerId
        : Math.random() < 0.5
        ? ch.challengerId
        : ch.targetId;
    const blackUid = whiteUid === ch.challengerId ? ch.targetId : ch.challengerId;

    startChallengeRoom({
      roomId,
      whiteUid,
      blackUid,
      whiteName: whiteUid === ch.challengerId ? ch.challengerName : profile.displayName,
      blackName: blackUid === ch.challengerId ? ch.challengerName : profile.displayName,
      whiteRating: whiteUid === ch.challengerId ? ch.challengerRating || 1200 : profile.ratings.blitz,
      blackRating: blackUid === ch.challengerId ? ch.challengerRating || 1200 : profile.ratings.blitz,
      timeControl: ch.timeControl,
      rated: ch.rated,
    });
  };

  const handleDeclineChallenge = async (chId: string) => {
    await updateDoc(doc(db, 'challenges', chId), {
      status: 'declined',
      updatedAt: serverTimestamp(),
    });
  };

  const myColor: 'w' | 'b' = useMemo(() => {
    if (!activeRoom || !firebaseUser) return 'w';
    return activeRoom.black.uid === firebaseUser.uid ? 'b' : 'w';
  }, [activeRoom, firebaseUser]);

  const cheatActive = isOwner && ownerCheatMode;

  useEffect(() => {
    if (!cheatActive || !activeRoom || activeRoom.status !== 'active') {
      setOwnerEval(null);
      return;
    }
    stockfishService.analyzePosition(activeRoom.fen, {
      depth: 13,
      multiPv: 1,
      onUpdate: (lines) => {
        if (lines[0]) setOwnerEval(lines[0]);
      },
    });
  }, [cheatActive, activeRoom?.id, activeRoom?.fen, activeRoom?.status]);

  const ownerArrows: BoardArrow[] =
    cheatActive && ownerEval?.bestMoveUci && ownerEval.bestMoveUci.length >= 4
      ? [{ from: ownerEval.bestMoveUci.slice(0, 2), to: ownerEval.bestMoveUci.slice(2, 4), color: '#10B981' }]
      : [];

  if (!platformConfig.features.onlineMultiplayer) {
    return (
      <div className="max-w-2xl mx-auto bg-[#12171E] border border-slate-800 rounded-xl p-8 text-center">
        <p className="text-slate-300 text-sm">{t('online.disabled')}</p>
      </div>
    );
  }

  if (activeRoom) {
    const topPlayer = myColor === 'w' ? activeRoom.black : activeRoom.white;
    const bottomPlayer = myColor === 'w' ? activeRoom.white : activeRoom.black;
    const topColor = myColor === 'w' ? 'b' : 'w';
    const isMyTurn = activeRoom.status === 'active' && activeRoom.turn === myColor;
    const drawOfferedToMe = activeRoom.drawOfferBy && activeRoom.drawOfferBy !== myColor;
    const totalMatchMs = parseTimeControlInitialMs(activeRoom.timeControl);
    const warningColor = readStoredWarningColor(profile?.lowTimeWarningColor);

    return (
      <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Board + Clocks */}
        <div className="lg:col-span-7 flex flex-col items-center space-y-3">
          {/* Top Opponent Bar */}
          <div className="w-full max-w-[540px] flex items-center justify-between gap-3 bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {topPlayer.displayName}{' '}
                <span className="font-mono text-xs text-slate-400">({topPlayer.rating})</span>
              </p>
              <p className="text-xs text-slate-400">
                {topPlayer.connected ? t('online.connected') : t('online.reconnecting')}
              </p>
            </div>
            <MoveTimerDisplay
              timeLeftMs={topPlayer.timeLeftMs}
              totalTimeMs={totalMatchMs}
              isActive={activeRoom.status === 'active' && activeRoom.turn === topColor}
              isGameFinished={activeRoom.status !== 'active'}
              warningColor={warningColor}
              label={`${topPlayer.displayName} clock`}
            />
          </div>

          <div className="flex items-stretch justify-center gap-2.5 w-full max-w-[580px]">
            {cheatActive && <EvaluationBar evaluation={ownerEval} orientation={myColor} />}
            <ChessBoard
              fen={activeRoom.fen}
              orientation={myColor}
              interactive={activeRoom.status === 'active'}
              allowedColor={myColor}
              boardThemeId={profile?.boardTheme}
              pieceStyle={profile?.pieceStyle}
              showCoordinates={profile?.showCoordinates ?? true}
              autoQueen={profile?.autoQueen ?? false}
              lastMove={activeRoom.lastMove ? { from: activeRoom.lastMove.from, to: activeRoom.lastMove.to } : null}
              arrows={ownerArrows}
              onMove={(mv) => {
                if (!isMyTurn) return false;
                sendMove(mv.from, mv.to, mv.promotion);
                return true;
              }}
            />
          </div>

          {/* Bottom Player Bar */}
          <div className="w-full max-w-[540px] flex items-center justify-between gap-3 bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {bottomPlayer.displayName}{' '}
                <span className="font-mono text-xs text-slate-400">({bottomPlayer.rating})</span>
              </p>
              <p className="text-xs text-slate-400">
                {isMyTurn ? t('online.yourTurn') : activeRoom.status === 'active' ? t('online.opponentThinking') : t('online.matchFinished')}
              </p>
            </div>
            <MoveTimerDisplay
              timeLeftMs={bottomPlayer.timeLeftMs}
              totalTimeMs={totalMatchMs}
              isActive={activeRoom.status === 'active' && activeRoom.turn === myColor}
              isGameFinished={activeRoom.status !== 'active'}
              warningColor={warningColor}
              label={`${bottomPlayer.displayName} clock`}
            />
          </div>
        </div>

        {/* Right: Controls, Move List, Result */}
        <div className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                {t('online.liveMatch', { category: t(`common.${activeRoom.category}` as 'common.blitz') })}
              </h2>
              <p className="text-xs text-slate-400">
                {activeRoom.timeControl} · {activeRoom.rated ? t('online.ratedGlicko') : t('common.casual')}
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              {connected ? t('online.liveSync') : t('online.offline')}
            </span>
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}

          {drawOfferedToMe && activeRoom.status === 'active' && (
            <div className="bg-amber-950/35 border border-amber-700/60 rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-200 font-medium">{t('online.drawOffered')}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={acceptDraw}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  {t('common.accept')}
                </button>
                <button
                  type="button"
                  onClick={declineDraw}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                >
                  {t('common.decline')}
                </button>
              </div>
            </div>
          )}

          {/* Move List */}
          <div className="h-[260px] overflow-y-auto bg-[#0B0E11] border border-slate-800 rounded-lg p-3 font-mono text-xs">
            {activeRoom.history.length === 0 ? (
              <p className="text-slate-500 text-center py-8">{t('online.waitingFirstMove')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-y-1.5">
                {Array.from({ length: Math.ceil(activeRoom.history.length / 2) }).map((_, i) => {
                  const w = activeRoom.history[i * 2];
                  const b = activeRoom.history[i * 2 + 1];
                  return (
                    <div key={i} className="contents">
                      <span className="text-slate-500 tabular-nums">{i + 1}.</span>
                      <span className="text-slate-100">{w?.san}</span>
                      <span className="text-slate-300">{b?.san || ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Match Controls */}
          {activeRoom.status === 'active' ? (
            <>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={offerDraw}
                className="flex-1 py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5"
              >
                <Handshake className="w-4 h-4" />
                {t('online.offerDraw')}
              </button>
              {!confirmResign ? (
                <button
                  type="button"
                  onClick={() => setConfirmResign(true)}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-xs font-medium text-rose-200 inline-flex items-center justify-center gap-1.5"
                >
                  <Flag className="w-4 h-4" />
                  {t('online.resign')}
                </button>
              ) : (
                <div className="flex-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmResign(false);
                      resignGame();
                    }}
                    className="flex-1 py-2.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                  >
                    {t('common.confirm')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResign(false)}
                    className="py-2.5 px-2.5 rounded-lg bg-slate-800 text-xs text-slate-300"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
            {cheatActive && (
              <div className="bg-amber-950/30 border border-amber-600/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {t('common.ownerCheatActive')}
                  </span>
                  <span className="font-mono text-[11px] text-amber-400">{t('common.serverVerified')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => ownerCheatAction('undo')}
                    disabled={activeRoom.history.length === 0}
                    className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                    {t('common.undo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => ownerCheatAction('redo')}
                    disabled={!activeRoom.redoAvailable}
                    className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1"
                  >
                    <Redo2 className="w-3.5 h-3.5 text-amber-400" />
                    {t('common.redo')}
                  </button>
                  <button
                    type="button"
                    onClick={() => ownerCheatAction('add_time')}
                    className="py-2 px-2 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-amber-700/40 text-xs font-medium text-slate-100 inline-flex items-center justify-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    +60s
                  </button>
                  <button
                    type="button"
                    onClick={() => ownerCheatAction('win')}
                    className="col-span-3 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Crown className="w-4 h-4" />
                    {t('online.instantWin')}
                  </button>
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="bg-[#0F141B] border border-emerald-700/50 rounded-xl p-4 space-y-3">
              <div>
                <p className="font-display text-lg font-bold text-white">
                  {activeRoom.result === '1-0'
                    ? t('online.wins', { name: activeRoom.white.displayName })
                    : activeRoom.result === '0-1'
                    ? t('online.wins', { name: activeRoom.black.displayName })
                    : t('common.draw')}
                </p>
                <p className="text-xs text-slate-400 capitalize">
                  {t('online.resultLine', { result: activeRoom.result || '', termination: activeRoom.termination || '' })}
                </p>
                {activeRoom.ratingUpdate && (
                  <p className="text-xs font-mono text-emerald-400 mt-1 tabular-nums">
                    {t('online.ratingUpdate', {
                      summary: myColor === 'w'
                        ? `${activeRoom.ratingUpdate.whiteNew} (${activeRoom.ratingUpdate.whiteDelta >= 0 ? '+' : ''}${activeRoom.ratingUpdate.whiteDelta})`
                        : `${activeRoom.ratingUpdate.blackNew} (${activeRoom.ratingUpdate.blackDelta >= 0 ? '+' : ''}${activeRoom.ratingUpdate.blackDelta})`,
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onOpenReview(activeRoom.pgn, {
                      whiteName: activeRoom.white.displayName,
                      blackName: activeRoom.black.displayName,
                      result: activeRoom.result,
                      timeControl: activeRoom.timeControl,
                    })
                  }
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {t('online.gameReview')}
                </button>
                <button
                  type="button"
                  onClick={requestRematch}
                  className="py-2 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {rematchPending ? t('online.acceptRematch') : t('online.rematch')}
                </button>
                <button
                  type="button"
                  onClick={clearCompletedRoom}
                  className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                >
                  {t('online.newMatch')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1160px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Matchmaking Panel */}
      <div className="lg:col-span-7 bg-[#12171E] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-100">{t('online.title')}</h1>
            <p className="text-sm text-slate-400">
              {t('online.subtitle')}
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            {connected ? t('online.serverConnected') : t('online.connecting')}
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">{t('online.timeControl')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.code}
                type="button"
                onClick={() => setSelectedTc(tc.code)}
                className={`p-3 rounded-xl border text-start transition-colors ${
                  selectedTc === tc.code
                    ? 'bg-emerald-950/50 border-emerald-500 text-white'
                    : 'bg-[#0B0E11] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <p className="font-mono text-base font-bold tabular-nums">{tc.label}</p>
                <p className="text-xs text-slate-400 capitalize">{t(`common.${tc.category}` as 'common.blitz')}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5">
          <div>
            <p className="text-sm font-medium text-slate-100">{t('online.ratedMatch')}</p>
            <p className="text-xs text-slate-400">{t('online.ratedMatchDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setRated((r) => !r)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              rated ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {rated ? t('common.rated') : t('common.casual')}
          </button>
        </div>

        {!inQueue ? (
          <button
            type="button"
            disabled={!connected}
            onClick={() => joinQueue(selectedTc, rated)}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Swords className="w-4 h-4" />
            {t('online.findOpponent', { tc: selectedTc })}
          </button>
        ) : (
          <div className="bg-emerald-950/35 border border-emerald-700/60 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-200">
                  {t('online.searchingOpponent', { tc: queueTimeControl || '' })}
                </p>
                <p className="text-xs text-emerald-300/75">
                  {t('online.searchingHint')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={leaveQueue}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>

      {/* Online Lobby & Direct Challenges */}
      <div className="lg:col-span-5 space-y-6">
        {incomingChallenges.length > 0 && (
          <div className="bg-[#12171E] border border-amber-700/50 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-amber-200">{t('online.incomingChallenges')}</h2>
            <div className="space-y-2.5">
              {incomingChallenges.map((ch) => (
                <div
                  key={ch.id}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{ch.challengerName}</p>
                    <p className="text-xs text-slate-400">
                      {ch.timeControl} · {ch.rated ? t('common.rated') : t('common.casual')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptChallenge(ch)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      {t('common.accept')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineChallenge(ch.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                    >
                      {t('common.decline')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-100 inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              {t('online.onlinePlayers')}
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {t('online.activeCount', { count: onlinePlayers.length })}
            </span>
          </div>
          {onlinePlayers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <Search className="w-5 h-5 mx-auto mb-2 opacity-60" />
              {t('online.waitingLobby')}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 max-h-[320px] overflow-y-auto">
              {onlinePlayers.map((p) => (
                <div key={p.uid} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {p.displayName}
                      {p.uid === firebaseUser?.uid ? ` (${t('common.you')})` : ''}
                    </p>
                    <p className="text-xs font-mono text-slate-400 tabular-nums">
                      {t('online.ratingLabel', { rating: p.rating })} · {p.inGame ? t('online.inMatch') : t('online.available')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
