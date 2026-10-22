import {
  ACCELERATION_ESTIMATOR_KEYS,
  ACCELERATION_ESTIMATOR_VERSION,
  FOLLOWING_ESTIMATOR_KEYS,
  FOLLOWING_ESTIMATOR_VERSION,
  LANE_ESTIMATOR_KEYS,
  LANE_ESTIMATOR_VERSION,
  PARAMETER_EVIDENCE_VERSION,
  SIGNAL_ESTIMATOR_KEYS,
  SIGNAL_ESTIMATOR_VERSION,
  SPEED_ESTIMATOR_KEYS,
  SPEED_ESTIMATOR_VERSION,
  STOP_YIELD_ESTIMATOR_KEYS,
  STOP_YIELD_ESTIMATOR_VERSION,
  evidenceChannels,
  parameterEvidenceSpecs,
} from '../learning';
import type { EvidenceChannel, EstimatorOwner, ParameterEvidenceSpec } from '../learning';
import { parameterDefinitions } from '../profiles';
import type { ParameterKey } from '../profiles';
import { OPPORTUNITY_VERSION, opportunityKinds } from '../telemetry';
import type { OpportunityKind } from '../telemetry';
import { evaluateInverseLearning, INVERSE_LEARNING_VERSION } from './inverse-learning';
import type { InverseScenarioResult } from './inverse-learning';
import { evaluateLearningEdgeCases, LEARNING_EDGECASES_VERSION } from './learning-edgecases';
import type { LearningEdgeCaseResult } from './learning-edgecases';

/**
 * 108 V1 gate: it only reads the real 092/093/086/094–099/105/107 exports and derives a coverage
 * matrix from them. It never validates a key by construction, never estimates, never publishes and
 * never writes a profile, store or fleet value.
 */
export const LEARNING_GATE24_VERSION = '108-learning-gate24-v1' as const;

/** Closed reasons a key can remain unvalidated. */
export const learningGate24Reasons = [
  'NO_ESTIMATOR',
  'NO_EVIDENCE_SPEC',
  'NO_OPPORTUNITY',
  'NO_SCENARIO',
  'SCENARIO_FAILED',
  'NO_EDGE_CASE',
  'DUPLICATE_OWNER',
] as const;
export type LearningGate24Reason = (typeof learningGate24Reasons)[number];

/** Report-level matrix defects; they always keep the gate OPEN. */
export const learningGate24MatrixErrors = [
  'M_KEY_SET_MISMATCH',
  'DUPLICATE_M_KEY',
  'FOREIGN_KEY',
] as const;
export type LearningGate24MatrixError = (typeof learningGate24MatrixErrors)[number];

export const learningGate24OpportunityRoles = ['DEDICATED', 'CARRIER'] as const;
export type LearningGate24OpportunityRole = (typeof learningGate24OpportunityRoles)[number];

export const gateProfileIds = ['PRUDENT', 'IMPULSIVE', 'RECKLESS', 'MIXED'] as const;
export type GateProfileId = (typeof gateProfileIds)[number];

/** The 092 `initial_learning_target` set. R/`extension` keys never enter the gate. */
export const learningGate24MKeys: readonly ParameterKey[] = Object.freeze(
  parameterDefinitions
    .filter((definition) => definition.implementationStage === 'initial_learning_target')
    .map((definition) => definition.key as ParameterKey),
);

const registryMKeySet = new Set<string>(learningGate24MKeys);

export interface GateEstimatorKeySet {
  readonly owner: EstimatorOwner;
  readonly keys: readonly string[];
}

