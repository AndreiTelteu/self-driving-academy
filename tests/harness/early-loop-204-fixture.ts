import type { DrivingProfile } from '../../src/profiles';
import { parameterDefinitions, parsePublishableDrivingProfile } from '../../src/profiles';
import { createParameterEvidenceLedger } from '../../src/learning/parameter-evidence';
import { estimateSpeedParameters } from '../../src/learning/speed-estimator';
import type { SpeedEstimatorObservation } from '../../src/learning/speed-estimator';
import { estimateAccelerationParameters } from '../../src/learning/acceleration-estimator';
import type { AccelerationEstimatorObservation } from '../../src/learning/acceleration-estimator';
import { estimateStopYieldParameters } from '../../src/learning/stop-yield-estimator';
import type { StopYieldEstimatorObservation } from '../../src/learning/stop-yield-estimator';
import {
  EARLY_LOOP_KEYS,
  compileEarlyLoopControllerProfiles,
  composeEarlyLoopProfile,
  earlyLoopForMode,
} from '../../src/learning/early-loop';
import type {
  EarlyLoopCandidates,
  EarlyLoopControllerProfiles,
  EarlyLoopKey,
  EarlyLoopProfile,
  EarlyLoopSource,
} from '../../src/learning/early-loop';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../../src/autonomy/longitudinal-control';
import type { CruiseProfile, CruiseTarget } from '../../src/autonomy/cruise-targets';
import { compileCruiseProfile } from '../../src/autonomy/cruise-targets';
import { evaluateStopPolicy, projectStopProfile } from '../../src/autonomy/stop-policy';
import type { StopPolicyProfile } from '../../src/autonomy/stop-policy';
import { VEHICLE_CLASSES } from '../../src/vehicles';
import { deriveOpportunitySeed, randomUnit } from '../../src/sessions';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  NormalizedVehicleWindow,
  OpportunityDenominators,
  OpportunityRecord,
} from '../../src/telemetry';
import { createLongitudinalTargetFixture } from '../autonomy/longitudinal-target-fixture';

/**
 * Small native 204 fixture: three taxis and two civilians on the authored 044 road context.
 * The three behavioural keys are produced by the real 093 ledger and the 094/095/098 estimators,
 * then blended by composeEarlyLoopProfile and compiled through 046/047/051.
 */
export const EARLY_LOOP_FIXTURE_VERSION = '204-early-loop-fixture-v1';
export const EARLY_LOOP_SCOPE = Object.freeze({ sessionId: '204-early-loop', worldEpoch: 1 });
export const EARLY_LOOP_LIMIT_MPS = 10;
export const EPISODE_TICKS = 600;
export const BEHAVIOR_TICKS = 90;
export const STOP_SEED = 1;
export const STOP_OPPORTUNITY_COUNT = 40;
export const STOP_LINE_OFFSET_M = 1;
/** Float comparison bound for token/style identity. */
export const STYLE_TOLERANCE = 1e-9;

export type EvidenceSet = 'prudent' | 'risky' | 'no-evidence';
export type ActorKind = 'TAXI' | 'CIVIL';

export const EARLY_LOOP_ACTORS = Object.freeze([
  Object.freeze({
    id: 'taxi-01',
    incarnation: 1,
    kind: 'TAXI' as ActorKind,
    classId: 'sedan' as const,
  }),
  Object.freeze({
    id: 'taxi-02',
    incarnation: 1,
    kind: 'TAXI' as ActorKind,
    classId: 'sedan' as const,
  }),
  Object.freeze({
    id: 'taxi-03',
    incarnation: 1,
    kind: 'TAXI' as ActorKind,
    classId: 'compact' as const,
  }),
  Object.freeze({
    id: 'civil-01',
    incarnation: 1,
    kind: 'CIVIL' as ActorKind,
    classId: 'compact' as const,
  }),
  Object.freeze({
    id: 'civil-02',
    incarnation: 1,
    kind: 'CIVIL' as ActorKind,
    classId: 'compact' as const,
  }),
]);

const DEMONSTRATED = Object.freeze({
  prudent: Object.freeze({
    speedMps: 9,
    accelerationMps2: 0.9,
    fullStops: 4,
    rollingStops: 0,
    dwellTicks: 90,
    stopLineOffsetM: 1,
  }),
  risky: Object.freeze({
    speedMps: 12,
    accelerationMps2: 3.5,
    fullStops: 1,
    rollingStops: 3,
    dwellTicks: 45,
    stopLineOffsetM: 2,
  }),
});

