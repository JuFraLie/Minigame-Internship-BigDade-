/**
 * Uniform-grid spatial hash for the enemy field.
 *
 * The world asks "which enemies are near here" on every fixed step - for the
 * auto-fire target, for each bullet segment and for the player's contact test.
 * A linear scan of 150 enemies x 30 steps/s would already be cheap, but the
 * hash keeps that cost flat if the cap is ever raised, and it keeps the hot
 * paths free of per-step allocations.
 *
 * Entries are linked through a pre-allocated table, so `clear()` is a fill and
 * `insert()` never allocates. The hash is deliberately dumb: it answers "which
 * ids live in the cells overlapping this box", and the caller does the precise
 * distance test against the entity it actually owns.
 */
export class SpatialHash {
  private static readonly TABLE = 2048;
  private static readonly MASK = SpatialHash.TABLE - 1;

  private readonly bucketHead: Int32Array;
  private readonly entryNext: Int32Array;
  private readonly entryId: Int32Array;
  private readonly cellSize: number;
  private entryCount = 0;

  /** @param cellSize bucket edge in world units; @param capacity max entries */
  constructor(cellSize: number, capacity: number) {
    this.cellSize = cellSize;
    this.bucketHead = new Int32Array(SpatialHash.TABLE).fill(-1);
    this.entryNext = new Int32Array(capacity);
    this.entryId = new Int32Array(capacity);
  }

  get entries(): number {
    return this.entryCount;
  }

  clear(): void {
    this.bucketHead.fill(-1);
    this.entryCount = 0;
  }

  insert(id: number, x: number, y: number): void {
    const bucket = this.bucket(x, y);
    const index = this.entryCount;
    if (index >= this.entryId.length) return; // caller respects the entity cap
    this.entryNext[index] = this.bucketHead[bucket];
    this.entryId[index] = id;
    this.bucketHead[bucket] = index;
    this.entryCount = index + 1;
  }

  /**
   * Appends every id stored in the cells overlapping the axis-aligned box to
   * `out`, then returns it. `out` is reused by the caller, so no allocation
   * happens once it has grown to its usual size.
   *
   * The answer is a *candidate* set: cells that share a bucket can contribute
   * an id twice or contribute an id stored elsewhere, so callers always filter
   * by precise distance and by their own liveness flag.
   */
  queryBox(minX: number, minY: number, maxX: number, maxY: number, out: number[]): number[] {
    const cell = this.cellSize;
    const x0 = Math.floor(minX / cell);
    const x1 = Math.floor(maxX / cell);
    const y0 = Math.floor(minY / cell);
    const y1 = Math.floor(maxY / cell);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let index = this.bucketHead[this.hash(cx, cy)];
        while (index !== -1) {
          out.push(this.entryId[index]);
          index = this.entryNext[index];
        }
      }
    }
    return out;
  }

  /** Cells overlapping a circle - the contact and magnet tests. */
  queryCircle(x: number, y: number, radius: number, out: number[]): number[] {
    return this.queryBox(x - radius, y - radius, x + radius, y + radius, out);
  }

  private bucket(x: number, y: number): number {
    return this.hash(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  /** Finalisation-hash style mixing, masked down to the table size. */
  private hash(cx: number, cy: number): number {
    const h = Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663);
    return (h ^ (h >>> 15)) & SpatialHash.MASK;
  }
}
