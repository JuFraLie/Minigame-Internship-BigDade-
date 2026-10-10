// gameConfig.ts — single source of truth for every tunable value.
// Pure data only: no DOM, no canvas, no logic. Safe to import from any layer.

/** Frame-time rules. No aspect ratio lives here: the game is edge-to-edge
 *  and adapts to ANY vertical screen height (§3.1). */
export const VIEWPORT = {
  MAX_DT: 0.05, // clamp so a backgrounded tab doesn't teleport everything
} as const;

/** Vertical/horizontal anchors inside the playfield (fractions of its size). */
export const LAYOUT = {
  FLOOR_RATIO: 0.75,        // ground line at 75% height
  CEIL_RATIO: 0.10,         // spawn ceiling at 10% height
  KNIGHT_X_RATIO: 0.06,     // knight stands near the left edge (like the dino)
  TITLE_SCROLL_SPEED: 160,  // px/s background drift on the title screen
  TOP_PAD_RATIO: 0.055,     // UI top padding: % of height reserved for the cutout
  TOP_PAD_MIN: 24,          // …but never less than this many CSS px
} as const;

/** Knight sprite geometry — every ratio is relative to a single 96×84 frame. */
export const KNIGHT = {
  FRAME_W: 96,
  FRAME_H: 84,
  HEIGHT_RATIO: 0.22,        // display height = playfield height × this
  FEET_RATIO: 60 / 84,       // feet sit 60px down inside the 84px frame
  CHAR_MIN_X_RATIO: 30 / 96, // visible body inside the frame: X 30..57
  CHAR_WIDTH_RATIO: 28 / 96,
  CHAR_MIN_Y_RATIO: 26 / 84, // ...and Y 26..60
  CHAR_HEIGHT_RATIO: 34 / 84,
  HITBOX_INSET_X: 0.15,      // forgiving hitbox (fraction of the body box)
  HITBOX_INSET_Y: 0.12,
  WHITE_STRIP_THRESHOLD: 235, // white sprite backgrounds → transparent
  FRAMES: { running: 8, jumping: 5, shielding: 6 } as const,
  FRAME_DURATION: { running: 0.08, jumping: 0.1, shielding: 0.1 } as const,
  SHEETS: {
    running: 'knight_run.png',
    jumping: 'knight_jump.png',
    shielding: 'knight_shield.png',
  } as const,
} as const;

/** Knight movement rules. */
export const PHYSICS = {
  GRAVITY: 2200,
  JUMP_VELOCITY: -840,
  // The shield lasts EXACTLY as long as one run of the knight_shield
  // animation (6 frames × 0.1s = 0.6s) — the block goes up for the length of
  // the raise you see on screen, and no longer. It is derived from KNIGHT so
  // re-timing the sprite re-times the shield automatically. The wall sweeps
  // past in ~0.33s at base speed, so a raise started just before impact holds;
  // a raise held too early expires (see tests/arrow.test.ts). Spikes ignore
  // the shield entirely.
  SHIELD_DURATION: KNIGHT.FRAMES.shielding * KNIGHT.FRAME_DURATION.shielding,
} as const;

/** Score & scroll-speed progression (dino-run style: slow start, ramps up). */
export const SCORING = {
  POINTS_PER_SECOND: 20,
  MILESTONE_STEP: 100, // chime every 100 points
  BASE_SPEED: 220,     // px/s at score 0 (220 original)
  SPEED_RAMP: 0.35,    // px/s gained per point
  MAX_SPEED: 750,
} as const;