function plainProfile(
  profileId: string,
  versionId: string,
  overrides: Readonly<Record<string, number>> = {},
): DrivingProfile {
  const values = Object.fromEntries(
    parameterDefinitions.map((definition) => [definition.key, definition.default]),
  ) as Record<string, number>;
  Object.assign(values, overrides);
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: null,
    engineVersion: '204-fixture-engine',
    parameters: values,
    unitsByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, definition.unit]),
    ),
    provenanceByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, 'BASE']),
    ),
    evidenceByParameter: Object.fromEntries(
      parameterDefinitions.map((definition) => [definition.key, null]),
    ),
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: `${versionId}-checksum`,
  });
}

/** The fixture's current player profile. Stop compliance starts mid-range so both directions show. */
export function createEarlyLoopBaseProfile(): DrivingProfile {
  return plainProfile('204-early-loop-fixture', '204-base-v1', { stop_full_probability: 0.6 });
}

function baseValues(profile: DrivingProfile): Record<EarlyLoopKey, number> {
  return {
    speed_delta_urban: profile.parameters.speed_delta_urban,
    desired_acceleration: profile.parameters.desired_acceleration,
    stop_full_probability: profile.parameters.stop_full_probability,
  };
}

interface EpisodeIdentity {
  readonly opportunityId: string;
  readonly windowId: string;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
}

function eligibility(identity: EpisodeIdentity, kind: 'STOP' | 'YIELD'): EligibilityWindowRecord {
  return {
    windowId: identity.windowId,
    opportunityId: identity.opportunityId,
    kind,
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    segmentId: identity.segmentId,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 1,
    lastTick: EPISODE_TICKS,
    observationCount: EPISODE_TICKS,
    reaction: { open: false, reason: 'SEGMENT_CLOSED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
  } as unknown as EligibilityWindowRecord;
}

function artifacts(identity: EpisodeIdentity): FilteredWindowRecord {
  return {
    windowId: identity.windowId,
    sessionId: EARLY_LOOP_SCOPE.sessionId,
    worldEpoch: EARLY_LOOP_SCOPE.worldEpoch,
    segmentId: identity.segmentId,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: EPISODE_TICKS,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 1,
    lastTick: EPISODE_TICKS,
    observationCount: EPISODE_TICKS,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 1, toTick: EPISODE_TICKS, ticks: EPISODE_TICKS },
  } as unknown as FilteredWindowRecord;
}

function opportunity(
  identity: EpisodeIdentity,
  kind: 'STOP' | 'YIELD',
  fullStop: boolean,
): OpportunityRecord {
  return {
    id: identity.opportunityId,
    kind,
    state: 'RESOLVED',
    outcome: kind === 'YIELD' ? 'YIELDED' : fullStop ? 'STOPPED' : 'CROSSED_WITHOUT_STOP',
    result: fullStop || kind === 'YIELD' ? 'SUCCESS' : 'FAILURE',
    truncationReason: null,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    segmentIds: [identity.segmentId],
    learningEligible: true,
    occurrence: 1,
    openedTick: 1,
    lastTick: EPISODE_TICKS,
    resolvedTick: EPISODE_TICKS,
    observationCount: EPISODE_TICKS,
    stimulus: {},
  } as unknown as OpportunityRecord;
}

