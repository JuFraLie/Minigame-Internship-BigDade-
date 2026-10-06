// config/gameConfig.ts — single source of truth for every tunable value.
// Pure data only: no DOM, no canvas, no logic. Safe to import from any layer.

/** Frame-loop tuning and playfield fitting. */
export const VIEWPORT = {
  MAX_DT: 0.05,
  DESIGN_H: 844,
  MAX_ASPECT: 9 / 16,
} as const;

/** Grid layout. */
export const GRID = {
  COLS: 15,
  TOP_PAD_RATIO: 0.055,
  TOP_PAD_MIN: 24,
  HUD_HEIGHT_RATIO: 0.10,
  BOTTOM_PAD_RATIO: 0.02,
} as const;

/** Snake movement and rules. */
export const SNAKE = {
  START_LENGTH: 3,
  BASE_INTERVAL: 0.20,
  MIN_INTERVAL: 0.07,
  INTERVAL_RAMP: 0.001,
} as const;

/** XP and leveling. */
export const LEVELING = {
  /** XP needed for level N = BASE + N × SCALE. */
  BASE: 3,
  SCALE: 2,
  /** XP per normal food. */
  XP_PER_FOOD: 1,
  /** XP per golden food. */
  XP_PER_GOLDEN: 3,
  /** XP per poison fruit (shrinks you but big XP). */
  XP_PER_POISON: 5,
} as const;

/** Stage progression. */
export const STAGES = {
  /** Food items to eat per stage before clearing. */
  FOOD_PER_STAGE: 10,
  /** Maximum rocks per stage. Scales: min(MAX, stage × ROCKS_PER_STAGE). */
  ROCKS_PER_STAGE: 3,
  MAX_ROCKS: 20,
  /** Walls shrink by this many cells per side per shrink-stage. */
  WALL_SHRINK: 1,
  MAX_SHRINK: 3,
  /** Speed multiplier added per fast-mode stage. */
  SPEED_STAGE_MULT: 0.12,
} as const;

/** Score rules. */
export const SCORING = {
  POINTS_PER_FOOD: 10,
  POINTS_PER_GOLDEN: 30,
  POINTS_PER_POISON: 50,
  MILESTONE_STEP: 100,
} as const;

/** Food spawning. */
export const FOOD = {
  GOLDEN_CHANCE: 0.12,
  POISON_CHANCE: 0.08,
  /** How many segments normal food adds. */
  GROW_NORMAL: 1,
  /** How many segments golden food adds. */
  GROW_GOLDEN: 2,
  /** How many segments poison food REMOVES (negative growth). */
  SHRINK_POISON: 2,
} as const;

/** Upgrade system. */
export const UPGRADES = {
  CHOICES_PER_LEVEL: 3,
  STARTING_REROLLS: 1,
  COMMON_WEIGHT: 75,
  RARE_WEIGHT: 25,
} as const;

/** Run-flow rules. */
export const RULES = {
  START_INPUT_DELAY: 0.18,
  /** Seconds of phase-tail immunity after eating. */
  PHASE_TAIL_DURATION: 3.0,
  /** Segments lost when Shed Skin triggers. */
  SHED_SKIN_SEGMENTS: 3,
  /** Magnet pull range in cells. */
  MAGNET_RANGE: 3,
  /** Combo window in seconds. */
  COMBO_WINDOW: 2.5,
  /** Max combo multiplier. */
  COMBO_MAX: 5,
  /** Slow Time speed multiplier (>1 = slower). */
  SLOW_TIME_MULT: 1.15,
  /** Dash distance in cells. */
  DASH_DISTANCE: 3,
  /** Dash cooldown in seconds. */
  DASH_COOLDOWN: 5.0,
  /** Armored scales: segments that can take a hit. */
  ARMORED_SEGMENTS: 3,
  /** Fast Feast: speed penalty. */
  FAST_FEAST_SPEED_MULT: 0.80,
  /** Fast Feast: XP bonus. */
  FAST_FEAST_XP_MULT: 1.5,
  /** Fast Feast: score bonus (the card promises "+50% XP and score"). */
  FAST_FEAST_SCORE_MULT: 1.5,
  /** Venom trail duration in ticks. */
  VENOM_TRAIL_DURATION: 8,
} as const;

