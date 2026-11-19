import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore';
import {
  Ban,
  Check,
  Flag,
  Search,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { getActivePlayStreak } from '../data/achievements';
import { AchievementBadgesGrid } from '../components/AchievementBadges';
import { RatingHistoryChart } from '../components/RatingHistoryChart';
import type { TimeCategory, UserProfile } from '../shared/chessTypes';
import type { AppView } from './HomeView';

interface FriendshipDoc {
  id: string;
  requesterId: string;
  recipientId: string;
  requesterName?: string;
  recipientName?: string;
  users: string[];
  status: 'pending' | 'accepted' | 'blocked';
}

export function SocialView({
  onNavigate,
  initialTab = 'leaderboards',
}: {
  onNavigate: (v: AppView) => void;
  initialTab?: 'leaderboards' | 'friends' | 'achievements' | 'profile';
}) {
  const { firebaseUser, profile, unlockAchievement, signInWithGoogle } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<'leaderboards' | 'friends' | 'achievements' | 'profile'>(initialTab);

  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [friendships, setFriendships] = useState<FriendshipDoc[]>([]);
  const [lbCategory, setLbCategory] = useState<TimeCategory | 'puzzle'>('blitz');
  const [lbScope, setLbScope] = useState<'global' | 'country' | 'friends'>('global');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const [reportTarget, setReportTarget] = useState<UserProfile | null>(null);
  const [reportReason, setReportReason] = useState('Fair Play Violation');
  const [reportDetails, setReportDetails] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const qUsers = query(
      collection(db, 'users'),
      where('status', '==', 'active'),
      limit(100)
    );
    const u1 = onSnapshot(
      qUsers,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UserProfile)
          .filter((u) => !u.isTestAccount);
        setPlayers(list);
      },
      () => {}
    );

    const qFriends = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', firebaseUser.uid)
    );
    const u2 = onSnapshot(
      qFriends,
      (snap) => {
        setFriendships(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendshipDoc, 'id'>) }))
        );
      },
      () => {}
    );

    return () => {
      u1();
      u2();
    };
  }, [firebaseUser]);

  const acceptedFriendIds = useMemo(() => {
    const ids = new Set<string>();
    if (firebaseUser) ids.add(firebaseUser.uid);
    for (const f of friendships) {
      if (f.status === 'accepted') {
        for (const u of f.users) ids.add(u);
      }
    }
    return ids;
  }, [friendships, firebaseUser]);

  const blockedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of friendships) {
      if (f.status === 'blocked') {
        for (const u of f.users) {
          if (u !== firebaseUser?.uid) ids.add(u);
        }
      }
    }
    return ids;
  }, [friendships, firebaseUser]);

  const leaderboardRows = useMemo(() => {
    return players
      .filter((p) => {
        if (lbScope === 'country' && profile?.country && p.country !== profile.country) return false;
        if (lbScope === 'friends' && !acceptedFriendIds.has(p.uid)) return false;
        if (searchQuery.trim()) {
          const s = searchQuery.toLowerCase();
          return (
            p.displayName.toLowerCase().includes(s) ||
            p.username.toLowerCase().includes(s)
          );
        }
        return true;
      })
      .sort((a, b) => (b.ratings?.[lbCategory] ?? 1200) - (a.ratings?.[lbCategory] ?? 1200));
  }, [players, lbScope, lbCategory, profile?.country, acceptedFriendIds, searchQuery]);

  const sendFriendRequest = async (target: UserProfile) => {
    if (!firebaseUser || !profile || target.uid === firebaseUser.uid) return;
    const exists = friendships.some((f) => f.users.includes(target.uid));
    if (exists) {
      setFeedback(`Connection with ${target.displayName} already exists.`);
      return;
    }
    await addDoc(collection(db, 'friendships'), {
      requesterId: firebaseUser.uid,
      recipientId: target.uid,
      requesterName: profile.displayName,
      recipientName: target.displayName,
      users: [firebaseUser.uid, target.uid],
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'notifications'), {
      userId: target.uid,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${profile.displayName} sent you a friend request.`,
      read: false,
      actionRoute: 'social',
      createdAt: serverTimestamp(),
    });
    setFeedback(`Friend request sent to ${target.displayName}.`);
  };

  const acceptFriend = async (f: FriendshipDoc) => {
    await updateDoc(doc(db, 'friendships', f.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    await unlockAchievement('social-circle');
    setFeedback('Friend added!');
  };

  const blockUser = async (target: UserProfile) => {
    if (!firebaseUser || !profile) return;
    const existing = friendships.find((f) => f.users.includes(target.uid));
    if (existing) {
      await updateDoc(doc(db, 'friendships', existing.id), {
        status: 'blocked',
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, 'friendships'), {
        requesterId: firebaseUser.uid,
        recipientId: target.uid,
        requesterName: profile.displayName,
        recipientName: target.displayName,
        users: [firebaseUser.uid, target.uid],
        status: 'blocked',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    setFeedback(`${target.displayName} has been blocked.`);
  };

  const sendChallenge = async (target: UserProfile) => {
    if (!firebaseUser || !profile) return;
    await addDoc(collection(db, 'challenges'), {
      challengerId: firebaseUser.uid,
      challengerName: profile.displayName,
      challengerRating: profile.ratings?.blitz ?? 1200,
      targetId: target.uid,
      targetName: target.displayName,
      timeControl: '5+0',
      category: 'blitz',
      colorPreference: 'random',
      rated: true,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'notifications'), {
      userId: target.uid,
      type: 'challenge',
      title: 'Match Challenge',
      message: `${profile.displayName} challenged you to a 5+0 Blitz match.`,
      read: false,
      actionRoute: 'play-online',
      createdAt: serverTimestamp(),
    });
    setFeedback(`5+0 challenge sent to ${target.displayName}. Redirecting to Online Arena...`);
    onNavigate('play-online');
  };

  const submitReport = async () => {
    if (!firebaseUser || !reportTarget) return;
    await addDoc(collection(db, 'reports'), {
      reporterId: firebaseUser.uid,
      reportedUserId: reportTarget.uid,
      reason: reportReason,
      details: reportDetails.slice(0, 500),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setFeedback(`Report submitted for ${reportTarget.displayName}.`);
    setReportTarget(null);
    setReportDetails('');
  };

  const activeProfile = inspectedUser || profile;

  return (
    <div className="max-w-[1280px] mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            {t('social.title')}
          </h1>
          <p className="text-sm text-slate-400">
            {t('social.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#12171E] border border-slate-800 rounded-xl p-1">
          {[
            { id: 'leaderboards' as const, label: t('social.tabLeaderboards') },
            { id: 'friends' as const, label: t('social.tabFriends') },
            { id: 'achievements' as const, label: t('social.tabAchievements') },
            { id: 'profile' as const, label: t('social.tabProfile') },
          ].map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] whitespace-nowrap ${
                tab === tabItem.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="animate-menu-popover bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* LEADERBOARDS */}
      {tab === 'leaderboards' && (
        <div key="tab-leaderboards" className="animate-menu-view bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'bullet', label: t('common.bullet') },
                  { id: 'blitz', label: t('common.blitz') },
                  { id: 'rapid', label: t('common.rapid') },
                  { id: 'classical', label: t('common.classical') },
                  { id: 'puzzle', label: t('common.puzzle') },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setLbCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    lbCategory === cat.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#0B0E11] border border-slate-800 text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {(
                [
                  { id: 'global', label: t('social.scopeGlobal') },
                  { id: 'country', label: t('social.scopeCountry') },
                  { id: 'friends', label: t('social.scopeFriends') },
                ] as const
              ).map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setLbScope(sc.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                    lbScope === sc.id
                      ? 'bg-[#1D2633] text-emerald-300 border border-emerald-700/60'
                      : 'bg-[#0B0E11] text-slate-400 border border-slate-800'
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-2.5 px-3 font-medium">{t('social.colRank')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('social.colPlayer')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('social.colCountry')}</th>
                  <th className="py-2.5 px-3 font-medium">{t('social.colGames')}</th>
                  <th className="py-2.5 px-3 font-medium text-end">{t('social.colRating')}</th>
                  <th className="py-2.5 px-3 font-medium text-end">{t('social.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {leaderboardRows.map((p, idx) => (
                  <tr key={p.uid} className="hover:bg-[#171D26]">
                    <td className="py-3 px-3 font-mono font-bold text-slate-400 tabular-nums">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedUser(p);
                          setTab('profile');
                        }}
                        className="font-semibold text-slate-100 hover:text-emerald-400 text-start"
                      >
                        {p.displayName}{' '}
                        <span className="text-slate-500 font-normal">@{p.username}</span>
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">{p.country || 'US'}</td>
                    <td className="py-3 px-3 font-mono text-slate-300 tabular-nums">
                      {p.gamesPlayed || 0}
                    </td>
                    <td className="py-3 px-3 text-end font-mono text-sm font-bold text-emerald-400 tabular-nums">
                      {p.ratings?.[lbCategory] ?? 1200}
                    </td>
                    <td className="py-3 px-3 text-end">
                      {p.uid !== firebaseUser?.uid && !blockedIds.has(p.uid) && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => sendFriendRequest(p)}
                            className="p-1.5 rounded bg-[#1A212B] hover:bg-slate-700 text-slate-200"
                            title={t('social.addFriend')}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => sendChallenge(p)}
                            className="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300"
                            title={t('social.challengeTitle')}
                          >
                            <Swords className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FRIENDS & SEARCH */}
      {tab === 'friends' && (
        <div key="tab-friends" className="animate-menu-view grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-100 inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              {t('social.friendsRequests')}
            </h2>
            {friendships.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                {t('social.noFriends')}
              </p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {friendships.map((f) => {
                  const otherId = f.users.find((u) => u !== firebaseUser?.uid) || '';
                  const otherProfile = players.find((p) => p.uid === otherId);
                  const otherName =
                    otherProfile?.displayName ||
                    (f.requesterId === firebaseUser?.uid ? f.recipientName : f.requesterName) ||
                    'Player';
                  const isIncoming = f.status === 'pending' && f.recipientId === firebaseUser?.uid;

                  return (
                    <div key={f.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{otherName}</p>
                        <p className="text-xs text-slate-400 capitalize">
                          {f.status}
                          {otherProfile ? ` · ${t('common.blitz')} ${otherProfile.ratings.blitz}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isIncoming && (
                          <button
                            type="button"
                            onClick={() => acceptFriend(f)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t('common.accept')}
                          </button>
                        )}
                        {f.status === 'accepted' && otherProfile && (
                          <button
                            type="button"
                            onClick={() => sendChallenge(otherProfile)}
                            className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Swords className="w-3.5 h-3.5" />
                            {t('social.challenge')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteDoc(doc(db, 'friendships', f.id))}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title={t('common.dismiss')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-100">{t('social.findPlayers')}</h2>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('social.searchPlayers')}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg ps-9 pe-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="divide-y divide-slate-800/80 max-h-[340px] overflow-y-auto">
              {players
                .filter((p) => {
                  if (p.uid === firebaseUser?.uid) return false;
                  if (!searchQuery.trim()) return true;
                  const s = searchQuery.toLowerCase();
                  return p.displayName.toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
                })
                .map((p) => (
                  <div key={p.uid} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{p.displayName}</p>
                      <p className="text-xs font-mono text-slate-400">
                        @{p.username} · {t('common.blitz')} {p.ratings?.blitz ?? 1200}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => sendFriendRequest(p)}
                        className="px-2.5 py-1 rounded bg-[#1A212B] hover:bg-slate-700 text-xs text-slate-200"
                      >
                        {t('social.add')}
                      </button>
                      <button
                        type="button"
                        onClick={() => blockUser(p)}
                        className="p-1.5 rounded bg-[#1A212B] hover:bg-rose-950/60 text-slate-400 hover:text-rose-300"
                        title="Block"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportTarget(p)}
                        className="p-1.5 rounded bg-[#1A212B] hover:bg-amber-950/60 text-slate-400 hover:text-amber-300"
                        title="Report"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ACHIEVEMENTS */}
      {tab === 'achievements' && (
        <div key="tab-achievements" className="animate-menu-view bg-[#12171E] border border-slate-800 rounded-xl p-5">
          <AchievementBadgesGrid
            profile={profile}
            title={t('social.achievementsTitle')}
            subtitle={t('social.achievementsSubtitle')}
          />
        </div>
      )}

      {/* PLAYER PROFILE */}
      {tab === 'profile' && !activeProfile && (
        <div key="tab-profile-anon" className="animate-menu-view bg-[#12171E] border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <h2 className="font-display text-lg font-bold text-slate-100">
            {t('social.signInProfileTitle')}
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {t('social.signInProfileDesc')}
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            {t('app.signInGoogle')}
          </button>
        </div>
      )}
      {tab === 'profile' && activeProfile && (
        <div key="tab-profile" className="animate-menu-view bg-[#12171E] border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                {activeProfile.displayName}
              </h2>
              <p className="text-xs text-slate-400">
                @{activeProfile.username} · {activeProfile.country || 'US'} · {t('social.membershipPrefix')}{' '}
                <span className="capitalize text-emerald-400 font-medium">{activeProfile.membership}</span>
              </p>
              {activeProfile.bio && (
                <p className="text-sm text-slate-300 mt-2 max-w-xl">{activeProfile.bio}</p>
              )}
            </div>
            {inspectedUser && inspectedUser.uid !== firebaseUser?.uid && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectedUser(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200"
                >
                  {t('social.backToProfile')}
                </button>
                <button
                  type="button"
                  onClick={() => sendChallenge(inspectedUser)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  {t('social.challenge')}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(
              [
                { id: 'bullet', label: t('common.bullet') },
                { id: 'blitz', label: t('common.blitz') },
                { id: 'rapid', label: t('common.rapid') },
                { id: 'classical', label: t('common.classical') },
                { id: 'puzzle', label: t('common.puzzle') },
              ] as const
            ).map((cat) => (
              <div key={cat.id} className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5">
                <p className="text-xs text-slate-400">{cat.label}</p>
                <p className="font-mono text-2xl font-bold text-slate-100 tabular-nums mt-1">
                  {activeProfile.ratings?.[cat.id] ?? 1200}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-emerald-400" /> {t('social.recordOverview')}
              </p>
              <span className="text-[11px] font-mono text-slate-400">
                {t('social.streakSummary', {
                  play: activeProfile.bestPlayStreakDays || 0,
                  puzzle: activeProfile.bestPuzzleStreak || 0,
                })}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                  {activeProfile.gamesPlayed || 0}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statPlayed')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                  {activeProfile.wins || 0}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statWins')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-slate-300 tabular-nums">
                  {activeProfile.draws || 0}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statDraws')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-rose-400 tabular-nums">
                  {activeProfile.losses || 0}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statLosses')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-sky-400 tabular-nums">
                  {activeProfile.puzzlesSolved || 0}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statPuzzlesSolved')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                  {getActivePlayStreak(activeProfile)}{t('app.daysShort')}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statPlayStreak')}</p>
              </div>
              <div className="bg-[#12171E] border border-slate-800/80 rounded-lg py-2.5 px-2">
                <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                  {activeProfile.dailyStreak || 0}{t('app.daysShort')}
                </p>
                <p className="text-[11px] text-slate-400">{t('social.statDailyStreak')}</p>
              </div>
            </div>
          </div>

          <AchievementBadgesGrid
            profile={activeProfile}
            title={t('social.profileBadgesTitle')}
            subtitle={t('social.profileBadgesSubtitle')}
          />

          <RatingHistoryChart
            profile={activeProfile}
            onPlayOnline={() => onNavigate('play-online')}
          />
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <div className="animate-menu-backdrop fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="animate-menu-modal max-w-md w-full bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-lg font-bold text-slate-100">
              {t('social.reportTitle', { name: reportTarget.displayName })}
            </h3>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">{t('social.reportReason')}</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
              >
                <option value="Fair Play Violation">Fair Play / Engine Use</option>
                <option value="Abusive Behavior">Abusive Language / Harassment</option>
                <option value="Stalling">Intentional Clock Stalling</option>
                <option value="Sandbagging">Rating Manipulation</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">{t('social.reportDetails')}</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={3}
                placeholder={t('social.reportPlaceholder')}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={submitReport}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
              >
                {t('social.submitReport')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
