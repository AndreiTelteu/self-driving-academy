import { requireContract, text, tick } from '../sessions';
import { parseSimulationEvent } from './events';
import type { SimulationEvent } from './events';

export interface EventBusOptions {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly maxEventsPerEpoch?: number;
  /** Upper bound on retained UTF-16 code units per validated event. */
  readonly maxEventCodeUnits?: number;
  readonly maxListeners?: number;
}
export interface ListenerOptions {
  /** Ascending order, registration order breaks ties. */
  readonly order?: number;
  readonly type?: SimulationEvent['type'];
}
export type EventListener = (event: SimulationEvent) => undefined;
export interface ListenerFailure {
  readonly listenerId: number;
  readonly error: unknown;
}
export interface PublishResult {
  readonly status: 'delivered' | 'duplicate';
  readonly failures: readonly ListenerFailure[];
}
export interface EventBusStats {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly watermarkTick: number;
  readonly retainedEvents: number;
  readonly retainedCodeUnits: number;
  readonly listeners: number;
  readonly disposed: boolean;
}
export interface EventBus {
  publish(value: unknown): PublishResult;
  subscribe(listener: EventListener, options?: ListenerOptions): () => void;
  advanceTick(nextTick: number): void;
  advanceWorldEpoch(nextEpoch: number): void;
  getStats(): EventBusStats;
  dispose(): void;
}

/** Synchronous local transport. Accepted identity is consumed before any listener runs. */
export function createEventBus(options: EventBusOptions): EventBus {
  const sessionId = text(options.sessionId);
  let worldEpoch = tick(options.worldEpoch);
  const maxEvents = tick(options.maxEventsPerEpoch ?? 10000);
  const maxCodeUnits = tick(options.maxEventCodeUnits ?? 16384);
  const maxListeners = tick(options.maxListeners ?? 128);
  requireContract(
    maxEvents > 0 && maxCodeUnits > 0 && maxListeners > 0,
    'Capacity must be positive',
  );
  const identities = new Map<string, string>();
  const listeners = new Map<
    number,
    { listener: EventListener; order: number; type?: SimulationEvent['type'] }
  >();
  let retainedCodeUnits = 0;
  let watermarkTick = 0;
  let nextListenerId = 0;
  let dispatching = false;
  let disposed = false;
  const assertIdle = () => {
    requireContract(!disposed, 'Event bus is disposed');
    requireContract(!dispatching, 'Reentrant publication or lifecycle change is unsupported');
  };
  return Object.freeze({
    publish(value: unknown): PublishResult {
      assertIdle();
      const event = parseSimulationEvent(value);
      requireContract(
        event.sessionId === sessionId && event.worldEpoch === worldEpoch,
        'Stale or foreign event world',
      );
      const fingerprint = JSON.stringify(event);
      requireContract(fingerprint.length <= maxCodeUnits, 'Event exceeds retained size capacity');
      const previous = identities.get(event.eventId);
      if (previous !== undefined) {
        requireContract(previous === fingerprint, 'Conflicting reuse of eventId');
        return Object.freeze({ status: 'duplicate', failures: Object.freeze([]) });
      }
      requireContract(event.tick >= watermarkTick, 'Event precedes tick watermark');
      requireContract(
        identities.size < maxEvents,
        'Epoch event capacity exhausted; explicit recovery required',
      );
      identities.set(event.eventId, fingerprint);
      retainedCodeUnits += fingerprint.length;
      watermarkTick = event.tick;
      const scheduled = [...listeners.entries()]
        .filter(([, entry]) => entry.type === undefined || entry.type === event.type)
        .sort(([idA, a], [idB, b]) => a.order - b.order || idA - idB);
      const failures: ListenerFailure[] = [];
      dispatching = true;
      try {
        for (const [listenerId, entry] of scheduled) {
          // Unsubscription takes effect immediately; new subscriptions start on the next event.
          if (!listeners.has(listenerId)) continue;
          try {
            const result: unknown = entry.listener(event);
            requireContract(
              result === undefined,
              'Listener must be synchronous and return undefined',
            );
          } catch (error: unknown) {
            failures.push(Object.freeze({ listenerId, error }));
          }
        }
      } finally {
        dispatching = false;
      }
      return Object.freeze({ status: 'delivered', failures: Object.freeze(failures) });
    },
    subscribe(listener: EventListener, listenerOptions: ListenerOptions = {}) {
      requireContract(!disposed, 'Event bus is disposed');
      requireContract(typeof listener === 'function', 'Expected listener function');
      requireContract(listeners.size < maxListeners, 'Listener capacity exhausted');
      const order = listenerOptions.order ?? 0;
      requireContract(Number.isSafeInteger(order), 'Listener order must be a safe integer');
      requireContract(nextListenerId < Number.MAX_SAFE_INTEGER, 'Listener identity exhausted');
      const listenerId = nextListenerId++;
      listeners.set(listenerId, { listener, order, type: listenerOptions.type });
      return () => {
        listeners.delete(listenerId);
      };
    },
    advanceTick(nextTick: number) {
      assertIdle();
      const next = tick(nextTick);
      requireContract(next >= watermarkTick, 'Tick watermark cannot decrease');
      watermarkTick = next;
    },
    advanceWorldEpoch(nextEpoch: number) {
      assertIdle();
      const next = tick(nextEpoch);
      requireContract(next > worldEpoch, 'World epoch must strictly increase');
      worldEpoch = next;
      watermarkTick = 0;
      identities.clear();
      retainedCodeUnits = 0;
    },
    getStats(): EventBusStats {
      return Object.freeze({
        sessionId,
        worldEpoch,
        watermarkTick,
        retainedEvents: identities.size,
        retainedCodeUnits,
        listeners: listeners.size,
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      assertIdle();
      disposed = true;
      identities.clear();
      listeners.clear();
      retainedCodeUnits = 0;
    },
  });
}
