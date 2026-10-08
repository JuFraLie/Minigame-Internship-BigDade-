import Phaser from 'phaser';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import { computePlayLayout, type PlayLayout } from '../layout/Layout.ts';
import {
  bakeCharacterArt,
  poseCharacter,
  queueCharacterArt,
  WALK_FPS,
  WALK_FRAMES,
  type CharacterId,
} from '../art/CharacterArt.ts';
import { bakeLandArt, floorKey, queueLandArt } from '../art/LandArt.ts';
import { bakePlank } from '../art/PanelArt.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { AMBER, CYAN_HEX, INK, PAPER, SLATE } from '../palette.ts';
import { FONT_BODY, FONT_HEAD, queueGameFont } from '../fonts.ts';

/** The Play button wears its own plank, cut to this scene's button size. */
const PLAY_PLANK = 'play_plank';

/** One of the five zombies circling the hero: drawn, aimed, and kept walking. */
interface HeroEnemy {
  readonly image: Phaser.GameObjects.Image;
  readonly kind: CharacterId;
  /** Where it is looking - always inwards, at where the hero stands. */
  dx: number;
  dy: number;
}

/**
 * The Play Screen (AGENTS.md section 2): title plus a Play button, and tapping
 * anywhere on it also starts the round. Gameplay never starts on its own.
 *
 * The how-to is exactly two sentences, because the controls are not
 * self-evident: dragging is obvious, auto-fire and the walk-to-reload loop are
 * not.
 */
