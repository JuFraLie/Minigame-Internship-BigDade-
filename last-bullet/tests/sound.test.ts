import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioEngine } from '../src/adapters/audio/AudioEngine.ts';
import type { SoundPort } from '../src/ports/SoundPort.ts';

/** Mirrors of the engine's own tuning, so the test states the contract. */
const MUSIC_VOLUME = 0.32;
const KILL_GAP = 0.07;

/** Lets the scheduler's real timer fire a few times. */
const tick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// A fake Web Audio graph: every node the engine can reach, recording what it
// was asked to do. Nothing here makes a sound - it only keeps the receipts.
// ---------------------------------------------------------------------------

class FakeParam {
  value: number;
  readonly log: { kind: string; value: number; time: number }[] = [];

  constructor(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.log.push({ kind: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.log.push({ kind: 'linear', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.log.push({ kind: 'exponential', value, time });
  }

  cancelScheduledValues(time: number): void {
    this.log.push({ kind: 'cancel', value: 0, time });
  }
}

/** `connect` returns the destination, because the engine chains through it. */
class FakeNode {
  connect<T>(destination: T): T {
    return destination;
  }
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440);
  startCalls = 0;

  start(): void {
    this.startCalls++;
  }

  stop(): void {
    /* the engine stops nodes, which is enough to count them as used */
  }
}

class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  startCalls = 0;

  start(): void {
    this.startCalls++;
  }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

class FakeBuffer {
  private readonly data: Float32Array;

  constructor(frames: number) {
    this.data = new Float32Array(frames);
  }

  getChannelData(_channel: number): Float32Array {
    return this.data;
  }
}

class FakeGainLike extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = new FakeNode();
  resumeCalls = 0;

  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly gains: FakeGainLike[] = [];

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }

  createGain(): FakeGainLike {
    const gain = new FakeGainLike();
    this.gains.push(gain);
    return gain;
  }

  createBuffer(_channels: number, frames: number): FakeBuffer {
    return new FakeBuffer(frames);
  }

  /** Oscillators and noise sources that were actually started. */
  notes(): number {
    const oscillators = this.oscillators.filter((o) => o.startCalls > 0).length;
    const sources = this.sources.filter((s) => s.startCalls > 0).length;
    return oscillators + sources;
  }
}

const asAudioContext = (fake: FakeAudioContext): AudioContext =>
  fake as unknown as AudioContext;

const build = (): { fake: FakeAudioContext; engine: AudioEngine } => {
  const fake = new FakeAudioContext();
  const engine = new AudioEngine(() => asAudioContext(fake));
  return { fake, engine };
};

// ---------------------------------------------------------------------------

describe('AudioEngine', () => {
  test('stays silent instead of throwing where there is no Web Audio', () => {
    const engine = new AudioEngine(() => {
      throw new Error('platform without Web Audio');
    });

    engine.unlock();
    engine.startMusic();
    engine.pauseMusic();
    engine.resumeMusic();
    engine.stopMusic();
    engine.shot();
    engine.pickup();
    engine.kill();
    engine.playerHit();
    engine.explosion();
    engine.levelUp();
    engine.upgrade();
    engine.wave();
    engine.gameOver();
    engine.ui();

    // Reaching the end of the list at all is the assertion: a missing audio
    // stack must degrade to silence, never to a crash.
  });

  test('unlock resumes a suspended context, and only a suspended one', () => {
    const { fake, engine } = build();

    engine.unlock();
    assert.equal(fake.resumeCalls, 1, 'the first gesture must resume the context');

    engine.unlock();
    assert.equal(fake.resumeCalls, 1, 'a running context is left alone');
  });

  test('every cue schedules a note', () => {
    const { fake, engine } = build();
    engine.unlock();

    const cues: readonly (readonly [string, (sound: SoundPort) => void])[] = [
      ['shot', (sound) => sound.shot()],
      ['pickup', (sound) => sound.pickup()],
      ['kill', (sound) => sound.kill()],
      ['playerHit', (sound) => sound.playerHit()],
      ['explosion', (sound) => sound.explosion()],
      ['levelUp', (sound) => sound.levelUp()],
      ['upgrade', (sound) => sound.upgrade()],
      ['wave', (sound) => sound.wave()],
      ['gameOver', (sound) => sound.gameOver()],
      ['ui', (sound) => sound.ui()],
    ];

    for (const [name, cue] of cues) {
      fake.currentTime += 1; // step outside every throttle window
      const before = fake.notes();
      cue(engine);
      assert.ok(fake.notes() > before, `${name} should schedule a note`);
    }
  });

  test('a horde cannot machine-gun one kill cue', () => {
    const { fake, engine } = build();
    engine.unlock();

    engine.kill();
    const first = fake.notes();

    engine.kill();
    assert.equal(fake.notes(), first, 'inside the gap the cue stays quiet');

    fake.currentTime += KILL_GAP;
    engine.kill();
    assert.ok(fake.notes() > first, 'after the gap it sounds again');
  });

  test('the loop runs, holds through a pause and starts fresh after a stop', async (t) => {
    const { fake, engine } = build();
    t.after(() => engine.stopMusic()); // the scheduler's timer must not leak

    engine.unlock();
    engine.startMusic();
    await tick(80);

    const first = fake.notes();
    assert.ok(first > 0, 'the first bar is queued');
    const musicBus = fake.gains.find((gain) =>
      gain.gain.log.some((entry) => entry.kind === 'linear' && entry.value === MUSIC_VOLUME),
    );
    assert.ok(musicBus, 'startMusic fades the music bus up to its volume');

    engine.pauseMusic();
    assert.ok(
      musicBus.gain.log.some((entry) => entry.kind === 'linear' && entry.value === 0),
      'pause fades the bus out',
    );
    const held = fake.notes();
    fake.currentTime += 1;
    await tick(60);
    assert.equal(fake.notes(), held, 'a paused loop schedules nothing');

    engine.resumeMusic();
    fake.currentTime += 1;
    await tick(60);
    assert.ok(fake.notes() > held, 'resume picks the loop back up');

    engine.stopMusic();
    const stopped = fake.notes();
    fake.currentTime += 1;
    await tick(60);
    assert.equal(fake.notes(), stopped, 'stop leaves nothing scheduled');

    engine.startMusic();
    fake.currentTime += 1;
    await tick(60);
    assert.ok(fake.notes() > stopped, 'a retry gets the loop back from the top');
  });
});
