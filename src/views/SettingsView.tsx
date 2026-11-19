import { useEffect, useState } from 'react';
import { Check, Clock, Globe, Palette, Save, Settings as SettingsIcon, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { ChessBoard } from '../components/ChessBoard';
import { MoveTimerDisplay } from '../components/MoveTimerDisplay';
import { BOARD_THEMES, PIECE_STYLES } from '../data/boardThemes';
import { LOCALE_OPTIONS } from '../i18n/translations';
import type { AppLocale, PieceStyleId } from '../shared/chessTypes';
import { soundEngine } from '../utils/sound';
import {
  LOW_TIME_COLOR_PRESETS,
  persistLocalWarningColor,
  readStoredWarningColor,
  sanitizeWarningHexColor,
} from '../utils/timerWarning';

const PREVIEW_FEN = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7';

export function SettingsView() {
  const { profile, updatePreferences } = useAuth();
  const { locale, setLocale, t } = useLocale();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [country, setCountry] = useState(profile?.country || 'US');
  const [bio, setBio] = useState(profile?.bio || '');
  const [boardTheme, setBoardTheme] = useState(profile?.boardTheme || 'emerald-arena');
  const [pieceStyle, setPieceStyle] = useState<PieceStyleId>(profile?.pieceStyle || 'neo');
  const [soundEnabled, setSoundEnabled] = useState(profile?.soundEnabled ?? soundEngine.enabled);
  const [soundVolume, setSoundVolume] = useState(
    profile?.soundVolume ?? Math.round(soundEngine.volume * 100)
  );
  const [showCoordinates, setShowCoordinates] = useState(profile?.showCoordinates ?? true);
  const [autoQueen, setAutoQueen] = useState(profile?.autoQueen ?? false);
  const [lowTimeWarningColor, setLowTimeWarningColor] = useState(() =>
    readStoredWarningColor(profile?.lowTimeWarningColor)
  );
  const [previewLowTime, setPreviewLowTime] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setUsername(profile.username || '');
    setCountry(profile.country || 'US');
    setBio(profile.bio || '');
    setBoardTheme(profile.boardTheme || 'emerald-arena');
    setPieceStyle(profile.pieceStyle || 'neo');
    setSoundEnabled(profile.soundEnabled ?? true);
    setSoundVolume(profile.soundVolume ?? 80);
    setShowCoordinates(profile.showCoordinates ?? true);
    setAutoQueen(profile.autoQueen ?? false);
    if (profile.lowTimeWarningColor) {
      setLowTimeWarningColor(sanitizeWarningHexColor(profile.lowTimeWarningColor));
    }
  }, [profile]);

  const applyThemeImmediately = async (themeId: string) => {
    setBoardTheme(themeId);
    await updatePreferences({ boardTheme: themeId });
    setSavedToast(t('settings.toastTheme'));
  };

  const applyPieceStyleImmediately = async (styleId: PieceStyleId) => {
    setPieceStyle(styleId);
    await updatePreferences({ pieceStyle: styleId });
    setSavedToast(t('settings.toastPiece'));
  };

  const handleLanguageChange = async (nextLocale: AppLocale) => {
    await setLocale(nextLocale);
    const opt = LOCALE_OPTIONS.find((o) => o.code === nextLocale);
    setSavedToast(t('settings.toastLanguage', { language: opt?.nativeLabel || nextLocale }));
  };

  const handleToggleSoundState = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.enabled = next;
    if (next) {
      soundEngine.playMove();
    }
    await updatePreferences({ soundEnabled: next });
    setSavedToast(t('settings.toastSound'));
  };

  const handleVolumeSliderChange = (rawVal: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(rawVal)));
    setSoundVolume(clamped);
    soundEngine.volume = clamped / 100;
  };

  const commitSoundVolume = async (val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    soundEngine.volume = clamped / 100;
    await updatePreferences({ soundVolume: clamped });
    setSavedToast(t('settings.toastSound'));
  };

  const handleToggleCoordinates = async () => {
    const next = !showCoordinates;
    setShowCoordinates(next);
    await updatePreferences({ showCoordinates: next });
    setSavedToast(t('settings.toastCoordinates'));
  };

  const applyWarningColorImmediately = async (rawHex: string, announceToast = true) => {
    const clean = sanitizeWarningHexColor(rawHex);
    setLowTimeWarningColor(clean);
    persistLocalWarningColor(clean);
    await updatePreferences({ lowTimeWarningColor: clean });
    if (announceToast) {
      setSavedToast(t('settings.toastTimerColor'));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      soundEngine.enabled = soundEnabled;
      soundEngine.volume = soundVolume / 100;
      persistLocalWarningColor(lowTimeWarningColor);
      await updatePreferences({
        displayName,
        username,
        country,
        bio,
        boardTheme,
        pieceStyle,
        soundEnabled,
        soundVolume,
        showCoordinates,
        autoQueen,
        lowTimeWarningColor,
        language: locale,
      });
      setSavedToast(t('settings.toastSaved'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-100 inline-flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-emerald-400" />
          {t('settings.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('settings.subtitle')}</p>
      </div>

      {savedToast && (
        <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-4 py-2.5 text-xs text-emerald-200 inline-flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{savedToast}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Board Themes & Piece Styles + Live Preview */}
        <div className="lg:col-span-7 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-100 inline-flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-400" />
              {t('settings.boardThemesTitle')}
            </h2>
            <span className="text-xs text-slate-400">{t('settings.instantSync')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BOARD_THEMES.map((theme) => {
              const active = boardTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => applyThemeImmediately(theme.id)}
                  className={`p-3 rounded-xl border text-start flex items-center gap-3 transition-colors ${
                    active
                      ? 'bg-emerald-950/35 border-emerald-500'
                      : 'bg-[#0B0E11] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* 2x2 Mini Swatch */}
                  <div
                    className="w-11 h-11 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 border shrink-0"
                    style={{ borderColor: theme.boardFrameBorder }}
                  >
                    <div style={{ backgroundColor: theme.lightSquare }} />
                    <div style={{ backgroundColor: theme.darkSquare }} />
                    <div style={{ backgroundColor: theme.darkSquare }} />
                    <div style={{ backgroundColor: theme.lightSquare }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100 truncate">{theme.name}</p>
                      {active && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {theme.category} · {theme.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Piece Styles */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              {t('settings.pieceStyle')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PIECE_STYLES.map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  onClick={() => applyPieceStyleImmediately(ps.id)}
                  className={`p-2.5 rounded-xl border text-start transition-colors ${
                    pieceStyle === ps.id
                      ? 'bg-emerald-950/35 border-emerald-500 text-white'
                      : 'bg-[#0B0E11] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-semibold">{ps.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{ps.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Live Board & Move Timer Preview */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-400">{t('settings.livePreview')}</p>
              <button
                type="button"
                onClick={() => setPreviewLowTime((p) => !p)}
                className="px-2.5 py-1 rounded-lg bg-[#0B0E11] hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
              >
                {previewLowTime ? t('settings.previewNormalTime') : t('settings.previewLowTime')}
              </button>
            </div>
            <div className="max-w-[340px] mx-auto space-y-2">
              <div className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-slate-300 truncate">Opponent (1650)</span>
                <MoveTimerDisplay
                  timeLeftMs={258_000}
                  totalTimeMs={300_000}
                  isActive={false}
                  warningColor={lowTimeWarningColor}
                />
              </div>
              <ChessBoard
                fen={PREVIEW_FEN}
                interactive={false}
                boardThemeId={boardTheme}
                pieceStyle={pieceStyle}
                showCoordinates={showCoordinates}
                lastMove={{ from: 'f1', to: 'c4' }}
              />
              <div className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-slate-100 truncate">
                  {displayName || t('common.you')}
                </span>
                <MoveTimerDisplay
                  timeLeftMs={previewLowTime ? 7_400 : 165_000}
                  totalTimeMs={300_000}
                  isActive={true}
                  warningColor={lowTimeWarningColor}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Profile & Gameplay Settings Form */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-5 bg-[#12171E] border border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-100">
            {t('settings.accountSettingsTitle')}
          </h2>

          {/* Language Selection Dropdown */}
          <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <label
              htmlFor="echess-language-select"
              className="text-xs font-semibold text-slate-200 inline-flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-emerald-400" />
              {t('settings.languageLabel')}
            </label>
            <select
              id="echess-language-select"
              aria-label={t('settings.languageLabel')}
              value={locale}
              onChange={(e) => void handleLanguageChange(e.target.value as AppLocale)}
              className="w-full bg-[#12171E] border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none cursor-pointer"
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeLabel} ({opt.label})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">{t('settings.languageDesc')}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">{t('settings.displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">{t('settings.username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={32}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">{t('settings.countryCode')}</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">{t('settings.playerBio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={300}
              className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100"
            />
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            {/* Sound State Toggle + Master Volume + Sound Effects Preview */}
            <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {soundEnabled && soundVolume > 0 ? (
                    <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100">
                      {t('settings.soundEffects')}
                    </p>
                    <p className="text-[11px] text-slate-400">{t('settings.soundDesc')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  aria-label={t('settings.soundEffects')}
                  onClick={() => void handleToggleSoundState()}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors shrink-0 ${
                    soundEnabled
                      ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      soundEnabled ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  {soundEnabled ? t('settings.soundStateOn') : t('settings.soundStateOff')}
                </button>
              </div>

              <div className={`space-y-1.5 transition-opacity ${soundEnabled ? 'opacity-100' : 'opacity-50'}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <label htmlFor="echess-sound-volume" className="text-slate-300 font-medium">
                    {t('settings.soundVolume')}
                  </label>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {soundVolume}%
                  </span>
                </div>
                <input
                  id="echess-sound-volume"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={soundVolume}
                  onChange={(e) => handleVolumeSliderChange(Number(e.target.value))}
                  onMouseUp={() => void commitSoundVolume(soundVolume)}
                  onTouchEnd={() => void commitSoundVolume(soundVolume)}
                  onKeyUp={() => void commitSoundVolume(soundVolume)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
                <p className="text-[11px] text-slate-400">{t('settings.soundPreviewLabel')}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: 'move', label: t('settings.soundMove'), play: () => soundEngine.playMove() },
                    { key: 'capture', label: t('settings.soundCapture'), play: () => soundEngine.playCapture() },
                    { key: 'check', label: t('settings.soundCheck'), play: () => soundEngine.playCheck() },
                    {
                      key: 'checkmate',
                      label: t('settings.soundCheckmate'),
                      play: () => soundEngine.playCheckmate(),
                    },
                  ].map((fx) => (
                    <button
                      key={fx.key}
                      type="button"
                      disabled={!soundEnabled || soundVolume <= 0}
                      onClick={fx.play}
                      className="px-2 py-1.5 rounded-lg bg-[#12171E] hover:bg-emerald-600/20 border border-slate-800 hover:border-emerald-600/50 disabled:opacity-40 text-[11px] font-medium text-slate-200 transition-colors truncate"
                    >
                      {fx.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 bg-[#0B0E11] border border-slate-800 rounded-lg p-3">
              <div>
                <p className="text-xs font-semibold text-slate-100">
                  {t('settings.boardCoordinates')}
                </p>
                <p className="text-[11px] text-slate-400">{t('settings.coordsDesc')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showCoordinates}
                aria-label={t('settings.boardCoordinates')}
                onClick={() => void handleToggleCoordinates()}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors ${
                  showCoordinates
                    ? 'bg-emerald-600 border-emerald-500'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-[1px] ${
                    showCoordinates ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Low-Time Warning Color (< 10s) Configuration */}
            <div className="bg-[#0B0E11] border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-4 h-4 shrink-0" style={{ color: lowTimeWarningColor }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100">
                      {t('settings.timerWarningColor')}
                    </p>
                    <p className="text-[11px] text-slate-400">{t('settings.timerWarningDesc')}</p>
                  </div>
                </div>
                <span
                  className="font-mono text-[11px] font-bold uppercase px-2 py-0.5 rounded border shrink-0"
                  style={{
                    color: lowTimeWarningColor,
                    borderColor: lowTimeWarningColor,
                  }}
                >
                  {lowTimeWarningColor}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {LOW_TIME_COLOR_PRESETS.map((preset) => {
                  const active = lowTimeWarningColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void applyWarningColorImmediately(preset.hex)}
                      title={preset.label}
                      aria-label={`${preset.label} (${preset.hex})`}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform ${
                        active ? 'scale-110 border-white shadow-md' : 'border-slate-700 hover:scale-105'
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    >
                      {active && <Check className="w-3.5 h-3.5 text-slate-950 drop-shadow" />}
                    </button>
                  );
                })}

                <label className="ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#12171E] border border-slate-700 hover:border-slate-500 cursor-pointer text-[11px] font-medium text-slate-200">
                  <input
                    type="color"
                    aria-label={t('settings.timerCustomColor')}
                    value={lowTimeWarningColor}
                    onChange={(e) => {
                      const next = sanitizeWarningHexColor(e.target.value);
                      setLowTimeWarningColor(next);
                      persistLocalWarningColor(next);
                    }}
                    onBlur={(e) => void applyWarningColorImmediately(e.target.value)}
                    className="w-4 h-4 rounded bg-transparent border-0 p-0 cursor-pointer"
                  />
                  <span>{t('settings.timerCustomColor')}</span>
                </label>
              </div>
            </div>

            <label className="flex items-center justify-between bg-[#0B0E11] border border-slate-800 rounded-lg p-3 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-100">{t('settings.autoQueen')}</p>
                <p className="text-[11px] text-slate-400">{t('settings.autoQueenDesc')}</p>
              </div>
              <input
                type="checkbox"
                checked={autoQueen}
                onChange={(e) => setAutoQueen(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? t('settings.saving') : t('settings.savePreferences')}
          </button>
        </form>
      </div>
    </div>
  );
}
