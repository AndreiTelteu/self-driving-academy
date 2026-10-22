import { advanceWorldRng, canonicalizeJson } from '../../src/persistence/index';
import type {
  WorldCaptureInput,
  WorldControllerState,
  WorldDedupState,
  WorldDispatchState,
  WorldLearningState,
  WorldPassengerState,
  WorldRideState,
  WorldRngState,
  WorldSegmentState,
  WorldSignalState,
  WorldSnapshotSource,
  WorldSnapshotState,
  WorldVehicleState,
} from '../../src/persistence/index';

/**
 * Deterministic V1 world fixture for PBI 206.
 *
 * The fixture is not a renderer: it is a bounded, clockless simulation of the states the
 * checkpoint must preserve (vehicles, routes, rides, passengers, FSM/controller memory,
 * opportunities, signals, dispatch, learning and keyed RNG). Every step is a pure function of the
 * previous state, so two runs from the same snapshot must produce byte-identical state.
 */

export const WORLD_FIXTURE = Object.freeze({
  taxis: 30,
  civilians: 40,
  passengers: 30,
  signals: 8,
  opportunities: 64,
  seed: 0x5eed_1e,
  worldEpoch: 1,
  profileId: 'profile-1',
  activeVersionId: 'profile-1@2',
  activationSequence: 3,
  learningEpoch: 2,
  captureTick: 60,
  continuationTicks: 60,
});

export interface WorldFixtureMetadata {
  readonly generatedBy: string;
  readonly oracleRule: string;
}

export const WORLD_FIXTURE_METADATA: WorldFixtureMetadata = Object.freeze({
  generatedBy:
    'node --import ./scripts/register-typescript.mjs scripts/run-world-checkpoint-report.mjs',
  oracleRule:
    'Every expected value is the documented contract; the actual value is a real run against the in-memory IndexedDB double and the deterministic world fixture, with no wall clock and no Math.random.',
});

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

export type MutableWorld = Mutable<WorldSnapshotState>;

function totalVehicles(): number {
  return WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians;
}

function vehicleId(index: number): string {
  return index < WORLD_FIXTURE.taxis
    ? `taxi-${String(index + 1).padStart(2, '0')}`
    : `civil-${String(index - WORLD_FIXTURE.taxis + 1).padStart(2, '0')}`;
}

function rideId(index: number): string {
  return `ride-${String(index + 1).padStart(2, '0')}`;
}

function passengerId(index: number): string {
  return `passenger-${String(index + 1).padStart(2, '0')}`;
}

function vehicleFsm(index: number, tick: number): string {
  if (index === 0) return tick % 120 < 90 ? 'TURN_LEFT' : 'CRUISE';
  return tick % 60 < 30 ? 'CRUISE' : 'FOLLOW';
}

function rideStatus(index: number, tick: number): WorldRideState['state'] {
  if (index === 0) {
    if (tick < 30) return 'REQUESTED';
    if (tick < 45) return 'ASSIGNED';
    if (tick < 90) return 'PICKUP';
    if (tick < 120) return 'ONBOARD';
    return 'COMPLETED';
  }
  if (index === 1) return tick < 20 ? 'ONBOARD' : 'COMPLETED';
  if (index === 7) {
    if (tick < 10) return 'REQUESTED';
    if (tick < 40) return 'ASSIGNED';
    if (tick < 100) return 'ONBOARD';
    return 'COMPLETED';
  }
  return tick < 10 ? 'REQUESTED' : 'ASSIGNED';
}

function passengerStatus(
  index: number,
  ride: WorldRideState['state'],
): WorldPassengerState['state'] {
  if (index === 1 || ride === 'COMPLETED') return 'DELIVERED';
  if (ride === 'ONBOARD' || ride === 'DROPOFF') return 'PICKED_UP';
  return 'WAITING';
}

