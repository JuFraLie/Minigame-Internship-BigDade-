import type { SoundPort } from '../../ports/SoundPort.ts';

/** Builds the audio context; injectable so tests can drive a fake one. */
export type ContextFactory = () => AudioContext;

/** Peak level of the sound-effects bus, before the master gain. */
const SFX_VOLUME = 0.5;
/** Peak level of the music bus; the music ramps between 0 and this. */
const MUSIC_VOLUME = 0.32;
/** Everything meets here, a touch under unity so overlaps do not clip. */
const MASTER_VOLUME = 0.9;

/** 96 BPM in sixteenths - one step of the sequencer. */
const STEP = 60 / 96 / 4;
/** How far ahead of the clock the scheduler queues notes. */
const LOOKAHEAD = 0.12;
/** Scheduler tick; must stay shorter than the lookahead. */
const TICK_MS = 25;
/** Four bars of sixteenths: the length of the music loop. */
const LOOP = 64;
/** Steps in a bar, and the bars' root notes: i - VI - III - VII in A minor. */
const BAR_STEPS = 16;
const ROOTS = [110, 87.31, 130.81, 98];
/** Bar 0 is minor (A), the rest are the major chords of the progression. */
const THIRDS = [
  [1, 1.1892, 1.4983], // minor: root, minor third, fifth
  [1, 1.2599, 1.4983], // major: root, major third, fifth
];
/** Which chord tone the lead picks on each eighth note of a bar. */
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
/** Where the rhythm section lands, as offsets into a bar. */
const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const KICK_STEPS = [0, 6, 8];
const SNARE_STEPS = [4, 12];

/**
 * Every sound in LAST BULLET, synthesised at runtime.
 *
 * There are no audio files: Web Audio builds each cue from oscillators and a
 * cached slice of white noise, and the music is a four-bar sequencer whose
 * notes are queued against `AudioContext.currentTime` a fraction of a second
 * ahead. Nothing is fetched, nothing is stored - the game stays offline
 * (AGENTS.md section 3.4) and ships zero bytes of audio.
 *
 * The context is created lazily on the first cue, which the scenes only ever
 * fire from a user gesture, so mobile autoplay policies never get a chance to
 * keep the game silent. If the platform has no Web Audio at all the engine
 * gives up quietly: silence is a degraded experience, not a crash.
 */
export class AudioEngine implements SoundPort {
  private readonly makeContext: ContextFactory;
  private ctx: AudioContext | null = null;
  private failed = false;

  /** Master / sfx / music gain nodes, built once the first cue needs them. */
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Two seconds of white noise, reused by every burst so none is built twice. */
  private noise: AudioBuffer | null = null;

  /** When each throttled cue last sounded, in `AudioContext` seconds. */
  private readonly lastPlayed = new Map<string, number>();
  /** The scheduler's timer; null whenever the music is not running. */
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextStepAt = 0;

