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
import {
  CHALLENGE_TICK_HZ,
  challengeControlSources,
  challengeDeadlineTicks,
  challengeSessionKinds,
  createChallengeTemplateCatalog,
} from './challenges';
import type {
  ChallengeControlSource,
  ChallengeSessionKind,
  ChallengeTemplateCatalog,
} from './challenges';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';
import type { CampaignProgress, MissionUnlockSnapshot } from './rewards';

/**
 * 188 extended challenges: the observable contexts of the 56 V2 learning keys.
 *
 * The delivered 231 catalog stays exactly as authored: twelve templates, eight evaluators, one
 * version. This module owns the *extended* half — one challenge per V2 key it covers, in a separate
 * catalog and a separate evaluator vocabulary. The 231 templates, ids, versions and thresholds are
 * neither read nor rewritten here; the composed catalog only publishes both halves side by side.
 *
 * A challenge is not a text and not a score. Every challenge declares:
 *
 * - a `learningKey` from the real 187 table of the 56 V2 keys, plus an authored `keyValue` inside
 *   the key's real catalog range;
 * - a `threshold` derived from that key by a closed derivation (`MIN_METRES`, `MAX_TICKS`,
 *   `MIN_YIELDS_PER_OPPORTUNITY`, ...). The derivation is chosen by the evaluator, so the unit of
 *   the measured fact is structurally the unit of the key: a clearance key is compared in metres, a
 *   reaction key in ticks, a probability key as a count of real opportunities;
 * - one pure evaluator over a 60 Hz tick window with facts recorded by real subsystems: pedestrian
 *   crossings, route decisions, recovery attempts, signal opportunities, hazard passes and service
 *   stops. The evaluator sorts the facts by tick, so a permuted but otherwise identical document
 *   produces the same verdict bytes.
 *
 * Nothing here is supplied as a score by the caller. "Yielded" is the ordering of two real ticks
 * (`egoEnteredTick >= pedestrianClearedTick`), "stopped on red" is a stop tick with no crossing
 * tick, "waited long enough" is a tick difference, and a consent field such as `score` is refused as
 * an unknown field. There is no wall clock, no `Math.random`, no DOM, no renderer and no profile
 * read; the result reports `profileWrites: 0` and `learningJobs: 0` structurally.
 *
 * Prerequisites are fail-closed in the 231 style: a challenge whose V2 key, family capability or
 * session is missing is *excluded by name*, never generated and then failed at runtime.
 */

export const EXTENDED_CHALLENGE_SCHEMA_VERSION = '188-extended-challenges-v1' as const;
export const EXTENDED_CHALLENGE_CATALOG_VERSION = '188-extended-challenge-catalog-v1' as const;
export const EXTENDED_CHALLENGE_EVALUATOR_VERSION = '188-extended-evaluators-v1' as const;
export const EXTENDED_CHALLENGE_CAPABILITY_VERSION = '188-extended-capabilities-v1' as const;
export const EXTENDED_CHALLENGE_V1_CONTEXT_VERSION = '188-v1-progress-import-v1' as const;
export const EXTENDED_CHALLENGE_TICK_HZ = CHALLENGE_TICK_HZ;

/** Fixed budgets. A catalog, a fact document or a replay loop cannot grow these values. */
export const EXTENDED_CHALLENGE_LIMITS = Object.freeze({
  version: EXTENDED_CHALLENGE_SCHEMA_VERSION,
  /** Authored challenges in one extended catalog. */
  challenges: 32,
  /** The delivered catalog covers at least one challenge per family. */
  minimumChallenges: 5,
  /** Authored opportunities of a per-opportunity objective. */
  opportunities: 8,
  /** Declared incident budgets in one challenge. */
  incidentBudgets: 4,
  /** Declared deadline margins in one challenge. */
  margins: 3,
  /** Facts retained per observation stream. */
  factsPerStream: 32,
  /** Attempts per challenge; a replay starts a new identity. */
  attemptsPerChallenge: 8,
  /** Code units per challenge, fact and capability identity. */
  idCodeUnits: 256,
  /** Code units per authored title and label. */
  titleCodeUnits: 160,
  /** Code units per authored explanation sentence. */
  explanationCodeUnits: 320,
});

/** The five authored families of 188, in the order Docs/13 lists them. */
export const extendedChallengeFamilies = [
  'PEDESTRIAN',
  'ROUTING',
  'SIGNALLING',
  'HAZARD',
  'SERVICE',
] as const;
export type ExtendedChallengeFamily = (typeof extendedChallengeFamilies)[number];

export const extendedChallengeFamilyLabels: Readonly<Record<ExtendedChallengeFamily, string>> =
  Object.freeze({
    PEDESTRIAN: 'Pietoni',
    ROUTING: 'Rutare',
    SIGNALLING: 'Semnalizare',
    HAZARD: 'Pericole',
    SERVICE: 'Serviciu',
  });

/** The closed evaluator vocabulary; every id has a pure evaluator below. */
export const extendedChallengeEvaluatorIds = [
  'pedestrian-yield',
  'pedestrian-clearance',
  'crosswalk-approach-speed',
  'reroute-patience',
  'u-turn-discipline',
  'reverse-recovery',
  'red-gap',
  'yellow-decision',
  'green-launch',
  'obstacle-clearance',
  'hazard-reaction',
  'emergency-brake',
  'pickup-precision',
  'pickup-dwell',
  'dropoff-curb',
] as const;
export type ExtendedChallengeEvaluatorId = (typeof extendedChallengeEvaluatorIds)[number];

/** The closed capability vocabulary of the extended scenes. */
export const extendedChallengeCapabilities = [
  'FREE_DRIVE',
  'MANUAL_CONTROL',
  'V2_LEARNING_KEYS',
  'PEDESTRIAN_TRAFFIC',
  'ROUTE_ALTERNATIVES',
  'SIGNAL_OPPORTUNITIES',
  'HAZARD_STIMULI',
  'SERVICE_STOPS',
] as const;
export type ExtendedChallengeCapability = (typeof extendedChallengeCapabilities)[number];

/** The real observation streams a challenge consumes. */
export const extendedChallengeObservationStreams = [
  'PEDESTRIAN_CROSSINGS',
  'ROUTE_DECISIONS',
  'RECOVERY_ATTEMPTS',
  'SIGNAL_OPPORTUNITIES',
  'HAZARD_PASSES',
  'SERVICE_STOPS',
] as const;
export type ExtendedChallengeObservationStream =
  (typeof extendedChallengeObservationStreams)[number];

/** Real observation events a challenge explanation can be bound to. */
export const extendedChallengeObservationEvents = [
  'PEDESTRIAN_YIELDED',
  'PEDESTRIAN_CLEARED',
  'CROSSWALK_APPROACH',
  'ROUTE_REROUTE',
  'U_TURN',
  'REVERSE_RECOVERY',
  'RED_GAP',
  'YELLOW_DECISION',
  'GREEN_RELEASE',
  'OBSTACLE_PASS',
  'HAZARD_REACTION',
  'EMERGENCY_BRAKE',
  'PICKUP_STOP',
  'PICKUP_BOARDING',
  'DROPOFF_STOP',
  'DEADLINE_EXPIRED',
  'INCIDENT',
] as const;
export type ExtendedChallengeObservationEvent = (typeof extendedChallengeObservationEvents)[number];

/** The closed threshold derivations. Each names the fact a key governs. */
export const extendedThresholdDerivations = [
  'MIN_METRES',
  'MAX_METRES',
  'MAX_SPEED_MPS',
  'MAX_ACCEL_MPS2',
  'MIN_TICKS',
  'MAX_TICKS',
  'MIN_RATIO',
  'MIN_YIELDS_PER_OPPORTUNITY',
  'MAX_COUNT_PER_OPPORTUNITY',
] as const;
export type ExtendedThresholdDerivation = (typeof extendedThresholdDerivations)[number];

export type ExtendedThresholdUnit = 'm' | 'mps' | 'mps2' | 'ticks' | 'ratio' | 'count';

export const extendedChallengeVerdictStatuses = [
  'PASSED',
  'FAILED',
  'INCOMPLETE',
  'EXCLUDED',
] as const;
export type ExtendedChallengeVerdictStatus = (typeof extendedChallengeVerdictStatuses)[number];

/** Closed verdict vocabulary; a failure always names one of these. */
export const extendedChallengeVerdictReasons = [
  'TARGET_REACHED',
  'PROGRESS',
  'DEADLINE_EXPIRED',
  'INCIDENT_BUDGET_EXCEEDED',
  'SESSION_NOT_ALLOWED',
  'CONTROL_NOT_ALLOWED',
  'OPPORTUNITY_MISMATCH',
  'NO_OPPORTUNITY',
  'PEDESTRIAN_NOT_YIELDED',
  'CLEARANCE_SHORTFALL',
  'APPROACH_TOO_FAST',
  'REROUTE_TOO_EARLY',
  'ILLEGAL_U_TURN',
  'U_TURN_BUDGET_EXCEEDED',
  'RECOVERY_MISSING',
  'RECOVERY_NOT_CLEAR',
  'RECOVERY_TOO_SHORT',
  'RED_GAP_SHORTFALL',
  'YELLOW_CROSSED',
  'GREEN_LAUNCH_TOO_HARD',
  'OBSTACLE_CONTACT',
  'NO_REACTION',
  'REACTION_TOO_SLOW',
  'STOPPED_TOO_LATE',
  'BRAKE_TOO_WEAK',
  'STOP_OUTSIDE_WINDOW',
  'LEFT_BEFORE_BOARDING',
  'DWELL_TOO_SHORT',
  'CURB_TOO_FAR',
] as const;
export type ExtendedChallengeVerdictReason = (typeof extendedChallengeVerdictReasons)[number];

/* ---------------------------------------------------------------------------------------------
 * Learning keys and threshold derivation
 * ------------------------------------------------------------------------------------------- */

interface LearningKeySource {
  readonly key: string;
  readonly catalogDefault: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly unit: string;
}

const v2LearningKeys = new Set<string>(
  parameterDefinitions
    .filter((entry) => entry.implementationStage === 'extension')
    .map((entry) => entry.key),
);
const v1LearningKeys = new Set<string>(
  parameterDefinitions
    .filter((entry) => entry.implementationStage === 'initial_learning_target')
    .map((entry) => entry.key),
);
const definitionByKey = new Map(parameterDefinitions.map((entry) => [entry.key, entry]));

/** The 56 V2 keys of the 187 table, sorted; the only keys a 188 challenge may name. */
export const extendedChallengeLearningKeys: readonly string[] = Object.freeze(
  [...v2LearningKeys].sort(compareText),
);

/** True only for a key of the delivered 56-key V2 table. */
export function isExtendedLearningKey(key: string): boolean {
  return v2LearningKeys.has(key);
}

function learningKeySource(key: string): LearningKeySource {
  requireContract(isExtendedLearningKey(key), `Not a V2 learning key of the 187 table: ${key}`);
  requireContract(!v1LearningKeys.has(key), `A V1 key cannot be a 188 challenge context: ${key}`);
  const definition = definitionByKey.get(key);
  requireContract(definition !== undefined, `Learning key is missing from the catalog: ${key}`);
  return Object.freeze({
    key,
    catalogDefault: definition.default,
    minimum: definition.min,
    maximum: definition.max,
    unit: definition.unit,
  });
}

const derivationSpecs: Readonly<
  Record<
    ExtendedThresholdDerivation,
    Readonly<{
      unit: ExtendedThresholdUnit;
      comparison: 'AT_LEAST' | 'AT_MOST';
      catalogUnit: string;
    }>
  >
> = Object.freeze({
  MIN_METRES: Object.freeze({ unit: 'm', comparison: 'AT_LEAST', catalogUnit: 'm' }),
  MAX_METRES: Object.freeze({ unit: 'm', comparison: 'AT_MOST', catalogUnit: 'm' }),
  MAX_SPEED_MPS: Object.freeze({ unit: 'mps', comparison: 'AT_MOST', catalogUnit: 'm/s' }),
  MAX_ACCEL_MPS2: Object.freeze({ unit: 'mps2', comparison: 'AT_MOST', catalogUnit: 'm/s²' }),
  MIN_TICKS: Object.freeze({ unit: 'ticks', comparison: 'AT_LEAST', catalogUnit: 's' }),
  MAX_TICKS: Object.freeze({ unit: 'ticks', comparison: 'AT_MOST', catalogUnit: 's' }),
  MIN_RATIO: Object.freeze({ unit: 'ratio', comparison: 'AT_LEAST', catalogUnit: 'ratio' }),
  MIN_YIELDS_PER_OPPORTUNITY: Object.freeze({
    unit: 'count',
    comparison: 'AT_LEAST',
    catalogUnit: 'probability',
  }),
  MAX_COUNT_PER_OPPORTUNITY: Object.freeze({
    unit: 'count',
    comparison: 'AT_MOST',
    catalogUnit: 'probability',
  }),
});