function normalizedWindow(
  identity: EpisodeIdentity,
  accelerationMps2: number,
): NormalizedVehicleWindow {
  const demand =
    accelerationMps2 / (VEHICLE_CLASSES.sedan.engineForceN / VEHICLE_CLASSES.sedan.massKg);
  return {
    version: '089-vehicle-normalization-v1',
    featureId: `feature-${identity.windowId}`,
    windowId: identity.windowId,
    opportunityId: identity.opportunityId,
    kind: 'STOP',
    segmentId: identity.segmentId,
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    classId: 'sedan',
    classVersion: '023-mechanics-v1',
    capability: {
      maxAccelerationMps2: VEHICLE_CLASSES.sedan.engineForceN / VEHICLE_CLASSES.sedan.massKg,
      maxDecelerationMps2: VEHICLE_CLASSES.sedan.brakeAcceleration,
      maxLateralAccelerationMps2: 2.5,
    },
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    eligibilityClass: 'ELIGIBLE',
    usableFromTick: 1,
    usableToTick: EPISODE_TICKS,
    usableTicks: EPISODE_TICKS,
    sampledTicks: EPISODE_TICKS,
    sampleCoverage: 1,
    saturationFraction: 0,
    minSaturatedTicks: 1,
    openedTick: 1,
    lastTick: EPISODE_TICKS,
    observationCount: EPISODE_TICKS,
    windowClass: 'NORMALIZED',
    demandStatus: 'INTENTIONAL',
    features: {
      accelerationDemand: demand,
      decelerationDemand: 0.1,
      lateralDemand: 0.1,
      aggressiveness: demand,
      aggressivenessIsLowerBound: false,
      demandPercentile: 0.9,
      raw: {
        longitudinalAccelerationMps2: accelerationMps2,
        longitudinalDecelerationMps2: 0.1,
        lateralAccelerationMps2: 0.1,
      },
      intent: { throttle: demand, brake: 0, steering: 0 },
    },
    capabilityMarks: [],
  } as unknown as NormalizedVehicleWindow;
}

function denominators(stopCount: number): OpportunityDenominators {
  const byKind = (['STOP', 'YIELD'] as const).map((kind) => {
    const certain = kind === 'STOP' ? stopCount : 0;
    return {
      kind,
      total: certain,
      certain,
      success: certain,
      failure: 0,
      incomplete: 0,
      entered: 0,
      learningEligibleCertain: certain,
    };
  });
  return {
    version: '086-opportunity-ids-v1',
    total: stopCount,
    certain: stopCount,
    success: stopCount,
    failure: 0,
    incomplete: 0,
    entered: 0,
    learningEligibleCertain: stopCount,
    byKind,
    truncatedByReason: [],
  } as unknown as OpportunityDenominators;
}

interface BuiltEvidence {
  ledger: ReturnType<typeof createParameterEvidenceLedger>;
  speedObservations: SpeedEstimatorObservation[];
  accelerationObservations: AccelerationEstimatorObservation[];
  stopObservations: StopYieldEstimatorObservation[];
  denominators: OpportunityDenominators;
  sources: Record<EarlyLoopKey, EarlyLoopSource>;
}

type MutableSources = Record<EarlyLoopKey, { segmentIds: string[]; opportunityIds: string[] }>;

const emptySources = (): MutableSources => ({
  speed_delta_urban: { segmentIds: [], opportunityIds: [] },
  desired_acceleration: { segmentIds: [], opportunityIds: [] },
  stop_full_probability: { segmentIds: [], opportunityIds: [] },
});

function freezeSources(sources: MutableSources): Record<EarlyLoopKey, EarlyLoopSource> {
  return {
    speed_delta_urban: Object.freeze({
      segmentIds: Object.freeze([...sources.speed_delta_urban.segmentIds]),
      opportunityIds: Object.freeze([...sources.speed_delta_urban.opportunityIds]),
    }),
    desired_acceleration: Object.freeze({
      segmentIds: Object.freeze([...sources.desired_acceleration.segmentIds]),
      opportunityIds: Object.freeze([...sources.desired_acceleration.opportunityIds]),
    }),
    stop_full_probability: Object.freeze({
      segmentIds: Object.freeze([...sources.stop_full_probability.segmentIds]),
      opportunityIds: Object.freeze([...sources.stop_full_probability.opportunityIds]),
    }),
  };
}

function identityFor(set: EvidenceSet, channel: string, index: number): EpisodeIdentity {
  const suffix = String(index + 1).padStart(2, '0');
  const vehicle = EARLY_LOOP_ACTORS[(index + (channel === 'acceleration' ? 2 : 0)) % 5]!;
  const opportunityId = `${set}-${channel}-${suffix}`;
  return {
    opportunityId,
    windowId: `window-${opportunityId}`,
    segmentId: `segment-${set}-${channel}-${suffix}`,
    vehicleId: vehicle.id,
    incarnation: `${vehicle.id}-inc-1`,
  };
}

function collectEpisode(
  ledger: ReturnType<typeof createParameterEvidenceLedger>,
  identity: EpisodeIdentity,
  kind: 'STOP' | 'YIELD',
  evidence: {
    roadType: string;
    speedSamples?: readonly { tick: number; speedMps: number }[];
    normalized?: NormalizedVehicleWindow;
    stopOutcome?: 'STOPPED' | 'CROSSED_WITHOUT_STOP' | 'HELD' | 'CROSSED';
  },
): void {
  ledger.observe({
    eligibility: eligibility(identity, kind),
    opportunity: opportunity(identity, kind, evidence.stopOutcome === 'STOPPED'),
    artifacts: artifacts(identity),
    roadType: evidence.roadType,
    speedSamples: evidence.speedSamples,
    normalized: evidence.normalized,
    stopOutcome: evidence.stopOutcome,
  });
}

