import type { SoundPort } from '../../ports/SoundPort.ts';

/**
 * Tiny Web Audio synthesiser: every sound effect is generated at runtime, so
 * the game ships zero audio files and stays fully offline.
 *
 * The renderer owns when sounds play; nothing in the game world knows about
 * audio at all.
 */
export class SoundFx implements SoundPort {
  private ctx: AudioContext | null = null;
  private failed = false;

  /** Must be called from a user gesture, otherwise mobile WebViews stay silent. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private context(): AudioContext | null {
    if (this.failed) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    frequency: number,
    gain: number,
    start: number,
    decay: number,
  ): void {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
    envelope.gain.setValueAtTime(gain, ctx.currentTime + start);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + decay);
    oscillator.connect(envelope).connect(ctx.destination);
    oscillator.start(ctx.currentTime + start);
    oscillator.stop(ctx.currentTime + start + decay + 0.02);
  }

  private noise(ctx: AudioContext, gain: number, start: number, decay: number): void {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * decay));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime + start);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + decay);
    source.connect(envelope).connect(ctx.destination);
    source.start(ctx.currentTime + start);
  }

  /** Card tapped. */
  tap(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.tone(ctx, 'triangle', 520, 0.16, 0, 0.07);
  }

  /** The enemy's pick flips over. */
  reveal(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.tone(ctx, 'square', 300, 0.08, 0, 0.06);
    this.tone(ctx, 'square', 620, 0.07, 0.1, 0.07);
  }

  /** Enemy defeated — the pitch climbs with the streak, then caps. */
  win(streak: number): void {
    const ctx = this.context();
    if (!ctx) return;
    const lift = Math.min(streak, 5) * 40;
    this.tone(ctx, 'triangle', 440 + lift, 0.2, 0, 0.12);
    this.tone(ctx, 'triangle', 660 + lift, 0.18, 0.07, 0.14);
    this.tone(ctx, 'sine', 880 + lift, 0.14, 0.14, 0.2);
  }

  /** Heart lost. */
  lose(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.tone(ctx, 'sawtooth', 220, 0.2, 0, 0.2);
    this.tone(ctx, 'sawtooth', 130, 0.18, 0.09, 0.3);
    this.noise(ctx, 0.12, 0, 0.18);
  }

  /** Tie — a little spark. */
  tie(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.tone(ctx, 'sine', 900, 0.12, 0, 0.08);
    this.tone(ctx, 'sine', 1200, 0.09, 0.06, 0.1);
  }

  /** Run over. */
  gameOver(): void {
    const ctx = this.context();
    if (!ctx) return;
    const notes = [523, 415, 330, 220];
    notes.forEach((note, i) => this.tone(ctx, 'square', note, 0.16, i * 0.16, 0.3));
    this.noise(ctx, 0.1, 0.6, 0.5);
  }
}
