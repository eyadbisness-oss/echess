import { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Cpu,
  Crown,
  GraduationCap,
  History,
  Home,
  LogIn,
  LogOut,
  Menu,
  Puzzle,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider, useLocale } from './contexts/LocaleContext';
import { MultiplayerProvider } from './contexts/MultiplayerContext';
import { ComputerGameProvider } from './contexts/ComputerGameContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChessLogo } from './components/ChessLogo';
import { initializeNativeAndroidShell } from './utils/nativeAndroid';
import { HomeView, type AppView } from './views/HomeView';
import { PlayOnlineView } from './views/PlayOnlineView';
import { PlayComputerView } from './views/PlayComputerView';
import { PuzzlesView } from './views/PuzzlesView';
import { LessonsView } from './views/LessonsView';
import { AnalysisView } from './views/AnalysisView';
import { OpeningsView } from './views/OpeningsView';
import { HistoryView } from './views/HistoryView';
import { SocialView } from './views/SocialView';
import { MembershipView } from './views/MembershipView';
import { SettingsView } from './views/SettingsView';
import { OwnerPanelView } from './views/OwnerPanelView';
import type { ChessGameRecord, GameReviewReport, SharedGameDocument } from './shared/chessTypes';

function AppShell() {
  const {
    firebaseUser,
    profile,
    isAuthReady,
    isOwner,
    ownerCheatMode,
    setOwnerCheatMode,
    platformConfig,
    notifications,
    unreadNotifications,
    recentUnlockedBadges,
    dismissUnlockedBadge,
    signInWithGoogle,
    logout,
    updatePreferences,
  } = useAuth();
  const { t } = useLocale();

  const [view, setView] = useState<AppView>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [reviewPgn, setReviewPgn] = useState<string | null>(null);
  const [reviewMeta, setReviewMeta] = useState<Partial<ChessGameRecord> | null>(null);
  const [reviewReport, setReviewReport] = useState<GameReviewReport | null>(null);
  const [sharedGameBanner, setSharedGameBanner] = useState<{
    shareId: string;
    creatorName?: string;
  } | null>(null);
  const [sharedLoadState, setSharedLoadState] = useState<'idle' | 'loading' | 'not-found'>('idle');

  useEffect(() => {
    void initializeNativeAndroidShell();
  }, []);

  // Detect shared game link (?share=<shareId> or /share/<shareId>) on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramShareId = params.get('share');
    const pathMatch = window.location.pathname.match(/^\/share\/([a-zA-Z0-9_-]+)$/);
    const shareId = paramShareId || (pathMatch ? pathMatch[1] : null);
    if (!shareId || !/^[a-zA-Z0-9_-]{1,64}$/.test(shareId)) return;

    setView('analysis');
    setSharedLoadState('loading');

    let cancelled = false;
    getDoc(doc(db, 'sharedGames', shareId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setSharedLoadState('not-found');
          return;
        }
        const data = snap.data() as SharedGameDocument;
        setReviewPgn(data.pgn);
        setReviewMeta({
          whiteName: data.whiteName,
          blackName: data.blackName,
          result: (data.result as ChessGameRecord['result']) || '1-0',
          timeControl: data.timeControl,
          openingName: data.openingName,
          eco: data.eco,
        });
        setReviewReport(data.reviewReport || null);
        setSharedGameBanner({
          shareId: data.shareId || shareId,
          creatorName: data.creatorName,
        });
        setSharedLoadState('idle');
      })
      .catch(() => {
        if (!cancelled) setSharedLoadState('not-found');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen && !showNotifications) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, showNotifications]);

  const clearSharedStateIfNavigating = () => {
    if (sharedGameBanner || sharedLoadState !== 'idle') {
      setSharedGameBanner(null);
      setSharedLoadState('idle');
      setReviewReport(null);
      if (window.location.search.includes('share=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  };

  const openReview = (pgn: string, meta?: Partial<ChessGameRecord>) => {
    clearSharedStateIfNavigating();
    setReviewPgn(pgn);
    setReviewMeta(meta || null);
    setReviewReport(null);
    setView('analysis');
    setMobileMenuOpen(false);
  };

  const navItems: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'play-online', label: t('nav.playOnline'), icon: Swords },
    { id: 'play-computer', label: t('nav.playComputer'), icon: Cpu },
    { id: 'puzzles', label: t('nav.puzzles'), icon: Puzzle },
    { id: 'lessons', label: t('nav.lessons'), icon: GraduationCap },
    { id: 'analysis', label: t('nav.analysis'), icon: BarChart3 },
    { id: 'openings', label: t('nav.openings'), icon: BookOpen },
    { id: 'history', label: t('nav.history'), icon: History },
    { id: 'social', label: t('nav.social'), icon: Users },
    { id: 'profile', label: t('nav.profile'), icon: User },
    { id: 'membership', label: t('nav.membership'), icon: Crown },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  if (isOwner) {
    navItems.push({ id: 'owner', label: t('nav.owner'), icon: ShieldCheck });
  }

  const markNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch {
      // ignore
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0E11] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <ChessLogo size={44} />
          <p className="text-xs text-slate-400">{t('app.initializing')}</p>
        </div>
      </div>
    );
  }

  // Maintenance gate for non-owners
  if (platformConfig.maintenanceMode && !isOwner) {
    return (
      <div className="min-h-screen bg-[#0B0E11] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12171E] border border-slate-800 rounded-xl p-8 text-center space-y-4">
          <ChessLogo size={40} />
          <h1 className="font-display text-xl font-bold text-slate-100">{t('app.maintenanceTitle')}</h1>
          <p className="text-sm text-slate-300">
            {platformConfig.maintenanceMessage || t('app.maintenanceDefault')}
          </p>
        </div>
      </div>
    );
  }

  // Suspended / banned account gate
  if (profile && (profile.status === 'suspended' || profile.status === 'banned') && !isOwner) {
    return (
      <div className="min-h-screen bg-[#0B0E11] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12171E] border border-rose-900/60 rounded-xl p-8 text-center space-y-4">
          <h1 className="font-display text-xl font-bold text-rose-300 capitalize">
            {t('app.accountStatus', { status: profile.status })}
          </h1>
          <p className="text-sm text-slate-300">
            {t('app.accountStatusDesc', { status: profile.status })}
          </p>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-200"
          >
            {t('app.signOut')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0B0E11] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-e border-slate-800/80 bg-[#0F1318]">
        <div className="h-16 px-5 flex items-center border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => setView('home')}
            className="cursor-pointer focus:outline-none hover:opacity-90 transition-opacity"
            aria-label={t('app.returnHomeAria')}
          >
            <ChessLogo size={32} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`group w-full px-3 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-700/50 translate-x-0.5 rtl:-translate-x-0.5'
                    : 'text-slate-300 hover:text-white hover:bg-[#161C24] hover:translate-x-0.5 rtl:hover:-translate-x-0.5 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                    active ? 'text-emerald-400 scale-105' : 'text-slate-400 group-hover:text-emerald-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80">
          {firebaseUser && profile ? (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setView('profile')}
                className="min-w-0 text-start hover:opacity-85 transition-opacity"
                title={t('app.openProfileTitle')}
              >
                <p className="text-xs font-semibold text-slate-100 truncate">{profile.displayName}</p>
                <p className="text-[11px] font-mono text-emerald-400 tabular-nums">
                  {t('common.blitz')} {profile.ratings?.blitz ?? 1200}
                </p>
              </button>
              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                title={t('app.signOut')}
                aria-label={t('app.signOut')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {t('app.signInGoogle')}
            </button>
          )}
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Header */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-800/80 bg-[#0F1318]/90 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setView('home');
                setMobileMenuOpen(false);
              }}
              className="md:hidden cursor-pointer focus:outline-none hover:opacity-90 transition-opacity"
              aria-label={t('app.returnHomeAria')}
            >
              <ChessLogo size={28} />
            </button>
            <span className="hidden md:inline-block text-sm font-medium text-slate-300 whitespace-nowrap">
              {navItems.find((n) => n.id === view)?.label || t('nav.home')}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            {isOwner && (
              <button
                type="button"
                onClick={() => setOwnerCheatMode(!ownerCheatMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-[background-color,color,transform] duration-150 active:scale-[0.97] whitespace-nowrap ${
                  ownerCheatMode
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-[#1A212B] hover:bg-[#232C39] border border-slate-700 text-amber-300'
                }`}
                title={t('app.cheatsTooltip')}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {ownerCheatMode ? t('app.cheatsOn') : t('app.cheatsOff')}
              </button>
            )}
            {profile && (
              <button
                type="button"
                onClick={() => updatePreferences({ soundEnabled: !(profile.soundEnabled ?? true) })}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-[background-color,color,transform] duration-150 active:scale-95"
                title={profile.soundEnabled ? t('app.muteAudio') : t('app.enableAudio')}
                aria-label={profile.soundEnabled ? t('app.muteAudio') : t('app.enableAudio')}
              >
                {profile.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}

            {firebaseUser && (
              <button
                type="button"
                onClick={() => setShowNotifications((s) => !s)}
                aria-expanded={showNotifications}
                className="relative p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-[background-color,color,transform] duration-150 active:scale-95"
                aria-label={t('app.notifications')}
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute top-1 end-1 w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
            )}

            {!firebaseUser ? (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                {t('app.signIn')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView('play-online')}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                {t('app.playMatch')}
              </button>
            )}

            {/* Notifications Popover */}
            <div
              aria-hidden={!showNotifications}
              className={`absolute end-0 top-12 w-80 bg-[#12171E] border border-slate-800 rounded-xl shadow-2xl p-3 space-y-2 z-50 origin-top-right rtl:origin-top-left transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                showNotifications
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 -translate-y-1.5 scale-95 pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-slate-200">{t('app.notifications')}</span>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">{t('app.noNotifications')}</p>
              ) : (
                <div className="divide-y divide-slate-800/70 max-h-64 overflow-y-auto">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markNotificationRead(n.id);
                        if (n.actionRoute) setView(n.actionRoute as AppView);
                        setShowNotifications(false);
                      }}
                      className={`w-full text-start py-2 px-2 rounded hover:bg-[#19202A] transition-colors ${
                        n.read ? 'opacity-65' : ''
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-100">{n.title}</p>
                      <p className="text-[11px] text-slate-400">{n.message}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        <div
          aria-hidden={!mobileMenuOpen}
          className={`fixed inset-0 z-50 md:hidden flex transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div
            className={`w-64 bg-[#0F1318] border-e border-slate-800 p-4 flex flex-col justify-between transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
            }`}
          >
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setView('home');
                    setMobileMenuOpen(false);
                  }}
                  className="cursor-pointer focus:outline-none hover:opacity-90 transition-opacity"
                  aria-label={t('app.returnHomeAria')}
                >
                  <ChessLogo size={28} />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors active:scale-95"
                  aria-label={t('common.dismiss')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item, idx) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setView(item.id);
                        setMobileMenuOpen(false);
                      }}
                      style={
                        mobileMenuOpen
                          ? { animationDelay: `${Math.min(idx, 10) * 18}ms` }
                          : undefined
                      }
                      className={`group w-full px-3 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-[background-color,color,transform] duration-150 active:scale-[0.98] ${
                        mobileMenuOpen ? 'animate-menu-item' : ''
                      } ${
                        active
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-700/40'
                          : 'text-slate-300 hover:text-white hover:bg-[#161C24] border border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                          active ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {firebaseUser && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors active:scale-[0.98]"
              >
                {t('app.signOut')}
              </button>
            )}
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-[1px]" onClick={() => setMobileMenuOpen(false)} />
        </div>

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div key={view} className="animate-menu-view">
            {view === 'home' && <HomeView onNavigate={setView} onOpenReview={openReview} />}
            {view === 'play-online' && <PlayOnlineView onOpenReview={openReview} />}
            {view === 'play-computer' && <PlayComputerView onOpenReview={openReview} />}
            {view === 'puzzles' && <PuzzlesView />}
            {view === 'lessons' && <LessonsView />}
            {view === 'analysis' && (
              <AnalysisView
                initialPgn={reviewPgn}
                initialMeta={reviewMeta}
                initialReviewReport={reviewReport}
                sharedGameBanner={sharedGameBanner}
                sharedLoadState={sharedLoadState}
              />
            )}
            {view === 'openings' && <OpeningsView />}
            {view === 'history' && <HistoryView onOpenReview={openReview} />}
            {view === 'social' && <SocialView key="social-view" onNavigate={setView} initialTab="leaderboards" />}
            {view === 'profile' && <SocialView key="profile-view" onNavigate={setView} initialTab="profile" />}
            {view === 'membership' && <MembershipView />}
            {view === 'settings' && <SettingsView />}
            {view === 'owner' && <OwnerPanelView />}
          </div>
        </main>
      </div>

      {/* Achievement Unlocked Toasts */}
      {recentUnlockedBadges.length > 0 && (
        <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
          {recentUnlockedBadges.map((badge) => (
            <div
              key={badge.id}
              className="animate-menu-toast pointer-events-auto bg-[#12171E] border border-amber-500/60 rounded-xl p-3.5 shadow-2xl flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  {t('app.badgeUnlocked')} · {badge.tier} (+{badge.points} {t('app.pts')})
                </p>
                <p className="text-sm font-display font-bold text-slate-100 truncate">
                  {badge.title}
                </p>
                <p className="text-[11px] text-slate-400 line-clamp-2">{badge.description}</p>
                <button
                  type="button"
                  onClick={() => {
                    setView('profile');
                    dismissUnlockedBadge(badge.id);
                  }}
                  className="text-[11px] font-semibold text-emerald-400 hover:underline mt-1"
                >
                  {t('app.viewOnProfile')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => dismissUnlockedBadge(badge.id)}
                className="text-slate-500 hover:text-slate-200"
                aria-label={t('common.dismiss')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LocaleProvider>
          <MultiplayerProvider>
            <ComputerGameProvider>
              <AppShell />
            </ComputerGameProvider>
          </MultiplayerProvider>
        </LocaleProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
