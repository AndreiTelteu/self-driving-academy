import { choice, number, record, requireContract, text, tick } from '../sessions';
import {
  getParameterDefinition,
  validateParameterValue,
  verifyProfileVersionChecksum,
} from '../profiles';
import type {
  ProfileDeltaChange,
  ProfileVersionContent,
  ProfileVersionDelta,
  ProfileVersionProvenance,
} from '../profiles';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';

/**
 * 123 "changing a habit": the campaign objective of updating the profile through repeated
 * demonstrations.
 *
 * The mission does not version anything. It reads the real 109 history of one profile and one
 * parameter key, in the order the store hands it out, and evaluates the series of accepted
 * demonstrations that produced those versions. Each step is a real 109 version, so its provenance
 * (source segments, delta, checksum, depth) is carried into the result and can be inspected one
 * demonstration at a time.
 *
 * The "gradual" rule is explicit and lives here, not in the learning modules:
 *
 * - three consecutive demonstrations in one direction establish the new tendency
 *   (`stepsToReplace`), because three is the smallest series in which one contradictory sample
 *   still leaves a strict majority (two of three) in the original direction;
 * - one contradictory demonstration is absorbed: it is reported, it moves the value, but it never
 *   changes the reported tendency;
 * - a tendency is only overturned by two consecutive contradictory demonstrations
 *   (`stepsToReverse`), the smallest repeated contrary series. The reversed tendency starts with
 *   the two steps already counted, so it needs one more consistent demonstration to be established.
 *
 * A single sample can therefore never reverse what a repeated series established, and a repeated
 * series always reverses it. The module owns no clock, DOM, renderer, profile store, learning queue
 * or random source: it reads immutable versions and writes nothing.
 */
export const HABIT_SCHEMA_VERSION = '123-mission-habit-v1' as const;

/** The 116 campaign mission this objective implements. */
export const HABIT_MISSION_ID = 'campaign-7-changing-a-habit' as const;

/** The 116 objective the campaign definition authors for this mission. */
export const HABIT_OBJECTIVE = Object.freeze({
  objectiveId: 'distinct-versions',
  kind: 'DISTINCT_PROFILE_VERSIONS',
  /** Two published versions are compared: the accepted base and the new head. */
  target: 2,
});

export const HABIT_LIMITS = Object.freeze({
  version: HABIT_SCHEMA_VERSION,
  /** 109 per-profile capacity; a longer chain is refused instead of truncated. */
  versions: 128,
  /** Code units per profile, version and segment identity. */
  idCodeUnits: 256,
  /** Code units per engine version or checksum value. */
  tokenCodeUnits: 128,
  /** Two values are the same value only within this absolute tolerance. */
  valueEpsilon: 1e-9,
});

/**
 * The exact gradual rule, published so a player-facing panel and the documentation cannot drift
 * from the implementation.
 */
export const HABIT_POLICY = Object.freeze({
  /** Consecutive accepted demonstrations in one direction that establish the new tendency. */
  stepsToReplace: 3,
  /** Consecutive contradictory demonstrations that overturn an established tendency. */
  stepsToReverse: 2,
});

export const habitDirections = ['INCREASE', 'DECREASE', 'NONE'] as const;
export type HabitDirection = (typeof habitDirections)[number];

export const habitStatuses = ['REPLACED', 'BUILDING', 'NO_DEMONSTRATIONS', 'REJECTED'] as const;
export type HabitStatus = (typeof habitStatuses)[number];

/** Closed rejection codes; an inconsistent input never throws its way out of the mission. */
export const habitRejectionCodes = [
  'INVALID_INPUT',
  'HISTORY_LIMIT',
  'PROFILE_MISMATCH',
  'NO_BASE_VERSION',
  'DUPLICATE_VERSION',
  'MISSING_INTERMEDIATE_VERSION',
  'ENGINE_VERSION_MISMATCH',
  'VERSION_WITHOUT_KEY',
  'DEMONSTRATION_WITHOUT_EVIDENCE',
  'CHECKSUM_MISMATCH',
  'VALUE_MISMATCH',
] as const;
export type HabitRejectionCode = (typeof habitRejectionCodes)[number];

export const habitMissionReasons = ['NO_DEMONSTRATIONS', 'TENDENCY_NOT_REPLACED'] as const;
export type HabitMissionReason = (typeof habitMissionReasons)[number];