/**
 * Builds only the selected channels. `no-evidence` produces an empty ledger so every read is
 * NO_EVIDENCE and every candidate UNOBSERVED/REFUSED.
 */
export function buildEarlyLoopEvidence(
  set: EvidenceSet,
  only: readonly EarlyLoopKey[] = EARLY_LOOP_KEYS,
): BuiltEvidence {
  const ledger = createParameterEvidenceLedger();
  const sources = emptySources();
  if (set === 'no-evidence')
    return {
      ledger,
      speedObservations: [],
      accelerationObservations: [],
      stopObservations: [],
      denominators: denominators(0),
      sources,
    };
  const demonstrated = DEMONSTRATED[set];
  const selected = new Set<EarlyLoopKey>(only);
  const speedObservations: SpeedEstimatorObservation[] = [];
  const accelerationObservations: AccelerationEstimatorObservation[] = [];
  const stopObservations: StopYieldEstimatorObservation[] = [];
  if (selected.has('speed_delta_urban')) {
    for (let index = 0; index < 3; index++) {
      const identity = identityFor(set, 'speed', index);
      const speedSamples = [{ tick: 300, speedMps: demonstrated.speedMps }];
      collectEpisode(ledger, identity, 'STOP', { roadType: 'urban', speedSamples });
      speedObservations.push({
        eligibility: eligibility(identity, 'STOP'),
        artifacts: artifacts(identity),
        roadKind: 'URBAN',
        postedLimitMps: EARLY_LOOP_LIMIT_MPS,
        speedSamples,
        intersectionApproach: false,
        curveRadiusM: null,
        normalized: null,
      });
      sources.speed_delta_urban.segmentIds.push(identity.segmentId);
      sources.speed_delta_urban.opportunityIds.push(identity.opportunityId);
    }
  }
  if (selected.has('desired_acceleration')) {
    for (let index = 0; index < 3; index++) {
      const identity = identityFor(set, 'acceleration', index);
      const normalized = normalizedWindow(identity, demonstrated.accelerationMps2);
      collectEpisode(ledger, identity, 'STOP', { roadType: 'urban', normalized });
      accelerationObservations.push({
        eligibility: eligibility(identity, 'STOP'),
        artifacts: artifacts(identity),
        normalized,
        jerkSamplesMps3: [0.05, 0.05, 0.05],
        reactionEvidence: null,
      });
      sources.desired_acceleration.segmentIds.push(identity.segmentId);
      sources.desired_acceleration.opportunityIds.push(identity.opportunityId);
    }
  }
  if (selected.has('stop_full_probability')) {
    const total = demonstrated.fullStops + demonstrated.rollingStops;
    for (let index = 0; index < total; index++) {
      const identity = identityFor(set, 'stop', index);
      const full = index < demonstrated.fullStops;
      const stopOutcome = full ? ('STOPPED' as const) : ('CROSSED_WITHOUT_STOP' as const);
      collectEpisode(ledger, identity, 'STOP', { roadType: 'urban', stopOutcome });
      stopObservations.push({
        eligibility: eligibility(identity, 'STOP'),
        opportunity: opportunity(identity, 'STOP', full),
        artifacts: artifacts(identity),
        stopCause: 'STOP_LINE',
        fullStop: full,
        rollingStop: full ? undefined : true,
        dwellTicks: full ? demonstrated.dwellTicks : undefined,
        stopLineOffsetM: demonstrated.stopLineOffsetM,
      });
      sources.stop_full_probability.segmentIds.push(identity.segmentId);
      sources.stop_full_probability.opportunityIds.push(identity.opportunityId);
    }
  }
  return {
    ledger,
    speedObservations,
    accelerationObservations,
    stopObservations,
    denominators: denominators(
      stopObservations.filter((row) => row.opportunity.kind === 'STOP').length,
    ),
    sources: freezeSources(sources),
  };
}

export interface CandidateSummary {
  readonly key: EarlyLoopKey;
  readonly status: string;
  readonly value: number | null;
  readonly quality: number;
  readonly sourceEpisodeCount: number;
}

