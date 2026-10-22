import {
  CIVIL_TRAFFIC_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
  FLEET_STATE_FIELDS,
  FLEET_VEHICLE_FIELDS,
} from '../fleet';
import type {
  CivilActorSnapshot,
  CivilTraffic,
  CivilTrafficVehicleObservation,
  FleetRegistry,
  FleetVehicleState,
  ProfileActivation,
  ProfileActivationSource,
} from '../fleet';
import { crossClassStyleSources, knownProfiles } from '../experiments';
import type { CrossClassStyle } from '../experiments';
import { createCandidateProfileStore } from '../learning';
import { getParameterDefinition, parameterDefinitions, parseDrivingProfile } from '../profiles';
import type { DrivingProfile, ParameterKey, ProfileStore } from '../profiles';
import { requireContract, tick as readTick } from '../sessions';
import { mechanicalCapabilities } from '../telemetry';
import { VEHICLE_CLASS_VERSION, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId } from '../vehicles';
import { createLaneGraph, createNeighbourhoodMap, createRoutePlanner } from '../world';
import type { LaneGraph, RoadMap } from '../world';
import { createProfilePipeline } from './profile-pipeline';
import type {
  ProfileLearningSegment,
  ProfilePipeline,
  ProfilePipelineActivationStep,
  ProfilePipelineQueue,
  ProfilePipelineResult,
} from './profile-pipeline';

/**
 * 208 live city-style propagation harness.
 *
 * It wires the real modules already delivered into one deterministic offline session: the 057 fleet
 * registry (taxis and civilians), the 110 common-tick activation, the 058 civil traffic over the
 * real 041/044/046/047/048 chain, the 112 learning pipeline with an injected 103 queue outcome and
 * the 106 style targets. It proves that taxis and civilians share exactly one common profile
 * version, that later vehicles read the same target, that civilian routes and mechanical classes
 * survive a style change, that a civil MANUAL segment is not learnable and that an eligible civil
 * LEARNING segment updates both categories.
 *
 * The harness never writes physics, routes or rides. Activation writes only `tick` and
 * `appliedProfileVersion`; civil traffic keeps its own 058 write surface. No browser, renderer,
 * Rapier body or wall-clock value participates.
 */
export const CITY_STYLE_VERSION = '208-city-style-v1' as const;

export const CITY_STYLE_PROFILE_ID = 'city-profile-208';
export const CITY_STYLE_ENGINE_VERSION = 'engine-208';
export const CITY_STYLE_BASE_VERSION = 'city-style-base-208';
export const CITY_STYLE_SESSION_ID = 'session-208-city-style';
export const CITY_STYLE_PLAYER_ID = 'player-208';
export const CITY_STYLE_SCENARIO_ID = 'city-style-208';
export const CITY_STYLE_NAMESPACE = 'city:208:style';
export const CITY_STYLE_WORLD_EPOCH = 1;
export const CITY_STYLE_SEED = 208_000;
export const CITY_STYLE_NOW = '2026-10-22T00:00:00.000Z';
export const CITY_STYLE_TICK_HZ = 60;
export const CITY_STYLE_STEP_SECONDS = 1 / CITY_STYLE_TICK_HZ;
/** The key the civil city style learns in this harness; a real 092 initial learning target. */
export const CITY_STYLE_LEARNING_KEY: ParameterKey = 'speed_delta_urban';

export const CITY_STYLE_LIMITS = Object.freeze({
  vehicles: 110,
  routeLanes: CIVIL_TRAFFIC_LIMITS.routeLanes,
  civilActors: CIVIL_TRAFFIC_LIMITS.actors,
  routeAttempts: CIVIL_TRAFFIC_LIMITS.routeAttempts,
  minimumGapM: CIVIL_TRAFFIC_LIMITS.minimumGapM,
  retainedHistory: 0,
});

/** Closed scenario vocabulary; one isolated world per scenario keeps the evidence deterministic. */
export const cityStyleScenarioIds = [
  'MIXED_ACTIVATION',
  'HIDDEN_VEHICLES',
  'LATER_SPAWN',
  'CIVIL_MANUAL',
  'CIVIL_RELEASE',
  'CIVIL_LEARNING',
  'ROUTE_PRESERVATION',
] as const;
export type CityStyleScenarioId = (typeof cityStyleScenarioIds)[number];

/** One real 103 port plus its owner-side disposal; 208 never reimplements the queue. */
export interface CityStyleQueueHandle {
  readonly queue: ProfilePipelineQueue;
  dispose?(): void;
}

export interface CityStyleScenarioServices {
  /** Creates one real 103 queue port per isolated scenario world. */
  readonly createQueue: () => CityStyleQueueHandle;
  /** Closed segment observed by the fleet before the first common activation. */
  readonly learningSegment: ProfileLearningSegment;
  /** Closed eligible LEARNING segment observed while a civilian imitates the common style. */
  readonly civilLearningSegment: ProfileLearningSegment;
  /** Closed MANUAL segment observed by a player-driven civilian. */
  readonly civilManualSegment: ProfileLearningSegment;
  readonly seed?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
}

/** One registry write observed through the 110 plan wrapper; never a physics or route write. */
export interface RegistryWrite {
  readonly method: string;
  readonly vehicleId: string | null;
  readonly fields: readonly string[];
}

export interface CityStyleCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CityStyleActivationOutcome {
  readonly activationTick: number;
  readonly appliedTick: number;
  readonly step: ProfilePipelineActivationStep;
  /** Activation-only write surface, recorded through the instrumented 110 registry port. */
  readonly writes: readonly RegistryWrite[];
  readonly afterActivation: Readonly<Record<string, number>>;
  readonly afterRefresh: Readonly<Record<string, number>>;
  readonly tickHistogram: Readonly<Record<string, number>>;
}

