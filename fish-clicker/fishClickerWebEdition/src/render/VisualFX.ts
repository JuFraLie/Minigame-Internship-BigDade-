export const anim = {
  gameTime: 0,
  tapScale: 1.0,
};

export function updateAnimation(delta: number): void {
  anim.gameTime += delta;
  if (anim.tapScale > 1.0) {
    anim.tapScale = Math.max(1.0, anim.tapScale - delta * 5.0);
  }
}

export function triggerTapBounce(): void {
  anim.tapScale = 1.2;
}
