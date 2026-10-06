import Phaser from 'phaser';
import type { GameEventsPort } from '../../ports/GameEventsPort.ts';
import type { SceneContextPort } from '../../ports/SceneContextPort.ts';
import type { SessionPort } from '../../ports/SessionPort.ts';
import type {
  ClashTiedEvent,
  EnemyDefeatedEvent,
  HeartLostEvent,
  RunEndedEvent,
  Sign,
  SignRevealedEvent,
} from '../../core/types.ts';
import { SIGNS } from '../../core/RpsRules.ts';
import { CARD_W, computeGameLayout, type GameLayout } from '../layout/Layout.ts';
import { generateTextures } from '../art/TextureGenerator.ts';
import { GameFx } from '../fx/GameFx.ts';
import { GameHud } from '../hud/GameHud.ts';
import { RevealTimeline, TIMING } from '../reveal/RevealTimeline.ts';

/**
 * Gameplay scene — the orchestrator of the rendering world.
 *
 * It owns the stage (background, enemy, cards) and translates what the game
 * world reports into three focused collaborators: `GameHud` shows the state,
 * `GameFx` plays the feedback, and `RevealTimeline` decides when each beat
 * fires. The world itself is reached only through `session`, a bundle of
 * ports — no rule, no clock and no pixel lives on the other side of it.
 */
export class GameScene extends Phaser.Scene {
  private ctx!: SceneContextPort;
  private session!: SessionPort;
  private layout!: GameLayout;
  private hud!: GameHud;
  private fx!: GameFx;
  private timeline!: RevealTimeline;

  // ── Stage ──
  private bg!: Phaser.GameObjects.Image;
  private enemyContainer!: Phaser.GameObjects.Container;
  private glow!: Phaser.GameObjects.Image;
  private enemyImage!: Phaser.GameObjects.Image;
  private badge!: Phaser.GameObjects.Image;
  private cards = new Map<Sign, Phaser.GameObjects.Image>();
  private badgeRestScale = 1;

  // ── Sequencing state ──
  private lastDefeat: EnemyDefeatedEvent | null = null;
  private lastLoss: HeartLostEvent | null = null;
  private nextEnemyPending = false;
  private liftedCard: Phaser.GameObjects.Image | null = null;

  constructor() {
    super('Game');
  }

  init(data: { ctx: SceneContextPort }): void {
    this.ctx = data.ctx;
  }

  create(): void {
    generateTextures(this);

    this.lastDefeat = null;
    this.lastLoss = null;
    this.nextEnemyPending = false;
    this.liftedCard = null;
    this.cards.clear();

    const events: GameEventsPort = {
      onSignRevealed: (event) => this.onSignRevealed(event),
      onEnemyDefeated: (event) => this.onEnemyDefeated(event),
      onHeartLost: (event) => this.onHeartLost(event),
      onClashTied: (event) => this.onClashTied(event),
      onRunEnded: (event) => this.onRunEnded(event),
    };
    this.session = this.ctx.createSession([events]);

    // Creation order is draw order: the stage goes down first, then the HUD
    // sits above the enemy, and the transient effects above everything.
    this.buildStage();
    this.hud = new GameHud(this, this.session.view.getSnapshot().maxHearts);
    this.fx = new GameFx(this);
    this.timeline = new RevealTimeline(this);

    this.applyLayout();

    this.scale.on('resize', this.applyLayout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.session.tap.tapAt(pointer.x, pointer.y, this.layout.cards);
    });

