import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { calculateGlicko2Update } from './src/shared/glicko2.ts';
import type { TimeCategory } from './src/shared/chessTypes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAuth(adminApp);

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'eyadbisness@gmail.com').toLowerCase();

const PORT = Number(process.env.PORT || 3000);

interface AuthenticatedSocket extends WebSocket {
  uid?: string;
  displayName?: string;
  rating?: number;
  email?: string;
  isOwner?: boolean;
  roomId?: string | null;
}

interface QueueEntry {
  uid: string;
  displayName: string;
  rating: number;
  rd: number;
  vol: number;
  timeControl: string;
  category: TimeCategory;
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  socket: AuthenticatedSocket;
  joinedAt: number;
}

interface LivePlayerState {
  uid: string;
  displayName: string;
  rating: number;
  rd: number;
  vol: number;
  timeLeftMs: number;
  connected: boolean;
}

interface LiveGameRoom {
  id: string;
  chess: Chess;
  white: LivePlayerState;
  black: LivePlayerState;
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
  rematchOfferedBy: Set<string>;
  redoStack: string[];
  lastMoveAt: number;
  lastMove?: { from: string; to: string; san: string } | null;
  ratingUpdate?: {
    whiteDelta: number;
    blackDelta: number;
    whiteNew: number;
    blackNew: number;
  };
  persistedByUid?: string;
  createdAt: number;
}

const activeClients = new Map<string, AuthenticatedSocket>();
const matchmakingQueue: QueueEntry[] = [];
const liveRooms = new Map<string, LiveGameRoom>();
const pendingFinalRoomByUid = new Map<string, ReturnType<typeof serializeRoom>>();

async function verifyBearerToken(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

function parseTimeControl(code: string): { initialMs: number; incrementMs: number; category: TimeCategory } {
  const parts = code.split('+');
  const mins = Math.max(0.5, Number(parts[0] || 5));
  const inc = Math.max(0, Number(parts[1] || 0));
  const initialMs = Math.round(mins * 60 * 1000);
  const incrementMs = Math.round(inc * 1000);
  let category: TimeCategory = 'blitz';
  if (mins < 3) category = 'bullet';
  else if (mins <= 5) category = 'blitz';
  else if (mins <= 20) category = 'rapid';
  else category = 'classical';
  return { initialMs, incrementMs, category };
}

function sendJson(ws: WebSocket | undefined, payload: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastPresence() {
  const onlineList = Array.from(activeClients.values()).map((s) => ({
    uid: s.uid,
    displayName: s.displayName || 'Player',
    rating: s.rating || 1200,
    inGame: Boolean(s.roomId),
  }));
  const msg = JSON.stringify({ type: 'presence:list', players: onlineList });
  for (const sock of activeClients.values()) {
    if (sock.readyState === WebSocket.OPEN) sock.send(msg);
  }
}

function serializeRoom(room: LiveGameRoom) {
  return {
    id: room.id,
    fen: room.chess.fen(),
    pgn: room.chess.pgn(),
    history: room.chess.history({ verbose: true }).map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      color: m.color,
    })),
    turn: room.chess.turn(),
    white: {
      uid: room.white.uid,
      displayName: room.white.displayName,
      rating: room.white.rating,
      timeLeftMs: Math.max(0, room.white.timeLeftMs),
      connected: room.white.connected,
    },
    black: {
      uid: room.black.uid,
      displayName: room.black.displayName,
      rating: room.black.rating,
      timeLeftMs: Math.max(0, room.black.timeLeftMs),
      connected: room.black.connected,
    },
    timeControl: room.timeControl,
    category: room.category,
    incrementMs: room.incrementMs,
    rated: room.rated,
    isTestMatch: room.isTestMatch,
    status: room.status,
    result: room.result,
    termination: room.termination,
    winnerId: room.winnerId,
    drawOfferBy: room.drawOfferBy,
    redoAvailable: room.redoStack.length > 0,
    lastMove: room.lastMove || null,
    ratingUpdate: room.ratingUpdate,
    persistedByUid: room.persistedByUid,
  };
}

