import { parameterDefinitions } from '../profiles';
import {
  choice,
  createStableId,
  list,
  number,
  randomUint32,
  requireContract,
  tick,
} from '../sessions';
import { VEHICLE_CLASSES } from '../vehicles';
import { COMFORT_LIMIT_EPSILON, COMFORT_THRESHOLDS } from './comfort';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';
import { parseDailyTemplateCatalog } from './daily';
import type { DailyTemplateCatalog, DailyTemplateFamily } from './daily';

/**
 * 231 unusual challenge catalog and its pure evaluators.
 *
 * A challenge is a short, optional situation offered while the player drives (Docs/28). This module
 * owns the *authored* half of that experience: a versioned catalog of twelve templates, a closed
 * prerequisite vocabulary, and one pure evaluator per observable objective. It owns no director, no
 * offer scheduling, no instance lifecycle, no persistence and no reward credit — those are 232/233.
 *
 * Every template declares:
 *
 * - a stable `templateId` plus an explicit `version`, so a changed authored revision is a new
 *   identity rather than a silent edit (same rule as 116 definitions);
 * - an observable objective with a real evaluator, a measurable target and versioned thresholds;
 * - the session kinds, control mode, zones, vehicle classes, capabilities and learning keys it
 *   needs, so a missing prerequisite *excludes the template explicitly* instead of generating an
 *   impossible challenge;
 * - the incident budget, a reference duration plus a margin that produce a feasible deadline, the
 *   reward policy and the R/replay rules;
 * - dialogue bound to real observation events; the filming premise is internal replay only.
 *
 * The evaluators are pure: the caller supplies an explicit 60 Hz tick window and the facts the real
 * subsystems recorded. There is no wall clock, no `Math.random`, no DOM, no renderer and no profile
 * read. Inputs are fact arrays bounded by `CHALLENGE_LIMITS`; the evaluator sorts them by tick, so a
 * permuted but otherwise identical fact list produces the same verdict bytes and fingerprint.
 *
 * Drift is deliberately difficult to farm: a sample counts only inside the declared drift zone, at
 * or above the minimum speed, at or above the minimum slip angle, and only when no collision impulse
 * touched that tick. Spinning in place has no speed and a collision pushes the car through the pad,
 * so neither accumulates drift. The catalog validation forbids lowering those floors.
 */

export const CHALLENGE_SCHEMA_VERSION = '231-challenge-catalog-v1' as const;
export const CHALLENGE_TEMPLATE_CATALOG_VERSION = '231-challenge-templates-v1' as const;
export const CHALLENGE_EVALUATOR_VERSION = '231-challenge-evaluators-v1' as const;
export const CHALLENGE_CAPABILITY_VERSION = '231-challenge-capabilities-v1' as const;
export const CHALLENGE_DAILY_BRIDGE_VERSION = '231-challenge-daily-bridge-v1' as const;
export const CHALLENGE_TICK_HZ = 60 as const;

/** Fixed budgets. A catalog, a fact list or a replay loop cannot grow these values. */
export const CHALLENGE_LIMITS = Object.freeze({
  version: CHALLENGE_SCHEMA_VERSION,
  /** Authored templates in one catalog; the delivered V1 catalog uses twelve. */
  templates: 32,
  /** The V1 catalog must cover at least this many distinct templates. */
  minimumTemplates: 12,
  /** Zone requirements in one template. */
  zoneRequirements: 6,
  /** Concrete zones a template may place in an objective. */
  zonesPerTemplate: 8,
  /** Target options in one template. */
  targets: 4,
  /** Declared incident budgets in one template. */
  incidentBudgets: 4,
  /** Declared deadline margins in one template. */
  margins: 3,
  /** Dialogue lines in one template (offer, progress, success, failure). */
  dialogueLines: 4,
  /** Zone visits retained for one evaluation. */
  zoneVisits: 32,
  /** Checkpoint crossings retained for one evaluation. */
  checkpoints: 16,
  /** Dropoffs retained for one evaluation. */
  dropoffs: 8,
  /** Parking attempts retained for one evaluation. */
  parked: 8,
  /** Drift samples retained for one evaluation (one per tick). */
  driftSamples: 20_000,
  /** Destruction facts retained for one evaluation. */
  destruction: 128,
  /** Comfort samples retained for one evaluation. */
  comfortSamples: 20_000,
  /** Attempts per template; a replay starts a new identity. */
  attemptsPerTemplate: 8,
  /** Code units per identity (template, zone, instance). */
  idCodeUnits: 256,
  /** Code units per authored title and label. */
  titleCodeUnits: 160,
  /** Code units per dialogue line. */
  dialogueCodeUnits: 240,
});

export const challengeFamilies = [
  'PRECISION',
  'DISCIPLINE',
  'EXPLORATION',
  'CONTROLLED_DESTRUCTION',
  'EFFICIENCY',
  'EXPERIMENT',
] as const;
export type ChallengeFamily = (typeof challengeFamilies)[number];

/** The two real worlds of 225. The catalog never invents a third one. */
export const challengeSessionKinds = ['ACADEMY', 'CHAOS'] as const;
export type ChallengeSessionKind = (typeof challengeSessionKinds)[number];

/** Real control modes; `LEARNING` is the 031/040 experiment mode, never a fabricated one. */
export const challengeControlSources = ['MANUAL', 'LEARNING', 'AUTO'] as const;
export type ChallengeControlSource = (typeof challengeControlSources)[number];

export const challengeControlRequirements = ['MANUAL', 'LEARNING', 'ANY'] as const;
export type ChallengeControlRequirement = (typeof challengeControlRequirements)[number];

/** Real map-facing zone families used by the templates. */
export const challengeZoneKinds = [
  'HOSPITAL',
  'TOILET',
  'TERMINAL',
  'CHECKPOINT',
  'PARKING',
  'DRIFT_PAD',
  'DEMOLITION_ALLEY',
  'LANDMARK',
] as const;
export type ChallengeZoneKind = (typeof challengeZoneKinds)[number];

/** The closed objective vocabulary; every kind has a real evaluator below. */
export const challengeObjectiveKinds = [
  'CHECKPOINTS',
  'ZONE_ORDER',
  'TIMED_DROPOFF',
  'COMFORT',
  'PARKING',
  'DRIFT',
  'DISTRUCTION',
  'LEARNING',
] as const;
export type ChallengeObjectiveKind = (typeof challengeObjectiveKinds)[number];

export const challengeEvaluatorIds = [
  'checkpoint-sequence',
  'zone-order',
  'timed-dropoff',
  'comfort-budget',
  'parking-precision',
  'drift-accumulation',
  'distinct-destruction',
  'learning-observation',
] as const;
export type ChallengeEvaluatorId = (typeof challengeEvaluatorIds)[number];

/**
 * Closed capability vocabulary. It deliberately contains no pedestrians or walking: challenge
 * scenes are driving scenes, so a template that asks for V2 pedestrians or V3 walking is refused
 * rather than silently accepted and failed at runtime.
 */
export const challengeCapabilities = [
  'FREE_DRIVE',
  'MANUAL_CONTROL',
  'AUTO_CONTROL',
  'LEARNING',
  'DESTRUCTIBLE_DECOR',
  'WORLD_RESET',
  'SESSION_RECORDS',
] as const;
export type ChallengeCapability = (typeof challengeCapabilities)[number];

/** Explicit, actionable refusal for a scene that asks for a V2/V3 feature. */
export const challengeForbiddenCapabilities = [
  'PEDESTRIANS',
  'PEDESTRIANS_V2',
  'PEDESTRIAN_WALKING',
  'WALKING',
  'WALKING_V3',
] as const;

/** Real observation events a dialogue line can be bound to. */
export const challengeObservationEvents = [
  'CHECKPOINT_REACHED',
  'ZONE_ENTERED',
  'DROPOFF',
  'FULL_STOP',
  'DRIFT_SAMPLE',
  'DESTRUCTIBLE_BROKEN',
  'PROFILE_ACTIVATE',
  'COMFORT_SAMPLE',
  'DEADLINE_EXPIRED',
  'INCIDENT',
] as const;
export type ChallengeObservationEvent = (typeof challengeObservationEvents)[number];

export const challengeDialogueTriggers = ['OFFER', 'PROGRESS', 'SUCCESS', 'FAILURE'] as const;
export type ChallengeDialogueTrigger = (typeof challengeDialogueTriggers)[number];

export const challengeVerdictStatuses = ['PASSED', 'FAILED', 'INCOMPLETE', 'EXCLUDED'] as const;
export type ChallengeVerdictStatus = (typeof challengeVerdictStatuses)[number];

/** Closed verdict vocabulary; a failure always names one of these. */
export const challengeVerdictReasons = [
  'TARGET_REACHED',
  'PROGRESS',
  'DEADLINE_EXPIRED',
  'INCIDENT_BUDGET_EXCEEDED',
  'ORDER_VIOLATION',
  'STOP_TOO_LONG',
  'COMFORT_LIMIT',
  'PASSENGER_REQUIRED',
  'PARKING_SPEED',
  'PARKING_HEADING',
  'PARKING_DWELL',
  'WRONG_ZONE',
  'NO_VALID_DRIFT',
  'SESSION_NOT_ALLOWED',
  'CONTROL_NOT_ALLOWED',
  'ZONE_MISSING',
  'LEARNING_KEY_MISSING',
  'EFFECT_NOT_OBSERVED',
] as const;
export type ChallengeVerdictReason = (typeof challengeVerdictReasons)[number];

const forbiddenDialogueTerms = [
  'upload',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'social media',
  'live stream',
] as const;

const implementedLearningKeys = new Set(
  parameterDefinitions.filter((definition) => definition.implemented).map((entry) => entry.key),
);
const vehicleClassIds = new Set(Object.keys(VEHICLE_CLASSES));
const campaignMissionCount = 8;

/* ---------------------------------------------------------------------------------------------
 * Evaluator definitions: version, real zone/event vocabulary and versioned thresholds
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeThresholdSpec {
  readonly key: string;
  readonly unit: 's' | 'mps' | 'mps2' | 'mps3' | 'rad' | 'ticks' | 'ratio';
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue: number;
  readonly integer: boolean;
}

export interface ChallengeEvaluatorDefinition {
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly version: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly sessions: readonly ChallengeSessionKind[];
  readonly controls: readonly ChallengeControlSource[];
  readonly zoneKinds: readonly ChallengeZoneKind[];
  /** Zone ids the objective must carry: minimum and maximum. */
  readonly zoneIds: Readonly<{ minimum: number; maximum: number }>;
  /** Checkpoint-based objectives always need a real route between checkpoints. */
  readonly requiresRoute: boolean;
  readonly observations: readonly ChallengeObservationEvent[];
  readonly thresholds: readonly ChallengeThresholdSpec[];
}

function threshold(
  key: string,
  unit: ChallengeThresholdSpec['unit'],
  minimum: number,
  maximum: number,
  defaultValue: number,
  integer = false,
): ChallengeThresholdSpec {
  return Object.freeze({ key, unit, minimum, maximum, defaultValue, integer });
}

