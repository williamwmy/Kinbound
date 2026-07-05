// Lyd (spec kap. 5). All lyd syntetiseres med Web Audio API - ingen lydfiler.
// v2: komponert musikk (akkordprogresjon + bass + perkusjon + fast melodi som
// looper = gjenkjennelig), delay/ekko for romfølelse, og punchy SFX med
// pitch-sveip. Respekterer innstillingene for musikk/lydeffekter.
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

// Skalaer (frekvenser i Hz), ett humør per sonetema.
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

// Komposisjon per tema: tempo (BPM), akkordprogresjon (skala-grader, 4 takter)
// og melodibølge. Melodien genereres deterministisk (seed = temanavn) så hver
// sone har sin EGEN gjenkjennelige melodi som looper.
const MOODS: Record<string, { bpm: number; prog: number[]; wave: Wave }> = {
  calm: { bpm: 92, prog: [0, 3, 4, 3], wave: 'triangle' },
  forest: { bpm: 100, prog: [0, 2, 4, 3], wave: 'triangle' },
  mountain: { bpm: 84, prog: [0, 4, 2, 4], wave: 'square' },
  swamp: { bpm: 74, prog: [0, 1, 0, 4], wave: 'sine' },
  volcano: { bpm: 112, prog: [0, 2, 1, 4], wave: 'sawtooth' },
  snow: { bpm: 86, prog: [0, 3, 1, 4], wave: 'sine' },
  ruins: { bpm: 78, prog: [0, 1, 3, 4], wave: 'triangle' },
  castle: { bpm: 96, prog: [0, 4, 3, 4], wave: 'triangle' },
  boss: { bpm: 140, prog: [0, 1, 0, 2], wave: 'sawtooth' },
};