/** Real 094–099 key ownership, copied from the estimator modules themselves. */
export const gateEstimatorKeySets: readonly GateEstimatorKeySet[] = Object.freeze([
  Object.freeze({ owner: '094', keys: Object.freeze([...SPEED_ESTIMATOR_KEYS]) }),
  Object.freeze({ owner: '095', keys: Object.freeze([...ACCELERATION_ESTIMATOR_KEYS]) }),
  Object.freeze({ owner: '096', keys: Object.freeze([...FOLLOWING_ESTIMATOR_KEYS]) }),
  Object.freeze({ owner: '097', keys: Object.freeze([...SIGNAL_ESTIMATOR_KEYS]) }),
  Object.freeze({ owner: '098', keys: Object.freeze([...STOP_YIELD_ESTIMATOR_KEYS]) }),
  Object.freeze({ owner: '099', keys: Object.freeze([...LANE_ESTIMATOR_KEYS]) }),
]);

export interface GateOpportunity {
  readonly kind: OpportunityKind;
  readonly role: LearningGate24OpportunityRole;
}

export interface GateScenarioRow {
  readonly scenarioId: string;
  readonly profileId: GateProfileId;
  readonly status: string;
  readonly estimate: number | null;
  readonly interval: readonly [number, number] | null;
  readonly tolerance: number;
  readonly withinTolerance: boolean;
}

export interface LearningGate24Row {
  readonly key: ParameterKey;
  readonly implementationStage: 'initial_learning_target';
  readonly implemented: boolean;
  readonly estimable: boolean;
  readonly unit: string;
  readonly estimatorOwner: EstimatorOwner | null;
  readonly estimatorOwners: readonly EstimatorOwner[];
  readonly channel: EvidenceChannel | null;
  readonly contexts: readonly string[];
  readonly opportunities: readonly GateOpportunity[];
  readonly opportunityRole: LearningGate24OpportunityRole | null;
  readonly scenarios: readonly GateScenarioRow[];
  readonly scenariosWithinTolerance: number;
  readonly edgeCaseIds: readonly string[];
  readonly edgeCaseContexts: readonly string[];
  readonly validated: boolean;
  readonly reasons: readonly LearningGate24Reason[];
}

export interface LearningGate24Unvalidated {
  readonly key: ParameterKey;
  readonly reasons: readonly LearningGate24Reason[];
}

export interface LearningGate24Counts {
  readonly registryMKeys: number;
  readonly matrixRows: number;
  readonly validated: number;
  readonly unvalidated: number;
  readonly estimatorOwners: number;
  readonly dedicatedKeys: number;
  readonly carrierKeys: number;
  readonly dedicatedOpportunities: number;
  readonly carrierOpportunities: number;
  readonly channels: number;
  readonly contexts: number;
  readonly scenarioResults: number;
  readonly edgeCases: number;
}

export interface LearningGate24Sources {
  readonly registryKeys: number;
  readonly evidence: typeof PARAMETER_EVIDENCE_VERSION;
  readonly opportunities: typeof OPPORTUNITY_VERSION;
  readonly inverse: typeof INVERSE_LEARNING_VERSION;
  readonly edgecases: typeof LEARNING_EDGECASES_VERSION;
  readonly estimators: readonly string[];
}

export interface LearningGate24Report {
  readonly version: typeof LEARNING_GATE24_VERSION;
  readonly gateStatus: 'OPEN' | 'CLOSED';
  readonly sources: LearningGate24Sources;
  readonly mKeySetMatches092: boolean;
  readonly matrix: readonly LearningGate24Row[];
  readonly counts: LearningGate24Counts;
  readonly dedicatedKeys: readonly ParameterKey[];
  readonly carrierKeys: readonly ParameterKey[];
  readonly unvalidated: readonly LearningGate24Unvalidated[];
  readonly duplicateMKeys: readonly string[];
  readonly foreignKeys: readonly string[];
  readonly matrixErrors: readonly LearningGate24MatrixError[];
  /** The harness has no publication/store/fleet path; the zeros are asserted, not assumed. */
  readonly effects: Readonly<{
    profilePublications: 0;
    storeWrites: 0;
    fleetMutations: 0;
  }>;
  readonly signature: string;
}

