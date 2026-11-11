import type { CreditPort } from '../app/ports.ts';

/** Where the credit points: skyel's itch.io page. */
const CREDIT_URL = 'https://skyel13.itch.io/';

/** Text shown on the Play Screen above the how-to block. */
const CREDIT_LABEL = 'Assets by skyel';

/**
 * Adapter: the Play Screen's credit line.
 *
 * This is the only file in the project that opens an external page, so the link (and
 * the single URL in the codebase) stays auditable — the layers suite enforces that the
 * way it enforces `MpBridge.ts` for the host channel. The open happens on a real tap,
 * so browsers allow the popup; where a WebView blocks `window.open`, the fallback
 * simply navigates to the page instead.
 */
export function createCreditLink(): CreditPort {
    return {
        label: CREDIT_LABEL,
        open(): void {
            if (typeof window === 'undefined') return;
            const opened = window.open(CREDIT_URL, '_blank');
            if (!opened) window.location.href = CREDIT_URL;
        },
    };
}
