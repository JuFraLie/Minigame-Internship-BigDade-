import Phaser from 'phaser';
import type { Rarity, UpgradeId } from '../../core/types.ts';
import { upgradeDef, type UpgradeDef } from '../../core/rules.ts';
import type { RenderPort } from '../../ports/RenderPort.ts';
import type { UpgradePort } from '../../ports/UpgradePort.ts';
import type { OverlayLayout } from '../layout/Layout.ts';
import { AMBER_HEX, CARD_HEX, CARD_STROKE_HEX, CORAL_HEX, CYAN_HEX, INK, INK_HEX, LIME_HEX, MOSS_HEX, PAPER, PAPER_HEX, SLATE, VIOLET_HEX } from '../palette.ts';
import { PANEL_BAND, woodPanelKey } from '../art/PanelArt.ts';
import { FONT_BODY, FONT_HEAD } from '../fonts.ts';

const DEPTH = 30;

/** A left-edge accent so the three cards are distinguishable at a glance. */
const ACCENT: Readonly<Record<UpgradeId, number>> = {
  extraChamber: AMBER_HEX,
  quickHands: CYAN_HEX,
  longBarrel: CYAN_HEX,
  magnet: LIME_HEX,
  sprint: CYAN_HEX,
  mend: PAPER_HEX,
  heavyRound: AMBER_HEX,
  quickLearner: LIME_HEX,
  grit: CORAL_HEX,
  boomerang: VIOLET_HEX,
  shockwave: AMBER_HEX,
  explosive: AMBER_HEX,
  secondWind: CYAN_HEX,
  bloodFrenzy: CORAL_HEX,
  homing: CYAN_HEX,
  thorns: MOSS_HEX,
  dread: VIOLET_HEX,
};

/**
 * Rarity is the reason a card feels like a pull (Game Design Document, section
 * 7), so anything that is not a plain Common gets a tag: gold for a Legendary,
 * violet for a Super Rare. Commons stay unlabelled to keep the three slots
 * readable at a glance.
 */
const RARITY_TAG: Readonly<Record<Rarity, { label: string; hex: number } | null>> = {
  common: null,
  superRare: { label: 'SUPER RARE', hex: VIOLET_HEX },
  legendary: { label: 'LEGENDARY', hex: AMBER_HEX },
};

/**
 * The level-up overlay: three cards, tap one, the round resumes.
 *
 * It offers no restart and no exit, and it swallows every tap that is not a
 * card, so a stray thumb cannot drag the player while the simulation is frozen.
 * The scene drives it purely by reading `frame.offers` - open when there is
 * one, closed when there is not - so this class never needs a callback.
 */
export class LevelUpOverlay {
  private readonly scene: Phaser.Scene;
  private readonly upgrades: UpgradePort;
  private readonly render: RenderPort;

  private layout: OverlayLayout;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private open = false;

  constructor(
    scene: Phaser.Scene,
    upgrades: UpgradePort,
    render: RenderPort,
    layout: OverlayLayout,
  ) {
    this.scene = scene;
    this.upgrades = upgrades;
    this.render = render;
    this.layout = layout;
  }

  isOpen(): boolean {
    return this.open;
  }

  show(offers: readonly UpgradeId[]): void {
    if (this.open || offers.length === 0) return;
    this.open = true;
    this.renderCards(offers);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    for (const object of this.objects) object.destroy();
    this.objects = [];
  }

  /** Rebuilds in place when the screen is rotated mid-choice. */
  applyLayout(layout: OverlayLayout): void {
    this.layout = layout;
    if (!this.open) return;

    const offers = this.upgrades.offers();
    this.close();
    if (offers) this.show(offers);
  }

  // -------------------------------------------------------------------------

  private renderCards(offers: readonly UpgradeId[]): void {
    const layout = this.layout;
    const unit = layout.unit;

    // Screen-space, like the HUD: the camera keeps following the player
    // behind the frozen round, so world coordinates would push the cards off
    // the display as soon as he had walked away from the origin.
    this.add(
      this.scene.add
        .rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, INK_HEX, 0.88)
        .setScrollFactor(0)
        .setDepth(DEPTH)
        .setInteractive(),
    );

