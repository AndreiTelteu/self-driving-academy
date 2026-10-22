import { knownProfiles } from '../experiments';
import type { InverseProfileId } from '../experiments';
import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../fleet';
import type { FleetRegistry, ProfileActivation, ProfileActivationSource } from '../fleet';
import { assessEvidenceConfidence, createCandidateProfileStore } from '../learning';
import type { LearningJob, LearningJobOutcome } from '../learning';
import { getParameterDefinition, parameterDefinitions } from '../profiles';
import type { ParameterKey, ProfileStore, ProfileVersion } from '../profiles';
import { requireContract } from '../sessions';
import type { LearningExplanationSnapshot } from '../ui';
import { learningExplanationCurrentJob, readLearningExplanation } from './learning-explanation';
import { createProfilePipeline } from './profile-pipeline';
import type {
  ProfileLearningSegment,
  ProfilePipeline,
  ProfilePipelineQueue,
  ProfilePipelineResult,
} from './profile-pipeline';

/**
 * 118: the campaign mission "Prima demonstrație" as a real, closed learning route.
 *
 * The demonstration never fabricates a delta, a version or an activation. It closes one real 069
 * LEARNING segment through the real chain — 103 queue and job → 102 numeric gate → 112 composition
 * → 109 immutable version → 110 common-tick activation — and reads the real 104 explanation of the
 * same job/outcome the pipeline used.
 *
 * Two outcomes are closed:
 * - `DEMONSTRATED`: a justified delta produced a 109 version and the 110 activation was observed
 *   as applied on a common tick of the fleet;
 * - `NO_CHANGE`: the composition kept the value, so there is no version, no activation and a
 *   closed reason that says why nothing changed (104 `NO_CHANGE` with `versionId: null`).
 *
 * The "see an example" action is always labelled. When the player published a version, the example
 * is `LIVE` and carries the 109 provenance of that version. Otherwise it is `EXPERIMENT` and points
 * at a 105 known profile (`PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED`); that example is explicitly
 * not the effect of the player.
 */
export const MISSION_DEMO_VERSION = '118-mission-demo-v1' as const;

/** The 116 campaign mission this demonstration implements. */
export const MISSION_DEMO_MISSION_ID = 'campaign-2-first-demonstration';
/** The single 092/105 learning key the first demonstration publishes. */
export const MISSION_DEMO_LEARNING_KEY: ParameterKey = 'stop_full_probability';
/** Documented base value of the demonstration profile; the 092 default is 1. */
export const MISSION_DEMO_BASE_STOP_PROBABILITY = 0.6;

/** Closed result vocabulary of one demonstration. */
export const missionDemoStatuses = ['DEMONSTRATED', 'NO_CHANGE', 'REJECTED'] as const;
export type MissionDemoStatus = (typeof missionDemoStatuses)[number];

/** The two labelled sources of the "see an example" action. */
export const missionDemoExampleKinds = ['LIVE', 'EXPERIMENT'] as const;
export type MissionDemoExampleKind = (typeof missionDemoExampleKinds)[number];

export const MISSION_DEMO_LIMITS = Object.freeze({
  /** Rows kept in one "see an example" payload. */
  exampleRows: 24,
  /** 086 opportunity identities kept as provenance of the delta. */
  opportunityIds: 16,
  /** Code units kept for a reason or a label. */
  reasonCodeUnits: 240,
  /** Fleet size of the deterministic demonstration world. */
  taxis: DEFAULT_FLEET_COUNTS.taxis,
  civilians: DEFAULT_FLEET_COUNTS.civilians,
});

/** One real 103 job plus the terminal outcome the real queue produced. */
export interface MissionDemoQueueResult {
  readonly job: LearningJob;
  readonly outcome: LearningJobOutcome;
}

/**
 * The observed 103 transport. The harness owns the real queue; this port only exposes the real
 * job/outcome pairs, so the 104 explanation is derived from the same result the pipeline used.
 */
export interface MissionDemoQueueHandle {
  readonly queue: ProfilePipelineQueue;
  results(): readonly MissionDemoQueueResult[];
}

export interface MissionDemoExampleRow {
  readonly label: string;
  readonly value: string;
}

/** The labelled payload of the "see an example" action. */
export interface MissionDemoExample {
  readonly kind: MissionDemoExampleKind;
  readonly label: string;
  readonly description: string;
  /** Contract that owns the example values. */
  readonly origin: string;
  /** `true` only for a live example taken from the player's own published version. */
  readonly isPlayerEffect: boolean;
  readonly rows: readonly MissionDemoExampleRow[];
}