function roundsTo(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isPerOpportunityDerivation(derivation: ExtendedThresholdDerivation): boolean {
  return derivation === 'MIN_YIELDS_PER_OPPORTUNITY' || derivation === 'MAX_COUNT_PER_OPPORTUNITY';
}

export interface ExtendedChallengeThreshold {
  readonly key: string;
  readonly derivation: ExtendedThresholdDerivation;
  readonly comparison: 'AT_LEAST' | 'AT_MOST';
  readonly unit: ExtendedThresholdUnit;
  /** The authored value of the key, in the catalog unit, inside the real catalog range. */
  readonly keyValue: number;
  readonly catalogDefault: number;
  readonly catalogUnit: string;
  /** Authored opportunities for a per-opportunity derivation; `1` otherwise. */
  readonly opportunities: number;
  /** Delivered-policy floor applied before the tick conversion, in the catalog unit. */
  readonly floor: number | null;
  /** The derived threshold in the `unit` of the measured fact. */
  readonly value: number;
}

export interface ExtendedThresholdInput {
  readonly learningKey: string;
  readonly keyValue: number;
  readonly derivation: ExtendedThresholdDerivation;
  readonly opportunities?: number;
  readonly floor?: number | null;
}

/**
 * Pure derivation of a challenge threshold from one real V2 key. The key's catalog unit must match
 * the fact the derivation names, so a clearance key can never be compared as a speed and a
 * probability key can never be compared as seconds. A per-opportunity derivation needs the authored
 * opportunity count; every other derivation ignores it.
 */
export function deriveExtendedThreshold(input: ExtendedThresholdInput): ExtendedChallengeThreshold {
  const data = plainFields(
    input,
    ['learningKey', 'keyValue', 'derivation', 'opportunities', 'floor'],
    'extended threshold',
  );
  for (const key of ['learningKey', 'keyValue', 'derivation'] as const)
    requireRequired(data, key, 'extended threshold');
  const learningKey = boundedId(
    data.learningKey,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended learning key',
  );
  const source = learningKeySource(learningKey);
  const derivation = choice(data.derivation, extendedThresholdDerivations);
  const spec = derivationSpecs[derivation];
  requireContract(
    source.unit === spec.catalogUnit,
    `Key ${learningKey} is in ${source.unit}, not in ${spec.catalogUnit}; the derivation does not measure it`,
  );
  const keyValue = number(data.keyValue, source.minimum, source.maximum);
  const floor =
    data.floor === undefined || data.floor === null
      ? null
      : number(data.floor, source.minimum, source.maximum);
  const opportunities = data.opportunities === undefined ? 1 : tick(data.opportunities);
  if (isPerOpportunityDerivation(derivation))
    requireContract(
      opportunities >= 1 && opportunities <= EXTENDED_CHALLENGE_LIMITS.opportunities,
      'A per-opportunity threshold needs authored opportunities',
    );
  else
    requireContract(
      data.opportunities === undefined,
      'Only a per-opportunity derivation declares opportunities',
    );
  const effective = floor === null ? keyValue : Math.max(keyValue, floor);
  let value: number;
  switch (derivation) {
    case 'MIN_METRES':
    case 'MAX_METRES':
    case 'MAX_SPEED_MPS':
    case 'MAX_ACCEL_MPS2':
    case 'MIN_RATIO':
      value = roundsTo(keyValue);
      break;
    case 'MIN_TICKS':
    case 'MAX_TICKS':
      value = Math.ceil(roundsTo(effective * EXTENDED_CHALLENGE_TICK_HZ));
      break;
    case 'MIN_YIELDS_PER_OPPORTUNITY':
      value = Math.ceil(roundsTo(keyValue * opportunities));
      break;
    case 'MAX_COUNT_PER_OPPORTUNITY':
      value = Math.floor(roundsTo(keyValue * opportunities));
      break;
  }
  requireContract(value >= 0, 'A challenge threshold cannot be negative');
  return Object.freeze({
    key: learningKey,
    derivation,
    comparison: spec.comparison,
    unit: spec.unit,
    keyValue,
    catalogDefault: source.catalogDefault,
    catalogUnit: source.unit,
    opportunities: isPerOpportunityDerivation(derivation) ? opportunities : 1,
    floor,
    value,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Evaluator definitions
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedEvaluatorDefinition {
  readonly evaluatorId: ExtendedChallengeEvaluatorId;
  readonly version: string;
  readonly family: ExtendedChallengeFamily;
  readonly stream: ExtendedChallengeObservationStream;
  readonly derivation: ExtendedThresholdDerivation;
  readonly unit: ExtendedThresholdUnit;
  readonly comparison: 'AT_LEAST' | 'AT_MOST';
  /** `THRESHOLD` means the key's count is the target; `SINGLE` means one satisfied objective. */
  readonly targetKind: 'THRESHOLD' | 'SINGLE';
  readonly floor: number | null;
  readonly observations: readonly ExtendedChallengeObservationEvent[];
}

function evaluator(
  evaluatorId: ExtendedChallengeEvaluatorId,
  family: ExtendedChallengeFamily,
  stream: ExtendedChallengeObservationStream,
  derivation: ExtendedThresholdDerivation,
  targetKind: 'THRESHOLD' | 'SINGLE',
  observations: readonly ExtendedChallengeObservationEvent[],
  floor: number | null = null,
): ExtendedEvaluatorDefinition {
  const spec = derivationSpecs[derivation];
  return Object.freeze({
    evaluatorId,
    version: `188-eval-${evaluatorId}-v1`,
    family,
    stream,
    derivation,
    unit: spec.unit,
    comparison: spec.comparison,
    targetKind,
    floor,
    observations: Object.freeze([
      ...observations,
      'DEADLINE_EXPIRED' as const,
      'INCIDENT' as const,
    ]),
  });
}

const evaluatorDefinitions: readonly ExtendedEvaluatorDefinition[] = Object.freeze([
  evaluator(
    'pedestrian-yield',
    'PEDESTRIAN',
    'PEDESTRIAN_CROSSINGS',
    'MIN_YIELDS_PER_OPPORTUNITY',
    'THRESHOLD',
    ['PEDESTRIAN_YIELDED'],
  ),
  evaluator('pedestrian-clearance', 'PEDESTRIAN', 'PEDESTRIAN_CROSSINGS', 'MIN_METRES', 'SINGLE', [
    'PEDESTRIAN_CLEARED',
  ]),
  evaluator(
    'crosswalk-approach-speed',
    'PEDESTRIAN',
    'PEDESTRIAN_CROSSINGS',
    'MAX_SPEED_MPS',
    'SINGLE',
    ['CROSSWALK_APPROACH'],
  ),
  evaluator('reroute-patience', 'ROUTING', 'ROUTE_DECISIONS', 'MIN_TICKS', 'SINGLE', [
    'ROUTE_REROUTE',
  ]),
  evaluator(
    'u-turn-discipline',
    'ROUTING',
    'ROUTE_DECISIONS',
    'MAX_COUNT_PER_OPPORTUNITY',
    'SINGLE',
    ['U_TURN'],
  ),
  evaluator(
    'reverse-recovery',
    'ROUTING',
    'RECOVERY_ATTEMPTS',
    'MIN_TICKS',
    'SINGLE',
    ['REVERSE_RECOVERY'],
    2.5,
  ),
  evaluator('red-gap', 'SIGNALLING', 'SIGNAL_OPPORTUNITIES', 'MIN_TICKS', 'SINGLE', ['RED_GAP']),
  evaluator(
    'yellow-decision',
    'SIGNALLING',
    'SIGNAL_OPPORTUNITIES',
    'MIN_YIELDS_PER_OPPORTUNITY',
    'THRESHOLD',
    ['YELLOW_DECISION'],
  ),
  evaluator('green-launch', 'SIGNALLING', 'SIGNAL_OPPORTUNITIES', 'MAX_ACCEL_MPS2', 'SINGLE', [
    'GREEN_RELEASE',
  ]),
  evaluator('obstacle-clearance', 'HAZARD', 'HAZARD_PASSES', 'MIN_METRES', 'SINGLE', [
    'OBSTACLE_PASS',
  ]),
  evaluator('hazard-reaction', 'HAZARD', 'HAZARD_PASSES', 'MAX_TICKS', 'SINGLE', [
    'HAZARD_REACTION',
  ]),
  evaluator('emergency-brake', 'HAZARD', 'HAZARD_PASSES', 'MIN_RATIO', 'SINGLE', [
    'EMERGENCY_BRAKE',
  ]),
  evaluator('pickup-precision', 'SERVICE', 'SERVICE_STOPS', 'MAX_METRES', 'SINGLE', [
    'PICKUP_STOP',
  ]),
  evaluator('pickup-dwell', 'SERVICE', 'SERVICE_STOPS', 'MIN_TICKS', 'SINGLE', ['PICKUP_BOARDING']),
  evaluator('dropoff-curb', 'SERVICE', 'SERVICE_STOPS', 'MAX_METRES', 'SINGLE', ['DROPOFF_STOP']),
]);

export const EXTENDED_CHALLENGE_EVALUATORS: Readonly<
  Record<ExtendedChallengeEvaluatorId, ExtendedEvaluatorDefinition>
> = Object.freeze(
  Object.fromEntries(
    evaluatorDefinitions.map((definition) => [definition.evaluatorId, definition]),
  ) as Record<ExtendedChallengeEvaluatorId, ExtendedEvaluatorDefinition>,
);

export function extendedChallengeEvaluatorDefinition(
  evaluatorId: string,
): ExtendedEvaluatorDefinition {
  const definition = EXTENDED_CHALLENGE_EVALUATORS[evaluatorId as ExtendedChallengeEvaluatorId];
  requireContract(definition !== undefined, `Unknown extended challenge evaluator: ${evaluatorId}`);
  return definition;
}

/* ---------------------------------------------------------------------------------------------
 * Catalog types
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedChallengeExplanation {
  /** Why the key matters, in the words of the authored context. */
  readonly why: string;
  /** What the pedestrian or the passenger really feels when the fact is honoured. */
  readonly feels: string;
  /** The real observation event the explanation is bound to. */
  readonly observation: ExtendedChallengeObservationEvent;
}

export interface ExtendedChallengePrerequisites {
  readonly capabilities: readonly ExtendedChallengeCapability[];
  readonly vehicleClasses: readonly string[];
  readonly minCampaignMissions: number;
}

export interface ExtendedChallengeDeadlinePolicy {
  readonly referenceSeconds: number;
  readonly marginOptions: readonly number[];
}

export interface ExtendedChallengeTemplate {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly challengeId: string;
  readonly version: string;
  readonly family: ExtendedChallengeFamily;
  readonly title: string;
  readonly label: string;
  readonly explanation: ExtendedChallengeExplanation;
  readonly evaluatorId: ExtendedChallengeEvaluatorId;
  /** Exactly one real V2 key: the context the challenge explains and measures. */
  readonly learningKeys: readonly string[];
  readonly threshold: ExtendedChallengeThreshold;
  readonly target: number;
  readonly incidentBudgets: readonly number[];
  readonly deadline: ExtendedChallengeDeadlinePolicy;
  readonly sessions: readonly ChallengeSessionKind[];
  readonly controlRequirement: 'MANUAL';
  readonly observations: readonly ExtendedChallengeObservationEvent[];
  readonly prerequisites: ExtendedChallengePrerequisites;
  /** Structural: the objective is calculated from recorded facts, never from a caller score. */
  readonly scoring: 'OBSERVABLE_FACTS_ONLY';
}

export interface ExtendedChallengeCatalog {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: string;
  readonly challenges: readonly ExtendedChallengeTemplate[];
}

const prerequisitesFields = ['capabilities', 'vehicleClasses', 'minCampaignMissions'] as const;
const explanationFields = ['why', 'feels', 'observation'] as const;
const deadlineFields = ['referenceSeconds', 'marginOptions'] as const;
const templateFields = [
  'schemaVersion',
  'units',
  'challengeId',
  'version',
  'family',
  'title',
  'label',
  'explanation',
  'evaluatorId',
  'learningKeys',
  'keyValue',
  'opportunities',
  'incidentBudgets',
  'deadline',
  'sessions',
  'controlRequirement',
  'scoring',
  'prerequisites',
] as const;
const catalogFields = ['schemaVersion', 'units', 'version', 'challenges'] as const;

const familyCapabilities: Readonly<Record<ExtendedChallengeFamily, ExtendedChallengeCapability>> =
  Object.freeze({
    PEDESTRIAN: 'PEDESTRIAN_TRAFFIC',
    ROUTING: 'ROUTE_ALTERNATIVES',
    SIGNALLING: 'SIGNAL_OPPORTUNITIES',
    HAZARD: 'HAZARD_STIMULI',
    SERVICE: 'SERVICE_STOPS',
  });

const vehicleClassIds = new Set(Object.keys(VEHICLE_CLASSES));
const campaignMissionCount = 8;

function readCapability(value: unknown): ExtendedChallengeCapability {
  requireContract(typeof value === 'string', 'Expected an extended challenge capability name');
  return choice(value, extendedChallengeCapabilities);
}

function readPrerequisites(value: unknown): ExtendedChallengePrerequisites {
  const data = plainFields(value, prerequisitesFields, 'extended challenge prerequisites');
  for (const key of prerequisitesFields)
    requireRequired(data, key, 'extended challenge prerequisites');
  const capabilities = list(data.capabilities, readCapability);
  requireContract(
    capabilities.length <= extendedChallengeCapabilities.length &&
      new Set(capabilities).size === capabilities.length,
    'Extended challenge capability capacity or duplicate',
  );
  const vehicleClasses = list(data.vehicleClasses, (entry) =>
    boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended vehicle class'),
  );
  requireContract(
    vehicleClasses.length <= 4 && new Set(vehicleClasses).size === vehicleClasses.length,
    'Extended vehicle class capacity or duplicate',
  );
  for (const classId of vehicleClasses)
    requireContract(
      vehicleClassIds.has(classId),
      `Unknown extended vehicle class prerequisite: ${classId}`,
    );
  const minCampaignMissions = tick(data.minCampaignMissions);
  requireContract(
    minCampaignMissions <= campaignMissionCount,
    'Extended campaign requirement exceeds the campaign capacity',
  );
  return Object.freeze({
    capabilities,
    vehicleClasses: Object.freeze([...vehicleClasses]),
    minCampaignMissions,
  });
}

function readDeadlinePolicy(value: unknown): ExtendedChallengeDeadlinePolicy {
  const data = plainFields(value, deadlineFields, 'extended challenge deadline policy');
  for (const key of deadlineFields)
    requireRequired(data, key, 'extended challenge deadline policy');
  const referenceSeconds = number(data.referenceSeconds, 60, 240);
  const marginOptions = list(data.marginOptions, (entry) => number(entry, 0.1, 0.6));
  requireContract(
    marginOptions.length > 0 && marginOptions.length <= EXTENDED_CHALLENGE_LIMITS.margins,
    'Extended margin capacity violated',
  );
  for (let index = 1; index < marginOptions.length; index += 1)
    requireContract(
      marginOptions[index]! > marginOptions[index - 1]!,
      'Extended deadline margins must be ascending',
    );
  return Object.freeze({ referenceSeconds, marginOptions: Object.freeze([...marginOptions]) });
}

function readExplanation(
  value: unknown,
  definition: ExtendedEvaluatorDefinition,
): ExtendedChallengeExplanation {
  const data = plainFields(value, explanationFields, 'extended challenge explanation');
  for (const key of explanationFields) requireRequired(data, key, 'extended challenge explanation');
  const why = boundedId(
    data.why,
    EXTENDED_CHALLENGE_LIMITS.explanationCodeUnits,
    'extended explanation',
  );
  const feels = boundedId(
    data.feels,
    EXTENDED_CHALLENGE_LIMITS.explanationCodeUnits,
    'extended explanation',
  );
  const observation = choice(data.observation, extendedChallengeObservationEvents);
  requireContract(
    (definition.observations as readonly string[]).includes(observation),
    `Explanation is not bound to a real ${definition.evaluatorId} observation`,
  );
  requireContract(
    observation !== 'DEADLINE_EXPIRED' && observation !== 'INCIDENT',
    'An explanation is bound to the observed fact, not to a deadline or an incident',
  );
  return Object.freeze({ why, feels, observation });
}

function templateSignature(template: ExtendedChallengeTemplate): string {
  return [
    template.family,
    template.evaluatorId,
    template.learningKeys.join('+'),
    template.threshold.keyValue.toFixed(6),
    String(template.threshold.opportunities),
    template.target,
    template.incidentBudgets.join('+'),
    template.deadline.referenceSeconds.toFixed(3),
    template.deadline.marginOptions.join('+'),
  ].join('|');
}

function isParsedExtendedChallenge(value: unknown): value is ExtendedChallengeTemplate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    data.schemaVersion === 1 &&
    typeof data.threshold === 'object' &&
    data.threshold !== null &&
    typeof data.target === 'number' &&
    Array.isArray(data.observations)
  );
}

function authoredChallengeFields(template: ExtendedChallengeTemplate): Record<string, unknown> {
  return {
    schemaVersion: template.schemaVersion,
    units: template.units,
    challengeId: template.challengeId,
    version: template.version,
    family: template.family,
    title: template.title,
    label: template.label,
    explanation: template.explanation,
    evaluatorId: template.evaluatorId,
    learningKeys: template.learningKeys,
    keyValue: template.threshold.keyValue,
    ...(isPerOpportunityDerivation(template.threshold.derivation)
      ? { opportunities: template.threshold.opportunities }
      : {}),
    incidentBudgets: template.incidentBudgets,
    deadline: template.deadline,
    sessions: template.sessions,
    controlRequirement: template.controlRequirement,
    scoring: template.scoring,
    prerequisites: template.prerequisites,
  };
}

function parseExtendedChallenge(value: unknown): ExtendedChallengeTemplate {
  if (isParsedExtendedChallenge(value)) {
    const revalidated = parseExtendedChallenge(authoredChallengeFields(value));
    requireContract(
      JSON.stringify(revalidated) === JSON.stringify(value),
      'Extended challenge template is stale',
    );
    return revalidated;
  }
  const data = plainFields(value, templateFields, 'extended challenge template');
  for (const key of templateFields) {
    if (key === 'opportunities') continue;
    requireRequired(data, key, 'extended challenge template');
  }
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported extended challenge schema version or units',
  );
  const challengeId = boundedId(
    data.challengeId,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended challenge',
  );
  const version = boundedId(data.version, 32, 'extended challenge version');
  const family = choice(data.family, extendedChallengeFamilies);
  const title = boundedId(
    data.title,
    EXTENDED_CHALLENGE_LIMITS.titleCodeUnits,
    'extended challenge title',
  );
  const label = boundedId(
    data.label,
    EXTENDED_CHALLENGE_LIMITS.titleCodeUnits,
    'extended challenge label',
  );
  const evaluatorId = choice(data.evaluatorId, extendedChallengeEvaluatorIds);
  const definition = extendedChallengeEvaluatorDefinition(evaluatorId);
  requireContract(
    definition.family === family,
    `Evaluator ${evaluatorId} belongs to ${definition.family}, not ${family}`,
  );
  const learningKeys = list(data.learningKeys, (entry) =>
    boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended learning key'),
  );
  requireContract(
    learningKeys.length === 1,
    'An extended challenge declares exactly one V2 learning key',
  );
  const keyValue = number(data.keyValue, -Infinity, Infinity);
  const threshold = deriveExtendedThreshold({
    learningKey: learningKeys[0]!,
    keyValue,
    derivation: definition.derivation,
    ...(data.opportunities === undefined ? {} : { opportunities: tick(data.opportunities) }),
    ...(definition.floor === null ? {} : { floor: definition.floor }),
  });
  const target = definition.targetKind === 'THRESHOLD' ? threshold.value : 1;
  requireContract(
    Number.isSafeInteger(target) && target >= 1,
    'An extended challenge target must be a positive whole number',
  );
  const sessions = list(data.sessions, (entry) => choice(entry, challengeSessionKinds));
  requireContract(
    sessions.length > 0 &&
      sessions.length <= challengeSessionKinds.length &&
      new Set(sessions).size === sessions.length,
    'Extended session capacity or duplicate',
  );
  requireContract(
    data.controlRequirement === 'MANUAL',
    'An extended challenge is a MANUAL context',
  );
  requireContract(
    data.scoring === 'OBSERVABLE_FACTS_ONLY',
    'An extended challenge scores observable facts only',
  );
  const incidentBudgets = list(data.incidentBudgets, (entry) => {
    const budget = number(entry, 0, 20);
    requireContract(Number.isSafeInteger(budget), 'Extended incident budget must be whole');
    return budget;
  });
  requireContract(
    incidentBudgets.length > 0 &&
      incidentBudgets.length <= EXTENDED_CHALLENGE_LIMITS.incidentBudgets,
    'Extended incident budget capacity violated',
  );
  requireContract(
    new Set(incidentBudgets).size === incidentBudgets.length,
    'Duplicate extended incident budget',
  );
  for (let index = 1; index < incidentBudgets.length; index += 1)
    requireContract(
      incidentBudgets[index]! > incidentBudgets[index - 1]!,
      'Extended incident budgets must be ascending',
    );
  const deadline = readDeadlinePolicy(data.deadline);
  const explanation = readExplanation(data.explanation, definition);
  const prerequisites = readPrerequisites(data.prerequisites);
  for (const requiredCapability of [
    'FREE_DRIVE',
    'MANUAL_CONTROL',
    'V2_LEARNING_KEYS',
    familyCapabilities[family],
  ] as const)
    requireContract(
      prerequisites.capabilities.includes(requiredCapability),
      `An extended challenge requires the ${requiredCapability} capability`,
    );
  const longestDeadline = challengeDeadlineTicks(
    deadline.referenceSeconds,
    Math.max(...deadline.marginOptions),
  );
  requireContract(
    longestDeadline <= 240 * EXTENDED_CHALLENGE_TICK_HZ,
    'The written extended deadline must stay inside the 1-4 minute challenge window',
  );
  if (threshold.unit === 'ticks')
    requireContract(
      threshold.value <= longestDeadline,
      'The tick threshold cannot exceed the longest written deadline',
    );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    challengeId,
    version,
    family,
    title,
    label,
    explanation,
    evaluatorId,
    learningKeys: Object.freeze([...learningKeys]),
    threshold,
    target,
    incidentBudgets: Object.freeze([...incidentBudgets]),
    deadline,
    sessions: Object.freeze([...sessions]),
    controlRequirement: 'MANUAL' as const,
    observations: definition.observations,
    prerequisites,
    scoring: 'OBSERVABLE_FACTS_ONLY' as const,
  });
}

