// Lyd (spec kap. 5). All lyd syntetiseres med Web Audio API - ingen lydfiler.
// Gir unike lydeffekter (varierer per element), rolig bakgrunnsmusikk per sone
// og dynamisk bossmusikk. Respekterer innstillingene for musikk/lydeffekter.
import { EventBus, Events } from './EventBus';
import { Settings } from './Settings';
import type { ElementId } from '../types';

type Wave = OscillatorType;

// Tonehøyde/bølgeform per element gir hvert monster sin egen klang.
const ELEMENT_VOICE: Record<ElementId, { wave: Wave; base: number }> = {
  fire: { wave: 'sawtooth', base: 220 },
  water: { wave: 'sine', base: 330 },
  earth: { wave: 'square', base: 130 },
  nature: { wave: 'triangle', base: 290 },
  wind: { wave: 'sine', base: 440 },
  lightning: { wave: 'sawtooth', base: 520 },
  light: { wave: 'triangle', base: 660 },
  dark: { wave: 'square', base: 98 },
};

// Skalaer (frekvenser i Hz) for prosedyral musikk, ett humør per sonetema.
const SCALES: Record<string, number[]> = {
  calm: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3],
  forest: [261.6, 293.7, 311.1, 349.2, 392.0, 466.2],
  mountain: [196.0, 220.0, 261.6, 293.7, 329.6, 392.0],
  swamp: [174.6, 196.0, 233.1, 261.6, 311.1, 349.2],
  volcano: [146.8, 174.6, 196.0, 233.1, 277.2, 311.1],
  snow: [329.6, 369.9, 415.3, 493.9, 554.4, 659.3],
  ruins: [155.6, 185.0, 207.7, 246.9, 277.2, 329.6],
  castle: [130.8, 164.8, 196.0, 246.9, 293.7, 392.0],
  boss: [110.0, 138.6, 164.8, 220.0, 277.2, 329.6],
};

class AudioManagerImpl {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private musicTimer?: ReturnType<typeof setInterval>;
  private currentScale: string | null = null;
  private step = 0;
  private lastHit = 0;
  private lastAttack = 0;
  private bound = false;

  /** Kobler til EventBus og venter på første brukerinteraksjon (autoplay-regler). */
  init(): void {
    if (this.bound) return;
    this.bound = true;
    const resume = () => this.ensure();
    window.addEventListener('pointerdown', resume, { once: false });
    window.addEventListener('keydown', resume, { once: false });

    EventBus.on('sfx', (name, element) => this.sfx(name as string, element as ElementId | undefined));
    EventBus.on('music:play', (theme, boss) => this.playMusic(theme as string, !!boss));
    EventBus.on('music:stop', () => this.stopMusic());
    EventBus.on(Events.MonsterRecruited, () => this.jingle([392, 523, 659], 'triangle'));
    EventBus.on(Events.MonsterEvolved, () => this.jingle([330, 415, 523, 659], 'sawtooth'));
    EventBus.on(Events.MonsterFainted, () => this.sfx('faint'));
    EventBus.on(Events.PlayerDied, () => this.jingle([294, 233, 175], 'square'));
    EventBus.on(Events.Saved, () => this.sfx('save'));
  }

  private ensure(): AudioContext | undefined {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;
        this.musicGain.connect(this.master);
      } catch {
        return undefined;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // --- lydeffekter --------------------------------------------------------
  private tone(freq: number, wave: Wave, duration: number, gain: number, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buffer;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** Spill en navngitt lydeffekt. Element gir monstrene ulik klang. */
  sfx(name: string, element?: ElementId): void {
    if (!Settings.sfx) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'attack': {
        const now = performance.now();
        if (now - this.lastAttack < 70) return; // demp mange samtidige angrep
        this.lastAttack = now;
        const v = element ? ELEMENT_VOICE[element] : { wave: 'square' as Wave, base: 200 };
        this.tone(v.base * 1.5, v.wave, 0.12, 0.16);
        break;
      }
      case 'hit': {
        const now = performance.now();
        if (now - this.lastHit < 60) return; // unngå spamming
        this.lastHit = now;
        this.noise(0.08, 0.12);
        if (element) this.tone(ELEMENT_VOICE[element].base, ELEMENT_VOICE[element].wave, 0.08, 0.1);
        break;
      }
      case 'chest':
        this.jingle([523, 659, 784], 'triangle');
        break;
      case 'buy':
        this.tone(880, 'sine', 0.1, 0.15);
        break;
      case 'faint':
        this.tone(196, 'sawtooth', 0.3, 0.16);
        this.tone(147, 'sawtooth', 0.3, 0.14, 0.08);
        break;
      case 'save':
        this.tone(659, 'sine', 0.08, 0.12);
        this.tone(880, 'sine', 0.08, 0.1, 0.08);
        break;
      case 'explore':
        this.jingle([440, 554, 659, 880], 'triangle');
        break;
      default:
        this.tone(440, 'sine', 0.1, 0.12);
    }
  }

  private jingle(freqs: number[], wave: Wave): void {
    if (!Settings.sfx || !this.ensure()) return;
    freqs.forEach((f, i) => this.tone(f, wave, 0.16, 0.16, i * 0.09));
  }

  // --- musikk -------------------------------------------------------------
  /**
   * Start prosedyral bakgrunnsmusikk for et sonetema. Ved boss byttes det til
   * et mørkere, raskere tema (dynamisk bossmusikk, spec kap. 5).
   */
  playMusic(theme: string, boss = false): void {
    const scaleKey = boss ? 'boss' : this.themeToScale(theme);
    if (this.currentScale === scaleKey && this.musicTimer) {
      this.fadeMusic(Settings.music ? 0.18 : 0);
      return;
    }
    this.currentScale = scaleKey;
    this.stopMusic();
    if (!Settings.music || !this.ensure()) return;
    this.fadeMusic(0.18);
    this.step = 0;
    const interval = boss ? 280 : 460;
    const scale = SCALES[scaleKey] ?? SCALES.calm;
    this.musicTimer = setInterval(() => this.musicTick(scale, boss), interval);
  }

  private musicTick(scale: number[], boss: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !Settings.music) return;
    const t = ctx.currentTime;
    // melodinote
    const note = scale[this.step % scale.length];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = boss ? 'sawtooth' : 'triangle';
    osc.frequency.value = note * (this.step % 8 < 4 ? 1 : 2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (boss ? 0.26 : 0.42));
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.5);
    // basstone på hver fjerde
    if (this.step % 4 === 0) {
      const bass = ctx.createOscillator();
      const bg = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.value = scale[0] / 2;
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      bass.connect(bg);
      bg.connect(this.musicGain);
      bass.start(t);
      bass.stop(t + 0.7);
    }
    this.step++;
  }

  private fadeMusic(target: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(target, t + 0.6);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  private themeToScale(theme: string): string {
    return SCALES[theme] ? theme : 'calm';
  }

  /** Oppdater volum live når innstillingene endres. */
  refreshFromSettings(): void {
    this.fadeMusic(Settings.music ? 0.18 : 0);
    if (!Settings.music) this.stopMusic();
  }
}

export const AudioManager = new AudioManagerImpl();
