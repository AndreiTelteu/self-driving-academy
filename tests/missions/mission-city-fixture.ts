import {
  createFleetScenario,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetScenario, ProfileActivation } from '../../src/fleet';
import { createCandidateProfileStore } from '../../src/learning';
import { parameterDefinitions } from '../../src/profiles';
import type { ProfileStore } from '../../src/profiles';
import type { CityMissionInput } from '../../src/missions';

/**
 * Fixture for PBI 122.
 *
 * Every number the mission consumes is produced by a delivered contract: the 057 registry creates
 * the 20 taxis and 20 civilians, the 109 store owns the published profile versions, the real 110
 * activation writes the common version at a future tick, and the 059/060/061 chain creates and
 * closes the rides. The fixture only authors *which* vehicle takes a ride and whether that ride
 * completes, is damaged or is cancelled, exactly like the 115 simulated encounter plan.
 */
export const CITY_FIXTURE_PROFILE_ID = 'city:common';
export const CITY_FIXTURE_ENGINE_VERSION = 'engine-122';
export const CITY_FIXTURE_NOW = '2026-11-11T00:00:00.000Z';
export const CITY_FIXTURE_SEED = 122_000;
export const CITY_FIXTURE_TAXIS = 20;
export const CITY_FIXTURE_CIVILIANS = 20;
export const CITY_FIXTURE_BASE_VERSION = 'city-122-base';
export const CITY_FIXTURE_PRUDENT_VERSION = 'city-122-prudent';
export const CITY_FIXTURE_RISKY_VERSION = 'city-122-risky';
export const CITY_FIXTURE_STALE_VERSION = 'city-122-stale';
export const CITY_FIXTURE_VISIBLE_SLOTS = Object.freeze([1, 2, 3] as const);
export const CITY_FIXTURE_WINDOW_TICKS = 600;

export type CityRunKind = 'PRUDENT' | 'RISKY' | 'STALE';
export type CityRideOutcome = 'COMPLETED' | 'DAMAGED' | 'CANCELLED';

export interface CityRidePlan {
  readonly slot: number;
  readonly outcome: CityRideOutcome;
}

export interface CityFixtureWorld {
  readonly scenario: FleetScenario;
  readonly store: ProfileStore;
  readonly activation: ProfileActivation;
  readonly clock: { value: number };
  readonly appliedTick: number;
  readonly vehiclesUpdated: number;
}

export interface CityRun {
  readonly kind: CityRunKind;
  readonly input: CityMissionInput;
  readonly visibleVehicleIds: readonly string[];
  readonly ridePlan: readonly CityRidePlan[];
  readonly world: CityFixtureWorld;
  dispose(): void;
}

function fail(message: string): never {
  throw new Error(message);
}

function baseParameters(overrides: Readonly<Record<string, number>>): Record<string, number> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  return Object.assign(parameters, overrides);
}

/** The real 092 defaults for the player's cautious style. */
export function cityFixtureParameters(
  style: 'PRUDENT' | 'RISKY' | 'STALE',
): Record<string, number> {
  if (style === 'PRUDENT')
    return baseParameters({
      speed_delta_urban: -2,
      red_stop_probability: 1,
      stop_full_probability: 0.95,
    });
  if (style === 'RISKY')
    return baseParameters({
      speed_delta_urban: 12,
      red_stop_probability: 0.2,
      stop_full_probability: 0.15,
    });
  return baseParameters({
    speed_delta_urban: -2,
    red_stop_probability: 1,
    stop_full_probability: 0.55,
  });
}