function finalizeRoom(
  room: LiveGameRoom,
  result: '1-0' | '0-1' | '1/2-1/2',
  termination: string
) {
  if (room.status === 'completed') return;
  room.status = 'completed';
  room.result = result;
  room.termination = termination;
  room.winnerId =
    result === '1-0' ? room.white.uid : result === '0-1' ? room.black.uid : '';
  room.persistedByUid = room.white.connected ? room.white.uid : room.black.uid;

  if (room.rated && !room.isTestMatch) {
    const whiteScore: 1 | 0.5 | 0 = result === '1-0' ? 1 : result === '1/2-1/2' ? 0.5 : 0;
    const blackScore: 1 | 0.5 | 0 = result === '0-1' ? 1 : result === '1/2-1/2' ? 0.5 : 0;

    const wRes = calculateGlicko2Update(
      { rating: room.white.rating, rd: room.white.rd, vol: room.white.vol },
      { rating: room.black.rating, rd: room.black.rd, vol: room.black.vol },
      whiteScore
    );
    const bRes = calculateGlicko2Update(
      { rating: room.black.rating, rd: room.black.rd, vol: room.black.vol },
      { rating: room.white.rating, rd: room.white.rd, vol: room.white.vol },
      blackScore
    );

    room.ratingUpdate = {
      whiteDelta: wRes.delta,
      blackDelta: bRes.delta,
      whiteNew: wRes.newRating,
      blackNew: bRes.newRating,
    };
  }

  const wSock = activeClients.get(room.white.uid);
  const bSock = activeClients.get(room.black.uid);
  if (wSock) wSock.roomId = null;
  if (bSock) bSock.roomId = null;

  const serialized = serializeRoom(room);
  const payload = { type: 'game:state', room: serialized };
  if (wSock && wSock.readyState === WebSocket.OPEN) {
    sendJson(wSock, payload);
  } else {
    pendingFinalRoomByUid.set(room.white.uid, serialized);
  }
  if (bSock && bSock.readyState === WebSocket.OPEN) {
    sendJson(bSock, payload);
  } else {
    pendingFinalRoomByUid.set(room.black.uid, serialized);
  }
  broadcastPresence();
}

// Authoritative server clock tick loop (150ms precision)
setInterval(() => {
  const now = Date.now();
  for (const room of liveRooms.values()) {
    if (room.status !== 'active') continue;
    // Clocks start ticking once at least 2 plies (or White's 1st move) have been played, or immediately after move 1
    if (room.chess.history().length === 0) {
      room.lastMoveAt = now;
      continue;
    }
    const elapsed = now - room.lastMoveAt;
    room.lastMoveAt = now;
    const turn = room.chess.turn();
    if (turn === 'w') {
      room.white.timeLeftMs = Math.max(0, room.white.timeLeftMs - elapsed);
      if (room.white.timeLeftMs <= 0) {
        finalizeRoom(room, '0-1', 'timeout');
      }
    } else {
      room.black.timeLeftMs = Math.max(0, room.black.timeLeftMs - elapsed);
      if (room.black.timeLeftMs <= 0) {
        finalizeRoom(room, '1-0', 'timeout');
      }
    }
  }
}, 150);