export interface LearningGate24Input {
  /** Defaults to the real 092 M-key list; an injected list is reported against that same list. */
  readonly mKeys?: readonly string[];
  /** Defaults to the real 094–099 key sets. */
  readonly estimatorKeySets?: readonly GateEstimatorKeySet[];
  /** Defaults to the real 093 specs. */
  readonly evidenceSpecs?: readonly ParameterEvidenceSpec[];
  /** Defaults to the real 086 kind vocabulary. */
  readonly opportunityKinds?: readonly string[];
  /** Defaults to the real 105 report scenarios. Only PROFILE_* rows are used. */
  readonly inverseScenarios?: readonly InverseScenarioResult[];
  /** Defaults to the real 107 report cases. Only PASS positive cases cover a context. */
  readonly edgeCases?: readonly LearningEdgeCaseResult[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as unknown as Record<string, unknown>))
      deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function uniquePreserving<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Dedicated kinds are the 086 opportunities that exist for that signal/stop/lane decision.
 * The 086 vocabulary has no free-flow or following kind, so speed/acceleration/following keys are
 * explicitly carried by GREEN (and STOP for queue standstill) rather than pretending to be dedicated.
 */
function opportunitiesFor(
  key: string,
  owner: EstimatorOwner | null,
  channel: EvidenceChannel | null,
  allowedKinds: ReadonlySet<string>,
): readonly GateOpportunity[] {
  if (owner === null) return Object.freeze([]);
  let kinds: readonly OpportunityKind[];
  let role: LearningGate24OpportunityRole;
  if (owner === '097') {
    kinds = channel === 'GREEN_START_DELAY' ? ['GREEN'] : ['RED'];
    role = 'DEDICATED';
  } else if (owner === '098') {
    kinds = key === 'yield_time_gap' ? ['YIELD'] : ['STOP'];
    role = 'DEDICATED';
  } else if (owner === '099') {
    kinds = ['LANE_CHANGE'];
    role = 'DEDICATED';
  } else if (owner === '096') {
    kinds = ['GREEN', 'STOP'];
    role = 'CARRIER';
  } else {
    kinds = ['GREEN'];
    role = 'CARRIER';
  }
  return Object.freeze(
    kinds.filter((kind) => allowedKinds.has(kind)).map((kind) => Object.freeze({ kind, role })),
  );
}

function scenarioRowsFor(
  key: string,
  scenarios: readonly InverseScenarioResult[],
): readonly GateScenarioRow[] {
  const rows: GateScenarioRow[] = [];
  for (const profileId of gateProfileIds) {
    const scenario = scenarios.find(
      (entry) => entry.kind === 'PROFILE' && entry.profileId === profileId,
    );
    const result = scenario?.results.find((entry) => entry.key === key);
    if (!scenario || !result) continue;
    rows.push(
      Object.freeze({
        scenarioId: scenario.scenarioId,
        profileId,
        status: result.status,
        estimate: result.estimate,
        interval: result.interval,
        tolerance: result.tolerance.effective,
        withinTolerance: result.status === 'WITHIN_TOLERANCE',
      }),
    );
  }
  return Object.freeze(rows);
}

function edgeCaseCoverageFor(
  contexts: readonly string[],
  cases: readonly LearningEdgeCaseResult[],
): Readonly<{ ids: readonly string[]; contexts: readonly string[] }> {
  const positive = cases.filter((entry) => entry.kind === 'POSITIVE' && entry.status === 'PASS');
  const ids: string[] = [];
  const covered: string[] = [];
  for (const context of contexts) {
    const covering = positive.filter((entry) =>
      [...entry.contextsObserved].some((observed) => observed === context),
    );
    if (covering.length === 0) continue;
    covered.push(context);
    for (const entry of covering) ids.push(entry.caseId);
  }
  return Object.freeze({
    ids: Object.freeze(uniquePreserving(ids)),
    contexts: Object.freeze(uniquePreserving(covered)),
  });
}

/**
 * Builds the frozen coverage matrix. Missing or failed evidence keeps a key unvalidated with closed
 * reasons; the gate is derived from the rows and the matrix errors, never forced closed.
 */