const evaluatorDefinitions: readonly ChallengeEvaluatorDefinition[] = Object.freeze([
  Object.freeze({
    evaluatorId: 'checkpoint-sequence',
    version: '231-eval-checkpoint-sequence-v1',
    objectiveKind: 'CHECKPOINTS',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL'] as const),
    zoneKinds: Object.freeze(['CHECKPOINT'] as const),
    zoneIds: Object.freeze({ minimum: 2, maximum: 6 }),
    requiresRoute: true,
    observations: Object.freeze([
      'CHECKPOINT_REACHED',
      'FULL_STOP',
      'DEADLINE_EXPIRED',
      'INCIDENT',
    ] as const),
    thresholds: Object.freeze([threshold('stopToleranceS', 's', 0.5, 15, 2)]),
  }),
  Object.freeze({
    evaluatorId: 'zone-order',
    version: '231-eval-zone-order-v1',
    objectiveKind: 'ZONE_ORDER',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL', 'AUTO', 'LEARNING'] as const),
    zoneKinds: Object.freeze(['TOILET', 'LANDMARK', 'CHECKPOINT'] as const),
    zoneIds: Object.freeze({ minimum: 1, maximum: 6 }),
    requiresRoute: false,
    observations: Object.freeze(['ZONE_ENTERED', 'DEADLINE_EXPIRED', 'INCIDENT'] as const),
    thresholds: Object.freeze([threshold('anyOf', 'ratio', 0, 1, 0, true)]),
  }),
  Object.freeze({
    evaluatorId: 'timed-dropoff',
    version: '231-eval-timed-dropoff-v1',
    objectiveKind: 'TIMED_DROPOFF',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL', 'AUTO', 'LEARNING'] as const),
    zoneKinds: Object.freeze(['HOSPITAL', 'TERMINAL'] as const),
    zoneIds: Object.freeze({ minimum: 1, maximum: 1 }),
    requiresRoute: false,
    observations: Object.freeze(['DROPOFF', 'DEADLINE_EXPIRED', 'INCIDENT'] as const),
    thresholds: Object.freeze([]),
  }),
  Object.freeze({
    evaluatorId: 'comfort-budget',
    version: '231-eval-comfort-budget-v1',
    objectiveKind: 'COMFORT',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL'] as const),
    zoneKinds: Object.freeze([] as ChallengeZoneKind[]),
    zoneIds: Object.freeze({ minimum: 0, maximum: 0 }),
    requiresRoute: false,
    observations: Object.freeze([
      'COMFORT_SAMPLE',
      'DROPOFF',
      'DEADLINE_EXPIRED',
      'INCIDENT',
    ] as const),
    thresholds: Object.freeze([
      threshold(
        'maxAccelerationMps2',
        'mps2',
        0.5,
        COMFORT_THRESHOLDS.maxAccelerationMps2,
        COMFORT_THRESHOLDS.maxAccelerationMps2,
      ),
      threshold(
        'maxJerkMps3',
        'mps3',
        0.5,
        COMFORT_THRESHOLDS.maxJerkMps3,
        COMFORT_THRESHOLDS.maxJerkMps3,
      ),
    ]),
  }),
  Object.freeze({
    evaluatorId: 'parking-precision',
    version: '231-eval-parking-precision-v1',
    objectiveKind: 'PARKING',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL'] as const),
    zoneKinds: Object.freeze(['PARKING'] as const),
    zoneIds: Object.freeze({ minimum: 1, maximum: 1 }),
    requiresRoute: false,
    observations: Object.freeze([
      'ZONE_ENTERED',
      'FULL_STOP',
      'DEADLINE_EXPIRED',
      'INCIDENT',
    ] as const),
    thresholds: Object.freeze([
      threshold('maxSpeedMps', 'mps', 0.02, 2, 0.3),
      threshold('maxHeadingErrorRad', 'rad', 0.02, 0.6, 0.12),
      threshold('minDwellS', 's', 0.5, 10, 1.5),
    ]),
  }),
  Object.freeze({
    evaluatorId: 'drift-accumulation',
    version: '231-eval-drift-accumulation-v1',
    objectiveKind: 'DRIFT',
    sessions: Object.freeze([...challengeSessionKinds]),
    controls: Object.freeze(['MANUAL'] as const),
    zoneKinds: Object.freeze(['DRIFT_PAD'] as const),
    zoneIds: Object.freeze({ minimum: 1, maximum: 1 }),
    requiresRoute: false,
    observations: Object.freeze(['DRIFT_SAMPLE', 'DEADLINE_EXPIRED', 'INCIDENT'] as const),
    thresholds: Object.freeze([
      threshold('minSpeedMps', 'mps', 3, 40, 6),
      threshold('minSlipAngleRad', 'rad', 0.1, 1.4, 0.25),
      threshold('minSeconds', 's', 1, 30, 3),
    ]),
  }),
  Object.freeze({
    evaluatorId: 'distinct-destruction',
    version: '231-eval-distinct-destruction-v1',
    objectiveKind: 'DISTRUCTION',
    sessions: Object.freeze(['CHAOS'] as const),
    controls: Object.freeze(['MANUAL'] as const),
    zoneKinds: Object.freeze(['DEMOLITION_ALLEY'] as const),
    zoneIds: Object.freeze({ minimum: 1, maximum: 1 }),
    requiresRoute: false,
    observations: Object.freeze(['DESTRUCTIBLE_BROKEN', 'DEADLINE_EXPIRED', 'INCIDENT'] as const),
    thresholds: Object.freeze([]),
  }),
  Object.freeze({
    evaluatorId: 'learning-observation',
    version: '231-eval-learning-observation-v1',
    objectiveKind: 'LEARNING',
    sessions: Object.freeze(['ACADEMY'] as const),
    controls: Object.freeze(['LEARNING'] as const),
    zoneKinds: Object.freeze([] as ChallengeZoneKind[]),
    zoneIds: Object.freeze({ minimum: 0, maximum: 0 }),
    requiresRoute: false,
    observations: Object.freeze(['PROFILE_ACTIVATE', 'DEADLINE_EXPIRED', 'INCIDENT'] as const),
    thresholds: Object.freeze([
      threshold('maxObservationDelayTicks', 'ticks', 60, 21_600, 3_600, true),
    ]),
  }),
]);

export const CHALLENGE_EVALUATORS: Readonly<
  Record<ChallengeEvaluatorId, ChallengeEvaluatorDefinition>
> = Object.freeze(
  Object.fromEntries(
    evaluatorDefinitions.map((definition) => [definition.evaluatorId, definition]),
  ) as Record<ChallengeEvaluatorId, ChallengeEvaluatorDefinition>,
);

export function challengeEvaluatorDefinition(evaluatorId: string): ChallengeEvaluatorDefinition {
  const definition = CHALLENGE_EVALUATORS[evaluatorId as ChallengeEvaluatorId];
  requireContract(definition !== undefined, `Unknown challenge evaluator: ${evaluatorId}`);
  return definition;
}

/* ---------------------------------------------------------------------------------------------
 * Catalog types
 * ------------------------------------------------------------------------------------------- */

export interface ChallengePrerequisites {
  /** Real 023/057 vehicle classes; empty means "any existing class". */
  readonly vehicleClasses: readonly string[];
  /** Closed capability vocabulary; it can never name pedestrians or walking. */
  readonly capabilities: readonly ChallengeCapability[];
  /** Supported 092 keys a LEARNING objective requires; empty for every other objective. */
  readonly learningKeys: readonly string[];
  /** Completed 116 campaign missions required before the template is eligible. */
  readonly minCampaignMissions: number;
}

export interface ChallengeZoneRequirement {
  readonly kind: ChallengeZoneKind;
  readonly count: number;
}

export interface ChallengeZonePlan {
  readonly requirements: readonly ChallengeZoneRequirement[];
  readonly route: Readonly<{ required: boolean; checkpoints: number }>;
}

export interface ChallengeDeadlinePolicy {
  /** Reference duration of the real route, in seconds. */
  readonly referenceSeconds: number;
  /** Feasibility margins applied to the reference duration. */
  readonly marginOptions: readonly number[];
}

export interface ChallengeRewardPolicy {
  /** Authored Academy XP for the first completion of the family in a day; 0 in Haos. */
  readonly academyXp: number;
  readonly chaos: 'LOCAL_RECORD_ONLY';
  /** The reward key includes the family and the daily date. */
  readonly familyRewardKey: true;
  /** Only the first family completion of the day can pay XP. */
  readonly firstFamilyPerDay: true;
  /** A replay of the same instance never pays XP again. */
  readonly replayXp: 0;
}

export interface ChallengeReplayRules {
  /** R restarts the attempt with a new instance identity. */
  readonly restartKey: 'R';
  readonly restart: 'NEW_INSTANCE';
  readonly afterResult: 'NEW_IDENTITY';
  readonly cityReset: 'ATTEMPT_FAILED_NO_XP_LOSS';
  readonly leaveSession: 'CANCELLED_NO_XP_LOSS';
  readonly reload: 'RESTORE_DEADLINE';
}

export interface ChallengeDialogueLine {
  readonly key: string;
  readonly trigger: ChallengeDialogueTrigger;
  readonly text: string;
  /** Real observation event the line narrates; `null` only for the offer. */
  readonly event: ChallengeObservationEvent | null;
}

export interface ChallengeFilming {
  /** The influencer templates film; the premise is replay-internal only. */
  readonly premise: boolean;
  readonly capture: 'INTERNAL_REPLAY' | 'NONE';
  readonly socialUpload: false;
}

export interface ChallengeTemplate {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly templateId: string;
  readonly version: string;
  readonly family: ChallengeFamily;
  readonly title: string;
  readonly label: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly sessions: readonly ChallengeSessionKind[];
  readonly controlRequirement: ChallengeControlRequirement;
  readonly prerequisites: ChallengePrerequisites;
  readonly zones: ChallengeZonePlan;
  readonly targets: readonly number[];
  readonly incidentBudgets: readonly number[];
  readonly deadline: ChallengeDeadlinePolicy;
  readonly rewardPolicy: ChallengeRewardPolicy;
  readonly replayRules: ChallengeReplayRules;
  readonly dialogue: readonly ChallengeDialogueLine[];
  readonly filming: ChallengeFilming;
  /** Versioned evaluator thresholds, defaulted from the evaluator definition. */
  readonly thresholds: Readonly<Record<string, number>>;
}

export interface ChallengeTemplateCatalog {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: string;
  readonly templates: readonly ChallengeTemplate[];
}

const prerequisitesFields = [
  'vehicleClasses',
  'capabilities',
  'learningKeys',
  'minCampaignMissions',
] as const;
const zoneRequirementFields = ['kind', 'count'] as const;
const routeFields = ['required', 'checkpoints'] as const;
const zonePlanFields = ['requirements', 'route'] as const;
const deadlineFields = ['referenceSeconds', 'marginOptions'] as const;
const rewardPolicyFields = [
  'academyXp',
  'chaos',
  'familyRewardKey',
  'firstFamilyPerDay',
  'replayXp',
] as const;
const replayRuleFields = [
  'restartKey',
  'restart',
  'afterResult',
  'cityReset',
  'leaveSession',
  'reload',
] as const;
const dialogueFields = ['key', 'trigger', 'text', 'event'] as const;
const filmingFields = ['premise', 'capture', 'socialUpload'] as const;
const templateFields = [
  'schemaVersion',
  'units',
  'templateId',
  'version',
  'family',
  'title',
  'label',
  'objectiveKind',
  'evaluatorId',
  'sessions',
  'controlRequirement',
  'prerequisites',
  'zones',
  'targets',
  'incidentBudgets',
  'deadline',
  'rewardPolicy',
  'replayRules',
  'dialogue',
  'filming',
  'thresholds',
] as const;
const catalogFields = ['schemaVersion', 'units', 'version', 'templates'] as const;

/* ---------------------------------------------------------------------------------------------
 * Small readers
 * ------------------------------------------------------------------------------------------- */

function requireBoolean(value: unknown, label: string): boolean {
  requireContract(typeof value === 'boolean', `Expected boolean ${label}`);
  return value;
}

function readCapability(value: unknown): ChallengeCapability {
  requireContract(typeof value === 'string', 'Expected a challenge capability name');
  requireContract(
    !(challengeForbiddenCapabilities as readonly string[]).includes(value),
    `Challenge scenes cannot ask for pedestrians or walking: ${value}`,
  );
  return choice(value, challengeCapabilities);
}

function readPrerequisites(value: unknown): ChallengePrerequisites {
  const data = plainFields(value, prerequisitesFields, 'challenge prerequisites');
  for (const key of prerequisitesFields) requireRequired(data, key, 'challenge prerequisites');
  const vehicleClasses = list(data.vehicleClasses, (entry) =>
    boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge vehicle class'),
  );
  requireContract(
    vehicleClasses.length <= 4 && new Set(vehicleClasses).size === vehicleClasses.length,
    'Challenge vehicle class capacity or duplicate',
  );
  for (const classId of vehicleClasses)
    requireContract(vehicleClassIds.has(classId), `Unknown vehicle class prerequisite: ${classId}`);
  const capabilities = list(data.capabilities, readCapability);
  requireContract(
    capabilities.length <= challengeCapabilities.length &&
      new Set(capabilities).size === capabilities.length,
    'Challenge capability capacity or duplicate',
  );
  const learningKeys = list(data.learningKeys, (entry) =>
    boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge learning key'),
  );
  requireContract(
    learningKeys.length <= 2 && new Set(learningKeys).size === learningKeys.length,
    'Challenge learning key capacity or duplicate',
  );
  for (const key of learningKeys)
    requireContract(implementedLearningKeys.has(key), `Unsupported learning key: ${key}`);
  const minCampaignMissions = tick(data.minCampaignMissions);
  requireContract(
    minCampaignMissions <= campaignMissionCount,
    'Challenge campaign requirement exceeds the campaign capacity',
  );
  return Object.freeze({
    vehicleClasses: Object.freeze([...vehicleClasses]),
    capabilities,
    learningKeys: Object.freeze([...learningKeys]),
    minCampaignMissions,
  });
}

function readZoneRequirement(value: unknown): ChallengeZoneRequirement {
  const data = plainFields(value, zoneRequirementFields, 'challenge zone requirement');
  for (const key of zoneRequirementFields) requireRequired(data, key, 'challenge zone requirement');
  const count = number(data.count, 1, CHALLENGE_LIMITS.zonesPerTemplate);
  requireContract(Number.isSafeInteger(count), 'Challenge zone count must be an integer');
  return Object.freeze({ kind: choice(data.kind, challengeZoneKinds), count });
}

function readZonePlan(value: unknown): ChallengeZonePlan {
  const data = plainFields(value, zonePlanFields, 'challenge zone plan');
  for (const key of zonePlanFields) requireRequired(data, key, 'challenge zone plan');
  const requirements = list(data.requirements, readZoneRequirement);
  requireContract(
    requirements.length <= CHALLENGE_LIMITS.zoneRequirements,
    'Challenge zone requirement capacity violated',
  );
  requireContract(
    new Set(requirements.map((entry) => entry.kind)).size === requirements.length,
    'Duplicate challenge zone kind',
  );
  const total = requirements.reduce((count, entry) => count + entry.count, 0);
  requireContract(
    total <= CHALLENGE_LIMITS.zonesPerTemplate,
    'Challenge zone plan exceeds the zone capacity',
  );
  const route = plainFields(data.route, routeFields, 'challenge route plan');
  for (const key of routeFields) requireRequired(route, key, 'challenge route plan');
  const checkpoints = tick(route.checkpoints);
  requireContract(
    checkpoints <= CHALLENGE_LIMITS.zonesPerTemplate,
    'Challenge route checkpoint capacity violated',
  );
  return Object.freeze({
    requirements,
    route: Object.freeze({
      required: requireBoolean(route.required, 'route requirement'),
      checkpoints,
    }),
  });
}