/** The evidence facts that justify (or refuse) a delta. */
export interface MissionDemoEvidence {
  readonly key: string;
  /** Real 093 read-model status. */
  readonly status: string;
  readonly distinctEpisodes: number;
  readonly effectiveEpisodes: number;
  readonly contexts: readonly string[];
  readonly quality: number;
  readonly uncertainty: string;
  readonly confidence: string;
  readonly sourceSegmentIds: readonly string[];
  readonly opportunityIds: readonly string[];
}

/** The published delta; `null` when the composition kept the value. */
export interface MissionDemoDelta {
  readonly key: string;
  readonly unit: string;
  readonly previous: number;
  readonly next: number;
  readonly delta: number;
  /** The 109 version that carries the delta. */
  readonly versionId: string;
  readonly parentVersionId: string | null;
}

/** The observed 110 activation; `null` when nothing was published. */
export interface MissionDemoActivation {
  readonly commandId: string;
  readonly versionId: string;
  readonly publishedAtTick: number;
  readonly activateAtTick: number;
  readonly appliedTick: number;
  /** Vehicles that adopted the version on the common tick. */
  readonly updatedVehicles: number;
  readonly status: 'APPLIED';
}

/** The 104 explanation of the same job/outcome the pipeline used. */
export interface MissionDemoExplanation {
  readonly status: string;
  readonly versionId: string | null;
  readonly noChangeReason: string | null;
  readonly missingContexts: readonly string[];
  readonly summary: string;
}

/** What the mission asks for: a justified delta and an observed activation. */
export interface MissionDemoRequirements {
  readonly justifiedDelta: boolean;
  readonly observedActivation: boolean;
  readonly satisfied: boolean;
}

export interface MissionDemoResult {
  readonly version: typeof MISSION_DEMO_VERSION;
  readonly missionId: string;
  readonly segmentId: string;
  readonly status: MissionDemoStatus;
  /** Closed reason of a `NO_CHANGE` or `REJECTED` result; `null` for a demonstration. */
  readonly reason: string | null;
  /** The 109 version; `null` when no version was published. */
  readonly versionId: string | null;
  /** The 103 composition identity the 104 explanation carries; `null` without a composition. */
  readonly composedVersionId: string | null;
  readonly evidence: MissionDemoEvidence;
  readonly delta: MissionDemoDelta | null;
  readonly activation: MissionDemoActivation | null;
  readonly explanation: MissionDemoExplanation | null;
  readonly requirements: MissionDemoRequirements;
  readonly example: MissionDemoExample;
  /** The closed 112 pipeline status of the same segment. */
  readonly pipelineStatus: string;
  readonly pipelineReason: string | null;
  readonly pipelineCode: string | null;
}

export interface MissionDemoWorldOptions {
  /** The observed real 103 queue used by the 112 pipeline. */
  readonly queue: MissionDemoQueueHandle;
  readonly profileId?: string;
  readonly engineVersion?: string;
  readonly baseVersionId?: string;
  readonly learningEpoch?: number;
  readonly baseParameters?: Readonly<Record<string, number>>;
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly playerId?: string;
}

export interface MissionDemoWorld {
  readonly store: ProfileStore;
  readonly registry: FleetRegistry;
  readonly activation: ProfileActivation;
  readonly pipeline: ProfilePipeline;
  readonly profileId: string;
  readonly engineVersion: string;
  readonly baseVersionId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly clock: { value: number };
  /** The real 103 job/outcome pairs observed so far. */
  queueResults(): readonly MissionDemoQueueResult[];
  /** Current fleet profile versions, sorted and de-duplicated. */
  fleetVersions(): readonly string[];
  advanceTick(): number;
  dispose(): void;
}

export const MISSION_DEMO_PROFILE_ID = 'city-profile-118';
export const MISSION_DEMO_ENGINE_VERSION = 'engine-118';
export const MISSION_DEMO_BASE_VERSION = 'city-profile-118-base';
export const MISSION_DEMO_SESSION_ID = 'session-118-demo';
export const MISSION_DEMO_WORLD_EPOCH = 1;
export const MISSION_DEMO_PLAYER_ID = 'player-118';
export const MISSION_DEMO_NOW = '2026-10-22T00:00:00.000Z';

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

