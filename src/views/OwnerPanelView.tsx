import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { apiUrl } from '../utils/backendUrl';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Activity,
  Calendar,
  Check,
  Clock,
  Copy,
  Crown,
  FlaskConical,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Users,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMultiplayer } from '../contexts/MultiplayerContext';
import { useComputerGame } from '../contexts/ComputerGameContext';
import { ChessBoard, EvaluationBar, type BoardArrow } from '../components/ChessBoard';
import { formatEvalDisplay, stockfishService } from '../engine/stockfishService';
import type {
  AccountStatus,
  ChessGameRecord,
  EngineEval,
  GameCategory,
  MembershipTier,
  PlatformFeatures,
  UserProfile,
  UserRole,
} from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';

interface TelemetryData {
  onlineSockets: number;
  activeMultiplayerGames: number;
  totalServerRooms: number;
  matchmakingQueue: number;
  uptimeSeconds: number;
  nodeVersion: string;
  memoryMb: number;
  stockfishAssetPresent: boolean;
}

interface ReportDoc {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolutionNote?: string;
}

interface AuditLogDoc {
  id: string;
  actorEmail: string;
  action: string;
  targetId?: string;
  details: string;
}

interface TestAccountDoc {
  id: string;
  displayName: string;
  username: string;
  ratings: { bullet: number; blitz: number; rapid: number; classical: number; puzzle: number };
  membership: MembershipTier;
  isTestAccount: boolean;
  createdAt?: unknown;
}

function toRecordMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') return obj.toMillis();
    if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  }
  return 0;
}