export interface CityStylePhaseReport {
  readonly phase: CityStyleScenarioId;
  readonly status: 'PASS' | 'FAIL';
  /** Closed 110/112 status of the decisive scenario step. */
  readonly scenarioStatus: string;
  readonly tick: number;
  readonly activationStatus: string;
  readonly activationTick: number | null;
  readonly appliedTick: number | null;
  readonly before: Readonly<Record<string, number>>;
  readonly after: Readonly<Record<string, number>>;
  readonly changedIds: readonly string[];
  readonly commonVersionAfter: string;
  readonly controlModesBefore: Readonly<Record<string, number>>;
  readonly controlModesAfter: Readonly<Record<string, number>>;
  readonly preservedRoutes: number;
  readonly routeFingerprintsPreserved: boolean;
  readonly hiddenOverrides: readonly string[];
  readonly laterSpawnVersion: string | null;
  readonly manualVersionChanges: number;
  readonly learningVersion: string | null;
  readonly crossCategoryUpdated: boolean;
  readonly writes: readonly RegistryWrite[];
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CityStyleScenarioReport {
  readonly version: typeof CITY_STYLE_VERSION;
  readonly contract: Readonly<{
    profileId: string;
    engineVersion: string;
    baseVersionId: string;
    learningKey: string;
    styleSources: Readonly<Record<CrossClassStyle, string>>;
    scenarios: readonly CityStyleScenarioId[];
    stateFields: readonly string[];
    vehicleFields: readonly string[];
    presentationFields: readonly string[];
    limits: Readonly<Record<string, number>>;
    tickHz: number;
    seed: number;
  }>;
  readonly phases: readonly CityStylePhaseReport[];
  readonly checks: readonly CityStyleCheck[];
  readonly summary: Readonly<{
    phases: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
  readonly commonVersionAfter: string;
  readonly hiddenOverrides: readonly string[];
  readonly laterSpawnVersion: string | null;
  readonly manualVersionChanges: number;
  readonly learningVersion: string | null;
  readonly crossCategoryUpdated: boolean;
}

interface InstrumentedRegistry {
  readonly registry: FleetRegistry;
  readonly writes: RegistryWrite[];
  reset(): void;
}

export interface CityStyleWorldOptions {
  readonly queue: ProfilePipelineQueue;
  readonly seed?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  readonly learningEpoch?: number;
}

export interface CityStyleWorld {
  readonly store: ProfileStore;
  readonly registry: FleetRegistry;
  readonly activation: ProfileActivation;
  readonly traffic: CivilTraffic;
  readonly pipeline: ProfilePipeline;
  readonly graph: LaneGraph;
  readonly map: RoadMap;
  readonly clock: { value: number };
  readonly taxiIds: readonly string[];
  readonly civilianIds: readonly string[];
  readonly lastTick: number | null;
  activeVersion(): string;
  versionHistogram(): Readonly<Record<string, number>>;
  controlModes(): Readonly<Record<string, number>>;
  tickHistogram(): Readonly<Record<string, number>>;
  versionsOf(kind: 'TAXI' | 'CIVILIAN'): readonly string[];
  versionsConsistent(): boolean;
  hiddenOverrides(): readonly string[];
  stepTo(target: number): void;
  learn(segment: ProfileLearningSegment): Promise<ProfilePipelineResult>;
  applyPending(result: ProfilePipelineResult): CityStyleActivationOutcome;
  learnAndApply(segment: ProfileLearningSegment): Promise<CityStyleActivationOutcome>;
  dispose(): void;
}

const presentationFields = Object.freeze([
  'camera',
  'hidden',
  'isPlayer',
  'mesh',
  'renderer',
  'screen',
  'selected',
  'visible',
]);

const controlModeIds: readonly ControlMode[] = Object.freeze(['AUTO', 'MANUAL', 'LEARNING']);

function styleTargets(style: CrossClassStyle): ReadonlyMap<ParameterKey, number> {
  const profileId = crossClassStyleSources[style];
  const profile = knownProfiles.find((entry) => entry.profileId === profileId);
  requireContract(profile !== undefined, `105 has no ${profileId} style profile`);
  return new Map(profile.targets.map((target) => [target.key, target.value]));
}

/** The base city style: real 092 defaults, with the 106 cautious targets on the 24 M keys. */
export function cityStyleParameters(
  style: CrossClassStyle = 'CAUTIOUS',
): Readonly<Record<string, number>> {
  const targets = styleTargets(style);
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  for (const [key, value] of targets) parameters[key] = value;
  return Object.freeze(parameters);
}

function styleProjection(store: ProfileStore, versionId: string): DrivingProfile {
  const version = store.getVersion(versionId);
  requireContract(version !== null, `The city style source has no version ${versionId}`);
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, string> = Object.create(null);
  const provenanceByParameter: Record<string, string> = Object.create(null);
  const evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    // 092 still reports estimable=false for every key, so a published DrivingProfile cannot carry
    // LEARNED provenance; 208 projects the stored values without granting a learning capability.
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parseDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [...version.sourceSegmentIds],
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

function instrumentRegistry(registry: FleetRegistry): InstrumentedRegistry {
  const writes: RegistryWrite[] = [];
  const record = (method: string, vehicleId: string | null, fields: readonly string[]): void => {
    writes.push(Object.freeze({ method, vehicleId, fields: Object.freeze([...fields]) }));
  };
  const wrapper: FleetRegistry = {
    configuration: registry.configuration,
    context: () => registry.context(),
    get: (vehicleId) => registry.get(vehicleId),
    state: (vehicleId) => registry.state(vehicleId),
    list: () => registry.list(),
    addVehicle: (driverKind, classId, options) => {
      record('addVehicle', null, []);
      return registry.addVehicle(driverKind, classId, options);
    },
    updateState: (vehicleId, patch) => {
      const fields =
        typeof patch === 'object' && patch !== null && !Array.isArray(patch)
          ? Object.keys(patch)
          : [];
      record('updateState', vehicleId, fields);
      return registry.updateState(vehicleId, patch);
    },
    removeVehicle: (vehicleId) => {
      record('removeVehicle', vehicleId, []);
      return registry.removeVehicle(vehicleId);
    },
    counts: () => registry.counts(),
    report: () => registry.report(),
    dispose: () => registry.dispose(),
  };
  return {
    registry: wrapper,
    writes,
    reset: (): void => {
      writes.length = 0;
    },
  };
}

function configuration(
  seed: number,
  taxiCount: number,
  civilianCount: number,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: CITY_STYLE_SESSION_ID,
    worldEpoch: CITY_STYLE_WORLD_EPOCH,
    scenarioId: CITY_STYLE_SCENARIO_ID,
    seed,
    namespace: CITY_STYLE_NAMESPACE,
    taxiCount,
    civilianCount,
    profile: { profileId: CITY_STYLE_PROFILE_ID, versionId: CITY_STYLE_BASE_VERSION },
  };
}

/** Exact lane-centre sample used only to place the two external taxi observations of 058. */
function laneSample(
  graph: LaneGraph,
  laneId: string,
  longitudinalM: number,
): { positionM: { x: number; y: number; z: number }; headingRad: number } {
  const path = graph.getDirectedPath(laneId);
  requireContract(path !== null, `Unknown lane ${laneId}`);
  let remaining = Math.min(Math.max(longitudinalM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!;
    const to = path.points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        positionM: Object.freeze({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        }),
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
      };
    }
    remaining -= length;
  }
  const last = path.points[path.points.length - 1]!;
  return { positionM: last, headingRad: 0 };
}

/**
 * One isolated live session: real 109 store, real 057 registry wired to the writable 110 source,
 * real 110 controller, real 058 civil traffic over the 041 planner and the real 112 pipeline.
 */
export function createCityStyleWorld(options: CityStyleWorldOptions): CityStyleWorld {
  const seed = options.seed ?? CITY_STYLE_SEED;
  const taxiCount = options.taxiCount ?? 20;
  const civilianCount = options.civilianCount ?? 20;
  requireContract(taxiCount >= 20 && taxiCount <= 30, '208 taxi count within the 057 bounds');
  requireContract(
    civilianCount >= 20 && civilianCount <= CIVIL_TRAFFIC_LIMITS.actors,
    '208 civilian count within the 057/058 bounds',
  );
  const clock = { value: 0 };
  const store = createCandidateProfileStore({
    engineVersion: CITY_STYLE_ENGINE_VERSION,
    now: () => CITY_STYLE_NOW,
  });
  const base = store.createBase({
    profileId: CITY_STYLE_PROFILE_ID,
    versionId: CITY_STYLE_BASE_VERSION,
    parameters: cityStyleParameters('CAUTIOUS'),
    createdAt: CITY_STYLE_NOW,
  });
  requireContract(base.status === 'ACCEPTED', '208 base style version rejected by 109');

  const source: ProfileActivationSource = createProfileActivationSource({
    profileId: CITY_STYLE_PROFILE_ID,
    versionId: CITY_STYLE_BASE_VERSION,
  });
  const registry = createFleetRegistry(configuration(seed, taxiCount, civilianCount), {
    profileSource: source,
  });
  const instrumented = instrumentRegistry(registry);
  const activation = createProfileActivation({
    registry: instrumented.registry,
    source,
    engineVersion: CITY_STYLE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => CITY_STYLE_NOW,
  });

  const map = createNeighbourhoodMap();
  const graph = createLaneGraph(map);
  const planner = createRoutePlanner({
    graph,
    map,
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
  });
  const styleSource = {
    activeStyle: (): DrivingProfile => styleProjection(store, activation.activeProfile().versionId),
  };
  const traffic = createCivilTraffic({
    registry,
    map,
    graph,
    planner,
    styleSource,
    seed,
  });

  const pipeline = createProfilePipeline({
    engineVersion: CITY_STYLE_ENGINE_VERSION,
    playerId: CITY_STYLE_PLAYER_ID,
    profileId: CITY_STYLE_PROFILE_ID,
    learningEpoch: options.learningEpoch ?? 1,
    sessionId: CITY_STYLE_SESSION_ID,
    worldEpoch: CITY_STYLE_WORLD_EPOCH,
    queue: options.queue,
    store,
    activation,
    tick: () => clock.value,
    advanceTick: () => {
      clock.value += 1;
      return clock.value;
    },
  });

  const taxiIds = registry
    .list()
    .filter((vehicle) => vehicle.driverKind === 'TAXI')
    .map((vehicle) => vehicle.vehicleId);
  const civilianIds = registry
    .list()
    .filter((vehicle) => vehicle.driverKind === 'CIVILIAN')
    .map((vehicle) => vehicle.vehicleId);
  const frameLanes = map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .map((lane) => lane.id)
    .sort();
  const observations: readonly CivilTrafficVehicleObservation[] = Object.freeze(
    frameLanes.slice(0, 2).map((laneId, index) => {
      const sample = laneSample(graph, laneId, 30 + index * 20);
      return Object.freeze({
        vehicleId: taxiIds[index]!,
        driverKind: 'TAXI' as const,
        positionM: sample.positionM,
        headingRad: sample.headingRad,
        speedMps: 0,
        radiusM: CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
      });
    }),
  );

  let lastTick: number | null = null;
  let disposed = false;

  function assertLive(): void {
    requireContract(!disposed, '208 city style world disposed');
  }

  function stateOf(vehicleId: string): FleetVehicleState {
    const state = registry.state(vehicleId);
    requireContract(state !== undefined, `Missing fleet state for ${vehicleId}`);
    return state;
  }

  function countBy(
    values: readonly string[],
    keys?: readonly string[],
  ): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const key of keys ?? []) counts[key] = 0;
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return Object.freeze(
      Object.fromEntries(
        Object.keys(counts)
          .sort()
          .map((key) => [key, counts[key]!]),
      ),
    );
  }

  function versionValues(): readonly string[] {
    return registry.list().map((vehicle) => stateOf(vehicle.vehicleId).appliedProfileVersion);
  }

  function versionsOf(kind: 'TAXI' | 'CIVILIAN'): readonly string[] {
    return [
      ...new Set(
        registry
          .list()
          .filter((vehicle) => vehicle.driverKind === kind)
          .map((vehicle) => stateOf(vehicle.vehicleId).appliedProfileVersion),
      ),
    ].sort();
  }

  function hiddenOverrides(): readonly string[] {
    const overrides: string[] = [];
    for (const vehicle of registry.list()) {
      if (vehicle.profileId !== CITY_STYLE_PROFILE_ID) overrides.push(vehicle.vehicleId);
      const fields = Object.keys(vehicle).sort();
      if (fields.join(',') !== [...FLEET_VEHICLE_FIELDS].sort().join(','))
        overrides.push(`${vehicle.vehicleId}:fields`);
      if (vehicle.classVersion !== VEHICLE_CLASS_VERSION)
        overrides.push(`${vehicle.vehicleId}:class-version`);
    }
    return Object.freeze(overrides);
  }

  function stepTo(target: number): void {
    assertLive();
    const limit = readTick(target);
    for (let atTick = (lastTick ?? 0) + 1; atTick <= limit; atTick += 1) {
      traffic.step({ tick: atTick, dtSeconds: CITY_STYLE_STEP_SECONDS, vehicles: observations });
      lastTick = atTick;
      clock.value = atTick;
    }
    if (lastTick !== null && limit >= 0 && limit < lastTick) clock.value = lastTick;
  }

  async function learn(segment: ProfileLearningSegment): Promise<ProfilePipelineResult> {
    assertLive();
    return pipeline.onSegmentClosed(segment);
  }

  function applyPending(result: ProfilePipelineResult): CityStyleActivationOutcome {
    assertLive();
    requireContract(
      result.activation !== null && result.activation.activateAtTick !== null,
      '208 needs a published 110 command to apply',
    );
    const activationTick = readTick(result.activation.activateAtTick);
    // The 058 module only writes the common tick once it has simulated it, so the civil frame is
    // advanced to the scheduled tick before the 110 command is applied.
    stepTo(activationTick);
    clock.value = activationTick;
    instrumented.reset();
    const step = pipeline.advance();
    requireContract(step !== null && step.status === 'APPLIED', '208 activation was not applied');
    const writes = Object.freeze(instrumented.writes.slice());
    const afterActivation = versionHistogram();
    // 058 keeps its own compiled bundle: the explicit refresh is the documented propagation and it
    // must happen only after APPLIED, never while the 110 source still reports the pending target.
    const refreshed = traffic.refreshStyle();
    const afterRefresh = versionHistogram();
    requireContract(
      step.versionId === refreshed.versionId && Object.keys(afterRefresh).length === 1,
      '208 refreshStyle did not adopt the single applied version',
    );
    return Object.freeze({
      activationTick,
      appliedTick: step.appliedTick ?? activationTick,
      step,
      writes,
      afterActivation,
      afterRefresh,
      tickHistogram: tickHistogram(),
    });
  }

  async function learnAndApply(
    segment: ProfileLearningSegment,
  ): Promise<CityStyleActivationOutcome> {
    const result = await learn(segment);
    requireContract(
      result.status === 'COMPOSED' || result.status === 'RECOMPOSED',
      `208 expected one learned version, got ${result.status}`,
    );
    return applyPending(result);
  }

  function versionHistogram(): Readonly<Record<string, number>> {
    return countBy(versionValues());
  }

  function controlModes(): Readonly<Record<string, number>> {
    return countBy(
      registry.list().map((vehicle) => stateOf(vehicle.vehicleId).controlMode),
      controlModeIds,
    );
  }

  function tickHistogram(): Readonly<Record<string, number>> {
    return countBy(
      registry.list().map((vehicle) => String(stateOf(vehicle.vehicleId).tick)),
      [],
    );
  }

  function versionsConsistent(): boolean {
    return new Set(versionValues()).size <= 1;
  }

  return {
    store,
    registry,
    activation,
    traffic,
    pipeline,
    graph,
    map,
    clock,
    taxiIds: Object.freeze(taxiIds),
    civilianIds: Object.freeze(civilianIds),
    get lastTick(): number | null {
      return lastTick;
    },
    activeVersion: (): string => activation.activeProfile().versionId,
    versionHistogram,
    controlModes,
    tickHistogram,
    versionsOf,
    versionsConsistent,
    hiddenOverrides,
    stepTo,
    learn,
    applyPending,
    learnAndApply,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pipeline.dispose();
      traffic.dispose();
      activation.dispose();
      registry.dispose();
      store.dispose();
    },
  };
}

