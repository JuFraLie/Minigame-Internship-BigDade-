import Phaser from 'phaser';
import type { WorldEventsPort } from '../../core/types.ts';
import type { KeyState } from '../../ports/KeyboardPort.ts';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import type { SessionPort } from '../../ports/SessionPort.ts';
import { computeHudLayout, computeOverlayLayout } from '../layout/Layout.ts';
import { bakeCharacterArt, queueCharacterArt } from '../art/CharacterArt.ts';
import { bakeLandArt, queueLandArt } from '../art/LandArt.ts';
import { bakeWoodPanel } from '../art/PanelArt.ts';
import { queueGameFont } from '../fonts.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { GameHud } from '../hud/GameHud.ts';
import { LevelUpOverlay } from '../overlay/LevelUpOverlay.ts';
import { PauseOverlay } from '../overlay/PauseOverlay.ts';
import { WorldView } from '../world/WorldView.ts';

interface GameData {
  ctx: SceneContextPort;
}

/** One direction and every key that can hold it: WASD and the arrow keys. */
interface KeyGroup {
  readonly state: keyof KeyState;
  readonly keys: Phaser.Input.Keyboard.Key[];
}

/**
 * Gameplay - the orchestrator of the rendering world.
 *
 * It owns three collaborators so no file owns everything: `WorldView` draws the
 * world, `GameHud` shows the numbers, and the two overlays handle the moments
 * the simulation is frozen. The world itself is reached only through
 * `session`, a bundle of ports - no rule, no clock and no pixel lives on the
 * other side of it.
 *
 * Freezing is passive: whenever `frame.offers` is non-null the level-up
 * overlay is on screen, and `session.frame()` refuses to advance the world
 * behind it. The scene never has to track that state itself.
 */
