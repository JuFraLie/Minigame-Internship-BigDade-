import { images } from '../AssetManager';
import { areaList } from '../../config/FishData';
import { buttons, LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../config/LayoutConfig';
import { state, Status } from '../../core/GameState';
import { getUpgradeCost } from '../../core/FishingMechanics';
import { roundDuration } from '../../config/GameConfig';
import { anim } from '../VisualFX';

export function setLastMessage(msg: string, color: string, timer: number): void {
  state.lastCatchMessage = msg;
  state.lastCatchColor = color;
  state.catchMessageTimer = timer;
}

export function drawHUD(ctx: CanvasRenderingContext2D): void {
  ctx.textBaseline = "top";

  // Area (Top Left)
  ctx.textAlign = "left";
  ctx.font = "14px Minecraft, sans-serif";
  ctx.fillStyle = "#CCC";
  ctx.fillText(areaList[state.currentArea].name, 10, 15);

  // Time (Top Right)
  ctx.textAlign = "right";
  ctx.fillStyle = state.gameTimeLeft < 30 ? "#FF5555" : "#CCC";
  const mins = Math.floor(state.gameTimeLeft / 60);
  const secs = Math.floor(state.gameTimeLeft % 60).toString().padStart(2, '0');
  ctx.fillText(`Time: ${mins}:${secs}`, 350, 15);

  // Score (Center)
  ctx.textAlign = "center";
  ctx.font = "22px Minecraft, sans-serif";
  ctx.fillStyle = "#FFF";
  ctx.fillText(`Score: ${state.score}`, 180, 15);

  // Combo / Frenzy
  if (state.frenzyActive) {
    ctx.fillStyle = "#00FFFF";
    ctx.font = "16px Minecraft, sans-serif";
    ctx.fillText(`FRENZY! ${Math.ceil(state.frenzyTimeLeft)}s`, 180, 45);
  } else if (state.comboCount > 0) {
    ctx.fillStyle = "#FFA500";
    ctx.font = "14px Minecraft, sans-serif";
    ctx.fillText(`Combo: ${state.comboCount}/5`, 180, 45);
  }
}

export function drawProgressBar(ctx: CanvasRenderingContext2D): void {
  const barW = 16;
  const barH = 150;
  const barX = 334;
  const barY = 80;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(barX, barY, barW, barH);

  if (state.status === Status.BITING) {
    const p = Math.min(1.0, state.progress / state.maxProgress);
    let barColor = "#00FF00";
    if (state.progress < 30) barColor = "#FF0000";
    else if (state.progress < 60) barColor = "#FFA500";

    const fillH = barH * p;
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);
  }
}

export function drawCatchMessage(ctx: CanvasRenderingContext2D): void {
  if (state.catchMessageTimer <= 0) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "18px Minecraft, sans-serif";

  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineJoin = "round";
  ctx.strokeText(state.lastCatchMessage, 180, 200);

  ctx.fillStyle = state.lastCatchColor;
  ctx.fillText(state.lastCatchMessage, 180, 200);
}

export function drawBottomButtons(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Upgrade Button
  if (images.button.complete) {
    ctx.drawImage(images.button, buttons.upgrade.x, buttons.upgrade.y, buttons.upgrade.w, buttons.upgrade.h);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(buttons.upgrade.x, buttons.upgrade.y, buttons.upgrade.w, buttons.upgrade.h);
  }
  ctx.fillStyle = "#FFF";
  ctx.font = "16px Minecraft, sans-serif";
  ctx.fillText("UPGRADE", buttons.upgrade.x + buttons.upgrade.w / 2, buttons.upgrade.y + 25);
  ctx.font = "12px Minecraft, sans-serif";
  ctx.fillStyle = "#CCC";
  ctx.fillText(`Lv ${state.upgradeLevel + 1} | Cost: ${getUpgradeCost(state.upgradeLevel)}`, buttons.upgrade.x + buttons.upgrade.w / 2, buttons.upgrade.y + 55);

  // Next Area Button
  if (images.button.complete) {
    ctx.drawImage(images.button, buttons.nextArea.x, buttons.nextArea.y, buttons.nextArea.w, buttons.nextArea.h);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(buttons.nextArea.x, buttons.nextArea.y, buttons.nextArea.w, buttons.nextArea.h);
  }

  const nextIdx = (state.currentArea + 1) % areaList.length;
  let nextScoreText = state.currentArea === areaList.length - 1 ? "MAX" : areaList[nextIdx].scoreUnlock.toString();

  ctx.fillStyle = "#FFF";
  ctx.font = "16px Minecraft, sans-serif";
  ctx.fillText("NEXT AREA", buttons.nextArea.x + buttons.nextArea.w / 2, buttons.nextArea.y + 25);
  ctx.font = "12px Minecraft, sans-serif";
  ctx.fillStyle = "#CCC";
  ctx.fillText(`Req: ${nextScoreText}`, buttons.nextArea.x + buttons.nextArea.w / 2, buttons.nextArea.y + 55);
}