export class MainMenuScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private layout!: PlayLayout;
  private started = false;

  private floor?: Phaser.GameObjects.TileSprite;
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private playBox?: Phaser.GameObjects.Image;
  private playLabel?: Phaser.GameObjects.Text;

  private glow?: Phaser.GameObjects.Image;
  private heroBullet?: Phaser.GameObjects.Image;
  private readonly heroEnemies: HeroEnemy[] = [];

  constructor() {
    super('MainMenu');
  }

  /**
   * The typeface the labels rasterise with, plus the walk pack and the ground
   * - all fetched before `create` so the scene can bake in one go.
   */
  preload(): void {
    queueGameFont(this);
    queueCharacterArt(this);
    queueLandArt(this);
  }

  create(): void {
    generateTextures(this);
    bakeCharacterArt(this);
    bakeLandArt(this);
    this.ctx = this.registry.get('ctx') as SceneContextPort;
    this.started = false;
    this.heroEnemies.length = 0;

    const { width, height } = this.scale;
    // The layout has to exist before the Play button does: the button's plank
    // is cut to the button's size, and only the layout knows that size.
    this.layout = computePlayLayout(width, height);
    this.floor = this.add
      .tileSprite(width / 2, height / 2, width, height, floorKey(this))
      .setScrollFactor(0)
      .setDepth(-10);

    this.title = this.add
      .text(0, 0, 'LAST', {
        fontFamily: FONT_HEAD,
        fontSize: '76px',
        color: PAPER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.subtitle = this.add
      .text(0, 0, 'BULLET', {
        fontFamily: FONT_HEAD,
        fontSize: '76px',
        color: AMBER,
        stroke: '#0b0f1a',
        strokeThickness: 10,
      })
      .setOrigin(0.5, 0.5);

    this.hint = this.add
      .text(0, 0, 'Drag or W A S D to move. Your bullet fires itself, so pick it up again!', {
        fontFamily: FONT_BODY,
        fontSize: '17px',
        color: SLATE,
        align: 'center',
        lineSpacing: 7,
      })
      .setOrigin(0.5, 0.5);

    this.buildHero();

    // Cut before it is drawn: `add.image` resolves the texture on the spot.
    this.cutPlayPlank();
    this.playBox = this.add.image(0, 0, PLAY_PLANK).setInteractive({ useHandCursor: true });
    this.playLabel = this.add
      .text(0, 0, 'PLAY', {
        fontFamily: FONT_HEAD,
        fontSize: '30px',
        // Ink on pale timber, like every other label in the light theme; the
        // cyan the button used to shout in is now its accent stripe.
        color: INK,
      })
      .setOrigin(0.5, 0.5);

    this.tweens.add({
      targets: [this.playBox, this.playLabel],
      scale: { from: 1, to: 1.05 },
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: [this.title, this.subtitle],
      scale: { from: 1, to: 1.025 },
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyLayout, this);
      this.tweens.killAll();
    });

    // Tapping anywhere on the Play Screen starts the round. The Play button is
    // the same action, so the `started` guard keeps it to exactly one launch.
    this.input.on('pointerdown', () => this.start());
    this.playBox.on('pointerdown', () => this.start());
  }

  private buildHero(): void {
    this.glow = this.add.image(0, 0, 'glow').setScale(1.5);
    this.heroBullet = this.add.image(0, 0, 'bullet').setScale(2.4).setRotation(-0.35);

    this.tweens.add({
      targets: this.glow,
      alpha: { from: 0.5, to: 1 },
      scale: { from: 1.3, to: 1.75 },
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    for (let i = 0; i < 5; i++) {
      const kind: CharacterId = i % 3 === 0 ? 'fast' : 'zombie';
      // Placeholder texture until `applyLayout` poses it with the walk pack;
      // when the pack is missing, this shape is all it ever is.
      const image = this.add
        .image(0, 0, kind === 'fast' ? 'enemy_fast' : 'enemy_zombie')
        .setAlpha(0.7);
      this.heroEnemies.push({ image, kind, dx: 0, dy: 1 });
      this.tweens.add({
        targets: image,
        alpha: { from: 0.35, to: 0.9 },
        duration: 700 + i * 90,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Runs the horde's walk cycle, so the Play Screen is a scene and not a still. */
  update(time: number): void {
    const cycle = Math.floor((time / 1000) * WALK_FPS) % WALK_FRAMES;
    for (const enemy of this.heroEnemies) {
      poseCharacter(enemy.image, enemy.kind, enemy.dx, enemy.dy, cycle, Math.atan2(enemy.dy, enemy.dx));
    }
  }

  private start(): void {
    if (this.started) return;
    this.started = true;

    // The first gesture of the session, so the audio context is resumed here
    // or a mobile WebView would keep every cue silent. The music then runs
    // under every scene that follows: it is one engine, owned by the root.
    this.ctx.sound.unlock();
    this.ctx.sound.ui();
    this.ctx.sound.startMusic();

    // The bridge was verified before any game code ran; this is the one moment
    // the host is told the player actually pressed Play (AGENTS.md A4.2).
    this.ctx.host.launch();
    this.scene.start('Game', { ctx: this.ctx });
  }

  /** Repositions everything for the current screen size (edge-to-edge). */
  private applyLayout(): void {
    const { width, height } = this.scale;
    this.layout = computePlayLayout(width, height);
    const { unit, titleY, subtitleY, hintY, heroY, playY } = this.layout;

    // `setSize`, not `setDisplaySize`: the pattern must keep its world scale,
    // or a resize would stretch the ground tiles off-square.
    this.floor?.setPosition(width / 2, height / 2).setSize(width, height);

    this.title
      ?.setPosition(width / 2, titleY)
      .setFontSize(Math.max(44, 76 * unit));
    this.subtitle
      ?.setPosition(width / 2, subtitleY)
      .setFontSize(Math.max(44, 76 * unit));
    this.hint
      ?.setPosition(width / 2, hintY)
      .setFontSize(Math.max(14, 17 * unit))
      .setWordWrapWidth(width * 0.82);

    this.glow?.setPosition(width / 2, heroY);
    this.heroBullet?.setPosition(width / 2, heroY);

    const radius = Math.min(width * 0.34, 150 * unit) + 40 * unit;
    this.heroEnemies.forEach((enemy, i) => {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = width / 2 + Math.cos(angle) * radius;
      const y = heroY + Math.sin(angle) * radius * 0.6;
      enemy.image.setPosition(x, y);
      // The horde faces inwards: this is the ring, and the hero is the target.
      enemy.dx = width / 2 - x;
      enemy.dy = heroY - y;
      poseCharacter(enemy.image, enemy.kind, enemy.dx, enemy.dy, 0, Math.atan2(enemy.dy, enemy.dx));
    });

    // Recut first: the plank is the button's size, so a resize changes the
    // texture as well as where the button stands.
    this.cutPlayPlank();
    this.playBox?.setPosition(width / 2, playY);
    this.playLabel
      ?.setPosition(width / 2, playY)
      .setFontSize(Math.max(22, 30 * unit));
  }

  /**
   * Cuts the Play button's plank to the button's size, then points the button
   * at it: a recut replaces the texture, and an image keeps the frame it was
   * built with, so without re-resolving it would draw the plank it started
   * from - at the new size, which is worse than not resizing at all.
   */
  private cutPlayPlank(): void {
    const { width } = this.scale;
    const { unit } = this.layout;
    const w = Math.min(width - 80 * unit, 250 * unit);
    const h = 66 * unit;
    bakePlank(this, PLAY_PLANK, w, h, {
      color: CYAN_HEX,
      width: Math.round(6 * unit),
    });
    // The recut resized the plank, so the button has to be re-pointed at the
    // new texture: an image keeps the frame it was built with. Its hit area is
    // a rectangle measured once, at `setInteractive()` - without this the
    // button would be drawn bigger than it is tappable.
    this.playBox?.setTexture(PLAY_PLANK);
    if (this.playBox?.input) this.playBox.input.hitArea.setSize(w, h);
  }
}