/** Four decimals, the same rounding the 101 blend and the 103 composition use. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** The 092 defaults with the documented base value of the demonstrated key. */
export function missionDemoBaseParameters(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = Object.create(null);
  for (const definition of parameterDefinitions) parameters[definition.key] = definition.default;
  parameters[MISSION_DEMO_LEARNING_KEY] = MISSION_DEMO_BASE_STOP_PROBABILITY;
  return Object.freeze(parameters);
}

function configuration(
  profileId: string,
  baseVersionId: string,
  sessionId: string,
  worldEpoch: number,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch,
    scenarioId: 'mission-118-demonstration',
    seed: 118_000,
    namespace: 'city:118:demonstration',
    taxiCount: MISSION_DEMO_LIMITS.taxis,
    civilianCount: MISSION_DEMO_LIMITS.civilians,
    profile: { profileId, versionId: baseVersionId },
  };
}

/**
 * One isolated demonstration world: the real 109 store, the real 057 registry wired to the
 * writable 110 source, the real 110 controller and the real 112 pipeline over the observed 103
 * queue. It never creates a profile, a delta or an activation by itself.
 */
export function createMissionDemoWorld(options: MissionDemoWorldOptions): MissionDemoWorld {
  const engineVersion = options.engineVersion ?? MISSION_DEMO_ENGINE_VERSION;
  const profileId = options.profileId ?? MISSION_DEMO_PROFILE_ID;
  const baseVersionId = options.baseVersionId ?? MISSION_DEMO_BASE_VERSION;
  const sessionId = options.sessionId ?? MISSION_DEMO_SESSION_ID;
  const worldEpoch = options.worldEpoch ?? MISSION_DEMO_WORLD_EPOCH;
  const playerId = options.playerId ?? MISSION_DEMO_PLAYER_ID;
  const clock = { value: 0 };
  const store = createCandidateProfileStore({ engineVersion, now: () => MISSION_DEMO_NOW });
  const base = store.createBase({
    profileId,
    versionId: baseVersionId,
    parameters: options.baseParameters ?? missionDemoBaseParameters(),
    createdAt: MISSION_DEMO_NOW,
  });
  requireContract(base.status === 'ACCEPTED', '118 base version rejected by 109');
  const source: ProfileActivationSource = createProfileActivationSource({
    profileId,
    versionId: baseVersionId,
  });
  const registry = createFleetRegistry(
    configuration(profileId, baseVersionId, sessionId, worldEpoch),
    { profileSource: source },
  );
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion,
    clock: () => clock.value,
    now: () => MISSION_DEMO_NOW,
  });
  const pipeline = createProfilePipeline({
    engineVersion,
    playerId,
    profileId,
    learningEpoch: options.learningEpoch ?? 1,
    sessionId,
    worldEpoch,
    queue: options.queue.queue,
    store,
    activation,
    tick: () => clock.value,
    advanceTick: () => {
      clock.value += 1;
      return clock.value;
    },
  });
  return {
    store,
    registry,
    activation,
    pipeline,
    profileId,
    engineVersion,
    baseVersionId,
    sessionId,
    worldEpoch,
    clock,
    queueResults: (): readonly MissionDemoQueueResult[] => options.queue.results(),
    fleetVersions(): readonly string[] {
      return [
        ...new Set(
          registry
            .list()
            .map((vehicle) => registry.state(vehicle.vehicleId)?.appliedProfileVersion ?? ''),
        ),
      ].sort();
    },
    advanceTick(): number {
      clock.value += 1;
      return clock.value;
    },
    dispose(): void {
      pipeline.dispose();
      activation.dispose();
      registry.dispose();
      store.dispose();
    },
  };
}

/**
 * The live example: the real 109 version the player published, with its provenance.
 * It is the player's own effect, so it is labelled `LIVE`.
 */
export function missionDemoLiveExample(
  store: ProfileStore,
  profileId: string,
  versionId: string,
): MissionDemoExample {
  const version: ProfileVersion | null = store.getVersion(versionId);
  requireContract(version !== null, `118 has no published version ${versionId}`);
  requireContract(version.profileId === profileId, '118 live example belongs to another profile');
  const rows: MissionDemoExampleRow[] = [
    { label: 'Versiune', value: version.versionId },
    { label: 'Versiune de bază', value: version.parentVersionId ?? '—' },
    { label: 'Checksum', value: version.checksum },
    { label: 'Adâncime', value: String(version.depth) },
    { label: 'Segment sursă', value: version.sourceSegmentIds.join(', ') || '—' },
  ];
  const delta = version.provenance.delta;
  if (delta !== null)
    for (const change of delta.changes.slice(0, MISSION_DEMO_LIMITS.exampleRows))
      rows.push({
        label: change.key,
        value: `${change.previousValue} → ${change.newValue} ${change.unit}`,
      });
  return Object.freeze({
    kind: 'LIVE' as const,
    label: 'Exemplu live',
    description:
      'Versiunea publicată din profilul tău, cu proveniența 109 (segment, delta, checksum).',
    origin: '109-profile-store-v1',
    isPlayerEffect: true,
    rows: Object.freeze(rows.slice(0, MISSION_DEMO_LIMITS.exampleRows)),
  });
}