function formatRecordTimestamp(val: unknown): string {
  const ms = toRecordMillis(val);
  if (!ms) return 'Pending timestamp';
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EDITOR_PALETTE: { label: string; piece: string | null }[] = [
  { label: 'Clear', piece: null },
  { label: 'wK', piece: 'wK' },
  { label: 'wQ', piece: 'wQ' },
  { label: 'wR', piece: 'wR' },
  { label: 'wB', piece: 'wB' },
  { label: 'wN', piece: 'wN' },
  { label: 'wP', piece: 'wP' },
  { label: 'bK', piece: 'bK' },
  { label: 'bQ', piece: 'bQ' },
  { label: 'bR', piece: 'bR' },
  { label: 'bB', piece: 'bB' },
  { label: 'bN', piece: 'bN' },
  { label: 'bP', piece: 'bP' },
];

export function OwnerPanelView() {
  const { firebaseUser, profile, isOwner, ownerCheatMode, setOwnerCheatMode, platformConfig, getIdToken } = useAuth();
  const { t } = useLocale();
  const { activeRoom, ownerCheatAction } = useMultiplayer();
  const compGame = useComputerGame();
  const [section, setSection] = useState<'overview' | 'users' | 'platform' | 'lab' | 'sandbox'>('overview');

  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [localStockfishStatus, setLocalStockfishStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [gamesCount, setGamesCount] = useState(0);
  const [gamesList, setGamesList] = useState<ChessGameRecord[]>([]);
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDoc[]>([]);
  const [testAccounts, setTestAccounts] = useState<TestAccountDoc[]>([]);

  const [userSearch, setUserSearch] = useState('');
  const [ownerStatusMsg, setOwnerStatusMsg] = useState<string | null>(null);

  // OWNER LAB Search & Filter Bar State
  const [labRecordType, setLabRecordType] = useState<'all' | 'accounts' | 'games'>('all');
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [labGameCatFilter, setLabGameCatFilter] = useState<'all' | GameCategory>('all');
  const [labAccountTierFilter, setLabAccountTierFilter] = useState<'all' | MembershipTier>('all');
  const [labDatePreset, setLabDatePreset] = useState<'all' | 'today' | '7d' | '30d' | 'custom'>('all');
  const [labStartDate, setLabStartDate] = useState('');
  const [labEndDate, setLabEndDate] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Platform Control Form State
  const [maintenanceMode, setMaintenanceMode] = useState(platformConfig.maintenanceMode);
  const [maintenanceMessage, setMaintenanceMessage] = useState(platformConfig.maintenanceMessage || '');
  const [announcement, setAnnouncement] = useState(platformConfig.announcement || '');
  const [features, setFeatures] = useState<PlatformFeatures>(platformConfig.features);

  // Content Creation Form State
  const [newPuzzleTitle, setNewPuzzleTitle] = useState('');
  const [newPuzzleFen, setNewPuzzleFen] = useState('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  const [newPuzzleMove, setNewPuzzleMove] = useState('d1d8');
  const [newPuzzleRating, setNewPuzzleRating] = useState(1250);
  const [newPuzzleTheme, setNewPuzzleTheme] = useState('Back Rank');

  const [newTourneyName, setNewTourneyName] = useState('');
  const [newTourneyTc, setNewTourneyTc] = useState('3+2');

  // OWNER LAB — PRIVATE TOOLS STATE
  const [labChess, setLabChess] = useState(() => new Chess());
  const [labFen, setLabFen] = useState(new Chess().fen());
  const [labRedoStack, setLabRedoStack] = useState<string[]>([]);
  const [labOrientation, setLabOrientation] = useState<'w' | 'b'>('w');
  const [labMultiPv, setLabMultiPv] = useState(3);
  const [labShowArrows, setLabShowArrows] = useState(true);
  const [labPracticeAutoBot, setLabPracticeAutoBot] = useState(false);
  const [labBotColor, setLabBotColor] = useState<'w' | 'b'>('b');
  const [labLines, setLabLines] = useState<EngineEval[]>([]);
  const [labCustomFen, setLabCustomFen] = useState('');
  const [labEditorMode, setLabEditorMode] = useState(false);
  const [selectedBrush, setSelectedBrush] = useState<string | null>('wQ');
  const [labClockPaused, setLabClockPaused] = useState(true);
  const [labWhiteSec, setLabWhiteSec] = useState(300);
  const [labBlackSec, setLabBlackSec] = useState(300);
  const [labForcedResult, setLabForcedResult] = useState<string | null>(null);
  const [testSuiteOutput, setTestSuiteOutput] = useState<string[]>([]);

  // Test Account Form
  const [testDisplayName, setTestDisplayName] = useState('Sandbox GM Alpha');
  const [testRating, setTestRating] = useState(1850);
  const [testMembership, setTestMembership] = useState<MembershipTier>('diamond');

  useEffect(() => {
    setMaintenanceMode(platformConfig.maintenanceMode);
    setMaintenanceMessage(platformConfig.maintenanceMessage || '');
    setAnnouncement(platformConfig.announcement || '');
    setFeatures(platformConfig.features);
  }, [platformConfig]);

  const logOwnerAction = async (action: string, details: string, targetId = '') => {
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'ownerAuditLogs'), {
        actorUid: firebaseUser.uid,
        actorEmail: firebaseUser.email || 'owner',
        action: action.slice(0, 100),
        targetId: targetId.slice(0, 128),
        details: details.slice(0, 500),
        createdAt: serverTimestamp(),
      });
    } catch {
      // ignore
    }
  };

  const fetchTelemetry = async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/owner/telemetry'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTelemetry(await res.json());
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isOwner || !firebaseUser) return;
    fetchTelemetry();
    const tTimer = setInterval(fetchTelemetry, 8000);

    let mounted = true;
    stockfishService
      .checkReady()
      .then((ready) => {
        if (mounted) {
          setLocalStockfishStatus(ready ? 'ready' : 'error');
        }
      })
      .catch(() => {
        if (mounted) {
          setLocalStockfishStatus('error');
        }
      });

    const uUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => d.data() as UserProfile));
    }, () => {});

    const uGames = onSnapshot(
      query(collection(db, 'games'), orderBy('endedAt', 'desc'), limit(200)),
      (snap) => {
        setGamesCount(snap.size);
        setGamesList(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChessGameRecord, 'id'>),
          }))
        );
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'games');
        } catch {
          // Logged via handleFirestoreError
        }
      }
    );

    const uReports = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(40)), (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportDoc, 'id'>) })));
    }, () => {});

    const uLogs = onSnapshot(query(collection(db, 'ownerAuditLogs'), orderBy('createdAt', 'desc'), limit(40)), (snap) => {
      setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogDoc, 'id'>) })));
    }, () => {});

    const uTestAcc = onSnapshot(collection(db, 'ownerTestAccounts'), (snap) => {
      setTestAccounts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TestAccountDoc, 'id'>) })));
    }, () => {});

    return () => {
      mounted = false;
      clearInterval(tTimer);
      uUsers();
      uGames();
      uReports();
      uLogs();
      uTestAcc();
    };
  }, [isOwner, firebaseUser]);

  // OWNER LAB Live Stockfish Analysis
  useEffect(() => {
    if (!isOwner || section !== 'lab') return;
    let active = true;
    stockfishService.analyzePosition(labFen, {
      depth: 15,
      multiPv: labMultiPv,
      onUpdate: (lines) => {
        if (active) setLabLines(lines);
      },
    });
    return () => {
      active = false;
    };
  }, [isOwner, section, labFen, labMultiPv]);

  // OWNER LAB Practice Mode Auto-Bot
  useEffect(() => {
    if (!isOwner || section !== 'lab' || !labPracticeAutoBot || labForcedResult) return;
    if (labChess.turn() !== labBotColor || labChess.isGameOver()) return;
    const t = setTimeout(async () => {
      const best = await stockfishService.getBestBotMove(labChess.fen(), 'maximum');
      if (best && best.length >= 4) {
        const mv = labChess.move({
          from: best.slice(0, 2),
          to: best.slice(2, 4),
          promotion: best.length > 4 ? (best[4] as 'q' | 'r' | 'b' | 'n') : undefined,
        });
        if (mv) {
          setLabFen(labChess.fen());
          soundEngine.playMove();
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [isOwner, section, labPracticeAutoBot, labBotColor, labFen, labForcedResult]);

  // OWNER LAB Sandbox Clock
  useEffect(() => {
    if (labClockPaused || labForcedResult || section !== 'lab') return;
    const i = setInterval(() => {
      if (labChess.turn() === 'w') setLabWhiteSec((s) => Math.max(0, s - 1));
      else setLabBlackSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(i);
  }, [labClockPaused, labForcedResult, section, labFen]);

  if (!isOwner) {
    return (
      <div className="max-w-lg mx-auto bg-[#12171E] border border-rose-900/60 rounded-xl p-8 text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto" />
        <h1 className="font-display text-xl font-bold text-slate-100">
          Owner Authorization Required
        </h1>
        <p className="text-xs text-slate-400">
          The eChess Owner Panel is restricted strictly to the verified platform owner account.
        </p>
      </div>
    );
  }

  const updateUserAdmin = async (
    target: UserProfile,
    patch: { status?: AccountStatus; role?: UserRole; membership?: MembershipTier }
  ) => {
    await updateDoc(doc(db, 'users', target.uid), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    await logOwnerAction('USER_UPDATE', `Updated ${target.displayName}: ${JSON.stringify(patch)}`, target.uid);
    setOwnerStatusMsg(`Updated ${target.displayName}.`);
  };

  const resolveReport = async (rep: ReportDoc, nextStatus: 'resolved' | 'dismissed') => {
    await updateDoc(doc(db, 'reports', rep.id), {
      status: nextStatus,
      resolutionNote: `Reviewed by owner (${nextStatus})`,
      updatedAt: serverTimestamp(),
    });
    await logOwnerAction('REPORT_REVIEW', `Marked report ${rep.id} as ${nextStatus}`, rep.reportedUserId);
    setOwnerStatusMsg(`Report ${nextStatus}.`);
  };

  const savePlatformSettings = async () => {
    if (!firebaseUser) return;
    await setDoc(doc(db, 'platformConfig', 'settings'), {
      maintenanceMode,
      maintenanceMessage,
      announcement,
      features,
      activeTimeControls: platformConfig.activeTimeControls || ['1+0', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0'],
      updatedBy: firebaseUser.uid,
      updatedAt: serverTimestamp(),
    });
    await logOwnerAction('PLATFORM_CONFIG', `Saved platform config (maintenance=${maintenanceMode})`);
    setOwnerStatusMsg('Platform settings published.');
  };

  const createCustomPuzzle = async () => {
    if (!firebaseUser || !newPuzzleTitle.trim()) return;
    try {
      const c = new Chess(newPuzzleFen.trim());
      const mv = c.move({
        from: newPuzzleMove.slice(0, 2),
        to: newPuzzleMove.slice(2, 4),
        promotion: newPuzzleMove.length > 4 ? (newPuzzleMove[4] as 'q' | 'r' | 'b' | 'n') : undefined,
      });
      if (!mv) throw new Error('Invalid solution move for FEN');

      await addDoc(collection(db, 'customPuzzles'), {
        title: newPuzzleTitle.trim(),
        fen: newPuzzleFen.trim(),
        moves: [newPuzzleMove.trim()],
        rating: Number(newPuzzleRating),
        theme: newPuzzleTheme,
        published: true,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
      });
      await logOwnerAction('CREATE_PUZZLE', `Published puzzle "${newPuzzleTitle.trim()}"`);
      setNewPuzzleTitle('');
      setOwnerStatusMsg('Custom puzzle published to Puzzles Trainer!');
    } catch (err) {
      setOwnerStatusMsg(err instanceof Error ? err.message : 'Invalid puzzle FEN/move');
    }
  };

  const createTournament = async () => {
    if (!firebaseUser || !newTourneyName.trim()) return;
    await addDoc(collection(db, 'tournaments'), {
      name: newTourneyName.trim(),
      timeControl: newTourneyTc,
      format: 'swiss',
      status: 'upcoming',
      published: true,
      maxPlayers: 64,
      registeredCount: 0,
      createdBy: firebaseUser.uid,
      createdAt: serverTimestamp(),
    });
    await logOwnerAction('CREATE_TOURNAMENT', `Created tournament "${newTourneyName.trim()}"`);
    setNewTourneyName('');
    setOwnerStatusMsg('Tournament created.');
  };

  const createTestAccount = async () => {
    if (!testDisplayName.trim()) return;
    const handle = testDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) || 'test_gm';
    await addDoc(collection(db, 'ownerTestAccounts'), {
      displayName: testDisplayName.trim(),
      username: handle,
      ratings: {
        bullet: testRating,
        blitz: testRating,
        rapid: testRating,
        classical: testRating,
        puzzle: testRating,
      },
      membership: testMembership,
      isTestAccount: true,
      createdAt: serverTimestamp(),
    });
    await logOwnerAction('CREATE_TEST_ACCOUNT', `Created test account ${testDisplayName}`);
    setOwnerStatusMsg(`Test account "${testDisplayName}" created in sandbox.`);
  };

  const launchServerSandboxMatch = async () => {
    const token = await getIdToken();
    if (!token) return;
    const res = await fetch(apiUrl('/api/owner/test-match'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        timeControl: '5+0',
        whiteName: profile?.displayName || 'Owner White',
        blackName: 'Sandbox Test Opponent',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setOwnerStatusMsg(`Server sandbox test room created: ${data.room.id} (isolated from production ratings).`);
    }
  };

  const handleLabSquareEditor = (sq: Square) => {
    if (!labEditorMode) return;
    const clone = new Chess(labChess.fen());
    clone.remove(sq);
    if (selectedBrush) {
      const color = selectedBrush[0] as 'w' | 'b';
      const type = selectedBrush[1].toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
      clone.put({ type, color }, sq);
    }
    setLabChess(clone);
    setLabFen(clone.fen());
  };

  const runEngineTestSuite = async () => {
    const results: string[] = [];
    const c1 = new Chess();
    c1.move('e4');
    c1.move('e5');
    c1.move('Qh5');
    c1.move('Nc6');
    c1.move('Bc4');
    c1.move('Nf6');
    c1.move('Qxf7');
    results.push(`Scholar's Mate checkmate detection: ${c1.isCheckmate() ? 'PASS' : 'FAIL'}`);

    const c2 = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    c2.move('Nf3');
    results.push(`Legal castling rights preserved: ${c2.fen().includes('KQkq') ? 'PASS' : 'FAIL'}`);

    const sfReady = await stockfishService.checkReady();
    results.push(`Stockfish 19 WASM worker ready: ${sfReady ? 'PASS' : 'FAIL'}`);

    const sfLines = await stockfishService.analyzePosition('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', {
      depth: 10,
      multiPv: 1,
    });
    results.push(
      `Stockfish Mate-in-1 (Rd8#) accuracy: ${
        sfLines[0]?.bestMoveUci === 'd1d8' && sfLines[0]?.mate === 1 ? 'PASS' : `GOT ${sfLines[0]?.bestMoveUci}`
      }`
    );
    setTestSuiteOutput(results);
  };

  const labArrows: BoardArrow[] = useMemo(() => {
    if (!labShowArrows) return [];
    const colors = ['#10B981', '#38BDF8', '#F59E0B', '#A78BFA', '#FB7185'];
    return labLines
      .filter((l) => l.bestMoveUci && l.bestMoveUci.length >= 4)
      .map((l, idx) => ({
        from: l.bestMoveUci.slice(0, 2),
        to: l.bestMoveUci.slice(2, 4),
        color: colors[idx % colors.length],
      }));
  }, [labShowArrows, labLines]);

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const s = userSearch.toLowerCase();
    return u.displayName.toLowerCase().includes(s) || u.username.toLowerCase().includes(s) || u.uid.includes(s);
  });

  return (
    <div className="max-w-[1380px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs font-mono text-emerald-400">{t('owner.eyebrow')}</p>
          <h1 className="font-display text-2xl font-bold text-slate-100">{t('owner.title')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#12171E] border border-slate-800 rounded-xl p-1">
          {[
            { id: 'overview' as const, label: t('owner.tabOverview'), icon: Activity },
            { id: 'users' as const, label: t('owner.tabUsers'), icon: Users },
            { id: 'platform' as const, label: t('owner.tabPlatform'), icon: Sliders },
            { id: 'lab' as const, label: t('owner.tabLab'), icon: FlaskConical },
            { id: 'sandbox' as const, label: t('owner.tabSandbox'), icon: Cpu },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  section === item.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-[#19202A]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {ownerStatusMsg && (
        <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span>{ownerStatusMsg}</span>
          <button type="button" onClick={() => setOwnerStatusMsg(null)} className="text-emerald-300">
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Owner In-Game Cheat / Override Control */}
      <section className="bg-[#12171E] border border-amber-600/50 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="font-display text-base font-bold text-slate-100">
                {t('owner.overrideTitle')}
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  ownerCheatMode
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {ownerCheatMode ? t('owner.armed') : t('owner.off')}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Enable in-game cheat tools (Undo, Redo, Best-Move Assist, +60s Clock, and Instant Win) across <span className="text-slate-200 font-medium">Bots</span>, <span className="text-slate-200 font-medium">Real Players</span>, and <span className="text-slate-200 font-medium">Puzzles</span>, or trigger overrides directly below.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !ownerCheatMode;
              setOwnerCheatMode(next);
              void logOwnerAction(
                'OWNER_CHEAT_MODE',
                `Set owner in-game cheat mode to ${next ? 'ENABLED' : 'DISABLED'}`
              );
              setOwnerStatusMsg(
                next
                  ? 'Owner Cheat Mode ARMED: Undo, Redo, Best Move, and Instant Win are now unlocked in your games!'
                  : 'Owner Cheat Mode turned OFF.'
              );
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors shrink-0 ${
              ownerCheatMode
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            <Crown className="w-4 h-4" />
            {ownerCheatMode ? t('owner.cheatActiveBtn') : t('owner.cheatActivateBtn')}
          </button>
        </div>

        {/* Direct Remote Game Controls when an active game exists */}
        {activeRoom && activeRoom.status === 'active' && (
          <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-300">
                Active Online Match: {activeRoom.white.displayName} vs {activeRoom.black.displayName}
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Moves: {activeRoom.history.length} · Time Control: {activeRoom.timeControl}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  ownerCheatAction('undo');
                  setOwnerStatusMsg('Undid last move in active Online Match.');
                }}
                disabled={activeRoom.history.length === 0}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-400" /> {t('common.undo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  ownerCheatAction('redo');
                  setOwnerStatusMsg('Redid move in active Online Match.');
                }}
                disabled={!activeRoom.redoAvailable}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                <Redo2 className="w-3.5 h-3.5 text-amber-400" /> {t('common.redo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  ownerCheatAction('add_time');
                  setOwnerStatusMsg('Added +60 seconds to your clock in Online Match.');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" /> +60s
              </button>
              <button
                type="button"
                onClick={() => {
                  ownerCheatAction('win');
                  void logOwnerAction('OWNER_INSTANT_WIN', `Claimed instant win in online room ${activeRoom.id}`);
                  setOwnerStatusMsg('Instant Win applied to active Online Match!');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" /> Win Instantly
              </button>
            </div>
          </div>
        )}

        {compGame.gameStarted && !compGame.gameOverInfo && (
          <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-300">
                Active Computer Match ({compGame.difficulty.toUpperCase()} Bot)
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Moves: {compGame.history.length} · Playing as {compGame.playerSide === 'w' ? 'White' : 'Black'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  compGame.handleUndo(false);
                  setOwnerStatusMsg('Undid move in active Computer Match.');
                }}
                disabled={!compGame.canUndo}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-400" /> Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  compGame.handleRedo();
                  setOwnerStatusMsg('Redid move in active Computer Match.');
                }}
                disabled={!compGame.canRedo}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                <Redo2 className="w-3.5 h-3.5 text-amber-400" /> Redo
              </button>
              <button
                type="button"
                onClick={() => {
                  void compGame.handleOwnerAutoMove();
                  setOwnerStatusMsg('Played Stockfish best move in active Computer Match.');
                }}
                disabled={compGame.turn !== compGame.playerSide || compGame.botThinking}
                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-emerald-300 inline-flex items-center gap-1"
              >
                <Cpu className="w-3.5 h-3.5" /> Play Best Move
              </button>
              <button
                type="button"
                onClick={() => {
                  compGame.handleOwnerInstantWin();
                  void logOwnerAction('OWNER_INSTANT_WIN', `Claimed instant win in computer game vs ${compGame.difficulty}`);
                  setOwnerStatusMsg('Instant Win applied to active Computer Match!');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" /> Win Instantly
              </button>
            </div>
          </div>
        )}
      </section>

      {/* A. OWNER OVERVIEW */}
      {section === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Registered Users', val: users.length },
              { label: 'Online Sockets (Live)', val: telemetry?.onlineSockets ?? 0 },
              { label: 'Active Live Games', val: telemetry?.activeMultiplayerGames ?? 0 },
              { label: 'Completed Games', val: gamesCount },
              { label: 'Open Reports', val: reports.filter((r) => r.status === 'open').length },
              { label: 'Matchmaking Queue', val: telemetry?.matchmakingQueue ?? 0 },
              { label: 'Server Memory (MB)', val: telemetry ? telemetry.memoryMb : 'Offline' },
              {
                label: 'Stockfish WASM',
                val:
                  localStockfishStatus === 'ready' || telemetry?.stockfishAssetPresent
                    ? 'Ready'
                    : localStockfishStatus === 'checking'
                      ? 'Checking...'
                      : 'Missing',
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#12171E] border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className="font-mono text-2xl font-bold text-slate-100 tabular-nums mt-1">
                  {stat.val}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Immutable Owner Audit Log
            </h2>
            <div className="divide-y divide-slate-800/70 max-h-[300px] overflow-y-auto text-xs">
              {auditLogs.length === 0 ? (
                <p className="text-slate-500 py-4">No administrative audit events logged yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-mono font-semibold text-emerald-400 mr-2">{log.action}</span>
                      <span className="text-slate-200">{log.details}</span>
                    </div>
                    <span className="text-slate-500 font-mono shrink-0">{log.actorEmail}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* B. USER MANAGEMENT & REPORTS */}
      {section === 'users' && (
        <div className="space-y-6">
          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-slate-100">User Directory</h2>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, username, or UID..."
                className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 w-72"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Blitz / Rapid</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Membership</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid}>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-100">{u.displayName}</p>
                        <p className="text-slate-500 font-mono">@{u.username}</p>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300 tabular-nums">
                        {u.ratings?.blitz ?? 1200} / {u.ratings?.rapid ?? 1200}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={u.role}
                          onChange={(e) => updateUserAdmin(u, { role: e.target.value as UserRole })}
                          className="bg-[#0B0E11] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="user">user</option>
                          <option value="moderator">moderator</option>
                          <option value="owner">owner</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={u.membership}
                          onChange={(e) => updateUserAdmin(u, { membership: e.target.value as MembershipTier })}
                          className="bg-[#0B0E11] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="free">free</option>
                          <option value="plus">plus</option>
                          <option value="diamond">diamond</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 font-mono capitalize">
                        <span
                          className={
                            u.status === 'active'
                              ? 'text-emerald-400'
                              : u.status === 'suspended'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        {u.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => updateUserAdmin(u, { status: 'active' })}
                            className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/35"
                          >
                            Restore
                          </button>
                        )}
                        {u.status === 'active' && u.uid !== firebaseUser?.uid && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateUserAdmin(u, { status: 'suspended' })}
                              className="px-2.5 py-1 rounded bg-amber-600/20 text-amber-300 hover:bg-amber-600/35"
                            >
                              Suspend
                            </button>
                            <button
                              type="button"
                              onClick={() => updateUserAdmin(u, { status: 'banned' })}
                              className="px-2.5 py-1 rounded bg-rose-600/20 text-rose-300 hover:bg-rose-600/35"
                            >
                              Ban
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-100">Player Reports Queue</h2>
            {reports.length === 0 ? (
              <p className="text-xs text-slate-500">No reports submitted.</p>
            ) : (
              <div className="divide-y divide-slate-800/70 text-xs">
                {reports.map((r) => (
                  <div key={r.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-100">
                        {r.reason} · <span className="font-mono text-slate-400">Target: {r.reportedUserId}</span>
                      </p>
                      <p className="text-slate-400">{r.details || 'No additional notes'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono capitalize text-slate-400">{r.status}</span>
                      {r.status === 'open' && (
                        <>
                          <button
                            type="button"
                            onClick={() => resolveReport(r, 'resolved')}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveReport(r, 'dismissed')}
                            className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* C. PLATFORM CONTROL */}
      {section === 'platform' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Global Platform Flags & Maintenance
            </h2>

            <label className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-lg p-3 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-100">Maintenance Mode</p>
                <p className="text-[11px] text-slate-400">Locks ordinary players out while Owner retains full access</p>
              </div>
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Maintenance Message</label>
              <input
                type="text"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Scheduled engine upgrade in progress..."
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Global Announcement Banner</label>
              <input
                type="text"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Weekend Blitz Arena opens Friday!"
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-xs font-semibold text-slate-300">Feature Toggles</p>
              {(Object.keys(features) as (keyof PlatformFeatures)[])
                .filter((fk) => fk !== 'geminiCoach')
                .map((fk) => (
                <label key={fk} className="flex items-center justify-between text-xs text-slate-200 py-1">
                  <span className="capitalize">{fk.replace(/([A-Z])/g, ' $1')}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(features[fk])}
                    onChange={(e) => setFeatures((prev) => ({ ...prev, [fk]: e.target.checked }))}
                    className="accent-emerald-500 w-4 h-4"
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={savePlatformSettings}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Publish Platform Configuration
            </button>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-100">Publish Custom Puzzle</h2>
              <input
                type="text"
                value={newPuzzleTitle}
                onChange={(e) => setNewPuzzleTitle(e.target.value)}
                placeholder="Puzzle title"
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
              <input
                type="text"
                value={newPuzzleFen}
                onChange={(e) => setNewPuzzleFen(e.target.value)}
                placeholder="FEN string"
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-100"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newPuzzleMove}
                  onChange={(e) => setNewPuzzleMove(e.target.value)}
                  placeholder="UCI e.g. d1d8"
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-100"
                />
                <input
                  type="number"
                  value={newPuzzleRating}
                  onChange={(e) => setNewPuzzleRating(Number(e.target.value))}
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-100"
                />
                <input
                  type="text"
                  value={newPuzzleTheme}
                  onChange={(e) => setNewPuzzleTheme(e.target.value)}
                  placeholder="Theme"
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={createCustomPuzzle}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Publish Puzzle
              </button>
            </div>

            <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-100">Create Tournament</h2>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newTourneyName}
                  onChange={(e) => setNewTourneyName(e.target.value)}
                  placeholder="Tournament name"
                  className="col-span-2 bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
                />
                <input
                  type="text"
                  value={newTourneyTc}
                  onChange={(e) => setNewTourneyTc(e.target.value)}
                  placeholder="3+2"
                  className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-100"
                />
              </div>
              <button
                type="button"
                onClick={createTournament}
                className="px-4 py-2 rounded-lg bg-[#1A212B] hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold"
              >
                Create Tournament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. OWNER LAB — PRIVATE TOOLS */}
      {section === 'lab' && (
        <div className="space-y-4">
          <div className="bg-amber-950/30 border border-amber-700/50 rounded-xl px-4 py-2.5 text-xs text-amber-200">
            OWNER LAB — PRIVATE TOOLS: Strictly isolated to private owner sandbox, practice, and testing sessions. Zero impact on public competitive games or ratings.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Sandbox Board + Eval Bar + Clocks */}
            <div className="lg:col-span-6 flex flex-col items-center space-y-3">
              <div className="w-full max-w-[560px] flex items-center justify-between bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2">
                <span className="text-xs font-semibold text-slate-200">
                  {labOrientation === 'w' ? 'Sandbox Black' : 'Sandbox White'}
                </span>
                <span className="font-mono text-sm font-bold text-slate-200 tabular-nums">
                  {Math.floor((labOrientation === 'w' ? labBlackSec : labWhiteSec) / 60)}:
                  {((labOrientation === 'w' ? labBlackSec : labWhiteSec) % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="flex items-stretch justify-center gap-2.5 w-full max-w-[580px]">
                <EvaluationBar evaluation={labLines[0] || null} orientation={labOrientation} />
                <ChessBoard
                  fen={labFen}
                  orientation={labOrientation}
                  interactive={!labForcedResult}
                  allowBothSides={!labPracticeAutoBot}
                  allowedColor={labPracticeAutoBot ? (labBotColor === 'w' ? 'b' : 'w') : undefined}
                  boardThemeId={profile?.boardTheme}
                  pieceStyle={profile?.pieceStyle}
                  showCoordinates={true}
                  arrows={labArrows}
                  onSquareClickCustom={labEditorMode ? handleLabSquareEditor : undefined}
                  onMove={(mv) => {
                    try {
                      const played = labChess.move(mv);
                      if (!played) return false;
                      setLabRedoStack([]);
                      setLabFen(labChess.fen());
                      soundEngine.playMove();
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                />
              </div>

              <div className="w-full max-w-[560px] flex items-center justify-between bg-[#12171E] border border-slate-800 rounded-xl px-4 py-2">
                <span className="text-xs font-semibold text-slate-200">
                  {labOrientation === 'w' ? 'Sandbox White' : 'Sandbox Black'}
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                  {Math.floor((labOrientation === 'w' ? labWhiteSec : labBlackSec) / 60)}:
                  {((labOrientation === 'w' ? labWhiteSec : labBlackSec) % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Lab Controls & Engine Assistance */}
            <div className="lg:col-span-6 space-y-4">
              {/* 1. Engine Assistance */}
              <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    1. Engine Assistance (Top {labMultiPv} Lines)
                  </h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={labMultiPv}
                      onChange={(e) => setLabMultiPv(Number(e.target.value))}
                      className="bg-[#0B0E11] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      <option value={1}>Top 1</option>
                      <option value={3}>Top 3</option>
                      <option value={5}>Top 5</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setLabShowArrows((a) => !a)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        labShowArrows ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {labShowArrows ? 'Arrows On' : 'Arrows Off'}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  {labLines.map((line) => (
                    <div
                      key={line.multipvIndex}
                      className="bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-3"
                    >
                      <span className="w-12 font-bold text-emerald-400 tabular-nums shrink-0">
                        {formatEvalDisplay(line)}
                      </span>
                      <span className="text-slate-200 truncate">{line.pvSan.join(' ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Private Move Control & Board Editor */}
              <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-100">
                    2. Private Move Control & Position Editor
                  </h2>
                  <button
                    type="button"
                    onClick={() => setLabEditorMode((e) => !e)}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      labEditorMode ? 'bg-amber-600 text-white' : 'bg-[#0B0E11] border border-slate-800 text-slate-300'
                    }`}
                  >
                    {labEditorMode ? 'Exit Board Editor' : 'Edit Pieces'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const mv = labChess.undo();
                      if (mv) {
                        setLabRedoStack((r) => [mv.san, ...r]);
                        setLabFen(labChess.fen());
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Undo
                  </button>
                  <button
                    type="button"
                    disabled={labRedoStack.length === 0}
                    onClick={() => {
                      const [next, ...rest] = labRedoStack;
                      if (next && labChess.move(next)) {
                        setLabRedoStack(rest);
                        setLabFen(labChess.fen());
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 inline-flex items-center gap-1"
                  >
                    <Redo2 className="w-3.5 h-3.5" /> Redo
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200"
                  >
                    Flip ({labOrientation === 'w' ? 'White' : 'Black'})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const parts = labChess.fen().split(' ');
                      parts[1] = parts[1] === 'w' ? 'b' : 'w';
                      parts[3] = '-';
                      try {
                        const c = new Chess(parts.join(' '));
                        setLabChess(c);
                        setLabFen(c.fen());
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200"
                  >
                    Switch Turn
                  </button>
                </div>

                {labEditorMode && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {EDITOR_PALETTE.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setSelectedBrush(item.piece)}
                        className={`px-2 py-1 rounded text-xs font-mono ${
                          selectedBrush === item.piece
                            ? 'bg-amber-600 text-white'
                            : 'bg-[#0B0E11] border border-slate-800 text-slate-300'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={labCustomFen}
                    onChange={(e) => setLabCustomFen(e.target.value)}
                    placeholder="Load custom FEN..."
                    className="flex-1 bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const c = new Chess(labCustomFen.trim());
                        setLabChess(c);
                        setLabFen(c.fen());
                        setLabForcedResult(null);
                      } catch {
                        setOwnerStatusMsg('Invalid FEN syntax.');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Load FEN
                  </button>
                </div>
              </div>

              {/* 3 & 4. Private Game Controls & Owner Practice Mode */}
              <div className="bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-3">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  3. Private Game Controls & Owner Practice Mode
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLabClockPaused((p) => !p)}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1"
                  >
                    {labClockPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {labClockPaused ? 'Resume Clock' : 'Pause Clock'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLabWhiteSec(300);
                      setLabBlackSec(300);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200"
                  >
                    Set 5:00 / 5:00
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = new Chess();
                      setLabChess(c);
                      setLabFen(c.fen());
                      setLabForcedResult(null);
                      setLabRedoStack([]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabPracticeAutoBot((b) => !b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      labPracticeAutoBot ? 'bg-emerald-600 text-white' : 'bg-[#0B0E11] border border-slate-800 text-slate-300'
                    }`}
                  >
                    {labPracticeAutoBot ? 'Practice vs Max Stockfish: ON' : 'Practice vs Max Stockfish: OFF'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setLabForcedResult('1-0 (Forced Sandbox Test)')}
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-200"
                  >
                    Force 1-0
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabForcedResult('0-1 (Forced Sandbox Test)')}
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-200"
                  >
                    Force 0-1
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabForcedResult('1/2-1/2 (Forced Draw)')}
                    className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-200"
                  >
                    Force Draw
                  </button>
                  <button
                    type="button"
                    onClick={runEngineTestSuite}
                    className="px-3 py-1 rounded bg-emerald-600/20 border border-emerald-700/60 text-emerald-300 text-xs font-semibold"
                  >
                    Run Automated Engine Tests
                  </button>
                </div>

                {labForcedResult && (
                  <p className="text-xs font-mono text-amber-300">Sandbox Outcome: {labForcedResult}</p>
                )}

                {testSuiteOutput.length > 0 && (
                  <div className="bg-[#0B0E11] border border-slate-800 rounded-lg p-3 space-y-1 font-mono text-xs text-emerald-300">
                    {testSuiteOutput.map((line, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Test Accounts & Game Records Search / Filter Explorer */}
          <div className="bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100 inline-flex items-center gap-2">
                  <Search className="w-4 h-4 text-emerald-400" />
                  4. Test Accounts & Game Records Explorer
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Search and filter isolated test accounts or archived game records by ID, username, category, or date range.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-[#0B0E11] border border-slate-800 rounded-lg p-1">
                {(
                  [
                    { id: 'all', label: 'All Records' },
                    { id: 'accounts', label: `Test Accounts (${testAccounts.length})` },
                    { id: 'games', label: `Game Records (${gamesList.length})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLabRecordType(t.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      labRecordType === t.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5">
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={labSearchQuery}
                  onChange={(e) => setLabSearchQuery(e.target.value)}
                  placeholder="Search by record ID, username, display name, or player..."
                  aria-label="Search test accounts or game records by ID or username"
                  className="w-full bg-[#12171E] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                {labRecordType !== 'accounts' && (
                  <select
                    aria-label="Filter games by category"
                    value={labGameCatFilter}
                    onChange={(e) => setLabGameCatFilter(e.target.value as 'all' | GameCategory)}
                    className="flex-1 bg-[#12171E] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value="all">All Game Modes</option>
                    <option value="bullet">Bullet</option>
                    <option value="blitz">Blitz</option>
                    <option value="rapid">Rapid</option>
                    <option value="classical">Classical</option>
                    <option value="bot">Bot</option>
                    <option value="sandbox">Sandbox</option>
                  </select>
                )}
                {labRecordType !== 'games' && (
                  <select
                    aria-label="Filter test accounts by membership"
                    value={labAccountTierFilter}
                    onChange={(e) => setLabAccountTierFilter(e.target.value as 'all' | MembershipTier)}
                    className="flex-1 bg-[#12171E] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value="all">All Tiers</option>
                    <option value="free">Free</option>
                    <option value="plus">Plus</option>
                    <option value="diamond">Diamond</option>
                  </select>
                )}
              </div>

              <div className="md:col-span-4 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    aria-label="Filter by date range preset"
                    value={labDatePreset}
                    onChange={(e) => setLabDatePreset(e.target.value as typeof labDatePreset)}
                    className="w-full bg-[#12171E] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                </div>

                {(labSearchQuery ||
                  labGameCatFilter !== 'all' ||
                  labAccountTierFilter !== 'all' ||
                  labDatePreset !== 'all' ||
                  labStartDate ||
                  labEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLabSearchQuery('');
                      setLabGameCatFilter('all');
                      setLabAccountTierFilter('all');
                      setLabDatePreset('all');
                      setLabStartDate('');
                      setLabEndDate('');
                    }}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 shrink-0"
                  >
                    Reset
                  </button>
                )}
              </div>

              {labDatePreset === 'custom' && (
                <div className="md:col-span-12 flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
                  <label className="inline-flex items-center gap-2 text-slate-400">
                    <span>From</span>
                    <input
                      type="date"
                      value={labStartDate}
                      onChange={(e) => setLabStartDate(e.target.value)}
                      className="bg-[#12171E] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-slate-400">
                    <span>To</span>
                    <input
                      type="date"
                      value={labEndDate}
                      onChange={(e) => setLabEndDate(e.target.value)}
                      className="bg-[#12171E] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-100"
                    />
                  </label>
                </div>
              )}
            </div>

            {(() => {
              const q = labSearchQuery.trim().toLowerCase();
              const now = new Date();
              const startOfTodayMs = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
              ).getTime();

              let rangeMinMs = 0;
              let rangeMaxMs = Number.MAX_SAFE_INTEGER;
              if (labDatePreset === 'today') {
                rangeMinMs = startOfTodayMs;
              } else if (labDatePreset === '7d') {
                rangeMinMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
              } else if (labDatePreset === '30d') {
                rangeMinMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
              } else if (labDatePreset === 'custom') {
                if (labStartDate) {
                  const [sy, sm, sd] = labStartDate.split('-').map(Number);
                  rangeMinMs = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0).getTime();
                }
                if (labEndDate) {
                  const [ey, em, ed] = labEndDate.split('-').map(Number);
                  rangeMaxMs = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999).getTime();
                }
              }

              const inDateWindow = (tsVal: unknown) => {
                if (labDatePreset === 'all') return true;
                const ms = toRecordMillis(tsVal);
                if (!ms) return false;
                return ms >= rangeMinMs && ms <= rangeMaxMs;
              };

              const matchingAccounts =
                labRecordType === 'games'
                  ? []
                  : testAccounts.filter((ta) => {
                      if (labAccountTierFilter !== 'all' && ta.membership !== labAccountTierFilter) {
                        return false;
                      }
                      if (!inDateWindow(ta.createdAt)) return false;
                      if (!q) return true;
                      return (
                        ta.id.toLowerCase().includes(q) ||
                        ta.username.toLowerCase().includes(q) ||
                        ta.displayName.toLowerCase().includes(q)
                      );
                    });

              const matchingGames =
                labRecordType === 'accounts'
                  ? []
                  : gamesList.filter((g) => {
                      if (labGameCatFilter !== 'all' && g.category !== labGameCatFilter) {
                        return false;
                      }
                      if (!inDateWindow(g.endedAt || g.createdAt)) return false;
                      if (!q) return true;
                      return (
                        g.id.toLowerCase().includes(q) ||
                        g.whiteId.toLowerCase().includes(q) ||
                        g.blackId.toLowerCase().includes(q) ||
                        g.whiteName.toLowerCase().includes(q) ||
                        g.blackName.toLowerCase().includes(q) ||
                        (g.openingName || '').toLowerCase().includes(q) ||
                        g.timeControl.toLowerCase().includes(q)
                      );
                    });

              const copyRecordId = (id: string) => {
                if (navigator.clipboard) {
                  void navigator.clipboard.writeText(id);
                }
                setCopiedId(id);
                setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
              };

              return (
                <div className="space-y-4">
                  {/* Filtered Test Accounts */}
                  {labRecordType !== 'games' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">
                          Matching Test Accounts ({matchingAccounts.length})
                        </span>
                      </div>
                      {matchingAccounts.length === 0 ? (
                        <p className="text-xs text-slate-500 bg-[#0B0E11] border border-slate-800/80 rounded-lg py-4 text-center">
                          No test accounts match the current search or date filters.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-800/70 bg-[#0B0E11] border border-slate-800 rounded-xl max-h-60 overflow-y-auto">
                          {matchingAccounts.map((ta) => (
                            <div
                              key={ta.id}
                              className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-100">{ta.displayName}</span>
                                  <span className="font-mono text-emerald-400">@{ta.username}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300 uppercase">
                                    {ta.membership}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                                  <span>ID: {ta.id}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyRecordId(ta.id)}
                                    className="text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1"
                                    title="Copy account ID"
                                  >
                                    {copiedId === ta.id ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                  <span>· Blitz {ta.ratings?.blitz ?? 1200}</span>
                                  <span>· {formatRecordTimestamp(ta.createdAt)}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => deleteDoc(doc(db, 'ownerTestAccounts', ta.id))}
                                className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 shrink-0"
                                title="Delete test account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Filtered Game Records */}
                  {labRecordType !== 'accounts' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300">
                          Matching Game Records ({matchingGames.length})
                        </span>
                      </div>
                      {matchingGames.length === 0 ? (
                        <p className="text-xs text-slate-500 bg-[#0B0E11] border border-slate-800/80 rounded-lg py-4 text-center">
                          No game records match the current search, mode, or date range filters.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-800/70 bg-[#0B0E11] border border-slate-800 rounded-xl max-h-72 overflow-y-auto">
                          {matchingGames.map((g) => (
                            <div
                              key={g.id}
                              className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-100">
                                    {g.whiteName} vs {g.blackName}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-400">
                                    {g.result}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300 uppercase">
                                    {g.category} · {g.timeControl}
                                  </span>
                                  {g.isTestGame && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-700/50 font-mono text-[10px] text-amber-300">
                                      TEST
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                                  <span>ID: {g.id}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyRecordId(g.id)}
                                    className="text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1"
                                    title="Copy game ID"
                                  >
                                    {copiedId === g.id ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                  <span>· {g.openingName || 'Chess'}</span>
                                  <span>· {formatRecordTimestamp(g.endedAt || g.createdAt)}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    const c = new Chess();
                                    if (g.pgn && g.pgn.trim()) {
                                      c.loadPgn(g.pgn);
                                    } else if (g.finalFen) {
                                      c.load(g.finalFen);
                                    }
                                    setLabChess(c);
                                    setLabFen(c.fen());
                                    setLabRedoStack([]);
                                    setLabForcedResult(null);
                                    setOwnerStatusMsg(`Loaded game "${g.whiteName} vs ${g.blackName}" (${g.id}) into Owner Lab board.`);
                                  } catch {
                                    if (g.finalFen) {
                                      const c = new Chess(g.finalFen);
                                      setLabChess(c);
                                      setLabFen(c.fen());
                                      setOwnerStatusMsg(`Loaded final FEN from game ${g.id} into Owner Lab board.`);
                                    }
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#1A212B] hover:bg-emerald-600/25 border border-slate-700 hover:border-emerald-500/60 text-xs font-medium text-emerald-300 shrink-0"
                              >
                                Load in Lab Board
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* E. OWNER TEST ACCOUNT SANDBOX */}
      {section === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Create Isolated Test Account
            </h2>
            <p className="text-xs text-slate-400">
              Test accounts are tagged <span className="font-mono text-emerald-400">isTestAccount: true</span> and excluded from production leaderboards.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Test Account Name</label>
              <input
                type="text"
                value={testDisplayName}
                onChange={(e) => setTestDisplayName(e.target.value)}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Starting Rating</label>
                <input
                  type="number"
                  value={testRating}
                  onChange={(e) => setTestRating(Number(e.target.value))}
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Membership</label>
                <select
                  value={testMembership}
                  onChange={(e) => setTestMembership(e.target.value as MembershipTier)}
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value="free">Free</option>
                  <option value="plus">Plus</option>
                  <option value="diamond">Diamond</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createTestAccount}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                Create Test Account
              </button>
              <button
                type="button"
                onClick={launchServerSandboxMatch}
                className="py-2.5 px-3 rounded-lg bg-[#1A212B] hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium"
              >
                Spawn Test Match
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Sandbox Test Accounts ({testAccounts.length})
            </h2>
            {testAccounts.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">No test accounts created yet.</p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {testAccounts.map((ta) => (
                  <div key={ta.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {ta.displayName}{' '}
                        <span className="font-mono text-xs text-emerald-400">[TEST DATA]</span>
                      </p>
                      <p className="text-xs font-mono text-slate-400">
                        @{ta.username} · Rating {ta.ratings.blitz} · {ta.membership}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'ownerTestAccounts', ta.id))}
                      className="p-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300"
                      title="Delete test account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