export class GameScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private session!: SessionPort;
  private view!: WorldView;
  private hud!: GameHud;
  private levelUp!: LevelUpOverlay;
  private pauseOverlay!: PauseOverlay;
  private zone?: Phaser.GameObjects.Zone;
  private keyGroups?: KeyGroup[];
  /** One stable object, rewritten in place so polling never allocates. */
  private readonly keyState: KeyState = { up: false, down: false, left: false, right: false };

  private paused = false;
  private finishing = false;

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.ctx = data.ctx;
  }

  preload(): void {
    /**
     * Normally the Play Screen has already fetched the walk pack; asking again
     * only queues what never arrived, so entering the round without ever
     * seeing that screen still gets the art. The typeface rides along for the
     * same reason - this scene has to stand on its own. The cards' plank
     * needs no request: it is drawn, not shipped (see `PanelArt`).
     */
    queueGameFont(this);
    queueCharacterArt(this);
    queueLandArt(this);
  }

  create(): void {
    generateTextures(this);
    bakeCharacterArt(this);
    bakeLandArt(this);
    this.paused = false;
    this.finishing = false;

    const events: WorldEventsPort = {
      onRunEnded: () => {
        // Polling `frame.running` in `update` is what opens the Result Panel;
        // the host reporter on the other side of the fan-out has already
        // sent `endRound` by then.
      },
      onLevelUp: () => {
        // Same: `frame.offers` is what opens the card overlay.
      },
      onEnemyKilled: (event) => this.view?.burst(event.x, event.y),
      onExplosion: (event) => this.view?.blast(event.x, event.y, event.radius),
      onPlayerHit: () => this.cameras.main.shake(120, 0.0035),
      onBulletFired: () => {
        // Sound hook. Audio is an open question for the core developer, so
        // nothing is wired here yet.
      },
      onBulletPickedUp: () => {
        // Same.
      },
      onUpgradeChosen: () => {
        // Same.
      },
    };

    this.session = this.ctx.createSession([events]);
    this.view = new WorldView(this, this.ctx.viewport, this.session.input);
    this.view.create();

    const hudLayout = computeHudLayout(this.scale.width, this.scale.height);
    const overlayLayout = computeOverlayLayout(this.scale.width, this.scale.height);

    this.hud = new GameHud(this, hudLayout, () => this.togglePause());
    this.levelUp = new LevelUpOverlay(
      this,
      this.session.upgrades,
      this.session.render,
      overlayLayout,
    );
    this.pauseOverlay = new PauseOverlay(this, overlayLayout, () => this.togglePause());

    this.buildJoystickZone();
    this.bindKeys();
    this.bindPointers();
    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyLayout, this);
      this.levelUp.close();
      this.pauseOverlay.hide();
      this.view.teardown();
    });

    this.ctx.host.startRound();
  }

  update(_time: number, delta: number): void {
    // Key state is polled rather than evented: Phaser resets its own key
    // objects when the window loses focus, so a keyup that never arrives can
    // never leave the player walking after the key was let go.
    this.syncKeys();

    // While paused the clock is not even read, so no time banks up behind the
    // overlay. Level-up freezing happens inside the session.
    if (!this.paused) this.session.frame(delta);

    const frame = this.session.render.getFrame();
    this.view.sync(frame);
    if (!this.paused) this.view.update(delta / 1000);
    this.hud.sync(frame);

    if (frame.offers) this.levelUp.show(frame.offers);
    else this.levelUp.close();

    if (!frame.running && !this.finishing) {
      this.finishing = true;
      this.scene.start('GameOver', {
        ctx: this.ctx,
        win: frame.win,
        score: frame.score,
        kills: frame.kills,
        level: frame.level,
        wave: frame.wave,
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * A full-screen zone at the bottom of the depth stack, pinned to the screen
   * so it covers every pixel the finger can reach - the camera is following
   * the player, and a zone that rode along with it would only catch the part
   * of the world that happens to be under the thumb. Phaser's `topOnly` hit
   * testing means the pause button and the overlay cards - both of which sit
   * above it - take the tap when they are under the finger, and this zone only
   * ever sees drags that belong to the player.
   */
  private buildJoystickZone(): void {
    const { width, height } = this.scale;
    this.zone = this.add
      .zone(0, 0, width, height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0)
      .setInteractive();
    this.zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.session.pointer.down(pointer.id, pointer.x, pointer.y);
    });
  }

  /**
   * WASD and the arrow keys, both, because a phone-sized WebView is just as
   * likely to be tried with a desktop keyboard (AGENTS.md section 3.2 waived
   * by the core developer for this project).
   *
   * `addKey` captures its own key codes, so the arrow keys cannot scroll the
   * page out from under the canvas.
   */
  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    const codes = Phaser.Input.Keyboard.KeyCodes;
    const key = (code: number): Phaser.Input.Keyboard.Key => keyboard.addKey(code);

    this.keyGroups = [
      { state: 'up', keys: [key(codes.W), key(codes.UP)] },
      { state: 'down', keys: [key(codes.S), key(codes.DOWN)] },
      { state: 'left', keys: [key(codes.A), key(codes.LEFT)] },
      { state: 'right', keys: [key(codes.D), key(codes.RIGHT)] },
    ];
  }

  /** Reads the keys once a frame and hands the state through the port. */
  private syncKeys(): void {
    const groups = this.keyGroups;
    if (!groups) return;

    for (const group of groups) {
      let held = false;
      for (const key of group.keys) {
        if (key.isDown) {
          held = true;
          break;
        }
      }
      this.keyState[group.state] = held;
    }

    this.session.keyboard.setHeld(this.keyState);
  }

  private bindPointers(): void {
    this.input.topOnly = true;
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.session.pointer.move(pointer.id, pointer.x, pointer.y);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.session.pointer.up(pointer.id);
    });
    this.input.on('gameout', () => {
      // The pointer left the webview with no `up` to follow it: stop steering
      // rather than run away from the player.
      this.session.pointer.releaseAll();
    });
  }

  /** Pause resumes, and only resumes (AGENTS.md section 2). */
  private togglePause(): void {
    if (this.paused) {
      this.paused = false;
      this.pauseOverlay.hide();
      return;
    }
    if (this.finishing) return;

    this.paused = true;
    this.pauseOverlay.show();
  }

  private applyLayout = (): void => {
    const { width, height } = this.scale;
    const overlay = computeOverlayLayout(width, height);

    // The cards' plank is cut to the card's real size, so it is laid before
    // the overlays are and recut whenever a resize changes that size.
    bakeWoodPanel(this, overlay.cardW, overlay.cardH);

    this.hud.applyLayout(computeHudLayout(width, height));
    this.levelUp.applyLayout(overlay);
    this.pauseOverlay.applyLayout(overlay);
    this.session.setViewSize(width, height);
    this.zone?.setSize(width, height);
  };
}
