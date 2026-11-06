import type { MusicTrack, SoundName, SoundPort } from '../domain/ports.ts';

/**
 * The game's sound, built out of oscillators.
 *
 * Nothing here is sampled: a pad is four detuned triangles under a lowpass, a kick is a
 * sine falling from 130 Hz to 44, a shaker is white noise through a highpass, and every
 * one-shot is an envelope on a voice. That is what lets the whole soundtrack live in one
 * file with no fetch, no licence and no audio asset for a static host to 404 on.
 *
 * The loop is scheduled with the usual look-ahead trick — a short interval walks a clock
 * and hands each bar to the Web Audio thread a fraction of a second before it is due —
 * because a `setTimeout` loop drifts audibly over a three-minute session while
 * `AudioContext.currentTime` does not.
 *
 * The whole thing is defensive on purpose: a browser that refuses to hand out an
 * `AudioContext` gets silence rather than an exception, and every node is created only
 * once the graph exists.
 */

/** 72 BPM. Slow enough to nod to, fast enough that a round does not feel like waiting. */
const TEMPO = 72;
const BEATS_PER_BAR = 4;
const BAR_SECONDS = (60 / TEMPO) * BEATS_PER_BAR;
const BEAT_SECONDS = 60 / TEMPO;
/** How often the scheduler wakes up, and how far ahead it writes. */
const TICK_MS = 25;
const LOOKAHEAD_SECONDS = 0.15;

const MASTER_LEVEL = 0.8;
const MUSIC_LEVEL = 0.5;
const SFX_LEVEL = 1;
const FADE_SECONDS = 0.6;

interface Chord {
    /** MIDI note numbers for the sustained voices, voiced low and close. */
    readonly pad: readonly number[];
    /** MIDI note number for the bass, an octave or two under the pad. */
    readonly bass: number;
}

/**
 * Cmaj7 → Em7 → Am7 → Fmaj7: I–iii–vi–IV.
 *
 * Warm, unresolved at every seam, and back to the tonic without a cadence anyone would
 * call an ending — which is the whole requirement for a loop that has to survive being
 * heard forty times in one sitting.
 */
const PROGRESSION: readonly Chord[] = [
    { pad: [48, 52, 55, 59], bass: 36 },
    { pad: [52, 55, 59, 62], bass: 40 },
    { pad: [45, 52, 55, 60], bass: 33 },
    { pad: [41, 48, 53, 57], bass: 41 },
];

/** Which chord tone each eighth of the bar plays — up, up, up, then a lazy way back down. */
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];

/** C major pentatonic offsets, so a rising streak climbs without ever sounding sour. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Clamps into the ladder, so a streak of twelve still lands on a note that exists. */
const climbTo = (step: number): number =>
    PENTATONIC[Math.min(Math.max(Math.trunc(step) - 1, 0), PENTATONIC.length - 1)];