function readDeadlinePolicy(value: unknown): ChallengeDeadlinePolicy {
  const data = plainFields(value, deadlineFields, 'challenge deadline policy');
  for (const key of deadlineFields) requireRequired(data, key, 'challenge deadline policy');
  const referenceSeconds = number(data.referenceSeconds, 60, 240);
  const marginOptions = list(data.marginOptions, (entry) => number(entry, 0.1, 0.6));
  requireContract(
    marginOptions.length > 0 && marginOptions.length <= CHALLENGE_LIMITS.margins,
    'Challenge margin capacity violated',
  );
  for (let index = 1; index < marginOptions.length; index += 1)
    requireContract(
      marginOptions[index]! > marginOptions[index - 1]!,
      'Challenge deadline margins must be ascending',
    );
  return Object.freeze({
    referenceSeconds,
    marginOptions: Object.freeze([...marginOptions]),
  });
}

function readRewardPolicy(value: unknown): ChallengeRewardPolicy {
  const data = plainFields(value, rewardPolicyFields, 'challenge reward policy');
  for (const key of rewardPolicyFields) requireRequired(data, key, 'challenge reward policy');
  const academyXp = number(data.academyXp, 0, 500);
  requireContract(Number.isSafeInteger(academyXp), 'Challenge XP must be a whole number');
  requireContract(data.chaos === 'LOCAL_RECORD_ONLY', 'Chaos rewards are local records only');
  requireContract(data.familyRewardKey === true, 'The reward key must include the family');
  requireContract(data.firstFamilyPerDay === true, 'Only the first family of the day can pay XP');
  requireContract(data.replayXp === 0, 'A replay can never pay XP again');
  return Object.freeze({
    academyXp,
    chaos: 'LOCAL_RECORD_ONLY' as const,
    familyRewardKey: true as const,
    firstFamilyPerDay: true as const,
    replayXp: 0 as const,
  });
}

function readReplayRules(value: unknown): ChallengeReplayRules {
  const data = plainFields(value, replayRuleFields, 'challenge replay rules');
  for (const key of replayRuleFields) requireRequired(data, key, 'challenge replay rules');
  requireContract(data.restartKey === 'R', 'The restart key is R');
  requireContract(data.restart === 'NEW_INSTANCE', 'R starts a new instance');
  requireContract(data.afterResult === 'NEW_IDENTITY', 'A replay starts a new identity');
  requireContract(
    data.cityReset === 'ATTEMPT_FAILED_NO_XP_LOSS',
    'A city reset fails the attempt without XP loss',
  );
  requireContract(
    data.leaveSession === 'CANCELLED_NO_XP_LOSS',
    'Leaving the session cancels without XP loss',
  );
  requireContract(data.reload === 'RESTORE_DEADLINE', 'A reload restores the instance deadline');
  return Object.freeze({
    restartKey: 'R' as const,
    restart: 'NEW_INSTANCE' as const,
    afterResult: 'NEW_IDENTITY' as const,
    cityReset: 'ATTEMPT_FAILED_NO_XP_LOSS' as const,
    leaveSession: 'CANCELLED_NO_XP_LOSS' as const,
    reload: 'RESTORE_DEADLINE' as const,
  });
}

function readDialogueLine(value: unknown): ChallengeDialogueLine {
  const data = plainFields(value, dialogueFields, 'challenge dialogue line');
  for (const key of dialogueFields) requireRequired(data, key, 'challenge dialogue line');
  const key = boundedId(data.key, CHALLENGE_LIMITS.idCodeUnits, 'challenge dialogue key');
  const trigger = choice(data.trigger, challengeDialogueTriggers);
  const lineText = boundedId(data.text, CHALLENGE_LIMITS.dialogueCodeUnits, 'challenge dialogue');
  const lower = lineText.toLowerCase();
  for (const term of forbiddenDialogueTerms)
    requireContract(
      !lower.includes(term),
      `Challenge dialogue cannot promise an external publication: ${term}`,
    );
  const event = data.event === null ? null : choice(data.event, challengeObservationEvents);
  requireContract(
    trigger === 'OFFER' ? event === null : event !== null,
    'Only the offer line has no observation event',
  );
  return Object.freeze({ key, trigger, text: lineText, event });
}

function readFilming(value: unknown): ChallengeFilming {
  const data = plainFields(value, filmingFields, 'challenge filming');
  for (const key of filmingFields) requireRequired(data, key, 'challenge filming');
  const premise = requireBoolean(data.premise, 'filming premise');
  const capture = choice(data.capture, ['INTERNAL_REPLAY', 'NONE'] as const);
  requireContract(data.socialUpload === false, 'A challenge never uploads to a social network');
  requireContract(
    premise ? capture === 'INTERNAL_REPLAY' : capture === 'NONE',
    'The filming premise is an internal replay, never an external capture',
  );
  return Object.freeze({ premise, capture, socialUpload: false as const });
}

function readThresholds(
  value: unknown,
  definition: ChallengeEvaluatorDefinition,
): Readonly<Record<string, number>> {
  const data = plainFields(
    value,
    definition.thresholds.map((entry) => entry.key),
    'challenge thresholds',
  );
  const thresholds: Record<string, number> = {};
  for (const spec of definition.thresholds) {
    const raw = data[spec.key];
    const resolved = raw === undefined ? spec.defaultValue : number(raw);
    requireContract(
      resolved >= spec.minimum && resolved <= spec.maximum,
      `Challenge threshold ${spec.key} is outside the evaluator range`,
    );
    if (spec.integer)
      requireContract(Number.isSafeInteger(resolved), `Challenge threshold ${spec.key} is whole`);
    thresholds[spec.key] = resolved;
  }
  return Object.freeze(thresholds);
}

/* ---------------------------------------------------------------------------------------------
 * Template validation
 * ------------------------------------------------------------------------------------------- */

function templateSignature(template: ChallengeTemplate): string {
  return [
    template.family,
    template.objectiveKind,
    template.evaluatorId,
    [...template.sessions].join('+'),
    template.controlRequirement,
    template.zones.requirements.map((entry) => `${entry.kind}x${entry.count}`).join('+'),
    template.targets.join('+'),
    template.incidentBudgets.join('+'),
    template.deadline.referenceSeconds.toFixed(3),
    template.prerequisites.learningKeys.join('+'),
    Object.entries(template.thresholds)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, value]) => `${key}=${value}`)
      .join('+'),
  ].join('|');
}

function validateTemplate(template: ChallengeTemplate): ChallengeTemplate {
  const evaluator = challengeEvaluatorDefinition(template.evaluatorId);
  requireContract(
    evaluator.objectiveKind === template.objectiveKind,
    `Evaluator ${evaluator.evaluatorId} solves ${evaluator.objectiveKind}, not ${template.objectiveKind}`,
  );
  for (const session of template.sessions)
    requireContract(
      (evaluator.sessions as readonly string[]).includes(session),
      `Evaluator ${evaluator.evaluatorId} is not offered in ${session}`,
    );
  const controlSatisfied =
    template.controlRequirement === 'ANY'
      ? evaluator.controls.length === challengeControlSources.length
      : (evaluator.controls as readonly string[]).includes(template.controlRequirement);
  requireContract(
    controlSatisfied,
    `Evaluator ${evaluator.evaluatorId} cannot run a ${template.controlRequirement} objective`,
  );
  const zoneCount = template.zones.requirements.reduce((total, entry) => total + entry.count, 0);
  requireContract(
    zoneCount >= evaluator.zoneIds.minimum && zoneCount <= evaluator.zoneIds.maximum,
    `Evaluator ${evaluator.evaluatorId} needs ${evaluator.zoneIds.minimum}..${evaluator.zoneIds.maximum} zones, not ${zoneCount}`,
  );
  for (const requirement of template.zones.requirements)
    requireContract(
      (evaluator.zoneKinds as readonly string[]).includes(requirement.kind),
      `Evaluator ${evaluator.evaluatorId} does not accept a ${requirement.kind} zone`,
    );

  const anyOf = template.thresholds['anyOf'] ?? 0;
  const orderedZones = zoneCount > 1 && anyOf === 0;
  const routeRequired = evaluator.requiresRoute || orderedZones;
  const expectedCheckpoints = routeRequired
    ? Math.max(zoneCount, Math.max(...template.targets))
    : 0;
  requireContract(
    template.zones.route.required === routeRequired &&
      template.zones.route.checkpoints === expectedCheckpoints,
    `Challenge route plan must declare ${routeRequired ? `${expectedCheckpoints} checkpoints` : 'no route'}`,
  );

  const maxTarget = Math.max(...template.targets);
  const maxIncidentBudget = Math.max(...template.incidentBudgets);
  requireContract(maxIncidentBudget <= 20, 'Challenge incident budget is too large');
  if (template.objectiveKind === 'CHECKPOINTS' || template.objectiveKind === 'ZONE_ORDER')
    requireContract(
      maxTarget <= zoneCount,
      'Challenge target needs at least that many concrete zones',
    );
  if (template.objectiveKind === 'ZONE_ORDER' && anyOf === 1)
    requireContract(
      template.targets.length === 1 && maxTarget === 1,
      'An any-of zone target is one',
    );
  if (template.objectiveKind === 'ZONE_ORDER' && anyOf === 0)
    requireContract(zoneCount >= 2, 'An ordered zone objective needs at least two zones');
  if (
    template.objectiveKind === 'TIMED_DROPOFF' ||
    template.objectiveKind === 'PARKING' ||
    template.objectiveKind === 'DRIFT' ||
    template.objectiveKind === 'COMFORT' ||
    template.objectiveKind === 'LEARNING'
  )
    requireContract(
      template.targets.length === 1 && maxTarget === 1,
      'A one-shot objective declares exactly one target',
    );

  const minMargin = Math.min(...template.deadline.marginOptions);
  const maxMargin = Math.max(...template.deadline.marginOptions);
  const longestDeadline = template.deadline.referenceSeconds * (1 + maxMargin);
  requireContract(
    longestDeadline <= 240,
    'The written deadline must stay inside the 1-4 minute challenge window',
  );
  if (template.objectiveKind === 'DRIFT') {
    const minimumDriftSeconds = template.thresholds['minSeconds'] ?? 0;
    const shortestDeadline = template.deadline.referenceSeconds * (1 + minMargin);
    requireContract(
      minimumDriftSeconds <= shortestDeadline,
      'The drift threshold cannot exceed the shortest feasible deadline',
    );
  }

  const learning = template.controlRequirement === 'LEARNING';
  requireContract(
    learning === (template.prerequisites.learningKeys.length === 1),
    'Exactly a LEARNING objective declares one supported learning key',
  );
  if (learning) {
    requireContract(
      template.sessions.length === 1 && template.sessions[0] === 'ACADEMY',
      'Publishing a LEARNING version only happens in the Academy',
    );
    requireContract(
      template.rewardPolicy.academyXp > 0,
      'An Academy LEARNING challenge must declare its XP reward',
    );
    requireContract(
      (template.prerequisites.capabilities as readonly string[]).includes('LEARNING'),
      'A LEARNING challenge requires the LEARNING capability',
    );
  } else {
    requireContract(
      !template.prerequisites.learningKeys.length,
      'Only a LEARNING objective requires a learning key',
    );
  }
  if (template.controlRequirement === 'MANUAL')
    requireContract(
      (template.prerequisites.capabilities as readonly string[]).includes('MANUAL_CONTROL'),
      'A MANUAL challenge requires the MANUAL_CONTROL capability',
    );
  requireContract(
    (template.prerequisites.capabilities as readonly string[]).includes('FREE_DRIVE'),
    'Every challenge requires free driving',
  );

  if (template.objectiveKind === 'DISTRUCTION') {
    requireContract(
      template.sessions.length === 1 && template.sessions[0] === 'CHAOS',
      'Destruction is a Haos objective only',
    );
    requireContract(
      (template.prerequisites.capabilities as readonly string[]).includes('DESTRUCTIBLE_DECOR'),
      'A destruction challenge requires the destructible decor capability',
    );
    requireContract(
      template.rewardPolicy.academyXp === 0,
      'A Haos-only destruction challenge grants no Academy XP',
    );
  }
  if (template.sessions.includes('CHAOS'))
    requireContract(
      template.rewardPolicy.chaos === 'LOCAL_RECORD_ONLY',
      'Haos challenges score local records only',
    );

  const triggers = new Set(template.dialogue.map((line) => line.trigger));
  requireContract(
    triggers.size === challengeDialogueTriggers.length &&
      template.dialogue.length === CHALLENGE_LIMITS.dialogueLines,
    'A challenge declares exactly the offer, progress, success and failure lines',
  );
  for (const line of template.dialogue) {
    if (line.trigger === 'OFFER') continue;
    requireContract(
      (evaluator.observations as readonly string[]).includes(line.event!),
      `Dialogue ${line.key} is not bound to a real ${evaluator.evaluatorId} observation`,
    );
  }
  for (const line of template.dialogue)
    if (line.trigger === 'FAILURE')
      requireContract(
        line.event === 'DEADLINE_EXPIRED' || line.event === 'INCIDENT',
        'The failure line narrates the deadline or a real incident',
      );
  requireContract(
    new Set(template.dialogue.map((line) => line.key)).size === template.dialogue.length,
    'Duplicate challenge dialogue key',
  );

  if (template.filming.premise)
    requireContract(
      template.family === 'DISCIPLINE' ||
        template.family === 'PRECISION' ||
        template.family === 'CONTROLLED_DESTRUCTION',
      'Only a filming family declares the internal replay premise',
    );
  return template;
}