export function evaluateLearningGate24(input: LearningGate24Input = {}): LearningGate24Report {
  const effectiveMKeys = input.mKeys ?? learningGate24MKeys;
  const estimatorKeySets = input.estimatorKeySets ?? gateEstimatorKeySets;
  const evidenceSpecs = input.evidenceSpecs ?? parameterEvidenceSpecs;
  const allowedKinds = new Set<string>(input.opportunityKinds ?? opportunityKinds);
  const inverseScenarios = input.inverseScenarios ?? evaluateInverseLearning().scenarios;
  const edgeCases = input.edgeCases ?? evaluateLearningEdgeCases().cases;

  const ownersByKey = new Map<string, EstimatorOwner[]>();
  for (const keySet of estimatorKeySets) {
    for (const key of keySet.keys) {
      const owners = ownersByKey.get(key) ?? [];
      if (!owners.includes(keySet.owner)) owners.push(keySet.owner);
      ownersByKey.set(key, owners);
    }
  }
  const specByKey = new Map<string, ParameterEvidenceSpec>();
  for (const spec of evidenceSpecs) specByKey.set(spec.key, spec);
  const definitionByKey = new Map(
    parameterDefinitions.map((definition) => [definition.key, definition]),
  );

  const mKeys = uniquePreserving(effectiveMKeys);
  const duplicateMKeys = Object.freeze(
    uniquePreserving(effectiveMKeys.filter((key, index) => effectiveMKeys.indexOf(key) !== index)),
  );
  const mKeySetMatches092 =
    effectiveMKeys.length === learningGate24MKeys.length &&
    new Set(effectiveMKeys).size === effectiveMKeys.length &&
    effectiveMKeys.every((key) => registryMKeySet.has(key));
  const foreignKeys = Object.freeze(
    uniquePreserving(
      [
        ...effectiveMKeys,
        ...estimatorKeySets.flatMap((entry) => [...entry.keys]),
        ...evidenceSpecs.map((entry) => entry.key),
      ].filter((key) => !registryMKeySet.has(key)),
    ),
  );

  const matrix: LearningGate24Row[] = mKeys.map((key) => {
    const definition = definitionByKey.get(key);
    const owners = ownersByKey.get(key) ?? [];
    const owner = owners.length > 0 ? owners[0]! : null;
    const spec = specByKey.get(key) ?? null;
    const reasons: LearningGate24Reason[] = [];
    if (owners.length === 0) reasons.push('NO_ESTIMATOR');
    if (owners.length > 1) reasons.push('DUPLICATE_OWNER');
    const specValid =
      spec !== null && evidenceChannels.includes(spec.channel) && spec.contexts.length > 0;
    if (!specValid) reasons.push('NO_EVIDENCE_SPEC');
    const opportunities = opportunitiesFor(key, owner, spec?.channel ?? null, allowedKinds);
    if (owner !== null && opportunities.length === 0) reasons.push('NO_OPPORTUNITY');
    const scenarios = scenarioRowsFor(key, inverseScenarios);
    const scenariosWithinTolerance = scenarios.filter((row) => row.withinTolerance).length;
    if (scenarios.length === 0) reasons.push('NO_SCENARIO');
    else if (
      scenarios.length !== gateProfileIds.length ||
      scenariosWithinTolerance !== gateProfileIds.length
    )
      reasons.push('SCENARIO_FAILED');
    const edge = specValid
      ? edgeCaseCoverageFor(spec.contexts, edgeCases)
      : Object.freeze({ ids: Object.freeze([]), contexts: Object.freeze([]) });
    if (specValid && edge.contexts.length !== spec.contexts.length) reasons.push('NO_EDGE_CASE');
    const orderedReasons = Object.freeze(
      learningGate24Reasons.filter((reason) => reasons.includes(reason)),
    );
    return Object.freeze({
      key: key as ParameterKey,
      implementationStage: 'initial_learning_target' as const,
      implemented: definition?.implemented ?? false,
      estimable: definition?.estimable ?? false,
      unit: spec?.unit ?? definition?.unit ?? 'UNKNOWN',
      estimatorOwner: owner,
      estimatorOwners: Object.freeze([...owners]),
      channel: spec?.channel ?? null,
      contexts: Object.freeze([...(spec?.contexts ?? [])]),
      opportunities,
      opportunityRole: opportunities[0]?.role ?? null,
      scenarios,
      scenariosWithinTolerance,
      edgeCaseIds: edge.ids,
      edgeCaseContexts: edge.contexts,
      validated: orderedReasons.length === 0,
      reasons: orderedReasons,
    });
  });

  const matrixErrors: LearningGate24MatrixError[] = [];
  if (!mKeySetMatches092) matrixErrors.push('M_KEY_SET_MISMATCH');
  if (duplicateMKeys.length > 0) matrixErrors.push('DUPLICATE_M_KEY');
  if (foreignKeys.length > 0) matrixErrors.push('FOREIGN_KEY');

  const unvalidated = Object.freeze(
    matrix
      .filter((row) => !row.validated)
      .map((row) => Object.freeze({ key: row.key, reasons: row.reasons })),
  );
  const gateStatus: 'OPEN' | 'CLOSED' =
    matrix.length > 0 && matrixErrors.length === 0 && unvalidated.length === 0 ? 'CLOSED' : 'OPEN';
  const dedicatedKeys = Object.freeze(
    matrix.filter((row) => row.opportunityRole === 'DEDICATED').map((row) => row.key),
  );
  const carrierKeys = Object.freeze(
    matrix.filter((row) => row.opportunityRole === 'CARRIER').map((row) => row.key),
  );
  const allOpportunities = matrix.flatMap((row) => [...row.opportunities]);
  const counts: LearningGate24Counts = Object.freeze({
    registryMKeys: learningGate24MKeys.length,
    matrixRows: matrix.length,
    validated: matrix.filter((row) => row.validated).length,
    unvalidated: unvalidated.length,
    estimatorOwners: new Set(matrix.flatMap((row) => [...row.estimatorOwners])).size,
    dedicatedKeys: dedicatedKeys.length,
    carrierKeys: carrierKeys.length,
    dedicatedOpportunities: allOpportunities.filter((entry) => entry.role === 'DEDICATED').length,
    carrierOpportunities: allOpportunities.filter((entry) => entry.role === 'CARRIER').length,
    channels: new Set(matrix.flatMap((row) => (row.channel === null ? [] : [row.channel]))).size,
    contexts: new Set(matrix.flatMap((row) => [...row.contexts])).size,
    scenarioResults: matrix.reduce((total, row) => total + row.scenarios.length, 0),
    edgeCases: edgeCases.length,
  });
  const sources: LearningGate24Sources = Object.freeze({
    registryKeys: learningGate24MKeys.length,
    evidence: PARAMETER_EVIDENCE_VERSION,
    opportunities: OPPORTUNITY_VERSION,
    inverse: INVERSE_LEARNING_VERSION,
    edgecases: LEARNING_EDGECASES_VERSION,
    estimators: Object.freeze([
      SPEED_ESTIMATOR_VERSION,
      ACCELERATION_ESTIMATOR_VERSION,
      FOLLOWING_ESTIMATOR_VERSION,
      SIGNAL_ESTIMATOR_VERSION,
      STOP_YIELD_ESTIMATOR_VERSION,
      LANE_ESTIMATOR_VERSION,
    ]),
  });
  const core = {
    version: LEARNING_GATE24_VERSION,
    gateStatus,
    sources,
    mKeySetMatches092,
    matrix,
    counts,
    dedicatedKeys,
    carrierKeys,
    unvalidated,
    duplicateMKeys,
    foreignKeys,
    matrixErrors: Object.freeze(matrixErrors),
    effects: Object.freeze({
      profilePublications: 0 as const,
      storeWrites: 0 as const,
      fleetMutations: 0 as const,
    }),
  };
  return deepFreeze({
    ...core,
    signature: `fnv1a64:${fnv1a64(canonical(core))}`,
  });
}
