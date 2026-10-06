import Phaser from 'phaser';
import type { WorldFrame } from '../../core/types.ts';
import type { InputPort } from '../../ports/InputPort.ts';
import type { ViewportPort } from '../../ports/ViewportPort.ts';
import {
  poseCharacter,
  WALK_FRAMES,
  WALK_FPS,
  WALK_STRIDE,
} from '../art/CharacterArt.ts';
import { ENEMY_TEXTURE_RADIUS, RING_RADIUS } from '../art/TextureGenerator.ts';

const DEPTH_GRID = -10;
const DEPTH_GLOW = 1;
const DEPTH_BULLET = 3;
const DEPTH_ENEMY = 4;
const DEPTH_PLAYER = 5;
const DEPTH_SPARK = 6;
const DEPTH_BLAST = 7;
const DEPTH_STICK = 40;

const SPARK_POOL = 60;
const SPARK_LIFE = 0.38;
const BLAST_POOL = 6;
const BLAST_LIFE = 0.28;

interface Spark {
  readonly image: Phaser.GameObjects.Image;
  life: number;
  vx: number;
  vy: number;
}

/** One Explosive Round ring: born at full size, shrunk back as it fades. */
interface Blast {
  readonly image: Phaser.GameObjects.Image;
  life: number;
  scale: number;
}

/**
 * Draws one frame of the game world on the Canvas renderer.
 *
 * Everything is pooled and grown on demand: a round that ends at 40 kills and
 * one that reaches 400 draw from the same object sets, so the display list
 * tracks the simulation's own caps instead of a worst case. Nothing in here
 * makes a decision - it reads `WorldFrame` and moves pictures.
 *
 * Flying and grounded bullets get separate pools. They are mutually exclusive
 * states of the same bullet, but mixing them into one list would mean
 * re-deriving which slots are live every frame; two lists make it trivial.
 */
export class WorldView {
  private readonly scene: Phaser.Scene;
  private readonly viewport: ViewportPort;
  private readonly input: InputPort;

  private grid?: Phaser.GameObjects.TileSprite;
  private player?: Phaser.GameObjects.Image;
  /**
   * Where the player stood last frame, and the distance walked since: the
   * cycle is counted in ground covered, not in seconds, so a sprint quickens
   * the stride and standing still parks it on the standing pose.
   */
  private playerX = 0;
  private playerY = 0;
  private playerStride = 0;
  private stickBase?: Phaser.GameObjects.Image;
  private stickKnob?: Phaser.GameObjects.Image;
  private camera?: Phaser.Cameras.Scene2D.Camera;
  private viewWidth = 0;
  private viewHeight = 0;

  private readonly enemies: Phaser.GameObjects.Image[] = [];
  private readonly flying: Phaser.GameObjects.Image[] = [];
  private readonly grounded: Phaser.GameObjects.Image[] = [];
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly sparks: Spark[] = [];
  private sparkCursor = 0;
  private readonly blasts: Blast[] = [];
  private blastCursor = 0;

  /** How many of each pool were drawn last frame, so only those get hidden. */
  private lastEnemies = 0;
  private lastFlying = 0;
  private lastGrounded = 0;

  constructor(scene: Phaser.Scene, viewport: ViewportPort, input: InputPort) {
    this.scene = scene;
    this.viewport = viewport;
    this.input = input;
  }

