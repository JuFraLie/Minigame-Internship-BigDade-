export type Bounds = { x: number; y: number; w: number; h: number };

export function inBounds(x: number, y: number, b: Bounds): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