export interface EvidenceSummary {
  readonly key: EarlyLoopKey;
  readonly status: string;
  readonly distinctEpisodes: number;
  readonly quality: number;
  readonly noEstimate: string | null;
}

export interface ActorBehavior {
  readonly actorId: string;
  readonly kind: ActorKind;
  readonly classId: 'sedan' | 'compact';
  readonly targetMps: number;
  readonly targetReason: string;
  readonly accelerationMps2: number;
  readonly phase: string;
  readonly throttle: number;
  readonly brake: number;
  readonly speedMps: number;
  readonly reactionTicks: number;
}

export interface StopActorOutcome {
  readonly actorId: string;
  readonly action: string;
  readonly reason: string;
  readonly role: 'FULL' | 'ROLLING' | null;
  readonly stopRequested: boolean;
  readonly sampledUnit: number | null;
  readonly probability: number;
}

export interface StopRate {
  readonly total: number;
  readonly full: number;
  readonly rolling: number;
  readonly fullRate: number;
}

export interface StopBehavior {
  readonly actors: readonly StopActorOutcome[];
  readonly canonical: StopActorOutcome;
  readonly rate: StopRate;
}

export interface ScenarioRun {
  readonly id: EvidenceSet;
  readonly selectedKeys: readonly EarlyLoopKey[];
  readonly evidence: readonly EvidenceSummary[];
  readonly candidates: readonly CandidateSummary[];
  readonly composed: EarlyLoopProfile;
  readonly tokens: EarlyLoopControllerProfiles;
  readonly actors: readonly ActorBehavior[];
  readonly stop: StopBehavior;
}

function simulateActors(
  cruise: CruiseProfile,
  longitudinal: ReturnType<typeof compileLongitudinalProfile>,
): readonly ActorBehavior[] {
  const scope = EARLY_LOOP_SCOPE;
  const actorRefs = EARLY_LOOP_ACTORS.map((actor) => ({
    id: actor.id,
    incarnation: actor.incarnation,
  }));
  const policy = createLongitudinalController(scope);
  policy.setActors(actorRefs, scope);
  const fixtures = EARLY_LOOP_ACTORS.map((actor) =>
    createLongitudinalTargetFixture(
      cruise,
      { id: actor.id, incarnation: actor.incarnation },
      scope,
    ),
  );
  const speeds = new Map<string, number>(EARLY_LOOP_ACTORS.map((actor) => [actor.id, 0]));
  const targets = new Map<string, CruiseTarget>();
  const results = new Map<
    string,
    {
      accelerationMps2: number;
      phase: string;
      throttle: number;
      brake: number;
      reactionTicks: number;
    }
  >();
  try {
    for (let tick = 1; tick <= BEHAVIOR_TICKS; tick++) {
      for (let index = 0; index < EARLY_LOOP_ACTORS.length; index++) {
        const actor = EARLY_LOOP_ACTORS[index]!;
        if (tick % 6 === 1)
          targets.set(actor.id, fixtures[index]!.target(tick, false, actor.classId));
        const target = targets.get(actor.id);
        if (!target) throw new Error(`Missing 046 target for ${actor.id}`);
        const reference = { id: actor.id, incarnation: actor.incarnation };
        const step = policy.step({
          ...scope,
          actor: reference,
          tick,
          authority: 'AUTO',
          profile: longitudinal,
          target,
          observation: {
            version: '047-observation-v1',
            units: 'SI',
            ...scope,
            actor: reference,
            tick,
            longitudinalSpeedMps: speeds.get(actor.id)!,
            classId: actor.classId,
            classVersion: '023-mechanics-v1',
          },
        });
        results.set(actor.id, {
          accelerationMps2: step.accelerationMps2,
          phase: step.phase,
          throttle: step.command.throttle,
          brake: step.command.brake,
          reactionTicks: step.reactionTicks,
        });
        speeds.set(
          actor.id,
          Math.min(30, Math.max(0, speeds.get(actor.id)! + step.accelerationMps2 / 60)),
        );
      }
    }
    return EARLY_LOOP_ACTORS.map((actor) => {
      const target = targets.get(actor.id);
      const result = results.get(actor.id);
      if (!target || !result) throw new Error(`Incomplete 046/047 result for ${actor.id}`);
      return Object.freeze({
        actorId: actor.id,
        kind: actor.kind,
        classId: actor.classId,
        targetMps: target.targetMps,
        targetReason: target.reason,
        accelerationMps2: result.accelerationMps2,
        phase: result.phase,
        throttle: result.throttle,
        brake: result.brake,
        speedMps: speeds.get(actor.id)!,
        reactionTicks: result.reactionTicks,
      });
    });
  } finally {
    for (const fixture of fixtures) fixture.dispose();
    policy.dispose();
  }
}

