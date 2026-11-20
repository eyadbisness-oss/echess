import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Chess } from 'chess.js';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { detectOpeningFromMoves } from '../data/openings';
import { computePlayStreakUpdate, evaluateProfileAchievements } from '../data/achievements';
import { calculateGlicko2Update } from '../shared/glicko2';
import type { TimeCategory } from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';
import { getWebSocketUrl } from '../utils/backendUrl';

export interface OnlinePlayerSummary {
  uid: string;
  displayName: string;
  rating: number;
  inGame: boolean;
}

export interface LiveRoomState {
  id: string;
  fen: string;
  pgn: string;
  history: { san: string; from: string; to: string; color: 'w' | 'b' }[];
  turn: 'w' | 'b';
  white: {
    uid: string;
    displayName: string;
    rating: number;
    timeLeftMs: number;
    connected: boolean;
  };
  black: {
    uid: string;
    displayName: string;
    rating: number;
    timeLeftMs: number;
    connected: boolean;
  };
  timeControl: string;
  category: TimeCategory;
  incrementMs: number;
  rated: boolean;
  isTestMatch: boolean;
  status: 'active' | 'completed';
  result?: '1-0' | '0-1' | '1/2-1/2';
  termination?: string;
  winnerId?: string;
  drawOfferBy: 'w' | 'b' | null;
  redoAvailable?: boolean;
  lastMove: { from: string; to: string; san: string } | null;
  ratingUpdate?: {
    whiteDelta: number;
    blackDelta: number;
    whiteNew: number;
    blackNew: number;
  };
  persistedByUid?: string;
}

