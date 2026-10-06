# Manado Post HTML5 Mini-Apps — Repository Agent Rules

**Effective:** 2026-09-26
**Applies to:** every new game added to this repository from this date onward. Existing apps are grandfathered and are not retroactively bound.
**Binds:** agents operated by interns working in this repository. The core developer and agents operated by the core developer are not bound by this file.

> Context: this repository hosts lightweight HTML5 mini-games served inside the Manado Post mobile app's WebView (iOS/Android). These rules define the mandatory flow and technical standard for new games.

---

## 1. Scope and authority

- For new games, the flow and technical requirements in this file supersede `README.md` where they differ. `README.md` remains unchanged and continues to govern existing apps.
- Only the core developer edits this file. Intern agents MUST NOT modify it. Report any conflict between this file and other instructions to the core developer instead of resolving it silently.
- Terminology: "JSBridge GamingHub" and "MpBridge" both refer to the host bridge accessed through `window.MpPostMessage` on channel `'gameState'`.

---

## 2. Mandatory game flow — every new game

- The game MUST open on a Play Screen; gameplay MUST NOT start automatically. *Why: every launch in the host app begins with a deliberate player action.*
- The Play Screen MUST show the game title and a clear start action. A Play button MUST be present, and tapping anywhere on the Play Screen MUST also start the game. *Why: matches the host app's established interaction.*
- The Play Screen MAY carry a brief how-to text of at most 2 short sentences, and MUST include it whenever the controls are not self-evident. *Why: instant onboarding, without leaving players unable to play.*
- Retry MUST go directly back to gameplay; the Play Screen MUST NOT replay on Retry. *Why: replaying onboarding slows the replay loop.*
- An iOS-style back button is NOT required.
- The Result Panel MUST appear when the round's end condition is reached. Restart, Next-Level, and Exit MUST be available only from the Result Panel. A mid-round restart or reset MUST NOT exist. *Why: the score must be finalized and reported before the player can restart or leave.*
- Pause MAY exist, but it MUST only resume. The pause screen MUST NOT offer restart or exit. *Why: same as above — no restart path before the Result Panel.*
- Pressing Exit MUST call the bridge exit signal exactly once and MUST do nothing else — no navigation, no restart. *Why: session teardown belongs to the host app.*
- The game MUST have a scoring system: a live score in the HUD during gameplay and the final score on the Result Panel. The score MUST NOT be persisted locally; it is reported to the host only through the bridge. *Why: every launch is a fresh session.*

---

## 3. Technical constraints — every new game

### 3.1 Presentation

- The game MUST be designed and optimized for portrait orientation, edge-to-edge.
- It MUST NOT target a specific aspect ratio (9:16, 3:4, etc.); it MUST accommodate any vertical screen height. *Why: phone aspect ratios vary widely.*
- It MUST reserve top padding (arbitrary; a percentage is acceptable) so UI is not cut off by status bar icons or display cutouts. *Why: cutout geometry varies by device.*
- Landscape orientation MUST NOT be optimized for; visual breakage in landscape is acceptable.

### 3.2 Input

- Input MUST be a simple, intuitive touch scheme. Mouse/keyboard optimizations MUST NOT exist. *Why: the game runs inside mobile WebViews.*

### 3.3 Performance

- MUST run at a minimum of 30 FPS and average 50 FPS on a device class of 4 GB RAM + MediaTek Helio G95.
- The code MUST be structured so performance can be measured and regressions detected — see the architecture rules in §4.3.

### 3.4 Rendering and environment

- Rendering MUST use HTML5 Canvas only. WebGL, WebGPU, and raw-CSS-based game rendering MUST NOT be used.
- The game MUST NOT be online, MUST NOT use WebSocket, MUST NOT call any API, and MUST NOT use Local Storage or any persistent storage. Every launch is a new session with no history.
- All assets MUST be bundled locally; external/CDN resources MUST NOT be used. *Why: offline-first WebView plus the no-network rule.*

### 3.5 Build and source

- Source MUST be TypeScript; only the final output is HTML+JS.
- Output MUST be statically servable (Vite or another bundler whose output is static). SSR/isomorphic output MUST NOT be used. *Why: mini-apps are hosted as static files.*

