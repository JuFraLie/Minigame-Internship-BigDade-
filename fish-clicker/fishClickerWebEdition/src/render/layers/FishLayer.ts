import { getFishImage } from '../AssetManager';
import { anim } from '../VisualFX';
import { Fish } from '../../config/FishData';
import { Status } from '../../core/GameState';
import { LOGICAL_WIDTH } from '../../config/LayoutConfig';

export function drawFish(ctx: CanvasRenderingContext2D, status: Status, currentFish: Fish | null): void {
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "center";
  ctx.font = "20px Minecraft, sans-serif";

  if (status !== Status.BITING) {
    ctx.fillText("Waiting...", LOGICAL_WIDTH / 2, 400);
    return;
  }

  const fishImg = currentFish ? getFishImage(currentFish.name) : null;
  if (fishImg && fishImg.complete && fishImg.naturalWidth > 0) {
    const baseScale = 6.0;
    const finalScale = baseScale * anim.tapScale;
    const fw = fishImg.naturalWidth;
    const fh = fishImg.naturalHeight;

    const fishBob = Math.sin(anim.gameTime * 6.0) * 12.0;
    const fishWiggle = Math.cos(anim.gameTime * 8.0) * 0.15;

    ctx.save();
    ctx.translate(LOGICAL_WIDTH / 2, 350 + fishBob);
    ctx.rotate(fishWiggle);
    ctx.scale(finalScale, finalScale);
    ctx.drawImage(fishImg, -fw / 2, -fh / 2);
    ctx.restore();

    ctx.fillText("TAP!", LOGICAL_WIDTH / 2, 470);
  } else {
    ctx.fillText("TAP SCREEN!", LOGICAL_WIDTH / 2, 400);
  }

  // Bite indicator
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "24px Minecraft, sans-serif";
  ctx.fillText("!", 167 + 11 + 20, 126 - 30);
}