export function parseChallengeTemplate(value: unknown): ChallengeTemplate {
  const data = plainFields(value, templateFields, 'challenge template');
  for (const key of templateFields) requireRequired(data, key, 'challenge template');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported challenge template schema version or units',
  );
  const templateId = boundedId(data.templateId, CHALLENGE_LIMITS.idCodeUnits, 'challenge template');
  const version = boundedId(data.version, 32, 'challenge template version');
  const family = choice(data.family, challengeFamilies);
  const title = boundedId(data.title, CHALLENGE_LIMITS.titleCodeUnits, 'challenge title');
  const label = boundedId(data.label, CHALLENGE_LIMITS.titleCodeUnits, 'challenge label');
  const objectiveKind = choice(data.objectiveKind, challengeObjectiveKinds);
  const evaluatorId = choice(data.evaluatorId, challengeEvaluatorIds);
  const sessions = list(data.sessions, (entry) => choice(entry, challengeSessionKinds));
  requireContract(
    sessions.length > 0 &&
      sessions.length <= challengeSessionKinds.length &&
      new Set(sessions).size === sessions.length,
    'Challenge session capacity or duplicate',
  );
  const controlRequirement = choice(data.controlRequirement, challengeControlRequirements);
  const prerequisites = readPrerequisites(data.prerequisites);
  const zones = readZonePlan(data.zones);
  const targets = list(data.targets, (entry) => {
    const target = number(entry, 1, 1_000);
    requireContract(Number.isSafeInteger(target), 'Challenge target must be a whole number');
    return target;
  });
  requireContract(
    targets.length > 0 && targets.length <= CHALLENGE_LIMITS.targets,
    'Challenge target capacity violated',
  );
  for (let index = 1; index < targets.length; index += 1)
    requireContract(targets[index]! > targets[index - 1]!, 'Challenge targets must be ascending');
  const incidentBudgets = list(data.incidentBudgets, (entry) => {
    const budget = number(entry, 0, 20);
    requireContract(Number.isSafeInteger(budget), 'Challenge incident budget must be whole');
    return budget;
  });
  requireContract(
    incidentBudgets.length > 0 && incidentBudgets.length <= CHALLENGE_LIMITS.incidentBudgets,
    'Challenge incident budget capacity violated',
  );
  requireContract(
    new Set(incidentBudgets).size === incidentBudgets.length,
    'Duplicate challenge incident budget',
  );
  const deadline = readDeadlinePolicy(data.deadline);
  const rewardPolicy = readRewardPolicy(data.rewardPolicy);
  const replayRules = readReplayRules(data.replayRules);
  const dialogue = list(data.dialogue, readDialogueLine);
  requireContract(
    dialogue.length <= CHALLENGE_LIMITS.dialogueLines,
    'Challenge dialogue capacity violated',
  );
  const filming = readFilming(data.filming);
  const definition = challengeEvaluatorDefinition(evaluatorId);
  const thresholds = readThresholds(data.thresholds, definition);
  return validateTemplate(
    Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      templateId,
      version,
      family,
      title,
      label,
      objectiveKind,
      evaluatorId,
      sessions: Object.freeze([...sessions]),
      controlRequirement,
      prerequisites,
      zones,
      targets: Object.freeze([...targets]),
      incidentBudgets: Object.freeze([...incidentBudgets]),
      deadline,
      rewardPolicy,
      replayRules,
      dialogue,
      filming,
      thresholds,
    }),
  );
}

export function parseChallengeTemplateCatalog(value: unknown): ChallengeTemplateCatalog {
  const data = plainFields(value, catalogFields, 'challenge template catalog');
  for (const key of catalogFields) requireRequired(data, key, 'challenge template catalog');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported challenge catalog schema version or units',
  );
  const version = boundedId(
    data.version,
    CHALLENGE_LIMITS.idCodeUnits,
    'challenge catalog version',
  );
  const templates = list(data.templates, parseChallengeTemplate);
  requireContract(
    templates.length >= CHALLENGE_LIMITS.minimumTemplates &&
      templates.length <= CHALLENGE_LIMITS.templates,
    `A challenge catalog declares ${CHALLENGE_LIMITS.minimumTemplates}..${CHALLENGE_LIMITS.templates} templates`,
  );
  requireContract(
    new Set(templates.map((entry) => entry.templateId)).size === templates.length,
    'Duplicate challenge template id',
  );
  requireContract(
    new Set(templates.map((entry) => entry.title)).size === templates.length,
    'Duplicate challenge template title',
  );
  const signatures = new Set(templates.map(templateSignature));
  requireContract(
    signatures.size === templates.length,
    'Two challenge templates describe the same objective',
  );
  const families = new Set(templates.map((entry) => entry.family));
  requireContract(
    families.size === challengeFamilies.length,
    'The challenge catalog must cover every authored family',
  );
  const canonical = templates
    .slice()
    .sort((left, right) => compareText(left.templateId, right.templateId));
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version,
    templates: Object.freeze(canonical),
  });
}

/* ---------------------------------------------------------------------------------------------
 * The delivered catalog: twelve templates from Docs/28
 * ------------------------------------------------------------------------------------------- */

function dialogue(
  key: string,
  trigger: ChallengeDialogueTrigger,
  lineText: string,
  event: ChallengeObservationEvent | null,
): ChallengeDialogueLine {
  return Object.freeze({ key, trigger, text: lineText, event });
}

function requirements(
  ...entries: readonly [ChallengeZoneKind, number][]
): readonly ChallengeZoneRequirement[] {
  return Object.freeze(entries.map(([kind, count]) => Object.freeze({ kind, count })));
}

function replayRules(): ChallengeReplayRules {
  return Object.freeze({
    restartKey: 'R' as const,
    restart: 'NEW_INSTANCE' as const,
    afterResult: 'NEW_IDENTITY' as const,
    cityReset: 'ATTEMPT_FAILED_NO_XP_LOSS' as const,
    leaveSession: 'CANCELLED_NO_XP_LOSS' as const,
    reload: 'RESTORE_DEADLINE' as const,
  });
}

function rewardPolicy(academyXp: number): ChallengeRewardPolicy {
  return Object.freeze({
    academyXp,
    chaos: 'LOCAL_RECORD_ONLY' as const,
    familyRewardKey: true as const,
    firstFamilyPerDay: true as const,
    replayXp: 0 as const,
  });
}

function filming(premise: boolean): ChallengeFilming {
  return Object.freeze({
    premise,
    capture: premise ? ('INTERNAL_REPLAY' as const) : ('NONE' as const),
    socialUpload: false as const,
  });
}

/**
 * The delivered V1 catalog: twelve distinct templates covering precision, discipline, exploration,
 * controlled destruction, efficiency and a supported LEARNING experiment. Thresholds and XP amounts
 * are calibration proposals, not certified playtest results.
 */
