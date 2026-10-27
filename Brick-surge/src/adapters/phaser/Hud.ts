/**
 * The in-round HUD: the tinted top band with score, wave and ball count, plus
 * the combo readout, the wave banner and the serve countdown.
 *
 * Split out of PhaserRenderer so the world renderer only ever draws world
 * sprites (separation of concerns). This module assembles and refreshes the
 * HUD and nothing else: where each element goes comes from ./layout.ts,
 * colours and fonts from ./theme.ts, the band itself is drawn by ./ui.ts.
 * All positions are design units — the camera zoom handles the density.
 */

import type Phaser from 'phaser';
import type { WorldSnapshot } from '../../domain/types.ts';
import { hudLayout } from './layout.ts';
import { FONT, THEME } from './theme.ts';
import { hudBand } from './ui.ts';
import type { Viewport } from './viewport.ts';

export class Hud {
    private readonly scene: Phaser.Scene;

    private bandImage: Phaser.GameObjects.Image | null = null;
    private scoreText!: Phaser.GameObjects.Text;
    private waveText!: Phaser.GameObjects.Text;
    private ballText!: Phaser.GameObjects.Text;
    private comboText!: Phaser.GameObjects.Text;
    private bannerText!: Phaser.GameObjects.Text;
    private serveText!: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** Build every HUD element for the given viewport. */
    create(viewport: Viewport): void {
        const s = this.scene;
        const hud = hudLayout(viewport);

        const style: Phaser.Types.GameObjects.Text.TextStyle = {
            fontFamily: FONT,
            fontSize: `${hud.fontSize}px`,
        };

        // Three colours across the HUD row: gold score, sky wave, green balls.
        this.scoreText = s.add.text(hud.scoreX, 0, '0', {
            ...style,
            color: THEME.score,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.waveText = s.add.text(hud.waveX, 0, 'Wave 1', {
            ...style,
            color: THEME.wave,
        }).setOrigin(0.5);
        this.ballText = s.add.text(hud.ballsX, 0, '● 1', {
            ...style,
            color: THEME.balls,
            fontStyle: 'bold',
        }).setOrigin(1, 0.5);

        const bigStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...style,
            fontSize: `${hud.bigSize}px`,
            fontStyle: 'bold',
        };
        this.bannerText = s.add.text(hud.waveX, hud.bannerY, '', {
            ...bigStyle,
            color: THEME.banner,
            stroke: THEME.bannerStroke,
            strokeThickness: Math.max(3, Math.round(viewport.width * 0.014)),
        }).setOrigin(0.5).setVisible(false);

        this.serveText = s.add.text(hud.waveX, hud.serveY, '', {
            ...bigStyle,
            color: THEME.serve,
            stroke: THEME.serveStroke,
            strokeThickness: Math.max(3, Math.round(viewport.width * 0.01)),
        }).setOrigin(0.5).setVisible(false);

        this.comboText = s.add.text(hud.waveX, 0, '', {
            ...style,
            fontSize: `${hud.comboSize}px`,
            fontStyle: 'bold',
            color: THEME.combo,
            stroke: THEME.comboStroke,
            strokeThickness: Math.max(2, Math.round(viewport.width * 0.007)),
        }).setOrigin(0.5).setVisible(false);

        this.layout(viewport);
    }

    /** Reposition everything for the viewport — rebuilt when the window moves. */
    layout(viewport: Viewport): void {
        const hud = hudLayout(viewport);

        this.bandImage?.destroy();
        this.bandImage = hudBand(this.scene, viewport.width, hud.bandHeight);

        this.scoreText?.setPosition(hud.scoreX, hud.rowY);
        this.waveText?.setPosition(hud.waveX, hud.rowY);
        this.ballText?.setPosition(hud.ballsX, hud.rowY);
        this.comboText?.setPosition(hud.waveX, hud.comboY);
        this.bannerText?.setPosition(hud.waveX, hud.bannerY);
        this.serveText?.setPosition(hud.waveX, hud.serveY);
    }

    /** Update the readouts from the frame's snapshot. */
    render(snap: WorldSnapshot): void {
        this.scoreText.setText(String(snap.score));
        this.ballText.setText('● ' + Math.max(0, snap.ballCount));
        this.waveText.setText(`Wave ${snap.wave}`);

        this.comboText.setVisible(snap.combo > 1);
        if (snap.combo > 1) this.comboText.setText(`x${snap.combo}`);

        if (snap.phase === 'banner') {
            this.bannerText.setVisible(true).setText(`Wave ${snap.wave + 1}`);
        } else {
            this.bannerText.setVisible(false);
        }
        if (snap.phase === 'serving' && snap.timerSeconds > 0.05) {
            this.serveText.setVisible(true).setText(String(Math.ceil(snap.timerSeconds)));
        } else {
            this.serveText.setVisible(false);
        }
    }

    /** Remove every HUD element (a viewport change rebuilds it from scratch). */
    destroy(): void {
        this.bandImage?.destroy();
        this.bandImage = null;
        for (const text of [
            this.scoreText, this.waveText, this.ballText,
            this.comboText, this.bannerText, this.serveText,
        ]) {
            text?.destroy();
        }
    }
}