/**
 * The experiment example: a 105 known profile (`PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED`).
 * It is a reference value from the separate inverse-learning experiment, never the player's effect,
 * so it is labelled `EXPERIMENT` and says so.
 */
export function missionDemoExperimentExample(profileId: InverseProfileId): MissionDemoExample {
  const profile = knownProfiles.find((entry) => entry.profileId === profileId);
  requireContract(profile !== undefined, `105 has no ${profileId} profile`);
  const rows: MissionDemoExampleRow[] = [
    { label: 'Profil cunoscut', value: profile.profileId },
    { label: 'Descriere', value: profile.description },
  ];
  for (const target of profile.targets.slice(0, MISSION_DEMO_LIMITS.exampleRows))
    rows.push({
      label: target.key,
      value: `${target.value} ${getParameterDefinition(target.key).unit}`,
    });
  return Object.freeze({
    kind: 'EXPERIMENT' as const,
    label: 'Exemplu din experimentul 105',
    description:
      'Profil cunoscut din experimentul invers 105. Este o referință de calibrare, nu efectul jucătorului.',
    origin: '105-inverse-learning-v1',
    isPlayerEffect: false,
    rows: Object.freeze(rows.slice(0, MISSION_DEMO_LIMITS.exampleRows)),
  });
}

function explanationOf(snapshot: LearningExplanationSnapshot): MissionDemoExplanation {
  return Object.freeze({
    status: snapshot.status,
    versionId: snapshot.versionId,
    noChangeReason: snapshot.noChangeReason,
    missingContexts: Object.freeze([...snapshot.missingContexts]),
    summary: bounded(snapshot.summary, MISSION_DEMO_LIMITS.reasonCodeUnits),
  });
}

function evidenceOf(
  segment: ProfileLearningSegment,
  sourceSegmentIds: readonly string[],
  opportunityIds: readonly string[],
): MissionDemoEvidence {
  // The real 100 assessment: effective episodes, quality, uncertainty and confidence state.
  const assessment = assessEvidenceConfidence({
    key: segment.key as ParameterKey,
    evidence: segment.evidence,
    episodes: segment.episodes,
    candidate: segment.candidate,
  });
  const contexts = segment.evidence.contextBreakdown.map((entry) => entry.label);
  return Object.freeze({
    key: segment.key,
    status: segment.evidence.status,
    distinctEpisodes: segment.evidence.distinctEpisodes,
    effectiveEpisodes: assessment.effectiveEpisodeCount,
    contexts: Object.freeze([...new Set(contexts)].sort()),
    quality: assessment.quality,
    uncertainty: assessment.uncertainty,
    confidence: assessment.state,
    sourceSegmentIds: Object.freeze([...sourceSegmentIds]),
    opportunityIds: Object.freeze([...opportunityIds].slice(0, MISSION_DEMO_LIMITS.opportunityIds)),
  });
}

export interface MissionDemoInput {
  readonly segment: ProfileLearningSegment;
  /** 086 opportunity identities that produced the evidence of the segment. */
  readonly opportunityIds?: readonly string[];
  /** The 105 known profile used when no live version exists. */
  readonly experimentProfileId?: InverseProfileId;
  readonly missionId?: string;
}

/**
 * Runs one demonstration over the real chain and returns the closed result.
 *
 * The 110 activation is observed, not assumed: the world clock is advanced to the common tick the
 * 112 pipeline published and the real activation is applied before the result is built.
 */
