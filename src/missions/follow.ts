import { list, number, requireContract } from '../sessions';
import { estimateFollowingParameters } from '../learning';
import type {
  FollowingCandidate,
  FollowingEstimatorObservation,
  ParameterEvidenceReadModel,
} from '../learning';
import { boundedId, plainFields, requireRequired } from './contracts';

/**
 * 119 following-style comparison for the campaign following mission.
 *
 * The mission does not invent a second following law. It compares two profiles by feeding the real
 * 096 estimator with the real observations of both runs, so the distinction between the styles is
 * a *measured* one:
 *
 * - the gap a style holds in a known context is measured by the delivered 048 policy
 *   (`desiredGapM`) and is never re-derived here;
 * - `following_time_headway` (the slope of gap against speed) and `following_min_gap` (the
 *   intercept) are derived only by `estimateFollowingParameters`, which refuses to identify the
 *   two coefficients from a single speed (`WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED`);
 * - the mission therefore only ever asks the player to compare two styles across a set of authored
 *   contexts with distinct speeds and distances, never to estimate coefficients from one speed.
 *
 * A comparison requires identical leader conditions: both runs must cover the same authored
 * scenario ids, and every observation must match the authored ego speed, leader speed and leader
 * identity of its scenario. A run that reports a foreign context is refused as a contract error
 * instead of being silently compared against a different situation.
 *
 * Units are SI. The module owns no clock, DOM, renderer, profile store, learning queue or random
 * source: it reads immutable evidence and returns immutable facts. It never publishes a profile.
 */
export const FOLLOW_SCHEMA_VERSION = '119-mission-follow-v1' as const;
export const FOLLOW_MISSION_ID = 'campaign-3-following-distance' as const;

export const FOLLOW_LIMITS = Object.freeze({
  version: FOLLOW_SCHEMA_VERSION,
  /** Authored contexts a comparison may ask for. */
  scenarios: 6,
  /** Profiles in one comparison: the mission compares exactly two styles. */
  profiles: 2,
  /** Observations accepted per profile and scenario. */
  observationsPerScenario: 8,
  /** Observations accepted for one whole profile run. */
  observationsPerProfile: 32,
  /** Code units for a scenario, profile, leader or opportunity identity. */
  idCodeUnits: 256,
  /**
   * Absolute tolerance when deciding that two identified coefficients are the same. `0.1 s` of
   * headway and `0.5 m` of gap are far below a visible following difference, so the mission never
   * reports a separation the driver could not observe.
   */
  headwayDeltaS: 0.1,
  gapDeltaM: 0.5,
});

/**
 * Authored known contexts. Within one scenario both styles meet exactly the same leader: same ego
 * speed, same leader speed and same authored leader distance. Across the four scenarios the speed
 * varies and the authored distance grows faster than the speed, so one context alone cannot tell a
 * headway style from a minimum-gap style: only the slope/intercept pair over the whole set can.
 */
export interface FollowScenario {
  readonly scenarioId: string;
  readonly egoSpeedMps: number;
  readonly leaderSpeedMps: number;
  readonly leaderGapM: number;
  readonly leaderId: string;
}

function scenario(
  scenarioId: string,
  egoSpeedMps: number,
  leaderGapM: number,
  leaderId: string,
): FollowScenario {
  return Object.freeze({
    scenarioId,
    egoSpeedMps,
    leaderSpeedMps: egoSpeedMps,
    leaderGapM,
    leaderId,
  });
}

/** The comparison set: four distinct speeds, four distinct authored distances. */
export const FOLLOW_COMPARISON_SCENARIOS: readonly FollowScenario[] = Object.freeze([
  scenario('follow-urban-4', 4, 12, 'leader-follow-4'),
  scenario('follow-urban-8', 8, 14, 'leader-follow-8'),
  scenario('follow-urban-12', 12, 16, 'leader-follow-12'),
  scenario('follow-urban-20', 20, 30, 'leader-follow-20'),
]);