function evaluateStop(
  profile: StopPolicyProfile,
  actor: (typeof EARLY_LOOP_ACTORS)[number],
  opportunityId: string,
): StopActorOutcome {
  const decision = evaluateStopPolicyForActor(profile, actor, opportunityId);
  return Object.freeze({
    actorId: actor.id,
    action: decision.action,
    reason: decision.reason,
    role: decision.sampledRole,
    stopRequested: decision.stopRequested,
    sampledUnit: decision.sampledUnit,
    probability: profile.stopFullProbability,
  });
}

function evaluateStopPolicyForActor(
  profile: StopPolicyProfile,
  actor: (typeof EARLY_LOOP_ACTORS)[number],
  opportunityId: string,
) {
  return evaluateStopPolicy({
    ...EARLY_LOOP_SCOPE,
    actor: { id: actor.id, incarnation: actor.incarnation },
    decisionTick: 100,
    seed: STOP_SEED,
    profile,
    observation: {
      version: '051-stop-observation-v1',
      units: 'SI',
      tick: 100,
      opportunityId,
      stopLineId: 'stop-line-01',
      distanceToStopLineM: 30,
      speedMps: 5,
      stationaryDurationS: null,
      crossed: false,
    },
    leaderStop: 'NONE',
  });
}

function simulateStop(profile: StopPolicyProfile): StopBehavior {
  const canonical = evaluateStop(profile, EARLY_LOOP_ACTORS[0]!, 'stop-op-01');
  let full = 0;
  let rolling = 0;
  for (let index = 1; index <= STOP_OPPORTUNITY_COUNT; index++) {
    const opportunityId = `stop-op-${String(index).padStart(2, '0')}`;
    const decision = evaluateStopPolicyForActor(profile, EARLY_LOOP_ACTORS[0]!, opportunityId);
    if (decision.sampledRole === 'FULL') full++;
    else if (decision.sampledRole === 'ROLLING') rolling++;
  }
  return Object.freeze({
    actors: Object.freeze(
      EARLY_LOOP_ACTORS.map((actor) => evaluateStop(profile, actor, 'stop-op-01')),
    ),
    canonical,
    rate: Object.freeze({
      total: STOP_OPPORTUNITY_COUNT,
      full,
      rolling,
      fullRate: full / STOP_OPPORTUNITY_COUNT,
    }),
  });
}

/** Runs the whole chain for one evidence set and the five-actor behavioural fixture. */
export function runEarlyLoopScenario(
  id: EvidenceSet,
  baseProfile: DrivingProfile = createEarlyLoopBaseProfile(),
  only: readonly EarlyLoopKey[] = EARLY_LOOP_KEYS,
): ScenarioRun {
  const evidence = buildEarlyLoopEvidence(id, only);
  const reads = evidence.ledger.readAll();
  const speed = estimateSpeedParameters(reads, evidence.speedObservations);
  const acceleration = estimateAccelerationParameters(reads, evidence.accelerationObservations);
  const stop = estimateStopYieldParameters(reads, evidence.denominators, evidence.stopObservations);
  const candidates: EarlyLoopCandidates = {
    speed_delta_urban: speed.candidates.speed_delta_urban,
    desired_acceleration: acceleration.candidates.desired_acceleration,
    stop_full_probability: stop.candidates.stop_full_probability,
  };
  const composed = composeEarlyLoopProfile(
    baseValues(baseProfile),
    reads,
    candidates,
    evidence.sources,
  );
  const tokens = compileEarlyLoopControllerProfiles('AUTO', baseProfile, composed);
  if (tokens === null) throw new Error('AUTO must compile the early-loop profile');
  return Object.freeze({
    id,
    selectedKeys: Object.freeze([...only]),
    evidence: Object.freeze(
      EARLY_LOOP_KEYS.map((key) => {
        const read = reads.find((row) => row.key === key)!;
        return Object.freeze({
          key,
          status: read.status,
          distinctEpisodes: read.distinctEpisodes,
          quality: read.quality,
          noEstimate: read.noEstimate,
        });
      }),
    ),
    candidates: Object.freeze(
      EARLY_LOOP_KEYS.map((key) => {
        const candidate = candidates[key];
        return Object.freeze({
          key,
          status: candidate.status,
          value: candidate.value,
          quality: candidate.quality,
          sourceEpisodeCount: candidate.sourceEpisodeCount,
        });
      }),
    ),
    composed,
    tokens,
    actors: simulateActors(tokens.cruise, tokens.longitudinal),
    stop: simulateStop(tokens.stop),
  });
}

