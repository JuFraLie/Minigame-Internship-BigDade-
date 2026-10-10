import type { AudioPort } from '../core/ports.ts';

/**
 * Procedural sound effects built with the Web Audio API: every cue is synthesised from an
 * oscillator or white noise, so the game ships no audio files and never touches the
 * network (AGENTS.md §3.4).
 */
class SynthAudio implements AudioPort {
    private context: AudioContext | null = null;
    private available = false;

    resume(): void {
        this.ensureContext();
        if (this.context && this.context.state === 'suspended') {
            void this.context.resume();
        }
    }

    uiTap(): void {
        this.tone('sine', 520, 650, 0.2, 0.05);
    }

    whack(): void {
        this.tone('triangle', 380, 110, 0.4, 0.12);
    }

    armorCrack(): void {
        this.tone('square', 800, 500, 0.2, 0.08);
    }

    heavySmash(): void {
        this.tone('sawtooth', 260, 60, 0.45, 0.18);
    }

    slash(): void {
        // `resume`, not `ensureContext`: a WebView that was backgrounded comes back with a
        // suspended AudioContext, and a cue scheduled into a suspended context is silent.
        // Every other cue goes through `resume()`; these two used to skip it, which is how
        // the swipe and the round-over jingle could play with no sound at all while the
        // tap cues kept working.
        this.resume();
        const context = this.context;
        if (!context) return;

        const now = context.currentTime;
        const duration = 0.1;
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const noise = context.createBufferSource();
        noise.buffer = buffer;

        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + duration);
        filter.Q.value = 3;

        const gain = context.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);

        noise.start(now);
        noise.stop(now + duration);
    }

    deflect(): void {
        this.tone('sine', 600, 950, 0.2, 0.1);
    }

    escape(): void {
        this.tone('sine', 220, 90, 0.25, 0.25);
    }

    roundOver(): void {
        // See `slash`: resume the context first, or this jingle can end up scheduled into
        // a suspended AudioContext and never be heard.
        this.resume();
        const context = this.context;
        if (!context) return;

        [260, 230, 200, 160].forEach((frequency, index) => {
            if (!this.context) return;
            const start = this.context.currentTime + index * 0.15;
            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();

            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.3, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 0.2);

            oscillator.connect(gain);
            gain.connect(this.context.destination);

            oscillator.start(start);
            oscillator.stop(start + 0.2);
        });
    }

    /** Single sweeping tone: the workhorse for taps, cracks and misses. */
    private tone(
        wave: OscillatorType,
        fromHz: number,
        toHz: number,
        peakGain: number,
        durationSeconds: number,
    ): void {
        this.resume();
        const context = this.context;
        if (!context) return;

        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(fromHz, now);
        oscillator.frequency.exponentialRampToValueAtTime(toHz, now + durationSeconds);
        gain.gain.setValueAtTime(peakGain, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + durationSeconds);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(now);
        oscillator.stop(now + durationSeconds);
    }

    /** Created lazily on the first user gesture, as mobile WebViews require. */
    private ensureContext(): void {
        if (this.available) return;
        this.available = true;

        try {
            const AudioContextCtor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextCtor) return;
            this.context = new AudioContextCtor();
        } catch {
            // Audio unsupported or blocked: the game stays silent but playable.
            this.context = null;
        }
    }
}

/** The audio implementation the app wires into `RoundSession`. */
export const synthAudio: AudioPort = new SynthAudio();