/** Obstacle geometry and hitbox tuning — WHAT a trap is, never when it comes. */
export const OBSTACLES = {
  GRACE_PERIOD: 4.0,   // seconds before the first obstacle appears
  CULL_MARGIN: 120,    // px past the left edge before an obstacle is removed

  // Spike clusters (floor hazards — jump over them)
  SPIKE_W: 18,
  SPIKE_OVERLAP: 4,
  SPIKE_H_BASE: 28,
  SPIKE_HITBOX_INSET_X: 0.3, // only the sharp tip counts
  SPIKE_HITBOX_INSET_Y: 0.42,

  // Flyers / bats (airborne — shield them)
  LOW_BAT_CHANCE: 0.55, // variant roll: low (shield) vs high (run under)
  LOW_BAT_OFFSET: 55,  // knee/hip height → shield needed
  HIGH_BAT_OFFSET: 110, // well above → run under
  BAT_CENTER_DX: 18, // bat body centre relative to the obstacle origin
  BAT_CENTER_DY: 10,
  BAT_HITBOX_RADIUS: 7, // forgiving: wings are safe to clip through
  WING_FLAP_SPEED: 8,

  // Arrow stacks — the arrows of one spawn sit on top of each other at a
  // single X, from shin height upwards, so the wall is too tall to jump over:
  // the knight rises at most JUMP_VELOCITY² / (2 × GRAVITY) ≈ 160px from the
  // floor, plus the few px his hitbox already clears it when grounded → ~169px.
  // The top of this stack ends at ARROW_Y_OFFSET + (COUNT-1) × SPACING ≈ 206px,
  // and the SPACING gaps are far narrower than the knight's ~57px hitbox, so
  // he can neither sail over the wall nor slip between two arrows. The shield
  // is the only answer (see tests/arrow.test.ts). WHEN an arrow stack comes is
  // decided by the PACING timeline, not by this geometry block.
  //
  // ARROW_Y_OFFSET is deliberately this low: the knight is SIZED FROM THE
  // SCREEN HEIGHT (KNIGHT.HEIGHT_RATIO), so his head stands only ~37px above
  // the floor on a 480px-tall screen and ~65px on an 844px one. The lowest
  // arrow must sit inside that band on EVERY height, or a running knight walks
  // straight under the wall — which is exactly what used to happen at 64px.
  // The stack keeps its reach by carrying five arrows instead of four.
  ARROW_COUNT: 5, // arrows in one stack (its height, in arrows)
  ARROW_Y_OFFSET: 30, // floor → top edge of the LOWEST arrow (shin height)
  ARROW_STACK_SPACING: 44, // vertical distance between two stacked arrows
  ARROW_W: 34, // visual length …
  ARROW_H: 14, // … and height (the art is slightly bigger than the hitbox)
  ARROW_HIT_W: 28, // forgiving hitbox: 3px inset at each end …
  ARROW_HIT_H: 10, // … and 2px top/bottom

  // Danger telegraph: a marker at the right edge, in the lane the trap will
  // occupy, shown while the trap is still off screen. Obstacles SPAWN at
  // exactly this distance (see obstacles.ts), so the marker is visible for
  // the full lead before the trap even enters the playfield.
  DANGER_LEAD_SECONDS: 0.6, // time-based (× current speed) → same reaction window everywhere
  DANGER_MARGIN: 28, // marker inset from the right edge (logical px)
} as const;

/**
 * The pacing timeline — this game's difficulty scaling loop.
 *
 * Simplified Subway Surfers model: difficulty is a pure function of the SCORE
 * (score ≈ distance travelled — it grows 20 points per second of running), and
 * NEVER of how the player is performing. No failure counting, no smoothing, no
 * memory: the same score always meets the same phase, the same rhythm and the
 * same menu, so pacing is deterministic, tunable and unit-testable.
 *
 * Every phase owns exactly four things:
 *  - `intervalMin/Max` … seconds between two spawns — the difficulty ramp;
 *  - `burst` / `rest`  … THE LOOP: `burst` spawns land back to back, then the
 *                        timeline breathes for `rest` seconds before the next
 *                        burst starts (tension → recovery → tension …);
 *  - `traps`           … the weighted menu for this phase (an entry repeated
 *                        twice weighs double). A trap missing from the menu
 *                        has NOT unlocked yet — no separate unlock scores;
 *  - `spikes`          … weighted cluster sizes, plus `spikeHVar` for heights.
 *
 * Randomness never decides WHEN or HOW HARD — only WHICH member of the menu
 * comes next (see src/game/pacing.ts).
 */
export const PACING = {
  PHASES: [
    // 1. Learn the two verbs: jump the floor, nothing else.
    {
      name: 'warm-up',
      fromScore: 0,
      intervalMin: 2.2,
      intervalMax: 3.4,
      burst: 2,
      rest: 1.6,
      traps: ['spike_cluster'],
      spikes: [1, 1, 1, 2, 2], // 60% single, 40% double
      spikeHVar: 8,
    },
    // 2. The shield enters the game — the wall cannot be jumped, only blocked.
    {
      name: 'contact',
      fromScore: 100, // ≈5s in — arrows unlock here
      intervalMin: 2.0,
      intervalMax: 3.1,
      burst: 3,
      rest: 1.5,
      traps: ['spike_cluster', 'spike_cluster', 'arrow'], // 67% spike, 33% arrow
      spikes: [1, 1, 1, 2, 2],
      spikeHVar: 12,
    },
    // 3. The third trap: the bat (low → shield, high → run under).
    {
      name: 'crossfire',
      fromScore: 200, // ≈10s in — flyers unlock here
      intervalMin: 1.8,
      intervalMax: 2.9,
      burst: 3,
      rest: 1.3,
      traps: ['spike_cluster', 'spike_cluster', 'arrow', 'flyer'], // 50/25/25
      spikes: [1, 1, 2, 2, 3], // 40% one, 40% two, 20% three
      spikeHVar: 16,
    },
    // 4. Full arsenal, wider clusters, the rhythm tightens.
    {
      name: 'pressure',
      fromScore: 500, // ≈25s in
      intervalMin: 1.4,
      intervalMax: 2.4,
      burst: 4,
      rest: 1.1,
      traps: ['spike_cluster', 'spike_cluster', 'arrow', 'arrow', 'flyer'], // 40/40/20
      spikes: [1, 1, 2, 2, 2, 3, 3, 4],
      spikeHVar: 22,
    },
    // 5. The flow state: fastest gaps, longest bursts, one short recovery.
    {
      name: 'flow',
      fromScore: 1000, // ≈50s in — and forever after: the loop tops out here
      intervalMin: 1.1,
      intervalMax: 2.0,
      burst: 5,
      rest: 1.0,
      traps: ['spike_cluster', 'spike_cluster', 'arrow', 'arrow', 'flyer'],
      spikes: [1, 1, 2, 2, 2, 3, 3, 4],
      spikeHVar: 26,
    },
  ],
} as const;

