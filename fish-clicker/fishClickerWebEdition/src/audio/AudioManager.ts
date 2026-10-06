import {
  defaultMasterVolume,
  defaultSfxVolume,
  defaultMusicVolume,
  sfxVolumeMultipliers,
  musicVolumeMultipliers,
} from '../config/AudioConfig';
import { state } from '../core/GameState';

export const sounds = {
  catch: new Audio(),
  tap: new Audio(),
  reel: new Audio(),
  frenzy: new Audio(),
  upgrade: new Audio(),
};

export const music = {
  area1: new Audio(),
  area2: new Audio(),
  area3: new Audio(),
};

// state.currentArea (0,1,2) -> music track key
const areaMusicKey: (keyof typeof music)[] = ['area1', 'area2', 'area3'];

let masterVolume = defaultMasterVolume;
let sfxVolume = defaultSfxVolume;
let musicVolume = defaultMusicVolume;
let currentAreaIndex: number | null = null;

export function loadSounds(): void {
  sounds.catch.src = 'Asset/Sound/catch.mp3';
  sounds.tap.src = 'Asset/Sound/tap.mp3';
  sounds.reel.src = 'Asset/Sound/reel.mp3';
  sounds.reel.loop = true;
  sounds.frenzy.src = 'Asset/Sound/frenzy.mp3';
  sounds.upgrade.src = 'Asset/Sound/upgrade.mp3';

  music.area1.src = 'Asset/Sound/bgm_area1.mp3';
  music.area1.loop = true;
  music.area2.src = 'Asset/Sound/bgm_area2.mp3';
  music.area2.loop = true;
  music.area3.src = 'Asset/Sound/bgm_area3.mp3';
  music.area3.loop = true;

  applyVolumes();
}

function applyVolumes(): void {
  for (const key of Object.keys(sounds) as (keyof typeof sounds)[]) {
    sounds[key].volume = clamp01(masterVolume * sfxVolume * sfxVolumeMultipliers[key]);
  }
  for (const key of Object.keys(music) as (keyof typeof music)[]) {
    music[key].volume = clamp01(masterVolume * musicVolume * musicVolumeMultipliers[key]);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// --- Volume controls (code-level only, no UI hookup) ---
export function setMasterVolume(v: number): void {
  masterVolume = clamp01(v);
  applyVolumes();
}

export function setSfxVolume(v: number): void {
  sfxVolume = clamp01(v);
  applyVolumes();
}

export function setMusicVolume(v: number): void {
  musicVolume = clamp01(v);
  applyVolumes();
}

// Clones the node so rapid taps don't cut each other off.
function playOneShot(base: HTMLAudioElement): void {
  const instance = base.cloneNode(true) as HTMLAudioElement;
  instance.volume = base.volume;
  instance.play().catch(() => {});
}

export function playCatch(): void {
  playOneShot(sounds.catch);
}

export function playTap(): void {
  playOneShot(sounds.tap);
}

export function playFrenzySound(): void {
  sounds.frenzy.currentTime = 0;
  sounds.frenzy.play().catch(() => {});
}

export function stopFrenzySound(): void {
  sounds.frenzy.pause();
  sounds.frenzy.currentTime = 0;
}

export function playSound(name: keyof typeof sounds): void {
  if (name === 'reel') {
    playReel();
    return;
  }
  if (name === 'frenzy') {
    playFrenzySound();
    return;
  }
  playOneShot(sounds[name]);
}

export function playReel(): void {
  // Keep the loop running through chained frenzy bites instead of restarting it.
  if (!sounds.reel.paused) return;
  sounds.reel.currentTime = 0;
  sounds.reel.play().catch(() => {});
}

export function stopReel(): void {
  sounds.reel.pause();
  sounds.reel.currentTime = 0;
}

export function playAreaMusic(area: number): void {
  stopBackgroundMusic();
  currentAreaIndex = area;
  if (state.frenzyActive) return;
  const key = areaMusicKey[area];
  if (key) music[key].play().catch(() => {});
}
export function pauseBackgroundMusic(): void {
  for (const key of Object.keys(music) as (keyof typeof music)[]) {
    music[key].pause();
  }
}

export function resumeBackgroundMusic(): void {
  if (currentAreaIndex === null) return;
  const key = areaMusicKey[currentAreaIndex];
  if (key) music[key].play().catch(() => {});
}

export function stopBackgroundMusic(): void {
  for (const key of Object.keys(music) as (keyof typeof music)[]) {
    music[key].pause();
    music[key].currentTime = 0;
  }
}

/**
 * Makes sure the music for `area` plays without restarting it when the right
 * track is already playing. Used when a round resets, which can leave the
 * music paused (game over during frenzy) or pointing at the wrong area.
 */
export function ensureAreaMusic(area: number): void {
  const key = areaMusicKey[area];
  if (!key) return;

  const switching = currentAreaIndex !== area;
  currentAreaIndex = area;

  if (switching) {
    for (const other of Object.keys(music) as (keyof typeof music)[]) {
      if (other !== key) {
        music[other].pause();
        music[other].currentTime = 0;
      }
    }
  }

  if (state.frenzyActive) return;
  if (switching || music[key].paused) music[key].play().catch(() => {});
}
