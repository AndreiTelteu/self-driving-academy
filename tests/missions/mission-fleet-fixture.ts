import {
  createFleetScenario,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetScenario, RideRecord, RideRequest } from '../../src/fleet';
import { createCandidateProfileStore } from '../../src/learning';
import {
  evaluateCityMission,
  evaluateFleetMission,
  fleetChallengeDefinition,
} from '../../src/missions';
import type {
  CityMissionInput,
  CityMissionResult,
  FleetMissionInput,
  FleetMissionResult,
} from '../../src/missions';
import { parameterDefinitions } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';

/**
 * Fixture for PBI 124.
 *
 * Every value the challenge consumes is produced by a delivered contract: the real 065 fleet
 * scenario composes 032/033/041, 057, 059, 060, 061 and 064; the 109 store owns the published
 * profile versions; the real 110 activation writes the common version on a common tick; the 121
 * comfort rides are real ride windows; the 122 fidelity is the real city evaluation of the same
 * fleet, and the incidents are real-shaped 007 `COLLISION` envelopes.
 *
 * The fixture only authors the service plan (which real request ends completed, failed, cancelled
 * or stays pending), the comfort profile of three rides, how many vehicles kept the old version and
 * how many real collisions happened. Those are the player's decisions, not mission arithmetic.
 */
/** The 065 fleet scenario owns the fleet profile reference `city:common`, so the 109 store uses it. */
export const FLEET_FIXTURE_PROFILE_ID = 'city:common';
export const FLEET_FIXTURE_ENGINE_VERSION = 'engine-124';
export const FLEET_FIXTURE_NOW = '2026-11-11T00:00:00.000Z';
export const FLEET_FIXTURE_SEED = 124_000;
export const FLEET_FIXTURE_SESSION_ID = 'session-124';
export const FLEET_FIXTURE_WORLD_EPOCH = 1;
export const FLEET_FIXTURE_BASE_VERSION = 'fleet-124-base';
export const FLEET_FIXTURE_V1_VERSION = 'fleet-124-v1';
export const FLEET_FIXTURE_V2_VERSION = 'fleet-124-v2';
export const FLEET_FIXTURE_REQUESTS_PER_WINDOW = 8;
export const FLEET_FIXTURE_WINDOWS = 4;
export const FLEET_FIXTURE_REQUESTS = FLEET_FIXTURE_REQUESTS_PER_WINDOW * FLEET_FIXTURE_WINDOWS;
export const FLEET_FIXTURE_ASSIGNMENT_TICK = 240;
export const FLEET_FIXTURE_PROMISE_TICKS = 600;
export const FLEET_FIXTURE_STALE_VEHICLES = 6;

export type FleetProfileVariant = 'V1' | 'V2';

export interface FleetServicePlan {
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
}

export interface FleetRunOptions {
  readonly profile?: FleetProfileVariant;
  /** Defaults to the whole 32-request schedule completed. */
  readonly service?: FleetServicePlan;
  /** Number of vehicles left on the base version; the real 057 state is overridden. */
  readonly staleVehicles?: number;
  readonly comfortRides?: number;
  readonly comfort?: 'PASS' | 'FAIL';
  /** Number of real 007 COLLISION events published inside the window. */
  readonly incidents?: number;
  /** Request whose ride closes after its promise, to exercise the late target. */
  readonly lateRequestIndex?: number | null;
  /** Overrides the observation end; defaults to the last real ride tick. */
  readonly endedAtTick?: number;
}

export interface FleetFixtureWorld {
  readonly scenario: FleetScenario;
  readonly store: ProfileStore;
  readonly clock: { value: number };
  readonly appliedTick: number;
  readonly vehiclesUpdated: number;
  readonly profileVersionId: string;
  dispose(): void;
}

function fail(message: string): never {
  throw new Error(message);
}

function baseParameters(overrides: Readonly<Record<string, number>> = {}): Record<string, number> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  return Object.assign(parameters, overrides);
}

