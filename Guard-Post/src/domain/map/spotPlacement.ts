import { fitsBesideGateCastle } from '../maps.ts';
import type { Cell, MapParams, Point, Spot } from './types.ts';

/**
 * Build spots for a road: greedy coverage of the tiles the road passes through.
 *
 * A spot is a pad at a grid cell centre that hugs the road — within 1.5 tiles of the
 * nearest road tile, so a level-1 tower (the shortest range is frost at 2.0) covers
 * the enemy for the whole crossing of that tile. Grid distances are 1, sqrt(2), 2 …
 * so 1.5 means "touching the road", and no pad sits further out — not even beside the
 * gate castle, whose footprint simply pushes the pads for the final approach up into
 * the row above its battlements. Pads are at least 1.5 tiles from any earlier spot
 * and clear of the gate castle's box (the renderer draws the castle over anything
 * inside it). Candidates are then picked greedily — each round takes the candidate
 * whose tower range covers the most road tiles not yet covered — so eight pads
 * blanket the road instead of clustering.
 *
 * Ties are broken with the caller's PRNG, so the result stays deterministic; a fresh
 * stream re-shuffles exactly those late rounds that strand road tiles. `null` means
 * the candidates ran dry before `spotCount` pads were placed; the caller then retries
 * with new tie-break draws, and finally with a new road.
 *
 * Hot loops compare squared distances — no square roots per candidate per tile.
 */
export function placeSpots(
    params: MapParams,
    cells: readonly Cell[],
    gate: Point,
    rng: () => number,
): Spot[] | null {
    const { width, height, spotCount, towerRange } = params;
    const towerRangeSquared = towerRange * towerRange;

    const onRoad = new Set<number>(cells.map((cell) => cell.y * width + cell.x));
    const covered = new Uint8Array(cells.length);
    // Road tile centres, hoisted out of every candidate loop.
    const tileX = new Float64Array(cells.length);
    const tileY = new Float64Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
        tileX[i] = cells[i].x + 0.5;
        tileY[i] = cells[i].y + 0.5;
    }

    // Candidates: off-road cell centres that hug the road — within 1.5 tiles of the
    // nearest road tile — and outside the gate castle's box.
    const candidates: { x: number; y: number }[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (onRoad.has(y * width + x)) continue;
            const cx = x + 0.5;
            const cy = y + 0.5;
            let nearestSquared = Number.POSITIVE_INFINITY;
            for (let i = 0; i < cells.length; i++) {
                const dx = cx - tileX[i];
                const dy = cy - tileY[i];
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
            }
            if (nearestSquared < 1 - 1e-6 || nearestSquared > 2.25 + 1e-6) continue;
            if (!fitsBesideGateCastle({ x: cx, y: cy }, gate)) continue;
            candidates.push({ x: cx, y: cy });
        }
    }
    if (candidates.length < spotCount) return null;

    const spots: Spot[] = [];
    while (spots.length < spotCount) {
        let bestCount = -1;
        let best: { x: number; y: number }[] = [];

        for (const candidate of candidates) {
            // Spacing: never closer than 1.5 tiles to an earlier spot.
            let tooClose = false;
            for (const spot of spots) {
                const dx = candidate.x - spot.x;
                const dy = candidate.y - spot.y;
                if (dx * dx + dy * dy < 2.25 - 1e-9) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            let count = 0;
            for (let i = 0; i < cells.length; i++) {
                if (covered[i]) continue;
                const dx = candidate.x - tileX[i];
                const dy = candidate.y - tileY[i];
                if (dx * dx + dy * dy <= towerRangeSquared + 1e-9) count++;
            }
            if (count > bestCount) {
                bestCount = count;
                best = [candidate];
            } else if (count === bestCount) {
                best.push(candidate);
            }
        }

        if (best.length === 0) return null;

        const pick = best[Math.floor(rng() * best.length)];
        spots.push({ id: `s${spots.length}`, x: pick.x, y: pick.y });
        for (let i = 0; i < cells.length; i++) {
            const dx = pick.x - tileX[i];
            const dy = pick.y - tileY[i];
            if (dx * dx + dy * dy <= towerRangeSquared + 1e-9) covered[i] = 1;
        }
    }

    return spots;
}
