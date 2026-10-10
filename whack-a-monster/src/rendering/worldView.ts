import type Phaser from 'phaser';
import { DODGE_DISTANCE, HOLE_COUNT, HOLE_RADIUS } from '../core/config.ts';
import type { FieldPoint } from '../core/config.ts';
import type { MonsterView } from '../core/types.ts';
import { paintGrass } from './backdrop.ts';
import { holeScreenPosition, riseOffset, toScreenLength } from './layout.ts';
import type { Layout } from './layout.ts';
import { addText } from './text.ts';
import { monsterTexture } from './textures.ts';
import type { MonsterArtState } from './textures.ts';

const DEPTH_BACKGROUND = 0;
const DEPTH_HOLE_BACK = 1;
const DEPTH_MONSTER = 2;
const DEPTH_HOLE_FRONT = 3;
const DEPTH_BADGE = 4;

/** Screen units above a monster's centre where its action badge sits. */
const BADGE_OFFSET = HOLE_RADIUS * 1.2;

/** Half the size of a hole opening on screen: the ellipse `drawHoles` paints for it. */
function holeRadii(layout: Layout): { rx: number; ry: number } {
    const scale = layout.field.scale;
    return { rx: HOLE_RADIUS * 1.1 * scale, ry: HOLE_RADIUS * 0.45 * scale };
}

/**
 * Drawing side of gameplay: grass, holes, monster sprites and their action badges.
 *
 * It reads the simulation only through `MonsterView`, converts field coordinates into
 * screen coordinates with `layout.ts`, and never touches game rules. A `WorldView` is the
 * replaceable renderer of the same round a headless test could drive instead (§4.3).
 */
export class WorldView {
    private readonly layout: Layout;
    private readonly background: Phaser.GameObjects.Graphics;
    private readonly holeBack: Phaser.GameObjects.Graphics;
    private readonly holeFront: Phaser.GameObjects.Graphics;
    private readonly sprites: Phaser.GameObjects.Image[] = [];
    private readonly badges: Phaser.GameObjects.Text[] = [];
    private readonly holePositions: FieldPoint[] = [];
    private readonly holeMasks: Phaser.Display.Masks.GeometryMask[] = [];
    private readonly textureCache: string[] = [];
    private readonly flashCache: boolean[] = [];
    private readonly badgeCache: string[] = [];
    /** How far below its rim a monster rests at `rise = 0`, in screen units. */
    private readonly restDepth: number;

    constructor(scene: Phaser.Scene, layout: Layout) {
        this.layout = layout;

        this.background = scene.add.graphics().setDepth(DEPTH_BACKGROUND);
        this.holeBack = scene.add.graphics().setDepth(DEPTH_HOLE_BACK);
        this.holeFront = scene.add.graphics().setDepth(DEPTH_HOLE_FRONT);

        const { ry } = holeRadii(layout);

        for (let hole = 0; hole < HOLE_COUNT; hole++) {
            const position = holeScreenPosition(layout, hole);
            this.holePositions.push(position);
            this.holeMasks.push(createHoleClip(scene, layout, position));

            const sprite = scene.add
                .image(0, 0, monsterTexture('normal', 'alive'))
                .setOrigin(0.5)
                // The art is authored for the play field — a creature is 130 units wide
                // against a 135-unit column pitch — so it is drawn in field units like
                // every other part of the field. At raw pixel size it would be a whole
                // scale factor too large: wider than its own hit reach (which is why a
                // slash across the visible wolf could miss) and wide enough to overlap the
                // neighbouring column on a narrow phone.
                .setScale(layout.field.scale)
                .setDepth(DEPTH_MONSTER)
                .setVisible(false);
            this.sprites.push(sprite);
            this.textureCache.push('');
            this.flashCache.push(false);

            const badge = addText(scene, 0, 0, '', {
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '17px',
                fontStyle: 'bold',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 5,
            })
                .setOrigin(0.5)
                .setDepth(DEPTH_BADGE)
                .setVisible(false);
            this.badges.push(badge);
            this.badgeCache.push('');
        }

        // At `rise = 0` a monster's centre sits on its hole's centre, so its top would
        // already stand above the rim: it would pop into view outside the hole at spawn and
        // pop out of it again once defeated. Starting it `restDepth` lower puts that top
        // exactly on the back rim, so it climbs out of — and drops back into — the hole.
        // `displayHeight`, not `height`: the sprite is laid out in field units, so its
        // on-screen size is the texture size times the field scale.
        this.restDepth = Math.max(0, this.sprites[0].displayHeight / 2 - ry);

        // Hole positions must exist before the static backdrop is painted.
        this.drawGrass();
        this.drawHoles();
    }