/** Run-flow rules owned by the controller (not movement, not spawning). */
export const RULES = {
  // The tap that confirmed Play/Retry must not also become a jump.
  START_INPUT_DELAY: 0.18,
} as const;

/**
 * The chaser — this game's "Subway Surfers guard": a big demon that runs just
 * behind the knight for fun. Pure decoration: it never touches collisions,
 * scoring or input, so it can look menacing without ever hurting the player.
 */
export const BOSS = {
  HEIGHT_RATIO: 0.65, // frame-box height = 65% of the corridor height
  WIDTH_RATIO: 0.55, // nominal drawn width as a fraction of that height
  FRAMES: 12,
  FRAME_DURATION: 0.07, // seconds per frame at the reference scroll speed
  SHEET: 'boss_walk.png',

  // Chase tuning — the gap is measured BACKWARDS from the knight's visible
  // heel: `rightEdge = heelX - gap`. Negative gaps tuck him behind the knight.
  GAP_NEAR: -30, // closest: his blade reaches the knight's heels
  GAP_FAR: 40, // furthest: only his front stays on screen
  PATROL_AMP_SLOW: 26, // organic bobbing: slow wave amplitude (px) …
  PATROL_PERIOD_SLOW: 7.3, // … and its period (s)
  PATROL_AMP_FAST: 12, // fast wave amplitude (px) …
  PATROL_PERIOD_FAST: 4.1, // … and its period (s)
  LUNGE_DURATION: 1.0, // milestone surge: seconds held at the near gap
  LERP_RATE: 3.0, // gap smoothing while playing (1/s)
  CATCH_LERP_RATE: 1.6, // slower creep once the run has ended
  ANIM_REFERENCE_SPEED: 220, // scroll speed the walk cycle is tuned for
} as const;

/**
 * Health rules: a fixed 3 HP. A hit costs one heart, and the only way to get
 * one back is the heart pickup (see PICKUPS) — nothing else heals the knight.
 */
export const HEALTH = {
  START_HEARTS: 3,
  MAX_HEARTS: 3,
  HURT_INVULNERABILITY_DURATION: 1.2, // seconds of i-frames after taking obstacle damage
} as const;

/**
 * Pickups — the coins scattered along the run and the floating hearts.
 *
 * A coin pays `COIN_POINTS` of bonus score and counts towards the next heart:
 * every `HEART_BASE_COIN_THRESHOLD` coins a heart is offered, but ONLY while a
 * heart is missing, so a full row never wastes one and a wounded knight soon
 * finds his next heart (the milestone simply waits for the first hit).
 *
 * The pickup clock is deliberately separate from the PACING timeline: pickups
 * may never change how hard the run is, only what it pays.
 *
 * WHERE a pattern lands is a different question: it belongs to the trap the
 * knight meets next. The coins are laid out in the lane that CLEARS that trap
 * — an arc over the spikes, a shield-lane line through the arrow wall, coins
 * on the floor under a high bat — so following them is always the right
 * counter (PickupSpawner.spawnTrapPattern, tests/coinTraps.test.ts). That is
 * placement only: the clock, the pattern sizes and the payout stay as above.
 *
 * Coins are SCARCE and SPARSE: a short pattern (2–3 coins, one jump apart)
 * only every 10–16 seconds, and the collect box is deliberately bigger than
 * the drawn coin — a jump through a pattern must pay out completely.
 */
