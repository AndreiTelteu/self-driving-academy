import { captureWorldSnapshot } from '../../src/persistence/index';
import type { WorldSnapshot, WorldSnapshotCaptureResult } from '../../src/persistence/index';
import type { SimulationEvent } from '../../src/simulation/index';
import type {
  ReplaySignalObservation,
  ReplayTickFrame,
  ReplayVehicleObservation,
} from '../../src/replay/index';

/**
 * Deterministic world fixture for PBI 207.
 *
 * The fixture is the "real world" the recorder must not filter: 20 taxis and 20 civilians, some of
 * them MANUAL or LEARNING, some in AUTO, and most of them outside the player camera. Nothing here
 * reads a wall clock or `Math.random`; every position, phase and identity is a pure function of the
 * tick, so two runs produce byte-identical chunks and the report can assert exact numbers.
 */

export const WORLD_SESSION = 'session-207' as const;
export const WORLD_EPOCH = 1 as const;
export const WORLD_PROFILE = 'profile-207' as const;
export const WORLD_VERSIONS = Object.freeze({
  engineVersion: 'babylon-9.29.0',
  physicsVersion: 'rapier-0.21.0',
  mapVersion: 'map-207-1',
});

export const TAXI_COUNT = 20;
export const CIVILIAN_COUNT = 20;
export const SIGNAL_COUNT = 6;

export const SIGNAL_IDS: readonly string[] = Object.freeze(
  Array.from(
    { length: SIGNAL_COUNT },
    (_, index) => `signal-${String(index + 1).padStart(2, '0')}`,
  ),
);

export interface FixtureVehicle {
  readonly entityId: string;
  readonly handle: number;
  readonly vehicleClass: 'TAXI' | 'CIVILIAN';
  readonly controlMode: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly rideId: string | null;
}

/** Static identity of the fixture fleet; the mode is a property of the vehicle, not of the camera. */
export const FLEET: readonly FixtureVehicle[] = Object.freeze([
  ...Array.from({ length: TAXI_COUNT }, (_, index) => {
    const entityId = `taxi-${String(index + 1).padStart(2, '0')}`;
    const controlMode = index % 5 === 0 ? 'MANUAL' : index % 7 === 0 ? 'LEARNING' : 'AUTO';
    const rideId = index < 3 ? `ride-${String(index + 1).padStart(2, '0')}` : null;
    return Object.freeze({
      entityId,
      handle: index + 1,
      vehicleClass: 'TAXI' as const,
      controlMode,
      rideId,
    });
  }),
  ...Array.from({ length: CIVILIAN_COUNT }, (_, index) => {
    const entityId = `civil-${String(index + 1).padStart(2, '0')}`;
    const controlMode = index % 2 === 0 ? 'AUTO' : 'MANUAL';
    return Object.freeze({
      entityId,
      handle: TAXI_COUNT + index + 1,
      vehicleClass: 'CIVILIAN' as const,
      controlMode,
      rideId: null,
    });
  }),
]);

/** Only five vehicles are ever "in camera"; the rest are still simulated and must still be recorded. */
export function inCamera(entityIndex: number): boolean {
  return entityIndex % 8 === 0;
}

export function fsmState(entityIndex: number, tick: number): string {
  if (entityIndex === 0) return 'PICKUP';
  if (entityIndex === 1) return 'ONBOARD';
  return (Math.floor(tick / 120) + entityIndex) % 2 === 0 ? 'CRUISE' : 'YIELD';
}

export function vehiclePosition(
  entityIndex: number,
  tick: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  return Object.freeze({
    x: Number((entityIndex * 10 + tick * 0.5).toFixed(2)),
    y: 0,
    z: Number((entityIndex * 3 + Math.sin(tick / 60 + entityIndex) * 0.25).toFixed(2)),
  });
}

export function vehicleRotation(
  entityIndex: number,
  tick: number,
): { readonly x: number; readonly y: number; readonly z: number; readonly w: number } {
  const yaw = tick * 0.01 + entityIndex * 0.05;
  return Object.freeze({
    x: 0,
    y: Number(Math.sin(yaw / 2).toFixed(4)),
    z: 0,
    w: Number(Math.cos(yaw / 2).toFixed(4)),
  });
}