function createWorld(profileVersionId: string, staleVehicles: number): FleetFixtureWorld {
  if (staleVehicles < 0 || staleVehicles > FLEET_FIXTURE_STALE_VEHICLES)
    fail('Stale vehicle count is outside the fixture range');
  const scenario = createFleetScenario({
    taxiCount: 20,
    civilianCount: 20,
    requestsPerWindow: FLEET_FIXTURE_REQUESTS_PER_WINDOW,
    seed: FLEET_FIXTURE_SEED,
    scenarioId: 'fleet-124',
    sessionId: FLEET_FIXTURE_SESSION_ID,
    worldEpoch: FLEET_FIXTURE_WORLD_EPOCH,
  });
  const store = createCandidateProfileStore({
    engineVersion: FLEET_FIXTURE_ENGINE_VERSION,
    now: () => FLEET_FIXTURE_NOW,
  });
  for (const [versionId, parameters] of [
    [FLEET_FIXTURE_BASE_VERSION, baseParameters()],
    [FLEET_FIXTURE_V1_VERSION, baseParameters()],
    [FLEET_FIXTURE_V2_VERSION, baseParameters({ speed_delta_urban: 3 })],
  ] as const) {
    const created = store.createBase({
      profileId: FLEET_FIXTURE_PROFILE_ID,
      versionId,
      parameters,
      createdAt: FLEET_FIXTURE_NOW,
    });
    if (created.status !== 'ACCEPTED') fail(`109 rejected the ${versionId} base version`);
  }
  const clock = { value: 0 };
  const source = createProfileActivationSource({
    profileId: FLEET_FIXTURE_PROFILE_ID,
    versionId: FLEET_FIXTURE_BASE_VERSION,
  });
  const activation = createProfileActivation({
    registry: scenario.registry,
    source,
    engineVersion: FLEET_FIXTURE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => FLEET_FIXTURE_NOW,
  });
  const publication = activation.publish({
    profileId: FLEET_FIXTURE_PROFILE_ID,
    versionId: profileVersionId,
    engineVersion: FLEET_FIXTURE_ENGINE_VERSION,
    publishedAtTick: 0,
    activateAtTick: 1,
    reason: '124 fleet challenge fixture',
    origin: 'LEARNED',
    idempotencyKey: `124:${profileVersionId}:publish`,
  });
  if (publication.status !== 'ACCEPTED')
    fail(`110 rejected the publication: ${publication.rejection?.code ?? 'unknown'}`);
  clock.value = 1;
  const applied = activation.applyAt(1);
  if (applied.status !== 'APPLIED' || applied.appliedTick === null)
    fail(`110 did not apply the common version: ${applied.status}`);
  clock.value = applied.appliedTick;
  const vehicleIds = [...scenario.taxiIds, ...scenario.civilianIds];
  for (let index = 0; index < staleVehicles; index += 1) {
    const vehicleId = vehicleIds[index * 2];
    if (vehicleId === undefined) fail('Stale fleet override needs a real vehicle');
    scenario.registry.updateState(vehicleId, {
      tick: applied.appliedTick + 1,
      appliedProfileVersion: FLEET_FIXTURE_BASE_VERSION,
    });
  }
  return {
    scenario,
    store,
    clock,
    appliedTick: applied.appliedTick,
    vehiclesUpdated: applied.updated.length,
    profileVersionId,
    dispose(): void {
      activation.dispose();
      scenario.dispose();
      store.dispose();
    },
  };
}

const EVENT_STEP_TICKS = 5;

function driveRides(world: FleetFixtureWorld, plan: FleetServicePlan): number {
  const { scenario } = world;
  scenario.demand.advance(FLEET_FIXTURE_ASSIGNMENT_TICK);
  const schedule = [
    ...Array.from({ length: plan.completed }, () => 'COMPLETED' as const),
    ...Array.from({ length: plan.failed }, () => 'FAILED' as const),
    ...Array.from({ length: plan.cancelled }, () => 'CANCELLED' as const),
  ];
  if (schedule.length > FLEET_FIXTURE_REQUESTS) fail('Service plan exceeds the 059 schedule');
  let atTick = 2;
  for (const [index, outcome] of schedule.entries()) {
    const target = scenario.taxiIds[index % scenario.taxiIds.length];
    if (target === undefined) fail('Ride plan has no taxi');
    for (const taxiId of scenario.taxiIds)
      scenario.dispatcher.setTaxiStatus(
        taxiId,
        taxiId === target ? 'AVAILABLE' : 'BLOCKED',
        atTick,
      );
    const step = scenario.dispatcher.step({ tick: atTick, maxAssignments: 1 });
    const assignment = step.assigned[0];
    if (assignment === undefined || step.assigned.length !== 1)
      fail('060 did not assign the single available taxi');
    if (assignment.taxiId !== target) fail('060 assigned a taxi outside the service plan');
    atTick += EVENT_STEP_TICKS;
    const begun = scenario.lifecycle.begin({
      requestId: assignment.requestId,
      eventId: `assigned:${assignment.requestId}`,
      tick: atTick,
    });
    const rideId = begun.ride.rideId;
    const apply = (event: string, extra: Record<string, unknown> = {}): void => {
      atTick += EVENT_STEP_TICKS;
      scenario.lifecycle.apply({
        rideId,
        eventId: `${rideId}:${event}:${atTick}`,
        event,
        tick: atTick,
        ...extra,
      });
    };
    apply('ARRIVED_PICKUP');
    apply('PICKUP_COMPLETE');
    if (outcome === 'COMPLETED') {
      apply('ARRIVED_DROPOFF');
      apply('DROPOFF_COMPLETE');
    } else if (outcome === 'FAILED') {
      apply('FAILED', { reason: 'TAXI_DAMAGED' });
    } else {
      apply('CANCELLED', { reason: 'PASSENGER_CANCELLED' });
    }
  }
  return atTick;
}