    /** Positions and shows one sprite/badge per monster slot. Allocates nothing per frame. */
    sync(monsters: readonly MonsterView[]): void {
        for (const monster of monsters) {
            const hole = monster.hole;
            const sprite = this.sprites[hole];
            const badge = this.badges[hole];

            if (monster.state === 'hidden') {
                if (sprite.visible) {
                    // A monster nobody draws also needs no clipping: dropping the mask here
                    // keeps the clip path off the canvas for the empty hole slots.
                    sprite.clearMask();
                    sprite.setVisible(false);
                }
                if (badge.visible) badge.setVisible(false);
                continue;
            }

            const base = this.holePositions[hole];
            const shake = Math.sin(monster.dodge * Math.PI * 4) * DODGE_DISTANCE;
            const x = base.x + toScreenLength(this.layout, shake);
            // `restDepth` fades out as the monster rises, so it always starts fully below
            // the rim and ends where the simulation puts it — never halfway out of the hole.
            const y = base.y - riseOffset(this.layout, monster.rise) + this.restDepth * (1 - monster.rise);

            if (!sprite.visible) {
                sprite.setMask(this.holeMasks[hole]);
                sprite.setVisible(true);
            }
            sprite.setPosition(x, y);
            sprite.setRotation(monster.state === 'whacked' ? 0.12 : 0);

            // Art per state: a whacked monster shows its death pose, a wounded skeleton
            // shows the cracked skull, everything else shows the living creature.
            const artState: MonsterArtState =
                monster.state === 'whacked'
                    ? 'whacked'
                    : monster.kind === 'armored' && monster.hitsTaken >= 1
                      ? 'hit'
                      : 'alive';
            const key = monsterTexture(monster.kind, artState);
            if (this.textureCache[hole] !== key) {
                sprite.setTexture(key);
                this.textureCache[hole] = key;
            }

            const flashing = monster.flash > 0;
            if (this.flashCache[hole] !== flashing) {
                if (flashing) sprite.setTintFill(0xffffff);
                else sprite.clearTint();
                this.flashCache[hole] = flashing;
            }

            const badgeVisible = (monster.state === 'active' || monster.state === 'emerging') && monster.rise > 0.4;
            if (!badgeVisible) {
                if (badge.visible) badge.setVisible(false);
                continue;
            }

            const badgeKey = `${monster.kind}:${monster.hitsTaken}`;
            if (this.badgeCache[hole] !== badgeKey) {
                badge.setText(badgeLabel(monster));
                badge.setColor(badgeColour(monster.kind));
                this.badgeCache[hole] = badgeKey;
            }
            badge.setPosition(x, y - toScreenLength(this.layout, BADGE_OFFSET)).setVisible(true);
        }
    }

    destroy(): void {
        this.background.destroy();
        this.holeBack.destroy();
        this.holeFront.destroy();
        for (const sprite of this.sprites) {
            sprite.clearMask();
            sprite.destroy();
        }
        for (const badge of this.badges) badge.destroy();
        for (const mask of this.holeMasks) {
            // The clip shapes never join the display list, so nothing else tears them down.
            const shape = mask.geometryMask;
            mask.destroy();
            shape.destroy();
        }
    }

    private drawGrass(): void {
        paintGrass(this.background, this.layout.viewport.width, this.layout.viewport.height);
    }

    private drawHoles(): void {
        const scale = this.layout.field.scale;
        const { rx, ry } = holeRadii(this.layout);

        for (let hole = 0; hole < HOLE_COUNT; hole++) {
            const position = this.holePositions[hole];

            this.holeBack.fillStyle(0x22150a, 1);
            this.holeBack.lineStyle(Math.max(1, 4 * scale), 0x4e342e, 1);
            this.holeBack.fillEllipse(position.x, position.y, rx * 2, ry * 2);
            this.holeBack.strokeEllipse(position.x, position.y, rx * 2, ry * 2);

            this.holeFront.fillStyle(0x5d4037, 1);
            this.holeFront.lineStyle(Math.max(1, 3 * scale), 0x3e2723, 1);
            this.holeFront.fillEllipse(position.x, position.y + 4 * scale, rx * 2, ry * 1.4);
            this.holeFront.strokeEllipse(position.x, position.y + 4 * scale, rx * 2, ry * 1.4);
        }
    }
}

/**
 * Clipping path for one monster: its hole's opening plus the band above the back rim.
 *
 * Below the rim a monster is only ever drawn inside the hole — exactly the ellipse
 * `drawHoles` paints — so it can never spill onto the grass around it while it climbs out
 * or drops back in. Above the rim it is drawn in full, which is what a risen monster needs.
 * The Graphics stays out of the display list on purpose: it is never painted, it only
 * supplies the path the renderer clips with.
 *
 * The order of the two shapes matters: `fillEllipse` starts a new path while `fillRect`
 * only appends to the path already there, so the ellipse comes first and the rectangle,
 * which would otherwise be discarded, comes last.
 */
function createHoleClip(scene: Phaser.Scene, layout: Layout, position: FieldPoint): Phaser.Display.Masks.GeometryMask {
    const { rx, ry } = holeRadii(layout);
    const { width, height } = layout.viewport;

    const shape = scene.make.graphics({ x: 0, y: 0 }, false);
    shape.fillStyle(0xffffff, 1);
    shape.fillEllipse(position.x, position.y, rx * 2, ry * 2);
    shape.fillRect(-width, -height, width * 3, height + position.y - ry);

    return shape.createGeometryMask();
}

function badgeLabel(monster: MonsterView): string {
    if (monster.kind === 'ninja') return 'SWIPE';
    if (monster.kind === 'armored') return monster.hitsTaken >= 1 ? 'TAP x1' : 'TAP x2';
    return 'TAP';
}

function badgeColour(kind: MonsterView['kind']): string {
    if (kind === 'ninja') return '#f06292';
    if (kind === 'armored') return '#ffca28';
    return '#81c784';
}
