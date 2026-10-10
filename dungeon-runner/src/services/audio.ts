// audio.ts — procedural sound effects via Web Audio API (no external files).
// Implements the game's GameAudio port: it makes noise, it decides nothing.

import type { GameAudio } from '../game/game.ts';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.15): void {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch (_) {
    /* silent fail on unsupported devices */
  }
}

function playJump(): void {
  beep(300, 0.08, 'square');
  beep(500, 0.08, 'square');
}

function playSlide(): void {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ac.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.15);
  } catch (_) {
    /* silent */
  }
}

function playDeath(): void {
  beep(440, 0.12, 'sawtooth', 0.2);
  setTimeout(() => beep(330, 0.12, 'sawtooth', 0.2), 130);
  setTimeout(() => beep(220, 0.25, 'sawtooth', 0.2), 260);
}

function playMilestone(): void {
  beep(523, 0.08, 'square', 0.12);
  setTimeout(() => beep(659, 0.08, 'square', 0.12), 90);
  setTimeout(() => beep(784, 0.12, 'square', 0.12), 180);
}

function playCoin(): void {
  beep(987, 0.06, 'sine', 0.15); // B5
  setTimeout(() => beep(1318, 0.09, 'sine', 0.18), 50); // E6
}

function playHeart(): void {
  beep(523, 0.08, 'triangle', 0.18); // C5
  setTimeout(() => beep(659, 0.08, 'triangle', 0.18), 80); // E5
  setTimeout(() => beep(784, 0.08, 'triangle', 0.18), 160); // G5
  setTimeout(() => beep(1046, 0.14, 'triangle', 0.22), 240); // C6
}

function playHurt(): void {
  beep(180, 0.12, 'sawtooth', 0.25);
  setTimeout(() => beep(120, 0.15, 'sawtooth', 0.22), 60);
}

/** Adapter: exposes the sound effects through the game's audio port. */
export const audio: GameAudio = {
  jump: playJump,
  shield: playSlide,
  death: playDeath,
  milestone: playMilestone,
  coin: playCoin,
  heart: playHeart,
  hurt: playHurt,
};

