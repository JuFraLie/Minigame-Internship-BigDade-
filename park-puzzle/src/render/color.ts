/**
 * Colour arithmetic for the Canvas renderer.
 *
 * `fillGradientStyle` is WebGL only and this game renders on Canvas, where a gradient has
 * to be painted as a stack of flat bands instead. Blending two palette entries is what
 * makes those bands read as one wash rather than as stripes.
 */

/** Linear blend between two `0xrrggbb` values — the Canvas fallback for a gradient fill. */
export function mixColor(from: number, to: number, t: number): number {
    const channel = (shift: number): number => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * t);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
