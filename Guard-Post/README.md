# Guard Post

Endless, level-based tower defense mini-game for the Manado Post WebView.
Implements the Guard Post design document (11 November 2026) under the repository
rules in `AGENTS.md` (effective 2026-09-26).

## Run

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # tsc --noEmit && vite build -> dist/
npm test         # node --test --experimental-strip-types "tests/*.test.ts"
```

`IS_DEVELOPMENT_MODE` in `src/adapters/MpBridge.ts` is `true` in source so the game runs
straight in a browser; `vite build` rewrites it to `false` so production waits for the
real host bridge.

## Layout

```
src/
  domain/          pure game logic: map and wave generation, damage, economy, score,
                   simulation. No Phaser, no DOM, no pixels.
  app/             ports (typed contracts) and the session flow state machine.
  adapters/
    MpBridge.ts    the only file that touches window.MpPostMessage
    hostBridge.ts  HostPort adapter over MpBridge
    phaser/        scenes, renderer, layout, input adapter (screen -> world coordinates)
  testing/         headless runner and bots for balance/perf runs
  composition.ts   composition root
  main.ts          boot: waits for the bridge, then composes the game
tests/             unit tests (Node native runner)
```

## Credit

The Play Screen carries a credit line ("Assets by skyel"); tapping it opens
`https://skyel13.itch.io/` and does **not** start the game. `src/adapters/creditLink.ts`
is the only file that navigates outside the game — `tests/layers.test.ts` keeps it that
way, the same way it fences `window.MpPostMessage` inside `MpBridge.ts`.

## Assets

There are no image or audio files: every visual is generated in code by
`src/adapters/phaser/textures.ts` (entities, tiles, scenery, UI chrome). The only
bundled files are the `Press Start 2P` font in `public/fonts/` (SIL Open Font License,
see `OFL.txt`), the favicon and the page CSS. `tests/noAssets.test.ts` guards that
asset-free state.

## Rules summary

- Play Screen on launch; tap anywhere or Play starts a round.
- Result Panel is the only place with Retry / Next Level / Exit; Pause only resumes.
- Endless levels: every level generates a fresh layout (road, scenery and pads seeded
  by the level number, so a level replays identically) with a randomized wave mix within
  the same threat budget; 3 to 10 waves per level, 10 lives.
- Per `AGENTS.md` §4.2 the game is endless, so `endRound` always carries `win: true`
  (confirmed 11 November 2026); the Result Panel still shows Victory/Defeat to the player.