export const habitMissionOutcomes = ['PROGRESS', 'NO_PROGRESS'] as const;
export type HabitMissionOutcome = (typeof habitMissionOutcomes)[number];

export interface HabitMissionInput {
  /** Profile whose 109 versions are being inspected. */
  readonly profileId: string;
  /** The 092 parameter key whose habit the demonstrations move. */
  readonly key: string;
  /** Base-to-tip 109 history of that profile, exactly as `store.getHistory` returns it. */
  readonly history: readonly unknown[];
}

/** One immutable 109 version as the mission reports it. */
export interface HabitVersionFact {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly checksum: string;
  readonly depth: number;
  readonly createdAt: string;
  readonly value: number;
}

/** One accepted demonstration: the 109 version it produced and what it changed. */
export interface HabitDemonstrationStep {
  /** Position in the 109 chain, equal to the real `depth` (the base is 0). */
  readonly order: number;
  readonly versionId: string;
  readonly parentVersionId: string;
  readonly checksum: string;
  readonly checksumVerified: true;
  readonly depth: number;
  readonly createdAt: string;
  readonly segmentId: string;
  readonly interventionId: string | null;
  readonly sourceSegmentIds: readonly string[];
  readonly key: string;
  readonly unit: string;
  readonly previousValue: number;
  readonly newValue: number;
  /** Signed change of this demonstration, rounded to 1e-6 for display. */
  readonly change: number;
  /** Change carried by this demonstration: `INCREASE`, `DECREASE` or `NONE`. */
  readonly direction: HabitDirection;
  /** Reported tendency after this demonstration. */
  readonly trendDirection: HabitDirection;
  /** Consecutive demonstrations in `trendDirection` after this one. */
  readonly consecutiveSteps: number;
  /** A contradictory demonstration absorbed without changing the tendency. */
  readonly absorbed: boolean;
  /** This demonstration overturned the previous tendency. */
  readonly reversal: boolean;
  /** Signed change from the base value to this version. */
  readonly totalChange: number;
}

export interface HabitTrend {
  readonly direction: HabitDirection;
  readonly consecutiveSteps: number;
  readonly longestRun: number;
  /** `min(1, consecutiveSteps / stepsToReplace)`. */
  readonly progress: number;
  readonly stepsToReplace: number;
  readonly stepsToReverse: number;
  readonly replaced: boolean;
  /** Contradictory demonstrations observed in total. */
  readonly contradictions: number;
  /** Contradictory demonstrations that did not overturn the tendency. */
  readonly absorbedContradictions: number;
  readonly reversals: number;
}

/** The base and the head of the chain: the two versions the player compares. */
export interface HabitComparison {
  readonly baseVersionId: string;
  readonly baseValue: number;
  readonly baseChecksum: string;
  readonly headVersionId: string;
  readonly headValue: number;
  readonly headChecksum: string;
  readonly change: number;
  readonly direction: HabitDirection;
  /** Versions compared, including the base. */
  readonly versions: number;
  readonly demonstrations: number;
  readonly replaced: boolean;
}

export interface HabitMissionResult {
  readonly version: typeof HABIT_SCHEMA_VERSION;
  readonly missionId: typeof HABIT_MISSION_ID;
  readonly profileId: string | null;
  readonly key: string | null;
  readonly unit: string | null;
  readonly status: HabitStatus;
  /** Closed rejection code or closed gate reason; `null` for a replaced tendency. */
  readonly reason: HabitRejectionCode | HabitMissionReason | null;
  readonly detail: string | null;
  readonly trend: HabitTrend | null;
  readonly base: HabitVersionFact | null;
  readonly head: HabitVersionFact | null;
  readonly comparison: HabitComparison | null;
  readonly steps: readonly HabitDemonstrationStep[];
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

export interface HabitMissionGate {
  readonly missionId: typeof HABIT_MISSION_ID;
  readonly objectiveId: string;
  readonly outcome: HabitMissionOutcome;
  readonly satisfied: boolean;
  readonly reason: HabitRejectionCode | HabitMissionReason | null;
  readonly replaced: boolean;
  readonly comparedVersions: number;
  readonly demonstrations: number;
  readonly direction: HabitDirection;
}

const inputFields = ['profileId', 'key', 'history'] as const;
const versionFields = [
  'schemaVersion',
  'units',
  'profileId',
  'versionId',
  'parentVersionId',
  'engineVersion',
  'parameters',
  'provenance',
  'sourceSegmentIds',
  'depth',
  'createdAt',
  'checksum',
] as const;
const provenanceFields = ['origin', 'sourceSegmentIds', 'sourceInterventionIds', 'delta'] as const;
const deltaFields = [
  'baseVersionId',
  'validationVersion',
  'segmentId',
  'interventionId',
  'reason',
  'keyCount',
  'changes',
] as const;
const changeFields = ['key', 'unit', 'previousValue', 'newValue'] as const;
const origins = ['BASE', 'DERIVED'] as const;
const checksumPattern = /^fnv1a64:[0-9a-f]{16}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

interface ParsedVersion {
  readonly profileId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly provenance: ProfileVersionProvenance;
  readonly sourceSegmentIds: readonly string[];
  readonly depth: number;
  readonly createdAt: string;
  readonly checksum: string;
  readonly content: ProfileVersionContent;
}

/** Internal, code-carrying failure. It is translated into a closed `REJECTED` result. */
class HabitRejection extends Error {
  readonly code: HabitRejectionCode;
  readonly detail: string;