/** The authored ride plan: slot 1-3 are the camera set, every other serving slot is invisible. */
export const CITY_RIDE_PLANS: Readonly<Record<CityRunKind, readonly CityRidePlan[]>> =
  Object.freeze({
    PRUDENT: Object.freeze(
      [1, 2, 3, 4, 5, 6, 7, 8].map((slot) =>
        Object.freeze({ slot, outcome: 'COMPLETED' as const }),
      ),
    ),
    RISKY: Object.freeze([
      Object.freeze({ slot: 1, outcome: 'COMPLETED' as const }),
      Object.freeze({ slot: 2, outcome: 'DAMAGED' as const }),
      Object.freeze({ slot: 3, outcome: 'COMPLETED' as const }),
      Object.freeze({ slot: 4, outcome: 'DAMAGED' as const }),
      Object.freeze({ slot: 5, outcome: 'DAMAGED' as const }),
      Object.freeze({ slot: 6, outcome: 'DAMAGED' as const }),
      Object.freeze({ slot: 7, outcome: 'DAMAGED' as const }),
      Object.freeze({ slot: 8, outcome: 'COMPLETED' as const }),
    ]),
    STALE: Object.freeze(
      [1, 2, 3, 4, 5, 6, 7, 8].map((slot) =>
        Object.freeze({ slot, outcome: 'COMPLETED' as const }),
      ),
    ),
  });

function createVersions(store: ProfileStore): void {
  const entries = [
    [CITY_FIXTURE_BASE_VERSION, cityFixtureParameters('PRUDENT')],
    [CITY_FIXTURE_PRUDENT_VERSION, cityFixtureParameters('PRUDENT')],
    [CITY_FIXTURE_RISKY_VERSION, cityFixtureParameters('RISKY')],
    [CITY_FIXTURE_STALE_VERSION, cityFixtureParameters('STALE')],
  ] as const;
  for (const [versionId, parameters] of entries) {
    const created = store.createBase({
      profileId: CITY_FIXTURE_PROFILE_ID,
      versionId,
      parameters,
      createdAt: CITY_FIXTURE_NOW,
    });
    if (created.status !== 'ACCEPTED') fail(`109 rejected the ${versionId} base version`);
  }
}

function createWorld(kind: CityRunKind): CityFixtureWorld {
  const scenario = createFleetScenario({
    taxiCount: CITY_FIXTURE_TAXIS,
    civilianCount: CITY_FIXTURE_CIVILIANS,
    seed: CITY_FIXTURE_SEED,
    scenarioId: `city-122-${kind.toLowerCase()}`,
    sessionId: 'session-122',
    worldEpoch: 1,
  });
  const store = createCandidateProfileStore({
    engineVersion: CITY_FIXTURE_ENGINE_VERSION,
    now: () => CITY_FIXTURE_NOW,
  });
  createVersions(store);
  const playerVersion =
    kind === 'RISKY' ? CITY_FIXTURE_RISKY_VERSION : CITY_FIXTURE_PRUDENT_VERSION;
  const clock = { value: 0 };
  const source = createProfileActivationSource({
    profileId: CITY_FIXTURE_PROFILE_ID,
    versionId: CITY_FIXTURE_BASE_VERSION,
  });
  const activation = createProfileActivation({
    registry: scenario.registry,
    source,
    engineVersion: CITY_FIXTURE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => CITY_FIXTURE_NOW,
  });
  const publication = activation.publish({
    profileId: CITY_FIXTURE_PROFILE_ID,
    versionId: playerVersion,
    engineVersion: CITY_FIXTURE_ENGINE_VERSION,
    publishedAtTick: 0,
    activateAtTick: 1,
    reason: '122 city mission fixture',
    origin: 'LEARNED',
    idempotencyKey: `122:${kind}:publish`,
  });
  if (publication.status !== 'ACCEPTED')
    fail(`110 rejected the publication: ${publication.rejection?.code ?? 'unknown'}`);
  clock.value = 1;
  const applied = activation.applyAt(1);
  if (applied.status !== 'APPLIED' || applied.appliedTick === null)
    fail(`110 did not apply the common version: ${applied.status}`);
  clock.value = applied.appliedTick;
  if (kind === 'STALE') {
    for (const slot of [2, 4, 6, 8, 10, 12]) {
      const vehicleId = scenario.taxiIds[slot - 1] ?? scenario.civilianIds[slot - 1];
      if (vehicleId === undefined) fail('Stale fleet override needs a real vehicle');
      scenario.registry.updateState(vehicleId, {
        tick: applied.appliedTick + 1,
        appliedProfileVersion: CITY_FIXTURE_STALE_VERSION,
      });
    }
  }
  return {
    scenario,
    store,
    activation,
    clock,
    appliedTick: applied.appliedTick,
    vehiclesUpdated: applied.updated.length,
  };
}

