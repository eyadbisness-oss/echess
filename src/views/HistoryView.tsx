import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { BarChart3, Download, History, Search } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import type { ChessGameRecord } from '../shared/chessTypes';

export function HistoryView({
  onOpenReview,
}: {
  onOpenReview: (pgn: string, meta?: Partial<ChessGameRecord>) => void;
}) {
  const { firebaseUser } = useAuth();
  const { t } = useLocale();
  const [games, setGames] = useState<ChessGameRecord[]>([]);
  const [filterCat, setFilterCat] = useState<'all' | 'online' | 'bot'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!firebaseUser) return;
    const q1 = query(
      collection(db, 'games'),
      where('whiteId', '==', firebaseUser.uid),
      orderBy('endedAt', 'desc'),
      limit(40)
    );
    const q2 = query(
      collection(db, 'games'),
      where('blackId', '==', firebaseUser.uid),
      orderBy('endedAt', 'desc'),
      limit(40)
    );

    let wList: ChessGameRecord[] = [];
    let bList: ChessGameRecord[] = [];
    const sync = () => {
      const merged = new Map<string, ChessGameRecord>();
      for (const g of [...wList, ...bList]) merged.set(g.id, g);
      setGames(Array.from(merged.values()));
    };

    const u1 = onSnapshot(q1, (snap) => {
      wList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChessGameRecord, 'id'>) }));
      sync();
    }, () => {});
    const u2 = onSnapshot(q2, (snap) => {
      bList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChessGameRecord, 'id'>) }));
      sync();
    }, () => {});

    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (filterCat === 'bot' && g.category !== 'bot') return false;
      if (filterCat === 'online' && g.category === 'bot') return false;
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        return (
          g.whiteName.toLowerCase().includes(s) ||
          g.blackName.toLowerCase().includes(s) ||
          (g.openingName || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [games, filterCat, searchTerm]);

  const downloadPgn = (game: ChessGameRecord) => {
    const blob = new Blob([game.pgn || ''], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echess_${game.id}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100 inline-flex items-center gap-2.5">
            <History className="w-6 h-6 text-emerald-400" />
            {t('history.title')}
          </h1>
          <p className="text-sm text-slate-400">
            {t('history.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="bg-[#12171E] border border-slate-800 rounded-lg ps-9 pe-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#12171E] border border-slate-800 rounded-lg p-1">
            {([
              { id: 'all' as const, label: t('history.filterAll') },
              { id: 'online' as const, label: t('history.filterOnline') },
              { id: 'bot' as const, label: t('history.filterBot') },
            ]).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilterCat(cat.id)}
                className={`px-3 py-1 rounded text-xs font-medium capitalize ${
                  filterCat === cat.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredGames.length === 0 ? (
        <div className="bg-[#12171E] border border-slate-800 rounded-xl p-12 text-center space-y-2">
          <History className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm text-slate-300">{t('history.emptyTitle')}</p>
          <p className="text-xs text-slate-500">
            {t('history.emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="bg-[#12171E] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0F1319]">
                  <th className="py-3 px-4 font-medium">{t('history.colPlayers')}</th>
                  <th className="py-3 px-4 font-medium">{t('history.colOpening')}</th>
                  <th className="py-3 px-4 font-medium">{t('history.colResult')}</th>
                  <th className="py-3 px-4 font-medium">{t('history.colTimeControl')}</th>
                  <th className="py-3 px-4 font-medium text-end">{t('history.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {filteredGames.map((g) => (
                  <tr key={g.id} className="hover:bg-[#171D26] transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-100">
                        {g.whiteName} <span className="font-mono text-slate-400">({g.whiteRating ?? 1200})</span>
                      </p>
                      <p className="text-slate-300">
                        {g.blackName} <span className="font-mono text-slate-400">({g.blackRating ?? 1200})</span>
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <span className="font-mono text-emerald-400 me-1.5">{g.eco || 'A00'}</span>
                      {g.openingName || 'Chess Game'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span className="font-bold text-slate-100">{g.result}</span>
                      <span className="block text-[11px] text-slate-400 capitalize">{g.termination}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 capitalize">
                      {g.timeControl} · {g.category}
                    </td>
                    <td className="py-3 px-4 text-end">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenReview(g.pgn, g)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center gap-1"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          {t('common.review')}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPgn(g)}
                          className="p-1.5 rounded-lg bg-[#1A212B] hover:bg-slate-700 text-slate-300"
                          title={t('history.downloadPgn')}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
