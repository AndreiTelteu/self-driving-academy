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
  CivilTraffic,
  CivilActorSnapshot,
  FleetRegistry,
  FleetVehicleState,
  ProfileActivation,
  ProfileActivationSource,
} from '../fleet';
import { createBehaviorMetrics, knownProfiles } from '../experiments';
import type { BehaviorMetrics, BehaviorMetricsSnapshot } from '../experiments';
import { createCandidateProfileStore, parameterEvidenceSpecs } from '../learning';
import type {
  ConfidenceCandidate,
  LearningJob,
  LearningJobOutcome,
  ProfileBlendEpisode,
} from '../learning';
import { getParameterDefinition, parameterDefinitions, parseDrivingProfile } from '../profiles';
import type { DrivingProfile, ParameterKey, ProfileStore, ProfileVersion } from '../profiles';
import { requireContract, tick as readTick } from '../sessions';
import type { OpportunityRecord } from '../telemetry';
import { VEHICLE_CLASS_VERSION } from '../vehicles';
import { createLaneGraph, createNeighbourhoodMap, createRoutePlanner } from '../world';
import type { LaneGraph, RoadMap } from '../world';
import {
  ingestOpportunityRecord,
  ingestSpeedSample,
  readBehaviorMetricSnapshot,
} from './behavior-metrics';
import { learningExplanationCurrentJob, readLearningExplanation } from './learning-explanation';
import { createProfilePipeline } from './profile-pipeline';
import type {
  ProfileLearningSegment,
  ProfilePipeline,
  ProfilePipelineActivationStep,
  ProfilePipelineQueue,
  ProfilePipelineResult,
} from './profile-pipeline';
import { profileUiBindingReport, readProfileUiBinding } from './profile-ui-binding';
import type { ProfileUiBinding } from './profile-ui-binding';

/**
 * 115 vertical slice: one deterministic, end-to-end demonstration of the city that copies the
 * player.
 *
 * Each scenario starts from the same real base profile, runs one closed LEARNING segment through
 * the real 112 pipeline (103 queue port + 102 gate + 109 store + 110 activation), applies the
 * published version through the 208 mixed taxi/civil world, derives the 104 explanation from the
 * real 103 job/outcome, feeds the resulting simulated driving facts into the real 138 accumulators
 * and reads the real 113 UI binding for a taxi and a civilian. A MANUAL pass over the same route
 * records telemetry but creates no job, version, activation or style change.
 *
 * The playtest is a deterministic simulation, not a human or browser session: the opportunity
 * stream and the encounter pressures are declared inputs of this harness. No physics, renderer,
 * Rapier body or wall clock participates.
 */
export const VERTICAL_SLICE_VERSION = '115-vertical-slice-v1' as const;

export const VERTICAL_SLICE_PROFILE_ID = 'city-profile-115';
export const VERTICAL_SLICE_ENGINE_VERSION = 'engine-115';
export const VERTICAL_SLICE_BASE_VERSION = 'city-style-base-115';
export const VERTICAL_SLICE_SESSION_ID = 'session-115-vertical-slice';
export const VERTICAL_SLICE_PLAYER_ID = 'player-115';
export const VERTICAL_SLICE_SCENARIO_ID = 'vertical-slice-115';
export const VERTICAL_SLICE_NAMESPACE = 'city:115:slice';
export const VERTICAL_SLICE_WORLD_EPOCH = 1;
export const VERTICAL_SLICE_SEED = 115_000;
export const VERTICAL_SLICE_NOW = '2026-10-22T00:00:00.000Z';
export const VERTICAL_SLICE_TICK_HZ = 60;
export const VERTICAL_SLICE_STEP_SECONDS = 1 / VERTICAL_SLICE_TICK_HZ;

/** The single 092/105 learning key both scenarios demonstrate. */
export const VERTICAL_SLICE_LEARNING_KEY: ParameterKey = 'stop_full_probability';
/** Documented 204 base value; 092 default is 1, the early loop starts from 0.6. */
export const VERTICAL_SLICE_BASE_STOP_PROBABILITY = 0.6;

export const verticalSliceScenarios = ['PRUDENT', 'RECKLESS'] as const;
export type VerticalSliceScenarioId = (typeof verticalSliceScenarios)[number];

/** Real 088/093 context label the deterministic segment observes. */
export const VERTICAL_SLICE_OBSERVED_CONTEXT = 'FREE_TRAFFIC';
/** Real 086 opportunity kinds the deterministic plan never exercises. */
export const VERTICAL_SLICE_UNEXERCISED_KINDS = ['GREEN', 'YIELD', 'LANE_CHANGE'] as const;

export const VERTICAL_SLICE_LIMITS = Object.freeze({
  vehicles: 110,
  taxis: 20,
  civilians: 20,
  stopOpportunities: 10,
  redOpportunities: 4,
  speedSamples: 8,
  episodesPerSegment: 16,
  retainedHistory: 0,
});

export const VERTICAL_SLICE_SEGMENT_IDS = Object.freeze({
  PRUDENT: 'segment-115-prudent',
  RECKLESS: 'segment-115-reckless',
  MANUAL: 'segment-115-manual',
});

export type VerticalSliceCheckValue = string | number | boolean | null;

export interface VerticalSliceCheck {
  readonly name: string;
  readonly expected: VerticalSliceCheckValue;
  readonly actual: VerticalSliceCheckValue;
  readonly pass: boolean;
  readonly detail: string;
}

/** One real 103 job plus the terminal outcome the real queue produced. */
export interface VerticalSliceQueueResult {
  readonly job: LearningJob;
  readonly outcome: LearningJobOutcome;
}

/**
 * The documented transport port. The harness owns the real 103 queue; this port only exposes the
 * real job/outcome pairs so the 104 explanation is derived from the same result the pipeline used.
 */
export interface VerticalSliceQueueHandle {
  readonly queue: ProfilePipelineQueue;
  results(): readonly VerticalSliceQueueResult[];
  dispose?(): void;
}

export interface VerticalSliceServices {
  /** One fresh real 103 transport per isolated scenario world. */
  createQueue(): VerticalSliceQueueHandle;
  /** Closed LEARNING segment observed by a civilian in each scenario. */
  readonly segments: Readonly<Record<VerticalSliceScenarioId, ProfileLearningSegment>>;
  /** Closed MANUAL segment replayed on the same route after the style is active. */
  readonly manualSegment: ProfileLearningSegment;
  readonly baseParameters?: Readonly<Record<string, number>>;
  readonly seed?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
}

/** The real 092 defaults with the documented 204 early-loop base for `stop_full_probability`. */
export function verticalSliceBaseParameters(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  parameters[VERTICAL_SLICE_LEARNING_KEY] = VERTICAL_SLICE_BASE_STOP_PROBABILITY;
  return Object.freeze(parameters);
}

function knownTarget(scenario: VerticalSliceScenarioId, key: ParameterKey): number {
  const profile = knownProfiles.find((entry) => entry.profileId === scenario);
  requireContract(profile !== undefined, `105 has no ${scenario} profile`);
  const target = profile.targets.find((entry) => entry.key === key);
  requireContract(target !== undefined, `105 ${scenario} has no ${key} target`);
  return target.value;
}

interface VerticalSliceSegmentOptions {
  readonly scenario: VerticalSliceScenarioId;
  readonly segmentId: string;
  readonly order: number;
  readonly mode?: ProfileLearningSegment['mode'];
  readonly interventionId?: string;
  readonly reason?: string;
}

/**
 * One real 103-shaped closed segment: the 105 scenario target is the estimator candidate, the base
 * value is the documented slice base and the evidence is the real 093 read model with the real
 * `FREE_TRAFFIC` context.
 */
export function verticalSliceLearningSegment(
  options: VerticalSliceSegmentOptions,
): ProfileLearningSegment {
  const key = VERTICAL_SLICE_LEARNING_KEY;
  const baseValue = verticalSliceBaseParameters()[key]!;
  const candidateValue = knownTarget(options.scenario, key);
  const episodes: readonly ProfileBlendEpisode[] = Object.freeze(
    Array.from({ length: VERTICAL_SLICE_LIMITS.episodesPerSegment }, (_, index) =>
      Object.freeze({
        opportunityId: `${options.segmentId}:episode:${index + 1}`,
        occurrence: 0,
        observedTicks: 600,
        ageSeconds: 0,
        value: candidateValue,
      }),
    ),
  );
  const candidate: ConfidenceCandidate = Object.freeze({
    key,
    status: 'CANDIDATE',
    value: candidateValue,
  });
  const evidence = Object.freeze({
    key,
    status: 'READY' as const,
    distinctEpisodes: episodes.length,
    contextBreakdown: Object.freeze([
      Object.freeze({
        label: VERTICAL_SLICE_OBSERVED_CONTEXT,
        roadType: 'urban',
        speedBand: 'MID',
        episodes: episodes.length,
      }),
    ]),
    sampleCount: episodes.length * 60,
    quality: 1,
    uncertainty: 'MODERATE' as const,
    unchanged: true as const,
    noEstimate: null,
  });
  return Object.freeze({
    segmentId: options.segmentId,
    mode: options.mode ?? 'LEARNING',
    eligible: true,
    order: options.order,
    key,
    baseValue,
    evidence,
    episodes,
    candidate,
    ...(options.interventionId === undefined ? {} : { interventionId: options.interventionId }),
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  });
}