function routeFingerprint(actor: CivilActorSnapshot): string {
  return JSON.stringify({
    source: actor.route.source,
    status: actor.route.status,
    path: actor.route.path,
    originLaneId: actor.route.originLaneId,
    destinationLaneId: actor.route.destinationLaneId,
    destinationKind: actor.route.destinationKind,
    costSeconds: actor.route.costSeconds,
    costVersion: actor.route.costVersion,
    graphVersion: actor.route.graphVersion,
  });
}

function mechanicalFingerprint(classId: VehicleClassId): string {
  const definition = vehicleClass(classId);
  const capability = mechanicalCapabilities(classId);
  return JSON.stringify({
    classId,
    classVersion: definition.version,
    massKg: definition.massKg,
    powerW: definition.powerW,
    engineForceN: definition.engineForceN,
    brakeAcceleration: definition.brakeAcceleration,
    grip: definition.grip,
    steeringRadians: definition.steeringRadians,
    turningRadiusM: definition.turningRadiusM,
    maxAccelerationMps2: capability.maxAccelerationMps2,
    maxDecelerationMps2: capability.maxDecelerationMps2,
    maxLateralAccelerationMps2: capability.maxLateralAccelerationMps2,
  });
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): CityStyleCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

interface PhaseOutcome {
  readonly report: CityStylePhaseReport;
  readonly checks: readonly CityStyleCheck[];
}