  create(): void {
    const { width, height } = this.scene.scale;
    this.viewWidth = width;
    this.viewHeight = height;

    // The floor is a world object, not a backdrop: it is re-centred under the
    // camera every frame (see `reportCamera`), so it always covers the screen
    // while its pattern stays put in the arena - walking has to be visible.
    this.grid = this.scene.add
      .tileSprite(width / 2, height / 2, width, height, 'grid')
      .setDepth(DEPTH_GRID);

    this.player = this.scene.add.image(0, 0, 'player').setDepth(DEPTH_PLAYER);

    this.camera = this.scene.cameras.main;
    this.camera.startFollow(this.player, true, 0.2, 0.2);
    this.camera.centerOn(0, 0);

    // The stick lives in screen space, so it must not ride along with the
    // camera.
    this.stickBase = this.scene.add
      .image(0, 0, 'stick_base')
      .setScrollFactor(0)
      .setDepth(DEPTH_STICK)
      .setVisible(false);
    this.stickKnob = this.scene.add
      .image(0, 0, 'stick_knob')
      .setScrollFactor(0)
      .setDepth(DEPTH_STICK)
      .setVisible(false);

    for (let i = 0; i < SPARK_POOL; i++) {
      const image = this.scene.add
        .image(0, 0, 'spark')
        .setDepth(DEPTH_SPARK)
        .setVisible(false);
      this.sparks.push({ image, life: 0, vx: 0, vy: 0 });
    }

    for (let i = 0; i < BLAST_POOL; i++) {
      const image = this.scene.add
        .image(0, 0, 'ring')
        .setDepth(DEPTH_BLAST)
        .setVisible(false);
      this.blasts.push({ image, life: 0, scale: 1 });
    }

    // Fires before the cameras render, so the scroll we report is the one the
    // frame is actually drawn with.
    this.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.reportCamera, this);
    this.scene.events.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  /** Positions every sprite for `frame`, growing pools only as the world does. */
  sync(frame: WorldFrame): void {
    this.syncPlayer(frame);
    this.syncEnemies(frame);
    this.syncBullets(frame);
    this.syncStick();
  }

