import type { MapDefinition } from '../domain/map/types.ts';
import { roadCells } from '../domain/map/validate.ts';

/**
 * A layout as plain text — `#` road, `S` build spot, `.` empty — one line per row,
 * top row first. The debugging aid the generator's tests print when a map misbehaves;
 * it lives in the testing layer so the game never ships it.
 */
export function asciiMap(definition: MapDefinition): string {
    const grid: string[][] = [];
    for (let y = 0; y < definition.height; y++) grid.push(new Array<string>(definition.width).fill('.'));

    for (const cell of roadCells(definition.waypoints, definition.width, definition.height)) {
        if (inGrid(cell.x, cell.y, definition)) grid[cell.y][cell.x] = '#';
    }
    for (const spot of definition.spots) {
        const x = Math.floor(spot.x);
        const y = Math.floor(spot.y);
        if (inGrid(x, y, definition)) grid[y][x] = 'S';
    }

    return grid.map((row) => row.join(' ')).join('\n');
}

function inGrid(x: number, y: number, definition: MapDefinition): boolean {
    return x >= 0 && x < definition.width && y >= 0 && y < definition.height;
}
