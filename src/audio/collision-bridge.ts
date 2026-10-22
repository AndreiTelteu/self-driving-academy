import { requireContract } from '../sessions';
import type { EventBus } from '../simulation';
import type { AudioEngine } from './engine';
import type { ImpactAudioEvent } from './contracts';

export interface CollisionAudioBridgeOptions {
  readonly engine: AudioEngine;
  readonly eventBus: EventBus;
  /** Distance of the collision from the listener; the composition root owns the positions. */
  readonly distanceM?: (vehicleId: string, otherEntityId: string) => number;
}

export interface CollisionAudioBridge {
  /** Collision events published by the 028 adapter and converted into impact cues. */
  readonly handled: number;
  readonly skipped: number;
  dispose(): void;
}

/**
 * Bridges the 028 collision events into the audio engine.
 *
 * The bridge is a consumer: it never publishes, never changes the simulation and never owns the
 * event bus. Unsubscribing releases the listener; the engine keeps its own ownership.
 */
export function attachCollisionAudio(options: CollisionAudioBridgeOptions): CollisionAudioBridge {
  const engine = options.engine;
  const distanceOf = options.distanceM ?? (() => 0);
  let handled = 0;
  let skipped = 0;
  let disposed = false;
  const unsubscribe = options.eventBus.subscribe((event) => {
    if (disposed) return;
    if (event.type !== 'COLLISION') return;
    const impact: ImpactAudioEvent = {
      eventId: event.eventId,
      tick: event.tick,
      vehicleId: event.payload.vehicleId,
      otherEntityId: event.payload.otherEntityId,
      impulseNs: event.payload.impulseNs,
      distanceM: distanceOf(event.payload.vehicleId, event.payload.otherEntityId),
    };
    const result = engine.handleImpact(impact);
    if (result.played) handled += 1;
    else skipped += 1;
  });
  return Object.freeze({
    get handled() {
      return handled;
    },
    get skipped() {
      return skipped;
    },
    dispose(): void {
      requireContract(!disposed, 'Collision audio bridge is disposed');
      disposed = true;
      unsubscribe();
    },
  });
}