/** Liten deterministisk RNG så hver sone-melodi er fast (og dermed huskbar). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const STEPS_PER_BAR = 8; // åttedeler, 4 takter per loop
const LOOP_STEPS = STEPS_PER_BAR * 4;

class AudioManagerImpl {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private echoIn?: GainNode;
  private musicTimer?: ReturnType<typeof setInterval>;
  private currentScale: string | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private stepDur = 0.3;
  private bossMode = false;
  private scaleFreqs: number[] = SCALES.calm;
  private mood = MOODS.calm;
  /** forhåndskomponert melodi: freq (0 = pause) per steg i loopen */
  private melody: number[] = [];
  private lastHit = 0;
  private lastAttack = 0;
  private lastCoin = 0;
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
    // selvoppofrings-gjenoppliving: stigende, varm «andre vind» (spec kap. 29)
    EventBus.on('player:revived', () => this.jingle([392, 523, 659, 880], 'triangle'));
    EventBus.on(Events.Saved, () => this.sfx('save'));
    EventBus.on('victory', () => this.jingle([523, 659, 784, 1047, 784, 1047], 'triangle'));
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
        // delay/ekko-send: gir musikk og jingler romfølelse
        this.echoIn = this.ctx.createGain();
        this.echoIn.gain.value = 1;
        const delay = this.ctx.createDelay(1);
        delay.delayTime.value = 0.27;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.3;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.2;
        this.echoIn.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(this.master);
        // all musikk sendes til ekkoet med lav miks
        const musicSend = this.ctx.createGain();
        musicSend.gain.value = 0.35;
        this.musicGain.connect(musicSend);
        musicSend.connect(this.echoIn);
      } catch {
        return undefined;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // --- lydeffekter --------------------------------------------------------
  /**
   * Én tone. `sweepTo` gir pitch-sveip (punch), `echo` sender til delay,
   * `when` er absolutt ctx-tid (0 = nå).
   */
  private tone(freq: number, wave: Wave, duration: number, gain: number, when = 0, sweepTo = 0, echo = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when > 2 ? when : ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    if (echo > 0 && this.echoIn) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send);
      send.connect(this.echoIn);
    }
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** Støy-burst. `filter` former lyden: hat (highpass), snare (bandpass), scrape (lowpass). */
  private noise(duration: number, gain: number, when = 0, filter?: { type: BiquadFilterType; freq: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = when > 2 ? when : ctx.currentTime + when;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buffer;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      src.connect(f);
      f.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(this.master);
    src.start(t);
  }

  /** Spill en navngitt lydeffekt. Element gir monstrene ulik klang. */
  sfx(name: string, element?: ElementId): void {
    if (!Settings.sfx) return;
    if (!this.ensure()) return;
    // rune-toner for Simon-says-gåten: pentatonisk, én tone per rune
    if (name.startsWith('rune')) {
      const idx = Math.min(4, Math.max(0, Number(name.slice(4)) || 0));
      const freqs = [392, 440, 523.3, 587.3, 659.3];
      this.tone(freqs[idx], 'triangle', 0.34, 0.2, 0, 0, 0.5);
      return;
    }
    switch (name) {
      case 'attack': {
        const now = performance.now();
        if (now - this.lastAttack < 70) return; // demp mange samtidige angrep
        this.lastAttack = now;
        const v = element ? ELEMENT_VOICE[element] : { wave: 'square' as Wave, base: 200 };
        // "svisj": rask pitch-fall + luftig støy
        this.tone(v.base * 2.3, v.wave, 0.09, 0.13, 0, v.base * 1.1);
        this.noise(0.05, 0.05, 0, { type: 'highpass', freq: 2500 });
        break;
      }
      case 'hit': {
        const now = performance.now();
        if (now - this.lastHit < 60) return; // unngå spamming
        this.lastHit = now;
        // "dunk": lavfrekvent sveip gir fysisk tyngde
        this.tone(150, 'sine', 0.11, 0.3, 0, 52);
        this.noise(0.06, 0.1);
        if (element) this.tone(ELEMENT_VOICE[element].base, ELEMENT_VOICE[element].wave, 0.07, 0.08);
        break;
      }
      case 'crit': {
        this.tone(160, 'sine', 0.13, 0.34, 0, 48);
        this.noise(0.08, 0.13);
        this.tone(1318, 'triangle', 0.12, 0.14, 0.01, 0, 0.4); // lys "pling" oppå
        break;
      }
      case 'coin': {
        const now = performance.now();
        if (now - this.lastCoin < 50) return;
        this.lastCoin = now;
        this.tone(1046.5, 'sine', 0.06, 0.15);
        this.tone(1568, 'sine', 0.09, 0.13, 0.045, 0, 0.3);
        break;
      }
      case 'heart':
        this.tone(523.3, 'triangle', 0.12, 0.14);
        this.tone(659.3, 'triangle', 0.16, 0.12, 0.07, 0, 0.3);
        break;
      case 'buzz':
        // feil svar i gåter: dissonant brumming
        this.tone(98, 'square', 0.28, 0.16);
        this.tone(104, 'square', 0.28, 0.14);
        break;
      case 'push':
        // stein som skyves: lav skrubbelyd
        this.noise(0.16, 0.2, 0, { type: 'lowpass', freq: 420 });
        this.tone(85, 'sine', 0.16, 0.16, 0, 60);
        break;
      case 'chest':
        this.jingle([523, 659, 784], 'triangle');
        break;
      case 'buy':
        this.tone(880, 'sine', 0.1, 0.15);
        break;
      case 'faint':
        this.tone(196, 'sawtooth', 0.3, 0.16, 0, 130);
        this.tone(147, 'sawtooth', 0.3, 0.14, 0.08, 0, 0.3);
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
    freqs.forEach((f, i) => this.tone(f, wave, 0.16, 0.16, i * 0.09, 0, 0.45));
  }

  // --- musikk -------------------------------------------------------------
  /**
   * Start komponert bakgrunnsmusikk for et sonetema: akkordprogresjon over
   * 4 takter, bass, arpeggio, perkusjon og en fast (seedet) melodi som looper.
   * Ved boss byttes til et mørkere, raskere tema (spec kap. 5).
   */
  playMusic(theme: string, boss = false): void {
    const scaleKey = boss ? 'boss' : this.themeToScale(theme);
    if (this.currentScale === scaleKey && this.musicTimer) {
      this.fadeMusic(Settings.music ? 0.16 : 0);
      return;
    }
    this.currentScale = scaleKey;
    this.stopMusic();
    if (!Settings.music || !this.ensure()) return;
    this.fadeMusic(0.16);
    this.bossMode = boss;
    this.scaleFreqs = SCALES[scaleKey] ?? SCALES.calm;
    this.mood = MOODS[scaleKey] ?? MOODS.calm;
    this.stepDur = 60 / this.mood.bpm / 2; // åttedeler
    this.melody = this.composeMelody(scaleKey);
    this.step = 0;
    this.nextNoteTime = (this.ctx?.currentTime ?? 0) + 0.1;
    // lookahead-planlegger: stram timing uansett setInterval-jitter
    this.musicTimer = setInterval(() => this.scheduleAhead(), 80);
  }

  /** Akkordtoner (triade) for takten: skala-grad d, d+2, d+4 med oktavløft ved wrap. */
  private chord(bar: number): number[] {
    const deg = this.mood.prog[bar % this.mood.prog.length];
    const n = this.scaleFreqs.length;
    return [0, 2, 4].map((o) => {
      const idx = deg + o;
      return this.scaleFreqs[idx % n] * (idx >= n ? 2 : 1);
    });
  }

  /** Komponer en fast melodi for loopen (seedet av temanavnet = huskbar). */
  private composeMelody(scaleKey: string): number[] {
    const rnd = mulberry32(hashStr(scaleKey));
    const out: number[] = new Array(LOOP_STEPS).fill(0);
    for (let s = 0; s < LOOP_STEPS; s++) {
      const bar = Math.floor(s / STEPS_PER_BAR);
      const beat = s % STEPS_PER_BAR;
      // melodirytme: taktslag 0 alltid, ellers glissende sannsynlighet + pauser
      const p = beat === 0 ? 0.95 : beat % 2 === 0 ? 0.55 : 0.25;
      if (rnd() > p) continue;
      const chord = this.chord(bar);
      // akkordtone som anker, av og til nabotone i skalaen som krydder
      if (rnd() < 0.7) {
        out[s] = chord[Math.floor(rnd() * chord.length)] * 2;
      } else {
        const idx = Math.floor(rnd() * this.scaleFreqs.length);
        out[s] = this.scaleFreqs[idx] * 2;
      }
    }
    return out;
  }

  /** Planlegg alle steg som faller innen lookahead-vinduet. */
  private scheduleAhead(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !Settings.music) return;
    while (this.nextNoteTime < ctx.currentTime + 0.2) {
      this.scheduleStep(this.step % LOOP_STEPS, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step++;
    }
  }

  /** Én åttedel: perkusjon + bass + arpeggio + melodi, alt via musicGain. */
  private scheduleStep(s: number, t: number): void {
    const ctx = this.ctx!;
    const bar = Math.floor(s / STEPS_PER_BAR);
    const beat = s % STEPS_PER_BAR;
    const chord = this.chord(bar);
    const boss = this.bossMode;

    const play = (freq: number, wave: Wave, dur: number, gain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.musicGain!);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    const perc = (dur: number, gain: number, type: BiquadFilterType, freq: number) => {
      const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      f.type = type;
      f.frequency.value = freq;
      g.gain.value = gain;
      src.buffer = buffer;
      src.connect(f); f.connect(g); g.connect(this.musicGain!);
      src.start(t);
    };

    // KICK: mykt pitch-fall på slag 1 (boss også slag 3)
    if (beat === 0 || (boss && beat === 4)) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(boss ? 0.55 : 0.4, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(g); g.connect(this.musicGain!);
      osc.start(t); osc.stop(t + 0.18);
    }
    // HAT: offbeats (boss: hvert steg) - luftig puls
    if (beat % 2 === 1 || boss) perc(0.03, boss ? 0.09 : 0.06, 'highpass', 7000);
    // SNARE: boss får backbeat-smell
    if (boss && (beat === 2 || beat === 6)) perc(0.09, 0.16, 'bandpass', 1800);
    // BASS: rot på 1 og 3 (boss: pumpende åttedeler)
    if (beat === 0 || beat === 4 || (boss && beat % 2 === 0)) {
      play(chord[0] / 2, 'sine', this.stepDur * 1.6, 0.42);
    }
    // ARPEGGIO: akkordtoner i bølge, hopper over noen steg for luft
    const arpPattern = [0, 1, 2, 1, 0, 2, 1, 2];
    if (!(beat === 3 && bar % 2 === 1)) {
      play(chord[arpPattern[beat]], 'triangle', this.stepDur * 0.9, 0.12);
    }
    // MELODI: den faste, seedede linja (oktaven over) - synger over det hele
    const m = this.melody[s];
    if (m > 0) play(m, this.mood.wave, this.stepDur * (beat === 0 ? 1.9 : 1.1), boss ? 0.2 : 0.17);
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
    this.fadeMusic(Settings.music ? 0.16 : 0);
    if (!Settings.music) this.stopMusic();
  }
}

export const AudioManager = new AudioManagerImpl();
