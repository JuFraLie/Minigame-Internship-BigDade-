# Shapey Sudoku

A portrait, touch-only HTML5 puzzle mini-game for the Manado Post mini-app WebView: a
Sudoku where the numbers are replaced by shapes. Tap a square, then tap the shape that
fits — each shape appears exactly once per row, column and box. Built with
**Phaser 3 + TypeScript + Vite**, rendered exclusively on **HTML5 Canvas** (no WebGL),
fully offline, with no storage and no network.

---

## How to play

The board sits in the middle of the screen with the shape tray underneath. Tapping an
empty square selects it and washes its row, column and box; tapping a shape in the tray
then places it.

- A **given** (a cell dealt face-up) is locked — tapping it changes nothing.
- A shape that clashes with its row, column or box is a **mistake**: the shape pops back
  out, a heart is lost and the streak resets. The cell stays selected, so you can simply
  pick a different shape without retapping the board.
- Filling the board wins the round. Losing all three hearts ends it.

| Round event | Points |
| :--- | :--- |
| Correct placement | 100 × streak (×1 → ×3, one step per correct placement) |
| Row / column / box completed | +150 each, per line closed by that placement |
| Wrong placement | −50, streak reset (score never drops below 0) |
| Finishing under par | +5 per second left |

Levels ramp through three bands:

| Levels | Grid | Boxes | Givens | Par |
| :--- | :--- | :--- | :--- | :--- |
| 1–3 | 4×4 | 2×2 | 8 → 6 | 90 s |
| 4–7 | 6×6 | 2×3 | 18 → 14 | 180 s |
| 8+ | 6×6 | 2×3 | 14 → floor of 10 | 180 s |