export async function runMissionDemonstration(
  world: MissionDemoWorld,
  input: MissionDemoInput,
): Promise<MissionDemoResult> {
  const missionId = input.missionId ?? MISSION_DEMO_MISSION_ID;
  requireContract(missionId === MISSION_DEMO_MISSION_ID, '118 implements a different mission');
  const segment = input.segment;
  const opportunityIds = input.opportunityIds ?? [];
  const experimentProfileId = input.experimentProfileId ?? 'PRUDENT';

  const pipelineResult: ProfilePipelineResult = await world.pipeline.onSegmentClosed(segment);

  // The real 103 job/outcome of this segment; the explanation is derived from the same result.
  const observed = world.queueResults().find((entry) => entry.job.segmentId === segment.segmentId);
  let snapshot: LearningExplanationSnapshot | null = null;
  if (observed !== undefined)
    snapshot = readLearningExplanation(
      { job: observed.job, outcome: observed.outcome },
      {
        tick: world.clock.value,
        sessionId: world.sessionId,
        worldEpoch: world.worldEpoch,
        current: learningExplanationCurrentJob(observed.job),
      },
    );

  // Observe the 110 activation on the common tick the pipeline published.
  let activation: MissionDemoActivation | null = null;
  const published = pipelineResult.activation;
  if (published !== null && published.activateAtTick !== null) {
    while (world.clock.value < published.activateAtTick) world.advanceTick();
    const step = world.pipeline.advance();
    if (step !== null && step.status === 'APPLIED' && step.appliedTick !== null)
      activation = Object.freeze({
        commandId: published.commandId ?? 'activation-0000',
        versionId: step.versionId ?? published.versionId,
        publishedAtTick: published.publishedAtTick,
        activateAtTick: published.activateAtTick,
        appliedTick: step.appliedTick,
        updatedVehicles: step.updated,
        status: 'APPLIED' as const,
      });
  }

  const composition = pipelineResult.composition;
  const sourceSegmentIds = composition !== null ? composition.appliedSegments : [segment.segmentId];
  const evidence = evidenceOf(segment, sourceSegmentIds, opportunityIds);
  const changed =
    composition !== null &&
    pipelineResult.versionId !== null &&
    composition.value !== composition.baseValue;
  const delta: MissionDemoDelta | null =
    changed && composition !== null && pipelineResult.versionId !== null
      ? Object.freeze({
          key: composition.key,
          unit: getParameterDefinition(composition.key).unit,
          previous: composition.baseValue,
          next: composition.value,
          delta: round(composition.value - composition.baseValue),
          versionId: pipelineResult.versionId,
          parentVersionId: pipelineResult.parentVersionId,
        })
      : null;
  const justifiedDelta =
    delta !== null &&
    evidence.status === 'READY' &&
    evidence.distinctEpisodes > 0 &&
    evidence.confidence !== 'UNOBSERVED' &&
    evidence.contexts.length > 0;
  const observedActivation = activation !== null;
  const satisfied = justifiedDelta && observedActivation;

  const publishedVersion =
    pipelineResult.status === 'COMPOSED' || pipelineResult.status === 'RECOMPOSED';
  const status: MissionDemoStatus =
    publishedVersion && satisfied
      ? 'DEMONSTRATED'
      : publishedVersion && delta !== null
        ? 'REJECTED'
        : pipelineResult.status === 'NO_CHANGE' || publishedVersion
          ? 'NO_CHANGE'
          : 'REJECTED';
  const reason =
    status === 'DEMONSTRATED'
      ? null
      : bounded(
          status === 'NO_CHANGE'
            ? (snapshot?.noChangeReason ?? pipelineResult.reason ?? pipelineResult.status)
            : status === 'REJECTED' && publishedVersion && delta !== null
              ? 'ACTIVATION_NOT_OBSERVED'
              : (pipelineResult.reason ?? pipelineResult.status),
          MISSION_DEMO_LIMITS.reasonCodeUnits,
        );

  const example =
    pipelineResult.versionId !== null
      ? missionDemoLiveExample(world.store, world.profileId, pipelineResult.versionId)
      : missionDemoExperimentExample(experimentProfileId);

  return Object.freeze({
    version: MISSION_DEMO_VERSION,
    missionId,
    segmentId: segment.segmentId,
    status,
    reason,
    versionId: pipelineResult.versionId,
    composedVersionId: composition !== null ? composition.profileVersionId : null,
    evidence,
    delta,
    activation,
    explanation: snapshot === null ? null : explanationOf(snapshot),
    requirements: Object.freeze({
      justifiedDelta,
      observedActivation,
      satisfied,
    }),
    example,
    pipelineStatus: pipelineResult.status,
    pipelineReason: pipelineResult.reason,
    pipelineCode: pipelineResult.code,
  });
}
