# Bricksurge

A Breakout-inspired portrait mini-game for the Manado Post app, with in-round
Dynamic Difficulty Adjustment (DDA) and random power-up drops.

Drag the paddle to bounce the volley into bricks. There are no extra lives:
every ball that falls past the paddle is gone for good, and running out of
balls ends the run. Destroyed bricks drop power-ups (the main one being +1
ball, plus wide paddle, slow ball, fireball, shield — and a "bad" Shrink), so
the loop is Ballz-style: break bricks, grow the volley, keep it alive. A hidden
DDA watches how the player is doing and quietly tunes ball speed, paddle size,
drop rates and brick toughness so every run stays tense but fair.

The run is **endless**: there is no final wave. Fields start dense (6/7/8
rows of 8 columns) and keep growing by one row per wave up to 12 — the run only
ends when the balls do. Built with Phaser 3 (Canvas only) + TypeScript + Vite.

The game is portrait-locked: the playfield is always a portrait column (max
aspect 3:5). A phone held upright gets the entire screen exactly as before; a
device in landscape — or a tablet/desktop window — gets a centred portrait
column with the page background filling the sides, so the layout never squashes
into a short wide strip and the game is never blocked.

Tuning follows a Ballz-like ease curve: a leisurely ball (95 u/s), a wide
paddle (20 units, ~20% of the screen), bounce angles capped at 45° so returns
stay gentle and predictable, generous drop rates weighted towards rewards
rather than punishment, and a hard cap of 6 balls in flight. The DDA still
spans −3…+3 but its hard end bites lightly.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (`node --test --experimental-strip-types`) |

## Architecture

Strict hexagonal architecture across the whole codebase (AGENTS.md §4.3):

- `src/domain/` — pure TypeScript. Game world, physics, waves, power-ups, DDA,
  scoring and the round state machine. No Phaser, no DOM, runs headless.
- `src/adapters/` — concrete implementations of the domain ports: the Phaser
  renderer and input, the host bridge (`window.MpPostMessage` lives only in
  `bridge/jsbridge.ts`), seeded/system RNG, system clock, event bus.
- `src/scenes/` — Phaser scenes for the mandatory flow: `MainMenu` (Play
  Screen), `Game` (round + resume-only pause), `GameOver` (Result Panel).
- `src/main.ts` — the composition root; the only place adapters are wired to
  ports.

The domain works in world units (always 100 wide, height follows the screen
aspect ratio); the renderer maps world → screen. Input is converted from screen
pixels to world units before it reaches game logic. Time and randomness are
injected, so all logic is deterministic under test.

### Performance

Fixed 120 Hz logic timestep with anti-tunneling sub-steps, in-place array
compaction (no per-frame allocation in the loop), capped object pools (6 balls,
80 bricks, 24 particles). `tests/perf.test.ts` runs 50 000 headless ticks and
reports time per tick to catch regressions.

### DDA

Session-only (no storage): every launch starts neutral. Signals (ball lost,
near miss, rally length, drop catch rate, clean streaks, wave clear time) feed
a Skill Score, which maps to a Difficulty Level −3…+3 with an 8 s cooldown and
hysteresis, so the level never flickers. Points per brick are never changed, so
lowering difficulty cannot inflate scores.