interface MultiplayerContextValue {
  connected: boolean;
  onlinePlayers: OnlinePlayerSummary[];
  inQueue: boolean;
  queueTimeControl: string | null;
  activeRoom: LiveRoomState | null;
  rematchPending: boolean;
  errorMsg: string | null;
  joinQueue: (timeControl: string, rated?: boolean) => void;
  leaveQueue: () => void;
  startChallengeRoom: (params: {
    roomId: string;
    whiteUid: string;
    blackUid: string;
    whiteName: string;
    blackName: string;
    whiteRating: number;
    blackRating: number;
    timeControl: string;
    rated?: boolean;
  }) => void;
  sendMove: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void;
  resignGame: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  requestRematch: () => void;
  clearCompletedRoom: () => void;
  ownerCheatAction: (action: 'undo' | 'redo' | 'win' | 'draw' | 'add_time') => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, isOwner, getIdToken, unlockAchievement } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const savedGamesRef = useRef<Set<string>>(new Set());
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const activeRoomIdRef = useRef<string | null>(null);

  const [connected, setConnected] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerSummary[]>([]);
  const [inQueue, setInQueue] = useState(false);
  const [queueTimeControl, setQueueTimeControl] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<LiveRoomState | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  activeRoomIdRef.current = activeRoom?.id ?? null;

  const persistCompletedRoom = useCallback(
    async (room: LiveRoomState) => {
      if (!firebaseUser || !profile || room.status !== 'completed') return;
      if (savedGamesRef.current.has(room.id)) return;
      savedGamesRef.current.add(room.id);

      const mySide = room.white.uid === firebaseUser.uid ? 'w' : room.black.uid === firebaseUser.uid ? 'b' : null;
      if (!mySide) return;

      // Only 1 designated player writes the game record to avoid duplicates
      if (!room.isTestMatch && (room.persistedByUid === firebaseUser.uid || (!room.persistedByUid && mySide === 'w'))) {
        try {
          const gameDocRef = doc(db, 'games', room.id);
          const existing = await getDoc(gameDocRef);
          if (!existing.exists()) {
            const opening = detectOpeningFromMoves(room.history.map((h) => h.san));
            await setDoc(gameDocRef, {
              whiteId: room.white.uid,
              blackId: room.black.uid,
              whiteName: room.white.displayName,
              blackName: room.black.displayName,
              whiteRating: room.white.rating,
              blackRating: room.black.rating,
              whiteRatingDelta: room.ratingUpdate?.whiteDelta ?? 0,
              blackRatingDelta: room.ratingUpdate?.blackDelta ?? 0,
              timeControl: room.timeControl,
              category: room.category,
              result: room.result || '1/2-1/2',
              termination: room.termination || 'finished',
              winnerId: room.winnerId || '',
              pgn: room.pgn || '',
              finalFen: room.fen,
              openingName: opening.name,
              eco: opening.eco,
              moveCount: room.history.length,
              rated: room.rated,
              isTestGame: room.isTestMatch,
              createdAt: serverTimestamp(),
              endedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error('Could not persist game history:', err);
        }
      }

      // Update my own Glicko-2 rating & W/L/D counters in Firestore
      if (!room.isTestMatch) {
        try {
          const myScore: 1 | 0.5 | 0 =
            room.result === '1/2-1/2'
              ? 0.5
              : (room.result === '1-0' && mySide === 'w') || (room.result === '0-1' && mySide === 'b')
              ? 1
              : 0;

          const cat = room.category;
          const currentRating = profile.ratings?.[cat] ?? 1200;
          const currentRd = profile.rd?.[cat] ?? 200;
          const currentVol = profile.volatility?.[cat] ?? 0.06;
          const oppRating = mySide === 'w' ? room.black.rating : room.white.rating;

          const updatedGlicko = room.rated
            ? calculateGlicko2Update(
                { rating: currentRating, rd: currentRd, vol: currentVol },
                { rating: oppRating, rd: 150, vol: 0.06 },
                myScore
              )
            : { newRating: currentRating, newRd: currentRd, newVol: currentVol, delta: 0 };

          const newWins = (profile.wins || 0) + (myScore === 1 ? 1 : 0);
          const newLosses = (profile.losses || 0) + (myScore === 0 ? 1 : 0);
          const newDraws = (profile.draws || 0) + (myScore === 0.5 ? 1 : 0);
          const newGamesPlayed = (profile.gamesPlayed || 0) + 1;
          const playStreakPatch = computePlayStreakUpdate(profile);
          const nextRatings = {
            ...profile.ratings,
            [cat]: updatedGlicko.newRating,
          };
          const simulatedProfile = {
            ...profile,
            ratings: nextRatings,
            gamesPlayed: newGamesPlayed,
            wins: newWins,
            losses: newLosses,
            draws: newDraws,
            ...playStreakPatch,
          };
          const evaluatedAchievements = evaluateProfileAchievements(simulatedProfile);

          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            ratings: nextRatings,
            rd: {
              ...(profile.rd || { bullet: 200, blitz: 200, rapid: 200, classical: 200 }),
              [cat]: updatedGlicko.newRd,
            },
            volatility: {
              ...(profile.volatility || { bullet: 0.06, blitz: 0.06, rapid: 0.06, classical: 0.06 }),
              [cat]: updatedGlicko.newVol,
            },
            gamesPlayed: newGamesPlayed,
            wins: newWins,
            losses: newLosses,
            draws: newDraws,
            ...playStreakPatch,
            ...(evaluatedAchievements.length > (profile.achievements?.length || 0)
              ? { achievements: evaluatedAchievements }
              : {}),
            onlineStatus: 'online',
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Rating sync warning:', err);
        }
      }
    },
    [firebaseUser, profile]
  );

  const persistCompletedRoomRef = useRef(persistCompletedRoom);
  persistCompletedRoomRef.current = persistCompletedRoom;
  const hasProfile = Boolean(profile);

  useEffect(() => {
    if (!firebaseUser || !hasProfile) return;

    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = await getIdToken();
      if (!token || closedByCleanup) return;

      const ws = new WebSocket(getWebSocketUrl('/ws'));
      wsRef.current = ws;

      ws.onopen = () => {
        const currentProfile = profileRef.current;
        ws.send(
          JSON.stringify({
            type: 'auth',
            token,
            displayName: currentProfile?.displayName || firebaseUser.displayName || 'Player',
            rating: currentProfile?.ratings?.blitz ?? 1200,
            lastRoomId: activeRoomIdRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'auth:ok') {
            setConnected(true);
            setErrorMsg(null);
            if (data.activeRoom) {
              const recovered = data.activeRoom as LiveRoomState;
              setActiveRoom(recovered);
              if (recovered.status === 'completed') {
                void persistCompletedRoomRef.current(recovered);
              }
            }
          } else if (data.type === 'presence:list') {
            setOnlinePlayers(data.players || []);
          } else if (data.type === 'queue:waiting') {
            setInQueue(true);
            setQueueTimeControl(data.timeControl);
          } else if (data.type === 'queue:left') {
            setInQueue(false);
            setQueueTimeControl(null);
          } else if (data.type === 'game:started') {
            setInQueue(false);
            setQueueTimeControl(null);
            setRematchPending(false);
            setActiveRoom(data.room);
            soundEngine.playCastle();
          } else if (data.type === 'game:state') {
            const room = data.room as LiveRoomState;
            setActiveRoom((prev) => {
              if (prev && room.history.length > prev.history.length) {
                const c = new Chess(room.fen);
                if (room.status === 'completed' && !c.isCheckmate()) {
                  soundEngine.playForChessMove(c, room.lastMove);
                  setTimeout(() => soundEngine.playGameEnd(), 160);
                } else {
                  soundEngine.playForChessMove(c, room.lastMove);
                }
              } else if (room.status === 'completed' && prev?.status !== 'completed') {
                soundEngine.playGameEnd();
              }
              return room;
            });
            if (room.status === 'completed') {
              persistCompletedRoom(room);
            }
          } else if (data.type === 'game:rematch_offered') {
            setRematchPending(true);
          } else if (data.type === 'error') {
            setErrorMsg(data.message);
          }
        } catch {
          // ignore malformed message
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByCleanup) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();

    const handleBackendChanged = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      } else {
        void connect();
      }
    };
    window.addEventListener('echess-backend-url-changed', handleBackendChanged);

    return () => {
      closedByCleanup = true;
      window.removeEventListener('echess-backend-url-changed', handleBackendChanged);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [firebaseUser?.uid, hasProfile, getIdToken]);

  // Client-side smooth clock display interpolation between server updates
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'active' || activeRoom.history.length === 0) return;
    const interval = setInterval(() => {
      setActiveRoom((prev) => {
        if (!prev || prev.status !== 'active' || prev.history.length === 0) return prev;
        if (prev.turn === 'w') {
          return {
            ...prev,
            white: { ...prev.white, timeLeftMs: Math.max(0, prev.white.timeLeftMs - 100) },
          };
        }
        return {
          ...prev,
          black: { ...prev.black, timeLeftMs: Math.max(0, prev.black.timeLeftMs - 100) },
        };
      });
    }, 100);
    return () => clearInterval(interval);
  }, [activeRoom?.id, activeRoom?.status, activeRoom?.turn, activeRoom?.history.length]);

  const send = useCallback((payload: unknown): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const joinQueue = useCallback(
    (timeControl: string, rated = true) => {
      const cat: TimeCategory = timeControl.startsWith('1+') || timeControl.startsWith('2+')
        ? 'bullet'
        : timeControl.startsWith('3+') || timeControl.startsWith('5+')
        ? 'blitz'
        : timeControl.startsWith('10+') || timeControl.startsWith('15+')
        ? 'rapid'
        : 'classical';
      send({
        type: 'queue:join',
        timeControl,
        rated,
        rating: profile?.ratings?.[cat] ?? 1200,
        rd: profile?.rd?.[cat] ?? 200,
        vol: profile?.volatility?.[cat] ?? 0.06,
      });
    },
    [profile, send]
  );

  const leaveQueue = useCallback(() => send({ type: 'queue:leave' }), [send]);

  const startChallengeRoom = useCallback(
    (params: {
      roomId: string;
      whiteUid: string;
      blackUid: string;
      whiteName: string;
      blackName: string;
      whiteRating: number;
      blackRating: number;
      timeControl: string;
      rated?: boolean;
    }) => {
      send({ type: 'challenge:start_room', ...params });
    },
    [send]
  );

  const sendMove = useCallback(
    (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
      if (!activeRoom) return;
      const sent = send({ type: 'game:move', roomId: activeRoom.id, from, to, promotion });
      if (!sent) {
        setErrorMsg('Connection interrupted — reconnecting to live server...');
      }
    },
    [activeRoom, send]
  );

  const resignGame = useCallback(() => {
    if (!activeRoom) return;
    send({ type: 'game:resign', roomId: activeRoom.id });
  }, [activeRoom, send]);

  const offerDraw = useCallback(() => {
    if (!activeRoom) return;
    send({ type: 'game:draw_offer', roomId: activeRoom.id });
  }, [activeRoom, send]);

  const acceptDraw = useCallback(() => {
    if (!activeRoom) return;
    send({ type: 'game:draw_accept', roomId: activeRoom.id });
  }, [activeRoom, send]);

  const declineDraw = useCallback(() => {
    if (!activeRoom) return;
    send({ type: 'game:draw_decline', roomId: activeRoom.id });
  }, [activeRoom, send]);

  const requestRematch = useCallback(() => {
    if (!activeRoom) return;
    send({ type: 'game:rematch', roomId: activeRoom.id });
  }, [activeRoom, send]);

  const clearCompletedRoom = useCallback(() => {
    setActiveRoom(null);
    setRematchPending(false);
  }, []);

  const ownerCheatAction = useCallback(
    (action: 'undo' | 'redo' | 'win' | 'draw' | 'add_time') => {
      if (!isOwner || !activeRoom || activeRoom.status !== 'active') return;
      send({ type: 'owner:cheat', roomId: activeRoom.id, action });
    },
    [isOwner, activeRoom, send]
  );

  return (
    <MultiplayerContext.Provider
      value={{
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
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error('useMultiplayer must be used inside MultiplayerProvider');
  return ctx;
}