function driveRidePlan(world: CityFixtureWorld, plan: readonly CityRidePlan[]): void {
  const { scenario } = world;
  scenario.demand.advance(1000);
  let atTick = world.appliedTick + 10;
  for (const entry of plan) {
    const target = scenario.taxiIds[entry.slot - 1];
    if (target === undefined) fail(`Ride plan slot ${entry.slot} has no taxi`);
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
    if (assignment.taxiId !== target) fail('060 assigned a taxi outside the ride plan');
    atTick += 1;
    const begun = scenario.lifecycle.begin({
      requestId: assignment.requestId,
      eventId: `assigned:${assignment.requestId}`,
      tick: atTick,
    });
    const rideId = begun.ride.rideId;
    const apply = (event: string, extra: Record<string, unknown> = {}): void => {
      atTick += 1;
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
    if (entry.outcome === 'COMPLETED') {
      apply('ARRIVED_DROPOFF');
      apply('DROPOFF_COMPLETE');
    } else if (entry.outcome === 'DAMAGED') {
      apply('FAILED', { reason: 'TAXI_DAMAGED' });
    } else {
      apply('CANCELLED', { reason: 'PASSENGER_CANCELLED' });
    }
    atTick += 1;
  }
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

function missionInput(world: CityFixtureWorld, kind: CityRunKind): CityMissionInput {
  const { scenario, store } = world;
  const playerVersion =
    kind === 'RISKY' ? CITY_FIXTURE_RISKY_VERSION : CITY_FIXTURE_PRUDENT_VERSION;
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
  versionIds.add(playerVersion);
  const visibleVehicleIds = CITY_FIXTURE_VISIBLE_SLOTS.map((slot) => {
    const id = scenario.taxiIds[slot - 1];
    if (id === undefined) fail(`Visible slot ${slot} has no taxi`);
    return id;
  });
  return Object.freeze({
    profile: versionFacts(store, playerVersion),
    versions: Object.freeze(
      [...versionIds].sort().map((versionId) => versionFacts(store, versionId)),
    ),
    fleet: Object.freeze({
      taxis: counts.taxis,
      civilians: counts.civilians,
      vehicles: Object.freeze(vehicles),
    }),
    observation: Object.freeze({
      windowTicks: CITY_FIXTURE_WINDOW_TICKS,
      visibleVehicleIds: Object.freeze(visibleVehicleIds),
    }),
    activation: Object.freeze({
      profileId: CITY_FIXTURE_PROFILE_ID,
      versionId: playerVersion,
      appliedTick: world.appliedTick,
      vehiclesUpdated: world.vehiclesUpdated,
    }),
    rides: Object.freeze(
      scenario.lifecycle.terminal().map((ride) =>
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

/** Builds one complete, real run: 057/059/060/061 plus 109/110. */
export function buildCityRun(kind: CityRunKind): CityRun {
  const world = createWorld(kind);
  const ridePlan = CITY_RIDE_PLANS[kind];
  driveRidePlan(world, ridePlan);
  const input = missionInput(world, kind);
  return {
    kind,
    input,
    visibleVehicleIds: input.observation.visibleVehicleIds,
    ridePlan,
    world,
    dispose(): void {
      world.activation.dispose();
      world.scenario.dispose();
      world.store.dispose();
    },
  };
}