export function createChallengeTemplateCatalog(): ChallengeTemplateCatalog {
  return parseChallengeTemplateCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: CHALLENGE_TEMPLATE_CATALOG_VERSION,
    templates: [
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-maternity-run',
        version: '1',
        family: 'EFFICIENCY',
        title: 'Urgent la maternitate',
        label: 'Ajunge la spital în timpul acordat, cu buget de incidente',
        objectiveKind: 'TIMED_DROPOFF',
        evaluatorId: 'timed-dropoff',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'ANY',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['HOSPITAL', 1]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [1],
        incidentBudgets: [0, 1, 2],
        deadline: { referenceSeconds: 90, marginOptions: [0.2, 0.35] },
        rewardPolicy: rewardPolicy(90),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'maternity-offer',
            'OFFER',
            'Sunt însărcinată și trebuie să ajung acum la spital. Mă duci?',
            null,
          ),
          dialogue(
            'maternity-progress',
            'PROGRESS',
            'Spitalul e aproape. Respir ușurată.',
            'DROPOFF',
          ),
          dialogue(
            'maternity-success',
            'SUCCESS',
            'Ai ajuns la spital la timp. Mulțumesc!',
            'DROPOFF',
          ),
          dialogue(
            'maternity-failure',
            'FAILURE',
            'Timpul a expirat. Reluăm, fără dramatism.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: {},
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-toilet-sos',
        version: '1',
        family: 'EXPLORATION',
        title: 'SOS toaletă',
        label: 'Alege și atinge cea mai apropiată toaletă disponibilă',
        objectiveKind: 'ZONE_ORDER',
        evaluatorId: 'zone-order',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['TOILET', 3]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 75, marginOptions: [0.25, 0.5] },
        rewardPolicy: rewardPolicy(60),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'toilet-offer',
            'OFFER',
            'Unde e cea mai apropiată toaletă? Repede, te rog!',
            null,
          ),
          dialogue(
            'toilet-progress',
            'PROGRESS',
            'Am găsit o toaletă deschisă. Intru.',
            'ZONE_ENTERED',
          ),
          dialogue(
            'toilet-success',
            'SUCCESS',
            'Misiune îndeplinită. Aproape că nu se mai putea.',
            'ZONE_ENTERED',
          ),
          dialogue(
            'toilet-failure',
            'FAILURE',
            'Prea târziu. Data viitoare alegem mai aproape.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { anyOf: 1 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-influencer-no-spill',
        version: '1',
        family: 'DISCIPLINE',
        title: 'Influencer: fără să vărs băutura',
        label: 'Cursă cu accelerații și jerk sub pragurile de confort',
        objectiveKind: 'COMFORT',
        evaluatorId: 'comfort-budget',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: { requirements: requirements(), route: { required: false, checkpoints: 0 } },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 120, marginOptions: [0.2, 0.35] },
        rewardPolicy: rewardPolicy(80),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'nospill-offer',
            'OFFER',
            'Filmez un clip cu băutura plină în mașină. Fără scurgeri, da?',
            null,
          ),
          dialogue(
            'nospill-progress',
            'PROGRESS',
            'Paharul e încă plin. Continui filmarea.',
            'COMFORT_SAMPLE',
          ),
          dialogue(
            'nospill-success',
            'SUCCESS',
            'Cadrul e perfect și băutura e intactă. Clipul rămâne intern.',
            'DROPOFF',
          ),
          dialogue(
            'nospill-failure',
            'FAILURE',
            'S-a vărsat. Taiem cadrul și reluăm.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(true),
        thresholds: {},
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-influencer-single-frame',
        version: '1',
        family: 'PRECISION',
        title: 'Influencer: un singur cadru',
        label: 'Atinge checkpointurile în ordine, fără opriri peste toleranță',
        objectiveKind: 'CHECKPOINTS',
        evaluatorId: 'checkpoint-sequence',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['CHECKPOINT', 3]),
          route: { required: true, checkpoints: 3 },
        },
        targets: [2, 3],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 150, marginOptions: [0.25, 0.4] },
        rewardPolicy: rewardPolicy(90),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'singleframe-offer',
            'OFFER',
            'Vreau un singur cadru fluid, cu trei puncte atinse în ordine.',
            null,
          ),
          dialogue(
            'singleframe-progress',
            'PROGRESS',
            'Checkpoint atins. Următorul, fără oprire.',
            'CHECKPOINT_REACHED',
          ),
          dialogue(
            'singleframe-success',
            'SUCCESS',
            'Cadrul e continuu. Exact ce voiam.',
            'CHECKPOINT_REACHED',
          ),
          dialogue(
            'singleframe-failure',
            'FAILURE',
            'Cadrul s-a rupt. Reluăm din prima.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(true),
        thresholds: { stopToleranceS: 2 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-influencer-parking-drift',
        version: '1',
        family: 'PRECISION',
        title: 'Influencer: drift de parcare',
        label: 'Acumulează timp de derapaj valid în zona marcată',
        objectiveKind: 'DRIFT',
        evaluatorId: 'drift-accumulation',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: ['sedan'],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['DRIFT_PAD', 1]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [1],
        incidentBudgets: [1, 2],
        deadline: { referenceSeconds: 120, marginOptions: [0.25, 0.4] },
        rewardPolicy: rewardPolicy(90),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'parkingdrift-offer',
            'OFFER',
            'Filmez un drift scurt pe locul de joacă. Arată-mi ce poți.',
            null,
          ),
          dialogue(
            'parkingdrift-progress',
            'PROGRESS',
            'Derapajul se acumulează. Ține unghiul!',
            'DRIFT_SAMPLE',
          ),
          dialogue(
            'parkingdrift-success',
            'SUCCESS',
            'Trei secunde de drift valid. Cadrul e gata.',
            'DRIFT_SAMPLE',
          ),
          dialogue(
            'parkingdrift-failure',
            'FAILURE',
            'Nu s-a acumulat drift valid. Mai încercăm.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(true),
        thresholds: { minSpeedMps: 6, minSlipAngleRad: 0.25, minSeconds: 3 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-influencer-demolition',
        version: '1',
        family: 'CONTROLLED_DESTRUCTION',
        title: 'Influencer: demolare în 90 de secunde',
        label: 'Doboară cinci obiecte eligibile distincte, numai în Haos',
        objectiveKind: 'DISTRUCTION',
        evaluatorId: 'distinct-destruction',
        sessions: ['CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: ['sedan'],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL', 'DESTRUCTIBLE_DECOR'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['DEMOLITION_ALLEY', 1]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [5],
        incidentBudgets: [2, 3],
        deadline: { referenceSeconds: 90, marginOptions: [0.15, 0.25] },
        rewardPolicy: rewardPolicy(0),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'demolition-offer',
            'OFFER',
            'Un clip absurd: dărâmă cinci obstacole în nouăzeci de secunde.',
            null,
          ),
          dialogue(
            'demolition-progress',
            'PROGRESS',
            'Obstacol distrus. Patru au rămas.',
            'DESTRUCTIBLE_BROKEN',
          ),
          dialogue(
            'demolition-success',
            'SUCCESS',
            'Cinci lucruri distincte dărâmate. Haos curat.',
            'DESTRUCTIBLE_BROKEN',
          ),
          dialogue(
            'demolition-failure',
            'FAILURE',
            'Timpul s-a terminat. Reluăm în Haos.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(true),
        thresholds: {},
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-cake-delivery',
        version: '1',
        family: 'DISCIPLINE',
        title: 'Tortul care nu trebuie să zboare',
        label: 'Ajungi înaintea deadline-ului cu bugetul de confort afișat',
        objectiveKind: 'COMFORT',
        evaluatorId: 'comfort-budget',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: { requirements: requirements(), route: { required: false, checkpoints: 0 } },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 100, marginOptions: [0.2, 0.3] },
        rewardPolicy: rewardPolicy(75),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'cake-offer',
            'OFFER',
            'Am un tort pentru petrecere. Ajunge întreg, te rog.',
            null,
          ),
          dialogue(
            'cake-progress',
            'PROGRESS',
            'Tortul e încă pe locul lui. Mergi lin.',
            'COMFORT_SAMPLE',
          ),
          dialogue(
            'cake-success',
            'SUCCESS',
            'Tortul a ajuns întreg. Petrecerea poate începe.',
            'DROPOFF',
          ),
          dialogue(
            'cake-failure',
            'FAILURE',
            'Tortul a alunecat. Îl refacem și reluăm.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { maxAccelerationMps2: 1.5, maxJerkMps3: 1.5 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-forgot-something',
        version: '1',
        family: 'EXPLORATION',
        title: 'Am uitat ceva!',
        label: 'Vizitează două puncte în ordinea cerută',
        objectiveKind: 'ZONE_ORDER',
        evaluatorId: 'zone-order',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['LANDMARK', 2]),
          route: { required: true, checkpoints: 2 },
        },
        targets: [2],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 110, marginOptions: [0.25, 0.4] },
        rewardPolicy: rewardPolicy(70),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'forgot-offer',
            'OFFER',
            'Am uitat ceva acasă! Du-mă întâi acolo, apoi la destinație.',
            null,
          ),
          dialogue(
            'forgot-progress',
            'PROGRESS',
            'Primul punct bifat. Acum la al doilea.',
            'ZONE_ENTERED',
          ),
          dialogue(
            'forgot-success',
            'SUCCESS',
            'Am recuperat tot. Mulțumesc pentru răbdare.',
            'ZONE_ENTERED',
          ),
          dialogue(
            'forgot-failure',
            'FAILURE',
            'Ordinea nu s-a respectat. Reluăm traseul.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { anyOf: 0 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-last-minute-airport',
        version: '1',
        family: 'EFFICIENCY',
        title: 'Ultimul minut la aeroport',
        label: 'Cursă rapidă la terminalul fictiv al hărții',
        objectiveKind: 'TIMED_DROPOFF',
        evaluatorId: 'timed-dropoff',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'ANY',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['TERMINAL', 1]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 120, marginOptions: [0.15, 0.3] },
        rewardPolicy: rewardPolicy(100),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'airport-offer',
            'OFFER',
            'Zborul meu pleacă imediat. Terminalul, cât poți de repede.',
            null,
          ),
          dialogue('airport-progress', 'PROGRESS', 'Terminalul e aproape. Ține ritmul.', 'DROPOFF'),
          dialogue(
            'airport-success',
            'SUCCESS',
            'Am prins zborul. Cursa a fost rapidă.',
            'DROPOFF',
          ),
          dialogue(
            'airport-failure',
            'FAILURE',
            'Am pierdut zborul. Reluăm cu altă rută.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: {},
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-city-tour-backwards',
        version: '1',
        family: 'EXPLORATION',
        title: 'Turul orașului pe dos',
        label: 'Atinge trei repere într-o ordine ciudată',
        objectiveKind: 'CHECKPOINTS',
        evaluatorId: 'checkpoint-sequence',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 1,
        },
        zones: {
          requirements: requirements(['CHECKPOINT', 3]),
          route: { required: true, checkpoints: 3 },
        },
        targets: [3],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 150, marginOptions: [0.25, 0.4] },
        rewardPolicy: rewardPolicy(70),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'tour-offer',
            'OFFER',
            'Vreau turul orașului pe dos: trei repere, în ordinea mea ciudată.',
            null,
          ),
          dialogue(
            'tour-progress',
            'PROGRESS',
            'Un reper atins. Urmează cel cerut.',
            'CHECKPOINT_REACHED',
          ),
          dialogue(
            'tour-success',
            'SUCCESS',
            'Turul pe dos e complet. Priveliștea a meritat.',
            'CHECKPOINT_REACHED',
          ),
          dialogue(
            'tour-failure',
            'FAILURE',
            'Turul s-a încheiat. Reluăm ordinea.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { stopToleranceS: 4 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-valet-with-style',
        version: '1',
        family: 'PRECISION',
        title: 'Valet cu stil',
        label: 'Oprire în zonă la orientarea și viteza cerute',
        objectiveKind: 'PARKING',
        evaluatorId: 'parking-precision',
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: [],
          minCampaignMissions: 0,
        },
        zones: {
          requirements: requirements(['PARKING', 1]),
          route: { required: false, checkpoints: 0 },
        },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 90, marginOptions: [0.25, 0.4] },
        rewardPolicy: rewardPolicy(80),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'valet-offer',
            'OFFER',
            'Parchează precis. Un valet cu stil nu lasă mașina strâmbă.',
            null,
          ),
          dialogue(
            'valet-progress',
            'PROGRESS',
            'Aproape de loc. Încet, cu orientarea cerută.',
            'ZONE_ENTERED',
          ),
          dialogue(
            'valet-success',
            'SUCCESS',
            'Parcare perfectă: viteză mică, orientare exactă.',
            'FULL_STOP',
          ),
          dialogue(
            'valet-failure',
            'FAILURE',
            'Parcarea nu e în toleranță. Mai încercăm.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { maxSpeedMps: 0.3, maxHeadingErrorRad: 0.12, minDwellS: 1.5 },
      },
      {
        schemaVersion: 1,
        units: 'SI',
        templateId: 'challenge-city-copies-me',
        version: '1',
        family: 'EXPERIMENT',
        title: 'Orașul mă copiază',
        label: 'Publică o versiune LEARNING și observă efectul în flotă',
        objectiveKind: 'LEARNING',
        evaluatorId: 'learning-observation',
        sessions: ['ACADEMY'],
        controlRequirement: 'LEARNING',
        prerequisites: {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'LEARNING'],
          learningKeys: ['speed_delta_urban'],
          minCampaignMissions: 1,
        },
        zones: { requirements: requirements(), route: { required: false, checkpoints: 0 } },
        targets: [1],
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 150, marginOptions: [0.25] },
        rewardPolicy: rewardPolicy(120),
        replayRules: replayRules(),
        dialogue: [
          dialogue(
            'copies-offer',
            'OFFER',
            'Vreau să văd cum orașul preia stilul tău. Publică o versiune și arată-mi efectul.',
            null,
          ),
          dialogue(
            'copies-progress',
            'PROGRESS',
            'Versiunea e publicată. Așteptăm efectul în flotă.',
            'PROFILE_ACTIVATE',
          ),
          dialogue(
            'copies-success',
            'SUCCESS',
            'Orașul chiar te copiază: efectul a fost observat.',
            'PROFILE_ACTIVATE',
          ),
          dialogue(
            'copies-failure',
            'FAILURE',
            'Efectul nu a apărut în timpul acordat. Reluăm experimentul.',
            'DEADLINE_EXPIRED',
          ),
        ],
        filming: filming(false),
        thresholds: { maxObservationDelayTicks: 3_600 },
      },
    ],
  });
}

/* ---------------------------------------------------------------------------------------------
 * Capabilities and prerequisite exclusion
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeZoneCapability {
  readonly zoneId: string;
  readonly kind: ChallengeZoneKind;
}

export interface ChallengeCapabilities {
  readonly version: typeof CHALLENGE_CAPABILITY_VERSION;
  readonly sessionKind: ChallengeSessionKind;
  readonly controlModes: readonly ChallengeControlSource[];
  readonly vehicleClasses: readonly string[];
  readonly zones: readonly ChallengeZoneCapability[];
  readonly capabilities: readonly ChallengeCapability[];
  readonly learningKeys: readonly string[];
  readonly campaignCompleted: number;
}

const capabilityFields = [
  'version',
  'sessionKind',
  'controlModes',
  'vehicleClasses',
  'zones',
  'capabilities',
  'learningKeys',
  'campaignCompleted',
] as const;
const zoneCapabilityFields = ['zoneId', 'kind'] as const;

function readZoneCapability(value: unknown): ChallengeZoneCapability {
  const data = plainFields(value, zoneCapabilityFields, 'challenge zone capability');
  for (const key of zoneCapabilityFields) requireRequired(data, key, 'challenge zone capability');
  return Object.freeze({
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    kind: choice(data.kind, challengeZoneKinds),
  });
}

export function createChallengeCapabilities(value: unknown): ChallengeCapabilities {
  const data = plainFields(value, capabilityFields, 'challenge capabilities');
  for (const key of capabilityFields)
    if (key !== 'version') requireRequired(data, key, 'challenge capabilities');
  if (data.version !== undefined)
    requireContract(
      data.version === CHALLENGE_CAPABILITY_VERSION,
      'Unsupported challenge capability snapshot version',
    );
  const controlModes = list(data.controlModes, (entry) => choice(entry, challengeControlSources));
  requireContract(
    new Set(controlModes).size === controlModes.length,
    'Duplicate challenge control mode',
  );
  const vehicleClasses = list(data.vehicleClasses, (entry) =>
    boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge vehicle class'),
  );
  requireContract(
    new Set(vehicleClasses).size === vehicleClasses.length,
    'Duplicate challenge vehicle class',
  );
  for (const classId of vehicleClasses)
    requireContract(vehicleClassIds.has(classId), `Unknown vehicle class capability: ${classId}`);
  const zones = list(data.zones, readZoneCapability);
  requireContract(
    new Set(zones.map((entry) => entry.zoneId)).size === zones.length,
    'Duplicate challenge zone',
  );
  const capabilities = list(data.capabilities, readCapability);
  requireContract(
    new Set(capabilities).size === capabilities.length,
    'Duplicate challenge capability',
  );
  const learningKeys = list(data.learningKeys, (entry) =>
    boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge learning key'),
  );
  requireContract(new Set(learningKeys).size === learningKeys.length, 'Duplicate learning key');
  for (const key of learningKeys)
    requireContract(implementedLearningKeys.has(key), `Unsupported learning key: ${key}`);
  const campaignCompleted = tick(data.campaignCompleted);
  requireContract(
    campaignCompleted <= campaignMissionCount,
    'Challenge campaign progress exceeds the campaign capacity',
  );
  return Object.freeze({
    version: CHALLENGE_CAPABILITY_VERSION,
    sessionKind: choice(data.sessionKind, challengeSessionKinds),
    controlModes: Object.freeze([...controlModes]),
    vehicleClasses: Object.freeze([...vehicleClasses]),
    zones: Object.freeze([...zones]),
    capabilities: Object.freeze([...capabilities]),
    learningKeys: Object.freeze([...learningKeys]),
    campaignCompleted,
  });
}

/**
 * The explicit exclusion rule. Every missing prerequisite is named; a template with a non-empty list
 * is not offered, so an impossible objective is never generated and then failed at runtime.
 */
export function challengePrerequisitesMissing(
  templateInput: unknown,
  capabilitiesInput: unknown,
): readonly string[] {
  const template = parseChallengeTemplate(templateInput);
  const capabilities = createChallengeCapabilities(capabilitiesInput);
  const missing: string[] = [];
  if (!(template.sessions as readonly string[]).includes(capabilities.sessionKind))
    missing.push(`SESSION:${capabilities.sessionKind}`);
  const requirement = template.controlRequirement;
  if (
    (requirement === 'MANUAL' && !capabilities.controlModes.includes('MANUAL')) ||
    (requirement === 'LEARNING' && !capabilities.controlModes.includes('LEARNING')) ||
    (requirement === 'ANY' && capabilities.controlModes.length === 0)
  )
    missing.push(`CONTROL:${requirement}`);
  for (const classId of template.prerequisites.vehicleClasses)
    if (!capabilities.vehicleClasses.includes(classId)) missing.push(`VEHICLE_CLASS:${classId}`);
  for (const capability of template.prerequisites.capabilities)
    if (!(capabilities.capabilities as readonly string[]).includes(capability))
      missing.push(`CAPABILITY:${capability}`);
  for (const learningKey of template.prerequisites.learningKeys)
    if (!capabilities.learningKeys.includes(learningKey))
      missing.push(`LEARNING_KEY:${learningKey}`);
  if (capabilities.campaignCompleted < template.prerequisites.minCampaignMissions)
    missing.push(`CAMPAIGN:${template.prerequisites.minCampaignMissions}`);
  for (const zone of template.zones.requirements) {
    const available = capabilities.zones.filter((entry) => entry.kind === zone.kind).length;
    if (available < zone.count) missing.push(`ZONE:${zone.kind}`);
  }
  return Object.freeze(missing);
}