/** The MANUAL segment keeps the same base/evidence but is never admitted by 112. */
export function verticalSliceManualSegment(segmentId = VERTICAL_SLICE_SEGMENT_IDS.MANUAL) {
  return verticalSliceLearningSegment({
    scenario: 'PRUDENT',
    segmentId,
    order: 2,
    mode: 'MANUAL',
    reason: 'manual pass over the same route',
  });
}

interface InstrumentedRegistry {
  readonly registry: FleetRegistry;
  readonly writes: { method: string; vehicleId: string | null; fields: readonly string[] }[];
  reset(): void;
}

export interface VerticalSliceWorldOptions {
  readonly queue: ProfilePipelineQueue;
  readonly baseParameters: Readonly<Record<string, number>>;
  readonly seed?: number;
  readonly taxiCount?: number;
  readonly civilianCount?: number;
  readonly learningEpoch?: number;
}

export interface VerticalSliceActivationOutcome {
  readonly activationTick: number;
  readonly appliedTick: number;
  readonly step: ProfilePipelineActivationStep;
  readonly writes: readonly {
    method: string;
    vehicleId: string | null;
    fields: readonly string[];
  }[];
  readonly afterActivation: Readonly<Record<string, number>>;
  readonly afterRefresh: Readonly<Record<string, number>>;
}

export interface VerticalSliceWorld {
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
  activeVersion(): string;
  versionHistogram(): Readonly<Record<string, number>>;
  categoryHistogram(kind: 'TAXI' | 'CIVILIAN'): Readonly<Record<string, number>>;
  versionsOf(kind: 'TAXI' | 'CIVILIAN'): readonly string[];
  hiddenOverrides(): readonly string[];
  stepTo(target: number): void;
  learn(segment: ProfileLearningSegment): Promise<ProfilePipelineResult>;
  applyPending(result: ProfilePipelineResult): VerticalSliceActivationOutcome;
  dispose(): void;
}

function styleProjection(store: ProfileStore, versionId: string): DrivingProfile {
  const version = store.getVersion(versionId);
  requireContract(version !== null, `The vertical slice has no version ${versionId}`);
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, string> = Object.create(null);
  const provenanceByParameter: Record<string, string> = Object.create(null);
  const evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = getParameterDefinition(key).unit;
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
  const writes: { method: string; vehicleId: string | null; fields: readonly string[] }[] = [];
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
    sessionId: VERTICAL_SLICE_SESSION_ID,
    worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
    scenarioId: VERTICAL_SLICE_SCENARIO_ID,
    seed,
    namespace: VERTICAL_SLICE_NAMESPACE,
    taxiCount,
    civilianCount,
    profile: { profileId: VERTICAL_SLICE_PROFILE_ID, versionId: VERTICAL_SLICE_BASE_VERSION },
  };
}

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

/**
 * One isolated session: real 109 store, real 057 registry wired to the writable 110 source, real 110
 * controller, real 058 civil traffic over the 041 planner and the real 112 pipeline. It is the 208
 * composition parameterised by the 115 base profile, nothing else.
 */
