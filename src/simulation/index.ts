import { createProfileSnapshot } from '../profiles';
import type { ProfileSnapshot } from '../profiles';

export { parseSimulationEvent } from './events';
export type { SimulationEvent } from './events';
export { createEventBus } from './event-bus';
export type {
  EventBus,
  EventBusOptions,
  EventBusStats,
  EventListener,
  ListenerOptions,
  ListenerFailure,
  PublishResult,
} from './event-bus';

/** Read model only. Physics and tick progression belong to later PBIs. */
export interface SimulationSnapshot {
  readonly tick: number;
  readonly profile: ProfileSnapshot;
}

export interface SimulationReader {
  getSnapshot(): SimulationSnapshot;
}

export function createBootstrapSimulation(): SimulationReader {
  const snapshot: SimulationSnapshot = Object.freeze({
    tick: 0,
    profile: createProfileSnapshot({
      profileId: 'bootstrap',
      versionId: 'bootstrap-0',
      parameters: {},
    }),
  });
  return Object.freeze({ getSnapshot: () => snapshot });
}