export function signalPhaseAt(index: number, tick: number): 'GREEN' | 'YELLOW' | 'RED' {
  const phase = (Math.floor(tick / 60) + index) % 3;
  return phase === 0 ? 'GREEN' : phase === 1 ? 'YELLOW' : 'RED';
}

/** One authoritative tick of the world, exactly as the world would offer it to the recorder. */
export function replayFrame(
  tick: number,
  options: {
    readonly omit?: readonly string[];
    readonly created?: readonly number[];
    readonly removed?: readonly number[];
    readonly hideCamera?: boolean;
  } = {},
): ReplayTickFrame {
  const omit = new Set(options.omit ?? []);
  const vehicles: ReplayVehicleObservation[] = [];
  for (let index = 0; index < FLEET.length; index += 1) {
    const identity = FLEET[index];
    if (identity === undefined || omit.has(identity.entityId)) continue;
    vehicles.push(
      Object.freeze({
        entityId: identity.entityId,
        handle: identity.handle,
        vehicleClass: identity.vehicleClass,
        controlMode: identity.controlMode,
        position: vehiclePosition(index, tick),
        rotation: vehicleRotation(index, tick),
        linearVelocity: Object.freeze({ x: 0.5, y: 0, z: 0 }),
        fsmState: fsmState(index, tick),
        rideId: identity.rideId,
        passengerIds: Object.freeze([]),
        inCamera: options.hideCamera === true ? false : inCamera(index),
      }),
    );
  }
  const signals: ReplaySignalObservation[] = SIGNAL_IDS.map((signalId, index) =>
    Object.freeze({
      signalId,
      phase: signalPhaseAt(index, tick),
      remainingTicks: 60 - (tick % 60),
    }),
  );
  return Object.freeze({
    tick,
    vehicles: Object.freeze(vehicles),
    signals: Object.freeze(signals),
    created: Object.freeze(
      (options.created ?? []).map((index) => {
        const identity = FLEET[index];
        if (identity === undefined) throw new Error(`Unknown fixture vehicle ${index}`);
        return Object.freeze({
          entityId: identity.entityId,
          vehicleClass: identity.vehicleClass,
          handle: identity.handle,
          tick,
        });
      }),
    ),
    removed: Object.freeze(
      (options.removed ?? []).map((index) => {
        const identity = FLEET[index];
        if (identity === undefined) throw new Error(`Unknown fixture vehicle ${index}`);
        return Object.freeze({
          entityId: identity.entityId,
          vehicleClass: identity.vehicleClass,
          handle: identity.handle,
          tick,
        });
      }),
    ),
  });
}

function context(tick: number, eventId: string, entityIds: readonly string[]) {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: WORLD_SESSION,
    worldEpoch: WORLD_EPOCH,
    eventId,
    tick,
    entityIds,
  } as const;
}

/** A real 007 COLLISION fact between two fixture vehicles. */
export function collisionEvent(
  tick: number,
  entityIndex: number,
  otherIndex: number,
): SimulationEvent {
  const a = FLEET[entityIndex]?.entityId;
  const b = FLEET[otherIndex]?.entityId;
  if (a === undefined || b === undefined) throw new Error('Unknown fixture vehicle');
  return Object.freeze({
    ...context(tick, `event-collision-${tick}-${entityIndex}`, [a, b]),
    type: 'COLLISION',
    payload: Object.freeze({ vehicleId: a, otherEntityId: b, impulseNs: 1_250 }),
  }) as SimulationEvent;
}

/** A real 007 STOP_APPROACH fact, used to prove that non-incident events keep their exact tick. */
export function stopApproachEvent(tick: number, entityIndex: number): SimulationEvent {
  const vehicleId = FLEET[entityIndex]?.entityId;
  if (vehicleId === undefined) throw new Error('Unknown fixture vehicle');
  return Object.freeze({
    ...context(tick, `event-stop-${tick}`, [vehicleId]),
    type: 'STOP_APPROACH',
    payload: Object.freeze({
      vehicleId,
      opportunityId: `opportunity-${tick}`,
      stopLineId: 'stop-line-01',
    }),
  }) as SimulationEvent;
}

