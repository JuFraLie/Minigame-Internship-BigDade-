import type { MapSource } from '../../app/ports.ts';
import { FALLBACK_MAP, defineMap } from '../../domain/map/generateMap.ts';
import { MAPS } from '../../domain/maps.ts';
import type { MapDefinition } from '../../domain/map/types.ts';

/**
 * Hand-authored layouts: the three reference maps as `MapDefinition`s, S-Bend first.
 *
 * The generator falls back to `FALLBACK_MAP` (this source's first map) when no
 * attempt validates, and the tests use this source wherever a known, fixed layout is
 * the point. Level numbers rotate through the list.
 */
const REFERENCE_MAPS: readonly MapDefinition[] = [
    FALLBACK_MAP,
    defineMap(MAPS[1], 1),
    defineMap(MAPS[2], 2),
];

export class FixedMapSource implements MapSource {
    readonly #maps: readonly MapDefinition[];

    constructor(maps: readonly MapDefinition[] = REFERENCE_MAPS) {
        this.#maps = maps;
    }

    getMap(level: number): MapDefinition {
        const count = this.#maps.length;
        return this.#maps[((level - 1) % count + count) % count];
    }
}