  constructor(code: HabitRejectionCode, detail: string) {
    super(detail);
    this.name = 'HabitRejection';
    this.code = code;
    this.detail = detail;
  }
}

function reject(code: HabitRejectionCode, detail: string): never {
  throw new HabitRejection(code, detail);
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function directionOf(change: number): HabitDirection {
  if (change > HABIT_LIMITS.valueEpsilon) return 'INCREASE';
  if (change < -HABIT_LIMITS.valueEpsilon) return 'DECREASE';
  return 'NONE';
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= HABIT_LIMITS.valueEpsilon;
}

function readIds(value: unknown, label: string): readonly string[] {
  requireContract(Array.isArray(value), `${label} must be an array`);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value as readonly unknown[]) {
    const id = boundedId(entry, HABIT_LIMITS.idCodeUnits, label);
    requireContract(!seen.has(id), `Duplicate ${label}: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function readParameters(value: unknown): Readonly<Record<string, number>> {
  const raw = record(value);
  const keys = Object.keys(raw);
  requireContract(keys.length > 0, 'A profile version needs at least one parameter');
  const parameters: Record<string, number> = Object.create(null);
  for (const key of keys) {
    const definition = getParameterDefinition(key);
    parameters[key] = validateParameterValue(key, raw[key], definition.unit);
  }
  return Object.freeze(parameters);
}

function readChanges(value: unknown): readonly ProfileDeltaChange[] {
  requireContract(Array.isArray(value), 'A profile delta needs its changes');
  const changes: ProfileDeltaChange[] = [];
  const seen = new Set<string>();
  for (const entry of value as readonly unknown[]) {
    const data = plainFields(entry, changeFields, 'habit delta change');
    for (const key of changeFields) requireRequired(data, key, 'habit delta change');
    const key = boundedId(data.key, HABIT_LIMITS.idCodeUnits, 'habit delta change');
    requireContract(!seen.has(key), `Duplicate habit delta change: ${key}`);
    seen.add(key);
    const definition = getParameterDefinition(key);
    requireContract(
      data.unit === definition.unit,
      `Habit delta unit for ${key} is not the registry unit`,
    );
    const previousValue = number(data.previousValue, definition.min, definition.max);
    const newValue = number(data.newValue, definition.min, definition.max);
    changes.push(Object.freeze({ key, unit: definition.unit, previousValue, newValue }));
  }
  return Object.freeze(changes);
}

function readDelta(value: unknown): ProfileVersionDelta {
  const data = plainFields(value, deltaFields, 'habit delta');
  for (const key of deltaFields) requireRequired(data, key, 'habit delta');
  const keyCount = tick(data.keyCount);
  const changes = readChanges(data.changes);
  requireContract(keyCount === changes.length, 'Habit delta key count does not match its changes');
  return Object.freeze({
    baseVersionId: boundedId(data.baseVersionId, HABIT_LIMITS.idCodeUnits, 'habit delta base'),
    validationVersion: boundedId(
      data.validationVersion,
      HABIT_LIMITS.tokenCodeUnits,
      'habit delta validation',
    ),
    segmentId: boundedId(data.segmentId, HABIT_LIMITS.idCodeUnits, 'habit delta segment'),
    interventionId:
      data.interventionId === null
        ? null
        : boundedId(data.interventionId, HABIT_LIMITS.idCodeUnits, 'habit delta intervention'),
    reason:
      data.reason === null
        ? null
        : boundedId(data.reason, HABIT_LIMITS.idCodeUnits, 'habit delta reason'),
    keyCount,
    changes,
  });
}

function readProvenance(value: unknown): ProfileVersionProvenance {
  const data = plainFields(value, provenanceFields, 'habit provenance');
  for (const key of provenanceFields) requireRequired(data, key, 'habit provenance');
  return Object.freeze({
    origin: choice(data.origin, origins),
    sourceSegmentIds: readIds(data.sourceSegmentIds, 'habit provenance segment'),
    sourceInterventionIds: readIds(data.sourceInterventionIds, 'habit provenance intervention'),
    delta: data.delta === null ? null : readDelta(data.delta),
  });
}

function readVersion(value: unknown): ParsedVersion {
  const data = plainFields(value, versionFields, 'habit profile version');
  for (const key of versionFields) requireRequired(data, key, 'habit profile version');
  requireContract(data.schemaVersion === 1, 'Unsupported habit profile version schema');
  requireContract(data.units === 'SI', 'Habit profile versions must use SI units');
  const profileId = boundedId(data.profileId, HABIT_LIMITS.idCodeUnits, 'habit profile');
  const versionId = boundedId(data.versionId, HABIT_LIMITS.idCodeUnits, 'habit version');
  const parentVersionId =
    data.parentVersionId === null
      ? null
      : boundedId(data.parentVersionId, HABIT_LIMITS.idCodeUnits, 'habit parent version');
  const engineVersion = boundedId(
    data.engineVersion,
    HABIT_LIMITS.tokenCodeUnits,
    'habit engine version',
  );
  const parameters = readParameters(data.parameters);
  const provenance = readProvenance(data.provenance);
  const sourceSegmentIds = readIds(data.sourceSegmentIds, 'habit source segment');
  const depth = tick(data.depth);
  const createdAt = text(data.createdAt);
  requireContract(timestampPattern.test(createdAt), 'Habit version timestamp is not UTC ISO 8601');
  const checksum = boundedId(data.checksum, HABIT_LIMITS.tokenCodeUnits, 'habit checksum');
  requireContract(checksumPattern.test(checksum), 'Habit checksum is not a 109 content hash');
  const content: ProfileVersionContent = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId,
    engineVersion,
    parameters,
    provenance,
    sourceSegmentIds,
    depth,
    createdAt,
  });
  return {
    profileId,
    versionId,
    parentVersionId,
    engineVersion,
    parameters,
    provenance,
    sourceSegmentIds,
    depth,
    createdAt,
    checksum,
    content,
  };
}

function factOf(version: ParsedVersion, key: string): HabitVersionFact {
  return Object.freeze({
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    checksum: version.checksum,
    depth: version.depth,
    createdAt: version.createdAt,
    value: version.parameters[key]!,
  });
}

function rejected(
  detail: string,
  code: HabitRejectionCode,
  profileId: string | null,
  key: string | null,
): HabitMissionResult {
  return Object.freeze({
    version: HABIT_SCHEMA_VERSION,
    missionId: HABIT_MISSION_ID,
    profileId,
    key,
    unit: null,
    status: 'REJECTED' as const,
    reason: code,
    detail,
    trend: null,
    base: null,
    head: null,
    comparison: null,
    steps: Object.freeze([]),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

/**
 * Evaluates the habit objective over the real 109 history of one profile.
 *
 * Every inconsistency is refused with a closed code and a human-readable detail instead of an
 * uncaught exception: a version of another profile, a chain with a missing intermediate version, a
 * demonstration without provenance, a broken checksum or a value that does not match its recorded
 * delta. A history with only the base version is a valid, empty run (`NO_DEMONSTRATIONS`), not a
 * rejection.
 */
export function evaluateHabitMission(value: unknown): HabitMissionResult {
  let profileId: string | null = null;
  let key: string | null = null;
  try {
    const data = plainFields(value, inputFields, 'habit mission');
    for (const field of inputFields) requireRequired(data, field, 'habit mission');
    profileId = boundedId(data.profileId, HABIT_LIMITS.idCodeUnits, 'habit mission profile');
    key = boundedId(data.key, HABIT_LIMITS.idCodeUnits, 'habit mission key');
    requireContract(getParameterDefinition(key).key === key, `Unknown habit parameter key: ${key}`);
    requireContract(Array.isArray(data.history), 'Habit history must be an array');
    const rawHistory = data.history as readonly unknown[];
    if (rawHistory.length === 0)
      reject('NO_BASE_VERSION', 'The habit history has no base version to inspect');
    if (rawHistory.length > HABIT_LIMITS.versions)
      reject(
        'HISTORY_LIMIT',
        `The habit history holds ${rawHistory.length} versions and exceeds the 109 capacity`,
      );

    const versions: ParsedVersion[] = [];
    const seen = new Set<string>();
    for (const entry of rawHistory) {
      const version = readVersion(entry);
      if (seen.has(version.versionId))
        reject('DUPLICATE_VERSION', `The habit history repeats ${version.versionId}`);
      seen.add(version.versionId);
      versions.push(version);
    }
    for (const version of versions)
      if (version.profileId !== profileId)
        reject(
          'PROFILE_MISMATCH',
          `Version ${version.versionId} belongs to ${version.profileId}, not ${profileId}`,
        );

    const base = versions[0]!;
    if (base.provenance.origin !== 'BASE' || base.parentVersionId !== null || base.depth !== 0)
      reject('NO_BASE_VERSION', `Version ${base.versionId} is not a base version`);
    if (!Object.hasOwn(base.parameters, key))
      reject('VERSION_WITHOUT_KEY', `Base version ${base.versionId} has no ${key} value`);

    for (const [index, version] of versions.entries()) {
      if (version.engineVersion !== base.engineVersion)
        reject(
          'ENGINE_VERSION_MISMATCH',
          `Version ${version.versionId} targets ${version.engineVersion}, not ${base.engineVersion}`,
        );
      if (version.depth !== index)
        reject(
          'MISSING_INTERMEDIATE_VERSION',
          `Version ${version.versionId} sits at depth ${version.depth} instead of ${index}`,
        );
      if (index === 0) continue;
      const parent = versions[index - 1]!;
      if (version.provenance.origin !== 'DERIVED' || version.parentVersionId !== parent.versionId)
        reject(
          'MISSING_INTERMEDIATE_VERSION',
          `Version ${version.versionId} does not continue ${parent.versionId}`,
        );
      const delta = version.provenance.delta;
      if (
        delta === null ||
        delta.baseVersionId !== parent.versionId ||
        delta.segmentId.length === 0 ||
        delta.changes.length === 0 ||
        version.sourceSegmentIds.length === 0
      )
        reject(
          'DEMONSTRATION_WITHOUT_EVIDENCE',
          `Version ${version.versionId} carries no demonstrated segment for ${key}`,
        );
      if (!delta.changes.some((change) => change.key === key))
        reject(
          'DEMONSTRATION_WITHOUT_EVIDENCE',
          `Version ${version.versionId} does not demonstrate ${key}`,
        );
    }

    for (const version of versions)
      if (!verifyProfileVersionChecksum({ ...version.content, checksum: version.checksum }))
        reject(
          'CHECKSUM_MISMATCH',
          `The 109 checksum of ${version.versionId} does not match its content`,
        );

    const baseValue = base.parameters[key]!;
    const steps: HabitDemonstrationStep[] = [];
    let direction: HabitDirection = 'NONE';
    let consecutive = 0;
    let contradictions = 0;
    let consecutiveContradictions = 0;
    let absorbedContradictions = 0;
    let reversals = 0;
    let longestRun = 0;
    for (const [index, version] of versions.entries()) {
      if (index === 0) continue;
      const parent = versions[index - 1]!;
      const delta = version.provenance.delta!;
      const change = delta.changes.find((row) => row.key === key)!;
      const parentValue = parent.parameters[key]!;
      const value = version.parameters[key]!;
      if (!sameValue(change.previousValue, parentValue) || !sameValue(change.newValue, value))
        reject(
          'VALUE_MISMATCH',
          `Version ${version.versionId} does not match its recorded ${key} delta`,
        );
      const stepDirection = directionOf(value - parentValue);
      if (stepDirection === 'NONE')
        reject(
          'DEMONSTRATION_WITHOUT_EVIDENCE',
          `Version ${version.versionId} demonstrates no ${key} change`,
        );
      let absorbed = false;
      let reversal = false;
      if (direction === 'NONE') {
        direction = stepDirection;
        consecutive = 1;
      } else if (stepDirection === direction) {
        consecutive += 1;
        consecutiveContradictions = 0;
      } else {
        contradictions += 1;
        consecutiveContradictions += 1;
        if (consecutiveContradictions >= HABIT_POLICY.stepsToReverse) {
          direction = stepDirection;
          consecutive = consecutiveContradictions;
          consecutiveContradictions = 0;
          reversals += 1;
          reversal = true;
        } else {
          absorbedContradictions += 1;
          absorbed = true;
        }
      }
      longestRun = Math.max(longestRun, consecutive);
      steps.push(
        Object.freeze({
          order: version.depth,
          versionId: version.versionId,
          parentVersionId: parent.versionId,
          checksum: version.checksum,
          checksumVerified: true as const,
          depth: version.depth,
          createdAt: version.createdAt,
          segmentId: delta.segmentId,
          interventionId: delta.interventionId,
          sourceSegmentIds: Object.freeze([...version.sourceSegmentIds].sort(compareText)),
          key,
          unit: getParameterDefinition(key).unit,
          previousValue: parentValue,
          newValue: value,
          change: round(value - parentValue),
          direction: stepDirection,
          trendDirection: direction,
          consecutiveSteps: consecutive,
          absorbed,
          reversal,
          totalChange: round(value - baseValue),
        }),
      );
    }

    const head = versions.at(-1)!;
    const headValue = head.parameters[key]!;
    const replaced = steps.length > 0 && consecutive >= HABIT_POLICY.stepsToReplace;
    const trend: HabitTrend = Object.freeze({
      direction,
      consecutiveSteps: consecutive,
      longestRun,
      progress: Math.min(1, consecutive / HABIT_POLICY.stepsToReplace),
      stepsToReplace: HABIT_POLICY.stepsToReplace,
      stepsToReverse: HABIT_POLICY.stepsToReverse,
      replaced,
      contradictions,
      absorbedContradictions,
      reversals,
    });
    const status: HabitStatus =
      steps.length === 0 ? 'NO_DEMONSTRATIONS' : replaced ? 'REPLACED' : 'BUILDING';
    const comparison: HabitComparison = Object.freeze({
      baseVersionId: base.versionId,
      baseValue,
      baseChecksum: base.checksum,
      headVersionId: head.versionId,
      headValue,
      headChecksum: head.checksum,
      change: round(headValue - baseValue),
      direction: directionOf(headValue - baseValue),
      versions: versions.length,
      demonstrations: steps.length,
      replaced,
    });
    return Object.freeze({
      version: HABIT_SCHEMA_VERSION,
      missionId: HABIT_MISSION_ID,
      profileId,
      key,
      unit: getParameterDefinition(key).unit,
      status,
      reason: status === 'NO_DEMONSTRATIONS' ? ('NO_DEMONSTRATIONS' as const) : null,
      detail:
        status === 'NO_DEMONSTRATIONS'
          ? 'The profile history holds no accepted demonstration to inspect'
          : null,
      trend,
      base: factOf(base, key),
      head: factOf(head, key),
      comparison,
      steps: Object.freeze(steps),
      profileWrites: 0 as const,
      learningJobs: 0 as const,
    });
  } catch (error: unknown) {
    if (error instanceof HabitRejection) return rejected(error.detail, error.code, profileId, key);
    return rejected(
      error instanceof Error ? error.message : 'The habit input is not a contract object',
      'INVALID_INPUT',
      profileId,
      key,
    );
  }
}

/**
 * The campaign gate for stage 7. It requires the new tendency to be established by repeated
 * demonstrations and the two version identities of the 116 objective to be present; a demonstration
 * that was merely absorbed is not progress, and an empty history is reported as such.
 */
export function habitMissionGate(result: HabitMissionResult): HabitMissionGate {
  const comparedVersions = result.comparison?.versions ?? 0;
  const replaced = result.status === 'REPLACED';
  const satisfied = replaced && comparedVersions >= HABIT_OBJECTIVE.target;
  let reason: HabitRejectionCode | HabitMissionReason | null = null;
  if (!satisfied) {
    if (result.status === 'REJECTED') reason = result.reason;
    else if (result.status === 'NO_DEMONSTRATIONS') reason = 'NO_DEMONSTRATIONS';
    else reason = 'TENDENCY_NOT_REPLACED';
  }
  return Object.freeze({
    missionId: HABIT_MISSION_ID,
    objectiveId: HABIT_OBJECTIVE.objectiveId,
    outcome: satisfied ? ('PROGRESS' as const) : ('NO_PROGRESS' as const),
    satisfied,
    reason,
    replaced,
    comparedVersions,
    demonstrations: result.comparison?.demonstrations ?? 0,
    direction: result.trend?.direction ?? 'NONE',
  });
}