export function createLoFiSound(): SoundPort {
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    let musicBus: GainNode | null = null;
    let sfxBus: GainNode | null = null;
    let noise: AudioBuffer | null = null;

    let muted = false;
    let requested: MusicTrack | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let nextBarAt = 0;
    let bar = 0;

    // ---- graph ------------------------------------------------------------

    /** Two seconds of white noise, made once and replayed from a random offset each hit. */
    const makeNoise = (ctx: AudioContext): AudioBuffer => {
        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
        return buffer;
    };

    /**
     * Builds the device and the graph around it, exactly once.
     *
     * Returns false rather than throwing: a browser with audio disabled should leave the
     * game playable, just quiet. It says so when that happens, because silence with no
     * explanation is indistinguishable from a bug.
     */
    const build = (): boolean => {
        if (context) return true;
        try {
            const Browser =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Browser) {
                console.warn('sound: this browser exposes no AudioContext, so the game runs silent');
                return false;
            }

            const ctx = new Browser();

            // A gentle limiter on the way out: six voices and a kick can stack, and a
            // clipped chord is the opposite of chill.
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = -16;
            limiter.knee.value = 24;
            limiter.ratio.value = 3;
            limiter.attack.value = 0.01;
            limiter.release.value = 0.25;
            limiter.connect(ctx.destination);

            const masterNode = ctx.createGain();
            masterNode.gain.value = muted ? 0.0001 : MASTER_LEVEL;
            masterNode.connect(limiter);

            const musicNode = ctx.createGain();
            musicNode.gain.value = MUSIC_LEVEL;
            musicNode.connect(masterNode);

            const sfxNode = ctx.createGain();
            sfxNode.gain.value = SFX_LEVEL;
            sfxNode.connect(masterNode);

            context = ctx;
            master = masterNode;
            musicBus = musicNode;
            sfxBus = sfxNode;
            noise = makeNoise(ctx);
            return true;
        } catch {
            context = null;
            console.warn('sound: the audio device could not be opened, so the game runs silent');
            return false;
        }
    };

    /**
     * Starts the device if it is waiting on a gesture.
     *
     * A refusal is reported rather than swallowed: autoplay policy is the one failure
     * that produces a perfectly healthy-looking game with no sound at all, and it is
     * otherwise invisible from the outside.
     */
    const resume = (): void => {
        const ctx = context;
        if (!ctx || ctx.state !== 'suspended') return;
        void ctx.resume().catch(() => console.warn('sound: the browser refused to start the audio device'));
    };

    // ---- voices -----------------------------------------------------------

    interface ToneOptions {
        readonly type?: OscillatorType;
        /** Seconds of attack. Kept above zero: a ramp with no width has nothing to ramp. */
        readonly attack?: number;
        readonly lowpass?: number;
        readonly detune?: number;
        /** Sweeps the frequency to this value over `bendSeconds` — the kick's thump. */
        readonly bendTo?: number;
        readonly bendSeconds?: number;
        readonly bus?: GainNode;
    }

    /** One voice: an oscillator with a linear attack and an exponential tail. */
    const tone = (at: number, hz: number, seconds: number, level: number, options: ToneOptions = {}): void => {
        const ctx = context;
        const bus = options.bus ?? sfxBus;
        if (!ctx || !bus) return;

        const attack = Math.max(0.004, options.attack ?? 0.006);
        const end = at + Math.max(seconds, attack + 0.02);

        const osc = ctx.createOscillator();
        osc.type = options.type ?? 'sine';
        osc.frequency.setValueAtTime(hz, at);
        if (options.detune) osc.detune.value = options.detune;
        if (options.bendTo !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(options.bendTo, at + (options.bendSeconds ?? seconds));
        }

        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(level, at + attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);

        if (options.lowpass) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = options.lowpass;
            osc.connect(filter);
            filter.connect(envelope);
        } else {
            osc.connect(envelope);
        }
        envelope.connect(bus);

        osc.start(at);
        osc.stop(end + 0.05);
    };

    interface HissOptions {
        readonly type?: BiquadFilterType;
        readonly hz: number;
        readonly q?: number;
        readonly bus?: GainNode;
    }

    /** A burst of noise — shaker, tick, or the body under a wooden knock. */
    const hiss = (at: number, seconds: number, level: number, options: HissOptions): void => {
        const ctx = context;
        const bus = options.bus ?? sfxBus;
        if (!ctx || !bus || !noise) return;

        const source = ctx.createBufferSource();
        source.buffer = noise;

        const filter = ctx.createBiquadFilter();
        filter.type = options.type ?? 'highpass';
        filter.frequency.value = options.hz;
        filter.Q.value = options.q ?? 0.8;

        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(level, at + 0.005);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(seconds, 0.03));

        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(bus);

        // A different window of the buffer every time, so repeated hits are never
        // bit-identical and the shaker does not machine-gun.
        source.start(at, Math.random() * 1.4);
        source.stop(at + seconds + 0.05);
    };

    /** Sine falling fast from 130 Hz: soft on the ear, still felt in the chest. */
    const kick = (at: number, bus: GainNode): void => {
        tone(at, 130, 0.26, 0.3, { type: 'sine', bendTo: 44, bendSeconds: 0.12, lowpass: 500, bus });
    };

    // ---- music ------------------------------------------------------------

    const scheduleBar = (index: number, at: number): void => {
        const bus = musicBus;
        if (!context || !bus) return;

        const chord = PROGRESSION[index % PROGRESSION.length];

        // Pad: every tone swells in together and decays across the whole bar, so one
        // chord melts into the next instead of being cut off at the seam.
        chord.pad.forEach((note, voice) => {
            tone(at, midiToHz(note), BAR_SECONDS * 0.98, 0.045, {
                type: 'triangle',
                attack: 0.55,
                // A few cents apart: the beating between them is what stops four
                // triangles from sounding like a test tone.
                detune: voice % 2 === 0 ? -4 : 5,
                lowpass: 950,
                bus,
            });
        });

        // Bass: the root on the downbeat, then a lighter octave answering on the "and" of 3.
        tone(at, midiToHz(chord.bass), BEAT_SECONDS * 1.7, 0.16, {
            type: 'sine',
            attack: 0.02,
            lowpass: 420,
            bus,
        });
        tone(at + BEAT_SECONDS * 2.5, midiToHz(chord.bass + 12), BEAT_SECONDS * 0.7, 0.07, {
            type: 'sine',
            attack: 0.02,
            lowpass: 520,
            bus,
        });

        // Rhodes-ish eighths through a lowpass — the muffle is the lo-fi part.
        for (let eighth = 0; eighth < 8; eighth++) {
            const note = chord.pad[ARP_PATTERN[eighth] % chord.pad.length] + 12;
            const accent = eighth % 2 === 0;
            const hz = midiToHz(note);
            tone(at + eighth * (BEAT_SECONDS / 2), hz, BEAT_SECONDS * 0.7, accent ? 0.05 : 0.032, {
                type: 'triangle',
                attack: 0.008,
                lowpass: 2400,
                bus,
            });
            // The bell partial only on the accents, so the pattern has a top to it.
            if (accent) {
                tone(at + eighth * (BEAT_SECONDS / 2), hz * 2, BEAT_SECONDS * 0.3, 0.014, {
                    type: 'sine',
                    attack: 0.006,
                    lowpass: 4000,
                    bus,
                });
            }
        }

        // Drums: kick on 1 and 3, shaker on every eighth with the offbeats pulled back.
        kick(at, bus);
        kick(at + BEAT_SECONDS * 2, bus);
        for (let eighth = 0; eighth < 8; eighth++) {
            hiss(at + eighth * (BEAT_SECONDS / 2), 0.05, eighth % 2 === 0 ? 0.05 : 0.028, {
                type: 'highpass',
                hz: 6500,
                bus,
            });
        }
    };

    const pump = (): void => {
        const ctx = context;
        if (!ctx) return;
        while (nextBarAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
            scheduleBar(bar, Math.max(nextBarAt, ctx.currentTime + 0.02));
            nextBarAt += BAR_SECONDS;
            bar += 1;
        }
    };

    const startMusic = (): void => {
        const ctx = context;
        const bus = musicBus;
        if (!ctx || !bus || requested === null || muted || timer !== undefined) return;

        // Returning from a fade: bring the bus back up as the loop restarts.
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + FADE_SECONDS);

        nextBarAt = ctx.currentTime + 0.05;
        bar = 0;
        pump();
        timer = setInterval(pump, TICK_MS);
    };

    const stopMusic = (): void => {
        if (timer === undefined) return;
        clearInterval(timer);
        timer = undefined;

        // Bars already written into the clock keep playing, so the bus has to fade —
        // otherwise the pad would carry on for another three seconds after the ask.
        const ctx = context;
        const bus = musicBus;
        if (!ctx || !bus) return;
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_SECONDS);
    };

    // ---- one-shots --------------------------------------------------------

    const playSfx = (name: SoundName, step: number): void => {
        const bus = sfxBus;
        if (!context || !bus) return;
        const at = context.currentTime + 0.01;

        switch (name) {
            case 'tap':
                hiss(at, 0.05, 0.09, { type: 'highpass', hz: 2600, bus });
                tone(at, 520, 0.08, 0.07, { type: 'sine', lowpass: 3000, bus });
                break;

            case 'select':
                tone(at, 784, 0.17, 0.1, { type: 'triangle', lowpass: 3200, bus });
                break;

            case 'place': {
                const hz = midiToHz(72 + climbTo(step));
                tone(at, hz, 0.42, 0.16, { type: 'sine', lowpass: 4000, bus });
                // The wooden knock a marimba makes on the fourth partial, short and quiet.
                tone(at, hz * 4, 0.1, 0.035, { type: 'sine', bus });
                // Weight under it, so a placement lands rather than twinkles.
                tone(at, 92, 0.14, 0.06, { type: 'sine', lowpass: 300, bus });
                break;
            }

            case 'mistake':
                // A muted bonk with the pitch slipping downward — a shrug, not a buzzer.
                tone(at, 196, 0.24, 0.13, {
                    type: 'triangle',
                    lowpass: 900,
                    bendTo: 148,
                    bendSeconds: 0.2,
                    bus,
                });
                hiss(at, 0.06, 0.05, { type: 'lowpass', hz: 900, bus });
                break;

            case 'lines': {
                const count = Math.min(Math.max(Math.trunc(step), 1), 4);
                [72, 76, 79, 84]
                    .slice(0, count)
                    .forEach((note, index) =>
                        tone(at + index * 0.09, midiToHz(note), 0.4, 0.12, { type: 'sine', lowpass: 4200, bus }),
                    );
                break;
            }

            case 'win':
                // Cmaj7 walked upward, then the chord itself settling underneath it.
                [72, 76, 79, 83, 84].forEach((note, index) =>
                    tone(at + index * 0.11, midiToHz(note), 0.7, 0.13, { type: 'sine', lowpass: 4500, bus }),
                );
                for (const note of [60, 64, 67, 71]) {
                    tone(at + 0.45, midiToHz(note), 1.7, 0.05, {
                        type: 'triangle',
                        attack: 0.4,
                        lowpass: 1200,
                        bus,
                    });
                }
                break;

            case 'lose':
                // A fall rather than a crash: the same register as the win, going down.
                [69, 65, 62, 57].forEach((note, index) =>
                    tone(at + index * 0.14, midiToHz(note), 0.6, 0.11, { type: 'sine', lowpass: 2600, bus }),
                );
                break;

            case 'levelUp':
                [72, 76, 79, 84].forEach((note, index) =>
                    tone(at + index * 0.085, midiToHz(note), 0.5, 0.13, { type: 'triangle', lowpass: 4000, bus }),
                );
                break;
        }
    };

    // ---- the port ---------------------------------------------------------

    return {
        unlock(): void {
            if (!build()) return;
            if (muted || !context) return;
            resume();
            startMusic();
        },

        play(name: SoundName, step = 1): void {
            if (muted) return;
            // Every one-shot is triggered by a tap, so building here is still inside a
            // gesture — which means the window-level unlock can never be the only chance.
            if (!build()) return;
            resume();
            playSfx(name, step);
        },

        music(track: MusicTrack | null): void {
            if (track === requested) return;
            requested = track;
            if (track === null) {
                stopMusic();
                return;
            }
            startMusic();
        },

        get muted(): boolean {
            return muted;
        },

        toggleMute(): boolean {
            muted = !muted;
            build();

            const ctx = context;
            const bus = master;
            if (!ctx || !bus) return muted;

            const now = ctx.currentTime;
            bus.gain.cancelScheduledValues(now);
            bus.gain.setValueAtTime(bus.gain.value, now);

            if (muted) {
                bus.gain.linearRampToValueAtTime(0.0001, now + 0.08);
                // Suspend a moment later rather than now: the ramp has to be allowed to
                // run, and a quick second tap must not race it into silence forever.
                window.setTimeout(() => {
                    if (muted && context?.state === 'running') void context.suspend();
                }, 160);
            } else {
                resume();
                bus.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 0.12);
                startMusic();
            }
            return muted;
        },
    };
}