/**
 * The single-speed set exists so the refusal is a real, executable context and not a claim: the
 * same leader facts at one speed identify neither coefficient, and the mission cannot progress.
 */
export const FOLLOW_SINGLE_SPEED_SCENARIOS: readonly FollowScenario[] = Object.freeze([
  scenario('follow-urban-8-single', 8, 14, 'leader-follow-8'),
]);

const SCENARIOS = new Map(
  [...FOLLOW_COMPARISON_SCENARIOS, ...FOLLOW_SINGLE_SPEED_SCENARIOS].map((entry) => [
    entry.scenarioId,
    entry,
  ]),
);

export const followComparisonStatuses = ['SEPARATED', 'IDENTICAL', 'UNIDENTIFIED'] as const;
export type FollowComparisonStatus = (typeof followComparisonStatuses)[number];

export const followSeparationKinds = [
  'HEADWAY',
  'MINIMUM_GAP',
  'BOTH',
  'NONE',
  'UNIDENTIFIED',
] as const;
export type FollowSeparationKind = (typeof followSeparationKinds)[number];

export const followMissionOutcomes = ['PROGRESS', 'NO_PROGRESS'] as const;
export type FollowMissionOutcome = (typeof followMissionOutcomes)[number];

/** Closed reasons; a comparison that does not separate carries exactly one of these. */
export const followReasons = [
  'SINGLE_SPEED_CANNOT_IDENTIFY',
  'INSUFFICIENT_IDENTIFICATION_EVIDENCE',
  'PROFILE_VALUES_MATCH',
] as const;
export type FollowReason = (typeof followReasons)[number];

export interface FollowMeasurement {
  readonly scenarioId: string;
  readonly egoSpeedMps: number;
  readonly leaderSpeedMps: number;
  readonly leaderId: string;
  /** Mean gap the style held in this context, in metres. */
  readonly gapM: number;
  readonly observations: number;
}

export interface FollowScenarioRun {
  readonly scenarioId: string;
  readonly observations: readonly FollowingEstimatorObservation[];
}

export interface FollowProfileRun {
  readonly profileId: string;
  readonly scenarios: readonly FollowScenarioRun[];
  /** Real 093 read models of the same run; they decide whether a coefficient is identifiable. */
  readonly evidence: readonly ParameterEvidenceReadModel[];
}

export interface FollowComparisonInput {
  readonly scenarioIds: readonly string[];
  readonly profiles: readonly FollowProfileRun[];
}

export interface FollowProfileComparison {
  readonly profileId: string;
  readonly measurements: readonly FollowMeasurement[];
  readonly headwayS: number | null;
  readonly minGapM: number | null;
  readonly identified: boolean;
  readonly reason: FollowReason | null;
  readonly residualRmsM: number | null;
  /** Structural proof that a comparison never writes a profile or queues a learning job. */
  readonly profileWrites: 0;
  readonly learningJobs: 0;
  readonly versionIds: readonly string[];
}

export interface FollowComparison {
  readonly version: typeof FOLLOW_SCHEMA_VERSION;
  readonly missionId: typeof FOLLOW_MISSION_ID;
  readonly scenarios: readonly FollowScenario[];
  readonly distinctSpeeds: number;
  readonly singleSpeed: boolean;
  readonly profiles: readonly FollowProfileComparison[];
  readonly headwayDeltaS: number | null;
  readonly minGapDeltaM: number | null;
  readonly status: FollowComparisonStatus;
  readonly separation: FollowSeparationKind;
  readonly reason: FollowReason | null;
  readonly profileWrites: 0;
  readonly learningJobs: 0;
  readonly versionIds: readonly string[];
}

export interface FollowMissionGate {
  readonly missionId: typeof FOLLOW_MISSION_ID;
  readonly outcome: FollowMissionOutcome;
  readonly satisfied: boolean;
  readonly reason: FollowReason | null;
  readonly comparisonStatus: FollowComparisonStatus;
}

