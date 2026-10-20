# Ring Road Parking

A portrait, touch-only HTML5 puzzle game for the Manado Post mini-app WebView: tap the
cars parked in the lot to drive them out onto the one-cell ring road, where they circle a
full lap as moving obstacles — clear the lot without crashing. Built with
**Phaser 3 + TypeScript + Vite**, rendered exclusively on **HTML5 Canvas** (no WebGL),
fully offline, with no storage and no network.

---

## How to play

The lot sits in the middle of the screen; a single-cell road runs around it clockwise.
Tap a car: if its lane to the exit is clear it drives out, joins the ring, circles exactly
one lap and disappears. While it circles it blocks every other car's exit, so the puzzle is
about ORDER and TIMING.

- A car whose lane is blocked only shakes — no penalty, just tap another one.
- Joining the ring with a circling car 1–2 cells away is a **near miss** (+50).
- Joining while the entry window is occupied is a **crash**: the car bounces back into its
  spot, one fender is lost, and the combo resets. Three fenders gone ends the round as a loss.
- Clearing the lot wins the round. There is no timer-based loss.

| Round event | Points |
| :--- | :--- |
| Car clears the lot | 100 × combo (x1 → x5, releases within 4 s chain) |
| Near miss on join | +50 (flat, never breaks the combo) |
| Lot cleared | +200, +100 per surviving fender, up to +300 speed bonus |
| Crash | −1 fender, combo reset |

Levels get bigger and busier in bands: a 4×4 lot with length-2 cars first, then 5×5 and
5×6 lots with mixed lengths, speed pulses, and finally a 6×7 lot where a slow bus clogs
the ring. Levels are generated procedurally from a launch-time seed, built in reverse exit
order, so every layout is solvable by construction — no level files, no storage.

### Game flow

`MainMenu` (Play Screen) → `Game` (round) → `GameOver` (Result Panel) → `Game` (Next Level / Retry)

- The game **never starts on its own**; the Play Screen carries the title, a two-sentence
  how-to and a PLAY button, and tapping anywhere on it also starts the round.
- There is **no restart during a round**. Restart, Next-Level and Exit only exist on the
  Result Panel, which appears as soon as the lot is cleared or the last fender is gone —
  after the score has been finalised and reported to the host.
- Retry goes **straight back to gameplay** to the same level; Next Level advances
  `sessionState.level`. The Play Screen does not replay.
- Pause (a single button in the HUD) **only resumes** — no restart, no exit.
- Exit calls the bridge exit signal once and does nothing else.

---

## Commands

```bash
npm install
npm run dev      # dev server on http://localhost:8080
npm test         # node --test --experimental-strip-types "tests/*.test.ts"
npm run build    # tsc --noEmit && vite build  → static output in dist/
npm run preview  # serve the built output
```

`npm run build` must pass before every push. The output is static HTML + JS + the art in
`public/`, servable from any file host (including `file:///android_asset/` inside the app).
Every URL — including the vehicle images — is relative and comes from the bundle itself, so
nothing is ever fetched from a network.

---

## Architecture

Strict hexagonal architecture across the whole codebase (AGENTS.md §4.3): every component
depends only on the ports it consumes, and the concrete implementations are wired in one
place — `src/game/wiring.ts`.

```
src/
  core/          Pure domain: no Phaser, no DOM, no timers of its own.
    config.ts      tuning constants + the level table (`levelSpec`) — source of truth
    ring.ts        ring geometry: perimeter walk, direction, entry cell for a lot cell
    generator.ts   seeded reverse-order level generation (solvability by construction)
    scoring.ts     score / combo / fenders / clear bonus
    world.ts       the simulation: lot, ring, entry windows, crashes, round phase
    ports.ts       BridgePort, RandomPort, RoundEventsPort (contracts;
                   the core implements none of them, which is what keeps the input layer
                   from having to import the rendering layer)
  app/
    roundSession.ts  one round: fixed-step accumulator, forwards taps in grid coords,
                     finalises the score exactly once
  input/
    tapInput.ts         screen → lot-grid conversion (pure, no Phaser)
    phaserTapSource.ts  adapter from Phaser single-tap events to that conversion
  render/        Everything Phaser draws: layout maths, textures, views
    layout.ts         cell size, board centring, top padding (the only module that
                      knows both grid and pixel space)
    viewport.ts       FIT + camera-zoom helpers (design height, renderScale)
    carTextures.ts    vehicle art: queues the bundled pack in `MainMenu.preload()` once,
                      bakes each sprite to board scale on first use — never per frame —
                      and falls back to a flat procedural car when the pack has no art
    gameView.ts       the round's drawing layer: cached board texture, car sprites,
                      pulsing entry windows, HUD
    menuView.ts       everything the Play Screen draws
    resultPanelView.ts  everything the Result Panel draws
    pauseOverlay.ts   pause dim + RESUME (resume-only, per AGENTS.md §2)
    widgets/text      shared buttons and device-density text helpers
  platform/
    hostBridge.ts   BridgePort adapter over jsbridge.ts (once-guards per signal)
  game/
    wiring.ts       composition root — the only file that names the concrete adapters
    scenes/         MainMenu (Play Screen), Game, GameOver (Result Panel) —
                    thin controllers: flow and bridge signals, no drawing
    main.ts         Phaser game config (type: Phaser.CANVAS)
  jsbridge.ts    Preserved host bridge module (the only file touching window.MpPostMessage)
  main.ts        Entry point: waits for the bridge, then starts the game
public/          Everything served as-is: the vehicle art pack, plus `Credit`
tests/           Node's native test runner
```