export interface ChallengeEligibilityRow {
  readonly templateId: string;
  readonly family: ChallengeFamily;
  readonly eligible: boolean;
  readonly missing: readonly string[];
}

export interface ChallengeEligibility {
  readonly eligible: readonly string[];
  readonly excluded: readonly ChallengeEligibilityRow[];
}

/** Deterministic eligibility of the whole catalog for one capability snapshot. */
export function eligibleChallengeTemplates(
  catalogInput: unknown,
  capabilitiesInput: unknown,
): ChallengeEligibility {
  const catalog = parseChallengeTemplateCatalog(catalogInput);
  const capabilities = createChallengeCapabilities(capabilitiesInput);
  const eligible: string[] = [];
  const excluded: ChallengeEligibilityRow[] = [];
  for (const template of catalog.templates) {
    const missing = challengePrerequisitesMissing(template, capabilities);
    if (missing.length === 0) eligible.push(template.templateId);
    else
      excluded.push(
        Object.freeze({
          templateId: template.templateId,
          family: template.family,
          eligible: false,
          missing,
        }),
      );
  }
  return Object.freeze({ eligible: Object.freeze(eligible), excluded: Object.freeze(excluded) });
}

/* ---------------------------------------------------------------------------------------------
 * Objective snapshot and attempt plan
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeObjectiveSnapshot {
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly evaluatorVersion: string;
  readonly target: number;
  readonly thresholdVersion: string;
  readonly thresholds: Readonly<Record<string, number>>;
  /** Concrete zone ids in the order the objective visits them. */
  readonly zoneIds: readonly string[];
  /** Absolute authoritative tick by which the objective must be met. */
  readonly deadlineTick: number;
  readonly incidentBudget: number;
  readonly learningKey: string | null;
}

const objectiveFields = [
  'objectiveKind',
  'evaluatorId',
  'evaluatorVersion',
  'target',
  'thresholdVersion',
  'thresholds',
  'zoneIds',
  'deadlineTick',
  'incidentBudget',
  'learningKey',
] as const;

export function parseChallengeObjectiveSnapshot(value: unknown): ChallengeObjectiveSnapshot {
  const data = plainFields(value, objectiveFields, 'challenge objective');
  for (const key of objectiveFields) requireRequired(data, key, 'challenge objective');
  const evaluatorId = choice(data.evaluatorId, challengeEvaluatorIds);
  const definition = challengeEvaluatorDefinition(evaluatorId);
  const objectiveKind = choice(data.objectiveKind, challengeObjectiveKinds);
  requireContract(
    objectiveKind === definition.objectiveKind,
    `Objective ${objectiveKind} does not belong to evaluator ${evaluatorId}`,
  );
  requireContract(
    data.evaluatorVersion === definition.version,
    'Challenge objective evaluator version is stale',
  );
  const target = number(data.target, 1, 1_000);
  requireContract(Number.isSafeInteger(target), 'Challenge objective target must be whole');
  const thresholdVersion = boundedId(data.thresholdVersion, 64, 'challenge threshold version');
  const thresholds = plainFields(
    data.thresholds,
    definition.thresholds.map((entry) => entry.key),
    'challenge objective thresholds',
  );
  const normalized: Record<string, number> = {};
  for (const spec of definition.thresholds) {
    requireRequired(thresholds, spec.key, 'challenge objective thresholds');
    const resolved = number(thresholds[spec.key], spec.minimum, spec.maximum);
    if (spec.integer)
      requireContract(Number.isSafeInteger(resolved), `Challenge threshold ${spec.key} is whole`);
    normalized[spec.key] = resolved;
  }
  const zoneIds = list(data.zoneIds, (entry) =>
    boundedId(entry, CHALLENGE_LIMITS.idCodeUnits, 'challenge objective zone'),
  );
  requireContract(
    zoneIds.length >= definition.zoneIds.minimum && zoneIds.length <= definition.zoneIds.maximum,
    `Evaluator ${evaluatorId} needs ${definition.zoneIds.minimum}..${definition.zoneIds.maximum} zones`,
  );
  requireContract(new Set(zoneIds).size === zoneIds.length, 'Duplicate objective zone');
  const deadlineTick = tick(data.deadlineTick);
  const incidentBudget = tick(data.incidentBudget);
  requireContract(incidentBudget <= 20, 'Challenge objective incident budget is too large');
  const learningKey =
    data.learningKey === null
      ? null
      : boundedId(data.learningKey, CHALLENGE_LIMITS.idCodeUnits, 'challenge learning key');
  requireContract(
    (objectiveKind === 'LEARNING') === (learningKey !== null),
    'Only a LEARNING objective names its supported key',
  );
  if (learningKey !== null)
    requireContract(
      implementedLearningKeys.has(learningKey),
      `Unsupported learning key: ${learningKey}`,
    );
  return Object.freeze({
    objectiveKind,
    evaluatorId,
    evaluatorVersion: definition.version,
    target,
    thresholdVersion,
    thresholds: Object.freeze(normalized),
    zoneIds: Object.freeze([...zoneIds]),
    deadlineTick,
    incidentBudget,
    learningKey,
  });
}

export interface ChallengeDeadline {
  readonly referenceSeconds: number;
  readonly margin: number;
  readonly durationTicks: number;
  readonly deadlineTick: number;
}

export interface ChallengeAttemptPlan {
  readonly version: typeof CHALLENGE_SCHEMA_VERSION;
  readonly catalogVersion: string;
  readonly instanceId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly family: ChallengeFamily;
  readonly sessionKind: ChallengeSessionKind;
  readonly seed: number;
  readonly attempt: number;
  readonly objective: ChallengeObjectiveSnapshot;
  readonly deadline: ChallengeDeadline;
  readonly incidentBudget: number;
  readonly rewardPolicy: ChallengeRewardPolicy;
  readonly replayRules: ChallengeReplayRules;
}

/** Deadline derived from the authored reference duration and the selected margin. */
export function challengeDeadlineTicks(referenceSeconds: number, margin: number): number {
  requireContract(
    Number.isFinite(referenceSeconds) && referenceSeconds > 0,
    'Challenge reference duration must be positive',
  );
  requireContract(Number.isFinite(margin) && margin >= 0, 'Challenge margin cannot be negative');
  return Math.round(referenceSeconds * (1 + margin) * CHALLENGE_TICK_HZ);
}

const planFields = [
  'template',
  'catalogVersion',
  'capabilities',
  'sessionKind',
  'seed',
  'attempt',
  'startedTick',
] as const;

function pickOption<T>(seed: number, key: string, options: readonly T[]): T {
  const index = randomUint32(seed, key, 0) % options.length;
  return options[index]!;
}

/**
 * Pure attempt plan: template + real capabilities + explicit seed + explicit start tick. It throws
 * with the named missing prerequisites when the template would be excluded, so 232 cannot offer an
 * impossible challenge by accident.
 */