function versionFacts(store: ProfileStore, versionId: string) {
  const version = store.getVersion(versionId);
  if (version === null) fail(`109 has no version ${versionId}`);
  return Object.freeze({
    profileId: version.profileId,
    versionId: version.versionId,
    parameters: version.parameters,
  });
}

function cityInput(world: FleetFixtureWorld, rides: readonly RideRecord[]): CityMissionInput {
  const { scenario, store } = world;
  const counts = scenario.registry.counts();
  const vehicles = scenario.registry.list().map((vehicle) => {
    const state = scenario.registry.state(vehicle.vehicleId);
    if (state === undefined) fail(`057 has no state for ${vehicle.vehicleId}`);
    return Object.freeze({
      vehicleId: vehicle.vehicleId,
      driverKind: vehicle.driverKind,
      classId: vehicle.classId,
      controlMode: state.controlMode,
      appliedProfileVersion: state.appliedProfileVersion,
    });
  });
  const versionIds = new Set(vehicles.map((vehicle) => vehicle.appliedProfileVersion));
  versionIds.add(world.profileVersionId);
  return Object.freeze({
    profile: versionFacts(store, world.profileVersionId),
    versions: Object.freeze(
      [...versionIds].sort().map((versionId) => versionFacts(store, versionId)),
    ),
    fleet: Object.freeze({
      taxis: counts.taxis,
      civilians: counts.civilians,
      vehicles: Object.freeze(vehicles),
    }),
    observation: Object.freeze({
      windowTicks: 600,
      visibleVehicleIds: Object.freeze(scenario.taxiIds.slice(0, 3)),
    }),
    activation: Object.freeze({
      profileId: FLEET_FIXTURE_PROFILE_ID,
      versionId: world.profileVersionId,
      appliedTick: world.appliedTick,
      vehiclesUpdated: world.vehiclesUpdated,
    }),
    rides: Object.freeze(
      rides.map((ride) =>
        Object.freeze({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          state: ride.state,
          reason: ride.reason,
          totalCostSeconds: ride.totalCostSeconds,
        }),
      ),
    ),
  });
}

function comfortRide(ride: RideRecord, outcome: 'PASS' | 'FAIL') {
  const startTick = ride.startedTick;
  const endTick = ride.updatedTick;
  const samples: Record<string, number>[] = [];
  for (let tick = startTick; tick <= endTick; tick += 1) {
    const offset = tick - startTick;
    const speedMps = outcome === 'PASS' ? 10 : offset === 1 ? 15 : 10;
    samples.push({ tick, speedMps });
  }
  return Object.freeze({
    rideId: ride.rideId,
    vehicleId: ride.taxiId,
    rideState: 'DROPOFF' as const,
    segments: Object.freeze([
      Object.freeze({
        segmentId: `comfort:${ride.rideId}`,
        controlMode: 'AUTO' as const,
        learningEligible: false,
        startTick,
        endTick,
      }),
    ]),
    startTick,
    endTick,
    samples: Object.freeze(samples.map((sample) => Object.freeze(sample))),
    artifactWindows: Object.freeze([]),
  });
}