function createVehicles(): WorldVehicleState[] {
  return Array.from({ length: totalVehicles() }, (_, index) => {
    const fsmState = vehicleFsm(index, 0);
    const taxi = index < WORLD_FIXTURE.taxis;
    return {
      entityId: vehicleId(index),
      handle: 1000 + index,
      vehicleClass: taxi ? 'TAXI' : 'CIVILIAN',
      position: { x: index * 4, y: 0, z: index % 2 === 0 ? 0 : 3.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 8, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      controlMode: taxi ? (index === 0 ? 'MANUAL' : 'AUTO') : 'AUTO',
      fsmState,
      routeId: `route-${String((index % 12) + 1).padStart(2, '0')}`,
      routeNodeIndex: index % 12,
      routeProgress: 0,
      segmentId:
        index === 0
          ? 'segment-taxi-01'
          : index === 5
            ? 'segment-taxi-06'
            : index === 9
              ? 'segment-taxi-10'
              : null,
      rideId: index === 0 ? 'ride-01' : null,
      passengerIds: [],
    };
  });
}

function createControllers(): WorldControllerState[] {
  return Array.from({ length: totalVehicles() }, (_, index) => {
    const fsmState = vehicleFsm(index, 0);
    return {
      entityId: vehicleId(index),
      fsmState,
      fsmStateTick: 0,
      controlMode: index === 0 ? 'MANUAL' : 'AUTO',
      targetSpeed: 8,
      laneOffset: 0,
      memory: { integrator: 0, ticks_in_state: 0 },
    };
  });
}

function createRides(tick: number): WorldRideState[] {
  return Array.from({ length: WORLD_FIXTURE.passengers }, (_, index) => {
    const state = rideStatus(index, tick);
    return {
      rideId: rideId(index),
      vehicleId: vehicleId(index),
      passengerId: passengerId(index),
      state,
      pickupNodeId: `node-pickup-${String((index % 16) + 1).padStart(2, '0')}`,
      dropoffNodeId: `node-dropoff-${String((index % 16) + 1).padStart(2, '0')}`,
      requestedTick: 0,
      acceptedTick:
        index === 0 ? (tick >= 30 ? 30 : null) : index === 1 ? 5 : tick >= 10 ? 10 : null,
    };
  });
}

function createPassengers(tick: number): WorldPassengerState[] {
  return Array.from({ length: WORLD_FIXTURE.passengers }, (_, index) => {
    const ride = rideStatus(index, tick);
    return {
      passengerId: passengerId(index),
      rideId: rideId(index),
      state: passengerStatus(index, ride),
      waitingSinceTick: ride === 'REQUESTED' ? 0 : 10,
      patience: 90,
    };
  });
}

function createSegments(tick: number): WorldSegmentState[] {
  return [
    {
      segmentId: 'segment-taxi-01',
      vehicleId: 'taxi-01',
      controlMode: 'MANUAL',
      status: 'OPEN',
      startTick: 0,
      endTick: null,
      sampleCount: tick,
    },
    {
      segmentId: 'segment-taxi-06',
      vehicleId: 'taxi-06',
      controlMode: 'LEARNING',
      status: 'CLOSED',
      startTick: 0,
      endTick: 30,
      sampleCount: 30,
    },
    {
      segmentId: 'segment-taxi-10',
      vehicleId: 'taxi-10',
      controlMode: 'MANUAL',
      status: 'INCOMPLETE',
      startTick: 10,
      endTick: 20,
      sampleCount: 10,
    },
  ];
}

function createOpportunities(): WorldSnapshotState['opportunities'] {
  return Array.from({ length: WORLD_FIXTURE.opportunities }, (_, index) => ({
    opportunityKey: `opportunity-${String(index).padStart(2, '0')}`,
    evaluatedTick: 0,
    seed: 0x1000 + index,
    evaluated: false,
    verdict: null,
  }));
}

function createSignals(): WorldSignalState[] {
  const phases: readonly WorldSignalState['phase'][] = ['GREEN', 'GREEN', 'YELLOW', 'RED'];
  return Array.from({ length: WORLD_FIXTURE.signals }, (_, index) => ({
    signalId: `signal-${String(index + 1).padStart(2, '0')}`,
    phase: phases[index % phases.length],
    remainingTicks: 5 + (index % 10),
    cycleIndex: 0,
  }));
}

function createDispatch(): WorldDispatchState {
  return {
    pending: [
      {
        jobId: 'dispatch-01',
        vehicleId: 'taxi-03',
        rideId: 'ride-03',
        profileId: 'profile-1',
        learningEpoch: 2,
        state: 'PENDING',
        requestedTick: 10,
      },
      {
        jobId: 'dispatch-02',
        vehicleId: 'taxi-04',
        rideId: 'ride-04',
        profileId: 'profile-2',
        learningEpoch: 2,
        state: 'PENDING',
        requestedTick: 10,
      },
      {
        jobId: 'dispatch-03',
        vehicleId: 'taxi-05',
        rideId: 'ride-05',
        profileId: 'profile-1',
        learningEpoch: 1,
        state: 'PENDING',
        requestedTick: 10,
      },
    ],
    acceptedResults: [{ jobId: 'dispatch-00', acceptedTick: 5, rewardCredits: 12.5 }],
  };
}

function createLearning(): WorldLearningState {
  return {
    learningEpoch: WORLD_FIXTURE.learningEpoch,
    pendingJobs: [
      {
        jobId: 'learning-01',
        segmentId: 'segment-taxi-01',
        vehicleId: 'taxi-01',
        profileId: 'profile-1',
        learningEpoch: 2,
        state: 'PENDING',
        resultKey: null,
      },
      {
        jobId: 'learning-02',
        segmentId: 'segment-taxi-06',
        vehicleId: 'taxi-06',
        profileId: 'profile-1',
        learningEpoch: 1,
        state: 'PENDING',
        resultKey: null,
      },
      {
        jobId: 'learning-03',
        segmentId: 'segment-taxi-10',
        vehicleId: 'taxi-10',
        profileId: 'profile-2',
        learningEpoch: 2,
        state: 'PENDING',
        resultKey: null,
      },
    ],
    completedObservations: [
      {
        observationId: 'observation-01',
        segmentId: 'segment-taxi-06',
        kind: 'LEARNING',
        state: 'COMPLETED',
        resultKey: 'result-01',
      },
      {
        observationId: 'observation-02',
        segmentId: 'segment-taxi-06',
        kind: 'LEARNING',
        state: 'COMPLETED',
        resultKey: 'result-02',
      },
    ],
    acceptedResultKeys: ['result-01'],
  };
}

function createRng(): WorldRngState {
  return {
    seed: WORLD_FIXTURE.seed,
    streams: { traffic: 0, rideDemand: 0, opportunities: 0 },
  };
}

function createDedup(): WorldDedupState {
  return { lastEventSequence: 0, seenEventIds: [] };
}

/** Deep copy into mutable plain data; the fixture never shares frozen snapshot objects. */
function mutable<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

export function createWorldFixture(): MutableWorld {
  return mutable({
    snapshotVersion: '206-world-snapshot-v1',
    units: 'SI',
    tick: 0,
    worldEpoch: WORLD_FIXTURE.worldEpoch,
    profile: {
      profileId: WORLD_FIXTURE.profileId,
      activeVersionId: WORLD_FIXTURE.activeVersionId,
      activationSequence: WORLD_FIXTURE.activationSequence,
    },
    vehicles: createVehicles(),
    controllers: createControllers(),
    rides: createRides(0),
    passengers: createPassengers(0),
    segments: createSegments(0),
    opportunities: createOpportunities(),
    signals: createSignals(),
    dispatch: createDispatch(),
    learning: createLearning(),
    rng: createRng(),
    dedup: createDedup(),
  });
}

function applyRideLinks(world: MutableWorld): void {
  world.rides = createRides(world.tick);
  world.passengers = createPassengers(world.tick);
  const rides = new Map(world.rides.map((ride) => [ride.rideId, ride]));
  const passengers = new Map(
    world.passengers.map((passenger) => [passenger.passengerId, passenger]),
  );
  const activeRideStates: readonly WorldRideState['state'][] = [
    'ASSIGNED',
    'PICKUP',
    'ONBOARD',
    'DROPOFF',
  ];
  for (let index = 0; index < world.vehicles.length; index += 1) {
    const vehicle = world.vehicles[index];
    if (vehicle === undefined) continue;
    const ride = index < WORLD_FIXTURE.passengers ? rides.get(rideId(index)) : undefined;
    vehicle.rideId =
      ride !== undefined && activeRideStates.includes(ride.state) ? ride.rideId : null;
    const passenger = ride === undefined ? undefined : passengers.get(ride.passengerId);
    vehicle.passengerIds =
      passenger !== undefined && passenger.state === 'PICKED_UP' ? [passenger.passengerId] : [];
  }
}

function advanceVehicle(
  world: MutableWorld,
  vehicle: MutableWorld['vehicles'][number],
  index: number,
): void {
  const draw = advanceWorldRng(world.rng, 'traffic');
  world.rng = draw.rng;
  vehicle.position.x = vehicle.position.x + (draw.value - 0.5) * 0.4;
  vehicle.position.z = vehicle.position.z + ((index % 2 === 0 ? 1 : -1) * draw.value) / 100;
  vehicle.rotation.y = vehicle.rotation.y + 0.01;
  vehicle.linearVelocity.x = 8 + ((world.tick + index) % 7) * 0.1;
  vehicle.linearVelocity.z = (draw.value - 0.5) * 0.2;
  vehicle.angularVelocity.y = (draw.value - 0.5) * 0.02;
  vehicle.routeNodeIndex = (Math.floor(world.tick / 30) + index) % 12;
  vehicle.routeProgress = ((world.tick + index) % 60) / 60;
  const nextFsm = vehicleFsm(index, world.tick);
  vehicle.fsmState = nextFsm;
  const controller = world.controllers[index];
  if (controller !== undefined) {
    if (controller.fsmState !== nextFsm) {
      controller.fsmState = nextFsm;
      controller.fsmStateTick = world.tick;
    }
    controller.targetSpeed = vehicle.linearVelocity.x;
    controller.laneOffset = (draw.value - 0.5) * 0.5;
    controller.memory.integrator = controller.memory.integrator + draw.value * 0.001;
    controller.memory.ticks_in_state = controller.memory.ticks_in_state + 1;
  }
}

function advanceSignals(world: MutableWorld): void {
  const cycle: readonly WorldSignalState['phase'][] = ['GREEN', 'GREEN', 'YELLOW', 'RED'];
  for (const signal of world.signals) {
    signal.remainingTicks = signal.remainingTicks - 1;
    if (signal.remainingTicks <= 0) {
      signal.cycleIndex = signal.cycleIndex + 1;
      signal.phase = cycle[signal.cycleIndex % cycle.length] ?? 'GREEN';
      signal.remainingTicks = 10;
    }
  }
}

function advanceOpportunities(world: MutableWorld): void {
  const index = world.tick % world.opportunities.length;
  const opportunity = world.opportunities[index];
  if (opportunity === undefined) return;
  const draw = advanceWorldRng(world.rng, 'opportunities');
  world.rng = draw.rng;
  opportunity.evaluated = true;
  opportunity.evaluatedTick = world.tick;
  opportunity.verdict = draw.value > 0.5 ? 'ALLOW' : 'DENY';
}

function advanceDedup(world: MutableWorld): void {
  world.dedup.lastEventSequence = world.tick * 2;
  world.dedup.seenEventIds = [
    ...world.dedup.seenEventIds.slice(-7),
    `event-${String(world.tick).padStart(4, '0')}`,
  ];
}

/** One deterministic authoritative tick; the caller decides when the tick boundary is reached. */
export function stepWorld(world: MutableWorld): void {
  world.tick += 1;
  for (let index = 0; index < world.vehicles.length; index += 1) {
    const vehicle = world.vehicles[index];
    if (vehicle !== undefined) advanceVehicle(world, vehicle, index);
  }
  advanceSignals(world);
  advanceOpportunities(world);
  advanceDedup(world);
  applyRideLinks(world);
  const openSegment = world.segments.find((segment) => segment.segmentId === 'segment-taxi-01');
  if (openSegment !== undefined) openSegment.sampleCount = world.tick;
}

function copyVector(value: WorldVehicleState['position']): WorldVehicleState['position'] {
  return { x: value.x, y: value.y, z: value.z };
}

function copyQuaternion(value: WorldVehicleState['rotation']): WorldVehicleState['rotation'] {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

/** One synchronous, defensive copy of all subsystems at the current tick. */
export function captureInput(world: MutableWorld): Mutable<WorldCaptureInput> {
  return {
    tick: world.tick,
    tickBoundary: 'BOUNDARY',
    subsystemTicks: {
      physics: world.tick,
      controllers: world.tick,
      rides: world.tick,
      passengers: world.tick,
      opportunities: world.tick,
      signals: world.tick,
      dispatch: world.tick,
      learning: world.tick,
      rng: world.tick,
    },
    worldEpoch: world.worldEpoch,
    profile: { ...world.profile },
    vehicles: world.vehicles.map((vehicle) => ({
      ...vehicle,
      position: copyVector(vehicle.position),
      rotation: copyQuaternion(vehicle.rotation),
      linearVelocity: copyVector(vehicle.linearVelocity),
      angularVelocity: copyVector(vehicle.angularVelocity),
      passengerIds: [...vehicle.passengerIds],
    })),
    controllers: world.controllers.map((controller) => ({
      ...controller,
      memory: { ...controller.memory },
    })),
    rides: world.rides.map((ride) => ({ ...ride })),
    passengers: world.passengers.map((passenger) => ({ ...passenger })),
    segments: world.segments.map((segment) => ({ ...segment })),
    opportunities: world.opportunities.map((opportunity) => ({ ...opportunity })),
    signals: world.signals.map((signal) => ({ ...signal })),
    dispatch: {
      pending: world.dispatch.pending.map((job) => ({ ...job })),
      acceptedResults: world.dispatch.acceptedResults.map((result) => ({ ...result })),
    },
    learning: {
      learningEpoch: world.learning.learningEpoch,
      pendingJobs: world.learning.pendingJobs.map((job) => ({ ...job })),
      completedObservations: world.learning.completedObservations.map((observation) => ({
        ...observation,
      })),
      acceptedResultKeys: [...world.learning.acceptedResultKeys],
    },
    rng: { seed: world.rng.seed, streams: { ...world.rng.streams } },
    dedup: {
      lastEventSequence: world.dedup.lastEventSequence,
      seenEventIds: [...world.dedup.seenEventIds],
    },
  };
}

export function worldSource(world: MutableWorld): WorldSnapshotSource {
  return {
    get tick(): number {
      return world.tick;
    },
    boundary: 'BOUNDARY',
    capture: () => captureInput(world),
  };
}

/** Rebuilds a mutable world from a stored snapshot, exactly as a reload would. */
export function createWorldFromSnapshot(state: WorldSnapshotState): MutableWorld {
  return JSON.parse(JSON.stringify(state)) as MutableWorld;
}

/** Canonical state used to compare an oracle run with a restored run byte for byte. */
export function canonicalWorld(world: MutableWorld): string {
  const canonical = canonicalizeJson(captureInput(world), { maxDepth: 24 });
  if (canonical.status === 'REJECTED') {
    throw new Error(`The fixture state is not canonical: ${canonical.rejection.message}`);
  }
  return canonical.text;
}

export function runWorld(world: MutableWorld, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) stepWorld(world);
}
