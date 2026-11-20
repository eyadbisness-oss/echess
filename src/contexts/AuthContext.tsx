import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import type { AppLocale, PieceStyleId, PlatformConfig, UserProfile } from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';
import { persistLocalWarningColor, sanitizeWarningHexColor } from '../utils/timerWarning';
import { apiUrl } from '../utils/backendUrl';
import {
  ACHIEVEMENTS,
  evaluateProfileAchievements,
  type AchievementDefinition,
} from '../data/achievements';

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'friend_request' | 'challenge' | 'game_result' | 'announcement' | 'system';
  title: string;
  message: string;
  read: boolean;
  actionRoute?: string;
  createdAt?: unknown;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  isAuthReady: boolean;
  isOwner: boolean;
  ownerVerifiedServer: boolean;
  platformConfig: PlatformConfig;
  notifications: NotificationItem[];
  unreadNotifications: number;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (patch: {
    displayName?: string;
    username?: string;
    country?: string;
    bio?: string;
    boardTheme?: string;
    pieceStyle?: PieceStyleId;
    soundEnabled?: boolean;
    soundVolume?: number;
    showCoordinates?: boolean;
    autoQueen?: boolean;
    lowTimeWarningColor?: string;
    language?: AppLocale;
  }) => Promise<void>;
  unlockAchievement: (achievementId: string) => Promise<void>;
  recentUnlockedBadges: AchievementDefinition[];
  dismissUnlockedBadge: (id: string) => void;
  getIdToken: () => Promise<string | null>;
  ownerCheatMode: boolean;
  setOwnerCheatMode: (enabled: boolean) => void;
}