### Coordinate spaces

Two spaces are in play and `render/layout.ts` is the only module that knows both:

- **lot space** — integer grid cells of the lot, plus fractional positions along the ring;
  game logic only ever sees this.
- **screen space** — design pixels of the canvas, which follow the device aspect ratio.

A tap enters as a Phaser pointer position, is converted to design units by
`phaserTapSource`, then to lot coordinates by `tapInput`, and reaches the world as
`tapCell(col, row)`. Rendering leaves the simulation as `WorldSnapshot` and is positioned
through the same layout. The simulation therefore runs identically with no renderer at
all, which is what the tests exercise.

### Rendering and density

- Canvas only: `type: Phaser.CANVAS`, WebGL never enabled.
- The backing store is the design size × `renderScale()` (`min(devicePixelRatio, 2)`); each
  scene zooms its camera by the same factor, so world coordinates stay in design units
  while the canvas stays sharp. Text goes through `addText()` to rasterise at device
  density.
- Portrait, edge-to-edge, no fixed aspect ratio: the design height is constant and the
  width follows the device. The cell size is
  `min(width / (cols + 2), usableHeight / (rows + 2))` with the top ~8 % reserved as
  padding for cutouts, so any vertical screen height maps onto the same centred board.
- The board texture is baked once per level; nothing is redrawn per frame beyond sprites,
  the HUD and the entry-window pulse.

**Deviation from the design note:** instead of `Phaser.Scale.RESIZE` this project uses
`Scale.FIT` with a fixed design height plus a camera zoom (the same pattern as
`whack-a-monster/`). It keeps world coordinates stable and the canvas sharp on hi-dpi
screens while still accommodating any vertical screen height, and matches the house style
of the sibling game.

### Vehicle art

Vehicles are drawn from a bundled top-down racing pack — `public/assets/`, Kenney's Racing
Pack (CC0, credited in `public/Credit`) — not generated at runtime. The images are queued
once from `MainMenu.preload()`, which is the only screen that runs before a vehicle is ever
drawn, and the texture manager belongs to the game rather than to a scene, so the round and
the Result Panel inherit them for free.

Every image ships pointing **north**, nose at the top, while the views rotate a sprite with
0 radians meaning "facing right". `carTextures.ts` turns each one a quarter clockwise into a
canvas texture at load and stretches it to the `length × 1` cells it occupies: a motorcycle
keeps the narrow proportion it was drawn with, while a three-cell car and the five-cell bus
are lengthened until they read as long vehicles. Afterwards the texture is used as-is — no
tinting and no per-frame drawing — and a resize only ever changes a scale factor.

Colour is a label, not a filter: the palette in `core/config.ts` has one entry per body the
pack ships, and `carTextures.ts` pairs the two by position. A colour or length the pack
cannot cover falls back to the flat procedural car still in the same file, so the game
degrades to a slightly plainer art style rather than to a missing texture.

---

## Host bridge

`src/jsbridge.ts` is the only file that touches `window.MpPostMessage`; everything else
goes through `BridgePort`. All payloads are sent on channel `gameState`.

| Signal | Payload | When |
| :--- | :--- | :--- |
| `launch` | `{ type: 'launch' }` | Exactly once, after the player presses Play |
| `startRound` | `{ type: 'startRound' }` | Every round start, retries and next levels included |
| `endRound` | `{ type: 'endRound', win, score }` | When the Result Panel appears |
| `exit` | `{ type: 'exit', lastWin, lastScore }` | At most once, on Exit |

The game does not start before the bridge is available (`src/main.ts` waits for it).

`IS_DEVELOPMENT_MODE = true` in `jsbridge.ts` lets the same build run in a plain browser
(where the host never injects the bridge). **Set it to `false` before release.**

---

## Tests

`npm test` runs Node's native test runner over `tests/*.test.ts` with type stripping:

- `ring` — perimeter geometry, entry cells, direction of travel, lap wrapping.
- `generator` — cars fit the lot and never overlap, car counts stay inside the level
  band, the reverse placement order is a valid exit order, and a seed reproduces a level.
- `scoring` — combo window, multiplier cap, near miss, crash, clear/speed bonus.
- `world` — releases, blocked lanes, crashes and bounce-back, near misses, lap expiry,
  loss, snapshot contents.
- `roundSession` — round lifecycle and host signals against a fake bridge, plus the
  fixed-step accumulator's catch-up cap.
- `perf` — a headless round budgeted at 4 ms of logic per tick (frame budget is ~16 ms),
  a heap-growth guard over 3000 ticks, and the fixed tick constant.

No coverage threshold applies; the requirement is that game logic is covered and the suite
passes alongside `npm run build`.
