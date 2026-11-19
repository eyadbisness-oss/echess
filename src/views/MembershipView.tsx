import { Check, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';

const TIERS = [
  {
    id: 'free',
    audienceKey: 'membership.freeAudience' as const,
    name: 'eChess Free',
    price: '$0 / month',
    features: [
      'Unlimited online Bullet, Blitz, Rapid & Classical games',
      'Play all 7 Stockfish 19 WASM computer levels',
      'All 8 custom board themes & 4 piece styles',
      'Daily Puzzle + standard tactical trainer',
      '1 Full Game Review per session',
    ],
  },
  {
    id: 'plus',
    audienceKey: 'membership.plusAudience' as const,
    name: 'eChess Plus',
    price: '$6 / month',
    features: [
      'Unlimited Stockfish 19 Full Game Reviews (Deep d16)',
      'Full Opening Explorer & ECO repertoire plans',
      'Unlimited tactical puzzle themes & streaks',
      'Priority matchmaking & custom profile badge',
      'Complete Academy lessons library',
    ],
  },
  {
    id: 'diamond',
    audienceKey: 'membership.diamondAudience' as const,
    name: 'eChess Diamond',
    price: '$12 / month',
    features: [
      'Maximum Stockfish 19 Depth (d19) & 5-line MultiPV',
      'Unlimited Gemini Chess Coach Q&A in Home Menu',
      'Complete Opening, Middlegame & Endgame performance splits',
      'Full PGN archive export & tournament entry priority',
      'Exclusive Diamond tier profile emblem',
    ],
  },
];

export function MembershipView() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const current = profile?.membership || 'free';

  return (
    <div className="max-w-[1140px] mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-slate-100 inline-flex items-center gap-2.5">
          <Crown className="w-6 h-6 text-emerald-400" />
          {t('membership.title')}
        </h1>
        <p className="text-sm text-slate-400">
          {t('membership.subtitlePrefix')}{' '}
          <span className="capitalize font-semibold text-emerald-400">{current}</span>.{' '}
          {t('membership.subtitleSuffix')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIERS.map((tier) => {
          const isActive = current === tier.id;
          return (
            <div
              key={tier.id}
              className={`rounded-xl border p-6 flex flex-col justify-between space-y-5 ${
                isActive
                  ? 'bg-emerald-950/25 border-emerald-500'
                  : 'bg-[#12171E] border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <p className="text-xs text-slate-400">{t(tier.audienceKey)}</p>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl font-bold text-slate-100">{tier.name}</h2>
                  <span className="font-mono text-sm font-semibold text-emerald-400">{tier.price}</span>
                </div>
                <ul className="space-y-2 pt-2">
                  {tier.features.map((f) => (
                    <li key={f} className="text-xs text-slate-300 flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2">
                <div
                  className={`w-full py-2.5 rounded-lg text-center text-xs font-semibold ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#0B0E11] border border-slate-800 text-slate-400'
                  }`}
                >
                  {isActive ? t('membership.currentActive') : t('membership.managedAccount')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