const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  maintenanceMode: false,
  maintenanceMessage: '',
  announcement: '',
  features: {
    onlineMultiplayer: true,
    computerOpponents: true,
    puzzles: true,
    lessons: true,
    openingExplorer: true,
    tournaments: true,
  },
  activeTimeControls: ['1+0', '2+1', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0'],
  updatedBy: 'system',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [ownerVerifiedServer, setOwnerVerifiedServer] = useState(false);
  const [ownerCheatModeState, setOwnerCheatModeState] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recentUnlockedBadges, setRecentUnlockedBadges] = useState<AchievementDefinition[]>([]);
  const prevAchievementsRef = useRef<{ uid: string; ids: Set<string> } | null>(null);

  const isOwner = Boolean(
    firebaseUser?.emailVerified &&
      (profile?.role === 'owner' || ownerVerifiedServer)
  );

  const ownerCheatMode = isOwner && ownerCheatModeState;
  const setOwnerCheatMode = useCallback(
    (enabled: boolean) => {
      if (!isOwner) {
        setOwnerCheatModeState(false);
        return;
      }
      setOwnerCheatModeState(enabled);
    },
    [isOwner]
  );

  // Sync sound engine state, master volume, and low-time warning color
  useEffect(() => {
    if (!profile) return;
    soundEngine.enabled = profile.soundEnabled ?? true;
    soundEngine.volume = (profile.soundVolume ?? 80) / 100;
    if (profile.lowTimeWarningColor) {
      persistLocalWarningColor(profile.lowTimeWarningColor);
    }
  }, [profile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setProfile(null);
        setOwnerVerifiedServer(false);
        setNotifications([]);
        setIsAuthReady(true);
        return;
      }

      try {
        // Server-side Owner Role Verification (never relies on client state alone)
        const token = await user.getIdToken();
        setFirebaseUser(user);
        try {
          const res = await fetch(apiUrl('/api/owner/verify'), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            setOwnerVerifiedServer(Boolean(data.isOwner));
          } else {
            setOwnerVerifiedServer(false);
          }
        } catch {
          setOwnerVerifiedServer(false);
        }

        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const baseName = (user.displayName || 'Player').slice(0, 40).trim() || 'Player';
          const rawHandle = (user.email?.split('@')[0] || `player_${user.uid.slice(0, 6)}`)
            .replace(/[^a-zA-Z0-9_.-]/g, '')
            .slice(0, 24);
          const username = rawHandle.length >= 2 ? rawHandle : `player_${user.uid.slice(0, 6)}`;

          // Verify if server confirmed owner status
          let initialRole: 'user' | 'owner' = 'user';
          try {
            const checkRes = await fetch(apiUrl('/api/owner/verify'), {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.isOwner) initialRole = 'owner';
            }
          } catch {
            // default user
          }

          await setDoc(userRef, {
            uid: user.uid,
            username,
            displayName: baseName,
            avatarUrl: (user.photoURL || '').slice(0, 500),
            country: 'US',
            bio: 'Competitive player on eChess.',
            role: initialRole,
            status: 'active',
            membership: initialRole === 'owner' ? 'diamond' : 'free',
            boardTheme: 'emerald-arena',
            pieceStyle: 'neo',
            soundEnabled: true,
            soundVolume: 80,
            showCoordinates: true,
            autoQueen: false,
            lowTimeWarningColor: '#ef4444',
            language: 'en',
            ratings: {
              bullet: 1200,
              blitz: 1200,
              rapid: 1200,
              classical: 1200,
              puzzle: 1200,
            },
            rd: {
              bullet: 250,
              blitz: 250,
              rapid: 250,
              classical: 250,
            },
            volatility: {
              bullet: 0.06,
              blitz: 0.06,
              rapid: 0.06,
              classical: 0.06,
            },
            puzzleStreak: 0,
            bestPuzzleStreak: 0,
            dailyStreak: 0,
            bestDailyStreak: 0,
            lastDailyPuzzleDate: '',
            dailyPuzzlesCompleted: 0,
            puzzlesSolved: 0,
            playStreakDays: 0,
            bestPlayStreakDays: 0,
            lastPlayDate: '',
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            achievements: [],
            isTestAccount: false,
            onlineStatus: 'online',
            lastSeenAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // Isolated PII document
          await setDoc(doc(db, 'users', user.uid, 'private', 'info'), {
            uid: user.uid,
            email: (user.email || '').slice(0, 254),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (initialRole === 'owner') {
            await setDoc(doc(db, 'admins', user.uid), {
              uid: user.uid,
              email: (user.email || '').slice(0, 254),
              role: 'owner',
              grantedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        if (
          lower.includes('permission-denied') ||
          lower.includes('suspended') ||
          lower.includes('user-disabled') ||
          lower.includes('user-token-expired')
        ) {
          setFirebaseUser(null);
          setProfile(null);
          setOwnerVerifiedServer(false);
          setNotifications([]);
          setAuthError(
            'Firebase Auth & Firestore for project echess-fd9af returned PERMISSION_DENIED. Check your Firebase project status and Firestore rules. Offline Stockfish games, Puzzles, Lessons, and Analysis still work.'
          );
          try {
            await signOut(auth);
          } catch {
            // ignore signOut failure when token service is blocked
          }
        } else {
          console.error('Auth bootstrap warning:', err);
          setFirebaseUser(null);
          setProfile(null);
          setOwnerVerifiedServer(false);
          setAuthError(`Sign-in verification failed: ${msg}`);
        }
      } finally {
        setIsAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Listen to own profile + platform config + notifications when authenticated
  useEffect(() => {
    if (!isAuthReady || !firebaseUser) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          const nextIds = new Set(data.achievements || []);
          const prev = prevAchievementsRef.current;
          if (prev && prev.uid === data.uid) {
            const newlyUnlocked = Array.from(nextIds)
              .filter((id) => !prev.ids.has(id))
              .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
              .filter((a): a is AchievementDefinition => Boolean(a));
            if (newlyUnlocked.length > 0) {
              setRecentUnlockedBadges((cur) => {
                const existingIds = new Set(cur.map((c) => c.id));
                return [...cur, ...newlyUnlocked.filter((n) => !existingIds.has(n.id))].slice(-4);
              });
            }
          }
          prevAchievementsRef.current = { uid: data.uid, ids: nextIds };
          setProfile(data);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    const unsubConfig = onSnapshot(
      doc(db, 'platformConfig', 'settings'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as PlatformConfig;
          setPlatformConfig({
            ...DEFAULT_PLATFORM_CONFIG,
            ...d,
            features: {
              ...DEFAULT_PLATFORM_CONFIG.features,
              ...(d.features || {}),
            },
          });
        }
      },
      () => {
        // Optional document before owner initializes it
      }
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const items: NotificationItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationItem, 'id'>),
        }));
        setNotifications(items);
      },
      () => {
        // fallback if composite index is building
      }
    );

    return () => {
      unsubProfile();
      unsubConfig();
      unsubNotifs();
    };
  }, [isAuthReady, firebaseUser]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        let result;
        try {
          result = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: false,
          });
        } catch (legacyErr) {
          const legacyMsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
          const lower = legacyMsg.toLowerCase();
          if (lower.includes('12501')) {
            return;
          }
          // Fallback to Android Credential Manager if legacy GoogleSignIn fails
          result = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: true,
          });
        }
        const idToken = result?.credential?.idToken;
        if (!idToken) {
          throw new Error('Google Sign-In did not return an ID token.');
        }
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        await userCred.user.getIdToken(true);
        setFirebaseUser(userCred.user);
        return;
      }

      const popupCred = await signInWithPopup(auth, googleProvider);
      await popupCred.user.getIdToken(true);
      setFirebaseUser(popupCred.user);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const lower = rawMsg.toLowerCase();
      const isExplicitCancel =
        (lower.includes('popup-closed-by-user') ||
          lower.includes('cancelled-popup-request') ||
          lower.includes('12501') ||
          lower.includes('activity is cancelled by the user') ||
          lower.includes('user canceled') ||
          lower.includes('user cancelled')) &&
        !lower.includes('blocked') &&
        !lower.includes('too many');
      if (isExplicitCancel) {
        return;
      }
      if (
        lower.includes('permission-denied') ||
        lower.includes('suspended')
      ) {
        setAuthError(
          'Firebase Auth for project echess-fd9af returned PERMISSION_DENIED. Check Google Sign-In and Authorized Domains in Firebase Console. Offline modes remain available.'
        );
        return;
      }
      if (
        rawMsg.includes('10:') ||
        lower.includes('developer_error') ||
        lower.includes('nocredential') ||
        lower.includes('no credentials available') ||
        rawMsg.includes('12500') ||
        lower.includes('default_web_client_id')
      ) {
        setAuthError(
          'Android Google Sign-In requires package com.echess.app (SHA-1: 10:C6:AA:41:78:90:5B:C5:09:BE:1A:C7:17:08:A0:1E:64:3B:AB:74) to be authorized in your Firebase project. Play Computer, Puzzles, Lessons, and Analysis work without signing in.'
        );
        return;
      }
      setAuthError(rawMsg || 'Unable to complete Google Sign-In.');
    }
  }, []);

  const logout = useCallback(async () => {
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          onlineStatus: 'offline',
          lastSeenAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // ignore
      }
    }
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {
        // ignore native signOut errors
      }
    }
    await signOut(auth);
  }, [firebaseUser]);

  const updatePreferences = useCallback(
    async (patch: {
      displayName?: string;
      username?: string;
      country?: string;
      bio?: string;
      boardTheme?: string;
      pieceStyle?: PieceStyleId;
      soundEnabled?: boolean;
      soundVolume?: number;
      showCoordinates?: boolean;
      autoQueen?: boolean;
      lowTimeWarningColor?: string;
      language?: AppLocale;
    }) => {
      if (!firebaseUser || !profile) return;
      const sanitized: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (patch.displayName !== undefined) sanitized.displayName = patch.displayName.trim().slice(0, 64) || profile.displayName;
      if (patch.username !== undefined) {
        const clean = patch.username.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 32);
        if (clean.length >= 2) sanitized.username = clean;
      }
      if (patch.country !== undefined) sanitized.country = patch.country.toUpperCase().slice(0, 3);
      if (patch.bio !== undefined) sanitized.bio = patch.bio.slice(0, 300);
      if (patch.boardTheme !== undefined) sanitized.boardTheme = patch.boardTheme.slice(0, 40);
      if (patch.pieceStyle !== undefined) sanitized.pieceStyle = patch.pieceStyle;
      if (patch.soundEnabled !== undefined) sanitized.soundEnabled = patch.soundEnabled;
      if (patch.soundVolume !== undefined && Number.isFinite(patch.soundVolume)) {
        sanitized.soundVolume = Math.max(0, Math.min(100, Math.round(patch.soundVolume)));
      }
      if (patch.showCoordinates !== undefined) sanitized.showCoordinates = patch.showCoordinates;
      if (patch.autoQueen !== undefined) sanitized.autoQueen = patch.autoQueen;
      if (patch.lowTimeWarningColor !== undefined) {
        const cleanHex = sanitizeWarningHexColor(patch.lowTimeWarningColor);
        sanitized.lowTimeWarningColor = cleanHex;
        persistLocalWarningColor(cleanHex);
      }
      if (patch.language !== undefined && ['en', 'es', 'fr', 'ar'].includes(patch.language)) {
        sanitized.language = patch.language;
      }

      const nextProfile: UserProfile = { ...profile, ...sanitized } as UserProfile;
      const evaluated = evaluateProfileAchievements(nextProfile);
      if (evaluated.length > (profile.achievements?.length || 0)) {
        sanitized.achievements = evaluated;
      }

      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), sanitized);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [firebaseUser, profile]
  );

  const unlockAchievement = useCallback(
    async (achievementId: string) => {
      if (!firebaseUser || !profile) return;
      const current = new Set(profile.achievements || []);
      if (current.has(achievementId)) return;
      current.add(achievementId);
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          achievements: Array.from(current).slice(0, 60),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [firebaseUser, profile]
  );

  const dismissUnlockedBadge = useCallback((id: string) => {
    setRecentUnlockedBadges((cur) => cur.filter((b) => b.id !== id));
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        isAuthReady,
        isOwner,
        ownerVerifiedServer,
        platformConfig,
        notifications,
        unreadNotifications,
        authError,
        clearAuthError,
        signInWithGoogle,
        logout,
        updatePreferences,
        unlockAchievement,
        recentUnlockedBadges,
        dismissUnlockedBadge,
        getIdToken,
        ownerCheatMode,
        setOwnerCheatMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
