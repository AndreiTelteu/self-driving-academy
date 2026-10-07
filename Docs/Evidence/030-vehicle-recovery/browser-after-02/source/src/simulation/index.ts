import { createProfileSnapshot } from '../profiles';
import type { ProfileSnapshot } from '../profiles';

export { parseSimulationEvent } from './events';
export type { SimulationEvent } from './events';
export {
  createFixedTickLoop,
  FIXED_TICK_HZ,
  FIXED_DT_SECONDS,
  MAX_STEPS_PER_FRAME,
  OVERLOAD_DEBT_MS,
} from './fixed-tick';
export type {
  SnapshotReadonly,
  FixedTickStatus,
  FixedTickStep,
  FixedTickFault,
  FixedTickState,
  FixedTickFrame,
  FixedTickOptions,
  FixedTickLoop,
} from './fixed-tick';
export { createEventBus } from './event-bus';
export * from './collision-events';
export * from './scheduling';
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
