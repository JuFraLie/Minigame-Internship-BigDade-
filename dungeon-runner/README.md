# Knight: Dungeon Runner

A portrait, touch-first endless runner served inside the Manado Post app's
WebView: tap to jump, swipe down to raise the shield, scoop up the coins (and
the hearts they unlock), outlast the spikes, bats and arrow stacks for as long
as you can — with a demon chaser running at your heels the whole way
(decoration only; he never touches the rules).

Built with Phaser 3 + TypeScript + Vite, rendered with `type: Phaser.CANVAS`
(no WebGL). `phaser` is the only runtime dependency.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + static output in dist/
npm test        # node --test --experimental-strip-types "tests/*.test.ts"
```

## Controls

Touch only — the scheme a finger drives on a phone (§3.2):

| Input | Effect |
| --- | --- |
| Tap | Jump (and: starts the run on the Play Screen) |
| Swipe down | Raise the shield for exactly one shield animation (0.6 s — blocks bats and arrows, not spikes) |

There is no keyboard handling and no mouse-specific path: the scenes forward
Phaser's unified pointer events into the shared adapters
(`src/scenes/pointerFeed.ts`), so a desktop mouse arrives as the very same
down/up transitions as a finger. Restart/Exit on the Result Panel stay
tap-only. A tap that starts the run never becomes a jump (consumed on the
scene switch plus the `RULES.START_INPUT_DELAY` gate in the controller).

> Laptop testing: the mouse already works in `npm run dev` (click = tap =
> jump, press-drag-down-release = swipe = shield). The keyboard
> (`W` / `Space` / `↑` = jump, `S` / `↓` = shield, any key also starts the run)
> works there too — but only there. It lives in `src/input/devKeyboard.ts`,
> wired behind `import.meta.env.DEV` in `bootstrap.ts`, so the release
> `npm run build` compiles the whole branch away: the shipped chunks contain
> zero keyboard code (only Phaser's own unused library internals mention keys).

## Hazards

| Trap | Behaviour | Counter |
| --- | --- | --- |
| Spike clusters | Ground level | Jump |
| Bats | Low (knee height) or high (run under) | Shield the low ones |
| Arrow stacks | 5 arrows stacked from shin height up past your highest jump — too tall to clear | Raise the shield just as the wall closes in — the block lasts one animation (0.6 s) |

Every trap telegraphs itself first: while a trap is still off the right edge,
a pulsing red warning marker appears at the edge **in the lane the trap will
occupy**, for a fixed ~0.6 s reaction window at any speed
(`src/render/warningView.ts`; obstacles spawn at exactly that lead distance).

## Pickups

Two things are worth grabbing on the way (`src/game/pickups.ts`, drawn by
`src/render/pickupView.ts`):

| Pickup | Where it spawns | Effect |
| --- | --- | --- |
| Coins | Every **10–16 s**, laid in the lane of the trap rolled at that moment: an **arc over the spikes** (jump it), a **shield-height line through the arrow wall or the low bat** (block it), or **coins on the floor under a high bat** (just keep running) — only 2–3 tight coins each | +25 score each, and they count towards the next heart |
| Hearts | Offered after 10 coins, then every 20, 30 … — **only while a heart is missing** | Restores exactly one heart, never past 3 |

Coins are scarce and far apart on purpose — a pattern is an event you can plan
for — and the collect box is deliberately larger than the drawn coin: **one
jump takes a whole pattern**, nothing is left hanging above the knight's head
(`tests/pickups.test.ts`).

Where a pattern sits is never random: the clock offers it on the frame the
timeline rolls a trap, and the coins are then laid out in the lane that
**clears** that trap — an arc that starts before the cluster, peaks over its
middle and lands beyond it; a shield-height line straddling the wall; floor
coins beneath a high bat. Following the coins is always the right counter, and
because a trap is born past the right edge, so is the pattern — nothing ever
pops in mid-corridor (`tests/coinTraps.test.ts`).

At full health the heart milestone is *held*, not spent: the first coin after a
hit drops the promised heart, so a heart can never be wasted. Pickups ride along
with the world on their own clock (`PICKUPS` in `config/gameConfig.ts`): the
clock decides **when** a pattern is offered and the trap decides **where** it
sits — neither ever changes how hard the run is (`tests/pickups.test.ts`).

## Difficulty pacing

Difficulty follows a **deterministic, distance-driven timeline** (a simplified
Subway Surfers model — no player tracking, no failure counting): the score
grows 20 points per second of running, and the score alone decides the phase
(`src/game/pacing.ts`, table in `config/gameConfig.ts` → `PACING`):

| Phase | From score | Rhythm (gap / burst → recovery) | Menu |
| --- | --- | --- | --- |
| `warm-up` | 0 | 2.2–3.4 s, 2 spawns → 1.6 s rest | spikes only |
| `contact` | 100 (≈5 s) | 2.0–3.1 s, 3 → 1.5 s | + arrow stacks |
| `crossfire` | 200 (≈10 s) | 1.8–2.9 s, 3 → 1.3 s | + bats |
| `pressure` | 500 (≈25 s) | 1.4–2.4 s, 4 → 1.1 s | all three (40 % spikes, 40 % arrows) |
| `flow` | 1000 (≈50 s) | 1.1–2.0 s, 5 → 1.0 s | all three, widest clusters |

Two rules make it a *loop* rather than a ramp: every `burst` spawns the
timeline **breathes** (a `rest`-second gap opens the next burst — tension →
recovery → tension), and a phase change restarts that rhythm from the top.
Randomness never decides *when* or *how hard* — it only picks which member of
the phase's weighted menu comes next, so the same score always meets the same
pacing (`tests/pacing.test.ts`).

## Screen layout

Edge-to-edge at any vertical screen height (§3.1) — no fixed aspect ratio:

- The playfield is the full container (`src/engine/viewport.ts`): any phone,
  tablet or desktop height works, with no letterboxing and no centering gaps.
- The HUD sits under a reserved top inset (safe-area inset + `topPadFor`
  fallback) so status-bar icons and display cutouts never eat it.
- Pixel art stays crisp: `antialias: false` on the Phaser game plus
  nearest-neighbour sprite scaling; the stylesheet carries the
  `pixelated`/`crisp-edges` fallback chain for older WebViews.

The in-run HUD is a **single row** pinned under that top inset: the
hearts sit on the left, the coin count right after them, the score on the right,
and all of it is centred on the **same line**, with the `HI` score in smaller
grey type on the same baseline just left of the score. The geometry is pure maths
(`src/core/uiLayout.ts` → `hudLayout`), `src/render/hud.ts` only paints it, and
`tests/uiLayout.test.ts` pins the one-row alignment plus the no-clash margins
on every portrait size above.

## Flow

`MainMenu (Play Screen) → Game (gameplay) → GameOver (Result Panel) → Retry / Exit`,
exactly as AGENTS.md §2 mandates and §4.1 maps. Retry returns straight to
gameplay; Restart, Exit and the final score exist only on the Result Panel;
there is no mid-round restart and no pause. Tapping anywhere on the Play Screen
starts the run; the Play button is the drawn affordance of the same rule.

## Bridge (AGENTS.md §4.2)

`src/services/jsbridge.ts` is the only file that touches
`window.MpPostMessage`; `src/services/hostBridge.ts` adapts it to the game's
`GameBridge` port and enforces the once-only rules.

| Signal | Fired when |
| --- | --- |
| `launch` | The first Play press, once per session |
| `startRound` | Every round start, including every Retry |
| `endRound { win, score }` | When the Result Panel appears (`win: true` — endless run) |
| `exit { lastWin, lastScore }` | The Exit button, at most once; nothing else happens |

`main.ts` builds nothing until `waitForBridge()` resolves; `bootstrap.ts` is
the single composition root that wires the viewport, game, input adapters and
Phaser scenes together (§4.3).

> `IS_DEVELOPMENT_MODE` inside `jsbridge.ts` stays `true` **in the source**, so
> the same code runs in a plain browser while developing. It is flipped to
> `false` **at bundle time** by the `release-bridge-flag` plugin in
> `vite.config.ts`, which the file itself asks for ("set this flag to false
> when it's time to release/bundle/build it for production"). The module is
> never edited — only the shipped `dist/` carries the release value, where the
> game refuses to start until the WebView injects `window.MpPostMessage`
> (verified: `vite dev` serves `true`, `vite build` emits `false`).

## Definition of Done (AGENTS.md §5)

- [x] Opens on a Play Screen (title + Play button; tapping anywhere also starts).
- [x] How-to text present (touch-first: tap to jump, swipe down for shield,
      plus the arrow-wall hint).
- [x] Playable in portrait at any vertical screen height, edge-to-edge, with
      safe-area top padding. No fixed aspect ratio.
- [x] Live score HUD during gameplay; final score on the Result Panel.
- [x] Result Panel before Retry/Exit; Retry goes straight back to gameplay.
- [x] Pause: not implemented (permitted — and if added it may only resume).
- [x] Exit calls the bridge exit signal exactly once and nothing else.
- [x] Bridge signals wired per §4.2 (`tests/bridge.test.ts` pins the payloads).
- [x] Strict hexagonal structure per §4.3 across all components; game logic
      runs headless (`src/game/` imports no Phaser, no DOM).
- [x] Phaser 3 + TypeScript + Vite; `phaser` the only runtime dependency;
      `type: Phaser.CANVAS`; scenes `MainMenu`/`Game`/`GameOver` per §4.1.
- [x] `npm run build` produces static output and passes.
- [x] Logic unit tests pass (86 tests, `npm test`).
- [x] No WebGL/WebGPU/raw-CSS rendering; no network; no storage; assets bundled.
- [x] Headless performance guard in `tests/perf.test.ts` (§3.3, §4.3).
- [ ] **On-device FPS measurement (30 min / 50 avg on 4 GB + Helio G95)** — needs
      a real handset; the headless budget is a proxy, not a substitute.

Two judgement calls worth a second pair of eyes:

- **`src/game/boss.ts` + `src/render/bossView.ts`** are the chaser: a demon
  that runs behind the knight for fun, like the guard in Subway Surfers. He
  bobs closer and further, surges forward on every 100-point milestone, and
  creeps up to you on the Result Panel — but he is decoration only and never
  feeds collisions, scoring or input. The view measures the sprite's
  per-frame content box at first update so his walk cycle has no frame jitter.
- **Edge gestures**: the scenes forward `pointerdownoutside`/`pointerupoutside`
  as well as the inside variants, so a swipe that starts or ends off the canvas
  still registers instead of being swallowed.

## Layout

See `src/README.md` for the layer diagram and the rules of the road.
