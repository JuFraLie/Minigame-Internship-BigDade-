/**
 * Procedural sound effects — every note is synthesized with WebAudio, so the
 * game ships zero audio files (the same "no bundled assets" rule the textures
 * follow: they are drawn, not downloaded).
 *
 * Responsibilities:
 *   - own the AudioContext (created lazily, resumed inside the first user
 *     gesture — iOS refuses to start audio otherwise; main.ts calls unlock());
 *   - turn each SoundName into a tiny oscillator/noise one-shot with an
 *     envelope, so nothing clicks or hangs;
 *   - honour the session-wide mute (a gain ramp, never a hard cut).
 *
 * The domain never mentions this class — scenes fire effects from domain
 * events (see Game.ts), and the port lives in domain/ports.ts next to
 * RendererPort.
 */

import type { SoundName, SoundPort } from '../../domain/ports.ts';

/** Master volume; individual notes sit below it and sum to a comfortable level. */
const MASTER_GAIN = 0.55;

/** Cached white-noise buffer — reused by every percussive hit. */
const NOISE_SECONDS = 0.4;

type AudioContextCtor = typeof AudioContext;

export class WebAudioSynth implements SoundPort {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private isMuted = false;

    get muted(): boolean {
        return this.isMuted;
    }

    unlock(): void {
        if (!this.context) {
            const Ctor: AudioContextCtor | undefined =
                (typeof AudioContext !== 'undefined' ? AudioContext : undefined) ??
                (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
            if (!Ctor) return; // ancient WebView: the game plays silently, never breaks.
            try {
                this.context = new Ctor();
            } catch {
                this.context = null;
                return;
            }
            this.master = this.context.createGain();
            this.master.gain.value = this.isMuted ? 0 : MASTER_GAIN;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended') void this.context.resume();
    }

    setMuted(muted: boolean): void {
        this.isMuted = muted;
        // Ramp instead of cutting, so toggling never produces a click.
        if (this.context && this.master) {
            this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, this.context.currentTime, 0.02);
        }
    }

    play(name: SoundName, options?: { pitch?: number }): void {
        if (this.isMuted || !this.context || !this.master) return;
        // A page brought back from the background can arrive suspended.
        if (this.context.state === 'suspended') void this.context.resume();

        // Brick pitch follows the row: 1 = top of the field (high), 0 = bottom.
        const pitch = Math.max(0, Math.min(1, options?.pitch ?? 0.5));
        const low = 300 + pitch * 300;   // 300–600 Hz
        const high = 500 + pitch * 700;  // 500–1200 Hz

        switch (name) {
            case 'paddle':
                // Short rising blip — the most-heard sound, kept soft.
                this.tone({ freq: 330, to: 430, seconds: 0.07, type: 'triangle', gain: 0.45 });
                break;
            case 'brickHit':
                this.tone({ freq: low, seconds: 0.05, type: 'square', gain: 0.22 });
                break;
            case 'brickBreak':
                // Percussive: a filtered noise crack plus a pitched blip.
                this.noise({ seconds: 0.08, gain: 0.35, freq: 1100 + pitch * 1500, q: 0.8 });
                this.tone({ freq: high, seconds: 0.09, type: 'square', gain: 0.22 });
                break;
            case 'wave': {
                // Fanfare: do–mi–sol–do, each note a little longer than the last.
                const notes = [523.25, 659.25, 783.99, 1046.5];
                notes.forEach((freq, i) => {
                    this.tone({
                        freq, seconds: i === notes.length - 1 ? 0.3 : 0.14,
                        type: 'triangle', gain: 0.5, delay: i * 0.09,
                    });
                });
                break;
            }
            case 'lost':
                // Falling tone — dread proportional to the drop.
                this.tone({ freq: 320, to: 90, seconds: 0.4, type: 'sine', gain: 0.5 });
                break;
            case 'saved':
                this.tone({ freq: 880, seconds: 0.1, type: 'sine', gain: 0.4 });
                this.tone({ freq: 1318.5, seconds: 0.18, type: 'sine', gain: 0.4, delay: 0.08 });
                break;
            case 'gameOver':
                // Descending phrase: sol–mi–do–sol, the last note hangs.
                [392, 330, 261.6, 196].forEach((freq, i) => {
                    this.tone({
                        freq, seconds: i === 3 ? 0.55 : 0.22,
                        type: 'triangle', gain: 0.5, delay: i * 0.14,
                    });
                });
                break;
            case 'click':
                this.tone({ freq: 1000, to: 760, seconds: 0.05, type: 'triangle', gain: 0.35 });
                break;
            case 'tick':
                this.tone({ freq: 880, seconds: 0.05, type: 'sine', gain: 0.3 });
                break;

            // ---- pickup motifs (SoundName doubles as PowerUpKind) ----
            case 'multi':
                [659.25, 830.61, 987.77].forEach((freq, i) => {
                    this.tone({ freq, seconds: 0.16, type: 'triangle', gain: 0.5, delay: i * 0.07 });
                });
                break;
            case 'wide':
                this.tone({ freq: 523.25, seconds: 0.14, type: 'triangle', gain: 0.45 });
                this.tone({ freq: 659.25, seconds: 0.2, type: 'triangle', gain: 0.45, delay: 0.09 });
                break;
            case 'slow':
                this.tone({ freq: 660, to: 440, seconds: 0.3, type: 'sine', gain: 0.4 });
                break;
            case 'fire':
                this.tone({ freq: 880, seconds: 0.1, type: 'square', gain: 0.3 });
                this.tone({ freq: 1174.7, seconds: 0.16, type: 'square', gain: 0.3, delay: 0.08 });
                break;
            case 'shield':
                this.tone({ freq: 987.77, seconds: 0.28, type: 'sine', gain: 0.4 });
                this.tone({ freq: 1975.5, seconds: 0.2, type: 'sine', gain: 0.15, delay: 0.02 });
                break;
            case 'shrink':
                // The bad one: a low, buzzy slide down.
                this.tone({ freq: 170, to: 110, seconds: 0.3, type: 'sawtooth', gain: 0.35 });
                break;
            default:
                break;
        }
    }

    // ---- synthesis primitives ----

    /** One enveloped oscillator. `to` slides the pitch over the note. */
    private tone(options: {
        freq: number;
        to?: number;
        seconds?: number;
        type?: OscillatorType;
        gain?: number;
        delay?: number;
    }): void {
        const ctx = this.context;
        const master = this.master;
        if (!ctx || !master) return;

        const start = ctx.currentTime + (options.delay ?? 0);
        const seconds = options.seconds ?? 0.1;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.type = options.type ?? 'triangle';
        osc.frequency.setValueAtTime(Math.max(1, options.freq), start);
        if (options.to !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), start + seconds);
        }

        // Fast attack, exponential decay — a pluck, never a click.
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(options.gain ?? 0.4, start + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

        osc.connect(env);
        env.connect(master);
        osc.start(start);
        osc.stop(start + seconds + 0.02);
        osc.onended = () => {
            osc.disconnect();
            env.disconnect();
        };
    }

    /** One enveloped burst of filtered white noise — bricks, impacts. */
    private noise(options: { seconds?: number; gain?: number; freq?: number; q?: number; delay?: number }): void {
        const ctx = this.context;
        const master = this.master;
        if (!ctx || !master) return;
        const buffer = this.noiseBuffer ??= this.createNoiseBuffer(ctx);

        const start = ctx.currentTime + (options.delay ?? 0);
        const seconds = options.seconds ?? 0.08;
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = options.freq ?? 1500;
        filter.Q.value = options.q ?? 1;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(options.gain ?? 0.3, start + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

        source.connect(filter);
        filter.connect(env);
        env.connect(master);
        source.start(start, Math.random() * 0.2); // random offset — no audible loop point
        source.stop(start + seconds);
        source.onended = () => {
            source.disconnect();
            filter.disconnect();
            env.disconnect();
        };
    }

    private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }
}
