import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../config/LayoutConfig';
import { state, Status } from '../core/GameState';
import { drawBackground, drawFisherman, drawGlassOverlay } from './layers/BackgroundLayer';
import { drawFish } from './layers/FishLayer';
import { drawHUD, drawProgressBar, drawCatchMessage, drawBottomButtons, drawGameOver, drawTopBar, drawStartScreen } from './layers/UILayer';

export function render(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  drawBackground(ctx, state.currentArea);
  drawFisherman(ctx);
  drawGlassOverlay(ctx);

  if (state.status === Status.READY) {
    drawStartScreen(ctx);
    return;
  }

  drawTopBar(ctx);

  if (state.status === Status.GAMEOVER) {
    drawGameOver(ctx);
    return;
  }

  drawHUD(ctx);
  drawProgressBar(ctx);
  drawFish(ctx, state.status, state.currentFish);
  drawCatchMessage(ctx);
  drawBottomButtons(ctx);
}