  /** Presentation-only time, for the spark burst. */
  update(deltaSeconds: number): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i];
      if (spark.life <= 0) continue;

      spark.life -= deltaSeconds;
      if (spark.life <= 0) {
        spark.image.setVisible(false);
        continue;
      }

      const t = spark.life / SPARK_LIFE;
      spark.image.x += spark.vx * deltaSeconds;
      spark.image.y += spark.vy * deltaSeconds;
      spark.image.setAlpha(t).setScale(0.5 + t * 0.8);
    }

    for (let i = 0; i < this.blasts.length; i++) {
      const ring = this.blasts[i];
      if (ring.life <= 0) continue;

      ring.life -= deltaSeconds;
      if (ring.life <= 0) {
        ring.image.setVisible(false);
        continue;
      }

      // Loudest the instant it lands, then it closes in and goes.
      const t = 1 - ring.life / BLAST_LIFE;
      ring.image.setAlpha(1 - t * t).setScale(ring.scale * (1 + t * 0.35));
    }
  }

  /** A short white burst where something died. */
  burst(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const spark = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;

      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 130;
      spark.life = SPARK_LIFE;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.image.setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
    }
  }

  /** The ring Explosive Round leaves behind, drawn to the blast's real size. */
  blast(x: number, y: number, radius: number): void {
    if (this.blasts.length === 0) return;
    const ring = this.blasts[this.blastCursor];
    this.blastCursor = (this.blastCursor + 1) % this.blasts.length;

    ring.life = BLAST_LIFE;
    ring.scale = radius / RING_RADIUS;
    ring.image.setPosition(x, y).setScale(ring.scale).setAlpha(1).setVisible(true);
  }

  teardown(): void {
    const events = this.scene.events;
    events.off(Phaser.Scenes.Events.PRE_RENDER, this.reportCamera, this);
    events.off(Phaser.Scale.Events.RESIZE, this.resize, this);
  }

  // -------------------------------------------------------------------------

  private reportCamera = (): void => {
    if (!this.camera) return;
    this.viewport.updateCamera(this.camera.scrollX, this.camera.scrollY, this.camera.zoom);

    // Fires before the cameras render, so this frame's camera position is the
    // one the floor is parked with: centred on what the player can see, its
    // pattern anchored to the arena instead of to the screen.
    this.grid?.setPosition(
      this.camera.scrollX + this.viewWidth / 2,
      this.camera.scrollY + this.viewHeight / 2,
    );
  };

  /** The floor has to cover the new screen; the camera parks it again next frame. */
  private resize = (gameSize: Phaser.Structs.Size): void => {
    if (!this.grid) return;
    this.viewWidth = gameSize.width;
    this.viewHeight = gameSize.height;
    this.grid.setDisplaySize(gameSize.width, gameSize.height);
  };

  private syncPlayer(frame: WorldFrame): void {
    const player = frame.player;
    if (!this.player) return;

    const dx = player.x - this.playerX;
    const dy = player.y - this.playerY;
    this.playerX = player.x;
    this.playerY = player.y;

    if (dx * dx + dy * dy > 0.01) this.playerStride += Math.hypot(dx, dy);
    else this.playerStride = 0;
    const cycle = Math.floor(this.playerStride / WALK_STRIDE) % WALK_FRAMES;

    this.player.setPosition(player.x, player.y);
    // Four-way art instead of a turned disc: `facing` is the way it is going,
    // and it is also what the placeholder shape is aimed with when the pack
    // did not load.
    poseCharacter(
      this.player,
      'player',
      Math.cos(player.facing),
      Math.sin(player.facing),
      cycle,
      player.facing,
    );
    // A hard blink is the clearest "these 0.8 seconds are free" signal there is.
    this.player.setAlpha(
      player.invulnerable && Math.floor(frame.time * 14) % 2 === 0 ? 0.3 : 1,
    );
  }

  private syncEnemies(frame: WorldFrame): void {
    const list = frame.enemies;
    const player = frame.player;

    for (let i = 0; i < list.length; i++) {
      const view = list[i];
      const image = this.ensure(this.enemies, i, DEPTH_ENEMY);
      // Every zombie shambles at its own pace around the cycle, so a pack of
      // them does not bob in step like one machine.
      const cycle = Math.floor((frame.time + view.id * 0.37) * WALK_FPS) % WALK_FRAMES;
      image
        .setVisible(true)
        .setPosition(view.x, view.y)
        .setScale((view.radius / ENEMY_TEXTURE_RADIUS[view.kind]) * (1 + view.hit * 0.4));
      // They are always heading for the closest thing that is still alive.
      poseCharacter(image, view.kind, player.x - view.x, player.y - view.y, cycle);
    }
    this.hideFrom(this.enemies, list.length, this.lastEnemies);
    this.lastEnemies = list.length;
  }

  private syncBullets(frame: WorldFrame): void {
    const list = frame.bullets;
    let flyers = 0;
    let floor = 0;

    for (let i = 0; i < list.length; i++) {
      const view = list[i];

      if (view.state === 'ground') {
        const glow = this.ensure(this.glows, floor, DEPTH_GLOW);
        const image = this.ensure(this.grounded, floor, DEPTH_BULLET);
        floor++;

        // The pickup is the one thing the player must be able to find in a
        // crowd, so it breathes.
        const pulse = 1 + Math.sin(frame.time * 6 + i) * 0.14;
        glow
          .setVisible(true)
          .setPosition(view.x, view.y)
          .setScale(1.4 * pulse)
          .setAlpha(0.5 + 0.3 * Math.sin(frame.time * 6 + i));
        image
          .setVisible(true)
          .setPosition(view.x, view.y)
          .setRotation(0)
          .setScale(pulse);
        continue;
      }

      const image = this.ensure(this.flying, flyers, DEPTH_BULLET);
      flyers++;
      image
        .setVisible(true)
        .setPosition(view.x, view.y)
        .setRotation(view.angle)
        .setScale(1)
        .setAlpha(1);
    }

    this.hideFrom(this.flying, flyers, this.lastFlying);
    this.hideFrom(this.grounded, floor, this.lastGrounded);
    this.hideFrom(this.glows, floor, this.lastGrounded);
    this.lastFlying = flyers;
    this.lastGrounded = floor;
  }

  private syncStick(): void {
    const stick = this.input.getStick();
    const visible = stick.active;

    this.stickBase?.setVisible(visible).setPosition(stick.originX, stick.originY);
    this.stickKnob?.setVisible(visible).setPosition(stick.knobX, stick.knobY);
  }

  private hideFrom(
    pool: Phaser.GameObjects.Image[],
    from: number,
    previous: number,
  ): void {
    const end = Math.min(previous, pool.length);
    for (let i = from; i < end; i++) {
      const image = pool[i];
      if (image && image.visible) image.setVisible(false);
    }
  }

  private ensure(
    pool: Phaser.GameObjects.Image[],
    index: number,
    depth: number,
  ): Phaser.GameObjects.Image {
    let image = pool[index];
    if (image === undefined) {
      image = this.scene.add.image(0, 0, 'spark').setDepth(depth).setVisible(false);
      pool[index] = image;
    }
    return image;
  }
}