export function drawGameOver(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  ctx.fillStyle = "#FFF";
  ctx.textBaseline = "middle";
  ctx.font = "bold 40px Minecraft, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TIME'S UP!", LOGICAL_WIDTH / 2, 200);
  ctx.font = "30px Minecraft, sans-serif";
  ctx.fillText(`Final Score: ${state.score}`, LOGICAL_WIDTH / 2, 260);

  // Restart button
  if (images.button.complete) {
    ctx.drawImage(images.button, buttons.restart.x, buttons.restart.y, buttons.restart.w, buttons.restart.h);
  } else {
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(buttons.restart.x, buttons.restart.y, buttons.restart.w, buttons.restart.h);
  }
  ctx.fillStyle = "#FFF";
  ctx.font = "24px Minecraft, sans-serif";
  ctx.fillText("Restart", buttons.restart.x + buttons.restart.w / 2, buttons.restart.y + buttons.restart.h / 2);

  // Exit button
  if (images.button.complete) {
    ctx.drawImage(images.button, buttons.exit.x, buttons.exit.y, buttons.exit.w, buttons.exit.h);
  } else {
    ctx.fillStyle = "#F44336";
    ctx.fillRect(buttons.exit.x, buttons.exit.y, buttons.exit.w, buttons.exit.h);
  }
  ctx.fillStyle = "#FFF";
  ctx.fillText("Exit", buttons.exit.x + buttons.exit.w / 2, buttons.exit.y + buttons.exit.h / 2);
}

export function drawTopBar(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, 360, 70);
}

/** Title screen shown before the first round starts (press to start). */
export function drawStartScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";

  // Title
  ctx.font = "bold 40px Minecraft, sans-serif";
  ctx.strokeText("FISH CLICKER", LOGICAL_WIDTH / 2, 190);
  ctx.fillStyle = "#FFD54A";
  ctx.fillText("FISH CLICKER", LOGICAL_WIDTH / 2, 190);

  // Blinking "press to start" prompt, drawn on the standard button
  const blink = 0.55 + 0.45 * Math.sin(anim.gameTime * 4.0);
  ctx.globalAlpha = blink;
  if (images.button.complete && images.button.naturalWidth > 0) {
    ctx.drawImage(images.button, buttons.start.x, buttons.start.y, buttons.start.w, buttons.start.h);
  } else {
    ctx.fillStyle = "#2E7D32";
    ctx.fillRect(buttons.start.x, buttons.start.y, buttons.start.w, buttons.start.h);
  }
  ctx.font = "22px Minecraft, sans-serif";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 4;
  ctx.strokeText("PRESS TO START", LOGICAL_WIDTH / 2, buttons.start.y + buttons.start.h / 2);
  ctx.fillStyle = "#FFF";
  ctx.fillText("PRESS TO START", LOGICAL_WIDTH / 2, buttons.start.y + buttons.start.h / 2);
  ctx.globalAlpha = 1;

  // Hints
  const mins = Math.floor(roundDuration / 60);
  const secs = (roundDuration % 60).toString().padStart(2, '0');
  ctx.font = "14px Minecraft, sans-serif";
  ctx.fillStyle = "#CCC";
  ctx.fillText("Tap START", LOGICAL_WIDTH / 2, 400);
  ctx.fillText(`Catch as many fish as you can in ${mins}:${secs}!`, LOGICAL_WIDTH / 2, 424);
}