const runFields = ['profileId', 'scenarios', 'evidence'] as const;
const scenarioRunFields = ['scenarioId', 'observations'] as const;
const inputFields = ['scenarioIds', 'profiles'] as const;
const observationFields = [
  'eligibility',
  'opportunity',
  'artifacts',
  'context',
  'gapM',
  'speedMps',
  'leaderId',
  'leaderSpeedMps',
  'speedGain',
] as const;
const evidenceFields = [
  'key',
  'status',
  'distinctEpisodes',
  'contextBreakdown',
  'sampleCount',
  'quality',
  'uncertainty',
  'unchanged',
  'noEstimate',
] as const;

const SPEED_EPSILON = 1e-6;

function readScenarios(value: unknown): readonly FollowScenario[] {
  const ids = list(value, (entry) =>
    boundedId(entry, FOLLOW_LIMITS.idCodeUnits, 'follow scenario'),
  );
  requireContract(
    ids.length > 0 && ids.length <= FOLLOW_LIMITS.scenarios,
    'Follow comparison scenario capacity violated',
  );
  requireContract(new Set(ids).size === ids.length, 'Duplicate follow comparison scenario');
  return Object.freeze(
    ids.map((scenarioId) => {
      const authored = SCENARIOS.get(scenarioId);
      requireContract(authored !== undefined, `Unknown follow scenario: ${scenarioId}`);
      return authored;
    }),
  );
}

/** Strict reading of the shipped 096 observation so a foreign or edited record is refused. */
function readObservation(value: unknown): FollowingEstimatorObservation {
  const data = plainFields(value, observationFields, 'follow observation');
  for (const key of ['eligibility', 'opportunity', 'artifacts', 'context', 'gapM', 'speedMps'])
    requireRequired(data, key, 'follow observation');
  requireContract(
    data.context === 'LEADER' || data.context === 'QUEUE_STANDSTILL',
    'Unknown follow observation context',
  );
  const gapM = number(data.gapM, 0, 100_000);
  const speedMps = number(data.speedMps, 0, 120);
  const leaderId = boundedId(data.leaderId, FOLLOW_LIMITS.idCodeUnits, 'follow leader');
  const leaderSpeedMps = number(data.leaderSpeedMps, 0, 120);
  const speedGain = data.speedGain === undefined ? undefined : number(data.speedGain, -100, 100);
  return Object.freeze({
    eligibility: data.eligibility,
    opportunity: data.opportunity,
    artifacts: data.artifacts,
    context: data.context,
    gapM,
    speedMps,
    leaderId,
    leaderSpeedMps,
    ...(speedGain === undefined ? {} : { speedGain }),
  }) as FollowingEstimatorObservation;
}

function readEvidence(value: unknown): ParameterEvidenceReadModel {
  const data = plainFields(value, evidenceFields, 'follow evidence');
  for (const key of evidenceFields) requireRequired(data, key, 'follow evidence');
  return Object.freeze({ ...data }) as unknown as ParameterEvidenceReadModel;
}

function readProfile(value: unknown): FollowProfileRun {
  const data = plainFields(value, runFields, 'follow profile run');
  for (const key of runFields) requireRequired(data, key, 'follow profile run');
  const profileId = boundedId(data.profileId, FOLLOW_LIMITS.idCodeUnits, 'follow profile');
  const scenarios = list(data.scenarios, (entry) => {
    const run = plainFields(entry, scenarioRunFields, 'follow scenario run');
    for (const key of scenarioRunFields) requireRequired(run, key, 'follow scenario run');
    const scenarioId = boundedId(run.scenarioId, FOLLOW_LIMITS.idCodeUnits, 'follow scenario');
    const observations = list(run.observations, readObservation);
    requireContract(
      observations.length > 0 && observations.length <= FOLLOW_LIMITS.observationsPerScenario,
      'Follow observation capacity violated',
    );
    return Object.freeze({ scenarioId, observations: Object.freeze([...observations]) });
  });
  requireContract(scenarios.length > 0, 'Follow profile run without scenarios');
  requireContract(
    new Set(scenarios.map((entry) => entry.scenarioId)).size === scenarios.length,
    'Duplicate follow scenario in one profile run',
  );
  requireContract(
    scenarios.reduce((total, entry) => total + entry.observations.length, 0) <=
      FOLLOW_LIMITS.observationsPerProfile,
    'Follow profile observation capacity violated',
  );
  const evidence = list(data.evidence, readEvidence);
  return Object.freeze({ profileId, scenarios: Object.freeze(scenarios), evidence });
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= SPEED_EPSILON;
}