function writeSurface(writes: readonly RegistryWrite[]): readonly RegistryWrite[] {
  return Object.freeze(
    writes.map((entry) =>
      Object.freeze({
        method: entry.method,
        vehicleId: entry.vehicleId,
        fields: Object.freeze([...entry.fields].sort()),
      }),
    ),
  );
}

function buildPhaseReport(input: {
  readonly phase: CityStyleScenarioId;
  readonly scenarioStatus: string;
  readonly checks: readonly CityStyleCheck[];
  readonly tick: number;
  readonly activationStatus: string;
  readonly activationTick: number | null;
  readonly appliedTick: number | null;
  readonly before: Readonly<Record<string, number>>;
  readonly after: Readonly<Record<string, number>>;
  readonly changedIds: readonly string[];
  readonly commonVersionAfter: string;
  readonly controlModesBefore: Readonly<Record<string, number>>;
  readonly controlModesAfter: Readonly<Record<string, number>>;
  readonly preservedRoutes: number;
  readonly routeFingerprintsPreserved: boolean;
  readonly hiddenOverrides: readonly string[];
  readonly laterSpawnVersion?: string | null;
  readonly manualVersionChanges?: number;
  readonly learningVersion?: string | null;
  readonly crossCategoryUpdated?: boolean;
  readonly writes?: readonly RegistryWrite[];
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}): CityStylePhaseReport {
  return Object.freeze({
    phase: input.phase,
    status: input.checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
    scenarioStatus: input.scenarioStatus,
    tick: input.tick,
    activationStatus: input.activationStatus,
    activationTick: input.activationTick,
    appliedTick: input.appliedTick,
    before: input.before,
    after: input.after,
    changedIds: Object.freeze([...input.changedIds]),
    commonVersionAfter: input.commonVersionAfter,
    controlModesBefore: input.controlModesBefore,
    controlModesAfter: input.controlModesAfter,
    preservedRoutes: input.preservedRoutes,
    routeFingerprintsPreserved: input.routeFingerprintsPreserved,
    hiddenOverrides: Object.freeze([...(input.hiddenOverrides ?? [])]),
    laterSpawnVersion: input.laterSpawnVersion ?? null,
    manualVersionChanges: input.manualVersionChanges ?? 0,
    learningVersion: input.learningVersion ?? null,
    crossCategoryUpdated: input.crossCategoryUpdated ?? false,
    writes: writeSurface(input.writes ?? []),
    details: input.details,
  });
}

function openWorld(services: CityStyleScenarioServices): {
  readonly world: CityStyleWorld;
  readonly queue: CityStyleQueueHandle;
} {
  const queue = services.createQueue();
  const world = createCityStyleWorld({
    queue: queue.queue,
    ...(services.seed === undefined ? {} : { seed: services.seed }),
    ...(services.taxiCount === undefined ? {} : { taxiCount: services.taxiCount }),
    ...(services.civilianCount === undefined ? {} : { civilianCount: services.civilianCount }),
  });
  return { world, queue };
}

function closeWorld(world: CityStyleWorld, queue: CityStyleQueueHandle): void {
  world.dispose();
  queue.dispose?.();
}