Puzzles are generated procedurally from a seeded PRNG and checked for a single unique
solution, so every board is solvable by construction — no level files, no storage.
**Retry replays the same puzzle** (the session keeps the level's seed); **Next Level**
advances the level and draws a fresh one.

### Game flow

`MainMenu` (Play Screen) → `Game` (round) → `GameOver` (Result Panel) → `Game` (Next Level / Retry)

- The game **never starts on its own**; the Play Screen carries the title, a two-sentence
  how-to and a PLAY button, and tapping anywhere on it also starts the round.
- There is **no restart during a round**, and no pause. Restart, Next-Level and Exit exist
  only on the Result Panel, which appears after the score has been finalised and reported.
- Retry goes **straight back to gameplay**; the Play Screen does not replay.
- Exit calls the bridge exit signal once and does nothing else.
- **Sound starts on the first tap.** Browsers only allow audio inside a gesture, so the
  composition root unlocks the device on the first pointer-down and the loop begins there.
  Both the loop and every one-shot are synthesised from oscillators in `src/audio/lofi.ts` —
  there is no audio file anywhere in the project, for the same reason there is no image file.
- **The HUD carries a speaker button** between the level capsule and the score. It silences
  the loop and the one-shots for the session; nothing is persisted, so a reload comes back
  audible.

---

## Commands

```bash
npm install
npm run dev      # dev server on http://localhost:8080
npm test         # node --test --experimental-strip-types "tests/*.test.ts"
npm run build    # tsc --noEmit && vite build  → static output in dist/
npm run preview  # serve the built output
```

`npm run build` must pass before every push. The output is static HTML + JS, servable
from any file host (including `file:///android_asset/` inside the app). Every URL is
relative and comes from the bundle itself, so nothing is ever fetched from a network.
`dist/` is committed on purpose, following the same pattern as the sibling games.

---

## Architecture

Strict hexagonal architecture across the whole codebase (AGENTS.md §4.3): every component
depends only on the ports it consumes, and the concrete implementations are wired in one
place — `src/app/composition.ts`.

```
src/
  domain/            Pure domain: no Phaser, no DOM, no window, no timers of its own.
    shapes.ts          shape identity as opaque numeric tokens
    Board.ts           grid geometry (rows / columns / boxes), immutable board
    Rules.ts           conflicts, lines completed by a fill, board completion
    Scoring.ts         score / streak / multiplier ledger, plus formatScore
    PuzzleGenerator.ts seeded generation + unique-solution check
    RoundState.ts      the whole round: commands in, events out
    ports.ts           the contracts — ClockPort, BridgePort, SessionPort,
                       ViewportPort, EventsOutPort, SoundPort, GameCommand, RoundSnapshot
  render/
    GameLayout.ts      pure geometry: viewport → board / tray / HUD coordinates
    palette.ts         colour and font stack (shape identity → hue)
    RenderPort.ts      what any renderer must be able to do
    ShapeTextures.ts   every sprite, generated in code
    PhaserCanvasRenderer.ts  the only class in the project that draws
  input/
    InputAdapter.ts    design-space tap → { row, col } | { shape }
  audio/
    lofi.ts            SoundPort impl — the whole soundtrack synthesised from oscillators
  bridge/
    MpBridge.ts        preserved host bridge — the ONLY file touching window.MpPostMessage
    hostBridge.ts      BridgePort adapter with once-guards per signal
  app/
    deps.ts            what the scenes are handed
    session.ts         level / seed / last result (never persisted)
    viewport.ts        device measurement → design space
    composition.ts     composition root — the only file naming concrete classes
  scenes/
    keys.ts widgets.ts MainMenu.ts Game.ts GameOver.ts
  main.ts              waits for the bridge, then boots the game — with it or without
public/style.css       layout only; the game draws nothing in CSS
index.html
tests/                 Node's native test runner
```

### Coordinate spaces

Three spaces are in play, and each boundary is a typed conversion:

- **puzzle space** — integer `row`/`col` and opaque shape ids. This is all the domain
  ever sees; `GameCommand` carries nothing else.
- **design space** — canvas units of the current design size, which follows the device
  aspect ratio. `render/GameLayout.ts` is the only module that knows this space, and it
  is pure arithmetic with no Phaser import.
- **device space** — the canvas backing store, `design × renderScale()`.

A tap arrives as a Phaser pointer, and `pointer.worldX/worldY` inverts the camera matrix
back into design space. `input/InputAdapter.ts` then runs the layout's `hitTest` to turn
it into a `GameCommand`. Game logic therefore runs identically with no renderer at all,
which is exactly what the tests exercise.

### Rendering and density

- Canvas only: `type: Phaser.CANVAS`, WebGL never enabled. Phaser is instantiated in
  exactly one file, and a test asserts that.
- The backing store is the design size × `renderScale()` (`min(devicePixelRatio, 2)`);
  each scene zooms its camera by the same factor with a top-left origin, so world
  coordinates stay in design units while the canvas stays sharp.
- `Scale.FIT` with `NO_CENTER` — centring is CSS's job (`public/style.css`), not the
  canvas's. The design size tracks the window height, so the fit factor is exactly
  `1 / renderScale()` and there is no resampling blur.
- **All art is generated in code.** `ShapeTextures.ts` rasterises silhouettes (with their
  bevel, gloss and inner outline), confetti and the background wash into textures through
  `textures.createCanvas`. There are no image files anywhere in this project, so there is
  nothing to fetch.
- Text is rasterised at device density: `resolution: renderScale()` is passed in the
  style **at construction**, because Phaser stamps `frame.source.resolution` exactly once
  while the Text is being built. Setting it later rebuilds the canvas without re-stamping
  the source and draws every glyph `renderScale()` times too big.
- **Nothing is tinted.** Phaser's Canvas path draws a sprite with a plain `ctx.drawImage`
  and never reads `tintTopLeft` / `tintFill` — tinting exists only on the WebGL path, so
  `setTint()` compiles, runs, and changes nothing. The failure is silent and total: a spent
  heart would look identical to a full one and the lose condition would be invisible. Colour
  is therefore baked into textures — the HUD hearts are `hud-heart` / `hud-heart-spent`,
  confetti is one square per palette colour — and `sync()` swaps textures instead. A test
  bans `setTint` from `src/` so it cannot come back.

### Deviations worth knowing

- **Retry replays the same puzzle.** The design proposal left this open; `SessionPort`
  keeps `puzzleSeed` per level so Retry is an honest second attempt at the same board,
  while `advanceLevel()` draws a fresh seed.
- **No time-based loss.** Par only sets the time bonus; a round ends on a completed board
  or on the last heart. The HUD clock counts down to zero and then stops.
- `src/bridge/MpBridge.ts` keeps `IS_DEVELOPMENT_MODE = true` in source so the game runs
  in a plain browser. `vite.config.ts` rewrites it to `false` during `npm run build` and
  **fails the build** if the rewrite ever stops matching.

---

## Host bridge

`src/bridge/MpBridge.ts` is the only file that touches `window.MpPostMessage`; everything
else goes through `BridgePort`. All payloads are sent on channel `gameState`.

| Signal | Payload | When |
| :--- | :--- | :--- |
| `launch` | `{ type: 'launch' }` | Exactly once, after the player presses Play |
| `startRound` | `{ type: 'startRound' }` | Every round start, retries and next levels included |
| `endRound` | `{ type: 'endRound', win, score }` | When the Result Panel appears |
| `exit` | `{ type: 'exit', lastWin, lastScore }` | At most once, on Exit |

The game does not start before the bridge is available: `src/main.ts` awaits
`waitForBridge()` and only then dynamically imports the composition root, so the bundle
that draws anything loads second.

---

## Tests

`npm test` runs Node's native test runner over `tests/*.test.ts` with type stripping:

- `layers` — the architecture enforced mechanically: the layer import matrix, the bridge
  audit rule (`window.MpPostMessage` in exactly one file), the composition-root rule, and
  the bans on network, storage, WebGL and external assets.
- `board` — grid geometry, membership lists, immutability of `withPlacement`.
- `rules` — conflicts, line completion, board completion, out-of-range coordinates.
- `roundState` — the full round lifecycle: selection, mistakes, hearts, streaks, win/loss,
  snapshot contents, and the `puzzleSeed` behaviour behind Retry.
- `generator` — exact given count, single unique solution, seed reproducibility, and the
  difficulty table across levels.
- `scoring` — multiplier ladder, streak break, penalty floor, line bonus, time bonus.
- `layout` — the board sits below the HUD and above the tray on awkward viewports, short
  screens shrink the board rather than overflowing, the cutout is respected, and the
  sound toggle has its own tap target without ever reading as a puzzle tap.
- `bridge` — `launch` once, `startRound` per round, `endRound` re-armed per round,
  `exit` at most once.
- `perf` — a headless round against a frame budget, so logic regressions are caught
  without special hardware.

No coverage threshold applies; the requirement is that game logic is covered and the
suite passes alongside `npm run build`.