    this.ctx.host.startRound();
  }

  // ── Stage ──────────────────────────────────────────────────────────────────

  private buildStage(): void {
    this.bg = this.add.image(0, 0, 'bg').setOrigin(0.5);

    this.glow = this.add.image(0, 0, 'glow').setOrigin(0.5);
    this.enemyImage = this.add.image(0, 0, 'enemy_0').setOrigin(0.5);
    this.badge = this.add.image(0, 0, 'badge_HIDDEN').setOrigin(0.5);
    this.enemyContainer = this.add.container(0, 0, [this.glow, this.enemyImage, this.badge]);
    this.enemyImage.setTexture(`enemy_${this.ctx.nextEnemyLook()}`);

    for (const sign of SIGNS) {
      this.cards.set(sign, this.add.image(0, 0, `card_${sign}`).setOrigin(0.5));
    }
  }

  /** Positions (and repositions, on resize) every element of the stage. */
  private applyLayout(): void {
    const { width, height } = this.scale;
    this.layout = computeGameLayout(width, height);
    const { enemy, cards } = this.layout;

    this.bg.setPosition(width / 2, height / 2).setDisplaySize(width, height);

    this.enemyContainer.setPosition(enemy.center.x, enemy.center.y);
    this.glow.setScale((enemy.radius * 4.6) / 256);
    this.enemyImage.setScale((enemy.radius * 2) / 200);
    this.badgeRestScale = (enemy.radius * 0.95) / 150;
    this.badge.setScale(this.badgeRestScale);
    // Held low, so the character's face stays visible behind the card.
    this.badge.setPosition(0, enemy.radius * 0.52);

    for (const region of cards.regions) {
      const card = this.cards.get(region.sign);
      if (!card) continue;
      card
        .setPosition(region.x + region.width / 2, region.y + region.height / 2)
        .setScale(region.width / CARD_W);
    }

    this.hud.applyLayout(this.layout);
    this.fx.applyLayout(this.layout);
  }

  // ── Game world events ──────────────────────────────────────────────────────

  private onSignRevealed(event: SignRevealedEvent): void {
    this.ctx.sfx.tap();
    const card = this.cards.get(event.playerSign);
    if (card) {
      this.liftedCard = card;
      this.fx.liftCard(card);
    }

    this.timeline.schedule({
      onBeat: () => {
        this.ctx.sfx.reveal();
        this.fx.flipBadge(this.badge, `badge_${event.enemySign}`, this.badgeRestScale);
      },
      // Nothing on the HUD changes before this point, so the flip stays a
      // genuine reveal.
      onOutcome: () => this.showOutcome(event),
      onBannerEnd: () => this.hud.hideResult(),
      onResolve: () => this.resolve(),
    });
  }

  private onEnemyDefeated(event: EnemyDefeatedEvent): void {
    this.lastDefeat = event;
    this.nextEnemyPending = true;
  }

  private onHeartLost(event: HeartLostEvent): void {
    this.lastLoss = event;
  }

  private onClashTied(_event: ClashTiedEvent): void {
    // Nothing changes — feedback only, played in showOutcome().
  }

  private onRunEnded(event: RunEndedEvent): void {
    this.ctx.sfx.gameOver();
    this.time.delayedCall(TIMING.PANEL_DELAY_MS, () => {
      this.scene.start('GameOver', {
        ctx: this.ctx,
        score: event.score,
        bestStreak: event.bestStreak,
      });
    });
  }

  // ── Reveal ─────────────────────────────────────────────────────────────────

  private showOutcome(event: SignRevealedEvent): void {
    this.hud.showResult(event.result);

    if (event.result === 'WIN') {
      const defeat = this.lastDefeat;
      this.hud.applyWin(defeat);
      this.ctx.sfx.win(defeat ? defeat.streak : 1);
      this.fx.flashWin();
      this.fx.popEnemy(this.enemyContainer);
      if (defeat) this.fx.floatPoints(defeat.points, defeat.multiplier);
    } else if (event.result === 'LOSE') {
      const heartsLeft = this.lastLoss ? this.lastLoss.heartsLeft : 0;
      this.hud.applyLoss(heartsLeft);
      this.ctx.sfx.lose();
      this.fx.shakeLose();
      this.hud.breakHeart(heartsLeft);
    } else {
      this.ctx.sfx.tie();
      this.fx.burstSparks();
    }
  }

  /** Finish the reveal and hand control back to the game world. */
  private resolve(): void {
    this.lowerCard();
    this.hud.hideResult();
    this.session.reveal.completeReveal();

    const snapshot = this.session.view.getSnapshot();
    if (snapshot.phase === 'ENDED') return; // onRunEnded already queued the panel

    if (this.nextEnemyPending) {
      this.nextEnemyPending = false;
      this.spawnEnemy();
    } else {
      // Same enemy, new secret pick.
      this.fx.flipBadge(this.badge, 'badge_HIDDEN', this.badgeRestScale);
    }
    this.lastDefeat = null;
    this.lastLoss = null;
  }

  private lowerCard(): void {
    const card = this.liftedCard;
    if (!card) return;
    this.liftedCard = null;
    const region = this.layout.cards.regions.find((r) => this.cards.get(r.sign) === card);
    if (!region) return;
    this.fx.lowerCard(card, region.y + region.height / 2);
  }

  private spawnEnemy(): void {
    this.fx.flipBadge(this.badge, 'badge_HIDDEN', this.badgeRestScale);
    this.enemyImage.setTexture(`enemy_${this.ctx.nextEnemyLook()}`);
    this.fx.spawnIn(this.enemyContainer);
  }
}
