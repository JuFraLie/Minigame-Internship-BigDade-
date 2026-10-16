# LAST BULLET

A portrait-only survivor-like mini-game (Phaser 3 + Vite + TypeScript), built for
the Manado Post app WebView and also deployable as a standalone web game.

Zombies close in from all sides; you move, the gun fires itself, and each kill
feeds the one bullet you have left back into the chamber. Pick an upgrade on
level-up and see how long you last.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at `http://localhost:8080` (runs in a plain browser) |
| `npm test` | Headless test suite (`node --test`, no browser needed) |
| `npm run build` | **WebView release** - bundle for embedding in the Manado Post app |
| `npm run build:standalone` | **Standalone release** - bundle for a plain browser with no host |
| `npm run preview` | Serve the last build locally |

## The two release builds

The game talks to its host through `window.MpPostMessage`, which only exists
inside the Manado Post WebView (`src/adapters/bridge/MpBridge.ts`).

- `npm run build` flips `IS_DEVELOPMENT_MODE` to `false`: the bundle waits for
  the host bridge before booting, as required inside the app.
- `npm run build:standalone` keeps the flag `true`: no host exists in a plain
  browser, so the bridge signals become safe no-ops and the game boots
  immediately.

`vite.config.ts` enforces both cases and fails the build if the expected flag
is ever missing. All bridge signal calls are optional-chained, so the
standalone build is a fully functional game - it simply has nothing to report to.

## Deploying to Vercel

The game deploys as a static site (no server code). `vercel.json` already pins
the framework, build command and output directory, so setup is:

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In the [Vercel dashboard](https://vercel.com/new), import the repository.
3. Because the repository root contains several games, set **Root Directory**
   to `last-bullet` (Project Settings -> General, or during import).
4. Keep the defaults otherwise - `vercel.json` selects
   `npm run build:standalone` and the `dist` output directory.
5. Deploy. Every push to the connected branch redeploys automatically.

Or with the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
cd last-bullet
vercel            # first run: link a new project (set Root Directory to ".")
vercel --prod     # ship it
```

### Notes

- The game is portrait-oriented; on wide screens (desktop browsers, tablets) it
  letterboxes to 9:16 rather than stretching.
- Hashed bundles under `assets/` are served `immutable`; art and audio use a
  short cache with revalidation (see `vercel.json`).
- No analytics, storage or network calls are made from the game itself.

## Credits

Art by Ittaimanero: <https://ittaimanero.itch.io/> (see `public/assets/asset-credit`).
