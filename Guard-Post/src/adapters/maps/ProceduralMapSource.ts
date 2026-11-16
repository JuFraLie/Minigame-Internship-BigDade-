import type { MapSource } from '../../app/ports.ts';
import { generateMap } from '../../domain/map/generateMap.ts';
import { seedOf } from '../../domain/map/prng.ts';
import { DEFAULT_MAP_PARAMS, type MapDefinition } from '../../domain/map/types.ts';

/**
 * The production map source: procedural layouts, one per level.
 *
 * The level number alone fixes the layout — level 7 always walks the same road —
 * unless a session salt is supplied: the composition root passes one fresh salt per
 * launch, so every launch starts on a new level 1 while a session (and the tests,
 * which pass no salt) stay perfectly reproducible. Everything derives from the seed,
 * so this adapter holds no state beyond the salt and never touches the network,
 * the clock or `Math.random`.
 */
export class ProceduralMapSource implements MapSource {
    readonly #sessionSeed: number;

    /** `0` (the default) makes level N's map identical across runs; any other salt varies it per session. */
    constructor(sessionSeed: number = 0) {
        this.#sessionSeed = sessionSeed >>> 0;
    }

    getMap(level: number): MapDefinition {
        return generateMap({ ...DEFAULT_MAP_PARAMS, seed: seedOf(this.#sessionSeed, level) });
    }
}