  constructor(makeContext: ContextFactory = () => new AudioContext()) {
    this.makeContext = makeContext;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Must be called from a user gesture, otherwise mobile WebViews stay silent. */
  unlock(): void {
    const ctx = this.context();
    if (ctx) this.wake(ctx);
  }

  // -------------------------------------------------------------------------
  // Background music
  // -------------------------------------------------------------------------

  /** Starts the loop from the top; a no-op while it is already running. */
  startMusic(): void {
    this.run(true);
  }

  /** Silences the music but keeps its position, for the pause overlay. */
  pauseMusic(): void {
    this.haltTimer();
    this.rampMusic(0, 0.15);
  }

  /** Continues from where `pauseMusic` held it. */
  resumeMusic(): void {
    this.run(false);
  }

  /** Silences the music and rewinds it, so the next round starts at bar one. */
  stopMusic(): void {
    this.haltTimer();
    this.rampMusic(0, 0.2);
    this.step = 0;
  }

  /**
   * Brings the loop up and, if the scheduler is not already running, starts
   * it - from bar one for `fromTop`, from the held beat otherwise. Starting
   * while it plays is a no-op beyond the fade, so two scenes asking for the
   * music a moment apart never produce two loops.
   */
  private run(fromTop: boolean): void {
    const ctx = this.context();
    if (!ctx || !this.graph(ctx)) return;
    this.wake(ctx);
    this.rampMusic(MUSIC_VOLUME, 0.5);
    if (this.timer !== null) return;
    if (fromTop) this.step = 0;
    this.nextStepAt = ctx.currentTime + 0.1;
    this.timer = setInterval(this.pump, TICK_MS);
  }

  // -------------------------------------------------------------------------
  // Sound effects
  // -------------------------------------------------------------------------

  /** The revolver cracks. */
  shot(): void {
    const ctx = this.ready('shot', 0.05);
    if (!ctx) return;
    this.burst(ctx, 0.28, 0, 0.05);
    this.tone(ctx, 'sawtooth', 900, 0.22, 0, 0.12, 160);
  }

  /** The dropped bullet is back in the chamber. */
  pickup(): void {
    const ctx = this.ready('pickup', 0.06);
    if (!ctx) return;
    this.tone(ctx, 'triangle', 660, 0.16, 0, 0.08);
    this.tone(ctx, 'triangle', 990, 0.14, 0.05, 0.1);
  }

  /** A zombie drops; the pitch wanders so a horde never sounds like one click. */
  kill(): void {
    const ctx = this.ready('kill', 0.07);
    if (!ctx) return;
    const pitch = 0.85 + Math.random() * 0.3;
    this.burst(ctx, 0.2, 0, 0.12);
    this.tone(ctx, 'square', 190 * pitch, 0.16, 0, 0.1, 90 * pitch);
  }

  /** The player takes damage. */
  playerHit(): void {
    const ctx = this.ready('playerHit', 0.15);
    if (!ctx) return;
    this.burst(ctx, 0.2, 0, 0.16);
    this.tone(ctx, 'sawtooth', 240, 0.24, 0, 0.18, 110);
  }

  /** Explosive Round's blast. */
  explosion(): void {
    const ctx = this.ready('explosion', 0.2);
    if (!ctx) return;
    this.burst(ctx, 0.34, 0, 0.55);
    this.tone(ctx, 'sine', 95, 0.32, 0, 0.4, 38);
  }

  /** The XP bar filled - the level-up overlay is about to open. */
  levelUp(): void {
    const ctx = this.ready('levelUp', 0);
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, i) => this.tone(ctx, 'triangle', note, 0.16, i * 0.09, 0.26));
  }

  /** A card was taken. */
  upgrade(): void {
    const ctx = this.ready('upgrade', 0);
    if (!ctx) return;
    this.tone(ctx, 'sine', 784, 0.14, 0, 0.16);
    this.tone(ctx, 'sine', 1174.66, 0.12, 0.07, 0.22);
  }

  /** A new wave's spawn landed. */
  wave(): void {
    const ctx = this.ready('wave', 0);
    if (!ctx) return;
    this.tone(ctx, 'square', 130.81, 0.13, 0, 0.34);
    this.tone(ctx, 'square', 196, 0.13, 0.16, 0.42);
  }

  /** The run is over - the stinger over which the Result Panel opens. */
  gameOver(): void {
    const ctx = this.ready('gameOver', 0);
    if (!ctx) return;
    const notes = [392, 349.23, 293.66, 220];
    notes.forEach((note, i) => this.tone(ctx, 'square', note, 0.15, i * 0.18, 0.34));
    this.burst(ctx, 0.1, 0.6, 0.5);
  }

  /** Any button press: Play, Pause, Resume, Retry. */
  ui(): void {
    const ctx = this.ready('ui', 0.05);
    if (!ctx) return;
    this.tone(ctx, 'triangle', 900, 0.12, 0, 0.05);
  }

  // -------------------------------------------------------------------------
  // Audio plumbing
  // -------------------------------------------------------------------------

  /** Lazily builds the context; a platform without Web Audio gives up once. */
  private context(): AudioContext | null {
    if (this.failed) return null;
    if (!this.ctx) {
      try {
        this.ctx = this.makeContext();
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.ctx;
  }

  /** Resumes a suspended context - cheap, and it recovers from a background tab. */
  private wake(ctx: AudioContext): void {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  /**
   * Context for a cue that is allowed to sound: opens it, applies the cue's
   * throttle, and wakes the context when the tab comes back from the
   * background. Null means "stay silent".
   */
  private ready(key: string, minGap: number): AudioContext | null {
    const ctx = this.context();
    if (!ctx) return null;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && now - last < minGap) return null;
    this.lastPlayed.set(key, now);
    this.wake(ctx);
    return ctx;
  }

  /** Builds the three gain nodes on first use and returns the context. */
  private graph(ctx: AudioContext): boolean {
    if (this.master) return true;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.master);

      // The music bus opens at zero: `startMusic` is what turns it up.
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** The sound-effects bus, or null when audio is unavailable. */
  private sfx(ctx: AudioContext): GainNode | null {
    return this.graph(ctx) ? this.sfxBus : null;
  }

  /** Fades the music bus to `target`; a no-op when there is no context. */
  private rampMusic(target: number, seconds: number): void {
    const ctx = this.context();
    if (!ctx || !this.graph(ctx) || !this.musicBus) return;
    const gain = this.musicBus.gain;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + seconds);
  }

  private haltTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One oscillator with a percussive envelope: a short attack, then a decay
   * to silence. `to` sweeps the pitch, which is what turns a flat beep into a
   * gunshot or a kick drum.
   */
  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    from: number,
    gain: number,
    at: number,
    duration: number,
    to?: number,
  ): void {
    const bus = this.sfx(ctx);
    if (!bus) return;
    const start = ctx.currentTime + at;

    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    }

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope).connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /**
   * A slice of the shared noise buffer under its own envelope - the crack of
   * a shot, the thud of a hit, the body of an explosion. The random offset
   * keeps consecutive bursts from being sample-identical.
   */
  private burst(ctx: AudioContext, gain: number, at: number, duration: number): void {
    const bus = this.sfx(ctx);
    if (!bus) return;
    const start = ctx.currentTime + at;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(envelope).connect(bus);
    source.start(start, Math.random() * 0.5);
  }

  /**
   * Two seconds of white noise, built the first time a burst needs it. Long
   * enough that a random offset plus the longest tail still lands inside it,
   * so no burst is ever cut short at the buffer's end.
   */
  private noiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (!this.noise) {
      try {
        const frames = Math.max(1, Math.floor(ctx.sampleRate * 2));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buffer;
      } catch {
        return null;
      }
    }
    return this.noise;
  }

  // -------------------------------------------------------------------------
  // The sequencer
  // -------------------------------------------------------------------------

  /**
   * Queues every step that comes due inside the lookahead window. Runs on a
   * timer rather than the render loop, so the music keeps its groove even
   * when the game stutters - and stops dead with the timer when it pauses.
   */
  private readonly pump = (): void => {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || this.timer === null) return;

    // A throttled timer or a suspended context can leave the beat behind the
    // clock; never replay that gap as a burst of notes queued on one instant.
    // Resyncing to *now* keeps the next note inside the lookahead window, so
    // the loop picks straight back up rather than waiting a dead beat.
    if (this.nextStepAt < ctx.currentTime) this.nextStepAt = ctx.currentTime;

    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.nextStepAt < horizon) {
      const at = Math.max(this.nextStepAt, ctx.currentTime);
      this.playStep(ctx, bus, this.step % LOOP, at);
      this.step++;
      this.nextStepAt += STEP;
    }
  };

  /** Sounds bar `Math.floor(step / 16)`'s slice of the loop at time `at`. */
  private playStep(ctx: AudioContext, bus: GainNode, step: number, at: number): void {
    const inBar = step % BAR_STEPS;
    const bar = Math.floor(step / BAR_STEPS);
    const root = ROOTS[bar];
    const chord = THIRDS[bar === 0 ? 0 : 1];

    if (KICK_STEPS.includes(inBar)) this.musicKick(ctx, bus, at);
    if (SNARE_STEPS.includes(inBar)) this.musicNoise(ctx, bus, at, 0.3, 0.12);
    // Hats on the off-sixteenths, quiet enough to be felt and not heard.
    if (inBar % 2 === 1) this.musicNoise(ctx, bus, at, 0.07, 0.03);

    if (BASS_STEPS.includes(inBar)) {
      const octave = inBar === 6 || inBar === 14 ? 2 : 1;
      this.musicTone(ctx, bus, 'sawtooth', root * octave, 0.4, at, 0.16, 480);
    }

    // The lead arpeggiates the chord on every eighth note.
    if (inBar % 2 === 0) {
      const tone = chord[ARP[inBar / 2]];
      this.musicTone(ctx, bus, 'triangle', root * tone * 4, 0.18, at, 0.24);
    }

    // And the bar opens with a slow pad that rings under everything.
    if (inBar === 0) this.musicTone(ctx, bus, 'sawtooth', root * 2, 0.12, at, STEP * BAR_STEPS + 0.6, 700);
  }

  /** Kick drum: a sine pitched hard downward. */
  private musicKick(ctx: AudioContext, bus: GainNode, at: number): void {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.14);
    envelope.gain.setValueAtTime(0.9, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + 0.2);
  }

  /** One voice of the sequencer: oscillator, optional low-pass, own envelope. */
  private musicTone(
    ctx: AudioContext,
    bus: GainNode,
    type: OscillatorType,
    frequency: number,
    gain: number,
    at: number,
    duration: number,
    lowPass?: number,
  ): void {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    if (lowPass !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowPass, at);
      oscillator.connect(filter).connect(envelope).connect(bus);
    } else {
      oscillator.connect(envelope).connect(bus);
    }
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  /** Rhythm-section noise: snare and hat bodies, from the shared buffer. */
  private musicNoise(ctx: AudioContext, bus: GainNode, at: number, gain: number, duration: number): void {
    const buffer = this.noiseBuffer(ctx);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(envelope).connect(bus);
    source.start(at, Math.random() * 0.5);
  }
}
