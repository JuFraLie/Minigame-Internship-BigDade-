# Whack-a-Monster

A portrait, touch-only HTML5 arcade game for the Manado Post mini-app WebView: whack the
monsters before three of them escape. Built with **Phaser 3 + TypeScript + Vite**, rendered
exclusively on **HTML5 Canvas** (no WebGL), fully offline, with no storage and no network.

---

## How to play

Monsters pop out of a 3 × 3 grid of holes. The round runs until three of them get away.

| Monster | How to beat it | Points |
| :--- | :--- | :--- |
| **Goblin** | **1 tap** | 100 |
| **Skeleton** | **2 taps** — the first cracks the skull, the second finishes it | 200 |
| **Wolf** | **Swipe across it** — a tap is deflected and it shakes off the hit | 300 |

Every consecutive defeat builds a combo; each full step of 4 raises the multiplier by
`+0.5` (capped at `+3`). One escape breaks the combo and costs a life. The round speeds up
as you land hits: the spawn interval shrinks, monsters stay up for less time, and past a
speed threshold a second monster can appear at once.

### Game flow

`MainMenu` (Play Screen) → `Game` (round) → `GameOver` (Result Panel) → `Game` (Retry)

- The game **never starts on its own**; the Play Screen carries the title, a two-sentence
  how-to and a PLAY button, and tapping anywhere on it also starts the round.
- There is **no restart during a round**. Restart and Exit only exist on the Result Panel,
  which appears as soon as the third monster escapes — after the score has been finalised
  and reported to the host.
- Retry goes **straight back to gameplay**; the Play Screen does not replay.
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

`npm run build` must pass before every push. The output is static HTML + JS, servable from
any file host (including `file:///android_asset/` inside the app).

---

## Architecture

Strict hexagonal architecture across the whole codebase (AGENTS.md §4.3): every component
depends only on the ports it consumes, and the concrete implementations are wired in one
place — `src/game/wiring.ts`.

```
src/
  core/          Pure domain: no Phaser, no DOM, no timers of its own.
    config.ts      field geometry, monster rules, difficulty tuning (source of truth)
    monster.ts     one monster: lifecycle, hit rules, field-space geometry
    scoring.ts     score / combo / lives
    difficulty.ts  spawn scheduler, speed multiplier, kind roll
    world.ts       the simulation: grid, spawning, events, round phase
    ports.ts       BridgePort, AudioPort, Random, FxPort (contracts; the core implements
                   none of them, and keeping them here is what stops the input layer from
                   having to import the rendering layer)
  app/
    roundSession.ts  one round: drives the world, turns events into audio + host signals,
                     finalises the score exactly once
  input/
    pointerInput.ts      screen → field conversion, tap vs swipe classification (no Phaser)
    phaserPointerSource.ts  adapter from Phaser pointers to that conversion. Subscribes to
                            both the on-canvas and the outside-the-canvas event of each
                            gesture: a swipe that lifts past the canvas edge arrives as
                            `pointerupoutside`, and missing it drops the gesture entirely
  rendering/     Everything Phaser draws: layout maths, textures, HUD, world view, FX, widgets
    menuView.ts       everything the Play Screen draws (title, how-to, monster key, PLAY)
    resultPanelView.ts  everything the Result Panel draws (score, stats, Retry, Exit)
    gameView.ts       the round's drawing layer: world view, HUD, FX, world event → FX
  platform/
    hostBridge.ts   BridgePort adapter over jsbridge.ts (once-guards per signal)
    synthAudio.ts   AudioPort: procedural Web Audio cues, no audio files
  game/
    wiring.ts       composition root — the only file that names the concrete adapters
    scenes/         Preloader, MainMenu (Play Screen), Game, GameOver (Result Panel) —
                    thin controllers: flow and bridge signals, no drawing
    main.ts         Phaser game config (type: Phaser.CANVAS)
  jsbridge.ts    Preserved host bridge module (the only file touching window.MpPostMessage)
  main.ts        Entry point: waits for the bridge, then starts the game
tests/           Node's native test runner
```

### Coordinate spaces

Two spaces are in play and `rendering/layout.ts` is the only module that knows both:

- **field space** — the simulation's fixed `450 × 800` grid; game logic only ever sees this.
- **screen space** — design pixels of the canvas, which follow the device aspect ratio.

Input enters as Phaser pointer coordinates, is converted to design units by
`phaserPointerSource` (`Camera.getWorldPoint`, the inverse of the camera transform), then to
field units by `pointerInput`. Rendering leaves the simulation as `MonsterView` snapshots and
is positioned through the same layout. The game world therefore runs identically with no
renderer at all, which is what the tests exercise.

### Rendering and density

- Canvas only: `type: Phaser.CANVAS`, WebGL never enabled.
- The backing store is the design size × `renderScale()` (`min(devicePixelRatio, 2)`); each
  scene zooms its camera by the same factor, so world coordinates stay in design units while
  the canvas stays sharp. Text goes through `addText()` to rasterise at device density.
- Portrait, edge-to-edge, no fixed aspect ratio: the design height is constant and the width
  follows the device, so any vertical screen height maps onto the same layout. Top padding is
  `max(env(safe-area-inset-top), 5 % of the height)` measured through an invisible probe, and
  the HUD lives below it.
- Creature sprites ship as pre-scaled PNGs in `public/art/` (130 × 140, trimmed and centred
  on the same contract the layout uses); only the particle is still generated at boot with
  Phaser Graphics.

---

## Host bridge

`src/jsbridge.ts` is the only file that touches `window.MpPostMessage`; everything else goes
through `BridgePort`. All payloads are sent on channel `gameState`.

| Signal | Payload | When |
| :--- | :--- | :--- |
| `launch` | `{ type: 'launch' }` | Exactly once, after the player presses Play |
| `startRound` | `{ type: 'startRound' }` | Every round start, retries included |
| `endRound` | `{ type: 'endRound', win, score }` | When the Result Panel appears |
| `exit` | `{ type: 'exit', lastWin, lastScore }` | At most once, on Exit |

`IS_DEVELOPMENT_MODE = true` in `jsbridge.ts` lets the same build run in a plain browser
(where the host never injects the bridge). **Set it to `false` before release.**

The round is a score chase with no winning state — it only ends when the player runs out of
lives — so `endRound`/`exit` report `win: true`, as AGENTS.md §4.2 requires for
endless/infinite games (and as the other score-chase games in this repository do). The value
is a `reportsWin` option on `RoundSession` if it ever needs to change.

---

## Tests

`npm test` runs Node's native test runner over `tests/*.test.ts` with type stripping:

- `scoring` / `monster` / `difficulty` / `world` — the simulation, replayed with a fixed RNG.
- `roundSession` — round lifecycle and host/audio side effects against fake ports.
- `pointerInput` / `layout` — screen ↔ field conversion, tap vs swipe classification.
- `phaserPointerSource` — the Phaser event wiring, including the outside-the-canvas variants
  that a gesture ending past the canvas edge arrives as.
- `bridge` — records `window.MpPostMessage` calls and asserts channel, payloads and the
  once-only guarantees for `launch` and `exit`.
- `perf` — a scripted minute of headless play, budgeted at 2 ms of logic per frame, so a
  performance regression shows up as a number.

No coverage threshold applies; the requirement is that game logic is covered and the suite
passes alongside `npm run build`.