async function startServer() {
  const app = express();
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin === 'https://localhost' ||
      origin === 'http://localhost' ||
      origin === 'capacitor://localhost'
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // Health route
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      activeConnections: activeClients.size,
      activeGames: Array.from(liveRooms.values()).filter((r) => r.status === 'active').length,
      queueSize: matchmakingQueue.length,
    });
  });

  // Server-Side Owner Role Verification Middleware
  const requireOwner: express.RequestHandler = async (req, res, next) => {
    const decoded = await verifyBearerToken(req.headers.authorization);
    if (!decoded) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const email = (decoded.email || '').toLowerCase();
    if (!decoded.email_verified || email !== OWNER_EMAIL) {
      res.status(403).json({ error: 'Owner authorization required.' });
      return;
    }
    (req as express.Request & { ownerUid?: string; ownerEmail?: string }).ownerUid = decoded.uid;
    (req as express.Request & { ownerEmail?: string }).ownerEmail = email;
    next();
  };

  app.post('/api/owner/verify', async (req, res) => {
    const decoded = await verifyBearerToken(req.headers.authorization);
    if (!decoded) {
      res.status(401).json({ isOwner: false });
      return;
    }
    const email = (decoded.email || '').toLowerCase();
    const isOwner = Boolean(decoded.email_verified && email === OWNER_EMAIL);
    res.json({ isOwner, uid: decoded.uid });
  });

  app.get('/api/owner/telemetry', requireOwner, (_req, res) => {
    const activeGames = Array.from(liveRooms.values()).filter((r) => r.status === 'active');
    res.json({
      onlineSockets: activeClients.size,
      activeMultiplayerGames: activeGames.length,
      totalServerRooms: liveRooms.size,
      matchmakingQueue: matchmakingQueue.length,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      stockfishAssetPresent: fs.existsSync(
        path.resolve(__dirname, 'public/stockfish/stockfish-19-lite-single.wasm')
      ),
    });
  });

  app.post('/api/owner/test-match', requireOwner, (req, res) => {
    const { timeControl = '5+0', whiteName = 'Owner Sandbox White', blackName = 'Owner Sandbox Black' } = req.body || {};
    const parsed = parseTimeControl(String(timeControl));
    const roomId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const ownerUid = (req as express.Request & { ownerUid?: string }).ownerUid || 'owner';
    const room: LiveGameRoom = {
      id: roomId,
      chess: new Chess(),
      white: {
        uid: ownerUid,
        displayName: String(whiteName).slice(0, 40),
        rating: 1500,
        rd: 150,
        vol: 0.06,
        timeLeftMs: parsed.initialMs,
        connected: true,
      },
      black: {
        uid: `test_bot_${roomId}`,
        displayName: String(blackName).slice(0, 40),
        rating: 1500,
        rd: 150,
        vol: 0.06,
        timeLeftMs: parsed.initialMs,
        connected: true,
      },
      timeControl: String(timeControl),
      category: parsed.category,
      incrementMs: parsed.incrementMs,
      rated: false,
      isTestMatch: true,
      status: 'active',
      drawOfferBy: null,
      rematchOfferedBy: new Set(),
      redoStack: [],
      lastMoveAt: Date.now(),
      createdAt: Date.now(),
    };
    liveRooms.set(roomId, room);
    res.json({ room: serializeRoom(room) });
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: AuthenticatedSocket) => {
    ws.on('message', async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'auth') {
        const token = String(msg.token || '');
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          ws.uid = decoded.uid;
          ws.email = decoded.email || '';
          ws.displayName = String(msg.displayName || decoded.name || 'Player').slice(0, 40);
          ws.rating = Number(msg.rating || 1200);
          ws.isOwner = Boolean(decoded.email_verified && ws.email.toLowerCase() === OWNER_EMAIL);
          activeClients.set(decoded.uid, ws);

          // Reconnect to active room if any, or deliver completed room state missed during disconnect
          let recoveredRoomPayload: ReturnType<typeof serializeRoom> | null = null;
          for (const r of liveRooms.values()) {
            if (r.status === 'active' && (r.white.uid === decoded.uid || r.black.uid === decoded.uid)) {
              if (r.white.uid === decoded.uid) r.white.connected = true;
              if (r.black.uid === decoded.uid) r.black.connected = true;
              ws.roomId = r.id;
              recoveredRoomPayload = serializeRoom(r);
              pendingFinalRoomByUid.delete(decoded.uid);
              break;
            }
          }

          if (!recoveredRoomPayload) {
            const pendingFinal = pendingFinalRoomByUid.get(decoded.uid);
            if (pendingFinal) {
              pendingFinalRoomByUid.delete(decoded.uid);
              recoveredRoomPayload = pendingFinal;
            } else if (msg.lastRoomId) {
              const prevRoom = liveRooms.get(String(msg.lastRoomId));
              if (prevRoom && (prevRoom.white.uid === decoded.uid || prevRoom.black.uid === decoded.uid)) {
                recoveredRoomPayload = serializeRoom(prevRoom);
              }
            }
          }

          sendJson(ws, {
            type: 'auth:ok',
            uid: decoded.uid,
            activeRoom: recoveredRoomPayload,
          });
          broadcastPresence();
        } catch {
          sendJson(ws, { type: 'error', message: 'WebSocket authentication failed.' });
        }
        return;
      }

      if (!ws.uid) {
        sendJson(ws, { type: 'error', message: 'Not authenticated.' });
        return;
      }

      if (type === 'queue:join') {
        const tc = String(msg.timeControl || '5+0');
        const rated = msg.rated !== false;
        const parsed = parseTimeControl(tc);

        // Remove existing queue entry for this user
        const existingIdx = matchmakingQueue.findIndex((q) => q.uid === ws.uid);
        if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1);

        // Look for compatible opponent in queue
        const matchIdx = matchmakingQueue.findIndex(
          (q) => q.uid !== ws.uid && q.timeControl === tc && q.rated === rated
        );

        if (matchIdx !== -1) {
          const opponent = matchmakingQueue.splice(matchIdx, 1)[0];
          const whiteFirst = Math.random() < 0.5;
          const roomId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

          const p1: LivePlayerState = {
            uid: ws.uid,
            displayName: ws.displayName || 'Player',
            rating: Number(msg.rating || ws.rating || 1200),
            rd: Number(msg.rd || 150),
            vol: Number(msg.vol || 0.06),
            timeLeftMs: parsed.initialMs,
            connected: true,
          };
          const p2: LivePlayerState = {
            uid: opponent.uid,
            displayName: opponent.displayName,
            rating: opponent.rating,
            rd: opponent.rd,
            vol: opponent.vol,
            timeLeftMs: parsed.initialMs,
            connected: true,
          };

          const room: LiveGameRoom = {
            id: roomId,
            chess: new Chess(),
            white: whiteFirst ? p1 : p2,
            black: whiteFirst ? p2 : p1,
            timeControl: tc,
            category: parsed.category,
            incrementMs: parsed.incrementMs,
            rated,
            isTestMatch: false,
            status: 'active',
            drawOfferBy: null,
            rematchOfferedBy: new Set(),
            redoStack: [],
            lastMoveAt: Date.now(),
            createdAt: Date.now(),
          };

          liveRooms.set(roomId, room);
          pendingFinalRoomByUid.delete(ws.uid);
          pendingFinalRoomByUid.delete(opponent.uid);
          ws.roomId = roomId;
          opponent.socket.roomId = roomId;

          const payload = { type: 'game:started', room: serializeRoom(room) };
          sendJson(ws, payload);
          sendJson(opponent.socket, payload);
          broadcastPresence();
        } else {
          matchmakingQueue.push({
            uid: ws.uid,
            displayName: ws.displayName || 'Player',
            rating: Number(msg.rating || ws.rating || 1200),
            rd: Number(msg.rd || 150),
            vol: Number(msg.vol || 0.06),
            timeControl: tc,
            category: parsed.category,
            initialMs: parsed.initialMs,
            incrementMs: parsed.incrementMs,
            rated,
            socket: ws,
            joinedAt: Date.now(),
          });
          sendJson(ws, { type: 'queue:waiting', timeControl: tc });
        }
        return;
      }

      if (type === 'queue:leave') {
        const idx = matchmakingQueue.findIndex((q) => q.uid === ws.uid);
        if (idx !== -1) matchmakingQueue.splice(idx, 1);
        sendJson(ws, { type: 'queue:left' });
        return;
      }

      if (type === 'challenge:start_room') {
        const roomId = String(msg.roomId || '');
        const whiteUid = String(msg.whiteUid || '');
        const blackUid = String(msg.blackUid || '');
        const tc = String(msg.timeControl || '5+0');
        const parsed = parseTimeControl(tc);

        let room = liveRooms.get(roomId);
        if (!room && roomId && whiteUid && blackUid) {
          room = {
            id: roomId,
            chess: new Chess(),
            white: {
              uid: whiteUid,
              displayName: String(msg.whiteName || 'White'),
              rating: Number(msg.whiteRating || 1200),
              rd: 150,
              vol: 0.06,
              timeLeftMs: parsed.initialMs,
              connected: whiteUid === ws.uid,
            },
            black: {
              uid: blackUid,
              displayName: String(msg.blackName || 'Black'),
              rating: Number(msg.blackRating || 1200),
              rd: 150,
              vol: 0.06,
              timeLeftMs: parsed.initialMs,
              connected: blackUid === ws.uid,
            },
            timeControl: tc,
            category: parsed.category,
            incrementMs: parsed.incrementMs,
            rated: msg.rated !== false,
            isTestMatch: false,
            status: 'active',
            drawOfferBy: null,
            rematchOfferedBy: new Set(),
            redoStack: [],
            lastMoveAt: Date.now(),
            createdAt: Date.now(),
          };
          liveRooms.set(roomId, room);
        }

        if (room) {
          pendingFinalRoomByUid.delete(room.white.uid);
          pendingFinalRoomByUid.delete(room.black.uid);
          if (room.white.uid === ws.uid) room.white.connected = true;
          if (room.black.uid === ws.uid) room.black.connected = true;
          ws.roomId = room.id;
          const payload = { type: 'game:started', room: serializeRoom(room) };
          sendJson(activeClients.get(room.white.uid), payload);
          sendJson(activeClients.get(room.black.uid), payload);
          broadcastPresence();
        }
        return;
      }

      if (type === 'game:move') {
        const roomId = String(msg.roomId || ws.roomId || '');
        const room = liveRooms.get(roomId);
        if (!room || room.status !== 'active') return;

        const turn = room.chess.turn();
        const expectedUid = turn === 'w' ? room.white.uid : room.black.uid;
        if (ws.uid !== expectedUid) {
          sendJson(ws, { type: 'error', message: 'Not your turn.' });
          return;
        }

        const now = Date.now();
        if (room.chess.history().length > 0) {
          const elapsed = now - room.lastMoveAt;
          if (turn === 'w') {
            room.white.timeLeftMs = Math.max(0, room.white.timeLeftMs - elapsed);
            if (room.white.timeLeftMs <= 0) {
              finalizeRoom(room, '0-1', 'timeout');
              return;
            }
          } else {
            room.black.timeLeftMs = Math.max(0, room.black.timeLeftMs - elapsed);
            if (room.black.timeLeftMs <= 0) {
              finalizeRoom(room, '1-0', 'timeout');
              return;
            }
          }
        }

        try {
          const move = room.chess.move({
            from: String(msg.from || ''),
            to: String(msg.to || ''),
            promotion: msg.promotion ? (String(msg.promotion) as 'q' | 'r' | 'b' | 'n') : undefined,
          });
          if (!move) {
            sendJson(ws, { type: 'error', message: 'Illegal move rejected by server.' });
            return;
          }

          if (turn === 'w') room.white.timeLeftMs += room.incrementMs;
          else room.black.timeLeftMs += room.incrementMs;

          room.lastMoveAt = now;
          room.drawOfferBy = null;
          room.redoStack = [];
          room.lastMove = { from: move.from, to: move.to, san: move.san };

          if (room.chess.isCheckmate()) {
            finalizeRoom(room, turn === 'w' ? '1-0' : '0-1', 'checkmate');
            return;
          }
          if (room.chess.isStalemate()) {
            finalizeRoom(room, '1/2-1/2', 'stalemate');
            return;
          }
          if (room.chess.isThreefoldRepetition()) {
            finalizeRoom(room, '1/2-1/2', 'repetition');
            return;
          }
          if (room.chess.isInsufficientMaterial()) {
            finalizeRoom(room, '1/2-1/2', 'insufficient');
            return;
          }
          if (room.chess.isDraw()) {
            finalizeRoom(room, '1/2-1/2', 'fifty-move');
            return;
          }

          const payload = { type: 'game:state', room: serializeRoom(room) };
          sendJson(activeClients.get(room.white.uid), payload);
          sendJson(activeClients.get(room.black.uid), payload);
        } catch {
          sendJson(ws, { type: 'error', message: 'Illegal move.' });
        }
        return;
      }

      if (type === 'game:resign') {
        const room = liveRooms.get(String(msg.roomId || ws.roomId || ''));
        if (!room || room.status !== 'active') return;
        if (ws.uid === room.white.uid) finalizeRoom(room, '0-1', 'resignation');
        else if (ws.uid === room.black.uid) finalizeRoom(room, '1-0', 'resignation');
        return;
      }

      if (type === 'game:draw_offer') {
        const room = liveRooms.get(String(msg.roomId || ws.roomId || ''));
        if (!room || room.status !== 'active') return;
        const side = ws.uid === room.white.uid ? 'w' : ws.uid === room.black.uid ? 'b' : null;
        if (!side) return;
        room.drawOfferBy = side;
        const payload = { type: 'game:state', room: serializeRoom(room) };
        sendJson(activeClients.get(room.white.uid), payload);
        sendJson(activeClients.get(room.black.uid), payload);
        return;
      }

      if (type === 'game:draw_accept') {
        const room = liveRooms.get(String(msg.roomId || ws.roomId || ''));
        if (!room || room.status !== 'active' || !room.drawOfferBy) return;
        const side = ws.uid === room.white.uid ? 'w' : ws.uid === room.black.uid ? 'b' : null;
        if (!side || side === room.drawOfferBy) return;
        finalizeRoom(room, '1/2-1/2', 'agreement');
        return;
      }

      if (type === 'game:draw_decline') {
        const room = liveRooms.get(String(msg.roomId || ws.roomId || ''));
        if (!room || room.status !== 'active') return;
        room.drawOfferBy = null;
        const payload = { type: 'game:state', room: serializeRoom(room) };
        sendJson(activeClients.get(room.white.uid), payload);
        sendJson(activeClients.get(room.black.uid), payload);
        return;
      }

      if (type === 'game:rematch') {
        const room = liveRooms.get(String(msg.roomId || ''));
        if (!room || room.status !== 'completed') return;
        if (ws.uid !== room.white.uid && ws.uid !== room.black.uid) return;
        room.rematchOfferedBy.add(ws.uid);
        if (room.rematchOfferedBy.has(room.white.uid) && room.rematchOfferedBy.has(room.black.uid)) {
          const parsed = parseTimeControl(room.timeControl);
          const newId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const newRoom: LiveGameRoom = {
            id: newId,
            chess: new Chess(),
            white: { ...room.black, timeLeftMs: parsed.initialMs },
            black: { ...room.white, timeLeftMs: parsed.initialMs },
            timeControl: room.timeControl,
            category: parsed.category,
            incrementMs: parsed.incrementMs,
            rated: room.rated,
            isTestMatch: room.isTestMatch,
            status: 'active',
            drawOfferBy: null,
            rematchOfferedBy: new Set(),
            redoStack: [],
            lastMoveAt: Date.now(),
            createdAt: Date.now(),
          };
          liveRooms.set(newId, newRoom);
          pendingFinalRoomByUid.delete(newRoom.white.uid);
          pendingFinalRoomByUid.delete(newRoom.black.uid);
          const wSock = activeClients.get(newRoom.white.uid);
          const bSock = activeClients.get(newRoom.black.uid);
          if (wSock) wSock.roomId = newId;
          if (bSock) bSock.roomId = newId;
          const payload = { type: 'game:started', room: serializeRoom(newRoom) };
          sendJson(wSock, payload);
          sendJson(bSock, payload);
          broadcastPresence();
        } else {
          const otherUid = ws.uid === room.white.uid ? room.black.uid : room.white.uid;
          sendJson(activeClients.get(otherUid), { type: 'game:rematch_offered', roomId: room.id });
        }
        return;
      }

      if (type === 'owner:cheat') {
        if (!ws.isOwner) {
          sendJson(ws, { type: 'error', message: 'Owner authorization required.' });
          return;
        }
        const room = liveRooms.get(String(msg.roomId || ws.roomId || ''));
        if (!room || room.status !== 'active') return;
        const ownerSide = ws.uid === room.white.uid ? 'w' : ws.uid === room.black.uid ? 'b' : null;
        if (!ownerSide) return;

        const action = String(msg.action || '');
        if (action === 'undo') {
          const undone = room.chess.undo();
          if (undone) {
            room.redoStack.unshift(undone.san);
            const hist = room.chess.history({ verbose: true });
            const prev = hist[hist.length - 1];
            room.lastMove = prev ? { from: prev.from, to: prev.to, san: prev.san } : null;
            room.lastMoveAt = Date.now();
            room.drawOfferBy = null;
            const payload = { type: 'game:state', room: serializeRoom(room) };
            sendJson(activeClients.get(room.white.uid), payload);
            sendJson(activeClients.get(room.black.uid), payload);
          }
          return;
        }

        if (action === 'redo') {
          const nextSan = room.redoStack.shift();
          if (nextSan) {
            try {
              const mv = room.chess.move(nextSan);
              if (mv) {
                room.lastMove = { from: mv.from, to: mv.to, san: mv.san };
                room.lastMoveAt = Date.now();
                room.drawOfferBy = null;
                if (room.chess.isCheckmate()) {
                  finalizeRoom(room, mv.color === 'w' ? '1-0' : '0-1', 'checkmate');
                  return;
                }
                const payload = { type: 'game:state', room: serializeRoom(room) };
                sendJson(activeClients.get(room.white.uid), payload);
                sendJson(activeClients.get(room.black.uid), payload);
              }
            } catch {
              // ignore invalid redo
            }
          }
          return;
        }

        if (action === 'add_time') {
          if (ownerSide === 'w') room.white.timeLeftMs += 60_000;
          else room.black.timeLeftMs += 60_000;
          const payload = { type: 'game:state', room: serializeRoom(room) };
          sendJson(activeClients.get(room.white.uid), payload);
          sendJson(activeClients.get(room.black.uid), payload);
          return;
        }

        if (action === 'draw') {
          finalizeRoom(room, '1/2-1/2', 'owner_override');
          return;
        }

        if (action === 'win') {
          finalizeRoom(room, ownerSide === 'w' ? '1-0' : '0-1', 'owner_override');
          return;
        }
      }
    });

    ws.on('close', () => {
      if (ws.uid) {
        const idx = matchmakingQueue.findIndex((q) => q.uid === ws.uid);
        if (idx !== -1) matchmakingQueue.splice(idx, 1);

        if (activeClients.get(ws.uid) === ws) {
          activeClients.delete(ws.uid);
        }

        if (ws.roomId) {
          const room = liveRooms.get(ws.roomId);
          if (room) {
            if (room.white.uid === ws.uid) room.white.connected = false;
            if (room.black.uid === ws.uid) room.black.connected = false;
            const payload = { type: 'game:state', room: serializeRoom(room) };
            sendJson(activeClients.get(room.white.uid), payload);
            sendJson(activeClients.get(room.black.uid), payload);
          }
        }
        broadcastPresence();
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`eChess server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start eChess server:', err);
  process.exit(1);
});
