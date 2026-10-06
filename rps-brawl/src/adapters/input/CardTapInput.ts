import type { Sign } from '../../core/types.ts';
import type { CardLayout } from '../../ports/CardLayoutPort.ts';
import type { InputIntentPort } from '../../ports/InputIntentPort.ts';
import type { TapPort } from '../../ports/TapPort.ts';

/**
 * Converts screen-space taps into `PickSign` intents.
 *
 * It knows nothing about Phaser, the scenes or the game rules: it is handed a
 * point and the layout the renderer currently uses, and forwards the matching
 * card's sign to whatever consumes `InputIntentPort`. This is the only code
 * allowed to turn rendering coordinates into game-world meaning.
 */
export class CardTapInput implements TapPort {
  private readonly target: InputIntentPort;

  constructor(target: InputIntentPort) {
    this.target = target;
  }

  tapAt(x: number, y: number, layout: CardLayout): Sign | null {
    const hit = layout.regions.find(
      (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
    );
    if (!hit) return null;
    return this.target.pickSign(hit.sign) ? hit.sign : null;
  }
}
