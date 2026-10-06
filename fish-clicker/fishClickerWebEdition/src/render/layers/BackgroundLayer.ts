import { images } from '../AssetManager';
import { anim } from '../VisualFX';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../config/LayoutConfig';

export function drawBackground(ctx: CanvasRenderingContext2D, currentArea: number): void {
  let activeBg = images.bg1;
  if (currentArea === 1) activeBg = images.bg2;
  if (currentArea === 2) activeBg = images.bg3;

  if (activeBg.complete && activeBg.naturalWidth > 0) {
    ctx.drawImage(activeBg, 180 - activeBg.naturalWidth / 2, 320 - activeBg.naturalHeight / 2);
  } else {
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }
}

export function drawFisherman(ctx: CanvasRenderingContext2D): void {
  if (images.fisherman.complete && images.fisherman.naturalWidth > 0) {
    const waveOffsetY = Math.sin(anim.gameTime * 1.5) * 2.0;
    const waveOffsetX = Math.cos(anim.gameTime * 1.0) * 1.5;
    ctx.drawImage(
      images.fisherman,
      167 - images.fisherman.naturalWidth / 2 + waveOffsetX,
      126 - images.fisherman.naturalHeight / 2 + waveOffsetY
    );
  }
}

export function drawGlassOverlay(ctx: CanvasRenderingContext2D): void {
  if (images.glass.complete && images.glass.naturalWidth > 0) {
    ctx.drawImage(images.glass, 180 - images.glass.naturalWidth / 2, 460 - images.glass.naturalHeight / 2);
  }
}