export function parseExtendedChallengeCatalog(value: unknown): ExtendedChallengeCatalog {
  const data = plainFields(value, catalogFields, 'extended challenge catalog');
  for (const key of catalogFields) requireRequired(data, key, 'extended challenge catalog');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported extended challenge catalog schema version or units',
  );
  const version = boundedId(
    data.version,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended challenge catalog',
  );
  const challenges = list(data.challenges, parseExtendedChallenge);
  requireContract(
    challenges.length >= EXTENDED_CHALLENGE_LIMITS.minimumChallenges &&
      challenges.length <= EXTENDED_CHALLENGE_LIMITS.challenges,
    `An extended challenge catalog declares ${EXTENDED_CHALLENGE_LIMITS.minimumChallenges}..${EXTENDED_CHALLENGE_LIMITS.challenges} challenges`,
  );
  requireContract(
    new Set(challenges.map((entry) => entry.challengeId)).size === challenges.length,
    'Duplicate extended challenge id',
  );
  requireContract(
    new Set(challenges.map((entry) => entry.title)).size === challenges.length,
    'Duplicate extended challenge title',
  );
  requireContract(
    new Set(challenges.map(templateSignature)).size === challenges.length,
    'Two extended challenges describe the same objective',
  );
  const families = new Set(challenges.map((entry) => entry.family));
  requireContract(
    families.size === extendedChallengeFamilies.length,
    'The extended catalog must cover every authored family',
  );
  const canonical = challenges
    .slice()
    .sort((left, right) => compareText(left.challengeId, right.challengeId));
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version,
    challenges: Object.freeze(canonical),
  });
}

/* ---------------------------------------------------------------------------------------------
 * The delivered extended catalog: three challenges per family
 * ------------------------------------------------------------------------------------------- */

function challengeContext(
  family: ExtendedChallengeFamily,
  vehicleClasses: readonly string[] = [],
  minCampaignMissions = 0,
): ExtendedChallengePrerequisites {
  return Object.freeze({
    capabilities: Object.freeze([
      'FREE_DRIVE' as const,
      'MANUAL_CONTROL' as const,
      'V2_LEARNING_KEYS' as const,
      familyCapabilities[family],
    ]),
    vehicleClasses: Object.freeze([...vehicleClasses]),
    minCampaignMissions,
  });
}

/**
 * The delivered extended catalog: fifteen challenges, three per family, each bound to one real V2
 * key. Thresholds are derived from the key's real catalog default; the XP/reward ledger is not part
 * of this module (a context pays nothing by itself).
 */