    this.add(
      this.scene.add
        .text(layout.width / 2, layout.titleY, 'LEVEL UP', {
          fontFamily: FONT_HEAD,
          fontSize: `${Math.max(26, 40 * unit)}px`,
          color: PAPER,
          stroke: '#0b0f1a',
          strokeThickness: 6,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    this.add(
      this.scene.add
        .text(layout.width / 2, layout.titleY + 34 * unit, 'Pick one', {
          fontFamily: FONT_BODY,
          fontSize: `${Math.max(12, 15 * unit)}px`,
          color: SLATE,
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );

    offers.forEach((id, index) => this.renderCard(id, index));
  }

  private renderCard(id: UpgradeId, index: number): void {
    const layout = this.layout;
    const unit = layout.unit;
    const def = upgradeDef(id);
    const top = layout.cardsY + index * (layout.cardH + layout.cardGap);
    const centreX = layout.cardX + layout.cardW / 2;
    const centreY = top + layout.cardH / 2;

    // The plank is what the text below is laid out against: every label sits
    // on a band of it rather than at a hard-coded offset, so the card keeps
    // its shape on any screen. Should no plank ever be cut, the card falls
    // back to the flat rectangle it used before, and those same bands are
    // still sensible places for the lines to go.
    const panel = woodPanelKey(this.scene);
    const box: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = panel
      ? this.scene.add
          .image(centreX, centreY, panel)
          .setDisplaySize(layout.cardW, layout.cardH)
      : this.scene.add
          .rectangle(centreX, centreY, layout.cardW, layout.cardH, CARD_HEX, 1)
          .setStrokeStyle(Math.max(2, Math.round(2 * unit)), CARD_STROKE_HEX, 1);

    box
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setInteractive({ useHandCursor: true });

    this.add(box);
    this.add(
      this.scene.add
        .rectangle(layout.cardX, top, 6 * unit, layout.cardH, ACCENT[id], 1)
        .setOrigin(0, 0)
        // A carved edge around the stripe: it is the card's colour cue, and
        // the pale accents (a heal's white, say) would sink into pale timber.
        .setStrokeStyle(Math.max(1, Math.round(2 * unit)), INK_HEX, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );

    this.add(
      this.scene.add
        .text(layout.cardX + 20 * unit, top + layout.cardH * PANEL_BAND.header, def.name, {
          fontFamily: FONT_HEAD,
          fontSize: `${Math.max(15, 19 * unit)}px`,
          // Ink, not white: the old title sat on a dark stain, and on the
          // light theme's mid-toned board white would disappear.
          color: INK,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );

    this.add(
      this.scene.add
        .text(layout.cardX + 20 * unit, top + layout.cardH * PANEL_BAND.body, def.blurb, {
          fontFamily: FONT_BODY,
          fontSize: `${Math.max(12, 15 * unit)}px`,
          // The field is the palest board on the card, so its text can go as
          // dark as the palette allows.
          color: INK,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2),
    );

    const label = stackLabel(def, this.render.getFrame().stacks[id]);
    if (label) {
      this.add(
        this.scene.add
          .text(layout.cardX + layout.cardW - 18 * unit, top + layout.cardH * PANEL_BAND.header, label, {
            fontFamily: FONT_HEAD,
            fontSize: `${Math.max(13, 16 * unit)}px`,
            // Ink rather than the accent: bright colours wash out on pale
            // wood. The stripe carries the card's colour instead.
            color: INK,
          })
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH + 2),
      );
    }

    // Rarity is only worth shouting about when it is not a Common.
    const rarity = RARITY_TAG[def.rarity];
    if (rarity) {
      this.add(
        this.scene.add
          .text(
            layout.cardX + layout.cardW - 18 * unit,
            top + layout.cardH * PANEL_BAND.footer,
            rarity.label,
            {
              fontFamily: FONT_HEAD,
              fontSize: `${Math.max(11, 13 * unit)}px`,
              color: `#${rarity.hex.toString(16).padStart(6, '0')}`,
              stroke: INK,
              strokeThickness: 4,
            },
          )
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(DEPTH + 2),
      );
    }

    box.on('pointerdown', () => {
      // A stale or duplicated tap must never take a card twice.
      if (!this.upgrades.choose(id)) return;
      this.close();
    });

    // A gentle press so the choice feels answered before it takes effect.
    box.on('pointerover', () => box.setScale(1.01));
    box.on('pointerout', () => box.setScale(1));
  }

  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }
}

/** `3 / 4` for capped cards, `x2` once a repeatable has been taken. */
const stackLabel = (def: UpgradeDef, current: number): string => {
  if (def.max === Infinity) return current > 0 ? `x${current}` : '';
  return `${current} / ${def.max}`;
};
