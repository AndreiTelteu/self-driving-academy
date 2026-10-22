import { createTutorial } from '../../src/missions';
import type { Tutorial } from '../../src/missions';
import type { ControlMode } from '../../src/vehicles';
import { createMissionTestBus, MISSION_SESSION_ID, MISSION_WORLD_EPOCH } from './mission-fixture';

/** 117 tutorial fixture: real 007 event builders plus typed 067/068 observation values. */

export const TUTORIAL_CONTEXT = Object.freeze({
  sessionId: MISSION_SESSION_ID,
  worldEpoch: MISSION_WORLD_EPOCH,
});
export const TUTORIAL_TAXI = 'taxi:117:A';
export const TUTORIAL_OTHER_TAXI = 'taxi:117:B';
export const TUTORIAL_CIVIL = 'civil:117:1';
export const TUTORIAL_RIDE = 'ride:117:1';

export interface SelectionObservation {
  readonly tick: number;
  readonly vehicleId: string;
  readonly kind: 'TAXI' | 'CIVIL';
}

export interface ControlObservation {
  readonly tick: number;
  readonly vehicleId: string;
  readonly mode: ControlMode;
  readonly learningEligible: boolean | null;
}

export function selection(
  tick: number,
  vehicleId: string = TUTORIAL_TAXI,
  kind: 'TAXI' | 'CIVIL' = 'TAXI',
): SelectionObservation {
  return Object.freeze({ tick, vehicleId, kind });
}

/**
 * One accepted 067 projection value. `LEARNING` is ineligible by default, exactly like a tutorial
 * sandbox; a caller that wants the accidental-learning probe passes `true` explicitly.
 */
export function control(
  tick: number,
  mode: ControlMode,
  learningEligible: boolean | null = false,
  vehicleId: string = TUTORIAL_TAXI,
): ControlObservation {
  return Object.freeze({ tick, vehicleId, mode, learningEligible });
}

export function createTutorialFixture(): {
  readonly tutorial: Tutorial;
  readonly bus: ReturnType<typeof createMissionTestBus>;
} {
  const bus = createMissionTestBus();
  return Object.freeze({
    bus,
    tutorial: createTutorial({ context: TUTORIAL_CONTEXT }),
  });
}

export interface TutorialRun {
  readonly tick: number;
  readonly steps: readonly string[];
  readonly completed: boolean;
  readonly study: {
    readonly blockedSelections: 0;
    readonly learningJobs: 0;
    readonly profileVersions: 0;
    readonly learningActivationsObserved: number;
  };
}

/** Deterministic full playthrough: one taxi, M, L, M, one real pickup and dropoff. */
export function playFullTutorial(
  tutorial: Tutorial,
  options: {
    readonly taxiId?: string;
    readonly rideId?: string;
    readonly startTick?: number;
  } = {},
): TutorialRun {
  const taxiId = options.taxiId ?? TUTORIAL_TAXI;
  const rideId = options.rideId ?? TUTORIAL_RIDE;
  let current = options.startTick ?? 0;
  const steps: string[] = [];
  const advance = (): number => {
    current += 1;
    return current;
  };
  tutorial.start({ tick: current });
  steps.push(tutorial.observeSelection(selection(advance(), taxiId)).status);
  steps.push(tutorial.observeControl(control(advance(), 'MANUAL', false, taxiId)).status);
  steps.push(tutorial.observeControl(control(advance(), 'LEARNING', false, taxiId)).status);
  steps.push(tutorial.observeControl(control(advance(), 'AUTO', false, taxiId)).status);
  steps.push(
    tutorial.ingest({
      schemaVersion: 1,
      units: 'SI',
      sessionId: MISSION_SESSION_ID,
      worldEpoch: MISSION_WORLD_EPOCH,
      eventId: `pickup:${rideId}`,
      tick: advance(),
      entityIds: [taxiId, rideId],
      type: 'PICKUP',
      payload: { vehicleId: taxiId, rideId },
    }).status,
  );
  const final = tutorial.ingest({
    schemaVersion: 1,
    units: 'SI',
    sessionId: MISSION_SESSION_ID,
    worldEpoch: MISSION_WORLD_EPOCH,
    eventId: `dropoff:${rideId}`,
    tick: advance(),
    entityIds: [taxiId, rideId],
    type: 'DROPOFF',
    payload: { vehicleId: taxiId, rideId },
  });
  steps.push(final.status);
  const statistics = tutorial.stats();
  return Object.freeze({
    tick: current,
    steps: Object.freeze(steps),
    completed: final.status === 'COMPLETED',
    study: Object.freeze({
      blockedSelections: statistics.blockedSelections,
      learningJobs: statistics.learningJobs,
      profileVersions: statistics.profileVersions,
      learningActivationsObserved: statistics.learningActivationsObserved,
    }),
  });
}