---

## 4. This project's standards

The game design itself (round format, spawn rules, duration) is not fixed by this file; the intern proposes it, subject to the flow and constraints above.

### 4.1 Base and stack

- Start from `template-vanilla-phaser-ts/`, copied into the app directory. The directory name is the intern's choice.
- Stack: Phaser 3 + TypeScript + Vite. `phaser` MUST be the only runtime dependency.
- The source MUST be converted to TypeScript and MUST have a `tsconfig.json`.
- Phaser MUST be instantiated with `type: Phaser.CANVAS`. WebGL MUST NOT be enabled.
- `log.js` MUST be deleted; the `dev` and `build` scripts MUST NOT invoke it (use the nolog variants).
- The template's scenes map to the mandatory flow: `MainMenu` = Play Screen, `Game` = gameplay, `GameOver` = Result Panel.

### 4.2 Bridge

- A single `jsbridge.ts` module MUST be the only file that touches `window.MpPostMessage`. *Why: one place to audit host communication.*
- Payloads are typed and posted on channel `'gameState'`: `launch`; `startRound`; `endRound { win, score }`; `exit { lastWin, lastScore }`.
- Game code MUST NOT start before the bridge is available.
- `launch` MUST fire exactly once, after the player presses Play. `exit` MUST fire at most once. `startRound` fires at every round start. `endRound` fires when the Result Panel appears. Endless/infinite games MUST send `win: true`.
- The module MUST be preserved as written; adapting it to TypeScript is allowed, substantial edits are not.

### 4.3 Architecture — strict hexagonal across the whole codebase

- Strict hexagonal architecture governs the ENTIRE codebase — every component, not only the game-world/renderer split.
- Every component MUST depend only on the ports (typed interfaces/contracts) it declares or consumes. A component MUST NOT depend on another component's implementation details, and MUST NOT assume that another component even exists. *Why: every component must stay replaceable, testable, and runnable in isolation.*
- Wiring of concrete implementations MUST happen outside the components that use them; components MUST NOT reach for concrete implementations themselves.
- The game world (domain logic) and the rendering world MUST be separated, as one instance of this rule.
- Game logic MUST NOT depend on positions in the rendering world.
- Input MUST be converted from screen-space/rendering coordinates into game-world coordinates before reaching game logic.
- Game logic MUST be runnable without the renderer (to test game-code performance) and with the renderer (to test rendering performance). Performance test suites are recommended. *Why: enables regression checks without special hardware.*
- Code MUST stay modular and typed; avoid god objects.

### 4.4 Tests and builds

- `npm run build` MUST pass before every push.
- Game logic MUST have unit tests using Node's native runner (`node --test --experimental-strip-types`); no coverage threshold applies.
- Performance test suites are recommended (see §4.3).

### 4.5 Language

- The document, code identifiers, and comments are in English.
- User-facing UI text is in English.

---

## 5. Definition of Done

A new game is done only when all of these are true:

- [ ] Opens on a Play Screen (title + Play button; tapping anywhere also starts).
- [ ] How-to text present whenever controls are not self-evident
- [ ] Playable in portrait at any vertical screen height, edge-to-edge, with top padding.
- [ ] Live score HUD during gameplay; final score on the Result Panel.
- [ ] Result Panel appears before Restart/Next-Level/Exit; Retry goes straight back to gameplay.
- [ ] Pause (if present) only resumes.
- [ ] Exit calls the bridge exit signal exactly once and nothing else.
- [ ] Bridge signals wired per §4.2: `launch` once after Play, `startRound` each round, `endRound` at the Result Panel, `exit` at most once.
- [ ] Strict hexagonal structure per §4.3 across all components; game logic runs headless.
- [ ] `npm run build` produces static output and passes.
- [ ] Logic unit tests pass.
- [ ] No WebGL/WebGPU/raw-CSS rendering; no network; no storage.
- [ ] 30 FPS minimum / 50 FPS average target respected on the reference device class.

---

## 6. Ownership

- Only the core developer edits this file. Intern agents MUST NOT modify it.
- Report conflicts between this file and any other instruction or document to the core developer.