export const PICKUPS = {
  // Coins
  COIN_POINTS: 25,      // bonus score per coin
  COIN_RADIUS: 10,      // px — radius of the drawing
  COIN_SPIN_SPEED: 6,   // rad/s of the spin illusion (render-only clock)
  COIN_SPACING: 24,     // px between two coins of one pattern (tight: one sweep)
  COIN_MIN_PER_PATTERN: 2,
  COIN_MAX_PER_PATTERN: 3,
  ARC_COIN_COUNT: 3,    // ground → apex → ground: the 'arc' pattern, 3 coins
  // Generous collect box (radius + this) — the "magnet" that lets one jump
  // take a whole line instead of stranding the coin above the knight's head.
  COLLECT_BONUS: 14,

  // Hearts — rare on purpose: the first one costs 10 coins, then 20, 30 …
  HEART_RADIUS: 12,
  HEART_FLOAT_AMP: 6,     // px of the bobbing
  HEART_FLOAT_SPEED: 4,   // rad/s of the bobbing
  HEART_BASE_COIN_THRESHOLD: 10,      // coins before the first heart is offered
  HEART_COIN_THRESHOLD_INCREMENT: 10, // … +10 for every heart after that (10 → 20 → 30 …)

  // Spawn clock — bounded on purpose: an endless run must not fill the screen.
  // Deliberately SLOW and FAR APART (10–16 s), so a pattern is an event, not a
  // carpet: the player has time to notice it, plan the jump and take it all.
  SPAWN_INTERVAL_MIN: 10, // seconds between two coin patterns
  SPAWN_INTERVAL_MAX: 16,
  SPAWN_MARGIN: 30,        // px past the right edge where a pickup is born
  CULL_MARGIN: 120,        // px past the left edge before a pickup is removed

  // A pattern BELONGS to a trap: when the clock fires, the coins are laid out
  // in the lane that clears the trap the timeline rolls next, instead of
  // anywhere at random (see PickupSpawner.spawnTrapPattern). While that
  // timeline is rolling the offer simply waits for the next trap to be born
  // past the right edge — never longer than the pacing loop itself (≤5 s); a
  // corridor with no timeline at all waits this long and then pays out on its
  // own, so the clock can never stall.
  TRAP_ALIGN_WAIT: 1,      // safety bound for a corridor serving no traps
  SHIELD_COIN_OFFSET: 45,  // shield lane: mid-body height, reachable at any
                           // screen height (the knight is sized from the screen)

  // Heights above the floor line. The ground line is simply run over; the air
  // line and the arc peak sit AT the jump apex, where the knight hangs for
  // most of his flight — that is what makes one jump sweep the whole pattern
  // (tests/pickups.test.ts).
  GROUND_COIN_OFFSET: 22,
  AIR_COIN_OFFSET: 190,
  ARC_PEAK_OFFSET: 190,
  HEART_SPAWN_OFFSET: 50,  // hearts hover at running height, so none is missed
} as const;

/**
 * The in-run HUD — ONE row (geometry in core/uiLayout.ts → hudLayout): the
 * hearts sit on the left, the score on the right, and both share a single
 * centre line, so health and score are never stacked at two different heights.
 * The HI score joins that same baseline, small and quiet, left of the score;
 * the coin count follows the hearts on that same line.
 */
export const HUD = {
  PAD_RATIO: 0.035,         // side padding as a fraction of the playfield width
  PAD_MIN: 10,              // …but never below this many px
  FONT_RATIO: 0.052,        // score font size, as a fraction of the width
  HI_FONT_RATIO: 0.62,      // HI score font, as a fraction of the score font
  HI_GAP_RATIO: 0.5,        // gap between HI and the score, in score-font px
  DIGIT_CENTER_RATIO: 0.35, // a digit's optical centre, above its baseline
  HEART_SIZE_RATIO: 0.55,   // heart size, as a fraction of the score font
  HEART_SPACING: 2.4,       // distance between heart centres, in heart sizes
  COIN_SIZE_RATIO: 0.45,    // coin icon radius, as a fraction of the score font
  COIN_GAP_RATIO: 0.5,      // gap after the hearts block, in score-font px
  COIN_FONT_RATIO: 0.8,     // coin count font, as a fraction of the score font
} as const;

/** Result-screen button geometry (shared by the renderer and the hit-test). */
export const UI = {
  BUTTON_W_RATIO: 0.38,
  BUTTON_H_RATIO: 0.065,
  BUTTON_Y_RATIO: 0.68,
  BUTTON_GAP_RATIO: 0.06,
  PLAY_W_RATIO: 0.52, // Play button on the Play Screen
  PLAY_H_RATIO: 0.09,
  PLAY_Y_RATIO: 0.5,
} as const;

