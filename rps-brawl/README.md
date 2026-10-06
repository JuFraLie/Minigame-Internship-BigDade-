# RPS Streak

A plain Rock–Paper–Scissors score-attack game for the Manado Post app:
beat an enemy, build a win streak, watch the multiplier climb to ×5 — and
don't lose the 5 hearts you brought.

Built with **Phaser 3** (`Phaser.CANVAS` only), **TypeScript** and **Vite**,
following `AGENTS.md` (effective 2026-09-26).

## Game loop

- The enemy secretly picks Rock, Paper or Scissors; you always hold the same
  three cards.
- **Win** → the enemy is defeated, a new one steps in, and you score
  `100 × multiplier`, where the multiplier is the win number in your streak,
  capped at ×5.
- **Lose** → one heart gone, streak reset to 0, the same enemy picks again.
- **Tie** → nothing changes, the streak is kept, the enemy picks again.
- At 0 hearts the Result Panel appears with the final score and best streak.
  Retry goes straight back into gameplay; Exit signals the host once.

## Commands

```bash
npm install
npm run dev      # dev server
npm test         # unit tests (node --test --experimental-strip-types)
npm run build    # type-check + static bundle in dist/
```

## Architecture (strict hexagonal, enforced by tests)

Every component depends only on ports; concrete classes are created in one
composition root (`src/app/CompositionRoot.ts`). The layers are:

| Layer | Responsibility | Ports |
| --- | --- | --- |
| `core/` — `GameCore`, `RpsRules`, `types` | The game world: hidden enemy pick, clash resolution, hearts, streak, multiplier, score. No clock, no pixels, no framework — it runs headless. | consumes `RandomPort`, `GameEventsPort`; implements `InputIntentPort`, `GameViewPort`, `RevealPort` |
| `ports/` | Every contract that crosses a boundary: `CardLayoutPort` (renderer → input), `SessionPort` + `SceneContextPort` (wiring → scenes), `SoundPort`, `TapPort`, … | — |
| `adapters/` — `bridge/`, `input/`, `random/`, `audio/` | The only implementations of those ports. `bridge/MpBridge.ts` is the only code touching `window.MpPostMessage`, on channel `gameState`. | implements `HostSignalPort`, `GameEventsPort`, `InputIntentPort`, `RandomPort`, `SoundPort`, `TapPort` |
| `presentation/` — `layout/`, `art/`, `hud/`, `fx/`, `reveal/`, `scenes/` | The rendering world: all screen positions, procedurally baked textures, the HUD, one-shot effects, reveal timing, and the three Phaser scenes. | consumes `SceneContextPort`, `SessionPort`, `CardLayoutPort` |
| `app/` | The composition root — the only place in the codebase that constructs a concrete class. | implements `SceneContextPort` |
| `main.ts` | The only importer of `app/`: waits for the bridge, sizes the canvas, boots Phaser. | — |

`tests/layers.test.ts` enforces those boundaries by reading every import in
`src/`: a change that reaches past a layer fails `npm test` instead of
quietly coupling the codebase.

Within the rendering world, one scene keeps three collaborators so no file
owns everything: `GameHud` shows state, `GameFx` plays feedback, and
`RevealTimeline` decides when each beat of a reveal fires.

The game world advances only on taps and on the `completeReveal()` handshake
that the renderer sends when the reveal animation ends — that is what makes it
runnable headless, and what makes a double tap during the reveal harmless.

## Portrait canvas

The design space always follows the device aspect ratio, clamped so it is
never wider than 9:16 (`MIN_ASPECT`/`MAX_ASPECT` in `src/main.ts`). On any
modern phone — all of them are taller than 9:16 — that means the game is
edge-to-edge and fills the whole screen; on a squarer screen it is letterboxed
at 9:16 instead of being given a layout of its own. Only the width flexes.

## Bridge signals

| Signal | When | Payload |
| --- | --- | --- |
| `launch` | once, when Play is pressed | none |
| `startRound` | every run start, including after Retry | none |
| `endRound` | when the Result Panel appears | `{ win: true, score }` |
| `exit` | when Exit is pressed, at most once | `{ lastWin: true, lastScore }` |

No network, no storage, no WebGL: all art and sound are generated at boot.