export interface ManualResult {
  readonly earlyLoop: EarlyLoopProfile | null;
  readonly controllerTokens: EarlyLoopControllerProfiles | null;
  readonly evidenceEpisodes: number;
  readonly profileUnchanged: boolean;
  readonly maximumParameterDelta: number;
  readonly before: Readonly<Record<string, number>>;
  readonly after: Readonly<Record<string, number>>;
}

/** MANUAL is a no-op: no early profile, no compiled tokens, no observed episodes, no value delta. */
export function runManualEarlyLoop(
  baseProfile: DrivingProfile,
  composed: EarlyLoopProfile,
): ManualResult {
  const ledger = createParameterEvidenceLedger();
  const before = { ...baseProfile.parameters };
  const earlyLoop = earlyLoopForMode('MANUAL', composed);
  const controllerTokens = compileEarlyLoopControllerProfiles('MANUAL', baseProfile, composed);
  const after = { ...baseProfile.parameters };
  const keys = Object.keys(before);
  let maximumParameterDelta = 0;
  for (const key of keys)
    maximumParameterDelta = Math.max(maximumParameterDelta, Math.abs(before[key]! - after[key]!));
  return Object.freeze({
    earlyLoop,
    controllerTokens,
    evidenceEpisodes: ledger.readAll().reduce((sum, row) => sum + row.distinctEpisodes, 0),
    profileUnchanged:
      keys.length === Object.keys(after).length &&
      keys.every((key) => Object.is(before[key], after[key])),
    maximumParameterDelta,
    before: Object.freeze(before),
    after: Object.freeze(after),
  });
}

export interface BaseBehavior {
  readonly actors: readonly ActorBehavior[];
  readonly stop: StopBehavior;
}

export function runBaseBehavior(baseProfile: DrivingProfile): BaseBehavior {
  const cruise = compileCruiseProfile(baseProfile);
  const longitudinal = compileLongitudinalProfile(baseProfile);
  return Object.freeze({
    actors: simulateActors(cruise, longitudinal),
    stop: simulateStop(projectStopProfile(baseProfile)),
  });
}

export interface EarlyLoopDemo {
  readonly baseProfile: DrivingProfile;
  readonly base: BaseBehavior;
  readonly scenarios: Readonly<Record<EvidenceSet, ScenarioRun>>;
  readonly mixed: Readonly<Record<EarlyLoopKey, ScenarioRun>>;
  readonly manual: ManualResult;
}

/** One deterministic fixture run, memoised by tests so the native simulation happens once. */
export function runEarlyLoopDemo(): EarlyLoopDemo {
  const baseProfile = createEarlyLoopBaseProfile();
  const scenarios = {
    prudent: runEarlyLoopScenario('prudent', baseProfile),
    risky: runEarlyLoopScenario('risky', baseProfile),
    'no-evidence': runEarlyLoopScenario('no-evidence', baseProfile),
  } as const;
  const mixed = Object.fromEntries(
    EARLY_LOOP_KEYS.map((key) => [key, runEarlyLoopScenario('prudent', baseProfile, [key])]),
  ) as Record<EarlyLoopKey, ScenarioRun>;
  return Object.freeze({
    baseProfile,
    base: runBaseBehavior(baseProfile),
    scenarios: Object.freeze(scenarios),
    mixed: Object.freeze(mixed),
    manual: runManualEarlyLoop(baseProfile, scenarios.prudent.composed),
  });
}

/** The canonical STOP opportunity's sampled unit for the fixture seed; used in assertions/docs. */
export function canonicalStopSample(): { seed: number; unit: number } {
  return Object.freeze({
    seed: STOP_SEED,
    unit: randomUnit(deriveOpportunitySeed(STOP_SEED, 'stop-op-01'), 'full-stop', 0),
  });
}
