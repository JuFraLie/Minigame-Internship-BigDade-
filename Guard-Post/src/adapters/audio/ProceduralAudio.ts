import type { AudioPort, SfxName } from '../../app/ports.ts';

/**
 * All audio, synthesized in code — no files, no network, no storage.
 *
 * A fast, driving arcade chiptune plays under the round and short oscillator/noise blips
 * mark the game's events. The AudioContext is created lazily on the first user gesture (the
 * Play tap), which is what mobile WebViews require before they will make any sound.
 * Music is a look-ahead sequencer driven by the audio clock, so it keeps time even when
 * a frame is late. If the JS thread stalls (a 2x round is heavier), missed steps are
 * skipped instead of replayed in a burst; sounds are throttled so a busy wave never
 * turns into a wall of noise.
 */

const MASTER_VOLUME = 0.9;
const MUSIC_VOLUME = 0.35;
const SFX_VOLUME = 0.7;

const STEP_SECONDS = 0.1; // driving eighth notes at 150 BPM
/** Enough queue to ride out a busy frame; larger stalls are resynced, not replayed. */
const LOOKAHEAD_SECONDS = 0.2;
const TICK_MS = 25;

/**
 * Two bars of A-minor arcade energy: a pulsing square bass, a fast lead arpeggio and a
 * kick/snare/hat grid on every beat. Semitones are offsets from A4.
 */
const BASS: readonly number[] = [
    -24, -24, -24, -24, -21, -21, -21, -21,
    -19, -19, -19, -19, -17, -17, -17, -17,
];
const LEAD: readonly number[] = [
    0, 3, 7, 10, 12, 10, 7, 3,
    -2, 3, 7, 12, 15, 12, 7, 3,
];

/** Sounds that can fire many times in one frame get a minimum gap. */
const MIN_GAP: Partial<Record<SfxName, number>> = { shoot: 0.045, hit: 0.045, blocked: 0.1 };

type AudioCtor = new () => AudioContext;

function contextCtor(): AudioCtor | null {
    const scope = window as typeof window & { webkitAudioContext?: AudioCtor };
    return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function hz(semitones: number): number {
    return 440 * 2 ** (semitones / 12);
}

function noiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

function tone(
    context: AudioContext,
    destination: AudioNode,
    frequency: number,
    at: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    endFrequency = frequency,
): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency !== frequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), at + duration);
    }
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
}