export function createExtendedChallengeCatalog(): ExtendedChallengeCatalog {
  return parseExtendedChallengeCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: EXTENDED_CHALLENGE_CATALOG_VERSION,
    challenges: [
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-pedestrian-yield',
        version: '1',
        family: 'PEDESTRIAN',
        title: 'Trecerea fără grabă',
        label: 'Cedează la toate cele patru traversări până când pietonul a coborât de pe trecere',
        explanation: {
          why: 'pedestrian_yield_probability este probabilitatea cu care profilul cedează la o oportunitate de traversare: 1 înseamnă că fiecare pieton primește trecerea, nu doar primul.',
          feels:
            'Pietonul simte mașina oprindu-se înainte să pășească, nu o mașină care frânează peste picioarele lui.',
          observation: 'PEDESTRIAN_YIELDED',
        },
        evaluatorId: 'pedestrian-yield',
        learningKeys: ['pedestrian_yield_probability'],
        keyValue: 1,
        opportunities: 4,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 75, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('PEDESTRIAN'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-pedestrian-clearance',
        version: '1',
        family: 'PEDESTRIAN',
        title: 'Spațiu pentru pieton',
        label: 'Păstrează cel puțin spațiul cerut de cheie față de fiecare pieton întâlnit',
        explanation: {
          why: 'pedestrian_clearance este o podea fizică peste marja vehiculului, în metri: coborârea sub ea nu mai este o trecere prudentă, indiferent de viteză.',
          feels:
            'Pietonul vede mașina trecând la o distanță sigură și nu face un pas înapoi pe trotuar.',
          observation: 'PEDESTRIAN_CLEARED',
        },
        evaluatorId: 'pedestrian-clearance',
        learningKeys: ['pedestrian_clearance'],
        keyValue: 2,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 80, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('PEDESTRIAN'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        family: 'PEDESTRIAN',
        challengeId: 'v2-challenge-crosswalk-approach',
        version: '1',
        title: 'Apropiere de trecere',
        label: 'Nu depăși plafonul de viteză la apropierea de o trecere cu pietoni',
        explanation: {
          why: 'crosswalk_approach_speed este un plafon, nu o țintă: viteza de apropiere este limitată de distanța de oprire, deci o valoare mai mare scurtează marja reală a pietonului.',
          feels:
            'Pietonul poate estima că mașina chiar poate opri, în loc să ghicească dacă șoferul apucă.',
          observation: 'CROSSWALK_APPROACH',
        },
        evaluatorId: 'crosswalk-approach-speed',
        learningKeys: ['crosswalk_approach_speed'],
        keyValue: 5,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 70, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('PEDESTRIAN'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-reroute-patience',
        version: '1',
        family: 'ROUTING',
        title: 'Răbdarea recalculării',
        label: 'Așteaptă răbdarea cheii înainte să comiți o rută mai bună',
        explanation: {
          why: 'reroute_patience este timpul cât o alternativă mai bună este ținută înainte de schimbarea rutei; 0 ar însemna să sari pe fiecare câștig de câteva secunde.',
          feels:
            'Pasagerul simte o singură schimbare de traseu, nu o mașină care cotigește la fiecare indiciu al navigației.',
          observation: 'ROUTE_REROUTE',
        },
        evaluatorId: 'reroute-patience',
        learningKeys: ['reroute_patience'],
        keyValue: 20,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 120, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('ROUTING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-u-turn-discipline',
        version: '1',
        family: 'ROUTING',
        title: 'Întoarcerea interzisă',
        label: 'Nu întoarce pe interzis și rămâi în bugetul de întoarceri permise',
        explanation: {
          why: 'u_turn_willingness se eșantionează o singură dată per oportunitate și este inertă când harta interzice întoarcerea; valoarea nu poate transforma un interzis în permis.',
          feels:
            'Ceilalți șoferi pot anticipa ce faci, pentru că mașina nu apare brusc cu fața în cealaltă direcție.',
          observation: 'U_TURN',
        },
        evaluatorId: 'u-turn-discipline',
        learningKeys: ['u_turn_willingness'],
        keyValue: 0,
        opportunities: 3,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 110, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('ROUTING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-reverse-recovery',
        version: '1',
        family: 'ROUTING',
        title: 'Recuperare din marșarier',
        label: 'Recuperează doar cu spatele liber și nu mai scurt de durata cerută',
        explanation: {
          why: 'reverse_recovery_duration este podeaua duratei de marșarier: politica 181 o ridică la timpul necesar pentru 3 m la 1,2 m/s, deci nicio valoare nu produce o recuperare instantanee.',
          feels:
            'Pasagerul simte o manevră controlată, cu spațiu verificat în spate, nu o smucitură în trafic.',
          observation: 'REVERSE_RECOVERY',
        },
        evaluatorId: 'reverse-recovery',
        learningKeys: ['reverse_recovery_duration'],
        keyValue: 2,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 100, marginOptions: [0.25, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('ROUTING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-red-gap',
        version: '1',
        family: 'SIGNALLING',
        title: 'Gap-ul de la roșu',
        label: 'Dacă traversezi pe roșu, acceptă doar un gap de cel puțin valoarea cheii',
        explanation: {
          why: 'red_run_gap_acceptance este gap-ul temporal minim acceptat la o traversare pe roșu, mărginit și de plafonul explicit de 3 s; nu este o permisiune, ci o podea de siguranță.',
          feels:
            'Traficul transversal are timp real să te vadă și să frâneze, în loc să te surprindă în intersecție.',
          observation: 'RED_GAP',
        },
        evaluatorId: 'red-gap',
        learningKeys: ['red_run_gap_acceptance'],
        keyValue: 2.5,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 90, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SIGNALLING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-yellow-decision',
        version: '1',
        family: 'SIGNALLING',
        title: 'Galbenul fezabil',
        label: 'Oprește la galbenul care permite oprirea, fără să arunci pasagerul în față',
        explanation: {
          why: 'yellow_stop_probability decide doar pe galbenul cu oprire fezabilă; un galben care nu permite oprirea nu este transformat într-o frânare de urgență.',
          feels:
            'Pasagerul nu este aruncat în centură pentru un galben la care oprirea era deja imposibilă.',
          observation: 'YELLOW_DECISION',
        },
        evaluatorId: 'yellow-decision',
        learningKeys: ['yellow_stop_probability'],
        keyValue: 0.8,
        opportunities: 2,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 90, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SIGNALLING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-green-launch',
        version: '1',
        family: 'SIGNALLING',
        title: 'Plecarea de la verde',
        label: 'Pleacă lin de la verde, sub accelerația de lansare cerută de cheie',
        explanation: {
          why: 'green_launch_acceleration este accelerația de lansare aplicată după eliberarea verdelui; o valoare mare produce o plecare bruscă, nu o plecare mai rapidă și sigură.',
          feels:
            'Pietonul care încă termină traversarea nu este speriat de un taxi care sare din loc.',
          observation: 'GREEN_RELEASE',
        },
        evaluatorId: 'green-launch',
        learningKeys: ['green_launch_acceleration'],
        keyValue: 1.5,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 75, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SIGNALLING'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-obstacle-clearance',
        version: '1',
        family: 'HAZARD',
        title: 'Obstacol pe bandă',
        label: 'Păstrează spațiul cerut față de obstacol și nu atinge nimic',
        explanation: {
          why: 'obstacle_clearance este o podea fizică în metri, peste lățimea reală a vehiculului: sub ea, trecerea prin dreptul obstacolului nu mai este o manevră, ci un contact.',
          feels:
            'Pasagerul nu este aruncat în lateral de o oglindă care atinge un obstacol pe care șoferul l-a ignorat.',
          observation: 'OBSTACLE_PASS',
        },
        evaluatorId: 'obstacle-clearance',
        learningKeys: ['obstacle_clearance'],
        keyValue: 1,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 85, marginOptions: [0.2, 0.3] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('HAZARD'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-hazard-reaction',
        version: '1',
        family: 'HAZARD',
        title: 'Prima reacție',
        label: 'Frânează în interiorul întârzierii cerute după stimulul de pericol',
        explanation: {
          why: 'hazard_reaction_delay este timpul dintre stimulul real și începutul frânării, saturat de spațiul disponibil; nu este un timp de reacție declarat de apelant.',
          feels:
            'Pasagerul simte că mașina răspunde imediat după ce pericolul apare, nu după ce acesta s-a apropiat prea mult.',
          observation: 'HAZARD_REACTION',
        },
        evaluatorId: 'hazard-reaction',
        learningKeys: ['hazard_reaction_delay'],
        keyValue: 0.5,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 80, marginOptions: [0.2, 0.4] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('HAZARD'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-emergency-brake',
        version: '1',
        family: 'HAZARD',
        title: 'Frână de urgență',
        label: 'Folosește intensitatea cerută din capacitatea reală și oprește la timp',
        explanation: {
          why: 'emergency_brake_intensity este fracția din decelerația disponibilă, plafonată de aderență; o valoare mică nu oprește la fel de repede, oricât de tare ar fi apăsată pedala.',
          feels:
            'Pasagerul este ținut de centură pentru o oprire scurtă și previzibilă, nu pentru o speranță că mașina se oprește.',
          observation: 'EMERGENCY_BRAKE',
        },
        evaluatorId: 'emergency-brake',
        learningKeys: ['emergency_brake_intensity'],
        keyValue: 1,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 85, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('HAZARD'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-pickup-precision',
        version: '1',
        family: 'SERVICE',
        title: 'Oprire la punct',
        label: 'Oprește în fereastra de precizie a punctului de îmbarcare',
        explanation: {
          why: 'pickup_stop_precision este fereastra în metri în care oprirea rămâne în interiorul zonei de serviciu; o depășire mută pasagerul în afara punctului marcat.',
          feels: 'Pasagerul urcă de pe trotuar, nu din mijlocul benzii, cu bagajul în trafic.',
          observation: 'PICKUP_STOP',
        },
        evaluatorId: 'pickup-precision',
        learningKeys: ['pickup_stop_precision'],
        keyValue: 1,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 100, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SERVICE'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-pickup-dwell',
        version: '1',
        family: 'SERVICE',
        title: 'Așteaptă îmbarcarea',
        label: 'Stai durata cerută și nu pleca înainte de confirmarea îmbarcării',
        explanation: {
          why: 'pickup_dwell_time crește până la dovada reală de îmbarcare a ciclului 061; timpul declarat nu poate scurta așteptarea sub durata cheii.',
          feels: 'Pasagerul are timp să se așeze și să pună centura înainte ca taxiul să plece.',
          observation: 'PICKUP_BOARDING',
        },
        evaluatorId: 'pickup-dwell',
        learningKeys: ['pickup_dwell_time'],
        keyValue: 3,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 110, marginOptions: [0.2, 0.3] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SERVICE'),
      },
      {
        schemaVersion: 1,
        units: 'SI',
        challengeId: 'v2-challenge-dropoff-curb',
        version: '1',
        family: 'SERVICE',
        title: 'Coborâre la bordură',
        label: 'Oprește la distanța de bordură cerută de cheie, în zona de debarcare',
        explanation: {
          why: 'dropoff_curb_distance este o bandă cu podea față de bordură: prea departe de trotuar, coborârea se face în bandă, indiferent cât de lină a fost oprirea.',
          feels: 'Pasagerul coboară direct pe trotuar și nu ocolește mașina prin trafic.',
          observation: 'DROPOFF_STOP',
        },
        evaluatorId: 'dropoff-curb',
        learningKeys: ['dropoff_curb_distance'],
        keyValue: 0.5,
        incidentBudgets: [0, 1],
        deadline: { referenceSeconds: 100, marginOptions: [0.2, 0.35] },
        sessions: ['ACADEMY', 'CHAOS'],
        controlRequirement: 'MANUAL',
        scoring: 'OBSERVABLE_FACTS_ONLY',
        prerequisites: challengeContext('SERVICE'),
      },
    ],
  });
}

/* ---------------------------------------------------------------------------------------------
 * Capabilities and prerequisite exclusion
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedChallengeCapabilities {
  readonly version: typeof EXTENDED_CHALLENGE_CAPABILITY_VERSION;
  readonly sessionKind: ChallengeSessionKind;
  readonly controlModes: readonly ChallengeControlSource[];
  readonly vehicleClasses: readonly string[];
  readonly capabilities: readonly ExtendedChallengeCapability[];
  readonly learningKeys: readonly string[];
  readonly campaignCompleted: number;
}

const capabilityFields = [
  'version',
  'sessionKind',
  'controlModes',
  'vehicleClasses',
  'capabilities',
  'learningKeys',
  'campaignCompleted',
] as const;

export function createExtendedChallengeCapabilities(value: unknown): ExtendedChallengeCapabilities {
  const data = plainFields(value, capabilityFields, 'extended challenge capabilities');
  if (data.version !== undefined)
    requireContract(
      data.version === EXTENDED_CHALLENGE_CAPABILITY_VERSION,
      'Unsupported extended capability snapshot version',
    );
  for (const key of capabilityFields) {
    if (key === 'version') continue;
    requireRequired(data, key, 'extended challenge capabilities');
  }
  const sessionKind = choice(data.sessionKind, challengeSessionKinds);
  const controlModes = list(data.controlModes, (entry) => choice(entry, challengeControlSources));
  requireContract(
    new Set(controlModes).size === controlModes.length,
    'Duplicate extended control mode',
  );
  const vehicleClasses = list(data.vehicleClasses, (entry) =>
    boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended vehicle class'),
  );
  requireContract(
    new Set(vehicleClasses).size === vehicleClasses.length,
    'Duplicate extended vehicle class',
  );
  for (const classId of vehicleClasses)
    requireContract(
      vehicleClassIds.has(classId),
      `Unknown extended vehicle class capability: ${classId}`,
    );
  const capabilities = list(data.capabilities, readCapability);
  requireContract(
    new Set(capabilities).size === capabilities.length,
    'Duplicate extended challenge capability',
  );
  const learningKeys = list(data.learningKeys, (entry) => {
    const key = boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended learning key');
    requireContract(isExtendedLearningKey(key), `Unsupported learning key: ${key}`);
    return key;
  });
  requireContract(new Set(learningKeys).size === learningKeys.length, 'Duplicate learning key');
  const campaignCompleted = tick(data.campaignCompleted);
  requireContract(
    campaignCompleted <= campaignMissionCount,
    'Extended campaign progress exceeds the campaign capacity',
  );
  return Object.freeze({
    version: EXTENDED_CHALLENGE_CAPABILITY_VERSION,
    sessionKind,
    controlModes: Object.freeze([...controlModes]),
    vehicleClasses: Object.freeze([...vehicleClasses]),
    capabilities: Object.freeze([...capabilities]),
    learningKeys: Object.freeze([...learningKeys]),
    campaignCompleted,
  });
}

/** The explicit 231-style exclusion rule, fail-closed and named. */
export function extendedChallengePrerequisitesMissing(
  challengeInput: unknown,
  capabilitiesInput: unknown,
): readonly string[] {
  const challenge = parseExtendedChallenge(challengeInput);
  const capabilities = createExtendedChallengeCapabilities(capabilitiesInput);
  const missing: string[] = [];
  if (!(challenge.sessions as readonly string[]).includes(capabilities.sessionKind))
    missing.push(`SESSION:${capabilities.sessionKind}`);
  if (!capabilities.controlModes.includes('MANUAL')) missing.push('CONTROL:MANUAL');
  for (const classId of challenge.prerequisites.vehicleClasses)
    if (!capabilities.vehicleClasses.includes(classId)) missing.push(`VEHICLE_CLASS:${classId}`);
  for (const capability of challenge.prerequisites.capabilities)
    if (!(capabilities.capabilities as readonly string[]).includes(capability))
      missing.push(`CAPABILITY:${capability}`);
  for (const learningKey of challenge.learningKeys)
    if (!capabilities.learningKeys.includes(learningKey))
      missing.push(`LEARNING_KEY:${learningKey}`);
  if (capabilities.campaignCompleted < challenge.prerequisites.minCampaignMissions)
    missing.push(`CAMPAIGN:${challenge.prerequisites.minCampaignMissions}`);
  return Object.freeze(missing);
}

export interface ExtendedChallengeEligibilityRow {
  readonly challengeId: string;
  readonly family: ExtendedChallengeFamily;
  readonly eligible: boolean;
  readonly missing: readonly string[];
}

export interface ExtendedChallengeEligibility {
  readonly eligible: readonly string[];
  readonly excluded: readonly ExtendedChallengeEligibilityRow[];
}

export function eligibleExtendedChallenges(
  catalogInput: unknown,
  capabilitiesInput: unknown,
): ExtendedChallengeEligibility {
  const catalog = parseExtendedChallengeCatalog(catalogInput);
  const capabilities = createExtendedChallengeCapabilities(capabilitiesInput);
  const eligible: string[] = [];
  const excluded: ExtendedChallengeEligibilityRow[] = [];
  for (const challenge of catalog.challenges) {
    const missing = extendedChallengePrerequisitesMissing(challenge, capabilities);
    if (missing.length === 0) eligible.push(challenge.challengeId);
    else
      excluded.push(
        Object.freeze({
          challengeId: challenge.challengeId,
          family: challenge.family,
          eligible: false,
          missing,
        }),
      );
  }
  return Object.freeze({ eligible: Object.freeze(eligible), excluded: Object.freeze(excluded) });
}

/* ---------------------------------------------------------------------------------------------
 * Objective and attempt plan
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedChallengeObjective {
  readonly version: typeof EXTENDED_CHALLENGE_SCHEMA_VERSION;
  readonly challengeId: string;
  readonly challengeVersion: string;
  readonly family: ExtendedChallengeFamily;
  readonly evaluatorId: ExtendedChallengeEvaluatorId;
  readonly evaluatorVersion: string;
  readonly learningKey: string;
  readonly threshold: ExtendedChallengeThreshold;
  readonly target: number;
  readonly deadlineTick: number;
  readonly incidentBudget: number;
  readonly sessionKind: ChallengeSessionKind;
}

const objectiveFields = [
  'version',
  'challengeId',
  'challengeVersion',
  'family',
  'evaluatorId',
  'evaluatorVersion',
  'learningKey',
  'threshold',
  'target',
  'deadlineTick',
  'incidentBudget',
  'sessionKind',
] as const;
const thresholdFields = [
  'key',
  'derivation',
  'comparison',
  'unit',
  'keyValue',
  'catalogDefault',
  'catalogUnit',
  'opportunities',
  'floor',
  'value',
] as const;

export function parseExtendedChallengeObjective(value: unknown): ExtendedChallengeObjective {
  const data = plainFields(value, objectiveFields, 'extended challenge objective');
  for (const key of objectiveFields) requireRequired(data, key, 'extended challenge objective');
  requireContract(
    data.version === EXTENDED_CHALLENGE_SCHEMA_VERSION,
    'Unsupported extended objective schema version',
  );
  const challengeId = boundedId(
    data.challengeId,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended challenge',
  );
  const challengeVersion = boundedId(data.challengeVersion, 32, 'extended challenge version');
  const family = choice(data.family, extendedChallengeFamilies);
  const evaluatorId = choice(data.evaluatorId, extendedChallengeEvaluatorIds);
  const definition = extendedChallengeEvaluatorDefinition(evaluatorId);
  requireContract(
    definition.family === family,
    `Objective family ${family} does not belong to ${evaluatorId}`,
  );
  requireContract(
    data.evaluatorVersion === definition.version,
    'Extended objective evaluator version is stale',
  );
  const raw = plainFields(data.threshold, thresholdFields, 'extended challenge threshold');
  for (const key of thresholdFields) requireRequired(raw, key, 'extended challenge threshold');
  const derivation = choice(raw.derivation, extendedThresholdDerivations);
  const threshold = deriveExtendedThreshold({
    learningKey: boundedId(
      raw.key,
      EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
      'extended threshold key',
    ),
    keyValue: number(raw.keyValue),
    derivation,
    ...(isPerOpportunityDerivation(derivation) ? { opportunities: tick(raw.opportunities) } : {}),
    ...(raw.floor === null ? {} : { floor: number(raw.floor) }),
  });
  requireContract(
    threshold.derivation === definition.derivation &&
      threshold.comparison === definition.comparison &&
      threshold.unit === definition.unit,
    'Extended objective threshold does not belong to its evaluator',
  );
  requireContract(
    threshold.floor === definition.floor,
    'Extended objective threshold does not use the delivered policy floor',
  );
  requireContract(
    raw.value === threshold.value &&
      raw.comparison === threshold.comparison &&
      raw.unit === threshold.unit &&
      raw.catalogDefault === threshold.catalogDefault &&
      raw.catalogUnit === threshold.catalogUnit &&
      raw.opportunities === threshold.opportunities,
    'Extended objective threshold is stale',
  );
  const learningKey = boundedId(
    data.learningKey,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended learning key',
  );
  requireContract(
    learningKey === threshold.key,
    'Extended objective names a different learning key than its threshold',
  );
  const target = number(data.target, 1, 1_000);
  requireContract(Number.isSafeInteger(target), 'Extended objective target must be whole');
  requireContract(
    definition.targetKind === 'THRESHOLD' ? target === threshold.value : target === 1,
    'Extended objective target does not follow its threshold',
  );
  const deadlineTick = tick(data.deadlineTick);
  const incidentBudget = tick(data.incidentBudget);
  requireContract(incidentBudget <= 20, 'Extended objective incident budget is too large');
  const sessionKind = choice(data.sessionKind, challengeSessionKinds);
  return Object.freeze({
    version: EXTENDED_CHALLENGE_SCHEMA_VERSION,
    challengeId,
    challengeVersion,
    family,
    evaluatorId,
    evaluatorVersion: definition.version,
    learningKey,
    threshold,
    target,
    deadlineTick,
    incidentBudget,
    sessionKind,
  });
}

export interface ExtendedChallengeDeadline {
  readonly referenceSeconds: number;
  readonly margin: number;
  readonly durationTicks: number;
  readonly deadlineTick: number;
}

export interface ExtendedChallengeAttemptPlan {
  readonly version: typeof EXTENDED_CHALLENGE_SCHEMA_VERSION;
  readonly catalogVersion: string;
  readonly instanceId: string;
  readonly challengeId: string;
  readonly challengeVersion: string;
  readonly family: ExtendedChallengeFamily;
  readonly sessionKind: ChallengeSessionKind;
  readonly seed: number;
  readonly attempt: number;
  readonly objective: ExtendedChallengeObjective;
  readonly deadline: ExtendedChallengeDeadline;
  readonly incidentBudget: number;
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

const planFields = [
  'challenge',
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
 * Pure attempt plan: challenge + real capabilities + explicit seed + explicit start tick. It throws
 * with the named missing prerequisites when the challenge would be excluded, so a caller cannot
 * offer an impossible context by accident.
 */
export function planExtendedChallengeAttempt(value: unknown): ExtendedChallengeAttemptPlan {
  const data = plainFields(value, planFields, 'extended challenge attempt plan');
  for (const key of planFields) requireRequired(data, key, 'extended challenge attempt plan');
  const challenge = parseExtendedChallenge(data.challenge);
  const catalogVersion = boundedId(
    data.catalogVersion,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'extended catalog version',
  );
  const capabilities = createExtendedChallengeCapabilities(data.capabilities);
  const sessionKind = choice(data.sessionKind, challengeSessionKinds);
  const seed = number(data.seed, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), 'Extended challenge seed must be a uint32');
  const attempt = number(data.attempt, 1, EXTENDED_CHALLENGE_LIMITS.attemptsPerChallenge);
  requireContract(Number.isSafeInteger(attempt), 'Extended challenge attempt must be whole');
  const startedTick = tick(data.startedTick);
  requireContract(
    (challenge.sessions as readonly string[]).includes(sessionKind),
    `Extended challenge ${challenge.challengeId} is not offered in ${sessionKind}`,
  );
  const missing = extendedChallengePrerequisitesMissing(challenge, capabilities);
  requireContract(
    missing.length === 0,
    `Extended challenge ${challenge.challengeId} is excluded: ${missing.join(', ')}`,
  );
  const margin = pickOption(
    seed,
    `${challenge.challengeId}:margin`,
    challenge.deadline.marginOptions,
  );
  const incidentBudget = pickOption(
    seed,
    `${challenge.challengeId}:incidents`,
    challenge.incidentBudgets,
  );
  const durationTicks = challengeDeadlineTicks(challenge.deadline.referenceSeconds, margin);
  const objective = parseExtendedChallengeObjective({
    version: EXTENDED_CHALLENGE_SCHEMA_VERSION,
    challengeId: challenge.challengeId,
    challengeVersion: challenge.version,
    family: challenge.family,
    evaluatorId: challenge.evaluatorId,
    evaluatorVersion: extendedChallengeEvaluatorDefinition(challenge.evaluatorId).version,
    learningKey: challenge.learningKeys[0]!,
    threshold: challenge.threshold,
    target: challenge.target,
    deadlineTick: startedTick + durationTicks,
    incidentBudget,
    sessionKind,
  });
  const instanceId = createStableId('extended-challenge-instance', catalogVersion, [
    sessionKind,
    challenge.challengeId,
    challenge.version,
    String(seed),
    String(attempt),
  ]);
  return Object.freeze({
    version: EXTENDED_CHALLENGE_SCHEMA_VERSION,
    catalogVersion,
    instanceId,
    challengeId: challenge.challengeId,
    challengeVersion: challenge.version,
    family: challenge.family,
    sessionKind,
    seed,
    attempt,
    objective,
    deadline: Object.freeze({
      referenceSeconds: challenge.deadline.referenceSeconds,
      margin,
      durationTicks,
      deadlineTick: startedTick + durationTicks,
    }),
    incidentBudget,
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Observation facts
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedPedestrianCrossing {
  readonly crossingId: string;
  readonly pedestrianEnteredTick: number;
  readonly pedestrianClearedTick: number;
  readonly egoEnteredTick: number;
  readonly egoClearedTick: number;
  readonly minimumClearanceM: number;
  readonly approachSpeedMps: number;
}

export interface ExtendedRouteDecision {
  readonly decisionId: string;
  readonly tick: number;
  readonly betterAlternativeSeenTick: number;
  readonly rerouteCommittedTick: number | null;
  readonly uTurnPermission: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly uTurnStartedTick: number | null;
}

export interface ExtendedRecoveryAttempt {
  readonly recoveryId: string;
  readonly tick: number;
  readonly reverseClear: boolean;
  readonly reverseStartedTick: number | null;
  readonly reverseEndedTick: number | null;
}

export interface ExtendedSignalOpportunity {
  readonly opportunityId: string;
  readonly tick: number;
  readonly phase: 'RED' | 'YELLOW' | 'GREEN';
  readonly feasibleStop: boolean;
  readonly stopTick: number | null;
  readonly crossingTick: number | null;
  /** World-declared temporal gap in cross traffic at a red crossing, in seconds. */
  readonly crossTrafficGapS: number | null;
  readonly releaseTick: number | null;
  readonly launchTick: number | null;
  /** Peak launch acceleration measured after the real green release, m/s². */
  readonly launchAccelerationMps2: number | null;
}

export interface ExtendedHazardPass {
  readonly hazardId: string;
  readonly stimulusTick: number;
  readonly brakeTick: number | null;
  readonly minimumClearanceM: number;
  readonly collisionImpulseNs: number;
  readonly availableDecelMps2: number;
  readonly appliedDecelMps2: number;
  readonly requiredStopTick: number | null;
  readonly stoppedTick: number | null;
}

export interface ExtendedServiceStop {
  readonly stopId: string;
  readonly tick: number;
  readonly kind: 'PICKUP' | 'DROPOFF';
  readonly offsetM: number;
  readonly curbDistanceM: number;
  readonly arrivedTick: number;
  readonly boardedTick: number | null;
  readonly departedTick: number;
}

export interface ExtendedChallengeFacts {
  readonly tickHz: number;
  readonly startedTick: number;
  readonly endedTick: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly controlSource: (typeof challengeControlSources)[number];
  readonly incidents: number;
  readonly pedestrianCrossings: readonly ExtendedPedestrianCrossing[];
  readonly routeDecisions: readonly ExtendedRouteDecision[];
  readonly recoveryAttempts: readonly ExtendedRecoveryAttempt[];
  readonly signalOpportunities: readonly ExtendedSignalOpportunity[];
  readonly hazardPasses: readonly ExtendedHazardPass[];
  readonly serviceStops: readonly ExtendedServiceStop[];
}

const factsFields = [
  'tickHz',
  'startedTick',
  'endedTick',
  'sessionKind',
  'controlSource',
  'incidents',
  'pedestrianCrossings',
  'routeDecisions',
  'recoveryAttempts',
  'signalOpportunities',
  'hazardPasses',
  'serviceStops',
] as const;
const crossingFields = [
  'crossingId',
  'pedestrianEnteredTick',
  'pedestrianClearedTick',
  'egoEnteredTick',
  'egoClearedTick',
  'minimumClearanceM',
  'approachSpeedMps',
] as const;
const routeDecisionFields = [
  'decisionId',
  'tick',
  'betterAlternativeSeenTick',
  'rerouteCommittedTick',
  'uTurnPermission',
  'uTurnStartedTick',
] as const;
const recoveryFields = [
  'recoveryId',
  'tick',
  'reverseClear',
  'reverseStartedTick',
  'reverseEndedTick',
] as const;
const signalFields = [
  'opportunityId',
  'tick',
  'phase',
  'feasibleStop',
  'stopTick',
  'crossingTick',
  'crossTrafficGapS',
  'releaseTick',
  'launchTick',
  'launchAccelerationMps2',
] as const;
const hazardFields = [
  'hazardId',
  'stimulusTick',
  'brakeTick',
  'minimumClearanceM',
  'collisionImpulseNs',
  'availableDecelMps2',
  'appliedDecelMps2',
  'requiredStopTick',
  'stoppedTick',
] as const;
const serviceFields = [
  'stopId',
  'tick',
  'kind',
  'offsetM',
  'curbDistanceM',
  'arrivedTick',
  'boardedTick',
  'departedTick',
] as const;

function requireFlag(value: unknown, label: string): boolean {
  requireContract(typeof value === 'boolean', `Expected boolean ${label}`);
  return value;
}

function readCrossing(value: unknown): ExtendedPedestrianCrossing {
  const data = plainFields(value, crossingFields, 'extended pedestrian crossing');
  for (const key of crossingFields) requireRequired(data, key, 'extended pedestrian crossing');
  const pedestrianEnteredTick = tick(data.pedestrianEnteredTick);
  const pedestrianClearedTick = tick(data.pedestrianClearedTick);
  const egoEnteredTick = tick(data.egoEnteredTick);
  const egoClearedTick = tick(data.egoClearedTick);
  requireContract(
    pedestrianClearedTick >= pedestrianEnteredTick,
    'A pedestrian cannot clear before entering',
  );
  requireContract(egoClearedTick >= egoEnteredTick, 'An ego crossing cannot end before it starts');
  return Object.freeze({
    crossingId: boundedId(
      data.crossingId,
      EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
      'extended crossing',
    ),
    pedestrianEnteredTick,
    pedestrianClearedTick,
    egoEnteredTick,
    egoClearedTick,
    minimumClearanceM: number(data.minimumClearanceM, 0, 100),
    approachSpeedMps: number(data.approachSpeedMps, 0, 120),
  });
}

function readRouteDecision(value: unknown): ExtendedRouteDecision {
  const data = plainFields(value, routeDecisionFields, 'extended route decision');
  for (const key of routeDecisionFields) requireRequired(data, key, 'extended route decision');
  const decisionTick = tick(data.tick);
  const betterAlternativeSeenTick = tick(data.betterAlternativeSeenTick);
  requireContract(
    betterAlternativeSeenTick <= decisionTick,
    'A better alternative cannot be seen after the decision tick',
  );
  const rerouteCommittedTick =
    data.rerouteCommittedTick === null ? null : tick(data.rerouteCommittedTick);
  if (rerouteCommittedTick !== null)
    requireContract(
      rerouteCommittedTick >= betterAlternativeSeenTick,
      'A reroute cannot commit before the better alternative was seen',
    );
  return Object.freeze({
    decisionId: boundedId(
      data.decisionId,
      EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
      'extended decision',
    ),
    tick: decisionTick,
    betterAlternativeSeenTick,
    rerouteCommittedTick,
    uTurnPermission: choice(data.uTurnPermission, ['PERMITTED', 'FORBIDDEN', 'UNKNOWN'] as const),
    uTurnStartedTick: data.uTurnStartedTick === null ? null : tick(data.uTurnStartedTick),
  });
}

function readRecovery(value: unknown): ExtendedRecoveryAttempt {
  const data = plainFields(value, recoveryFields, 'extended recovery attempt');
  for (const key of recoveryFields) requireRequired(data, key, 'extended recovery attempt');
  const reverseStartedTick =
    data.reverseStartedTick === null ? null : tick(data.reverseStartedTick);
  const reverseEndedTick = data.reverseEndedTick === null ? null : tick(data.reverseEndedTick);
  requireContract(
    (reverseStartedTick === null) === (reverseEndedTick === null),
    'A recovery names both its start and its end, or neither',
  );
  if (reverseStartedTick !== null && reverseEndedTick !== null)
    requireContract(
      reverseEndedTick >= reverseStartedTick,
      'A recovery cannot end before it starts',
    );
  return Object.freeze({
    recoveryId: boundedId(
      data.recoveryId,
      EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
      'extended recovery',
    ),
    tick: tick(data.tick),
    reverseClear: requireFlag(data.reverseClear, 'reverse clearance'),
    reverseStartedTick,
    reverseEndedTick,
  });
}

function readSignalOpportunity(value: unknown): ExtendedSignalOpportunity {
  const data = plainFields(value, signalFields, 'extended signal opportunity');
  for (const key of signalFields) requireRequired(data, key, 'extended signal opportunity');
  const phase = choice(data.phase, ['RED', 'YELLOW', 'GREEN'] as const);
  const stopTick = data.stopTick === null ? null : tick(data.stopTick);
  const crossingTick = data.crossingTick === null ? null : tick(data.crossingTick);
  const crossTrafficGapS =
    data.crossTrafficGapS === null ? null : number(data.crossTrafficGapS, 0, 60);
  const releaseTick = data.releaseTick === null ? null : tick(data.releaseTick);
  const launchTick = data.launchTick === null ? null : tick(data.launchTick);
  const launchAccelerationMps2 =
    data.launchAccelerationMps2 === null ? null : number(data.launchAccelerationMps2, 0, 20);
  requireContract(
    phase !== 'RED' || crossingTick === null || crossTrafficGapS !== null,
    'A red crossing names the real cross-traffic gap',
  );
  requireContract(
    launchTick === null || (releaseTick !== null && launchAccelerationMps2 !== null),
    'A launch is measured from a real green release and a real acceleration',
  );
  requireContract(
    launchAccelerationMps2 === null || launchTick !== null,
    'A launch acceleration belongs to a real launch',
  );
  return Object.freeze({
    opportunityId: boundedId(
      data.opportunityId,
      EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
      'extended opportunity',
    ),
    tick: tick(data.tick),
    phase,
    feasibleStop: requireFlag(data.feasibleStop, 'feasible stop'),
    stopTick,
    crossingTick,
    crossTrafficGapS,
    releaseTick,
    launchTick,
    launchAccelerationMps2,
  });
}

function readHazardPass(value: unknown): ExtendedHazardPass {
  const data = plainFields(value, hazardFields, 'extended hazard pass');
  for (const key of hazardFields) requireRequired(data, key, 'extended hazard pass');
  const availableDecelMps2 = number(data.availableDecelMps2, 0.1, 20);
  const appliedDecelMps2 = number(data.appliedDecelMps2, 0, 20);
  requireContract(
    appliedDecelMps2 <= availableDecelMps2 + 1e-9,
    'Applied deceleration cannot exceed the available capacity',
  );
  return Object.freeze({
    hazardId: boundedId(data.hazardId, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended hazard'),
    stimulusTick: tick(data.stimulusTick),
    brakeTick: data.brakeTick === null ? null : tick(data.brakeTick),
    minimumClearanceM: number(data.minimumClearanceM, 0, 100),
    collisionImpulseNs: number(data.collisionImpulseNs, 0, 1_000_000),
    availableDecelMps2,
    appliedDecelMps2,
    requiredStopTick: data.requiredStopTick === null ? null : tick(data.requiredStopTick),
    stoppedTick: data.stoppedTick === null ? null : tick(data.stoppedTick),
  });
}

function readServiceStop(value: unknown): ExtendedServiceStop {
  const data = plainFields(value, serviceFields, 'extended service stop');
  for (const key of serviceFields) requireRequired(data, key, 'extended service stop');
  const arrivedTick = tick(data.arrivedTick);
  const departedTick = tick(data.departedTick);
  requireContract(departedTick >= arrivedTick, 'A service stop cannot depart before it arrives');
  return Object.freeze({
    stopId: boundedId(data.stopId, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'extended stop'),
    tick: tick(data.tick),
    kind: choice(data.kind, ['PICKUP', 'DROPOFF'] as const),
    offsetM: number(data.offsetM, 0, 100),
    curbDistanceM: number(data.curbDistanceM, 0, 100),
    arrivedTick,
    boardedTick: data.boardedTick === null ? null : tick(data.boardedTick),
    departedTick,
  });
}

export function readExtendedChallengeFacts(value: unknown): ExtendedChallengeFacts {
  const data = plainFields(value, factsFields, 'extended challenge facts');
  for (const key of factsFields) requireRequired(data, key, 'extended challenge facts');
  const tickHz = number(data.tickHz, 1, 1_000);
  requireContract(
    tickHz === EXTENDED_CHALLENGE_TICK_HZ,
    'Extended challenge facts use the 60 Hz authoritative tick',
  );
  const startedTick = tick(data.startedTick);
  const endedTick = tick(data.endedTick);
  requireContract(endedTick >= startedTick, 'Extended facts cannot end before they start');
  const pedestrianCrossings = list(data.pedestrianCrossings, readCrossing);
  const routeDecisions = list(data.routeDecisions, readRouteDecision);
  const recoveryAttempts = list(data.recoveryAttempts, readRecovery);
  const signalOpportunities = list(data.signalOpportunities, readSignalOpportunity);
  const hazardPasses = list(data.hazardPasses, readHazardPass);
  const serviceStops = list(data.serviceStops, readServiceStop);
  for (const stream of [
    pedestrianCrossings,
    routeDecisions,
    recoveryAttempts,
    signalOpportunities,
    hazardPasses,
    serviceStops,
  ])
    requireContract(
      stream.length <= EXTENDED_CHALLENGE_LIMITS.factsPerStream,
      'Extended fact stream capacity violated',
    );
  const inside = (tickValue: number): boolean => tickValue >= startedTick && tickValue <= endedTick;
  const guestTicks: readonly number[] = [
    ...pedestrianCrossings.flatMap((entry) => [
      entry.pedestrianEnteredTick,
      entry.pedestrianClearedTick,
      entry.egoEnteredTick,
      entry.egoClearedTick,
    ]),
    ...routeDecisions.flatMap((entry) => [
      entry.tick,
      entry.betterAlternativeSeenTick,
      ...(entry.rerouteCommittedTick === null ? [] : [entry.rerouteCommittedTick]),
      ...(entry.uTurnStartedTick === null ? [] : [entry.uTurnStartedTick]),
    ]),
    ...recoveryAttempts.flatMap((entry) => [
      entry.tick,
      ...(entry.reverseStartedTick === null ? [] : [entry.reverseStartedTick]),
      ...(entry.reverseEndedTick === null ? [] : [entry.reverseEndedTick]),
    ]),
    ...signalOpportunities.flatMap((entry) => [
      entry.tick,
      ...(entry.stopTick === null ? [] : [entry.stopTick]),
      ...(entry.crossingTick === null ? [] : [entry.crossingTick]),
      ...(entry.releaseTick === null ? [] : [entry.releaseTick]),
      ...(entry.launchTick === null ? [] : [entry.launchTick]),
    ]),
    ...hazardPasses.flatMap((entry) => [
      entry.stimulusTick,
      ...(entry.brakeTick === null ? [] : [entry.brakeTick]),
      ...(entry.requiredStopTick === null ? [] : [entry.requiredStopTick]),
      ...(entry.stoppedTick === null ? [] : [entry.stoppedTick]),
    ]),
    ...serviceStops.flatMap((entry) => [
      entry.tick,
      entry.arrivedTick,
      ...(entry.boardedTick === null ? [] : [entry.boardedTick]),
      entry.departedTick,
    ]),
  ];
  for (const tickValue of guestTicks)
    requireContract(inside(tickValue), 'An extended fact is outside the evaluated window');
  return Object.freeze({
    tickHz,
    startedTick,
    endedTick,
    sessionKind: choice(data.sessionKind, challengeSessionKinds),
    controlSource: choice(data.controlSource, challengeControlSources),
    incidents: tick(data.incidents),
    pedestrianCrossings,
    routeDecisions,
    recoveryAttempts,
    signalOpportunities,
    hazardPasses,
    serviceStops,
  });
}

/* ---------------------------------------------------------------------------------------------
 * Verdicts
 * ------------------------------------------------------------------------------------------- */

export interface ExtendedChallengeMeasured {
  /** Unit of the governed fact and of both numeric values below. */
  readonly unit: ExtendedThresholdUnit;
  /** The measured fact, reduced to its worst value for the evaluator's comparison. */
  readonly measured: number;
  readonly threshold: number;
  readonly comparison: 'AT_LEAST' | 'AT_MOST';
  readonly opportunities: number;
  readonly satisfied: number;
  readonly violated: number;
  readonly samplesExamined: number;
}

export interface ExtendedChallengeVerdict {
  readonly version: typeof EXTENDED_CHALLENGE_SCHEMA_VERSION;
  readonly challengeId: string;
  readonly challengeVersion: string;
  readonly family: ExtendedChallengeFamily;
  readonly evaluatorId: ExtendedChallengeEvaluatorId;
  readonly evaluatorVersion: string;
  readonly learningKey: string;
  readonly threshold: ExtendedChallengeThreshold;
  readonly status: ExtendedChallengeVerdictStatus;
  readonly reason: ExtendedChallengeVerdictReason;
  readonly progress: number;
  readonly target: number;
  readonly measured: ExtendedChallengeMeasured;
  readonly deadlineTick: number;
  readonly evaluatedTick: number;
  readonly expired: boolean;
  readonly incidents: Readonly<{ used: number; budget: number; exceeded: boolean }>;
  readonly completedAtTick: number | null;
  readonly fingerprint: string;
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

interface EvaluationShape {
  readonly progress: number;
  readonly completionTick: number | null;
  readonly measured: ExtendedChallengeMeasured;
  readonly hardReason: ExtendedChallengeVerdictReason | null;
  readonly lateReason: ExtendedChallengeVerdictReason;
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

function measuredOf(
  objective: ExtendedChallengeObjective,
  value: number,
  opportunities: number,
  satisfied: number,
  violated: number,
  samplesExamined: number,
): ExtendedChallengeMeasured {
  return Object.freeze({
    unit: objective.threshold.unit,
    measured: round(value),
    threshold: objective.threshold.value,
    comparison: objective.threshold.comparison,
    opportunities,
    satisfied,
    violated,
    samplesExamined,
  });
}

function emptyMeasured(objective: ExtendedChallengeObjective): ExtendedChallengeMeasured {
  return measuredOf(objective, 0, 0, 0, 0, 0);
}

function makeVerdict(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
  status: ExtendedChallengeVerdictStatus,
  reason: ExtendedChallengeVerdictReason,
  shape: EvaluationShape,
): ExtendedChallengeVerdict {
  const expired = facts.endedTick >= objective.deadlineTick;
  const content = {
    version: EXTENDED_CHALLENGE_SCHEMA_VERSION,
    challengeId: objective.challengeId,
    challengeVersion: objective.challengeVersion,
    family: objective.family,
    evaluatorId: objective.evaluatorId,
    evaluatorVersion: objective.evaluatorVersion,
    learningKey: objective.learningKey,
    threshold: objective.threshold,
    status,
    reason,
    progress: shape.progress,
    target: objective.target,
    measured: shape.measured,
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
      content.challengeId,
      content.challengeVersion,
      content.evaluatorId,
      content.evaluatorVersion,
      content.status,
      content.reason,
      content.progress,
      content.target,
      content.learningKey,
      content.threshold.value,
      content.deadlineTick,
      content.evaluatedTick,
      content.expired,
      content.incidents.used,
      content.incidents.budget,
      content.completedAtTick,
      content.measured.measured,
      content.measured.opportunities,
      content.measured.satisfied,
      content.measured.violated,
    ]),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

function exclusionVerdict(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
  reason: ExtendedChallengeVerdictReason,
): ExtendedChallengeVerdict {
  return makeVerdict(objective, facts, 'EXCLUDED', reason, {
    progress: 0,
    completionTick: null,
    measured: emptyMeasured(objective),
    hardReason: reason,
    lateReason: reason,
  });
}

function byTick<T extends { readonly tick: number }>(left: T, right: T): number {
  return left.tick - right.tick;
}

function crossingSequence(objective: ExtendedChallengeObjective, facts: ExtendedChallengeFacts) {
  const crossings = [...facts.pedestrianCrossings].sort(
    (left, right) =>
      left.egoEnteredTick - right.egoEnteredTick || compareText(left.crossingId, right.crossingId),
  );
  const required = objective.threshold.value;
  const yielded = crossings.filter(
    (crossing) => crossing.egoEnteredTick >= crossing.pedestrianClearedTick,
  );
  const completionTick =
    yielded.length >= required ? (yielded[required - 1]?.egoEnteredTick ?? null) : null;
  return {
    progress: yielded.length,
    completionTick,
    measured: measuredOf(
      objective,
      yielded.length,
      crossings.length,
      yielded.length,
      crossings.length - yielded.length,
      crossings.length,
    ),
    hardReason: null,
    lateReason: 'PEDESTRIAN_NOT_YIELDED' as const,
  };
}

function pedestrianClearance(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const crossings = [...facts.pedestrianCrossings].sort(
    (left, right) =>
      left.egoClearedTick - right.egoClearedTick || compareText(left.crossingId, right.crossingId),
  );
  if (crossings.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const satisfied = crossings.filter((entry) => entry.minimumClearanceM >= threshold).length;
  const minimum = Math.min(...crossings.map((entry) => entry.minimumClearanceM));
  const hardReason = satisfied < crossings.length ? ('CLEARANCE_SHORTFALL' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...crossings.map((entry) => entry.egoClearedTick)) : null,
    measured: measuredOf(
      objective,
      minimum,
      crossings.length,
      satisfied,
      crossings.length - satisfied,
      crossings.length,
    ),
    hardReason,
    lateReason: 'CLEARANCE_SHORTFALL',
  };
}

function crosswalkApproach(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const crossings = [...facts.pedestrianCrossings].sort(
    (left, right) =>
      left.egoEnteredTick - right.egoEnteredTick || compareText(left.crossingId, right.crossingId),
  );
  if (crossings.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const satisfied = crossings.filter((entry) => entry.approachSpeedMps <= threshold).length;
  const peak = Math.max(...crossings.map((entry) => entry.approachSpeedMps));
  const hardReason = satisfied < crossings.length ? ('APPROACH_TOO_FAST' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...crossings.map((entry) => entry.egoEnteredTick)) : null,
    measured: measuredOf(
      objective,
      peak,
      crossings.length,
      satisfied,
      crossings.length - satisfied,
      crossings.length,
    ),
    hardReason,
    lateReason: 'APPROACH_TOO_FAST',
  };
}

function reroutePatience(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const decisions = [...facts.routeDecisions].sort(byTick);
  const committed = decisions.filter((entry) => entry.rerouteCommittedTick !== null);
  if (committed.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'REROUTE_TOO_EARLY',
    };
  const threshold = objective.threshold.value;
  const waits = committed.map(
    (entry) => entry.rerouteCommittedTick! - entry.betterAlternativeSeenTick,
  );
  const minimum = Math.min(...waits);
  const satisfied = waits.filter((value) => value >= threshold).length;
  const hardReason = satisfied < waits.length ? ('REROUTE_TOO_EARLY' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null
        ? Math.max(...committed.map((entry) => entry.rerouteCommittedTick!))
        : null,
    measured: measuredOf(
      objective,
      minimum,
      committed.length,
      satisfied,
      waits.length - satisfied,
      decisions.length,
    ),
    hardReason,
    lateReason: 'REROUTE_TOO_EARLY',
  };
}

function uTurnDiscipline(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const decisions = [...facts.routeDecisions].sort(byTick);
  const permitted = decisions.filter((entry) => entry.uTurnPermission === 'PERMITTED');
  const illegal = decisions.filter(
    (entry) => entry.uTurnStartedTick !== null && entry.uTurnPermission !== 'PERMITTED',
  ).length;
  const taken = permitted.filter((entry) => entry.uTurnStartedTick !== null).length;
  const threshold = objective.threshold.value;
  const hardReason =
    illegal > 0
      ? ('ILLEGAL_U_TURN' as const)
      : taken > threshold
        ? ('U_TURN_BUDGET_EXCEEDED' as const)
        : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null && decisions.length > 0
        ? Math.max(...decisions.map((entry) => entry.tick))
        : null,
    measured: measuredOf(
      objective,
      illegal,
      permitted.length,
      threshold - Math.min(taken, threshold),
      illegal + Math.max(0, taken - threshold),
      decisions.length,
    ),
    hardReason,
    lateReason: 'U_TURN_BUDGET_EXCEEDED',
  };
}

function reverseRecovery(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const attempts = [...facts.recoveryAttempts].sort(byTick);
  if (attempts.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'RECOVERY_MISSING',
    };
  if (attempts.some((entry) => !entry.reverseClear && entry.reverseStartedTick !== null))
    return {
      progress: 0,
      completionTick: null,
      measured: measuredOf(objective, 0, attempts.length, 0, attempts.length, attempts.length),
      hardReason: 'RECOVERY_NOT_CLEAR',
      lateReason: 'RECOVERY_NOT_CLEAR',
    };
  const reversals = attempts.filter(
    (entry) => entry.reverseClear && entry.reverseStartedTick !== null,
  );
  if (reversals.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'RECOVERY_MISSING',
    };
  const durations = reversals.map((entry) => entry.reverseEndedTick! - entry.reverseStartedTick!);
  const minimum = Math.min(...durations);
  const threshold = objective.threshold.value;
  const satisfied = durations.filter((value) => value >= threshold).length;
  const hardReason = satisfied < durations.length ? ('RECOVERY_TOO_SHORT' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...reversals.map((entry) => entry.reverseEndedTick!)) : null,
    measured: measuredOf(
      objective,
      minimum,
      reversals.length,
      satisfied,
      durations.length - satisfied,
      attempts.length,
    ),
    hardReason,
    lateReason: 'RECOVERY_TOO_SHORT',
  };
}

function yellowStops(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const opportunities = [...facts.signalOpportunities]
    .filter((entry) => entry.phase === 'YELLOW' && entry.feasibleStop)
    .sort(byTick);
  const required = objective.threshold.value;
  const satisfied = opportunities.filter(
    (entry) => entry.stopTick !== null && entry.crossingTick === null,
  );
  const crossed = opportunities.filter((entry) => entry.crossingTick !== null).length;
  const completionTick =
    satisfied.length >= required ? (satisfied[required - 1]?.stopTick ?? null) : null;
  return {
    progress: satisfied.length,
    completionTick,
    measured: measuredOf(
      objective,
      satisfied.length,
      opportunities.length,
      satisfied.length,
      crossed,
      opportunities.length,
    ),
    hardReason: crossed > 0 ? ('YELLOW_CROSSED' as const) : null,
    lateReason: 'YELLOW_CROSSED',
  };
}

function redGap(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const reds = [...facts.signalOpportunities].filter((entry) => entry.phase === 'RED').sort(byTick);
  if (reds.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const crossings = reds.filter((entry) => entry.crossingTick !== null);
  if (crossings.length === 0)
    return {
      progress: 1,
      completionTick: Math.max(...reds.map((entry) => entry.tick)),
      measured: measuredOf(objective, threshold, reds.length, reds.length, 0, reds.length),
      hardReason: null,
      lateReason: 'RED_GAP_SHORTFALL',
    };
  const gaps = crossings.map((entry) =>
    Math.round(entry.crossTrafficGapS! * EXTENDED_CHALLENGE_TICK_HZ),
  );
  const minimum = Math.min(...gaps);
  const satisfied = gaps.filter((value) => value >= threshold).length;
  const hardReason = satisfied < gaps.length ? ('RED_GAP_SHORTFALL' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...crossings.map((entry) => entry.crossingTick!)) : null,
    measured: measuredOf(
      objective,
      minimum,
      reds.length,
      satisfied,
      gaps.length - satisfied,
      reds.length,
    ),
    hardReason,
    lateReason: 'RED_GAP_SHORTFALL',
  };
}

function greenLaunch(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const launches = [...facts.signalOpportunities]
    .filter(
      (entry) =>
        entry.phase === 'GREEN' &&
        entry.releaseTick !== null &&
        entry.launchTick !== null &&
        entry.launchAccelerationMps2 !== null,
    )
    .sort(byTick);
  if (launches.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const accelerations = launches.map((entry) => entry.launchAccelerationMps2!);
  const peak = Math.max(...accelerations);
  const satisfied = accelerations.filter((value) => value <= threshold).length;
  const hardReason = satisfied < accelerations.length ? ('GREEN_LAUNCH_TOO_HARD' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...launches.map((entry) => entry.launchTick!)) : null,
    measured: measuredOf(
      objective,
      peak,
      launches.length,
      satisfied,
      accelerations.length - satisfied,
      launches.length,
    ),
    hardReason,
    lateReason: 'GREEN_LAUNCH_TOO_HARD',
  };
}

function obstacleClearance(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const passes = [...facts.hazardPasses].sort(
    (left, right) =>
      left.stimulusTick - right.stimulusTick || compareText(left.hazardId, right.hazardId),
  );
  if (passes.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const satisfied = passes.filter((entry) => entry.minimumClearanceM >= threshold).length;
  const minimum = Math.min(...passes.map((entry) => entry.minimumClearanceM));
  const contact = passes.some((entry) => entry.collisionImpulseNs > 0);
  const hardReason = contact
    ? ('OBSTACLE_CONTACT' as const)
    : satisfied < passes.length
      ? ('CLEARANCE_SHORTFALL' as const)
      : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...passes.map((entry) => entry.stimulusTick)) : null,
    measured: measuredOf(
      objective,
      minimum,
      passes.length,
      satisfied,
      passes.length - satisfied + (contact ? 1 : 0),
      passes.length,
    ),
    hardReason,
    lateReason: 'CLEARANCE_SHORTFALL',
  };
}

function hazardReaction(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const passes = [...facts.hazardPasses].sort(
    (left, right) =>
      left.stimulusTick - right.stimulusTick || compareText(left.hazardId, right.hazardId),
  );
  if (passes.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const missing = passes.filter((entry) => entry.brakeTick === null).length;
  const reactions = passes
    .filter((entry) => entry.brakeTick !== null)
    .map((entry) => entry.brakeTick! - entry.stimulusTick);
  const maximum = reactions.length === 0 ? 0 : Math.max(...reactions);
  const threshold = objective.threshold.value;
  const satisfied = reactions.filter((value) => value <= threshold).length;
  const hardReason =
    missing > 0
      ? ('NO_REACTION' as const)
      : satisfied < reactions.length
        ? ('REACTION_TOO_SLOW' as const)
        : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...passes.map((entry) => entry.brakeTick!)) : null,
    measured: measuredOf(
      objective,
      maximum,
      passes.length,
      satisfied,
      missing + (reactions.length - satisfied),
      passes.length,
    ),
    hardReason,
    lateReason: 'REACTION_TOO_SLOW',
  };
}

function emergencyBrake(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const passes = [...facts.hazardPasses].sort(
    (left, right) =>
      left.stimulusTick - right.stimulusTick || compareText(left.hazardId, right.hazardId),
  );
  if (passes.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const intensities = passes.map((entry) => entry.appliedDecelMps2 / entry.availableDecelMps2);
  const minimum = Math.min(...intensities);
  const satisfied = intensities.filter((value) => value >= threshold).length;
  const late = passes.filter(
    (entry) =>
      entry.stoppedTick === null ||
      entry.requiredStopTick === null ||
      entry.stoppedTick > entry.requiredStopTick,
  ).length;
  const hardReason =
    late > 0
      ? ('STOPPED_TOO_LATE' as const)
      : satisfied < intensities.length
        ? ('BRAKE_TOO_WEAK' as const)
        : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...passes.map((entry) => entry.stoppedTick!)) : null,
    measured: measuredOf(
      objective,
      minimum,
      passes.length,
      satisfied,
      late + (intensities.length - satisfied),
      passes.length,
    ),
    hardReason,
    lateReason: 'BRAKE_TOO_WEAK',
  };
}

function serviceStops(
  facts: ExtendedChallengeFacts,
  kind: 'PICKUP' | 'DROPOFF',
): readonly ExtendedServiceStop[] {
  return [...facts.serviceStops]
    .filter((entry) => entry.kind === kind)
    .sort((left, right) => left.tick - right.tick || compareText(left.stopId, right.stopId));
}

function pickupPrecision(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const stops = serviceStops(facts, 'PICKUP');
  if (stops.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const satisfied = stops.filter((entry) => entry.offsetM <= threshold).length;
  const maximum = Math.max(...stops.map((entry) => entry.offsetM));
  const hardReason = satisfied < stops.length ? ('STOP_OUTSIDE_WINDOW' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick: hardReason === null ? Math.max(...stops.map((entry) => entry.tick)) : null,
    measured: measuredOf(
      objective,
      maximum,
      stops.length,
      satisfied,
      stops.length - satisfied,
      stops.length,
    ),
    hardReason,
    lateReason: 'STOP_OUTSIDE_WINDOW',
  };
}

function pickupDwell(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const stops = serviceStops(facts, 'PICKUP');
  if (stops.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const dwells = stops.map((entry) => entry.departedTick - entry.arrivedTick);
  const minimum = Math.min(...dwells);
  const satisfied = dwells.filter((value) => value >= threshold).length;
  const boardingViolations = stops.filter(
    (entry) => entry.boardedTick === null || entry.boardedTick > entry.departedTick,
  ).length;
  const hardReason =
    boardingViolations > 0
      ? ('LEFT_BEFORE_BOARDING' as const)
      : satisfied < dwells.length
        ? ('DWELL_TOO_SHORT' as const)
        : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick:
      hardReason === null ? Math.max(...stops.map((entry) => entry.departedTick)) : null,
    measured: measuredOf(
      objective,
      minimum,
      stops.length,
      satisfied,
      boardingViolations + (dwells.length - satisfied),
      stops.length,
    ),
    hardReason,
    lateReason: 'DWELL_TOO_SHORT',
  };
}

function dropoffCurb(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  const stops = serviceStops(facts, 'DROPOFF');
  if (stops.length === 0)
    return {
      progress: 0,
      completionTick: null,
      measured: emptyMeasured(objective),
      hardReason: null,
      lateReason: 'NO_OPPORTUNITY',
    };
  const threshold = objective.threshold.value;
  const satisfied = stops.filter((entry) => entry.curbDistanceM <= threshold).length;
  const maximum = Math.max(...stops.map((entry) => entry.curbDistanceM));
  const hardReason = satisfied < stops.length ? ('CURB_TOO_FAR' as const) : null;
  return {
    progress: hardReason === null ? 1 : 0,
    completionTick: hardReason === null ? Math.max(...stops.map((entry) => entry.tick)) : null,
    measured: measuredOf(
      objective,
      maximum,
      stops.length,
      satisfied,
      stops.length - satisfied,
      stops.length,
    ),
    hardReason,
    lateReason: 'CURB_TOO_FAR',
  };
}

function evaluateShape(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): EvaluationShape {
  switch (objective.evaluatorId) {
    case 'pedestrian-yield':
      return crossingSequence(objective, facts);
    case 'pedestrian-clearance':
      return pedestrianClearance(objective, facts);
    case 'crosswalk-approach-speed':
      return crosswalkApproach(objective, facts);
    case 'reroute-patience':
      return reroutePatience(objective, facts);
    case 'u-turn-discipline':
      return uTurnDiscipline(objective, facts);
    case 'reverse-recovery':
      return reverseRecovery(objective, facts);
    case 'red-gap':
      return redGap(objective, facts);
    case 'yellow-decision':
      return yellowStops(objective, facts);
    case 'green-launch':
      return greenLaunch(objective, facts);
    case 'obstacle-clearance':
      return obstacleClearance(objective, facts);
    case 'hazard-reaction':
      return hazardReaction(objective, facts);
    case 'emergency-brake':
      return emergencyBrake(objective, facts);
    case 'pickup-precision':
      return pickupPrecision(objective, facts);
    case 'pickup-dwell':
      return pickupDwell(objective, facts);
    case 'dropoff-curb':
      return dropoffCurb(objective, facts);
  }
}

/** The real opportunity count a per-opportunity objective measures. */
function opportunityCount(
  objective: ExtendedChallengeObjective,
  facts: ExtendedChallengeFacts,
): number | null {
  switch (objective.evaluatorId) {
    case 'pedestrian-yield':
      return facts.pedestrianCrossings.length;
    case 'yellow-decision':
      return facts.signalOpportunities.filter(
        (entry) => entry.phase === 'YELLOW' && entry.feasibleStop,
      ).length;
    case 'u-turn-discipline':
      return facts.routeDecisions.filter((entry) => entry.uTurnPermission === 'PERMITTED').length;
    default:
      return null;
  }
}

const evaluationFields = ['objective', 'facts'] as const;

/**
 * The single pure entry point. Status precedence is fixed: exclusion, incident budget, a hard
 * objective violation, the target before the deadline, the deadline, and finally progress.
 */
export function evaluateExtendedChallenge(value: unknown): ExtendedChallengeVerdict {
  const data = plainFields(value, evaluationFields, 'extended challenge evaluation');
  for (const key of evaluationFields) requireRequired(data, key, 'extended challenge evaluation');
  const objective = parseExtendedChallengeObjective(data.objective);
  const facts = readExtendedChallengeFacts(data.facts);
  if (facts.controlSource !== 'MANUAL')
    return exclusionVerdict(objective, facts, 'CONTROL_NOT_ALLOWED');
  if (facts.sessionKind !== objective.sessionKind)
    return exclusionVerdict(objective, facts, 'SESSION_NOT_ALLOWED');
  const actual = opportunityCount(objective, facts);
  if (actual !== null && actual !== objective.threshold.opportunities)
    return exclusionVerdict(objective, facts, 'OPPORTUNITY_MISMATCH');
  const shape = evaluateShape(objective, facts);
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
  if (facts.endedTick >= objective.deadlineTick)
    return makeVerdict(objective, facts, 'FAILED', shape.lateReason, shape);
  return makeVerdict(objective, facts, 'INCOMPLETE', 'PROGRESS', shape);
}

/* ---------------------------------------------------------------------------------------------
 * Composed catalog and the read-only V1 progress import
 * ------------------------------------------------------------------------------------------- */

export interface ComposedChallengeCatalog {
  readonly version: string;
  readonly units: 'SI';
  /** The delivered 231 catalog, untouched. */
  readonly v1: ChallengeTemplateCatalog;
  /** The 188 extended catalog. */
  readonly extended: ExtendedChallengeCatalog;
  readonly counts: Readonly<{ v1: number; extended: number; total: number }>;
  readonly families: readonly ExtendedChallengeFamily[];
  readonly learningKeys: readonly string[];
}

/**
 * Publishes both halves side by side. The 231 half is the delivered catalog exactly as authored;
 * this function never edits it, it only asserts the two id spaces stay disjoint.
 */
export function createComposedChallengeCatalog(): ComposedChallengeCatalog {
  const v1 = createChallengeTemplateCatalog();
  const extended = createExtendedChallengeCatalog();
  const v1Ids = new Set(v1.templates.map((entry) => entry.templateId));
  for (const challenge of extended.challenges)
    requireContract(
      !v1Ids.has(challenge.challengeId),
      `An extended challenge reuses a 231 template id: ${challenge.challengeId}`,
    );
  return Object.freeze({
    version: '188-composed-challenge-catalog-v1',
    units: 'SI' as const,
    v1,
    extended,
    counts: Object.freeze({
      v1: v1.templates.length,
      extended: extended.challenges.length,
      total: v1.templates.length + extended.challenges.length,
    }),
    families: extendedChallengeFamilies,
    learningKeys: Object.freeze(
      [...new Set(extended.challenges.flatMap((entry) => entry.learningKeys))].sort(compareText),
    ),
  });
}

export interface ExtendedChallengeV1Context {
  readonly version: typeof EXTENDED_CHALLENGE_V1_CONTEXT_VERSION;
  readonly namespace: string;
  readonly completedMissionIds: readonly string[];
  readonly availableMissionIds: readonly string[];
  readonly unlockedCapabilities: readonly string[];
  readonly vehicleClasses: readonly string[];
  readonly progressDigest: string;
  readonly unlocksDigest: string;
  readonly profileWrites: 0;
  readonly learningJobs: 0;
}

function digest(parts: readonly string[]): string {
  return fingerprint(parts);
}

/**
 * Reads a real 125 campaign progress and unlock snapshot without writing anything. The import is
 * pure: it copies and sorts the delivered ids and returns digests, so importing the V1 progress
 * before and after the extended catalog exists is byte-identical by construction. It deliberately
 * exposes no setter and no ledger operation.
 */
export function importV1ProgressContext(
  progressInput: unknown,
  unlocksInput: unknown,
): ExtendedChallengeV1Context {
  const progress = progressInput as CampaignProgress;
  const unlocks = unlocksInput as MissionUnlockSnapshot;
  requireContract(
    typeof progress === 'object' && progress !== null,
    'The V1 progress import needs a real campaign progress',
  );
  requireContract(
    typeof unlocks === 'object' && unlocks !== null,
    'The V1 progress import needs a real unlock snapshot',
  );
  requireContract(
    progress.version === '125-mission-rewards-v1',
    'The V1 progress import needs a 125 campaign progress',
  );
  requireContract(
    unlocks.version === '125-mission-rewards-v1',
    'The V1 progress import needs a 125 unlock snapshot',
  );
  requireContract(
    progress.namespace === unlocks.namespace,
    'The V1 progress import cannot mix two campaign namespaces',
  );
  const completedMissionIds = [
    ...list(progress.completedMissionIds, (entry) =>
      boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'campaign mission'),
    ),
  ].sort(compareText);
  const availableMissionIds = [
    ...list(progress.availableMissionIds, (entry) =>
      boundedId(entry, EXTENDED_CHALLENGE_LIMITS.idCodeUnits, 'campaign mission'),
    ),
  ].sort(compareText);
  const capabilities = list(unlocks.base, (entry) => readUnlockCapability(entry)).concat(
    list(unlocks.capabilities, (entry) => readUnlockCapability(entry)),
  );
  const unlockedCapabilities = capabilities.map((entry) => entry.capabilityId).sort(compareText);
  const vehicleClasses = [
    ...new Set(
      capabilities
        .filter((entry) => entry.kind === 'VEHICLE_CLASS')
        .map((entry) => entry.capabilityId.replace('vehicle-class:', ''))
        .filter((classId) => vehicleClassIds.has(classId)),
    ),
  ].sort(compareText);
  return Object.freeze({
    version: EXTENDED_CHALLENGE_V1_CONTEXT_VERSION,
    namespace: progress.namespace,
    completedMissionIds: Object.freeze(completedMissionIds),
    availableMissionIds: Object.freeze(availableMissionIds),
    unlockedCapabilities: Object.freeze(unlockedCapabilities),
    vehicleClasses: Object.freeze(vehicleClasses),
    progressDigest: digest([
      progress.namespace,
      ...completedMissionIds,
      '|',
      ...availableMissionIds,
    ]),
    unlocksDigest: digest([unlocks.namespace, ...unlockedCapabilities]),
    profileWrites: 0 as const,
    learningJobs: 0 as const,
  });
}

function readUnlockCapability(value: unknown): { capabilityId: string; kind: string } {
  requireContract(
    typeof value === 'object' && value !== null,
    'A V1 unlock capability must be a real 125 capability',
  );
  const data = value as Record<string, unknown>;
  const capabilityId = boundedId(
    data.capabilityId,
    EXTENDED_CHALLENGE_LIMITS.idCodeUnits,
    'unlock capability',
  );
  const kind = choice(data.kind, ['BASE_ACCESS', 'CHALLENGE', 'VEHICLE_CLASS', 'ANALYSIS_TOOL']);
  return { capabilityId, kind };
}
