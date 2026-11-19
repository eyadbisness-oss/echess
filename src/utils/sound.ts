import { Chess } from 'chess.js';
import { triggerChessHaptic } from './nativeAndroid';

const STORAGE_ENABLED_KEY = 'echess_sound_enabled';
const STORAGE_VOLUME_KEY = 'echess_sound_volume';

export interface ChessMoveSoundInfo {
  captured?: unknown;
  flags?: string;
  san?: string;
}

class ChessSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _enabled = true;
  private _volume = 0.8; // 0..1

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const storedEnabled = window.localStorage.getItem(STORAGE_ENABLED_KEY);
        if (storedEnabled === 'false') this._enabled = false;
        const storedVol = window.localStorage.getItem(STORAGE_VOLUME_KEY);
        if (storedVol !== null) {
          const parsed = Number(storedVol);
          if (!Number.isNaN(parsed)) {
            this._volume = Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
          }
        }
      } catch {
        // ignore storage restrictions
      }
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    this._enabled = Boolean(val);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_ENABLED_KEY, String(this._enabled));
      } catch {
        // ignore
      }
    }
    this.syncMasterGain();
  }

  get volume(): number {
    return this._volume;
  }

  set volume(val: number) {
    const clamped = Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : 0.8;
    this._volume = clamped;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_VOLUME_KEY, String(Math.round(clamped * 100)));
      } catch {
        // ignore
      }
    }
    this.syncMasterGain();
  }

  private syncMasterGain() {
    if (!this.ctx || !this.masterGain) return;
    const effective = this._enabled ? this._volume : 0;
    this.masterGain.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.01);
  }

  private getAudioNodes(): { ctx: AudioContext; out: GainNode } | null {
    if (!this._enabled || this._volume <= 0.001 || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this._enabled ? this._volume : 0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (!this.ctx || !this.masterGain) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.masterGain.gain.setValueAtTime(this._volume, this.ctx.currentTime);
    return { ctx: this.ctx, out: this.masterGain };
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.35));
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainVal = 0.22,
    delay = 0
  ) {
    const nodes = this.getAudioNodes();
    if (!nodes) return;
    const { ctx, out } = nodes;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(32, endFreq), now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private playNoiseBurst(
    filterFreq: number,
    q: number,
    duration: number,
    gainVal: number,
    delay = 0
  ) {
    const nodes = this.getAudioNodes();
    if (!nodes) return;
    const { ctx, out } = nodes;
    const now = ctx.currentTime + delay;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(q, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  /** Warm wooden piece-placement thud */
  playMove() {
    this.playTone(195, 88, 0.068, 'triangle', 0.28, 0);
    this.playTone(340, 145, 0.032, 'sine', 0.11, 0);
    this.playNoiseBurst(950, 2.2, 0.028, 0.18, 0);
    triggerChessHaptic('light');
  }

  /** Crisp, punchy capture snap */
  playCapture() {
    this.playTone(155, 58, 0.095, 'triangle', 0.34, 0);
    this.playTone(460, 175, 0.048, 'sawtooth', 0.14, 0);
    this.playNoiseBurst(1750, 1.6, 0.052, 0.32, 0);
    this.playTone(280, 110, 0.04, 'sine', 0.15, 0.022);
    triggerChessHaptic('medium');
  }

  /** Staggered double wooden tap for King + Rook castling */
  playCastle() {
    this.playTone(190, 86, 0.06, 'triangle', 0.25, 0);
    this.playNoiseBurst(900, 2.0, 0.024, 0.15, 0);
    this.playTone(235, 105, 0.072, 'triangle', 0.26, 0.085);
    this.playNoiseBurst(1080, 2.2, 0.028, 0.16, 0.085);
    triggerChessHaptic('medium');
  }

  /** Bright alert harmonic chime for Check */
  playCheck() {
    this.playTone(195, 92, 0.055, 'triangle', 0.2, 0);
    this.playTone(620, 560, 0.16, 'sine', 0.22, 0.01);
    this.playTone(930, 880, 0.14, 'triangle', 0.14, 0.025);
    triggerChessHaptic('heavy');
  }

  /** Resonant finale cadence for Checkmate */
  playCheckmate() {
    this.playTone(130, 52, 0.14, 'triangle', 0.3, 0);
    this.playNoiseBurst(1400, 1.4, 0.045, 0.22, 0);
    this.playTone(392.0, 390.0, 0.22, 'sine', 0.2, 0.02);
    this.playTone(523.25, 520.0, 0.26, 'sine', 0.22, 0.11);
    this.playTone(659.25, 656.0, 0.32, 'triangle', 0.22, 0.2);
    this.playTone(783.99, 780.0, 0.48, 'sine', 0.26, 0.29);
    triggerChessHaptic('heavy');
  }

  /** Soft resolution chime for draws, resignations, and timeouts */
  playGameEnd() {
    this.playTone(330, 326, 0.14, 'sine', 0.18, 0);
    this.playTone(440, 436, 0.18, 'sine', 0.18, 0.1);
    this.playTone(554.37, 550, 0.26, 'sine', 0.18, 0.21);
    triggerChessHaptic('medium');
  }

  /** Uplifting chime for puzzle/lesson success */
  playSuccess() {
    this.playTone(523.25, 523.25, 0.11, 'sine', 0.2, 0);
    this.playTone(659.25, 659.25, 0.18, 'sine', 0.22, 0.085);
    triggerChessHaptic('success');
  }

  /** Soft muted error tone for invalid/wrong puzzle attempts */
  playError() {
    this.playTone(165, 112, 0.16, 'sawtooth', 0.16, 0);
    triggerChessHaptic('error');
  }

  /** Plays the highest-priority sound effect for a completed Chess state and move */
  playForChessMove(chessInstance: Chess, move?: ChessMoveSoundInfo | null) {
    if (chessInstance.isCheckmate()) {
      this.playCheckmate();
      return;
    }
    if (chessInstance.inCheck()) {
      this.playCheck();
      return;
    }
    const san = move?.san || '';
    const flags = move?.flags || '';
    if (move?.captured || san.includes('x')) {
      this.playCapture();
      return;
    }
    if (flags.includes('k') || flags.includes('q') || san === 'O-O' || san === 'O-O-O') {
      this.playCastle();
      return;
    }
    this.playMove();
  }

  /** Plays sound effect from a FEN string and optional SAN string (e.g. during review/PV playback) */
  playFromFenAndSan(fenAfter: string, san?: string) {
    if (san) {
      if (san.includes('#')) {
        this.playCheckmate();
        return;
      }
      if (san.includes('+')) {
        this.playCheck();
        return;
      }
      if (san.includes('x')) {
        this.playCapture();
        return;
      }
      if (san.startsWith('O-O')) {
        this.playCastle();
        return;
      }
    }
    try {
      const probe = new Chess(fenAfter);
      if (probe.isCheckmate()) {
        this.playCheckmate();
        return;
      }
      if (probe.inCheck()) {
        this.playCheck();
        return;
      }
    } catch {
      // ignore invalid FEN
    }
    this.playMove();
  }
}

export const soundEngine = new ChessSoundEngine();