function identify(
  candidate: FollowingCandidate,
  unidentifiable: FollowReason[],
): { readonly value: number | null; readonly reason: FollowReason | null } {
  if (candidate.status !== 'CANDIDATE' || candidate.value === null) {
    unidentifiable.push(
      candidate.reason === 'WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED'
        ? 'SINGLE_SPEED_CANNOT_IDENTIFY'
        : 'INSUFFICIENT_IDENTIFICATION_EVIDENCE',
    );
    return { value: null, reason: null };
  }
  return { value: candidate.value, reason: null };
}

/**
 * Compares exactly two styles on the same authored contexts.
 *
 * Both runs are derived by the same 096 estimator call shape; the comparison only reads the two
 * identified coefficients and their difference. It never fits a second model and never looks at a
 * profile's declared parameter values, so the reported separation is a property of the measured
 * behaviour, not of a label.
 */
export function compareFollowingProfiles(value: unknown): FollowComparison {
  const data = plainFields(value, inputFields, 'follow comparison');
  for (const key of inputFields) requireRequired(data, key, 'follow comparison');
  const scenarios = readScenarios(data.scenarioIds);
  const profiles = list(data.profiles, readProfile);
  requireContract(
    profiles.length === FOLLOW_LIMITS.profiles,
    'A follow comparison requires exactly two profiles',
  );
  requireContract(
    new Set(profiles.map((entry) => entry.profileId)).size === profiles.length,
    'Duplicate follow comparison profile',
  );

  const expectedIds = scenarios.map((entry) => entry.scenarioId);
  const comparisons: FollowProfileComparison[] = [];
  const unresolved: FollowReason[] = [];
  for (const profile of profiles) {
    const unidentifiable: FollowReason[] = [];
    requireContract(
      profile.scenarios.length === scenarios.length &&
        expectedIds.every((id) => profile.scenarios.some((run) => run.scenarioId === id)),
      'Every profile run must cover exactly the declared scenarios',
    );
    const observations: FollowingEstimatorObservation[] = [];
    const measurements: FollowMeasurement[] = [];
    for (const authored of scenarios) {
      const run = profile.scenarios.find((entry) => entry.scenarioId === authored.scenarioId)!;
      for (const observation of run.observations) {
        requireContract(
          sameNumber(observation.speedMps, authored.egoSpeedMps) &&
            sameNumber(observation.leaderSpeedMps, authored.leaderSpeedMps) &&
            observation.leaderId === authored.leaderId,
          `Foreign leader context in follow scenario: ${authored.scenarioId}`,
        );
        requireContract(
          observation.context === 'LEADER',
          'A moving following comparison accepts only LEADER observations',
        );
        observations.push(observation);
      }
      requireContract(
        run.observations.length <= FOLLOW_LIMITS.observationsPerScenario,
        'Follow scenario observation capacity violated',
      );
      measurements.push(
        Object.freeze({
          scenarioId: authored.scenarioId,
          egoSpeedMps: authored.egoSpeedMps,
          leaderSpeedMps: authored.leaderSpeedMps,
          leaderId: authored.leaderId,
          gapM: mean(run.observations.map((entry) => entry.gapM)),
          observations: run.observations.length,
        }),
      );
    }
    const estimation = estimateFollowingParameters(profile.evidence, observations);
    const headway = identify(estimation.candidates.following_time_headway, unidentifiable);
    const minGap = identify(estimation.candidates.following_min_gap, unidentifiable);
    const profileReason =
      headway.value !== null && minGap.value !== null
        ? null
        : (unidentifiable[0] ?? 'INSUFFICIENT_IDENTIFICATION_EVIDENCE');
    if (profileReason !== null) unresolved.push(profileReason);
    comparisons.push(
      Object.freeze({
        profileId: profile.profileId,
        measurements: Object.freeze(measurements),
        headwayS: headway.value,
        minGapM: minGap.value,
        identified: headway.value !== null && minGap.value !== null,
        reason: profileReason,
        residualRmsM: estimation.candidates.following_time_headway.residualRmsM,
        profileWrites: 0 as const,
        learningJobs: 0 as const,
        versionIds: Object.freeze([]),
      }),
    );
  }

  // Same conditions mean the same amount of measured evidence in each scenario for both styles.
  for (const authored of scenarios) {
    const counts = comparisons.map(
      (entry) =>
        entry.measurements.find((row) => row.scenarioId === authored.scenarioId)!.observations,
    );
    requireContract(
      counts.every((count) => count === counts[0]),
      `Unequal observation counts for identical conditions: ${authored.scenarioId}`,
    );
  }

  const distinctSpeeds = new Set(scenarios.map((entry) => entry.egoSpeedMps.toFixed(3))).size;
  const singleSpeed = distinctSpeeds < 2;
  const [left, right] = comparisons as [FollowProfileComparison, FollowProfileComparison];
  const identified = left.identified && right.identified;
  const headwayDeltaS =
    identified && left.headwayS !== null && right.headwayS !== null
      ? Math.abs(left.headwayS - right.headwayS)
      : null;
  const minGapDeltaM =
    identified && left.minGapM !== null && right.minGapM !== null
      ? Math.abs(left.minGapM - right.minGapM)
      : null;
  const separatedByHeadway = headwayDeltaS !== null && headwayDeltaS >= FOLLOW_LIMITS.headwayDeltaS;
  const separatedByGap = minGapDeltaM !== null && minGapDeltaM >= FOLLOW_LIMITS.gapDeltaM;
  const status: FollowComparisonStatus = !identified
    ? 'UNIDENTIFIED'
    : separatedByHeadway || separatedByGap
      ? 'SEPARATED'
      : 'IDENTICAL';
  const separation: FollowSeparationKind = !identified
    ? 'UNIDENTIFIED'
    : separatedByHeadway && separatedByGap
      ? 'BOTH'
      : separatedByHeadway
        ? 'HEADWAY'
        : separatedByGap
          ? 'MINIMUM_GAP'
          : 'NONE';
  const reason: FollowReason | null =
    status === 'SEPARATED'
      ? null
      : status === 'IDENTICAL'
        ? 'PROFILE_VALUES_MATCH'
        : singleSpeed
          ? 'SINGLE_SPEED_CANNOT_IDENTIFY'
          : (unresolved[0] ?? 'INSUFFICIENT_IDENTIFICATION_EVIDENCE');
  return Object.freeze({
    version: FOLLOW_SCHEMA_VERSION,
    missionId: FOLLOW_MISSION_ID,
    scenarios,
    distinctSpeeds,
    singleSpeed,
    profiles: Object.freeze(comparisons),
    headwayDeltaS,
    minGapDeltaM,
    status,
    separation,
    reason,
    profileWrites: 0 as const,
    learningJobs: 0 as const,
    versionIds: Object.freeze([]),
  });
}

/**
 * The campaign gate. The `campaign-3-following-distance` mission progresses only with a measured
 * separation between the two styles; a single speed produces `NO_PROGRESS` with the estimator's own
 * refusal reason, and no unreported coefficient is accepted.
 */
export function followingMissionGate(comparison: FollowComparison): FollowMissionGate {
  const satisfied = comparison.status === 'SEPARATED';
  return Object.freeze({
    missionId: FOLLOW_MISSION_ID,
    outcome: satisfied ? ('PROGRESS' as const) : ('NO_PROGRESS' as const),
    satisfied,
    reason: satisfied ? null : (comparison.reason ?? 'INSUFFICIENT_IDENTIFICATION_EVIDENCE'),
    comparisonStatus: comparison.status,
  });
}
