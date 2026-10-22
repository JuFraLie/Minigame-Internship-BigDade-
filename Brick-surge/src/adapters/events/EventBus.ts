/**
 * Synchronous in-process event bus implementing EventSinkPort.
 *
 * The domain emits typed events here; the composition root subscribes the
 * listeners that forward them to the bridge, the renderer or scene UI. The
 * domain never sees any of those.
 */

import type { EventSinkPort } from '../../domain/ports.ts';
import type { DomainEvent } from '../../domain/types.ts';

export type DomainEventListener = (event: DomainEvent) => void;

export class EventBus implements EventSinkPort {
    private readonly listeners: DomainEventListener[] = [];

    emit(event: DomainEvent): void {
        for (const l of this.listeners) l(event);
    }

    subscribe(listener: DomainEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            const i = this.listeners.indexOf(listener);
            if (i >= 0) this.listeners.splice(i, 1);
        };
    }
}