/** Real 007 `COLLISION` envelope, exactly the shape the 028 adapter publishes. */
export function fleetCollision(
  eventId: string,
  tick: number,
  vehicleId: string,
  otherEntityId = 'obstacle:124',
) {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: FLEET_FIXTURE_SESSION_ID,
    worldEpoch: FLEET_FIXTURE_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: Object.freeze([vehicleId, otherEntityId]),
    type: 'COLLISION' as const,
    payload: Object.freeze({ vehicleId, otherEntityId, impulseNs: 1_500 }),
  });
}

export interface FleetRun {
  readonly input: FleetMissionInput;
  readonly result: FleetMissionResult;
  readonly city: CityMissionResult;
  readonly requests: readonly RideRequest[];
  readonly rides: readonly RideRecord[];
  readonly world: FleetFixtureWorld;
  dispose(): void;
}

/** Builds one complete, real run: 057/059/060/061/109/110 plus the 121/122 facts. */
export function buildFleetRun(options: FleetRunOptions = {}): FleetRun {
  const profile = options.profile ?? 'V1';
  const profileVersionId = profile === 'V2' ? FLEET_FIXTURE_V2_VERSION : FLEET_FIXTURE_V1_VERSION;
  const world = createWorld(profileVersionId, options.staleVehicles ?? 0);
  const plan: FleetServicePlan = options.service ?? {
    completed: FLEET_FIXTURE_REQUESTS,
    failed: 0,
    cancelled: 0,
  };
  const lastRideTick = driveRides(world, plan);
  const endedAtTick = options.endedAtTick ?? lastRideTick;
  const requests = world.scenario.demand.requests();
  const rides = world.scenario.lifecycle.terminal();
  const city = evaluateCityMission(cityInput(world, rides));
  const comfortRides = rides
    .filter((ride) => ride.state === 'COMPLETED')
    .slice(0, options.comfortRides ?? 3)
    .map((ride) => comfortRide(ride, options.comfort ?? 'PASS'));
  const incidents = Array.from({ length: options.incidents ?? 0 }, (_, index) =>
    fleetCollision(
      `collision:124:${index + 1}`,
      Math.max(0, endedAtTick - 1),
      world.scenario.taxiIds[index % world.scenario.taxiIds.length]!,
    ),
  );
  const promiseFor = (request: RideRequest, index: number): number => {
    if (options.lateRequestIndex !== index) return request.spawnTick + FLEET_FIXTURE_PROMISE_TICKS;
    return request.spawnTick + 1;
  };
  const input: FleetMissionInput = Object.freeze({
    definition: fleetChallengeDefinition(),
    difficulty: 'NORMAL',
    startTick: 0,
    endedAtTick,
    attempt: profile === 'V2' ? 2 : 1,
    profile: Object.freeze({
      profileId: FLEET_FIXTURE_PROFILE_ID,
      versionId: profileVersionId,
    }),
    fleet: Object.freeze({ taxis: world.scenario.taxiIds }),
    requests: Object.freeze(
      requests.map((request, index) =>
        Object.freeze({
          requestId: request.requestId,
          scenarioId: request.scenarioId,
          windowId: request.windowId,
          ordinal: request.ordinal,
          spawnTick: request.spawnTick,
          demandLevel: request.demandLevel,
          access: 'TAXI' as const,
          originZoneId: request.originZoneId,
          destinationZoneId: request.destinationZoneId,
          promiseTick: promiseFor(request, index),
        }),
      ),
    ),
    rides: Object.freeze(
      rides.map((ride) =>
        Object.freeze({
          rideId: ride.rideId,
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          assignmentId: ride.assignmentId,
          pickupZoneId: ride.pickupZoneId,
          dropoffZoneId: ride.dropoffZoneId,
          pickupCostSeconds: ride.pickupCostSeconds,
          tripCostSeconds: ride.tripCostSeconds,
          totalCostSeconds: ride.totalCostSeconds,
          state: ride.state,
          reason: ride.reason,
          startedTick: ride.startedTick,
          updatedTick: ride.updatedTick,
          terminal: true as const,
        }),
      ),
    ),
    incidents: Object.freeze(incidents),
    comfort: Object.freeze(comfortRides),
    city,
  });
  const result = evaluateFleetMission(input);
  return {
    input,
    result,
    city,
    requests,
    rides,
    world,
    dispose(): void {
      world.dispose();
    },
  };
}
