import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Lightbulb, RotateCcw } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { ChessBoard, type BoardArrow } from '../components/ChessBoard';
import { BUILT_IN_LESSONS, type ChessLesson } from '../data/puzzlesAndLessons';
import { computePlayStreakUpdate, evaluateProfileAchievements } from '../data/achievements';
import { soundEngine } from '../utils/sound';

export function LessonsView() {
  const { firebaseUser, profile, unlockAchievement } = useAuth();
  const { t } = useLocale();
  const [customLessons, setCustomLessons] = useState<ChessLesson[]>([]);
  const [category, setCategory] = useState<'all' | 'opening' | 'middlegame' | 'endgame' | 'checkmate'>('all');
  const [selectedId, setSelectedId] = useState<string>(BUILT_IN_LESSONS[0].id);

  const [chess, setChess] = useState(() => new Chess(BUILT_IN_LESSONS[0].fen));
  const [fen, setFen] = useState(BUILT_IN_LESSONS[0].fen);
  const [completed, setCompleted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [wrongAttempt, setWrongAttempt] = useState(false);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, 'customLessons'), where('published', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChessLesson[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Custom Lesson'),
            category: (data.category as ChessLesson['category']) || 'middlegame',
            difficulty: 'Intermediate',
            summary: String(data.summary || ''),
            fen: String(data.fen),
            solutionMoves: Array.isArray(data.solutionMoves) ? data.solutionMoves : [],
            hint: 'Find the key thematic move.',
            coachNote: String(data.summary || ''),
          };
        });
        setCustomLessons(list);
      },
      () => {}
    );
    return () => unsub();
  }, [firebaseUser]);

  const allLessons = useMemo(() => [...BUILT_IN_LESSONS, ...customLessons], [customLessons]);
  const filtered = useMemo(
    () => (category === 'all' ? allLessons : allLessons.filter((l) => l.category === category)),
    [allLessons, category]
  );

  const activeLesson = allLessons.find((l) => l.id === selectedId) || filtered[0] || BUILT_IN_LESSONS[0];

  const resetLesson = (lesson: ChessLesson) => {
    try {
      const c = new Chess(lesson.fen);
      setChess(c);
      setFen(c.fen());
      setCompleted(false);
      setShowHint(false);
      setWrongAttempt(false);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    resetLesson(activeLesson);
  }, [activeLesson.id]);

  const handleMove = (mv: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    if (completed) return false;
    const expected = activeLesson.solutionMoves[0] || '';
    const played = `${mv.from}${mv.to}${mv.promotion || ''}`;
    const probe = new Chess(chess.fen());
    if (!probe.move(mv)) return false;

    if (played === expected || `${mv.from}${mv.to}` === expected) {
      chess.move(mv);
      setFen(chess.fen());
      setCompleted(true);
      setWrongAttempt(false);
      setCompletedIds((prev) => (prev.includes(activeLesson.id) ? prev : [...prev, activeLesson.id]));
      soundEngine.playSuccess();
      if (firebaseUser && profile) {
        const playPatch = computePlayStreakUpdate(profile);
        const nextSet = new Set(
          evaluateProfileAchievements({ ...profile, ...playPatch })
        );
        nextSet.add('lesson-graduate');
        void updateDoc(doc(db, 'users', firebaseUser.uid), {
          ...playPatch,
          achievements: Array.from(nextSet).slice(0, 60),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else {
        void unlockAchievement('lesson-graduate');
      }
      return true;
    } else {
      setWrongAttempt(true);
      soundEngine.playError();
      return false;
    }
  };

  const hintArrows: BoardArrow[] =
    showHint && activeLesson.solutionMoves[0]?.length >= 4
      ? [
          {
            from: activeLesson.solutionMoves[0].slice(0, 2),
            to: activeLesson.solutionMoves[0].slice(2, 4),
            color: '#F59E0B',
          },
        ]
      : [];

  return (
    <div className="max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Curriculum Sidebar */}
      <div className="lg:col-span-4 bg-[#12171E] border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-bold text-slate-100 inline-flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            {t('lessons.title')}
          </h1>
          <span className="font-mono text-xs text-emerald-400 tabular-nums">
            {completedIds.length}/{allLessons.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {([
            { id: 'all' as const, label: t('lessons.catAll') },
            { id: 'opening' as const, label: t('lessons.catOpening') },
            { id: 'middlegame' as const, label: t('lessons.catMiddlegame') },
            { id: 'endgame' as const, label: t('lessons.catEndgame') },
            { id: 'checkmate' as const, label: t('lessons.catCheckmate') },
          ]).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                category === cat.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#0B0E11] border border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-800/80 max-h-[460px] overflow-y-auto">
          {filtered.map((lesson) => {
            const done = completedIds.includes(lesson.id);
            const active = activeLesson.id === lesson.id;
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setSelectedId(lesson.id)}
                className={`w-full py-3 px-2.5 text-left flex items-center justify-between gap-2 rounded-lg transition-colors ${
                  active ? 'bg-emerald-950/40' : 'hover:bg-[#171E28]'
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${active ? 'text-emerald-300' : 'text-slate-100'}`}>
                    {lesson.title}
                  </p>
                  <p className="text-[11px] text-slate-400 capitalize">
                    {lesson.category} · {lesson.difficulty}
                  </p>
                </div>
                {done && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Lesson Board & Coach Guidance */}
      <div className="lg:col-span-8 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 flex justify-center">
          <ChessBoard
            fen={fen}
            orientation="w"
            interactive={!completed}
            allowedColor="w"
            boardThemeId={profile?.boardTheme}
            pieceStyle={profile?.pieceStyle}
            showCoordinates={profile?.showCoordinates ?? true}
            autoQueen={profile?.autoQueen ?? false}
            arrows={hintArrows}
            onMove={handleMove}
          />
        </div>

        <div className="xl:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-medium text-emerald-400 capitalize">
              {activeLesson.category} · {activeLesson.difficulty}
            </span>
            <h2 className="font-display text-lg font-bold text-slate-100">{activeLesson.title}</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{activeLesson.summary}</p>
          </div>

          {wrongAttempt && (
            <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3 text-xs text-rose-200">
              {t('lessons.wrongAttempt')}
            </div>
          )}

          {showHint && !completed && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-3 text-xs text-amber-200 space-y-1">
              <p className="font-semibold inline-flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5" /> {t('lessons.lessonHint')}
              </p>
              <p>{activeLesson.hint}</p>
            </div>
          )}

          {completed && (
            <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-300 inline-flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" /> {t('lessons.conceptMastered')}
              </p>
              <p className="text-xs text-slate-200 leading-relaxed">{activeLesson.coachNote}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={completed}
              onClick={() => setShowHint(true)}
              className="flex-1 py-2 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] disabled:opacity-40 border border-slate-700 text-xs font-medium text-slate-200"
            >
              {t('lessons.showHint')}
            </button>
            <button
              type="button"
              onClick={() => resetLesson(activeLesson)}
              className="py-2 px-3 rounded-lg bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('common.reset')}
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = filtered.findIndex((l) => l.id === activeLesson.id);
                const next = filtered[(idx + 1) % filtered.length];
                if (next) setSelectedId(next.id);
              }}
              className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              {t('lessons.nextLesson')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
