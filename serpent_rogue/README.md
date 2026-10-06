# Serpent Rogue — Roguelike Snake

A fast-paced roguelike snake arcade game built for the Manado Post mobile app's WebView (MPArcade), skinned in a neon cyberpunk theme — cyan and magenta signage burning over a dark violet grid.

Craft unique serpent builds with over 15 upgrades inspired by **Hades II** and **Vampire Survivors**, navigate the neon-lit grid, and survive data minefields and shrinking firewalls!

---

## 🎮 Core Gameplay Loop

1. **Slither & Feed:** Move on a dynamic grid. Eating data chips grows your serpent and awards XP.
2. **Level Up & Upgrade:** Whenever your XP bar fills, the game pauses to offer **3 random upgrade cards** (Common & Rare). Stack upgrades to create game-changing builds!
3. **Stage Modifiers:** Every 10 food eaten advances the stage to a new environmental hazard:
   - **Neon Undercity:** Pure slithering.
   - **Data Minefield:** Rogue code blocks obstruct your path.
   - **Firewall Lockdown:** Arena walls contract inward!
   - **Overclock:** 15% move speed boost.
   - **Chrome Rush:** High risk & high reward — food gives double XP, but junk code litters the floor!
4. **Survive & Score:** Hitting walls or your own tail ends the run — unless upgrades like **Shed Skin** revive you!

---

## ⚡ Starter & Advanced Upgrades

| Upgrade | Rarity | Effect |
| :--- | :--- | :--- |
| **Shed Skin** | Rare | Survive 1 fatal hit by losing 3 tail segments (Free revive). |
| **Wall Wrap** | Rare | Passing through walls wraps to the opposite border safely. |
| **Serpent Dash** | Rare | Dash 3 tiles forward on a 5s cooldown (passes through rocks). |
| **Phase Tail** | Rare | Tail is completely intangible for 3 seconds after eating. |
| **Food Magnet** | Common | Food within 3 tiles drifts towards your head each tick. |
| **Slow Time** | Common | Game runs 15% slower, giving more time to react. |
| **Compact Coil** | Common | Only grow once every 2 food eaten. Stay nimble longer! |
| **Combo Chain** | Common | Eating food in quick succession multiplies score up to 5x. |
| **Golden Apple** | Common | +25% chance for high-XP golden food. |
| **Double Feast** | Common | Two food orbs remain active on the board at all times. |
| **Rock Smasher** | Common | Harmlessly smash through up to 2 obstructing rocks. |
| **Fast Feast** | Rare | Risk boon: +20% move speed, but +50% XP and score. |
| **Blood Price** | Rare | Risk boon: Sacrifice 2 segments now to guarantee a Rare card next! |
| **Long Boi** | Rare | Every 5 segments grants +50% score bonus. |
| **Venom Trail** | Rare | Tail leaves a toxic trail behind you. |

### 💥 Synergies & Evolutions
- **Toxic Highway:** *Venom Trail + Long Boi* — Venom trail spreads across your whole body length.
- **Ghost Serpent:** *Phase Tail + Dash* — Dash grants complete invulnerability.
- **Black Hole:** *Food Magnet + Combo Chain* — Supercharges magnet to pull food across the entire map during combos!
- **Hydra:** *Shed Skin + Split Tail* — Lost segments turn into healing food orbs.

---

## 📱 Mobile Controls

- **Steer:** Swipe anywhere on screen (Up, Down, Left, Right). The turn is read the moment the swipe crosses the threshold, so there is no need to lift your finger first; keeping the finger down and swiping again re-arms the gesture.
- **Dash:** Double tap anywhere on screen (when Serpent Dash is unlocked).
- **Screens (Play, upgrade cards, Result):** tap. A press that stays inside the swipe threshold is a tap, so a drag across the screen can no longer press a button by accident, and a tap released just past the canvas edge still lands on the control under it.

### 🖥️ Desktop (review builds)

AGENTS.md §3.2 requires a touch-only scheme — the game ships inside the mobile app's WebView. For desktop review, the same build additionally accepts:

- **WASD** or the **arrow keys** to steer, **Space** to dash, **any key** to start from the Play Screen, and the mouse (click) for taps.

> ⚠️ The keyboard bindings above are a deliberate deviation from AGENTS.md §3.2 ("mouse/keyboard optimizations MUST NOT exist"), added on request for desktop play and review. They live only in `src/input/keyboardInput.ts` — the touch path is unchanged — and are pending sign-off by the core developer.

---

## 🛠️ Development & Testing

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run automated logic unit tests (Node native test runner)
npm test

# Build for production
npm run build
```

---

## 🏛️ Architecture & Standards Compliance

- **AGENTS.md Section 2:** Play Screen start action, tap anywhere to start, no mid-round restart, Retry goes directly to gameplay, Result Panel reports final score.
- **AGENTS.md Section 3:** Strict portrait orientation, Canvas rendering only (Phaser with `type: Phaser.CANVAS` — no WebGL, no CSS rendering), offline-first zero external assets, no persistent storage.
- **AGENTS.md Section 4:** Phaser 3 + TypeScript + Vite; scenes map to the mandatory flow — `MainMenu` (Play Screen), `Game` (gameplay), `GameOver` (Result Panel). Strict hexagonal architecture: the rules engine in `src/game` runs headless with no renderer, and rendering (`src/render`), scenes (`src/scenes`), input (`src/input`), audio and the host bridge sit behind the ports they consume. `src/services/MpBridge.ts` is the only file that touches `window.MpPostMessage`.
- **Input layer:** `src/input/gestures.ts` (swipe maths) and `src/input/inputBuffer.ts` (the ports, plus a buffer shared by every adapter) are pure and unit-tested; `touchInput.ts` and `keyboardInput.ts` are the adapters; `playerInput.ts` is the wiring the scenes consume. No adapter knows a rule, and no rule knows an input device.