function noise(context: AudioContext, destination: AudioNode, buffer: AudioBuffer, at: number, duration: number, peak: number): void {
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    envelope.gain.setValueAtTime(peak, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(envelope).connect(destination);
    source.start(at);
    source.stop(at + duration);
}

function arpeggio(
    context: AudioContext,
    destination: AudioNode,
    notes: readonly number[],
    at: number,
    gap: number,
    type: OscillatorType,
    peak: number,
): void {
    notes.forEach((note, index) => tone(context, destination, hz(note), at + index * gap, gap * 1.4, type, peak));
}

/**
 * Repairs the sequencer clock after a late timer callback.
 *
 * Web Audio treats a start time in the past as "now". Without this, a stalled JS thread
 * dumps every missed note at once and the music turns into a harsh cluster. Instead we
 * advance by whole steps to land back in the future and carry the pattern phase forward,
 * so the groove continues cleanly at a steady tempo — including in 2x gameplay.
 */
export function resyncSequencer(
    nextNoteAt: number,
    audioTime: number,
    step: number,
    period: number,
    patternLength: number,
): { readonly nextNoteAt: number; readonly step: number } {
    if (nextNoteAt >= audioTime) return { nextNoteAt, step };
    const missed = Math.ceil((audioTime - nextNoteAt) / period);
    return {
        nextNoteAt: nextNoteAt + missed * period,
        step: (step + missed) % patternLength,
    };
}

export function createProceduralAudio(): AudioPort {
    let context: AudioContext | null = null;
    let master!: GainNode;
    let music!: GainNode;
    let effects!: GainNode;
    let noiseSample!: AudioBuffer;
    let timer: number | null = null;
    let nextNoteAt = 0;
    let step = 0;
    const lastPlayed = new Map<SfxName, number>();

    /** Creates the context on the first tap and resumes it if the OS suspended it. */
    function ensureContext(): AudioContext | null {
        if (context) {
            if (context.state === 'suspended') void context.resume();
            return context;
        }
        const Ctor = contextCtor();
        if (!Ctor) return null;
        try {
            context = new Ctor();
        } catch {
            return null;
        }
        master = context.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(context.destination);
        music = context.createGain();
        music.gain.value = MUSIC_VOLUME;
        music.connect(master);
        effects = context.createGain();
        effects.gain.value = SFX_VOLUME;
        effects.connect(master);
        noiseSample = noiseBuffer(context);
        return context;
    }

    /** Schedules the next couple of notes from the audio clock, never from frame time. */
    function schedule(audio: AudioContext): void {
        const synced = resyncSequencer(nextNoteAt, audio.currentTime, step, STEP_SECONDS, LEAD.length);
        nextNoteAt = synced.nextNoteAt;
        step = synced.step;

        while (nextNoteAt < audio.currentTime + LOOKAHEAD_SECONDS) {
            const beat = step % 4;

            // Kick on beats 1 and 3, snare on 2 and 4, hat on every eighth note.
            if (beat === 0 || beat === 2) {
                tone(audio, music, 130, nextNoteAt, 0.09, 'sine', 0.45, 45);
            } else {
                noise(audio, music, noiseSample, nextNoteAt, 0.07, 0.18);
            }
            noise(audio, music, noiseSample, nextNoteAt, 0.02, 0.06);

            tone(audio, music, hz(BASS[step % BASS.length]), nextNoteAt, STEP_SECONDS * 0.8, 'square', 0.28);
            const lead = LEAD[step % LEAD.length];
            tone(audio, music, hz(lead), nextNoteAt, STEP_SECONDS * 0.75, 'square', 0.14);
            if (step % 2 === 0) {
                tone(audio, music, hz(lead - 12), nextNoteAt, STEP_SECONDS * 0.6, 'square', 0.06);
            }

            nextNoteAt += STEP_SECONDS;
            step = (step + 1) % LEAD.length;
        }
    }

    return {
        startMusic(): void {
            const audio = ensureContext();
            if (!audio || timer !== null) return;
            music.gain.value = MUSIC_VOLUME;
            step = 0;
            nextNoteAt = audio.currentTime + 0.05;
            timer = window.setInterval(() => schedule(audio), TICK_MS);
            schedule(audio);
        },

        stopMusic(): void {
            if (timer !== null) clearInterval(timer);
            timer = null;
            // Already-scheduled notes stay queued for at most the look-ahead window, so
            // muting the bus is enough to silence the loop immediately.
            if (context) music.gain.value = 0;
        },

        play(name: SfxName): void {
            const audio = ensureContext();
            if (!audio) return;
            const now = audio.currentTime;
            const gap = MIN_GAP[name] ?? 0;
            if (now - (lastPlayed.get(name) ?? -Infinity) < gap) return;
            lastPlayed.set(name, now);

            switch (name) {
                case 'start':
                    arpeggio(audio, effects, [0, 4, 7, 12], now, 0.06, 'triangle', 0.35);
                    break;
                case 'build':
                    arpeggio(audio, effects, [-5, 0, 4], now, 0.05, 'square', 0.25);
                    break;
                case 'upgrade':
                    arpeggio(audio, effects, [0, 4, 7, 12], now, 0.05, 'square', 0.28);
                    break;
                case 'sell':
                    arpeggio(audio, effects, [4, 0, -5], now, 0.05, 'triangle', 0.25);
                    break;
                case 'shoot':
                    tone(audio, effects, 700, now, 0.05, 'square', 0.12, 350);
                    break;
                case 'hit':
                    noise(audio, effects, noiseSample, now, 0.04, 0.12);
                    break;
                case 'kill':
                    arpeggio(audio, effects, [7, 12, 19], now, 0.04, 'square', 0.22);
                    break;
                case 'leak':
                    tone(audio, effects, 220, now, 0.22, 'sawtooth', 0.3, 70);
                    break;
                case 'wave':
                    arpeggio(audio, effects, [-5, 0, 7], now, 0.09, 'square', 0.3);
                    break;
                case 'waveClear':
                    arpeggio(audio, effects, [0, 4, 7, 12], now, 0.07, 'triangle', 0.3);
                    break;
                case 'levelClear':
                    arpeggio(audio, effects, [0, 4, 7, 12, 16, 19], now, 0.08, 'square', 0.3);
                    break;
                case 'defeat':
                    arpeggio(audio, effects, [0, -3, -7, -12], now, 0.12, 'sawtooth', 0.28);
                    break;
                case 'blocked':
                    tone(audio, effects, 140, now, 0.09, 'square', 0.18, 110);
                    break;
                case 'speed':
                    tone(audio, effects, 880, now, 0.06, 'square', 0.16, 1320);
                    break;
            }
        },
    };
}
