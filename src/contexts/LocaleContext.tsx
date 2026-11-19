import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  LOCALE_OPTIONS,
  translate,
  type LocaleOption,
  type TranslationKey,
} from '../i18n/translations';
import type { AppLocale } from '../shared/chessTypes';

const STORAGE_KEY = 'echess_locale';
const VALID_LOCALES: AppLocale[] = ['en', 'es', 'fr', 'ar'];

function readStoredLocale(): AppLocale {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_LOCALES.includes(raw as AppLocale)) {
      return raw as AppLocale;
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

interface LocaleContextValue {
  locale: AppLocale;
  isRtl: boolean;
  localeOption: LocaleOption;
  setLocale: (next: AppLocale) => Promise<void>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { profile, updatePreferences } = useAuth();
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  // Sync from Firestore profile once loaded/updated if valid
  useEffect(() => {
    if (profile?.language && VALID_LOCALES.includes(profile.language)) {
      setLocaleState(profile.language);
      try {
        window.localStorage.setItem(STORAGE_KEY, profile.language);
      } catch {
        // ignore
      }
    }
  }, [profile?.language]);

  const isRtl = locale === 'ar';

  // Keep <html lang="..." dir="..."> synchronized with active locale
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [locale, isRtl]);

  const setLocale = useCallback(
    async (next: AppLocale) => {
      if (!VALID_LOCALES.includes(next)) return;
      setLocaleState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      if (profile) {
        await updatePreferences({ language: next });
      }
    },
    [profile, updatePreferences]
  );

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const localeOption = useMemo(
    () => LOCALE_OPTIONS.find((opt) => opt.code === locale) || LOCALE_OPTIONS[0],
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      isRtl,
      localeOption,
      setLocale,
      t,
    }),
    [locale, isRtl, localeOption, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return ctx;
}