/** A WORLD_RESET fact; the chunk must declare the discontinuity instead of hiding it. */
export function worldResetEvent(tick: number): SimulationEvent {
  return Object.freeze({
    ...context(tick, `event-reset-${tick}`, []),
    type: 'WORLD_RESET',
    payload: Object.freeze({ previousWorldEpoch: WORLD_EPOCH - 1, reason: 'SCENARIO_RESET' }),
  }) as SimulationEvent;
}

/** A complete 206 snapshot of the same fleet at `tick`; the chunk anchors its replay on it. */
export function snapshotAt(tick: number): WorldSnapshot {
  const captured: WorldSnapshotCaptureResult = captureWorldSnapshot({
    tickBoundary: 'BOUNDARY',
    tick,
    worldEpoch: WORLD_EPOCH,
    subsystemTicks: {
      physics: tick,
      controllers: tick,
      rides: tick,
      passengers: tick,
      opportunities: tick,
      signals: tick,
      dispatch: tick,
      learning: tick,
      rng: tick,
    },
    profile: {
      profileId: WORLD_PROFILE,
      activeVersionId: 'version-207-1',
      activationSequence: 1,
    },
    vehicles: FLEET.map((identity, index) =>
      Object.freeze({
        entityId: identity.entityId,
        handle: identity.handle,
        vehicleClass: identity.vehicleClass,
        position: vehiclePosition(index, tick),
        rotation: vehicleRotation(index, tick),
        linearVelocity: Object.freeze({ x: 0.5, y: 0, z: 0 }),
        angularVelocity: Object.freeze({ x: 0, y: 0.01, z: 0 }),
        controlMode: identity.controlMode,
        fsmState: fsmState(index, tick),
        routeId: 'route-01',
        routeNodeIndex: 2,
        routeProgress: 0.25,
        segmentId: null,
        rideId: identity.rideId,
        passengerIds: Object.freeze([]),
      }),
    ),
    controllers: FLEET.map((identity, index) =>
      Object.freeze({
        entityId: identity.entityId,
        fsmState: fsmState(index, tick),
        fsmStateTick: tick,
        controlMode: identity.controlMode,
        targetSpeed: 12,
        laneOffset: 0,
        memory: Object.freeze({ lane_bias: 0.1 }),
      }),
    ),
    rides: FLEET.filter((identity) => identity.rideId !== null).map((identity, index) =>
      Object.freeze({
        rideId: identity.rideId ?? '',
        vehicleId: identity.entityId,
        passengerId: `passenger-${String(index + 1).padStart(2, '0')}`,
        state: 'ONBOARD' as const,
        pickupNodeId: 'node-01',
        dropoffNodeId: 'node-02',
        requestedTick: 0,
        acceptedTick: tick === 0 ? null : 0,
      }),
    ),
    passengers: FLEET.filter((identity) => identity.rideId !== null).map((_, index) =>
      Object.freeze({
        passengerId: `passenger-${String(index + 1).padStart(2, '0')}`,
        rideId: `ride-${String(index + 1).padStart(2, '0')}`,
        state: 'PICKED_UP' as const,
        waitingSinceTick: 0,
        patience: 90,
      }),
    ),
    segments: [],
    opportunities: [],
    signals: SIGNAL_IDS.map((signalId, index) =>
      Object.freeze({
        signalId,
        phase: signalPhaseAt(index, tick),
        remainingTicks: 60 - (tick % 60),
        cycleIndex: Math.floor(tick / 60),
      }),
    ),
    dispatch: { pending: [], acceptedResults: [] },
    learning: {
      learningEpoch: 1,
      pendingJobs: [],
      completedObservations: [],
      acceptedResultKeys: [],
    },
    rng: { seed: 7, streams: { traffic: tick, rideDemand: tick, opportunities: tick } },
    dedup: { lastEventSequence: tick, seenEventIds: [] },
  });
  if (captured.status === 'REJECTED') {
    throw new Error(`The 206 fixture snapshot was rejected: ${captured.rejection.message}`);
  }
  return captured.snapshot;
}