export function planChallengeAttempt(value: unknown): ChallengeAttemptPlan {
  const data = plainFields(value, planFields, 'challenge attempt plan');
  for (const key of planFields) requireRequired(data, key, 'challenge attempt plan');
  const template = parseChallengeTemplate(data.template);
  const catalogVersion = boundedId(
    data.catalogVersion,
    CHALLENGE_LIMITS.idCodeUnits,
    'challenge catalog version',
  );
  const capabilities = createChallengeCapabilities(data.capabilities);
  const sessionKind = choice(data.sessionKind, challengeSessionKinds);
  const seed = number(data.seed, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), 'Challenge seed must be a uint32');
  const attempt = number(data.attempt, 1, CHALLENGE_LIMITS.attemptsPerTemplate);
  requireContract(Number.isSafeInteger(attempt), 'Challenge attempt must be a whole number');
  const startedTick = tick(data.startedTick);
  requireContract(
    (template.sessions as readonly string[]).includes(sessionKind),
    `Challenge template ${template.templateId} is not offered in ${sessionKind}`,
  );
  const missing = challengePrerequisitesMissing(template, capabilities);
  requireContract(
    missing.length === 0,
    `Challenge template ${template.templateId} is excluded: ${missing.join(', ')}`,
  );

  const target = pickOption(seed, `${template.templateId}:target`, template.targets);
  const margin = pickOption(seed, `${template.templateId}:margin`, template.deadline.marginOptions);
  const incidentBudget = pickOption(
    seed,
    `${template.templateId}:incidents`,
    template.incidentBudgets,
  );
  const durationTicks = challengeDeadlineTicks(template.deadline.referenceSeconds, margin);
  const zoneIds: string[] = [];
  for (const requirement of template.zones.requirements) {
    const candidates = capabilities.zones
      .filter((entry) => entry.kind === requirement.kind)
      .map((entry) => entry.zoneId)
      .sort(compareText);
    requireContract(
      candidates.length >= requirement.count,
      `Challenge template ${template.templateId} is missing ${requirement.count} ${requirement.kind} zones`,
    );
    const start =
      randomUint32(seed, `${template.templateId}:zone:${requirement.kind}`, 0) % candidates.length;
    for (let index = 0; index < requirement.count; index += 1)
      zoneIds.push(candidates[(start + index) % candidates.length]!);
  }
  requireContract(new Set(zoneIds).size === zoneIds.length, 'Challenge plan repeated a zone');
  const learningKey =
    template.controlRequirement === 'LEARNING' ? template.prerequisites.learningKeys[0]! : null;
  const objective = parseChallengeObjectiveSnapshot({
    objectiveKind: template.objectiveKind,
    evaluatorId: template.evaluatorId,
    evaluatorVersion: challengeEvaluatorDefinition(template.evaluatorId).version,
    target,
    thresholdVersion: CHALLENGE_EVALUATOR_VERSION,
    thresholds: template.thresholds,
    zoneIds,
    deadlineTick: startedTick + durationTicks,
    incidentBudget,
    learningKey,
  });
  const instanceId = createStableId('challenge-instance', catalogVersion, [
    sessionKind,
    template.templateId,
    template.version,
    String(seed),
    String(attempt),
  ]);
  return Object.freeze({
    version: CHALLENGE_SCHEMA_VERSION,
    catalogVersion,
    instanceId,
    templateId: template.templateId,
    templateVersion: template.version,
    family: template.family,
    sessionKind,
    seed,
    attempt,
    objective,
    deadline: Object.freeze({
      referenceSeconds: template.deadline.referenceSeconds,
      margin,
      durationTicks,
      deadlineTick: startedTick + durationTicks,
    }),
    incidentBudget,
    rewardPolicy: template.rewardPolicy,
    replayRules: template.replayRules,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Evaluation facts: the real data an attempt produces
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeZoneVisit {
  readonly zoneId: string;
  readonly enteredTick: number;
  readonly exitedTick: number;
}

export interface ChallengeCheckpointCrossing {
  readonly checkpointId: string;
  readonly tick: number;
}

export interface ChallengeDropoffFact {
  readonly zoneId: string;
  readonly tick: number;
}

export interface ChallengeParkedFact {
  readonly zoneId: string;
  readonly tick: number;
  readonly speedMps: number;
  readonly headingErrorRad: number;
  readonly dwellTicks: number;
}

export interface ChallengeDriftSample {
  readonly zoneId: string;
  readonly tick: number;
  readonly speedMps: number;
  readonly slipAngleRad: number;
  /** Nonzero when a real collision impulse touched the vehicle on this tick. */
  readonly collisionImpulseNs: number;
}

export interface ChallengeDestructionFact {
  readonly objectId: string;
  readonly zoneId: string;
  readonly tick: number;
}

export interface ChallengeComfortSample {
  readonly tick: number;
  readonly accelerationMps2: number;
  readonly jerkMps3: number;
}

export interface ChallengeLearningFact {
  readonly key: string;
  readonly activatedTick: number;
  readonly observedTick: number | null;
  readonly observedProfileId: string | null;
}

export interface ChallengeRunFacts {
  readonly tickHz: number;
  readonly startedTick: number;
  readonly endedTick: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly controlSource: ChallengeControlSource;
  readonly passengerAboard: boolean;
  readonly incidents: number;
  readonly zoneVisits: readonly ChallengeZoneVisit[];
  readonly checkpoints: readonly ChallengeCheckpointCrossing[];
  readonly dropoffs: readonly ChallengeDropoffFact[];
  readonly parked: readonly ChallengeParkedFact[];
  readonly driftSamples: readonly ChallengeDriftSample[];
  readonly destruction: readonly ChallengeDestructionFact[];
  readonly comfortSamples: readonly ChallengeComfortSample[];
  readonly learning: ChallengeLearningFact | null;
}

const factsFields = [
  'tickHz',
  'startedTick',
  'endedTick',
  'sessionKind',
  'controlSource',
  'passengerAboard',
  'incidents',
  'zoneVisits',
  'checkpoints',
  'dropoffs',
  'parked',
  'driftSamples',
  'destruction',
  'comfortSamples',
  'learning',
] as const;
const zoneVisitFields = ['zoneId', 'enteredTick', 'exitedTick'] as const;
const crossingFields = ['checkpointId', 'tick'] as const;
const dropoffFields = ['zoneId', 'tick'] as const;
const parkedFields = ['zoneId', 'tick', 'speedMps', 'headingErrorRad', 'dwellTicks'] as const;
const driftFields = ['zoneId', 'tick', 'speedMps', 'slipAngleRad', 'collisionImpulseNs'] as const;
const destructionFields = ['objectId', 'zoneId', 'tick'] as const;
const comfortFields = ['tick', 'accelerationMps2', 'jerkMps3'] as const;
const learningFields = ['key', 'activatedTick', 'observedTick', 'observedProfileId'] as const;

function readZoneVisit(value: unknown): ChallengeZoneVisit {
  const data = plainFields(value, zoneVisitFields, 'challenge zone visit');
  for (const key of zoneVisitFields) requireRequired(data, key, 'challenge zone visit');
  const enteredTick = tick(data.enteredTick);
  const exitedTick = tick(data.exitedTick);
  requireContract(exitedTick >= enteredTick, 'A zone visit cannot end before it starts');
  return Object.freeze({
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    enteredTick,
    exitedTick,
  });
}

function readCrossing(value: unknown): ChallengeCheckpointCrossing {
  const data = plainFields(value, crossingFields, 'challenge checkpoint');
  for (const key of crossingFields) requireRequired(data, key, 'challenge checkpoint');
  return Object.freeze({
    checkpointId: boundedId(
      data.checkpointId,
      CHALLENGE_LIMITS.idCodeUnits,
      'challenge checkpoint',
    ),
    tick: tick(data.tick),
  });
}

function readDropoff(value: unknown): ChallengeDropoffFact {
  const data = plainFields(value, dropoffFields, 'challenge dropoff');
  for (const key of dropoffFields) requireRequired(data, key, 'challenge dropoff');
  return Object.freeze({
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    tick: tick(data.tick),
  });
}

function readParked(value: unknown): ChallengeParkedFact {
  const data = plainFields(value, parkedFields, 'challenge parking attempt');
  for (const key of parkedFields) requireRequired(data, key, 'challenge parking attempt');
  return Object.freeze({
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    tick: tick(data.tick),
    speedMps: number(data.speedMps, 0, 120),
    headingErrorRad: number(data.headingErrorRad, 0, Math.PI),
    dwellTicks: tick(data.dwellTicks),
  });
}

function readDriftSample(value: unknown): ChallengeDriftSample {
  const data = plainFields(value, driftFields, 'challenge drift sample');
  for (const key of driftFields) requireRequired(data, key, 'challenge drift sample');
  return Object.freeze({
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    tick: tick(data.tick),
    speedMps: number(data.speedMps, 0, 120),
    slipAngleRad: number(data.slipAngleRad, -Math.PI, Math.PI),
    collisionImpulseNs: number(data.collisionImpulseNs, 0, 1_000_000),
  });
}

function readDestruction(value: unknown): ChallengeDestructionFact {
  const data = plainFields(value, destructionFields, 'challenge destruction');
  for (const key of destructionFields) requireRequired(data, key, 'challenge destruction');
  return Object.freeze({
    objectId: boundedId(data.objectId, CHALLENGE_LIMITS.idCodeUnits, 'challenge object'),
    zoneId: boundedId(data.zoneId, CHALLENGE_LIMITS.idCodeUnits, 'challenge zone'),
    tick: tick(data.tick),
  });
}

function readComfortSample(value: unknown): ChallengeComfortSample {
  const data = plainFields(value, comfortFields, 'challenge comfort sample');
  for (const key of comfortFields) requireRequired(data, key, 'challenge comfort sample');
  return Object.freeze({
    tick: tick(data.tick),
    accelerationMps2: number(data.accelerationMps2, -1_000, 1_000),
    jerkMps3: number(data.jerkMps3, -10_000, 10_000),
  });
}

function readLearningFact(value: unknown): ChallengeLearningFact {
  const data = plainFields(value, learningFields, 'challenge learning fact');
  for (const key of learningFields) requireRequired(data, key, 'challenge learning fact');
  const observedTick = data.observedTick === null ? null : tick(data.observedTick);
  const observedProfileId =
    data.observedProfileId === null
      ? null
      : boundedId(data.observedProfileId, CHALLENGE_LIMITS.idCodeUnits, 'challenge profile');
  requireContract(
    (observedTick === null) === (observedProfileId === null),
    'An observed effect names both its tick and the profile',
  );
  return Object.freeze({
    key: boundedId(data.key, CHALLENGE_LIMITS.idCodeUnits, 'challenge learning key'),
    activatedTick: tick(data.activatedTick),
    observedTick,
    observedProfileId,
  });
}

export function readChallengeRunFacts(value: unknown): ChallengeRunFacts {
  const data = plainFields(value, factsFields, 'challenge run facts');
  for (const key of factsFields) requireRequired(data, key, 'challenge run facts');
  const tickHz = number(data.tickHz, 1, 1_000);
  requireContract(tickHz === CHALLENGE_TICK_HZ, 'Challenge facts use the 60 Hz authoritative tick');
  const startedTick = tick(data.startedTick);
  const endedTick = tick(data.endedTick);
  requireContract(endedTick >= startedTick, 'Challenge facts cannot end before they start');
  const zoneVisits = list(data.zoneVisits, readZoneVisit);
  const checkpoints = list(data.checkpoints, readCrossing);
  const dropoffs = list(data.dropoffs, readDropoff);
  const parked = list(data.parked, readParked);
  const driftSamples = list(data.driftSamples, readDriftSample);
  const destruction = list(data.destruction, readDestruction);
  const comfortSamples = list(data.comfortSamples, readComfortSample);
  const learning = data.learning === null ? null : readLearningFact(data.learning);
  requireContract(
    zoneVisits.length <= CHALLENGE_LIMITS.zoneVisits,
    'Challenge zone visit capacity',
  );
  requireContract(
    checkpoints.length <= CHALLENGE_LIMITS.checkpoints,
    'Challenge checkpoint capacity',
  );
  requireContract(dropoffs.length <= CHALLENGE_LIMITS.dropoffs, 'Challenge dropoff capacity');
  requireContract(parked.length <= CHALLENGE_LIMITS.parked, 'Challenge parking capacity');
  requireContract(driftSamples.length <= CHALLENGE_LIMITS.driftSamples, 'Challenge drift capacity');
  requireContract(
    destruction.length <= CHALLENGE_LIMITS.destruction,
    'Challenge destruction capacity',
  );
  requireContract(
    comfortSamples.length <= CHALLENGE_LIMITS.comfortSamples,
    'Challenge comfort capacity',
  );
  const inside = (tickValue: number): boolean => tickValue >= startedTick && tickValue <= endedTick;
  for (const visit of zoneVisits) {
    requireContract(inside(visit.enteredTick), 'A zone visit started outside the evaluated window');
    requireContract(inside(visit.exitedTick), 'A zone visit ended outside the evaluated window');
  }
  for (const crossing of checkpoints)
    requireContract(inside(crossing.tick), 'A checkpoint crossing is outside the evaluated window');
  for (const dropoff of dropoffs)
    requireContract(inside(dropoff.tick), 'A dropoff is outside the evaluated window');
  for (const attempt of parked)
    requireContract(inside(attempt.tick), 'A parking attempt is outside the evaluated window');
  for (const sample of driftSamples)
    requireContract(inside(sample.tick), 'A drift sample is outside the evaluated window');
  for (const fact of destruction)
    requireContract(inside(fact.tick), 'A destruction is outside the evaluated window');
  for (const sample of comfortSamples)
    requireContract(inside(sample.tick), 'A comfort sample is outside the evaluated window');
  if (learning !== null) {
    requireContract(inside(learning.activatedTick), 'A learning activation is outside the window');
    if (learning.observedTick !== null)
      requireContract(
        inside(learning.observedTick),
        'A learning observation is outside the window',
      );
  }
  return Object.freeze({
    tickHz,
    startedTick,
    endedTick,
    sessionKind: choice(data.sessionKind, challengeSessionKinds),
    controlSource: choice(data.controlSource, challengeControlSources),
    passengerAboard: requireBoolean(data.passengerAboard, 'passenger'),
    incidents: tick(data.incidents),
    zoneVisits,
    checkpoints,
    dropoffs,
    parked,
    driftSamples,
    destruction,
    comfortSamples,
    learning,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Verdicts
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeMeasured {
  readonly samplesExamined: number;
  readonly checkpointsReached: number;
  readonly zonesVisited: number;
  readonly dropoffs: number;
  readonly parkedAttempts: number;
  readonly peakAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly validDriftSeconds: number;
  readonly rotationOnlyTicks: number;
  readonly collisionTicks: number;
  readonly distinctDestroyed: number;
  readonly orderViolations: number;
  readonly stopViolationTicks: number;
  readonly learningObserved: number;
}

type MutableMeasured = { -readonly [Key in keyof ChallengeMeasured]: ChallengeMeasured[Key] };

export interface ChallengeVerdict {
  readonly version: typeof CHALLENGE_SCHEMA_VERSION;
  readonly evaluatorId: ChallengeEvaluatorId;
  readonly evaluatorVersion: string;
  readonly objectiveKind: ChallengeObjectiveKind;
  readonly status: ChallengeVerdictStatus;
  readonly reason: ChallengeVerdictReason;
  readonly progress: number;
  readonly target: number;
  readonly measured: ChallengeMeasured;
  readonly deadlineTick: number;
  readonly evaluatedTick: number;
  readonly expired: boolean;
  readonly incidents: Readonly<{ used: number; budget: number; exceeded: boolean }>;
  readonly completedAtTick: number | null;
  readonly fingerprint: string;
}

function emptyMeasured(): MutableMeasured {
  return {
    samplesExamined: 0,
    checkpointsReached: 0,
    zonesVisited: 0,
    dropoffs: 0,
    parkedAttempts: 0,
    peakAccelerationMps2: 0,
    peakJerkMps3: 0,
    validDriftSeconds: 0,
    rotationOnlyTicks: 0,
    collisionTicks: 0,
    distinctDestroyed: 0,
    orderViolations: 0,
    stopViolationTicks: 0,
    learningObserved: 0,
  };
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fingerprint(parts: readonly (string | number | boolean | null)[]): string {
  const canonical = parts
    .map((part) =>
      part === null ? '~' : typeof part === 'string' ? `s${part.length}:${part}` : String(part),
    )
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

interface EvaluationShape {
  readonly progress: number;
  readonly completionTick: number | null;
  readonly measured: ChallengeMeasured;
  readonly hardReason: ChallengeVerdictReason | null;
  readonly lateReason: ChallengeVerdictReason;
}

function makeVerdict(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
  status: ChallengeVerdictStatus,
  reason: ChallengeVerdictReason,
  shape: EvaluationShape,
): ChallengeVerdict {
  const expired = facts.endedTick >= objective.deadlineTick;
  const content = {
    version: CHALLENGE_SCHEMA_VERSION,
    evaluatorId: objective.evaluatorId,
    evaluatorVersion: objective.evaluatorVersion,
    objectiveKind: objective.objectiveKind,
    status,
    reason,
    progress: shape.progress,
    target: objective.target,
    measured: Object.freeze({ ...shape.measured }),
    deadlineTick: objective.deadlineTick,
    evaluatedTick: facts.endedTick,
    expired,
    incidents: Object.freeze({
      used: facts.incidents,
      budget: objective.incidentBudget,
      exceeded: facts.incidents > objective.incidentBudget,
    }),
    completedAtTick: shape.completionTick,
  };
  return Object.freeze({
    ...content,
    fingerprint: fingerprint([
      content.evaluatorId,
      content.evaluatorVersion,
      content.objectiveKind,
      content.status,
      content.reason,
      content.progress,
      content.target,
      content.deadlineTick,
      content.evaluatedTick,
      content.expired,
      content.incidents.used,
      content.incidents.budget,
      content.completedAtTick,
      ...Object.values(content.measured),
    ]),
  });
}

function exclusionVerdict(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
  reason: ChallengeVerdictReason,
): ChallengeVerdict {
  return makeVerdict(objective, facts, 'EXCLUDED', reason, {
    progress: 0,
    completionTick: null,
    measured: emptyMeasured(),
    hardReason: reason,
    lateReason: reason,
  });
}

function byTick<T extends { readonly tick: number }>(left: T, right: T): number {
  return left.tick - right.tick;
}

function checkpointSequence(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const required = objective.zoneIds;
  const reached: string[] = [];
  let hardReason: ChallengeVerdictReason | null = null;
  const crossings = [...facts.checkpoints].sort(
    (left, right) => byTick(left, right) || compareText(left.checkpointId, right.checkpointId),
  );
  measured.samplesExamined += crossings.length + facts.zoneVisits.length;
  for (const crossing of crossings) {
    if (!required.includes(crossing.checkpointId)) continue;
    if (reached.includes(crossing.checkpointId)) continue;
    const index = required.indexOf(crossing.checkpointId);
    if (index !== reached.length) {
      measured.orderViolations += 1;
      hardReason = 'ORDER_VIOLATION';
      break;
    }
    reached.push(crossing.checkpointId);
    if (reached.length === objective.target) break;
  }
  measured.checkpointsReached = reached.length;
  const toleranceTicks = (objective.thresholds['stopToleranceS'] ?? 0) * CHALLENGE_TICK_HZ;
  for (const visit of facts.zoneVisits) {
    if (!required.includes(visit.zoneId)) continue;
    const dwell = visit.exitedTick - visit.enteredTick;
    if (dwell > toleranceTicks) {
      measured.stopViolationTicks += dwell;
      hardReason = 'STOP_TOO_LONG';
    }
  }
  const completionTick =
    reached.length >= objective.target && !hardReason
      ? (facts.checkpoints
          .filter((entry) => entry.checkpointId === reached[reached.length - 1])
          .map((entry) => entry.tick)
          .sort((left, right) => left - right)[0] ?? null)
      : null;
  return {
    progress: reached.length,
    completionTick,
    measured,
    hardReason,
    lateReason: 'DEADLINE_EXPIRED',
  };
}

function zoneOrder(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const anyOf = (objective.thresholds['anyOf'] ?? 0) === 1;
  const required = objective.zoneIds;
  const visits = [...facts.zoneVisits].sort((left, right) => left.enteredTick - right.enteredTick);
  measured.samplesExamined += visits.length;
  const visited: string[] = [];
  let hardReason: ChallengeVerdictReason | null = null;
  let completionTick: number | null = null;
  for (const visit of visits) {
    if (!required.includes(visit.zoneId)) continue;
    if (visited.includes(visit.zoneId)) continue;
    if (!anyOf) {
      const expected = required[visited.length];
      if (visit.zoneId !== expected) {
        measured.orderViolations += 1;
        hardReason = 'ORDER_VIOLATION';
        break;
      }
    }
    visited.push(visit.zoneId);
    if (visited.length === objective.target) {
      completionTick = visit.enteredTick;
      break;
    }
  }
  measured.zonesVisited = visited.length;
  return {
    progress: visited.length,
    completionTick: hardReason === null ? completionTick : null,
    measured,
    hardReason,
    lateReason: 'WRONG_ZONE',
  };
}

function timedDropoff(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const zone = objective.zoneIds[0]!;
  const matches = facts.dropoffs.filter((entry) => entry.zoneId === zone).sort(byTick);
  measured.samplesExamined += facts.dropoffs.length;
  measured.dropoffs = matches.length;
  const first = matches[0] ?? null;
  return {
    progress: first === null ? 0 : 1,
    completionTick: first?.tick ?? null,
    measured,
    hardReason: null,
    lateReason: 'DEADLINE_EXPIRED',
  };
}

function comfortBudget(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  measured.samplesExamined += facts.comfortSamples.length;
  if (!facts.passengerAboard)
    return {
      progress: 0,
      completionTick: null,
      measured,
      hardReason: 'PASSENGER_REQUIRED',
      lateReason: 'PASSENGER_REQUIRED',
    };
  const maxAcceleration = objective.thresholds['maxAccelerationMps2'] ?? 0;
  const maxJerk = objective.thresholds['maxJerkMps3'] ?? 0;
  let peakAcceleration = 0;
  let peakJerk = 0;
  let violated = false;
  for (const sample of facts.comfortSamples) {
    const acceleration = Math.abs(sample.accelerationMps2);
    const jerk = Math.abs(sample.jerkMps3);
    peakAcceleration = Math.max(peakAcceleration, acceleration);
    peakJerk = Math.max(peakJerk, jerk);
    if (
      acceleration > maxAcceleration + COMFORT_LIMIT_EPSILON ||
      jerk > maxJerk + COMFORT_LIMIT_EPSILON
    )
      violated = true;
  }
  measured.peakAccelerationMps2 = round(peakAcceleration);
  measured.peakJerkMps3 = round(peakJerk);
  const dropoffs = [...facts.dropoffs].sort(byTick);
  measured.dropoffs = dropoffs.length;
  return {
    progress: dropoffs.length > 0 ? 1 : 0,
    completionTick: dropoffs[0]?.tick ?? null,
    measured,
    hardReason: violated ? 'COMFORT_LIMIT' : null,
    lateReason: 'DEADLINE_EXPIRED',
  };
}

function parkingPrecision(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const zone = objective.zoneIds[0]!;
  const attempts = facts.parked.filter((entry) => entry.zoneId === zone).sort(byTick);
  measured.samplesExamined += facts.parked.length;
  measured.parkedAttempts = attempts.length;
  const maxSpeed = objective.thresholds['maxSpeedMps'] ?? 0;
  const maxHeading = objective.thresholds['maxHeadingErrorRad'] ?? 0;
  const minDwell = Math.ceil((objective.thresholds['minDwellS'] ?? 0) * CHALLENGE_TICK_HZ);
  let lateReason: ChallengeVerdictReason = 'WRONG_ZONE';
  for (const attempt of attempts) {
    if (attempt.speedMps > maxSpeed) {
      lateReason = 'PARKING_SPEED';
      continue;
    }
    if (attempt.headingErrorRad > maxHeading) {
      lateReason = 'PARKING_HEADING';
      continue;
    }
    if (attempt.dwellTicks < minDwell) {
      lateReason = 'PARKING_DWELL';
      continue;
    }
    return {
      progress: 1,
      completionTick: attempt.tick,
      measured,
      hardReason: null,
      lateReason,
    };
  }
  return { progress: 0, completionTick: null, measured, hardReason: null, lateReason };
}

function driftAccumulation(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const zone = objective.zoneIds[0]!;
  const minSpeed = objective.thresholds['minSpeedMps'] ?? 0;
  const minSlip = objective.thresholds['minSlipAngleRad'] ?? 0;
  const minTicks = Math.ceil((objective.thresholds['minSeconds'] ?? 0) * CHALLENGE_TICK_HZ);
  let validTicks = 0;
  let completionTick: number | null = null;
  const samples = [...facts.driftSamples].filter((entry) => entry.zoneId === zone).sort(byTick);
  measured.samplesExamined += facts.driftSamples.length;
  for (const sample of samples) {
    const slip = Math.abs(sample.slipAngleRad);
    if (sample.collisionImpulseNs > 0) {
      measured.collisionTicks += 1;
      continue;
    }
    if (sample.speedMps < minSpeed) {
      if (slip >= minSlip) measured.rotationOnlyTicks += 1;
      continue;
    }
    if (slip < minSlip) continue;
    validTicks += 1;
    if (validTicks === minTicks) completionTick = sample.tick;
  }
  measured.validDriftSeconds = round(validTicks / CHALLENGE_TICK_HZ);
  return {
    progress: validTicks >= minTicks ? 1 : 0,
    completionTick,
    measured,
    hardReason: null,
    lateReason: 'NO_VALID_DRIFT',
  };
}

function distinctDestruction(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  const zone = objective.zoneIds[0]!;
  const factsInZone = facts.destruction.filter((entry) => entry.zoneId === zone).sort(byTick);
  measured.samplesExamined += facts.destruction.length;
  const seen = new Set<string>();
  let completionTick: number | null = null;
  for (const fact of factsInZone) {
    if (seen.has(fact.objectId)) continue;
    seen.add(fact.objectId);
    if (seen.size === objective.target) {
      completionTick = fact.tick;
      break;
    }
  }
  measured.distinctDestroyed = seen.size;
  return {
    progress: seen.size,
    completionTick,
    measured,
    hardReason: null,
    lateReason: 'DEADLINE_EXPIRED',
  };
}

function learningObservation(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  const measured = emptyMeasured();
  measured.samplesExamined += facts.learning === null ? 0 : 1;
  const learning = facts.learning;
  if (learning === null || learning.key !== objective.learningKey)
    return {
      progress: 0,
      completionTick: null,
      measured,
      hardReason: 'LEARNING_KEY_MISSING',
      lateReason: 'LEARNING_KEY_MISSING',
    };
  const maxDelay = objective.thresholds['maxObservationDelayTicks'] ?? 0;
  if (learning.observedTick === null)
    return {
      progress: 0,
      completionTick: null,
      measured,
      hardReason: null,
      lateReason: 'EFFECT_NOT_OBSERVED',
    };
  const delay = learning.observedTick - learning.activatedTick;
  if (delay < 0 || delay > maxDelay)
    return {
      progress: 0,
      completionTick: null,
      measured,
      hardReason: 'EFFECT_NOT_OBSERVED',
      lateReason: 'EFFECT_NOT_OBSERVED',
    };
  measured.learningObserved = 1;
  return {
    progress: 1,
    completionTick: learning.observedTick,
    measured,
    hardReason: null,
    lateReason: 'EFFECT_NOT_OBSERVED',
  };
}

function evaluateShape(
  objective: ChallengeObjectiveSnapshot,
  facts: ChallengeRunFacts,
): EvaluationShape {
  switch (objective.evaluatorId) {
    case 'checkpoint-sequence':
      return checkpointSequence(objective, facts);
    case 'zone-order':
      return zoneOrder(objective, facts);
    case 'timed-dropoff':
      return timedDropoff(objective, facts);
    case 'comfort-budget':
      return comfortBudget(objective, facts);
    case 'parking-precision':
      return parkingPrecision(objective, facts);
    case 'drift-accumulation':
      return driftAccumulation(objective, facts);
    case 'distinct-destruction':
      return distinctDestruction(objective, facts);
    case 'learning-observation':
      return learningObservation(objective, facts);
  }
}

const evaluationFields = ['objective', 'facts'] as const;

/**
 * The single pure entry point. `status` follows a fixed precedence: exclusion, incident budget, a
 * hard objective violation, the target before the deadline, the deadline, and finally progress.
 */
export function evaluateChallenge(value: unknown): ChallengeVerdict {
  const data = plainFields(value, evaluationFields, 'challenge evaluation');
  for (const key of evaluationFields) requireRequired(data, key, 'challenge evaluation');
  const objective = parseChallengeObjectiveSnapshot(data.objective);
  const facts = readChallengeRunFacts(data.facts);
  const definition = challengeEvaluatorDefinition(objective.evaluatorId);
  if (!(definition.sessions as readonly string[]).includes(facts.sessionKind))
    return exclusionVerdict(objective, facts, 'SESSION_NOT_ALLOWED');
  if (!(definition.controls as readonly string[]).includes(facts.controlSource))
    return exclusionVerdict(objective, facts, 'CONTROL_NOT_ALLOWED');
  if (objective.zoneIds.length < definition.zoneIds.minimum)
    return exclusionVerdict(objective, facts, 'ZONE_MISSING');
  const shape = evaluateShape(objective, facts);
  const expired = facts.endedTick >= objective.deadlineTick;
  if (facts.incidents > objective.incidentBudget)
    return makeVerdict(objective, facts, 'FAILED', 'INCIDENT_BUDGET_EXCEEDED', shape);
  if (shape.hardReason !== null)
    return makeVerdict(objective, facts, 'FAILED', shape.hardReason, shape);
  if (
    shape.progress >= objective.target &&
    shape.completionTick !== null &&
    shape.completionTick <= objective.deadlineTick
  )
    return makeVerdict(objective, facts, 'PASSED', 'TARGET_REACHED', shape);
  if (shape.completionTick !== null && shape.completionTick > objective.deadlineTick)
    return makeVerdict(objective, facts, 'FAILED', 'DEADLINE_EXPIRED', shape);
  if (expired) return makeVerdict(objective, facts, 'FAILED', shape.lateReason, shape);
  return makeVerdict(objective, facts, 'INCOMPLETE', 'PROGRESS', shape);
}

/* ---------------------------------------------------------------------------------------------
 * 211 compatibility: the subset with a real 116 objective
 * ------------------------------------------------------------------------------------------- */

function dailyFamilyFor(template: ChallengeTemplate): DailyTemplateFamily | null {
  const objectiveKind =
    template.objectiveKind === 'TIMED_DROPOFF'
      ? ('DROPOFFS' as const)
      : template.objectiveKind === 'LEARNING'
        ? ('LEARNING_ACTIVATIONS' as const)
        : null;
  if (objectiveKind === null) return null;
  return Object.freeze({
    familyId: template.templateId,
    version: template.version,
    category:
      template.objectiveKind === 'LEARNING' ? ('EXPERIMENT' as const) : ('SERVICE' as const),
    controlRequirement: template.controlRequirement,
    objectiveKind,
    learningKeyRequired: template.controlRequirement === 'LEARNING',
    allowsManual: template.controlRequirement !== 'LEARNING',
    minCampaignMissions: template.prerequisites.minCampaignMissions,
    targets: template.targets,
    incidentBudgets: template.incidentBudgets,
    windowTicksOptions: Object.freeze([null]),
    minDurationOptions: Object.freeze([null]),
    title: template.title,
    label: template.label,
  });
}

/**
 * The subset of the challenge catalog that maps onto a delivered 116 daily objective without
 * weakening its evaluator. The three timed-dropoff/publish templates are expressible as real daily
 * families; the rest keep their own evaluator and are connected by 233. 211 therefore keeps working
 * unchanged and the daily generator accepts this versioned catalog as an external one.
 */
export function challengeDailyFamilies(
  catalogInput: unknown = createChallengeTemplateCatalog(),
): DailyTemplateCatalog {
  const catalog = parseChallengeTemplateCatalog(catalogInput);
  const families: DailyTemplateFamily[] = [];
  for (const template of catalog.templates) {
    const family = dailyFamilyFor(template);
    if (family !== null) families.push(family);
  }
  return parseDailyTemplateCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: CHALLENGE_DAILY_BRIDGE_VERSION,
    families,
  });
}

/**
 * Explicitly deferred to 233: offer scheduling and cooldowns, the instance lifecycle and reload,
 * XP credit through the real ledger, the replay/records history and the nine templates whose
 * objective has no 116 equivalent. 231 publishes only the catalog, the prerequisite export and the
 * pure evaluators.
 */
export const CHALLENGE_DEFERRED_TO_233 = Object.freeze([
  'OFFER_SCHEDULING',
  'INSTANCE_LIFECYCLE',
  'RELOAD_AND_REWARD_CREDIT',
  'REPLAY_AND_RECORD_HISTORY',
  'UNMAPPED_TEMPLATE_OBJECTIVES',
] as const);