function activationWritesOnlyVersionAndTick(writes: readonly RegistryWrite[]): boolean {
  return writes.every(
    (entry) =>
      entry.method === 'updateState' &&
      entry.fields.length === 2 &&
      entry.fields.includes('tick') &&
      entry.fields.includes('appliedProfileVersion'),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 1. One common profile published for the next fixed tick; nothing changes before it. */
async function mixedActivationPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(6);
    const before = world.versionHistogram();
    const modesBefore = world.controlModes();
    const reportBefore = world.registry.report();
    const listBefore = world.registry.list();
    const closing = await world.learn(services.learningSegment);
    requireContract(
      closing.status === 'COMPOSED' && closing.activation !== null,
      '208 mixed activation needs one composed version',
    );
    const activationTick = readTick(closing.activation.activateAtTick);
    const early = world.activation.applyAt(world.clock.value);
    const beforeTick = world.versionHistogram();
    const outcome = world.applyPending(closing);
    const after = outcome.afterRefresh;
    const modesAfter = world.controlModes();
    const expected = closing.versionId ?? 'missing';
    world.stepTo(activationTick + 1);
    const afterStep = world.versionHistogram();
    const checks: CityStyleCheck[] = [
      check(
        'mixed-before-tick-status',
        'PENDING',
        early.status,
        'the command is pending before the common tick',
      ),
      check(
        'mixed-before-tick-writes',
        0,
        early.updated.length,
        'no vehicle is written before the common tick',
      ),
      check(
        'mixed-before-tick-versions',
        `${CITY_STYLE_BASE_VERSION}=${before[CITY_STYLE_BASE_VERSION] ?? 0}`,
        Object.entries(beforeTick)
          .map(([version, count]) => `${version}=${count}`)
          .join(','),
        'the whole fleet keeps the base version before the tick',
      ),
      check(
        'mixed-applied-tick',
        activationTick,
        outcome.appliedTick,
        'every vehicle shares the scheduled common tick',
      ),
      check(
        'mixed-common-tick',
        `${activationTick}=${world.registry.list().length}`,
        Object.entries(outcome.tickHistogram)
          .map(([atTick, count]) => `${atTick}=${count}`)
          .join(','),
        'no vehicle keeps a different tick after the common activation',
      ),
      check(
        'mixed-common-version',
        1,
        Object.keys(after).length,
        'exactly one applied version remains after the tick',
      ),
      check(
        'mixed-common-version-id',
        expected,
        Object.keys(after)[0] ?? 'missing',
        'the applied version is the published one',
      ),
      check(
        'mixed-fleet-count',
        world.registry.list().length,
        Object.values(after).reduce((total, count) => total + count, 0),
        'both categories report the same version',
      ),
      check(
        'mixed-taxis-version',
        expected,
        world.versionsOf('TAXI').join(','),
        'taxis adopt the common version',
      ),
      check(
        'mixed-civilians-version',
        expected,
        world.versionsOf('CIVILIAN').join(','),
        'civilians adopt the common version',
      ),
      check(
        'mixed-control-modes',
        sameJson(modesBefore, modesAfter),
        true,
        'control modes are untouched by activation',
      ),
      check(
        'mixed-fleet-report',
        sameJson(reportBefore, world.registry.report()),
        true,
        'the fleet report is unchanged',
      ),
      check(
        'mixed-vehicle-list',
        sameJson(listBefore, world.registry.list()),
        true,
        'the vehicle list is unchanged',
      ),
      check(
        'mixed-write-surface',
        true,
        activationWritesOnlyVersionAndTick(outcome.writes),
        'activation writes only version and tick',
      ),
      check(
        'mixed-civil-after-step',
        expected,
        Object.keys(afterStep).join(','),
        'the next 60 Hz step keeps the common version',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'MIXED_ACTIVATION',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after,
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: modesBefore,
        controlModesAfter: modesAfter,
        preservedRoutes: 0,
        routeFingerprintsPreserved: true,
        hiddenOverrides: world.hiddenOverrides(),
        writes: outcome.writes,
        details: Object.freeze({
          fleet: world.registry.list().length,
          tick: activationTick,
          nextStepTick: activationTick + 1,
          updated: outcome.writes.length,
          closure: closing.status,
          beforeHistogram: Object.entries(before)
            .map(([version, count]) => `${version}=${count}`)
            .join(','),
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 2. Hidden, selected and player-driven vehicles still join the same plan. */
async function hiddenVehiclesPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(4);
    const before = world.versionHistogram();
    const hiddenIds = world.taxiIds.filter((_, index) => index % 5 === 0).slice(0, 3);
    const selectedIds = world.taxiIds.filter((_, index) => index % 7 === 0).slice(0, 3);
    for (const [index, vehicleId] of world.taxiIds.entries()) {
      if (index % 5 === 0)
        world.registry.updateState(vehicleId, { tick: 4, controlMode: 'MANUAL' });
      if (index % 7 === 0)
        world.registry.updateState(vehicleId, { tick: 4, controlMode: 'LEARNING' });
    }
    const markedModes = world.controlModes();
    const outcome = await world.learnAndApply(services.learningSegment);
    const versions = world.versionHistogram();
    const expected = outcome.step.versionId ?? 'missing';
    const planWrites = outcome.writes
      .filter((entry) => entry.method === 'updateState')
      .map((entry) => entry.vehicleId ?? 'missing');
    const checks: CityStyleCheck[] = [
      check(
        'hidden-marked-count',
        hiddenIds.length,
        new Set(hiddenIds).size,
        'hidden/selected ids are presentation-only',
      ),
      check(
        'hidden-plan-includes-marked',
        true,
        hiddenIds.every((id) => planWrites.includes(id)),
        'a presentation-hidden vehicle is part of the activation plan',
      ),
      check(
        'hidden-plan-includes-selected',
        true,
        selectedIds.every((id) => planWrites.includes(id)),
        'a selected vehicle is part of the activation plan',
      ),
      check(
        'hidden-manual-count',
        markedModes.MANUAL ?? 0,
        world.controlModes().MANUAL ?? 0,
        'MANUAL control modes survive the activation',
      ),
      check(
        'hidden-learning-count',
        markedModes.LEARNING ?? 0,
        world.controlModes().LEARNING ?? 0,
        'LEARNING control modes survive the activation',
      ),
      check(
        'hidden-common-version',
        expected,
        Object.keys(versions).join(','),
        'every hidden/selected/player vehicle reports the common version',
      ),
      check(
        'hidden-command',
        1,
        world.activation.commands().length,
        'one 110 command served the whole fleet',
      ),
      check(
        'hidden-no-presentation-state',
        0,
        presentationFields.filter((field) =>
          (FLEET_VEHICLE_FIELDS as readonly string[]).includes(field),
        ).length +
          presentationFields.filter((field) =>
            (FLEET_STATE_FIELDS as readonly string[]).includes(field),
          ).length,
        'selection and visibility are not fleet state',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'HIDDEN_VEHICLES',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick: outcome.activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: versions,
        changedIds: planWrites,
        commonVersionAfter: expected,
        controlModesBefore: markedModes,
        controlModesAfter: world.controlModes(),
        preservedRoutes: 0,
        routeFingerprintsPreserved: true,
        hiddenOverrides: world.hiddenOverrides(),
        writes: outcome.writes,
        details: Object.freeze({
          hiddenIds: hiddenIds.length,
          selectedIds: selectedIds.length,
          manual: world.controlModes().MANUAL ?? 0,
          learning: world.controlModes().LEARNING ?? 0,
          updated: planWrites.length,
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 3. A vehicle added before the tick reads the pending target; after the tick the active one. */
async function laterSpawnPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(4);
    const before = world.versionHistogram();
    const closing = await world.learn(services.learningSegment);
    requireContract(closing.activation !== null, '208 later spawn needs a published version');
    const activationTick = readTick(closing.activation.activateAtTick);
    const pendingTicket = world.registry.addVehicle('TAXI', 'compact', { tick: 4 });
    const pendingCitizen = world.registry.addVehicle('CIVILIAN', 'sedan', { tick: 4 });
    const pendingVersion = world.registry.state(pendingTicket.vehicleId)!.appliedProfileVersion;
    const pendingCivilVersion = world.registry.state(
      pendingCitizen.vehicleId,
    )!.appliedProfileVersion;
    const outcome = world.applyPending(closing);
    const expected = outcome.step.versionId ?? 'missing';
    const appliedVehicle = world.registry.addVehicle('TAXI', 'sedan', { tick: activationTick });
    const appliedCivil = world.registry.addVehicle('CIVILIAN', 'compact', { tick: activationTick });
    const appliedVersion = world.registry.state(appliedVehicle.vehicleId)!.appliedProfileVersion;
    const appliedCivilVersion = world.registry.state(appliedCivil.vehicleId)!.appliedProfileVersion;
    const versions = world.versionHistogram();
    const checks: CityStyleCheck[] = [
      check(
        'later-pending-target',
        expected,
        pendingVersion,
        'a taxi created before the tick reads the pending common target',
      ),
      check(
        'later-pending-civilian',
        expected,
        pendingCivilVersion,
        'a civilian created before the tick reads the pending common target',
      ),
      check(
        'later-active-target',
        expected,
        appliedVersion,
        'a taxi created after the tick reads the active version',
      ),
      check(
        'later-active-civilian',
        expected,
        appliedCivilVersion,
        'a civilian created after the tick reads the active version',
      ),
      check(
        'later-single-version',
        1,
        Object.keys(versions).length,
        'no per-kind or per-spawn version appears',
      ),
      check(
        'later-population',
        world.registry.counts().vehicles,
        Object.values(versions).reduce((total, count) => total + count, 0),
        'the whole grown fleet shares the version',
      ),
      check(
        'later-profile-identity',
        CITY_STYLE_PROFILE_ID,
        world.registry.get(appliedCivil.vehicleId)?.profileId ?? 'missing',
        'the later civilian has no private profile id',
      ),
      check(
        'later-no-extra-command',
        1,
        world.activation.commands().length,
        'later vehicles need no second activation',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'LATER_SPAWN',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: versions,
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: world.controlModes(),
        controlModesAfter: world.controlModes(),
        preservedRoutes: 0,
        routeFingerprintsPreserved: true,
        hiddenOverrides: world.hiddenOverrides(),
        laterSpawnVersion: appliedVersion,
        writes: outcome.writes,
        details: Object.freeze({
          pendingVersion,
          appliedVersion,
          pendingCivilVersion,
          appliedCivilVersion,
          grownPopulation: world.registry.list().length,
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 4. A civil MANUAL segment never creates a job, version or activation. */
async function civilManualPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(6);
    const civilianId = world.civilianIds[0]!;
    world.traffic.setAuthority(civilianId, 'MANUAL', 6);
    const before = world.versionHistogram();
    const manualActor = world.traffic.get(civilianId)!;
    const routeBefore = routeFingerprint(manualActor);
    const versionsBefore = world.store.listVersions(CITY_STYLE_PROFILE_ID).length;
    const commandsBefore = world.activation.commands().length;
    const manual = await world.learn(services.civilManualSegment);
    const versionsAfterManual = world.store.listVersions(CITY_STYLE_PROFILE_ID).length;
    const commandsAfterManual = world.activation.commands().length;
    const outcome = await world.learnAndApply(services.learningSegment);
    const expected = outcome.step.versionId ?? 'missing';
    const after = world.traffic.get(civilianId)!;
    const state = world.registry.state(civilianId)!;
    const checks: CityStyleCheck[] = [
      check(
        'manual-segment-status',
        'SKIPPED_MANUAL',
        manual.status,
        'a civil MANUAL segment is not learnable',
      ),
      check(
        'manual-segment-reason',
        'MANUAL_SEGMENT_NOT_LEARNABLE',
        manual.reason ?? 'missing',
        'the closed manual reason is reported',
      ),
      check('manual-segment-job', false, manual.jobSubmitted, 'MANUAL never reaches the 103 queue'),
      check('manual-segment-version', true, manual.versionId === null, 'MANUAL creates no version'),
      check(
        'manual-segment-activation',
        true,
        manual.activation === null,
        'MANUAL creates no 110 command',
      ),
      check(
        'manual-store-versions',
        versionsBefore,
        versionsAfterManual,
        'the 109 store is untouched by MANUAL',
      ),
      check(
        'manual-activations',
        commandsBefore,
        commandsAfterManual,
        'no activation command is published by MANUAL',
      ),
      check(
        'manual-mode-kept',
        'MANUAL',
        state.controlMode,
        'the civilian stays MANUAL after the common activation',
      ),
      check(
        'manual-route-kept',
        routeBefore,
        routeFingerprint(after),
        'the MANUAL civilian keeps its route',
      ),
      check(
        'manual-active-version',
        expected,
        state.appliedProfileVersion,
        'the MANUAL civilian records the common version',
      ),
      check(
        'manual-manual-version-changes',
        0,
        versionsAfterManual - versionsBefore,
        'MANUAL changes no version',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'CIVIL_MANUAL',
        scenarioStatus: manual.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick: outcome.activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: world.versionHistogram(),
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: world.controlModes(),
        controlModesAfter: world.controlModes(),
        preservedRoutes: 1,
        routeFingerprintsPreserved: routeFingerprint(after) === routeBefore,
        hiddenOverrides: world.hiddenOverrides(),
        manualVersionChanges: versionsAfterManual - versionsBefore,
        writes: outcome.writes,
        details: Object.freeze({
          civilianId,
          manualStatus: manual.status,
          manualActivations: commandsAfterManual - commandsBefore,
          learningVersion: expected,
          speedMps: after.speedMps,
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 5. Releasing a MANUAL civilian keeps the route and re-reads the common version. */
async function civilReleasePhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(6);
    const civilianId = world.civilianIds[1]!;
    world.traffic.setAuthority(civilianId, 'MANUAL', 6);
    const before = world.versionHistogram();
    const manualActor = world.traffic.get(civilianId)!;
    const routeBefore = routeFingerprint(manualActor);
    const outcome = await world.learnAndApply(services.learningSegment);
    const expected = outcome.step.versionId ?? 'missing';
    const held = world.traffic.get(civilianId)!;
    const released = world.traffic.resume(civilianId, outcome.activationTick);
    const registryAfterRelease = world.registry.state(civilianId)!;
    const beforeMove = released.distanceAlongRouteM;
    world.stepTo(outcome.activationTick + 1);
    const moved = world.traffic.get(civilianId)!;
    const checks: CityStyleCheck[] = [
      check(
        'release-held-version',
        expected,
        world.registry.state(civilianId)?.appliedProfileVersion ?? 'missing',
        'the MANUAL civilian records the common version',
      ),
      check(
        'release-held-route',
        routeBefore,
        routeFingerprint(held),
        'the MANUAL civilian keeps its route before release',
      ),
      check('release-mode', 'AUTO', released.authority, 'resume returns the civilian to AUTO'),
      check(
        'release-registry-mode',
        'AUTO',
        registryAfterRelease.controlMode,
        'the registry records the release',
      ),
      check(
        'release-version',
        expected,
        registryAfterRelease.appliedProfileVersion,
        'release keeps the active common version',
      ),
      check(
        'release-style-version',
        expected,
        released.styleVersionId,
        'the civilian re-reads the active style on release',
      ),
      check(
        'release-route',
        routeBefore,
        routeFingerprint(released),
        'release keeps the route fingerprint',
      ),
      check(
        'release-after-step-route',
        routeBefore,
        routeFingerprint(moved),
        'the next step keeps the same route',
      ),
      check(
        'release-moves-again',
        true,
        moved.distanceAlongRouteM > beforeMove,
        'the released civilian drives again',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'CIVIL_RELEASE',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick: outcome.activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: world.versionHistogram(),
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: world.controlModes(),
        controlModesAfter: world.controlModes(),
        preservedRoutes: 1,
        routeFingerprintsPreserved: routeFingerprint(moved) === routeBefore,
        hiddenOverrides: world.hiddenOverrides(),
        writes: outcome.writes,
        details: Object.freeze({
          civilianId,
          releasedTick: outcome.activationTick,
          distanceBeforeM: beforeMove,
          distanceAfterM: moved.distanceAlongRouteM,
          speedMps: moved.speedMps,
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 6. An eligible civil LEARNING segment creates one version for both categories. */
async function civilLearningPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(6);
    const civilianId = world.civilianIds[2]!;
    world.traffic.setAuthority(civilianId, 'LEARNING', 6);
    const learningActor = world.traffic.get(civilianId)!;
    const routeBefore = routeFingerprint(learningActor);
    const before = world.versionHistogram();
    const versionsBefore = world.store.listVersions(CITY_STYLE_PROFILE_ID).length;
    const commandsBefore = world.activation.commands().length;
    const outcome = await world.learnAndApply(services.civilLearningSegment);
    const versionsAfter = world.store.listVersions(CITY_STYLE_PROFILE_ID).length;
    const commandsAfter = world.activation.commands().length;
    const expected = outcome.step.versionId ?? 'missing';
    const taxiVersions = world.versionsOf('TAXI');
    const civilianVersions = world.versionsOf('CIVILIAN');
    const actor = world.traffic.get(civilianId)!;
    const version = world.store.getVersion(expected);
    const base = world.store.getVersion(CITY_STYLE_BASE_VERSION);
    const checks: CityStyleCheck[] = [
      check(
        'learning-version-created',
        1,
        versionsAfter - versionsBefore,
        'one eligible civil segment creates exactly one version',
      ),
      check(
        'learning-version-id',
        expected,
        version?.versionId ?? 'missing',
        'the pipeline reports the stored version',
      ),
      check(
        'learning-parameter-changed',
        true,
        version !== null && base !== null
          ? version.parameters[CITY_STYLE_LEARNING_KEY] !== base.parameters[CITY_STYLE_LEARNING_KEY]
          : false,
        'the learned style value differs from the base',
      ),
      check(
        'learning-taxi-version',
        expected,
        taxiVersions.join(','),
        'taxis adopt the version learned from a civilian',
      ),
      check(
        'learning-civilian-version',
        expected,
        civilianVersions.join(','),
        'civilians adopt the same version',
      ),
      check(
        'learning-cross-category',
        true,
        taxiVersions.length === 1 &&
          civilianVersions.length === 1 &&
          taxiVersions[0] === civilianVersions[0],
        'both categories share the learned style',
      ),
      check(
        'learning-one-activation',
        1,
        commandsAfter - commandsBefore,
        'one learning version publishes one activation',
      ),
      check(
        'learning-mode-kept',
        'LEARNING',
        world.registry.state(civilianId)?.controlMode ?? 'missing',
        'the LEARNING control mode is preserved',
      ),
      check(
        'learning-route-kept',
        routeBefore,
        routeFingerprint(actor),
        'learning does not change the civilian route',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'CIVIL_LEARNING',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick: outcome.activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: world.versionHistogram(),
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: world.controlModes(),
        controlModesAfter: world.controlModes(),
        preservedRoutes: 1,
        routeFingerprintsPreserved: routeFingerprint(actor) === routeBefore,
        hiddenOverrides: world.hiddenOverrides(),
        learningVersion: expected,
        crossCategoryUpdated:
          taxiVersions.length === 1 &&
          civilianVersions.length === 1 &&
          taxiVersions[0] === civilianVersions[0],
        writes: outcome.writes,
        details: Object.freeze({
          civilianId,
          learnedValue: version?.parameters[CITY_STYLE_LEARNING_KEY] ?? null,
          baseValue: base?.parameters[CITY_STYLE_LEARNING_KEY] ?? null,
          taxiVersions: taxiVersions.join(','),
          civilianVersions: civilianVersions.join(','),
          versionsCreated: versionsAfter - versionsBefore,
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** 7. Routes, mechanical classes and limits survive the style change exactly. */
async function routePreservationPhase(services: CityStyleScenarioServices): Promise<PhaseOutcome> {
  const { world, queue } = openWorld(services);
  try {
    world.stepTo(12);
    const before = world.versionHistogram();
    const routesBefore = world.traffic.list().map((actor) => routeFingerprint(actor));
    const classesBefore = world.traffic.list().map((actor) => actor.classId);
    const limitsBefore = classesBefore.map((classId) => mechanicalFingerprint(classId));
    const vehiclesBefore = world.registry.list();
    const registryStatesBefore = world.registry.list().map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      controlMode: world.registry.state(vehicle.vehicleId)!.controlMode,
    }));
    const reportBefore = world.registry.report();
    const outcome = await world.learnAndApply(services.learningSegment);
    const expected = outcome.step.versionId ?? 'missing';
    const routesAfter = world.traffic.list().map((actor) => routeFingerprint(actor));
    const classesAfter = world.traffic.list().map((actor) => actor.classId);
    const limitsAfter = classesAfter.map((classId) => mechanicalFingerprint(classId));
    const modesPreserved = registryStatesBefore.every(
      (entry) => world.registry.state(entry.vehicleId)?.controlMode === entry.controlMode,
    );
    const preserved = routesBefore.filter((route, index) => route === routesAfter[index]).length;
    const checks: CityStyleCheck[] = [
      check(
        'preserve-civilian-count',
        routesBefore.length,
        world.traffic.list().length,
        'no civilian is created or removed',
      ),
      check(
        'preserve-routes',
        routesBefore.length,
        preserved,
        'every civilian keeps its exact 041 route fingerprint',
      ),
      check(
        'preserve-classes',
        classesBefore.join(','),
        classesAfter.join(','),
        'the 023 mechanical class is unchanged',
      ),
      check(
        'preserve-limits',
        limitsBefore.join('|'),
        limitsAfter.join('|'),
        'the mechanical limits are unchanged',
      ),
      check(
        'preserve-vehicles',
        sameJson(vehiclesBefore, world.registry.list()),
        true,
        'the vehicle list (profileId, class, slot) is unchanged',
      ),
      check(
        'preserve-fleet-report',
        sameJson(reportBefore, world.registry.report()),
        true,
        'the fleet population report is unchanged',
      ),
      check(
        'preserve-control-modes',
        true,
        modesPreserved,
        'control modes are unchanged by activation',
      ),
      check(
        'preserve-only-version-and-tick',
        true,
        activationWritesOnlyVersionAndTick(outcome.writes),
        'only version and tick were written',
      ),
      check(
        'preserve-common-version',
        expected,
        Object.keys(world.versionHistogram()).join(','),
        'only the applied version evolves',
      ),
      check(
        'preserve-no-hidden-override',
        0,
        world.hiddenOverrides().length,
        'no class-specific or per-kind profile override exists',
      ),
      check(
        'preserve-civil-style-source',
        CITY_STYLE_PROFILE_ID,
        new Set(world.traffic.list().map((actor) => actor.styleProfileId)).size === 1
          ? (world.traffic.list()[0]?.styleProfileId ?? 'missing')
          : 'mixed',
        'every civilian reads the one common city profile',
      ),
    ];
    return {
      checks,
      report: buildPhaseReport({
        phase: 'ROUTE_PRESERVATION',
        scenarioStatus: outcome.step.status,
        checks,
        tick: world.clock.value,
        activationStatus: outcome.step.status,
        activationTick: outcome.activationTick,
        appliedTick: outcome.appliedTick,
        before,
        after: world.versionHistogram(),
        changedIds: outcome.writes
          .filter((entry) => entry.method === 'updateState')
          .map((entry) => entry.vehicleId ?? 'missing'),
        commonVersionAfter: expected,
        controlModesBefore: world.controlModes(),
        controlModesAfter: world.controlModes(),
        preservedRoutes: preserved,
        routeFingerprintsPreserved: preserved === routesBefore.length,
        hiddenOverrides: world.hiddenOverrides(),
        writes: outcome.writes,
        details: Object.freeze({
          civilians: routesBefore.length,
          preservedRoutes: preserved,
          classes: new Set(classesAfter).size,
          ticks: Object.keys(outcome.tickHistogram).join(','),
        }),
      }),
    };
  } finally {
    closeWorld(world, queue);
  }
}

/** Runs the seven isolated 208 scenarios over the injected real 103 port. */
export async function runCityStyleScenario(
  services: CityStyleScenarioServices,
): Promise<CityStyleScenarioReport> {
  const outcomes = [
    await mixedActivationPhase(services),
    await hiddenVehiclesPhase(services),
    await laterSpawnPhase(services),
    await civilManualPhase(services),
    await civilReleasePhase(services),
    await civilLearningPhase(services),
    await routePreservationPhase(services),
  ];
  const phases = outcomes.map((outcome) => outcome.report);
  const checks = outcomes.flatMap((outcome) => [...outcome.checks]);
  const passed = checks.filter((entry) => entry.pass).length;
  const byPhase = new Map(phases.map((phase) => [phase.phase, phase]));
  const manual = byPhase.get('CIVIL_MANUAL');
  const learning = byPhase.get('CIVIL_LEARNING');
  const later = byPhase.get('LATER_SPAWN');
  const overwritten = phases.flatMap((phase) => [...phase.hiddenOverrides]);
  return Object.freeze({
    version: CITY_STYLE_VERSION,
    contract: Object.freeze({
      profileId: CITY_STYLE_PROFILE_ID,
      engineVersion: CITY_STYLE_ENGINE_VERSION,
      baseVersionId: CITY_STYLE_BASE_VERSION,
      learningKey: CITY_STYLE_LEARNING_KEY,
      styleSources: Object.freeze({
        CAUTIOUS: crossClassStyleSources.CAUTIOUS,
        ASSERTIVE: crossClassStyleSources.ASSERTIVE,
      }),
      scenarios: Object.freeze([...cityStyleScenarioIds]),
      stateFields: Object.freeze([...FLEET_STATE_FIELDS]),
      vehicleFields: Object.freeze([...FLEET_VEHICLE_FIELDS]),
      presentationFields,
      limits: Object.freeze({
        vehicles: CITY_STYLE_LIMITS.vehicles,
        civilActors: CITY_STYLE_LIMITS.civilActors,
        routeLanes: CITY_STYLE_LIMITS.routeLanes,
        routeAttempts: CITY_STYLE_LIMITS.routeAttempts,
        minimumGapM: CITY_STYLE_LIMITS.minimumGapM,
        retainedHistory: CITY_STYLE_LIMITS.retainedHistory,
      }),
      tickHz: CITY_STYLE_TICK_HZ,
      seed: services.seed ?? CITY_STYLE_SEED,
    }),
    phases: Object.freeze(phases),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      phases: phases.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
    commonVersionAfter: phases[phases.length - 1]?.commonVersionAfter ?? CITY_STYLE_BASE_VERSION,
    hiddenOverrides: Object.freeze(overwritten),
    laterSpawnVersion: later?.laterSpawnVersion ?? null,
    manualVersionChanges: manual?.manualVersionChanges ?? 0,
    learningVersion: learning?.learningVersion ?? null,
    crossCategoryUpdated: learning?.crossCategoryUpdated ?? false,
  });
}

const BACKTICK = '`';
const DASH = '\u2014';

function code(value: string | number | boolean | null): string {
  return BACKTICK + String(value) + BACKTICK;
}

function countsText(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .map(([key, count]) => key + '=' + String(count))
    .join(',');
}

function phaseRow(phase: CityStylePhaseReport): string {
  return (
    '| ' +
    [
      phase.phase,
      code(phase.status),
      code(phase.scenarioStatus),
      phase.appliedTick === null ? DASH : String(phase.appliedTick),
      String(phase.changedIds.length),
      phase.commonVersionAfter,
      phase.routeFingerprintsPreserved ? 'PASS' : 'FAIL',
    ].join(' | ') +
    ' |'
  );
}

function phaseSection(phase: CityStylePhaseReport): string {
  const writeFields = [...new Set(phase.writes.flatMap((write) => write.fields))].sort().join(',');
  return [
    '### ' + phase.phase,
    '',
    'Status: ' +
      code(phase.status) +
      '; scenario: ' +
      code(phase.scenarioStatus) +
      '; tick: ' +
      String(phase.tick) +
      '.',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| before | ' + countsText(phase.before) + ' |',
    '| after | ' + countsText(phase.after) + ' |',
    '| control modes | ' + countsText(phase.controlModesAfter) + ' |',
    '| changed ids | ' + String(phase.changedIds.length) + ' |',
    '| common version | ' + phase.commonVersionAfter + ' |',
    '| preserved routes | ' + String(phase.preservedRoutes) + ' |',
    '| hidden overrides | ' + String(phase.hiddenOverrides.length) + ' |',
    '| write fields | ' + (writeFields.length === 0 ? DASH : writeFields) + ' |',
    ...Object.entries(phase.details).map(
      ([key, value]) => '| ' + key + ' | ' + String(value) + ' |',
    ),
    '',
  ].join('\n');
}

function checkRow(entry: CityStyleCheck): string {
  return (
    '| ' +
    [
      entry.name,
      String(entry.expected),
      String(entry.actual),
      entry.pass ? 'PASS' : 'FAIL',
      entry.detail,
    ].join(' | ') +
    ' |'
  );
}

/** Deterministic Markdown view of the frozen 208 report. */
export function cityStyleReportMarkdown(report: CityStyleScenarioReport): string {
  return [
    '# 208 city style propagation report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run city:style') +
      '; it',
    'contains no wall-clock value, random source, browser state or physics write.',
    '',
    'Version: ' +
      code(report.version) +
      '; profile: ' +
      code(report.contract.profileId) +
      '; engine: ' +
      code(report.contract.engineVersion) +
      '; base: ' +
      code(report.contract.baseVersionId) +
      '.',
    '',
    '## Contract',
    '',
    'Taxis and civilians share one common profile version at one common tick. The style targets are',
    'the 105 known-profile targets consumed through 106: ' +
      code(report.contract.styleSources.CAUTIOUS) +
      ' for the base and ' +
      code(report.contract.styleSources.ASSERTIVE) +
      ' for the learned candidate. The learning key is ' +
      code(report.contract.learningKey) +
      '.',
    'Fleet state fields: ' + report.contract.stateFields.map(code).join(', ') + '.',
    'Presentation-only fields rejected from fleet state: ' +
      report.contract.presentationFields.map(code).join(', ') +
      '.',
    '',
    'Scenarios: ' + report.contract.scenarios.join(', ') + '.',
    '',
    '## Phases',
    '',
    '| Phase | Result | Scenario status | Applied tick | Changed ids | Common version | Routes |',
    '| --- | --- | --- | ---: | ---: | --- | --- |',
    ...report.phases.map(phaseRow),
    '',
    ...report.phases.map(phaseSection),
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(checkRow),
    '',
    '## Summary',
    '',
    '- Scenarios: ' + String(report.summary.phases),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Common version after: ' + report.commonVersionAfter,
    '- Later spawn version: ' + (report.laterSpawnVersion ?? DASH),
    '- Manual version changes: ' + String(report.manualVersionChanges),
    '- Learning version: ' + (report.learningVersion ?? DASH),
    '- Cross-category update: ' + code(report.crossCategoryUpdated),
    '- Hidden overrides: ' + String(report.hiddenOverrides.length),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- The harness is offline and deterministic: it runs the real 057/058/110/112 modules but no',
    '  Rapier body, renderer, camera or browser session.',
    '- The 103 queue is injected by the caller (the real queue with a synthetic transport in the',
    '  report), so the estimator transport is not part of this evidence.',
    '- The 058 module keeps its own style bundle; the composition root must call ' +
      code('refreshStyle()') +
      ' after',
    '  an APPLIED activation and before the next civil step. The harness does exactly that and',
    '  records the order.',
    '- The DrivingProfile projection of a stored version marks values BASE because the 092 registry',
    '  still reports ' +
      code('estimable: false') +
      ' for every key; 208 does not change that registry.',
    '',
  ].join('\n');
}