/** Result-screen button geometry. */
export const UI = {
  BUTTON_W_RATIO: 0.38,
  BUTTON_H_RATIO: 0.065,
  BUTTON_Y_RATIO: 0.68,
  BUTTON_GAP_RATIO: 0.06,
  PLAY_W_RATIO: 0.52,
  PLAY_H_RATIO: 0.09,
  PLAY_Y_RATIO: 0.5,
  /** Upgrade card geometry. */
  CARD_W_RATIO: 0.80,
  CARD_H_RATIO: 0.12,
  CARD_GAP_RATIO: 0.025,
  CARD_START_Y_RATIO: 0.28,
  REROLL_W_RATIO: 0.35,
  REROLL_H_RATIO: 0.06,
  REROLL_Y_RATIO: 0.72,
} as const;

/** HUD layout tuning. */
export const HUD = {
  PAD_RATIO: 0.035,
  PAD_MIN: 10,
  FONT_RATIO: 0.048,
  HI_FONT_RATIO: 0.62,
  HI_GAP_RATIO: 0.5,
  DIGIT_CENTER_RATIO: 0.35,
  XP_BAR_HEIGHT: 6,
} as const;

/**
 * Visual theme — cyberpunk neon.
 *
 * Near-black violet chrome lit by cyan and magenta signage: the palette every
 * layer paints from, so a reskin touches this block and the screen copy only.
 * Pure data — no DOM, no canvas, no logic.
 */
export const THEME = {
  // ── World ────────────────────────────────────────────────────────────────
  /** Letterbox and canvas backdrop: unlit night city black. */
  BG_DARK: '#06040f',
  /** Arena floor: dark indigo, so the neon reads on top of it. */
  BG_GRID: '#0f0a26',
  /** Wireframe grid: faint cyan circuitry. */
  GRID_LINE: 'rgba(0, 240, 255, 0.10)',
  /** Territory a contracted wall has claimed (Firewall Lockdown). */
  DEAD_ZONE: 'rgba(3, 2, 12, 0.75)',

  SNAKE_HEAD: '#00f0ff',
  SNAKE_BODY: '#00a8e8',
  SNAKE_BODY_ALT: '#b026ff',
  SNAKE_EYES: '#ffffff',
  SNAKE_PUPIL: '#06040f',
  SNAKE_PHASE: 'rgba(0, 240, 255, 0.4)',

  FOOD_NORMAL: '#ff2bd6',
  FOOD_GLOW: 'rgba(255, 43, 214, 0.35)',
  FOOD_GOLDEN: '#fcee0a',
  FOOD_GOLDEN_GLOW: 'rgba(252, 238, 10, 0.35)',
  FOOD_POISON: '#7cff3a',
  FOOD_POISON_GLOW: 'rgba(124, 255, 58, 0.35)',

  ROCK_COLOR: '#241a3c',
  ROCK_HIGHLIGHT: '#3f2c66',
  /** Arena border signage. */
  WALL_COLOR: '#00f0ff',
  WALL_GOLDEN: '#fcee0a',
  WALL_SHRINK: '#ff2bd6',
  VENOM_COLOR: 'rgba(124, 255, 58, 0.5)',

  XP_BAR_BG: 'rgba(255,255,255,0.12)',
  XP_BAR_FILL: '#00f0ff',

  // ── Upgrade cards ────────────────────────────────────────────────────────
  CARD_BG_COMMON: '#0a1533',
  CARD_BG_RARE: '#2a0a33',
  CARD_BORDER_COMMON: '#00a8e8',
  CARD_BORDER_RARE: '#ff2bd6',
  CARD_BADGE_COMMON: 'rgba(0, 168, 232, 0.35)',
  CARD_BADGE_RARE: 'rgba(255, 43, 214, 0.35)',

  // ── Screen chrome (overlays, buttons, text) ──────────────────────────────
  OVERLAY: 'rgba(6, 4, 16, 0.92)',
  TEXT_PRIMARY: '#eaf6ff',
  TEXT_SECONDARY: '#9db2d4',
  TEXT_MUTED: '#5c6f92',
  /** Text sitting on a neon fill (dark ink on bright signage). */
  TEXT_ON_NEON: '#06040f',

  NEON_CYAN: '#00f0ff',
  NEON_MAGENTA: '#ff2bd6',
  NEON_YELLOW: '#fcee0a',
  NEON_GREEN: '#7cff3a',
  NEON_ORANGE: '#ff9a2b',

  BUTTON_BG: '#0a1533',
  BUTTON_BG_DISABLED: 'rgba(20, 16, 44, 0.4)',
  BUTTON_BORDER: '#00a8e8',
  BUTTON_BORDER_DISABLED: '#2a2450',
} as const;
