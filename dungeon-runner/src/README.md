# Architecture — Separation of Concerns

Each folder owns exactly one concern. Dependencies only point **downwards**;
nothing in a lower layer may import from a higher one. Strict hexagonal (§4.3):
every component depends only on the ports it declares or consumes; wiring of
concrete implementations happens in `bootstrap.ts` and nowhere else.

```
main.ts            entry point — waits for the bridge, then lazy-loads
                   the composition root; contains no logic
bootstrap.ts       THE composition root — constructs Viewport, Game, input
                   adapters and the Phaser game; scenes receive ports only
│
├── config/        gameConfig.ts      all tunable numbers, pure data
├── core/          types.ts           shared contracts (Layout, GameSpace,
│                                     ActionSource, PointerSource, PointerFeed…)
│                  uiLayout.ts        pure geometry: Play/Result buttons, top
│                                     padding and the one-row HUD
├── engine/        viewport.ts        DOM + resize + safe-area top inset;
│                                     edge-to-edge, no fixed aspect (§3.1)
├── game/          game.ts            state machine + rules (no DOM, no Phaser)
│                  knight.ts          entity simulation
│                  obstacles.ts       model + hitboxes + the spawn clock
│                  pickups.ts         the coin & heart pickups: model, hitbox
│                                     and their own spawn clock (pure)
│                  pacing.ts          the difficulty timeline: phases and the
│                                     burst → recovery loop (pure, no RNG)
│                  collision.ts       pure collision rules (traps AND pickups)
│                  scoring.ts         score / speed progression
│                  boss.ts            the chaser behind the knight (decorative)
├── input/         input.ts           Phaser pointer feed → 'jump' | 'slide'
│                                     (touch only — no keyboard, no mouse path)
│                  pointer.ts         taps → world coordinates via GameSpace
├── scenes/        Boot/Preloader     template pipeline (§4.1)
│                  MainMenu           Play Screen (title + Play + how-to)
│                  GameScene          gameplay (Game = template `Game`)
│                  GameOverScene      Result Panel (template `GameOver`)
│                  deps.ts            ports a scene receives
│                  pointerFeed.ts     Phaser input → PointerFeed adapters
├── render/        worldView.ts       composes the world layer per scene
│                  background.ts      parallax scenery (reads scroll speed)
│                  knightView.ts      knight sprite (reads sim state)
│                  obstacleView.ts    spikes, bats, arrows (Graphics)
│                  pickupView.ts      coins and hearts (animation clocks live
│                                     in the model, this only draws them)
│                  bossView.ts        the chaser sprite (content-box frames)
│                  warningView.ts     danger telegraph: off-screen markers +
│                                     the pure dangerMarkers() maths
│                  hud.ts             one-row HUD: hearts + coins + HI + score
│                  screens.ts         Play Screen + Result Panel overlays
│                  spriteSheets.ts    knight white-strip + sheet install
└── services/      audio.ts           adapter for the GameAudio port
                   jsbridge.ts        the ONLY file touching window.MpPostMessage
                   hostBridge.ts      adapter for the GameBridge port + once-only guards
```

## Rules of the road

1. **`game/` never touches the DOM, the canvas or Phaser.** It asks the `Layout`
   contract for geometry and reports side effects through the `GameAudio` and
   `GameBridge` ports. It runs fully headless for tests and perf checks.
2. **`render/` and `scenes/` never mutate game state.** No hit-testing, no rule
   decisions, no animation advancing inside views — animation clocks live on the
   entities and are ticked by the simulation.
3. **`input/` translates events, it doesn't decide what they mean.** The
   controller decides, e.g. "this tap restarts the run". Screen-space pointer
   events are converted to world coordinates through `GameSpace` before the
   controller sees them (§4.3).
4. **Numbers live in `config/gameConfig.ts`**, not scattered through the code.
5. **`main.ts` + `bootstrap.ts` only compose.** If a rule, a draw call or DOM
   maths shows up there, it belongs in one of the layers above. Nothing is
   built until `waitForBridge()` resolves (AGENTS.md §4.2).
6. **Tests live in `tests/` and run headless** — no DOM, no renderer:
   `npm test` (Node's native runner with type stripping).

Note: `game/boss.ts` + `render/bossView.ts` are the chaser — a demon that
runs behind the knight for fun (Subway-Surfers-style). Pure decoration: it is
simulated in `game/` like every other entity, and it never feeds collisions,
scoring or input.