export function createVerticalSliceWorld(options: VerticalSliceWorldOptions): VerticalSliceWorld {
  const seed = options.seed ?? VERTICAL_SLICE_SEED;
  const taxiCount = options.taxiCount ?? VERTICAL_SLICE_LIMITS.taxis;
  const civilianCount = options.civilianCount ?? VERTICAL_SLICE_LIMITS.civilians;
  requireContract(taxiCount >= 20 && taxiCount <= 30, '115 taxi count within the 057 bounds');
  requireContract(
    civilianCount >= 20 && civilianCount <= CIVIL_TRAFFIC_LIMITS.actors,
    '115 civilian count within the 057/058 bounds',
  );
  const clock = { value: 0 };
  const store = createCandidateProfileStore({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    now: () => VERTICAL_SLICE_NOW,
  });
  const base = store.createBase({
    profileId: VERTICAL_SLICE_PROFILE_ID,
    versionId: VERTICAL_SLICE_BASE_VERSION,
    parameters: options.baseParameters,
    createdAt: VERTICAL_SLICE_NOW,
  });
  requireContract(base.status === 'ACCEPTED', '115 base style version rejected by 109');

  const source: ProfileActivationSource = createProfileActivationSource({
    profileId: VERTICAL_SLICE_PROFILE_ID,
    versionId: VERTICAL_SLICE_BASE_VERSION,
  });
  const registry = createFleetRegistry(configuration(seed, taxiCount, civilianCount), {
    profileSource: source,
  });
  const instrumented = instrumentRegistry(registry);
  const activation = createProfileActivation({
    registry: instrumented.registry,
    source,
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => VERTICAL_SLICE_NOW,
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
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    playerId: VERTICAL_SLICE_PLAYER_ID,
    profileId: VERTICAL_SLICE_PROFILE_ID,
    learningEpoch: options.learningEpoch ?? 1,
    sessionId: VERTICAL_SLICE_SESSION_ID,
    worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
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
  const observations = Object.freeze(
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
    requireContract(!disposed, '115 vertical slice world disposed');
  }

  function stateOf(vehicleId: string): FleetVehicleState {
    const state = registry.state(vehicleId);
    requireContract(state !== undefined, `Missing fleet state for ${vehicleId}`);
    return state;
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

  function categoryHistogram(kind: 'TAXI' | 'CIVILIAN'): Readonly<Record<string, number>> {
    return countBy(
      registry
        .list()
        .filter((vehicle) => vehicle.driverKind === kind)
        .map((vehicle) => stateOf(vehicle.vehicleId).appliedProfileVersion),
    );
  }

  function hiddenOverrides(): readonly string[] {
    const overrides: string[] = [];
    for (const vehicle of registry.list()) {
      if (vehicle.profileId !== VERTICAL_SLICE_PROFILE_ID) overrides.push(vehicle.vehicleId);
      const fields = Object.keys(vehicle).sort();
      if (fields.join(',') !== [...FLEET_VEHICLE_FIELDS].sort().join(','))
        overrides.push(`${vehicle.vehicleId}:fields`);
      if (vehicle.classVersion !== VEHICLE_CLASS_VERSION)
        overrides.push(`${vehicle.vehicleId}:classVersion`);
    }
    return Object.freeze(overrides);
  }

  function stepTo(target: number): void {
    assertLive();
    const limit = readTick(target);
    for (let atTick = (lastTick ?? 0) + 1; atTick <= limit; atTick += 1) {
      traffic.step({
        tick: atTick,
        dtSeconds: VERTICAL_SLICE_STEP_SECONDS,
        vehicles: observations,
      });
      lastTick = atTick;
      clock.value = atTick;
    }
    if (lastTick !== null && limit >= 0 && limit < lastTick) clock.value = lastTick;
  }

  function applyPending(result: ProfilePipelineResult): VerticalSliceActivationOutcome {
    assertLive();
    requireContract(
      result.activation !== null && result.activation.activateAtTick !== null,
      '115 needs a published 110 command to apply',
    );
    const activationTick = readTick(result.activation.activateAtTick);
    stepTo(activationTick);
    clock.value = activationTick;
    instrumented.reset();
    const step = pipeline.advance();
    requireContract(step !== null && step.status === 'APPLIED', '115 activation was not applied');
    const writes = Object.freeze(instrumented.writes.slice());
    const afterActivation = versionHistogram();
    const refreshed = traffic.refreshStyle();
    const afterRefresh = versionHistogram();
    requireContract(
      step.versionId === refreshed.versionId && Object.keys(afterRefresh).length === 1,
      '115 refreshStyle did not adopt the single applied version',
    );
    return Object.freeze({
      activationTick,
      appliedTick: step.appliedTick ?? activationTick,
      step,
      writes: writes.map((entry) =>
        Object.freeze({
          method: entry.method,
          vehicleId: entry.vehicleId,
          fields: Object.freeze([...entry.fields].sort()),
        }),
      ),
      afterActivation,
      afterRefresh,
    });
  }

  function versionHistogram(): Readonly<Record<string, number>> {
    return countBy(versionValues());
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
    activeVersion: (): string => activation.activeProfile().versionId,
    versionHistogram,
    categoryHistogram,
    versionsOf,
    hiddenOverrides,
    stepTo,
    learn: (segment: ProfileLearningSegment): Promise<ProfilePipelineResult> => {
      assertLive();
      return pipeline.onSegmentClosed(segment);
    },
    applyPending,
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

/* ------------------------------------------------------------------------------------------------
 * Deterministic simulated playtest
 * ---------------------------------------------------------------------------------------------- */

export interface VerticalSliceOpportunityPlanEntry {
  readonly opportunityId: string;
  readonly kind: 'STOP' | 'RED';
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly laneId: string;
  readonly pressure: number;
  readonly resolvedTick: number;
}

export interface VerticalSliceOpportunityPlan {
  readonly stopOpportunities: number;
  readonly redOpportunities: number;
  readonly entries: readonly VerticalSliceOpportunityPlanEntry[];
}

/**
 * The declared simulated route/opportunity stream. It is identical for both scenarios and for the
 * MANUAL pass. `pressure` is the deterministic encounter pressure in `(0, 1)`; an encounter is
 * handled successfully when `pressure <= stopProbability` (STOP) or `<= redProbability` (RED).
 */
export function verticalSliceOpportunityPlan(input: {
  readonly taxiId: string;
  readonly civilianId: string;
  readonly laneIds: readonly string[];
  readonly baseTick: number;
}): VerticalSliceOpportunityPlan {
  requireContract(input.laneIds.length >= 2, '115 needs two real civil lane ids');
  requireContract(input.baseTick >= 60, '115 needs a non-negative opened tick');
  const entries: VerticalSliceOpportunityPlanEntry[] = [];
  const stopTotal = VERTICAL_SLICE_LIMITS.stopOpportunities;
  for (let index = 0; index < stopTotal; index += 1) {
    const taxi = index % 2 === 0;
    entries.push(
      Object.freeze({
        opportunityId: `115:stop:${index + 1}`,
        kind: 'STOP' as const,
        vehicleId: taxi ? input.taxiId : input.civilianId,
        driverKind: taxi ? ('TAXI' as const) : ('CIVILIAN' as const),
        laneId: input.laneIds[index % 2]!,
        pressure: (index + 1) / (stopTotal + 2),
        resolvedTick: input.baseTick + index + 1,
      }),
    );
  }
  const redTotal = VERTICAL_SLICE_LIMITS.redOpportunities;
  for (let index = 0; index < redTotal; index += 1) {
    const taxi = index % 2 === 0;
    entries.push(
      Object.freeze({
        opportunityId: `115:red:${index + 1}`,
        kind: 'RED' as const,
        vehicleId: taxi ? input.taxiId : input.civilianId,
        driverKind: taxi ? ('TAXI' as const) : ('CIVILIAN' as const),
        laneId: input.laneIds[(index + 1) % 2]!,
        pressure: (index + 1) / (redTotal + 2),
        resolvedTick: input.baseTick + stopTotal + index + 1,
      }),
    );
  }
  return Object.freeze({
    stopOpportunities: stopTotal,
    redOpportunities: redTotal,
    entries: Object.freeze(entries),
  });
}

export interface VerticalSliceBehaviourCounts {
  readonly opportunities: number;
  readonly successes: number;
  readonly violations: number;
}

export interface VerticalSliceBehaviourKind extends VerticalSliceBehaviourCounts {
  readonly kind: 'STOP' | 'RED';
  readonly complianceRate: number | null;
}

export interface VerticalSliceBehaviour {
  readonly eligibleOpportunities: number;
  readonly successes: number;
  readonly violations: number;
  readonly complianceRate: number | null;
  readonly byKind: readonly VerticalSliceBehaviourKind[];
  readonly taxi: VerticalSliceBehaviourCounts;
  readonly civilian: VerticalSliceBehaviourCounts;
  readonly speedSamples: number;
  readonly meanSpeedMps: number | null;
  readonly overLimitSamples: number;
  readonly overLimitFraction: number | null;
  readonly limitMps: number;
  readonly mistakesVisible: boolean;
}

interface VerticalSliceOutcome {
  readonly entry: VerticalSliceOpportunityPlanEntry;
  readonly success: boolean;
}

function opportunityRecord(outcome: VerticalSliceOutcome, segmentId: string): OpportunityRecord {
  const entry = outcome.entry;
  const stop = entry.kind === 'STOP';
  const outcomeCode = stop
    ? outcome.success
      ? 'STOPPED'
      : 'CROSSED_WITHOUT_STOP'
    : outcome.success
      ? 'HELD'
      : 'CROSSED';
  return Object.freeze({
    id: entry.opportunityId,
    kind: entry.kind,
    state: 'RESOLVED' as const,
    outcome: outcomeCode,
    result: outcome.success ? ('SUCCESS' as const) : ('FAILURE' as const),
    truncationReason: null,
    vehicleId: entry.vehicleId,
    incarnation: `${entry.vehicleId}:0`,
    segmentIds: Object.freeze([segmentId]),
    learningEligible: true,
    occurrence: 0,
    openedTick: Math.max(0, entry.resolvedTick - 30),
    lastTick: entry.resolvedTick,
    resolvedTick: entry.resolvedTick,
    observationCount: 3,
    stimulus: Object.freeze({
      stopLineId: stop ? `stop-line:${entry.laneId}` : null,
      signalId: stop ? null : `signal:${entry.laneId}`,
      intersectionId: stop ? null : `intersection:${entry.laneId}`,
      movementId: stop ? null : `movement:${entry.laneId}`,
      movementPhaseStartedTick: stop ? null : Math.max(0, entry.resolvedTick - 30),
      fromLaneId: entry.laneId,
      toLaneId: null,
      relationIds: Object.freeze([]),
    }),
  });
}

function metricValue(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : value;
}

function countsOf(rows: readonly VerticalSliceOutcome[]): VerticalSliceBehaviourCounts {
  return Object.freeze({
    opportunities: rows.length,
    successes: rows.filter((row) => row.success).length,
    violations: rows.filter((row) => !row.success).length,
  });
}

function kindOf(
  snapshot: BehaviorMetricsSnapshot,
  kind: 'STOP' | 'RED',
): VerticalSliceBehaviourKind {
  const group = snapshot.byKind.find((entry) => entry.kind === kind);
  requireContract(group !== undefined, `138 has no ${kind} group`);
  return Object.freeze({
    kind,
    opportunities: metricValue(group.eligibleOpportunities.value) ?? 0,
    successes: metricValue(group.successes.value) ?? 0,
    violations: metricValue(group.violations.value) ?? 0,
    complianceRate: metricValue(group.complianceRate.value),
  });
}

/**
 * Feeds the deterministic driving facts into the real 138 accumulators. Only 086-shaped facts and
 * real speed samples enter; the snapshot is read back from the accumulator, never recomputed here.
 */
export function simulateVerticalSliceBehaviour(input: {
  readonly plan: VerticalSliceOpportunityPlan;
  readonly segmentId: string;
  readonly stopProbability: number;
  readonly redProbability: number;
  readonly tick: number;
  readonly simulatedSeconds: number;
  readonly speedMps: number;
  readonly limitMps: number;
  readonly speedSamples: number;
}): VerticalSliceBehaviour {
  const metrics: BehaviorMetrics = createBehaviorMetrics();
  const outcomes: VerticalSliceOutcome[] = input.plan.entries.map((entry) =>
    Object.freeze({
      entry,
      success:
        entry.pressure <= (entry.kind === 'STOP' ? input.stopProbability : input.redProbability),
    }),
  );
  for (const outcome of outcomes) {
    ingestOpportunityRecord(metrics, opportunityRecord(outcome, input.segmentId), {
      dwellTicks: outcome.success ? 120 : null,
    });
  }
  for (let index = 0; index < input.speedSamples; index += 1) {
    ingestSpeedSample(metrics, {
      eventId: `115:speed:${index + 1}`,
      tick: Math.max(0, input.tick - input.speedSamples + index + 1),
      vehicleId: index % 2 === 0 ? outcomes[0]!.entry.vehicleId : outcomes[1]!.entry.vehicleId,
      speedMps: Math.min(200, Math.max(0, input.speedMps)),
      limitMps: input.limitMps,
    });
  }
  const snapshot = readBehaviorMetricSnapshot(metrics, {
    tick: input.tick,
    simulatedSeconds: input.simulatedSeconds,
  });
  metrics.dispose();
  return Object.freeze({
    eligibleOpportunities: metricValue(snapshot.overall.eligibleOpportunities.value) ?? 0,
    successes: metricValue(snapshot.overall.successes.value) ?? 0,
    violations: metricValue(snapshot.overall.violations.value) ?? 0,
    complianceRate: metricValue(snapshot.overall.complianceRate.value),
    byKind: Object.freeze([kindOf(snapshot, 'STOP'), kindOf(snapshot, 'RED')]),
    taxi: countsOf(outcomes.filter((outcome) => outcome.entry.driverKind === 'TAXI')),
    civilian: countsOf(outcomes.filter((outcome) => outcome.entry.driverKind === 'CIVILIAN')),
    speedSamples: metricValue(snapshot.speed.samples.value) ?? 0,
    meanSpeedMps: metricValue(snapshot.speed.meanMps.value),
    overLimitSamples: metricValue(snapshot.speed.overLimitSamples.value) ?? 0,
    overLimitFraction: metricValue(snapshot.speed.overLimitFraction.value),
    limitMps: input.limitMps,
    mistakesVisible: (metricValue(snapshot.overall.violations.value) ?? 0) > 0,
  });
}

/* ------------------------------------------------------------------------------------------------
 * Report model
 * ---------------------------------------------------------------------------------------------- */

export interface VerticalSliceUnobservedContext {
  readonly context: string;
  readonly source: '093_CONTEXT' | '086_KIND';
  readonly reason: 'NOT_OBSERVED_IN_SEGMENT' | 'NOT_EXERCISED_BY_PLAN';
}

export interface VerticalSliceExplanationChange {
  readonly key: string;
  readonly previous: number;
  readonly next: number;
  readonly delta: number;
  readonly evidenceCount: number;
  readonly contexts: readonly string[];
  readonly quality: number;
  readonly uncertainty: string;
  readonly confidence: string;
  readonly reason: string;
}

export interface VerticalSliceExplanationView {
  readonly status: string;
  readonly versionId: string | null;
  readonly composedVersionId: string | null;
  readonly segmentId: string;
  readonly mode: string;
  readonly changes: readonly VerticalSliceExplanationChange[];
  readonly evidenceCounts: Readonly<Record<string, number>>;
  readonly evidenceTotal: number;
  readonly declaredContexts: readonly string[];
  readonly observedContexts: readonly string[];
  readonly unobservedContexts: readonly VerticalSliceUnobservedContext[];
  readonly missingContexts: readonly string[];
  readonly summary: string;
}

export interface VerticalSliceVersionRow {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly sourceSegmentIds: readonly string[];
  readonly value: number | null;
  readonly appliedTick: number | null;
}

export interface VerticalSliceStyleView {
  readonly key: string;
  readonly baseValue: number;
  readonly candidateValue: number | null;
  readonly appliedValue: number;
  readonly delta: number;
  readonly direction: 'HIGHER' | 'LOWER' | 'UNCHANGED';
  readonly parameters: Readonly<Record<string, number>>;
  readonly changedKeys: readonly string[];
  readonly appliedParameterCount: number;
}

export interface VerticalSliceFleetView {
  readonly fleetSize: number;
  readonly before: Readonly<Record<string, number>>;
  readonly after: Readonly<Record<string, number>>;
  readonly taxiBefore: Readonly<Record<string, number>>;
  readonly taxiAfter: Readonly<Record<string, number>>;
  readonly civilianBefore: Readonly<Record<string, number>>;
  readonly civilianAfter: Readonly<Record<string, number>>;
  readonly taxiVersions: readonly string[];
  readonly civilianVersions: readonly string[];
  readonly updatedVehicles: number;
  readonly bothCategoriesUpdated: boolean;
}

export interface VerticalSliceBindingValues {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly appliedVersion: string;
  readonly panelVersion: string | null;
  readonly historyVersion: string | null;
  readonly activeVersion: string | null;
  readonly pass: boolean;
  readonly mismatches: readonly string[];
  readonly values: Readonly<Record<string, number | null>>;
  readonly changedKeys: readonly string[];
}

export interface VerticalSliceBindingView {
  readonly taxi: VerticalSliceBindingValues;
  readonly civilian: VerticalSliceBindingValues;
  readonly sameVersion: boolean;
  readonly sameValues: boolean;
  readonly hiddenOverrides: readonly string[];
  readonly explanationBinding: Readonly<{
    attempted: boolean;
    attached: boolean;
    mismatches: readonly string[];
    reason: string | null;
  }>;
}

export interface VerticalSliceManualView {
  readonly segmentId: string;
  readonly mode: 'MANUAL';
  readonly pipelineStatus: string;
  readonly reason: string | null;
  readonly jobSubmitted: boolean;
  readonly versionId: null;
  readonly activationPublished: false;
  readonly jobsBefore: number;
  readonly jobsAfter: number;
  readonly versionsBefore: number;
  readonly versionsAfter: number;
  readonly commandsBefore: number;
  readonly commandsAfter: number;
  readonly telemetry: VerticalSliceBehaviourCounts & { readonly speedSamples: number };
  readonly telemetryMatchesLearning: boolean;
  readonly activeVersionBefore: string;
  readonly activeVersionAfter: string;
  readonly valuesDigestBefore: string;
  readonly valuesDigestAfter: string;
  readonly valuesEqual: boolean;
  readonly styleKeysBefore: Readonly<Record<string, number>>;
  readonly styleKeysAfter: Readonly<Record<string, number>>;
  readonly explanation: Readonly<{
    status: 'NO_CHANGE';
    versionId: null;
    reason: string | null;
    source: '112_SKIPPED_MANUAL';
    jobSubmitted: boolean;
    changes: readonly never[];
    evidenceCounts: Readonly<Record<string, number>>;
    unobservedContexts: readonly VerticalSliceUnobservedContext[];
  }>;
  readonly binding: Readonly<{
    pass: boolean;
    panelVersion: string | null;
    activeVersion: string | null;
    valuesEqualBeforeAfter: boolean;
  }>;
  readonly noChange: boolean;
}

export interface VerticalSliceScenarioReport {
  readonly scenario: VerticalSliceScenarioId;
  readonly status: 'PASS' | 'FAIL';
  readonly learner: Readonly<{
    vehicleId: string;
    driverKind: 'CIVILIAN';
    mode: 'LEARNING';
    routeDigest: string;
    routePreserved: boolean;
  }>;
  readonly base: Readonly<{
    versionId: string;
    stopFullProbability: number;
    parametersDigest: string;
  }>;
  readonly versionChain: readonly VerticalSliceVersionRow[];
  readonly fleet: VerticalSliceFleetView;
  readonly style: VerticalSliceStyleView;
  readonly behaviour: VerticalSliceBehaviour;
  readonly explanation: VerticalSliceExplanationView;
  readonly binding: VerticalSliceBindingView;
  readonly manual: VerticalSliceManualView;
  readonly checks: readonly VerticalSliceCheck[];
}

export interface VerticalSliceReport {
  readonly version: typeof VERTICAL_SLICE_VERSION;
  readonly contract: Readonly<{
    profileId: string;
    engineVersion: string;
    baseVersionId: string;
    learningKey: string;
    baseStopProbability: number;
    scenarios: readonly VerticalSliceScenarioId[];
    observedContext: string;
    unexercisedKinds: readonly string[];
    stateFields: readonly string[];
    vehicleFields: readonly string[];
    tickHz: number;
    seed: number;
    limits: Readonly<Record<string, number>>;
  }>;
  readonly playtest: Readonly<{
    kind: 'DETERMINISTIC_SIMULATED';
    humanPlaytest: false;
    browserCapture: false;
    profiles: readonly VerticalSliceScenarioId[];
    note: string;
  }>;
  readonly scenarios: readonly VerticalSliceScenarioReport[];
  readonly checks: readonly VerticalSliceCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
  readonly manualNoChange: boolean;
  readonly bothCategoriesUpdated: boolean;
  readonly mistakesVisible: boolean;
  readonly unobservedContexts: readonly string[];
  readonly evidenceCounts: Readonly<Record<string, number>>;
  readonly versionChain: Readonly<Record<string, readonly string[]>>;
}

function check(
  name: string,
  expected: VerticalSliceCheckValue,
  actual: VerticalSliceCheckValue,
  detail: string,
): VerticalSliceCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Small deterministic digest; no clock, no randomness, stable across processes. */
export function verticalSliceDigest(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `115-${hash.toString(16).padStart(8, '0')}-${text.length}`;
}

function routeDigest(actor: CivilActorSnapshot): string {
  return verticalSliceDigest({
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

function declaredContextsOf(key: ParameterKey): readonly string[] {
  const spec = parameterEvidenceSpecs.find((entry) => entry.key === key);
  requireContract(spec !== undefined, `093 has no evidence policy for ${key}`);
  return Object.freeze([...spec.contexts]);
}

function unobservedContextsOf(
  key: ParameterKey,
  observed: readonly string[],
  exercisedKinds: readonly string[],
): readonly VerticalSliceUnobservedContext[] {
  const declared = declaredContextsOf(key);
  const missing = declared
    .filter((context) => !observed.includes(context))
    .map((context) =>
      Object.freeze({
        context,
        source: '093_CONTEXT' as const,
        reason: 'NOT_OBSERVED_IN_SEGMENT' as const,
      }),
    );
  const unexercised = VERTICAL_SLICE_UNEXERCISED_KINDS.filter(
    (kind) => !exercisedKinds.includes(kind),
  ).map((kind) =>
    Object.freeze({
      context: kind,
      source: '086_KIND' as const,
      reason: 'NOT_EXERCISED_BY_PLAN' as const,
    }),
  );
  return Object.freeze([...missing, ...unexercised]);
}

function styleKeysOf(version: ProfileVersion): Readonly<Record<string, number>> {
  return Object.freeze({
    speed_delta_urban: version.parameters.speed_delta_urban!,
    red_stop_probability: version.parameters.red_stop_probability!,
    stop_full_probability: version.parameters.stop_full_probability!,
  });
}

const bindingKeys = Object.freeze([
  'speed_delta_urban',
  'red_stop_probability',
  'stop_full_probability',
]);

function bindingValuesOf(
  binding: ProfileUiBinding,
  vehicleId: string,
  driverKind: 'TAXI' | 'CIVILIAN',
  appliedVersion: string,
): VerticalSliceBindingValues {
  const report = profileUiBindingReport(binding);
  const values: Record<string, number | null> = {};
  for (const key of bindingKeys) {
    const row = report.rows.find((entry) => entry.key === key);
    values[key] = row?.panel.value ?? null;
  }
  return Object.freeze({
    vehicleId,
    driverKind,
    appliedVersion,
    panelVersion: binding.versions.panel,
    historyVersion: binding.versions.history,
    activeVersion: binding.versions.active,
    pass: binding.pass,
    mismatches: Object.freeze([...binding.mismatches]),
    values: Object.freeze(values),
    changedKeys: Object.freeze(
      report.rows
        .filter((row) => row.delta !== null)
        .map((row) => row.key)
        .sort(),
    ),
  });
}

interface ManualInput {
  readonly world: VerticalSliceWorld;
  readonly scenario: VerticalSliceScenarioId;
  readonly segment: ProfileLearningSegment;
  readonly plan: VerticalSliceOpportunityPlan;
  readonly appliedStopProbability: number;
  readonly appliedRedProbability: number;
  readonly tick: number;
  readonly limitMps: number;
  readonly speedDeltaMps: number;
  readonly learningBehaviour: VerticalSliceBehaviour;
  readonly unobservedContexts: readonly VerticalSliceUnobservedContext[];
}

async function runManualPhase(input: ManualInput): Promise<
  Readonly<{
    manual: VerticalSliceManualView;
    checks: readonly VerticalSliceCheck[];
  }>
> {
  const world = input.world;
  const storeVersionsBefore = world.store.listVersions(VERTICAL_SLICE_PROFILE_ID).length;
  const commandsBefore = world.activation.commands().length;
  const jobsBefore = world.pipeline.stats().jobs;
  const activeVersionBefore = world.activeVersion();
  const versionBefore = world.store.getVersion(activeVersionBefore);
  requireContract(versionBefore !== null, '115 active version missing before MANUAL');
  const valuesDigestBefore = verticalSliceDigest(versionBefore.parameters);
  const styleKeysBefore = styleKeysOf(versionBefore);

  const bindingBeforeResult = readProfileUiBinding(
    { store: world.store, pipeline: world.pipeline, activation: world.activation },
    { tick: input.tick, profileId: VERTICAL_SLICE_PROFILE_ID },
  );

  const result = await world.pipeline.onSegmentClosed(input.segment);
  // The manual telemetry is replayed over the same route with the still-active style.
  const manualTick = (input.plan.entries.at(-1)?.resolvedTick ?? input.tick) + 1;
  const telemetry = simulateVerticalSliceBehaviour({
    plan: input.plan,
    segmentId: input.segment.segmentId,
    stopProbability: input.appliedStopProbability,
    redProbability: input.appliedRedProbability,
    tick: manualTick,
    simulatedSeconds: input.plan.entries.length * 5,
    speedMps: input.limitMps + input.speedDeltaMps,
    limitMps: input.limitMps,
    speedSamples: VERTICAL_SLICE_LIMITS.speedSamples,
  });

  const storeVersionsAfter = world.store.listVersions(VERTICAL_SLICE_PROFILE_ID).length;
  const commandsAfter = world.activation.commands().length;
  const jobsAfter = world.pipeline.stats().jobs;
  const activeVersionAfter = world.activeVersion();
  const versionAfter = world.store.getVersion(activeVersionAfter);
  requireContract(versionAfter !== null, '115 active version missing after MANUAL');
  const valuesDigestAfter = verticalSliceDigest(versionAfter.parameters);
  const styleKeysAfter = styleKeysOf(versionAfter);
  const bindingAfter = readProfileUiBinding(
    { store: world.store, pipeline: world.pipeline, activation: world.activation },
    { tick: input.tick, profileId: VERTICAL_SLICE_PROFILE_ID },
  );
  const bindingAfterReport = profileUiBindingReport(bindingAfter);
  const valuesEqualBeforeAfter =
    bindingBeforeResult.versions.panel === bindingAfter.versions.panel &&
    sameJson(
      bindingAfterReport.rows
        .filter((row) => bindingKeys.includes(row.key))
        .map((row) => [row.key, row.panel.value]),
      profileUiBindingReport(bindingBeforeResult)
        .rows.filter((row) => bindingKeys.includes(row.key))
        .map((row) => [row.key, row.panel.value]),
    );

  const manual: VerticalSliceManualView = Object.freeze({
    segmentId: input.segment.segmentId,
    mode: 'MANUAL' as const,
    pipelineStatus: result.status,
    reason: result.reason,
    jobSubmitted: result.jobSubmitted,
    versionId: null,
    activationPublished: false as const,
    jobsBefore,
    jobsAfter,
    versionsBefore: storeVersionsBefore,
    versionsAfter: storeVersionsAfter,
    commandsBefore,
    commandsAfter,
    telemetry: Object.freeze({
      opportunities: telemetry.eligibleOpportunities,
      successes: telemetry.successes,
      violations: telemetry.violations,
      speedSamples: telemetry.speedSamples,
    }),
    telemetryMatchesLearning:
      telemetry.eligibleOpportunities === input.learningBehaviour.eligibleOpportunities &&
      telemetry.successes === input.learningBehaviour.successes &&
      telemetry.violations === input.learningBehaviour.violations,
    activeVersionBefore,
    activeVersionAfter,
    valuesDigestBefore,
    valuesDigestAfter,
    valuesEqual: valuesDigestBefore === valuesDigestAfter,
    styleKeysBefore,
    styleKeysAfter,
    explanation: Object.freeze({
      status: 'NO_CHANGE' as const,
      versionId: null,
      reason: result.reason,
      source: '112_SKIPPED_MANUAL' as const,
      jobSubmitted: result.jobSubmitted,
      changes: Object.freeze([]),
      evidenceCounts: Object.freeze({}),
      unobservedContexts: input.unobservedContexts,
    }),
    binding: Object.freeze({
      pass: bindingAfter.pass,
      panelVersion: bindingAfter.versions.panel,
      activeVersion: bindingAfter.versions.active,
      valuesEqualBeforeAfter,
    }),
    noChange:
      result.status === 'SKIPPED_MANUAL' &&
      result.jobSubmitted === false &&
      result.versionId === null &&
      result.activation === null &&
      jobsBefore === jobsAfter &&
      storeVersionsBefore === storeVersionsAfter &&
      commandsBefore === commandsAfter &&
      activeVersionBefore === activeVersionAfter &&
      valuesDigestBefore === valuesDigestAfter,
  });

  const prefix = input.scenario.toLowerCase();
  const checks: VerticalSliceCheck[] = [
    check(
      `${prefix}.manual-no-job`,
      false,
      result.jobSubmitted,
      'MANUAL never reaches the 103 queue',
    ),
    check(
      `${prefix}.manual-status`,
      'SKIPPED_MANUAL',
      result.status,
      'the real 112 pipeline reports the closed MANUAL skip',
    ),
    check(
      `${prefix}.manual-no-version`,
      'MANUAL_SEGMENT_NOT_LEARNABLE',
      result.reason ?? 'missing',
      'MANUAL creates no version and reports the real reason',
    ),
    check(
      `${prefix}.manual-no-activation`,
      0,
      commandsAfter - commandsBefore,
      'MANUAL publishes no 110 command',
    ),
    check(
      `${prefix}.manual-store-untouched`,
      storeVersionsBefore,
      storeVersionsAfter,
      'the 109 store keeps exactly the same versions',
    ),
    check(
      `${prefix}.manual-job-counter`,
      jobsBefore,
      jobsAfter,
      'the 103 job counter is unchanged',
    ),
    check(
      `${prefix}.manual-telemetry`,
      true,
      telemetry.eligibleOpportunities > 0 && telemetry.speedSamples > 0,
      'MANUAL still records driving telemetry',
    ),
    check(
      `${prefix}.manual-telemetry-matches-learning`,
      true,
      manual.telemetryMatchesLearning,
      'the same route and the still-active style produce the same outcomes',
    ),
    check(
      `${prefix}.manual-active-version`,
      activeVersionBefore,
      activeVersionAfter,
      'the active version is unchanged',
    ),
    check(
      `${prefix}.manual-values`,
      true,
      valuesDigestBefore === valuesDigestAfter,
      'all applied style values are unchanged',
    ),
    check(
      `${prefix}.manual-explanation-no-change`,
      'NO_CHANGE',
      manual.explanation.status,
      'the MANUAL explanation reports no change and no version',
    ),
    check(
      `${prefix}.manual-explanation-version`,
      true,
      manual.explanation.versionId === null,
      'the MANUAL explanation never claims a version',
    ),
    check(
      `${prefix}.manual-no-change`,
      true,
      manual.noChange,
      'no job, version, activation or style change from MANUAL',
    ),
    check(
      `${prefix}.manual-binding`,
      true,
      bindingAfter.pass && manual.binding.valuesEqualBeforeAfter,
      'the UI binding stays consistent across MANUAL',
    ),
  ];
  return Object.freeze({ manual, checks: Object.freeze(checks) });
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

interface ScenarioInput {
  readonly scenario: VerticalSliceScenarioId;
  readonly services: VerticalSliceServices;
}

async function runScenario(input: ScenarioInput): Promise<
  Readonly<{
    report: VerticalSliceScenarioReport;
    checks: readonly VerticalSliceCheck[];
  }>
> {
  const scenario = input.scenario;
  const prefix = scenario.toLowerCase();
  const baseParameters = input.services.baseParameters ?? verticalSliceBaseParameters();
  const queueHandle = input.services.createQueue();
  const world = createVerticalSliceWorld({
    queue: queueHandle.queue,
    baseParameters,
    ...(input.services.seed === undefined ? {} : { seed: input.services.seed }),
    ...(input.services.taxiCount === undefined ? {} : { taxiCount: input.services.taxiCount }),
    ...(input.services.civilianCount === undefined
      ? {}
      : { civilianCount: input.services.civilianCount }),
  });
  try {
    world.stepTo(6);
    const learnerId = world.civilianIds[0]!;
    world.traffic.setAuthority(learnerId, 'LEARNING', 6);
    const learnerBefore = world.traffic.get(learnerId)!;
    const routeBefore = routeDigest(learnerBefore);
    const before = world.versionHistogram();
    const taxiBefore = world.categoryHistogram('TAXI');
    const civilianBefore = world.categoryHistogram('CIVILIAN');
    const baseVersion = world.store.getVersion(VERTICAL_SLICE_BASE_VERSION);
    requireContract(baseVersion !== null, '115 base version missing from the 109 store');
    const baseValuesDigest = verticalSliceDigest(baseVersion.parameters);
    const commandsBefore = world.activation.commands().length;
    const versionsBefore = world.store.listVersions(VERTICAL_SLICE_PROFILE_ID).length;

    const segment = input.services.segments[scenario];
    const closing = await world.learn(segment);
    const pending = world.activation.pending();
    const activationTick = pending === null ? null : readTick(pending.activateAtTick);
    const early = world.activation.applyAt(world.clock.value);
    const beforeTickVersions = world.versionHistogram();
    const outcome = world.applyPending(closing);
    const versionId = outcome.step.versionId;
    requireContract(versionId !== null, '115 applied version missing');
    const version = world.store.getVersion(versionId);
    requireContract(version !== null, '115 applied version is not in the 109 store');
    const after = outcome.afterRefresh;
    const learnerAfter = world.traffic.get(learnerId)!;
    const routeAfter = routeDigest(learnerAfter);
    const taxiVersions = world.versionsOf('TAXI');
    const civilianVersions = world.versionsOf('CIVILIAN');
    const appliedValue = version.parameters[VERTICAL_SLICE_LEARNING_KEY]!;
    const baseValue = baseParameters[VERTICAL_SLICE_LEARNING_KEY]!;
    const changedKeys = Object.freeze(
      Object.keys(version.parameters)
        .filter((key) => version.parameters[key] !== baseVersion.parameters[key])
        .sort(),
    );
    const jobRecord = queueHandle
      .results()
      .find((entry) => entry.job.segmentId === segment.segmentId);
    requireContract(jobRecord !== undefined, '115 found no real 103 job for the segment');
    const explanationSnapshot = readLearningExplanation(
      { job: jobRecord.job, outcome: jobRecord.outcome },
      {
        tick: world.clock.value,
        sessionId: VERTICAL_SLICE_SESSION_ID,
        worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
        current: learningExplanationCurrentJob(jobRecord.job),
      },
    );
    const observedContexts = Object.freeze([
      ...new Set(explanationSnapshot.changes.flatMap((change) => [...change.contexts])),
    ]);
    const exercisedKinds = ['STOP', 'RED'];
    const unobservedContexts = unobservedContextsOf(
      VERTICAL_SLICE_LEARNING_KEY,
      observedContexts,
      exercisedKinds,
    );
    const evidenceCounts: Record<string, number> = {};
    for (const change of explanationSnapshot.changes)
      evidenceCounts[change.key] = change.evidenceCount;
    const explanation: VerticalSliceExplanationView = Object.freeze({
      status: explanationSnapshot.status,
      versionId: explanationSnapshot.versionId,
      composedVersionId: jobRecord.outcome.composition?.profileVersionId ?? null,
      segmentId: explanationSnapshot.segmentId,
      mode: explanationSnapshot.mode,
      changes: Object.freeze(
        explanationSnapshot.changes.map((change) =>
          Object.freeze({
            key: change.key,
            previous: change.previous,
            next: change.next,
            delta: change.delta,
            evidenceCount: change.evidenceCount,
            contexts: Object.freeze([...change.contexts]),
            quality: change.quality,
            uncertainty: change.uncertainty,
            confidence: change.confidence,
            reason: change.reason,
          }),
        ),
      ),
      evidenceCounts: Object.freeze(evidenceCounts),
      evidenceTotal: Object.values(evidenceCounts).reduce((total, count) => total + count, 0),
      declaredContexts: declaredContextsOf(VERTICAL_SLICE_LEARNING_KEY),
      observedContexts,
      unobservedContexts,
      missingContexts: Object.freeze([...explanationSnapshot.missingContexts]),
      summary: explanationSnapshot.summary,
    });

    const laneIds = world.map.lanes
      .filter((lane) => lane.access.includes('CIVIL'))
      .map((lane) => lane.id)
      .sort()
      .slice(0, 2);
    const limitMps = world.map.lanes
      .filter((lane) => lane.access.includes('CIVIL'))
      .reduce((minimum, lane) => Math.min(minimum, lane.speedLimitMps), 200);
    const plan = verticalSliceOpportunityPlan({
      taxiId: world.taxiIds[0]!,
      civilianId: world.civilianIds[1]!,
      laneIds,
      baseTick: Math.max(60, outcome.appliedTick),
    });
    const redProbability = version.parameters.red_stop_probability!;
    const speedDelta = version.parameters.speed_delta_urban!;
    const behaviour = simulateVerticalSliceBehaviour({
      plan,
      segmentId: segment.segmentId,
      stopProbability: appliedValue,
      redProbability,
      tick: (plan.entries.at(-1)?.resolvedTick ?? outcome.appliedTick) + 1,
      simulatedSeconds: plan.entries.length * 5,
      speedMps: limitMps + speedDelta,
      limitMps,
      speedSamples: VERTICAL_SLICE_LIMITS.speedSamples,
    });

    const bindingWithExplanation = readProfileUiBinding(
      {
        store: world.store,
        pipeline: world.pipeline,
        activation: world.activation,
        explanation: explanationSnapshot,
      },
      { tick: world.clock.value, profileId: VERTICAL_SLICE_PROFILE_ID },
    );
    const explanationAttached = bindingWithExplanation.pass;
    const binding = explanationAttached
      ? bindingWithExplanation
      : readProfileUiBinding(
          { store: world.store, pipeline: world.pipeline, activation: world.activation },
          { tick: world.clock.value, profileId: VERTICAL_SLICE_PROFILE_ID },
        );
    const taxiBinding = bindingValuesOf(
      binding,
      world.taxiIds[0]!,
      'TAXI',
      world.registry.state(world.taxiIds[0]!)!.appliedProfileVersion,
    );
    const civilianBinding = bindingValuesOf(
      binding,
      world.civilianIds[1]!,
      'CIVILIAN',
      world.registry.state(world.civilianIds[1]!)!.appliedProfileVersion,
    );
    const hiddenOverrides = world.hiddenOverrides();
    const bindingView: VerticalSliceBindingView = Object.freeze({
      taxi: taxiBinding,
      civilian: civilianBinding,
      sameVersion:
        taxiBinding.panelVersion === civilianBinding.panelVersion &&
        taxiBinding.panelVersion === versionId &&
        taxiBinding.activeVersion === versionId &&
        civilianBinding.activeVersion === versionId,
      sameValues:
        sameJson(taxiBinding.values, civilianBinding.values) &&
        taxiBinding.values[VERTICAL_SLICE_LEARNING_KEY] === appliedValue,
      hiddenOverrides,
      explanationBinding: Object.freeze({
        attempted: true,
        attached: explanationAttached,
        mismatches: explanationAttached
          ? Object.freeze([])
          : Object.freeze([...bindingWithExplanation.mismatches]),
        reason: explanationAttached ? null : 'COMPOSITION_AND_STORE_VERSION_IDS_DIFFER',
      }),
    });

    const manualResult = await runManualPhase({
      world,
      scenario,
      segment: input.services.manualSegment,
      plan,
      appliedStopProbability: appliedValue,
      appliedRedProbability: redProbability,
      tick: world.clock.value,
      limitMps,
      speedDeltaMps: speedDelta,
      learningBehaviour: behaviour,
      unobservedContexts,
    });

    const versionChain: readonly VerticalSliceVersionRow[] = Object.freeze(
      world.store.getHistory(VERTICAL_SLICE_PROFILE_ID).map((entry) =>
        Object.freeze({
          versionId: entry.versionId,
          parentVersionId: entry.parentVersionId,
          sourceSegmentIds: Object.freeze([...entry.sourceSegmentIds]),
          value: entry.parameters[VERTICAL_SLICE_LEARNING_KEY] ?? null,
          appliedTick: entry.versionId === versionId ? outcome.appliedTick : null,
        }),
      ),
    );
    const style: VerticalSliceStyleView = Object.freeze({
      key: VERTICAL_SLICE_LEARNING_KEY,
      baseValue,
      candidateValue: jobRecord.job.candidate.value,
      appliedValue,
      delta: appliedValue - baseValue,
      direction:
        appliedValue > baseValue ? 'HIGHER' : appliedValue < baseValue ? 'LOWER' : 'UNCHANGED',
      parameters: styleKeysOf(version),
      changedKeys,
      appliedParameterCount: Object.keys(version.parameters).length,
    });
    const bothCategoriesUpdated =
      taxiVersions.length === 1 &&
      civilianVersions.length === 1 &&
      taxiVersions[0] === versionId &&
      civilianVersions[0] === versionId;
    const fleet: VerticalSliceFleetView = Object.freeze({
      fleetSize: world.registry.list().length,
      before,
      after,
      taxiBefore,
      taxiAfter: world.categoryHistogram('TAXI'),
      civilianBefore,
      civilianAfter: world.categoryHistogram('CIVILIAN'),
      taxiVersions: Object.freeze([...taxiVersions]),
      civilianVersions: Object.freeze([...civilianVersions]),
      updatedVehicles: outcome.writes.filter((write) => write.method === 'updateState').length,
      bothCategoriesUpdated,
    });

    const checks: VerticalSliceCheck[] = [
      check(
        `${prefix}.learning-composed`,
        'COMPOSED',
        closing.status,
        'one eligible LEARNING segment produced a composed version',
      ),
      check(
        `${prefix}.one-new-version`,
        1,
        world.store.listVersions(VERTICAL_SLICE_PROFILE_ID).length - versionsBefore,
        'the segment created exactly one version',
      ),
      check(
        `${prefix}.pending-before-tick`,
        'PENDING',
        early.status,
        'the 110 command is pending before the common tick',
      ),
      check(
        `${prefix}.pending-writes`,
        0,
        early.updated.length,
        'nothing is written before the common tick',
      ),
      check(
        `${prefix}.before-histogram`,
        `${VERTICAL_SLICE_BASE_VERSION}=${before[VERTICAL_SLICE_BASE_VERSION] ?? 0}`,
        Object.entries(beforeTickVersions)
          .map(([key, count]) => `${key}=${count}`)
          .join(','),
        'the whole fleet keeps the base version before the tick',
      ),
      check(
        `${prefix}.activation-tick`,
        activationTick,
        outcome.appliedTick,
        'the published command is applied at its scheduled tick',
      ),
      check(
        `${prefix}.single-after-version`,
        versionId,
        Object.keys(after).join(','),
        'exactly one applied version remains',
      ),
      check(
        `${prefix}.one-activation`,
        1,
        world.activation.commands().length - commandsBefore,
        'one learning version publishes exactly one 110 command',
      ),
      check(
        `${prefix}.fleet-population`,
        world.registry.list().length,
        Object.values(after).reduce((total, count) => total + count, 0),
        'every vehicle reports the common version',
      ),
      check(
        `${prefix}.updated-vehicles`,
        world.registry.list().length,
        outcome.writes.filter((write) => write.method === 'updateState').length,
        'the activation plan covers every vehicle',
      ),
      check(
        `${prefix}.write-surface`,
        'appliedProfileVersion,tick',
        [...new Set(outcome.writes.flatMap((write) => [...write.fields]))].sort().join(','),
        'activation writes only version and tick',
      ),
      check(
        `${prefix}.taxi-version`,
        versionId,
        taxiVersions.join(','),
        'taxis adopt the learned style',
      ),
      check(
        `${prefix}.civilian-version`,
        versionId,
        civilianVersions.join(','),
        'civilians adopt the same learned style',
      ),
      check(
        `${prefix}.both-categories`,
        true,
        bothCategoriesUpdated,
        'both categories share the single learned version',
      ),
      check(
        `${prefix}.route-preserved`,
        routeBefore,
        routeAfter,
        'the learning civilian keeps its real route',
      ),
      check(
        `${prefix}.style-changed`,
        true,
        appliedValue !== baseValue && changedKeys.length === 1,
        'the learned style value differs from the base',
      ),
      check(
        `${prefix}.style-trend`,
        scenario === 'PRUDENT' ? 'HIGHER' : 'LOWER',
        style.direction,
        'the prudent style learns a higher stop probability and the reckless one a lower value',
      ),
      check(
        `${prefix}.explanation-status`,
        'CHANGED',
        explanation.status,
        '104 explains the real accepted change',
      ),
      check(
        `${prefix}.explanation-version`,
        jobRecord.outcome.composition?.profileVersionId ?? null,
        explanation.versionId,
        'the explanation carries the real 103 composition version',
      ),
      check(
        `${prefix}.explanation-evidence`,
        true,
        explanation.evidenceTotal > 0 &&
          explanation.changes.every((change) => change.evidenceCount > 0),
        'every change is supported by effective episodes',
      ),
      check(
        `${prefix}.explanation-contexts`,
        true,
        explanation.observedContexts.includes(VERTICAL_SLICE_OBSERVED_CONTEXT),
        'the explanation names the real observed context',
      ),
      check(
        `${prefix}.unobserved-contexts`,
        true,
        explanation.unobservedContexts.length > 0,
        'unobserved contexts are explicit',
      ),
      check(
        `${prefix}.behaviour-opportunities`,
        true,
        behaviour.eligibleOpportunities ===
          VERTICAL_SLICE_LIMITS.stopOpportunities + VERTICAL_SLICE_LIMITS.redOpportunities,
        'the playtest exposes real STOP and RED opportunities',
      ),
      check(
        `${prefix}.behaviour-stop`,
        'STOP',
        behaviour.byKind[0]?.kind ?? 'missing',
        'the STOP denominator is reported separately',
      ),
      check(
        `${prefix}.behaviour-clean`,
        scenario === 'PRUDENT' ? 0 : true,
        scenario === 'PRUDENT' ? behaviour.violations : behaviour.violations > 0,
        scenario === 'PRUDENT'
          ? 'the prudent style commits no violation'
          : 'the reckless style commits visible violations',
      ),
      check(
        `${prefix}.taxi-behaviour`,
        scenario === 'PRUDENT' ? 0 : true,
        scenario === 'PRUDENT' ? behaviour.taxi.violations : behaviour.taxi.violations > 0,
        'the learned style is visible on a taxi',
      ),
      check(
        `${prefix}.civilian-behaviour`,
        scenario === 'PRUDENT' ? 0 : true,
        scenario === 'PRUDENT' ? behaviour.civilian.violations : behaviour.civilian.violations > 0,
        'the learned style is visible on a civilian',
      ),
      check(
        `${prefix}.binding-taxi`,
        true,
        taxiBinding.pass,
        'the taxi UI binding is internally consistent',
      ),
      check(
        `${prefix}.binding-civilian`,
        true,
        civilianBinding.pass,
        'the civilian UI binding is internally consistent',
      ),
      check(
        `${prefix}.binding-same-version`,
        true,
        bindingView.sameVersion,
        'both categories read the same active version',
      ),
      check(
        `${prefix}.binding-same-values`,
        true,
        bindingView.sameValues,
        'both categories read the same style values',
      ),
      check(
        `${prefix}.no-hidden-override`,
        0,
        hiddenOverrides.length,
        'no class-specific or per-kind profile override exists',
      ),
      check(
        `${prefix}.explanation-binding`,
        false,
        bindingView.explanationBinding.attached,
        'the 104 composition id is reported separately from the 109/110 id it cannot match here',
      ),
      ...manualResult.checks,
    ];

    const report: VerticalSliceScenarioReport = Object.freeze({
      scenario,
      status: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
      learner: Object.freeze({
        vehicleId: learnerId,
        driverKind: 'CIVILIAN' as const,
        mode: 'LEARNING' as const,
        routeDigest: routeBefore,
        routePreserved: routeBefore === routeAfter,
      }),
      base: Object.freeze({
        versionId: VERTICAL_SLICE_BASE_VERSION,
        stopFullProbability: baseValue,
        parametersDigest: baseValuesDigest,
      }),
      versionChain,
      fleet,
      style,
      behaviour,
      explanation,
      binding: bindingView,
      manual: manualResult.manual,
      checks: Object.freeze(checks),
    });
    return Object.freeze({ report, checks: Object.freeze(checks) });
  } finally {
    world.dispose();
    queueHandle.dispose?.();
  }
}

function rootCheck(
  name: string,
  expected: VerticalSliceCheckValue,
  actual: VerticalSliceCheckValue,
  detail: string,
): VerticalSliceCheck {
  return check(name, expected, actual, detail);
}

/**
 * Runs both deterministic scenarios over fresh isolated worlds and returns the frozen report.
 * Every value comes from the real 103/109/110/112/113/138 modules; only the driving facts are a
 * declared deterministic simulation.
 */
export async function runVerticalSlice(
  services: VerticalSliceServices,
): Promise<VerticalSliceReport> {
  const prudent = await runScenario({ scenario: 'PRUDENT', services });
  const reckless = await runScenario({ scenario: 'RECKLESS', services });
  const scenarios = Object.freeze([prudent.report, reckless.report]);
  const checks = Object.freeze([...prudent.checks, ...reckless.checks]);
  const bothCategoriesUpdated = scenarios.every((scenario) => scenario.fleet.bothCategoriesUpdated);
  const manualNoChange = scenarios.every((scenario) => scenario.manual.noChange);
  const mistakesVisible =
    scenarios.find((scenario) => scenario.scenario === 'PRUDENT')!.behaviour.violations === 0 &&
    scenarios.find((scenario) => scenario.scenario === 'RECKLESS')!.behaviour.violations > 0;
  const unobserved = Object.freeze([
    ...new Set(
      scenarios.flatMap((scenario) =>
        scenario.explanation.unobservedContexts.map((entry) => entry.context),
      ),
    ),
  ]);
  const evidenceCounts: Record<string, number> = {};
  for (const scenario of scenarios) {
    for (const [key, count] of Object.entries(scenario.explanation.evidenceCounts)) {
      const name = `${scenario.scenario}:${key}`;
      evidenceCounts[name] = count;
    }
  }
  const isolation =
    prudent.report.fleet.before[VERTICAL_SLICE_BASE_VERSION] ===
      VERTICAL_SLICE_LIMITS.taxis + VERTICAL_SLICE_LIMITS.civilians &&
    reckless.report.fleet.before[VERTICAL_SLICE_BASE_VERSION] ===
      VERTICAL_SLICE_LIMITS.taxis + VERTICAL_SLICE_LIMITS.civilians &&
    prudent.report.versionChain.every(
      (row) =>
        row.versionId === VERTICAL_SLICE_BASE_VERSION ||
        row.versionId === VERTICAL_SLICE_SEGMENT_IDS.PRUDENT + '~112',
    ) &&
    reckless.report.versionChain.every(
      (row) =>
        row.versionId === VERTICAL_SLICE_BASE_VERSION ||
        row.versionId === VERTICAL_SLICE_SEGMENT_IDS.RECKLESS + '~112',
    ) &&
    prudent.report.explanation.segmentId !== reckless.report.explanation.segmentId;
  const rootChecks = Object.freeze([
    rootCheck(
      'report.two-scenarios',
      2,
      scenarios.length,
      'the report contains the prudent and the reckless deterministic playtest',
    ),
    rootCheck(
      'report.prudent-clean',
      0,
      prudent.report.behaviour.violations,
      'the prudent profile commits no violation with real opportunities',
    ),
    rootCheck(
      'report.reckless-mistakes',
      true,
      reckless.report.behaviour.violations > 0,
      'the reckless profile commits visible STOP violations',
    ),
    rootCheck(
      'report.both-categories',
      true,
      bothCategoriesUpdated,
      'taxis and civilians adopt the same learned version in both scenarios',
    ),
    rootCheck(
      'report.manual-no-change',
      true,
      manualNoChange,
      'MANUAL produces no job, version, activation or style change in both scenarios',
    ),
    rootCheck(
      'report.unobserved-contexts',
      true,
      unobserved.length > 0,
      'unobserved contexts are explicit at report level',
    ),
    rootCheck(
      'report.scenario-isolation',
      true,
      isolation,
      'the two scenarios use independent worlds, versions and segments',
    ),
  ]);
  const allChecks = Object.freeze([...checks, ...rootChecks]);
  const passed = allChecks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: VERTICAL_SLICE_VERSION,
    contract: Object.freeze({
      profileId: VERTICAL_SLICE_PROFILE_ID,
      engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
      baseVersionId: VERTICAL_SLICE_BASE_VERSION,
      learningKey: VERTICAL_SLICE_LEARNING_KEY,
      baseStopProbability: VERTICAL_SLICE_BASE_STOP_PROBABILITY,
      scenarios: Object.freeze([...verticalSliceScenarios]),
      observedContext: VERTICAL_SLICE_OBSERVED_CONTEXT,
      unexercisedKinds: Object.freeze([...VERTICAL_SLICE_UNEXERCISED_KINDS]),
      stateFields: Object.freeze([...FLEET_STATE_FIELDS]),
      vehicleFields: Object.freeze([...FLEET_VEHICLE_FIELDS]),
      tickHz: VERTICAL_SLICE_TICK_HZ,
      seed: services.seed ?? VERTICAL_SLICE_SEED,
      limits: Object.freeze({ ...VERTICAL_SLICE_LIMITS }),
    }),
    playtest: Object.freeze({
      kind: 'DETERMINISTIC_SIMULATED' as const,
      humanPlaytest: false as const,
      browserCapture: false as const,
      profiles: Object.freeze([...verticalSliceScenarios]),
      note: 'Deterministic simulated playtest, not a human or browser playtest; no screenshot was produced.',
    }),
    scenarios,
    checks: allChecks,
    summary: Object.freeze({
      scenarios: scenarios.length,
      checks: allChecks.length,
      passed,
      pass: passed === allChecks.length,
    }),
    manualNoChange,
    bothCategoriesUpdated,
    mistakesVisible,
    unobservedContexts: unobserved,
    evidenceCounts: Object.freeze(evidenceCounts),
    versionChain: Object.freeze({
      PRUDENT: Object.freeze(prudent.report.versionChain.map((row) => row.versionId)),
      RECKLESS: Object.freeze(reckless.report.versionChain.map((row) => row.versionId)),
    }),
  });
}

function scenarioRow(scenario: VerticalSliceScenarioReport): string {
  return (
    '| ' +
    [
      scenario.scenario,
      code(scenario.status),
      scenario.versionChain.at(-1)?.versionId ?? DASH,
      String(scenario.style.baseValue) + ' → ' + String(scenario.style.appliedValue),
      scenario.fleet.bothCategoriesUpdated ? 'PASS' : 'FAIL',
      String(scenario.behaviour.eligibleOpportunities),
      String(scenario.behaviour.violations),
      scenario.manual.noChange ? 'PASS' : 'FAIL',
      String(scenario.explanation.evidenceTotal),
      String(scenario.explanation.unobservedContexts.length),
    ].join(' | ') +
    ' |'
  );
}

function checkRow(entry: VerticalSliceCheck): string {
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

/** Deterministic Markdown view of the frozen 115 report. */
export function verticalSliceReportMarkdown(report: VerticalSliceReport): string {
  return [
    '# 115 vertical slice report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run vertical:slice') +
      ';',
    'it contains no wall-clock value, random source, browser state or physics write.',
    '',
    'Version: ' +
      code(report.version) +
      '; profile: ' +
      code(report.contract.profileId) +
      '; engine: ' +
      code(report.contract.engineVersion) +
      '; base: ' +
      code(report.contract.baseVersionId) +
      '; learning key: ' +
      code(report.contract.learningKey) +
      '.',
    '',
    'Playtest: ' +
      code(report.playtest.kind) +
      '; human playtest: ' +
      code(report.playtest.humanPlaytest) +
      '; browser capture: ' +
      code(report.playtest.browserCapture) +
      '. ' +
      report.playtest.note,
    '',
    '## Rules',
    '',
    '- Both scenarios start from the same real base profile and run one closed LEARNING segment through the real 112 pipeline (103 queue, 102 gate, 109 store, 110 activation).',
    '- The published version is applied through the 208 mixed taxi/civil world: every TAXI and CIVILIAN reads the same version and values; the learning civilian keeps its route.',
    '- The 104 explanation is derived from the real 103 job/outcome that the pipeline consumed; it reports evidence counts, contexts and the explicitly unobserved contexts.',
    '- The 138 accumulators receive the resulting deterministic driving facts; the prudent style is clean with real opportunities, the reckless style commits visible STOP violations on both categories.',
    '- MANUAL runs the same route and records telemetry, but creates no 103 job, no 109 version, no 110 command and no style change; the explanation reports `NO_CHANGE`.',
    '',
    '## Scenarios',
    '',
    '| Scenario | Result | Version | Style base → applied | Both categories | Opportunities | Violations | MANUAL no change | Evidence | Unobserved |',
    '| --- | --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |',
    ...report.scenarios.map(scenarioRow),
    '',
    ...report.scenarios.flatMap((scenario) => {
      const manual = scenario.manual;
      return [
        '### ' + scenario.scenario,
        '',
        '- Version chain: ' + scenario.versionChain.map((row) => row.versionId).join(' → ') + '.',
        '- Fleet before: ' +
          countsText(scenario.fleet.before) +
          '; after: ' +
          countsText(scenario.fleet.after) +
          '.',
        '- Taxi versions: ' +
          scenario.fleet.taxiVersions.join(',') +
          '; civilian versions: ' +
          scenario.fleet.civilianVersions.join(',') +
          '.',
        '- Style: ' +
          scenario.style.key +
          ' ' +
          String(scenario.style.baseValue) +
          ' → ' +
          String(scenario.style.appliedValue) +
          ' (' +
          scenario.style.direction +
          '), candidate ' +
          String(scenario.style.candidateValue) +
          '.',
        '- Behaviour: ' +
          String(scenario.behaviour.successes) +
          ' successes, ' +
          String(scenario.behaviour.violations) +
          ' violations, compliance ' +
          String(scenario.behaviour.complianceRate) +
          '%; taxi violations ' +
          String(scenario.behaviour.taxi.violations) +
          ', civilian violations ' +
          String(scenario.behaviour.civilian.violations) +
          '.',
        '- Explanation: ' +
          scenario.explanation.status +
          ', evidence ' +
          String(scenario.explanation.evidenceTotal) +
          ', contexts ' +
          (scenario.explanation.observedContexts.join(',') || DASH) +
          ', unobserved ' +
          scenario.explanation.unobservedContexts.map((entry) => entry.context).join(',') +
          '.',
        '- Bindings: taxi ' +
          (scenario.binding.taxi.pass ? 'PASS' : 'FAIL') +
          ', civilian ' +
          (scenario.binding.civilian.pass ? 'PASS' : 'FAIL') +
          ', same version ' +
          code(scenario.binding.sameVersion) +
          ', same values ' +
          code(scenario.binding.sameValues) +
          ', hidden overrides ' +
          String(scenario.binding.hiddenOverrides.length) +
          '.',
        '- MANUAL: ' +
          manual.pipelineStatus +
          ', reason ' +
          String(manual.reason) +
          ', jobs ' +
          String(manual.jobsBefore) +
          '→' +
          String(manual.jobsAfter) +
          ', versions ' +
          String(manual.versionsBefore) +
          '→' +
          String(manual.versionsAfter) +
          ', commands ' +
          String(manual.commandsBefore) +
          '→' +
          String(manual.commandsAfter) +
          ', telemetry ' +
          String(manual.telemetry.opportunities) +
          ' opportunities, explanation ' +
          manual.explanation.status +
          '.',
        '',
      ];
    }),
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(checkRow),
    '',
    '## Summary',
    '',
    '- Scenarios: ' + String(report.summary.scenarios),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Both categories updated: ' + code(report.bothCategoriesUpdated),
    '- Mistakes visible: ' + code(report.mistakesVisible),
    '- MANUAL no change: ' + code(report.manualNoChange),
    '- Unobserved contexts: ' + report.unobservedContexts.join(', '),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- The playtest is deterministic simulation: the opportunity plan and encounter pressures are declared inputs, not a human or browser session.',
    '- No Rapier body, renderer, camera, FPS or GPU participates; this is not an integrated performance probe.',
    '- The 104 explanation carries the 103 composition version id while 112 stores the derived `~112` version id; the 113 binding therefore reports that split instead of pretending the ids match.',
    '- The 104 contract rejects MANUAL jobs, so the MANUAL explanation is the real 112 `SKIPPED_MANUAL` result projected as `NO_CHANGE` with no version, never an invented 104 snapshot.',
    '- The per-category taxi/civilian counts are counts of the same generated 086 facts that feed 138; 138 itself aggregates the whole fleet.',
    '',
  ].join('\n');
}
