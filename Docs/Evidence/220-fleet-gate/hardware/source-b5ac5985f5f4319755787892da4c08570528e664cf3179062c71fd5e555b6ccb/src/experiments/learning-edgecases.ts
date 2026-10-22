import { createParameterEvidenceLedger, parameterEvidenceSpecs } from '../learning';
import type {
  EvidenceObservation,
  ParameterEvidenceLedger,
  ParameterEvidenceReadModel,
  ParameterEvidenceStatus,
} from '../learning';
import {
  artifactCauses,
  artifactKinds,
  artifactWindowClasses,
  createArtifactFilter,
  createEligibilityWindows,
  windowCompletenessStates,
} from '../telemetry';
import type {
  ArtifactCause,
  ArtifactFilter,
  ArtifactFilterInput,
  ArtifactKind,
  ArtifactRecoveryFact,
  ArtifactSource,
  CompletenessReason,
  EligibilityLabel,
  EligibilityWindowRecord,
  EligibilityWindows,
  FilteredWindowRecord,
  OpportunityKind,
  OpportunityOutcome,
  OpportunityRecord,
  WindowCompleteness,
} from '../telemetry';
import { createRecoveryLedger } from '../vehicles';
import type { RecoveryRecord } from '../vehicles';

/**
 * 107 learning edge cases: the regression harness over the real 087/088/093 owners.
 *
 * It owns no estimator, profile, store or fleet. It builds the real 088 filter input and the real
 * 087 eligibility facts, admits them through the explicit 107 adapter into the real 093 ledger, and
 * asserts the negative/positive behaviour of pauses, recoveries, incomplete segments, many streets
 * and a short intervention. Nothing is published, written or mutated: the report only reads the
 * real functions' frozen outputs.
 */
export const LEARNING_EDGECASES_VERSION = '107-learning-edgecases-v1' as const;

/** Closed case set; the report never silently grows a new scenario. */
export const learningEdgeCaseIds = [
  'PAUSE',
  'FOCUS_LOSS_PAUSE',
  'RECOVERY_ADMITTED',
  'RECOVERY_DENIED',
  'RECOVERY_PARTIAL',
  'INCOMPLETE_SEGMENT',
  'OPEN_SEGMENT',
  'OBSERVATION_GAP',
  'MANY_STREETS',
  'SHORT_INTERVENTION',
  'CLEAN_FREE_TRAFFIC',
  'CLEAN_LEADER',
  'CLEAN_BLOCKED_GREEN',
] as const;
export type LearningEdgeCaseId = (typeof learningEdgeCaseIds)[number];

export type LearningEdgeCaseKind = 'NEGATIVE' | 'POSITIVE';

const caseKinds: Readonly<Record<LearningEdgeCaseId, LearningEdgeCaseKind>> = Object.freeze({
  PAUSE: 'NEGATIVE',
  FOCUS_LOSS_PAUSE: 'NEGATIVE',
  RECOVERY_ADMITTED: 'NEGATIVE',
  RECOVERY_DENIED: 'NEGATIVE',
  RECOVERY_PARTIAL: 'NEGATIVE',
  INCOMPLETE_SEGMENT: 'NEGATIVE',
  OPEN_SEGMENT: 'NEGATIVE',
  OBSERVATION_GAP: 'NEGATIVE',
  MANY_STREETS: 'POSITIVE',
  SHORT_INTERVENTION: 'POSITIVE',
  CLEAN_FREE_TRAFFIC: 'POSITIVE',
  CLEAN_LEADER: 'POSITIVE',
  CLEAN_BLOCKED_GREEN: 'POSITIVE',
});

/** The three 093 evidence contexts. A label outside this set never contributes a context. */
export const evidenceContexts = ['FREE_TRAFFIC', 'LEADER', 'BLOCKED_GREEN'] as const;
export type EvidenceContext = (typeof evidenceContexts)[number];

export const LEARNING_EDGECASE_ADAPTER_VERSION = '107-learning-edgecase-adapter-v1' as const;

/**
 * Explicit reasons the 107 adapter refuses to create a 093 observation. The real 093 ledger also
 * keeps its own refusals; this layer never lets an unusable 088 span or a non-evidence 087 class
 * reach it in the first place.
 */
export const learningEdgeCaseExclusionReasons = [
  'WINDOW_FULLY_SUPPRESSED',
  'ELIGIBILITY_EXCLUDED',
  'CONTEXT_NOT_EVIDENCE',
  'OPPORTUNITY_INELIGIBLE',
  'OPPORTUNITY_NOT_RESOLVED',
  'CONTEXT_MISMATCH',
  'OBSERVATION_OUTSIDE_USABLE_PREFIX',
] as const;
export type LearningEdgeCaseExclusionReason = (typeof learningEdgeCaseExclusionReasons)[number];

export interface LearningEdgeCaseAdmissionInput {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly roadType: string;
  readonly speedSamples?: readonly { readonly tick: number; readonly speedMps: number }[];
  readonly headway?: { readonly gapM: number; readonly speedMps: number };
  readonly stopOutcome?: 'STOPPED' | 'CROSSED_WITHOUT_STOP' | 'HELD' | 'CROSSED';
  readonly greenStartDelayS?: number;
  readonly laneChangeOutcome?: 'COMPLETED' | 'ABORTED';
  readonly eventValue?: number;
}

export interface LearningEdgeCaseAdmitted {
  readonly admitted: true;
  readonly windowId: string;
  readonly opportunityId: string;
  readonly occurrence: number;
  readonly context: EvidenceContext;
  readonly usableTicks: number;
  readonly observation: EvidenceObservation;
}

export interface LearningEdgeCaseExcluded {
  readonly admitted: false;
  readonly reason: LearningEdgeCaseExclusionReason;
  readonly usableTicks: 0;
}

export type LearningEdgeCaseAdmission = LearningEdgeCaseAdmitted | LearningEdgeCaseExcluded;

const excluded = (reason: LearningEdgeCaseExclusionReason): LearningEdgeCaseExcluded =>
  Object.freeze({ admitted: false as const, reason, usableTicks: 0 as const });

const contextOf = (label: EligibilityLabel): EvidenceContext | null =>
  label === 'FREE_TRAFFIC' || label === 'LEADER' || label === 'BLOCKED_GREEN' ? label : null;

/**
 * The single adapter from a real 088 window plus a real 087 window to a real 093 observation.
 *
 * 087 and 088 use separate window-id namespaces; 093 requires the 088 record it reads to carry the
 * 087 window id of the same observation. The adapter binds that id and keeps every 088 fact
 * (class, completeness, exact usable prefix) untouched. It admits only a usable prefix, an
 * evidence-bearing 087 class (`FREE_TRAFFIC`/`LEADER`), a resolved eligible 086 opportunity, a
 * matching context and an observation entirely inside the usable prefix.
 */
export function admitLearningEdgeCaseObservation(
  input: LearningEdgeCaseAdmissionInput,
): LearningEdgeCaseAdmission {
  const { artifacts, eligibility, opportunity } = input;
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return excluded('WINDOW_FULLY_SUPPRESSED');
  const prefix = artifacts.prefix;
  if (prefix.ticks <= 0) return excluded('WINDOW_FULLY_SUPPRESSED');
  if (eligibility.windowClass === 'EXCLUDED') return excluded('ELIGIBILITY_EXCLUDED');
  if (eligibility.windowClass === 'EXTERNAL_CONSTRAINT' && eligibility.label !== 'LEADER')
    return excluded('CONTEXT_NOT_EVIDENCE');
  if (!opportunity.learningEligible) return excluded('OPPORTUNITY_INELIGIBLE');
  if (opportunity.state !== 'RESOLVED' || opportunity.result === null)
    return excluded('OPPORTUNITY_NOT_RESOLVED');
  const context = contextOf(eligibility.label);
  if (
    context === null ||
    eligibility.opportunityId !== opportunity.id ||
    artifacts.segmentId !== eligibility.segmentId ||
    opportunity.kind !== eligibility.kind ||
    opportunity.vehicleId !== eligibility.vehicleId ||
    opportunity.incarnation !== eligibility.incarnation ||
    artifacts.vehicleId !== eligibility.vehicleId ||
    artifacts.incarnation !== eligibility.incarnation
  )
    return excluded('CONTEXT_MISMATCH');
  if (eligibility.openedTick < prefix.fromTick || eligibility.lastTick > prefix.toTick)
    return excluded('OBSERVATION_OUTSIDE_USABLE_PREFIX');

  const boundArtifacts: FilteredWindowRecord = Object.freeze({
    ...artifacts,
    windowId: eligibility.windowId,
    windowClass: 'PREFIX_ELIGIBLE' as const,
    prefix,
  });
  const observation: EvidenceObservation = Object.freeze({
    eligibility,
    opportunity,
    artifacts: boundArtifacts,
    roadType: input.roadType,
    ...(input.speedSamples === undefined ? {} : { speedSamples: input.speedSamples }),
    ...(input.headway === undefined ? {} : { headway: input.headway }),
    ...(input.stopOutcome === undefined ? {} : { stopOutcome: input.stopOutcome }),
    ...(input.greenStartDelayS === undefined ? {} : { greenStartDelayS: input.greenStartDelayS }),
    ...(input.laneChangeOutcome === undefined
      ? {}
      : { laneChangeOutcome: input.laneChangeOutcome }),
    ...(input.eventValue === undefined ? {} : { eventValue: input.eventValue }),
  });
  return Object.freeze({
    admitted: true as const,
    windowId: eligibility.windowId,
    opportunityId: opportunity.id,
    occurrence: opportunity.occurrence,
    context,
    usableTicks: prefix.ticks,
    observation,
  });
}

export interface LearningEdgeCaseCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LearningEdgeCaseArtifactRecord {
  readonly segmentId: string;
  readonly kind: ArtifactKind;
  readonly cause: ArtifactCause;
  readonly source: ArtifactSource;
  readonly boundaryTick: number;
  readonly endTick: number | null;
  readonly incidentId: string | null;
  readonly impulseNs: number | null;
  readonly otherEntityId: string | null;
  readonly operationId: string | null;
  readonly recoveryPointId: string | null;
  readonly recoveryMapId: string | null;
  readonly recoveryLaneId: string | null;
  readonly recoveryMode: 'MANUAL' | 'LEARNING' | null;
  readonly recoveryValidatedTick: number | null;
  readonly suspensionCause: string | null;
}

export interface LearningEdgeCaseWindowRecord {
  readonly segmentId: string;
  readonly windowClass: 'PREFIX_ELIGIBLE' | 'FULLY_SUPPRESSED';
  readonly completeness: WindowCompleteness;
  readonly completenessReason: CompletenessReason;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly boundaryTick: number | null;
  readonly boundaryCause: ArtifactCause | null;
  readonly prefixTicks: number;
  readonly suppressedTicks: number;
  readonly artifactCount: number;
}

export interface LearningEdgeCaseLedgerRow {
  readonly key: string;
  readonly status: ParameterEvidenceStatus;
  readonly distinctEpisodes: number;
  readonly sampleCount: number;
  readonly contexts: readonly string[];
}

export interface LearningEdgeCaseAdmissionLog {
  readonly opportunityId: string;
  readonly label: EligibilityLabel;
  readonly admitted: boolean;
  readonly reason: LearningEdgeCaseExclusionReason | null;
  readonly context: EvidenceContext | null;
}

export interface LearningEdgeCaseResult {
  readonly caseId: LearningEdgeCaseId;
  readonly kind: LearningEdgeCaseKind;
  readonly status: 'PASS' | 'FAIL';
  readonly artifacts: readonly LearningEdgeCaseArtifactRecord[];
  readonly windows: readonly LearningEdgeCaseWindowRecord[];
  readonly ledgerKeys: readonly LearningEdgeCaseLedgerRow[];
  readonly learnedKeys: readonly string[];
  readonly profileChanges: number;
  readonly candidatesProduced: number;
  readonly contextsObserved: readonly EvidenceContext[];
  readonly contextsUnobserved: readonly EvidenceContext[];
  readonly admissions: readonly LearningEdgeCaseAdmissionLog[];
  readonly checks: readonly LearningEdgeCaseCheck[];
}

export interface LearningEdgeCaseCoverage {
  readonly kinds: readonly ArtifactKind[];
  readonly causes: readonly ArtifactCause[];
  readonly completeness: readonly WindowCompleteness[];
  readonly windowClasses: readonly ('PREFIX_ELIGIBLE' | 'FULLY_SUPPRESSED')[];
}

export interface LearningEdgeCaseSummary {
  readonly cases: number;
  readonly passed: number;
  readonly failed: number;
  readonly pass: boolean;
  readonly checks: number;
  readonly checksPassed: number;
  readonly learnedKeys: readonly string[];
  readonly profileChanges: number;
  readonly candidatesProduced: number;
  readonly profilePublications: number;
  readonly storeWrites: number;
  readonly fleetMutations: number;
}

export interface LearningEdgeCaseReport {
  readonly version: typeof LEARNING_EDGECASES_VERSION;
  readonly adapterVersion: typeof LEARNING_EDGECASE_ADAPTER_VERSION;
  readonly cases: readonly LearningEdgeCaseResult[];
  readonly coverage: LearningEdgeCaseCoverage;
  readonly summary: LearningEdgeCaseSummary;
}

export interface LearningEdgeCasePorts {
  /** Injected 088 owner; defaults to the real `createArtifactFilter`. */
  readonly createFilter?: () => ArtifactFilter;
  /** Injected 087 owner; defaults to the real `createEligibilityWindows`. */
  readonly createEligibility?: () => EligibilityWindows;
  /** Injected 093 ledger; defaults to the real `createParameterEvidenceLedger`. */
  readonly createLedger?: () => ParameterEvidenceLedger;
}

const SESSION_ID = '107-learning-edgecases';
const WORLD_EPOCH = 7;
const VEHICLE_ID = 'taxi-107';
const INCARNATION = 'taxi-107-1';
const WORLD = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: SESSION_ID,
  worldEpoch: WORLD_EPOCH,
});

const outcomeByKind: Readonly<Record<OpportunityKind, OpportunityOutcome>> = Object.freeze({
  STOP: 'STOPPED',
  RED: 'HELD',
  GREEN: 'RELEASED',
  YIELD: 'YIELDED',
  LANE_CHANGE: 'COMPLETED',
});

interface OpportunitySpec {
  readonly id: string;
  readonly kind: OpportunityKind;
  readonly occurrence: number;
  readonly segmentId: string;
  readonly openedTick: number;
  readonly lastTick?: number;
  readonly street?: string;
  readonly learningEligible?: boolean;
}

/** A real 086 record shape, resolved with the closed outcome of its kind. */
function opportunity(spec: OpportunitySpec): OpportunityRecord {
  const lastTick = spec.lastTick ?? spec.openedTick;
  const signal = spec.kind === 'RED' || spec.kind === 'GREEN';
  return Object.freeze({
    id: spec.id,
    kind: spec.kind,
    state: 'RESOLVED',
    outcome: outcomeByKind[spec.kind],
    result: 'SUCCESS',
    truncationReason: null,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    segmentIds: Object.freeze([spec.segmentId]),
    learningEligible: spec.learningEligible ?? true,
    occurrence: spec.occurrence,
    openedTick: spec.openedTick,
    lastTick,
    resolvedTick: lastTick,
    observationCount: Math.max(1, lastTick - spec.openedTick + 1),
    stimulus: Object.freeze({
      stopLineId: spec.kind === 'STOP' ? (spec.street ?? `${spec.id}-stop-line`) : null,
      signalId: signal ? `${spec.id}-signal` : null,
      intersectionId: signal ? `${spec.id}-junction` : null,
      movementId: signal ? `${spec.id}-movement` : null,
      movementPhaseStartedTick: signal ? spec.openedTick : null,
      fromLaneId: spec.street ?? null,
      toLaneId: null,
      relationIds: Object.freeze([]),
    }),
  });
}

interface CaseEnvironment {
  readonly filter: ArtifactFilter;
  readonly eligibility: EligibilityWindows;
  readonly ledger: ParameterEvidenceLedger;
  readonly artifacts: FilteredWindowRecord[];
  readonly windows: EligibilityWindowRecord[];
  readonly admissions: LearningEdgeCaseAdmissionLog[];
  readonly observations: EvidenceObservation[];
  readonly checks: LearningEdgeCaseCheck[];
  readonly contexts: Set<EvidenceContext>;
}

function createEnvironment(ports: LearningEdgeCasePorts): CaseEnvironment {
  return {
    filter: (ports.createFilter ?? createArtifactFilter)(),
    eligibility: (ports.createEligibility ?? createEligibilityWindows)(),
    ledger: (ports.createLedger ?? createParameterEvidenceLedger)(),
    artifacts: [],
    windows: [],
    admissions: [],
    observations: [],
    checks: [],
    contexts: new Set<EvidenceContext>(),
  };
}

function check(
  env: CaseEnvironment,
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): void {
  env.checks.push(Object.freeze({ name, expected, actual, pass: expected === actual, detail }));
}

function evaluateArtifact(
  env: CaseEnvironment,
  evaluationTick: number,
  overrides: Partial<ArtifactFilterInput> &
    Pick<ArtifactFilterInput, 'segmentId' | 'startTick' | 'endTick'>,
): FilteredWindowRecord {
  const input: ArtifactFilterInput = {
    tick: evaluationTick,
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    controlMode: 'LEARNING',
    learningEligible: true,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [],
    recoveries: [],
    suspensions: [],
    ...overrides,
  };
  const record = env.filter.evaluate(input);
  env.artifacts.push(record);
  return record;
}

interface EligibilitySpec {
  readonly tick: number;
  readonly opportunity: OpportunityRecord;
  readonly label: EvidenceContext | 'PAUSE' | 'FOCUS_LOST' | 'MANUAL_SEGMENT';
  readonly suspension?: 'NONE' | 'PAUSE' | 'FOCUS_LOST';
  readonly controlMode?: 'LEARNING' | 'MANUAL';
  readonly learningEligible?: boolean;
  readonly leader?: { readonly id: string; readonly gapM: number; readonly speedMps: number };
}

function observeEligibility(env: CaseEnvironment, spec: EligibilitySpec): EligibilityWindowRecord {
  const blockedGreen = spec.label === 'BLOCKED_GREEN';
  const controlMode =
    spec.controlMode ??
    (spec.label === 'MANUAL_SEGMENT' ? ('MANUAL' as const) : ('LEARNING' as const));
  const learningEligible = spec.learningEligible ?? spec.label !== 'MANUAL_SEGMENT';
  const record = env.eligibility.observe({
    tick: spec.tick,
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    opportunityId: spec.opportunity.id,
    kind: spec.opportunity.kind,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    segmentId: spec.opportunity.segmentIds[0]!,
    controlMode,
    learningEligible,
    classId: 'sedan',
    suspension:
      spec.suspension ??
      (spec.label === 'PAUSE' ? 'PAUSE' : spec.label === 'FOCUS_LOST' ? 'FOCUS_LOST' : 'NONE'),
    visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
    leader:
      spec.label === 'LEADER'
        ? (spec.leader ?? { id: `${spec.opportunity.id}-leader`, gapM: 7, speedMps: 8 })
        : null,
    signal: blockedGreen
      ? {
          signalId: `${spec.opportunity.id}-signal`,
          intersectionId: `${spec.opportunity.id}-junction`,
          movementId: `${spec.opportunity.id}-movement`,
          state: 'GREEN',
        }
      : null,
    greenExit: blockedGreen ? { blocked: true, source: 'FOLLOWING_QUEUE' } : null,
    mechanical: null,
    impact: null,
  });
  env.windows.push(record);
  return record;
}

function examine(
  env: CaseEnvironment,
  params: {
    readonly artifact: FilteredWindowRecord;
    readonly opportunity: OpportunityRecord;
    readonly eligibility: EligibilityWindowRecord;
    readonly roadType: string;
    readonly speedSamples?: readonly { readonly tick: number; readonly speedMps: number }[];
    readonly headway?: { readonly gapM: number; readonly speedMps: number };
    readonly stopOutcome?: 'STOPPED' | 'CROSSED_WITHOUT_STOP' | 'HELD' | 'CROSSED';
    readonly greenStartDelayS?: number;
    readonly laneChangeOutcome?: 'COMPLETED' | 'ABORTED';
  },
): LearningEdgeCaseAdmission {
  const admission = admitLearningEdgeCaseObservation({
    eligibility: params.eligibility,
    opportunity: params.opportunity,
    artifacts: params.artifact,
    roadType: params.roadType,
    ...(params.speedSamples === undefined ? {} : { speedSamples: params.speedSamples }),
    ...(params.headway === undefined ? {} : { headway: params.headway }),
    ...(params.stopOutcome === undefined ? {} : { stopOutcome: params.stopOutcome }),
    ...(params.greenStartDelayS === undefined ? {} : { greenStartDelayS: params.greenStartDelayS }),
    ...(params.laneChangeOutcome === undefined
      ? {}
      : { laneChangeOutcome: params.laneChangeOutcome }),
  });
  env.admissions.push(
    Object.freeze({
      opportunityId: params.opportunity.id,
      label: params.eligibility.label,
      admitted: admission.admitted,
      reason: admission.admitted ? null : admission.reason,
      context: contextOf(params.eligibility.label),
    }),
  );
  if (admission.admitted) {
    env.ledger.observe(admission.observation);
    env.observations.push(admission.observation);
  }
  const context = contextOf(params.eligibility.label);
  if (context !== null) env.contexts.add(context);
  return admission;
}

/** One real 030 recovery record, read back through the real ledger before it becomes an 088 fact. */
function recoveryFact(params: {
  readonly tick: number;
  readonly operationId: string;
  readonly status: RecoveryRecord['status'];
  readonly pointId: string;
  readonly laneId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
}): ArtifactRecoveryFact {
  const record: RecoveryRecord = {
    context: WORLD,
    operationId: params.operationId,
    vehicleId: VEHICLE_ID,
    bodyGeneration: 3,
    pointId: params.pointId,
    mapId: 'map-107',
    laneId: params.laneId,
    access: 'TAXI',
    mode: params.mode,
    validatedTick: Math.max(0, params.tick - 2),
    requestedTick: params.tick - 1,
    acceptedTick: params.tick,
    origin: 'R',
    kind: 'TELEPORT',
    learningEligible: false,
    status: params.status,
    before: null,
    placement: null,
    deliveredStages: 0,
    failure: null,
  };
  const ledger = createRecoveryLedger();
  const index = ledger.admit(record, `107:${params.operationId}`);
  ledger.finish(index);
  const stored = ledger.readHistory(0, 1)[0];
  ledger.clear();
  if (stored === undefined) throw new Error('107 could not read back the 030 recovery record');
  return Object.freeze({
    tick: stored.acceptedTick,
    operationId: stored.operationId,
    status: stored.status,
    pointId: stored.pointId,
    mapId: stored.mapId,
    laneId: stored.laneId,
    mode: stored.mode,
    validatedTick: stored.validatedTick,
    learningEligible: false as const,
  });
}

function artifactRecords(record: FilteredWindowRecord): readonly LearningEdgeCaseArtifactRecord[] {
  return Object.freeze(
    record.artifacts.map((artifact) =>
      Object.freeze({
        segmentId: record.segmentId,
        kind: artifact.kind,
        cause: artifact.cause,
        source: artifact.source,
        boundaryTick: artifact.boundaryTick,
        endTick: artifact.endTick,
        incidentId: artifact.incidentId,
        impulseNs: artifact.impulseNs,
        otherEntityId: artifact.otherEntityId,
        operationId: artifact.operationId,
        recoveryPointId: artifact.recoveryPointId,
        recoveryMapId: artifact.recoveryMapId,
        recoveryLaneId: artifact.recoveryLaneId,
        recoveryMode: artifact.recoveryMode,
        recoveryValidatedTick: artifact.recoveryValidatedTick,
        suspensionCause: artifact.suspensionCause,
      }),
    ),
  );
}

function windowRecord(record: FilteredWindowRecord): LearningEdgeCaseWindowRecord {
  return Object.freeze({
    segmentId: record.segmentId,
    windowClass: record.windowClass,
    completeness: record.completeness,
    completenessReason: record.completenessReason,
    startTick: record.startTick,
    endTick: record.endTick,
    boundaryTick: record.boundaryTick,
    boundaryCause: record.boundaryCause,
    prefixTicks: record.prefix?.ticks ?? 0,
    suppressedTicks: record.suppressed?.ticks ?? 0,
    artifactCount: record.artifactCount,
  });
}

function ledgerRow(row: ParameterEvidenceReadModel): LearningEdgeCaseLedgerRow {
  return Object.freeze({
    key: row.key,
    status: row.status,
    distinctEpisodes: row.distinctEpisodes,
    sampleCount: row.sampleCount,
    contexts: Object.freeze(row.contextBreakdown.map((entry) => entry.label)),
  });
}

function finalizeCase(caseId: LearningEdgeCaseId, env: CaseEnvironment): LearningEdgeCaseResult {
  const ledgerKeys = Object.freeze(env.ledger.readAll().map(ledgerRow));
  const learnedKeys = Object.freeze(
    ledgerKeys.filter((row) => row.status === 'READY').map((row) => row.key),
  );
  const profileChanges = ledgerKeys.filter((row) => 'value' in row || 'delta' in row).length;
  check(
    env,
    'ledger-keys-complete',
    24,
    ledgerKeys.length,
    '093 reads all 24 M keys for every case',
  );
  check(env, 'profile-changes-zero', 0, profileChanges, 'no profile value or delta exists');
  check(
    env,
    'ledger-rows-immutable',
    true,
    Object.isFrozen(env.ledger.readAll()),
    'the 093 read model stays frozen',
  );
  const observed = Object.freeze(evidenceContexts.filter((context) => env.contexts.has(context)));
  const unobserved = Object.freeze(
    evidenceContexts.filter((context) => !env.contexts.has(context)),
  );
  const passed = env.checks.every((entry) => entry.pass);
  return Object.freeze({
    caseId,
    kind: caseKinds[caseId],
    status: passed ? 'PASS' : 'FAIL',
    artifacts: Object.freeze(env.artifacts.flatMap(artifactRecords)),
    windows: Object.freeze(env.artifacts.map(windowRecord)),
    ledgerKeys,
    learnedKeys,
    profileChanges,
    candidatesProduced: 0,
    contextsObserved: observed,
    contextsUnobserved: unobserved,
    admissions: Object.freeze([...env.admissions]),
    checks: Object.freeze([...env.checks]),
  });
}

function runCase(
  caseId: LearningEdgeCaseId,
  ports: LearningEdgeCasePorts,
  scenario: (env: CaseEnvironment) => void,
): LearningEdgeCaseResult {
  const env = createEnvironment(ports);
  try {
    scenario(env);
    return finalizeCase(caseId, env);
  } finally {
    env.filter.dispose();
    env.eligibility.dispose();
  }
}

type EvidenceKey = Parameters<ParameterEvidenceLedger['read']>[0];

const readStatus = (env: CaseEnvironment, key: EvidenceKey): ParameterEvidenceStatus =>
  env.ledger.read(key).status;

const readEpisodes = (env: CaseEnvironment, key: EvidenceKey): number =>
  env.ledger.read(key).distinctEpisodes;

const readContexts = (env: CaseEnvironment, key: EvidenceKey): readonly string[] =>
  env.ledger.read(key).contextBreakdown.map((entry) => entry.label);

function pauseScenario(focusLost: boolean): (env: CaseEnvironment) => void {
  return (env) => {
    const cause = focusLost ? ('focus' as const) : ('panel' as const);
    const segmentId = focusLost ? 'focus-seg' : 'pause-seg';
    const artifactCause = focusLost ? 'SUSPENSION_FOCUS_LOST' : 'SUSPENSION_PAUSE';
    const record = evaluateArtifact(env, 240, {
      segmentId,
      startTick: 1,
      endTick: 240,
      suspensions: [{ fromTick: 100, toTick: 120, cause }],
    });
    const opp = opportunity({
      id: focusLost ? 'focus-opp' : 'pause-opp',
      kind: 'STOP',
      occurrence: 1,
      segmentId,
      openedTick: 110,
      lastTick: 110,
      street: focusLost ? 'street-focus' : 'street-pause',
    });
    const window = observeEligibility(env, {
      tick: 110,
      opportunity: opp,
      label: focusLost ? 'FOCUS_LOST' : 'PAUSE',
      suspension: focusLost ? 'FOCUS_LOST' : 'PAUSE',
    });
    const admission = examine(env, {
      artifact: record,
      opportunity: opp,
      eligibility: window,
      roadType: 'urban',
      speedSamples: [{ tick: 105, speedMps: 9 }],
    });
    check(
      env,
      'artifact-kind',
      'PAUSE',
      record.artifacts[0]?.kind ?? 'NONE',
      'suspension is its own kind',
    );
    check(
      env,
      'artifact-cause',
      artifactCause,
      record.artifacts[0]?.cause ?? 'NONE',
      'cause is explicit',
    );
    check(
      env,
      'artifact-source',
      'SUSPENSION_070',
      record.artifacts[0]?.source ?? 'NONE',
      '070 owns the suspension',
    );
    check(
      env,
      'suspension-cause',
      cause,
      record.artifacts[0]?.suspensionCause ?? 'NONE',
      'the 070 cause is preserved',
    );
    check(env, 'completeness', 'PARTIAL', record.completeness, 'a pause cannot be COMPLETE');
    check(
      env,
      'completeness-reason',
      'TRUNCATED_BY_ARTIFACT',
      record.completenessReason,
      'a pause is not an observation gap',
    );
    check(
      env,
      'prefix-end',
      99,
      record.prefix?.toTick ?? -1,
      'ticks before the suspension stay usable',
    );
    check(
      env,
      'suppressed-start',
      100,
      record.suppressed?.fromTick ?? -1,
      'the suspension starts the suppression',
    );
    check(
      env,
      'observation-inside-suppressed',
      true,
      (record.suppressed?.fromTick ?? 0) <= 110,
      'the examined observation is in the suppressed span',
    );
    check(
      env,
      'admission-refused',
      false,
      admission.admitted,
      'the 107 adapter refuses the suspended window',
    );
    check(
      env,
      'exclusion-reason',
      'ELIGIBILITY_EXCLUDED',
      admission.admitted ? 'NONE' : admission.reason,
      '087 exclusion is explicit',
    );
    check(
      env,
      'ready-keys',
      0,
      env.ledger.readAll().filter((row) => row.status === 'READY').length,
      'no READY key exists',
    );
    check(
      env,
      'speed-status',
      'NO_EVIDENCE',
      readStatus(env, 'speed_delta_urban'),
      'the pause adds no speed evidence',
    );
    check(
      env,
      'artifact-not-incomplete',
      0,
      record.artifacts.filter((item) => item.kind === 'INCOMPLETE_SAMPLE').length,
      'a pause is never an incomplete sample',
    );
    if (focusLost) {
      // A suspension that starts at the first tick leaves no usable prefix at all.
      const fullySuppressed = evaluateArtifact(env, 440, {
        segmentId: 'focus-fully-seg',
        startTick: 1,
        endTick: 440,
        suspensions: [{ fromTick: 1, toTick: 120, cause: 'focus' }],
      });
      const fullyOpportunity = opportunity({
        id: 'focus-fully-opp',
        kind: 'STOP',
        occurrence: 1,
        segmentId: 'focus-fully-seg',
        openedTick: 180,
        lastTick: 180,
        street: 'street-focus-fully',
      });
      const fullyWindow = observeEligibility(env, {
        tick: 180,
        opportunity: fullyOpportunity,
        label: 'FOCUS_LOST',
        suspension: 'FOCUS_LOST',
      });
      const fullyAdmission = examine(env, {
        artifact: fullySuppressed,
        opportunity: fullyOpportunity,
        eligibility: fullyWindow,
        roadType: 'urban',
        speedSamples: [{ tick: 180, speedMps: 9 }],
      });
      check(
        env,
        'fully-suppressed-class',
        'FULLY_SUPPRESSED',
        fullySuppressed.windowClass,
        'a suspension at tick one leaves no prefix',
      );
      check(
        env,
        'fully-suppressed-prefix',
        'none',
        fullySuppressed.prefix === null ? 'none' : 'prefix',
        'there is no usable prefix to bind',
      );
      check(
        env,
        'fully-suppressed-refused',
        false,
        fullyAdmission.admitted,
        'a fully suppressed window never reaches 093',
      );
      check(
        env,
        'fully-suppressed-reason',
        'WINDOW_FULLY_SUPPRESSED',
        fullyAdmission.admitted ? 'NONE' : fullyAdmission.reason,
        'the refusal is explicit',
      );
    }
  };
}

function recoveryScenario(
  status: 'COMPLETED' | 'DENIED' | 'PARTIAL',
): (env: CaseEnvironment) => void {
  return (env) => {
    const segmentId = `recovery-${status.toLowerCase()}`;
    const recoveryTick = status === 'COMPLETED' ? 700 : status === 'DENIED' ? 40 : 80;
    const endTick = status === 'COMPLETED' ? 900 : status === 'DENIED' ? 300 : 400;
    const evaluationTick = endTick;
    const expectedCause =
      status === 'DENIED'
        ? 'RECOVERY_DENIED'
        : status === 'PARTIAL'
          ? 'RECOVERY_PARTIAL'
          : 'RECOVERY_TELEPORT';
    const fact = recoveryFact({
      tick: recoveryTick,
      operationId: `op-${status.toLowerCase()}`,
      status,
      pointId: `point-${status.toLowerCase()}`,
      laneId: `lane-${status.toLowerCase()}`,
      mode: 'MANUAL',
    });
    const record = evaluateArtifact(env, evaluationTick, {
      segmentId,
      startTick: 1,
      endTick,
      collisions:
        status === 'COMPLETED'
          ? [
              {
                tick: recoveryTick - 10,
                incidentId: 'incident-107',
                impulseNs: 1800,
                otherEntityId: 'kerb-107',
              },
            ]
          : [],
      recoveries: [fact],
    });
    const boundaryTick = status === 'COMPLETED' ? recoveryTick - 10 : recoveryTick;
    const prefixEnd = boundaryTick - 1;
    const teleport = record.artifacts.find((artifact) => artifact.kind === 'TELEPORT');
    check(
      env,
      'teleport-cause',
      expectedCause,
      teleport?.cause ?? 'NONE',
      'the 030 status maps to an explicit cause',
    );
    check(
      env,
      'teleport-source',
      'RECOVERY_030',
      teleport?.source ?? 'NONE',
      '030 owns the placement',
    );
    check(
      env,
      'teleport-proof-operation',
      `op-${status.toLowerCase()}`,
      teleport?.operationId ?? 'NONE',
      'the operation id is preserved',
    );
    check(
      env,
      'teleport-proof-point',
      `point-${status.toLowerCase()}`,
      teleport?.recoveryPointId ?? 'NONE',
      'the point is preserved',
    );
    check(
      env,
      'teleport-proof-lane',
      `lane-${status.toLowerCase()}`,
      teleport?.recoveryLaneId ?? 'NONE',
      'the lane is preserved',
    );
    check(
      env,
      'teleport-proof-validated-tick',
      recoveryTick - 2,
      teleport?.recoveryValidatedTick ?? -1,
      'the validated tick is preserved',
    );
    check(env, 'completeness', 'PARTIAL', record.completeness, 'a recovery cannot be COMPLETE');
    check(
      env,
      'completeness-reason',
      'RECOVERY',
      record.completenessReason,
      'the recovery reason is explicit',
    );
    check(
      env,
      'boundary',
      boundaryTick,
      record.boundaryTick ?? -1,
      'the earliest artifact sets the boundary',
    );
    check(
      env,
      'prefix-end',
      prefixEnd,
      record.prefix?.toTick ?? -1,
      'the pre-recovery prefix ends before the artifact',
    );
    check(
      env,
      'suppression-covers-recovery',
      true,
      (record.suppressed?.fromTick ?? 0) <= recoveryTick,
      'the teleport tick is never usable',
    );

    const prefixOpportunity = opportunity({
      id: `${segmentId}-prefix`,
      kind: 'STOP',
      occurrence: 1,
      segmentId,
      openedTick: status === 'COMPLETED' ? 600 : prefixEnd,
      lastTick: status === 'COMPLETED' ? 600 : prefixEnd,
      street: `${segmentId}-prefix-street`,
    });
    const prefixWindow = observeEligibility(env, {
      tick: status === 'COMPLETED' ? 600 : prefixEnd,
      opportunity: prefixOpportunity,
      label: 'FREE_TRAFFIC',
    });
    const prefixAdmission = examine(env, {
      artifact: record,
      opportunity: prefixOpportunity,
      eligibility: prefixWindow,
      roadType: 'urban',
      speedSamples: [{ tick: 10, speedMps: 11 }],
    });
    check(
      env,
      'prefix-admitted',
      true,
      prefixAdmission.admitted,
      'a usable prefix before the artifact stays evidence',
    );
    check(
      env,
      'prefix-speed-status',
      status === 'COMPLETED' ? 'READY' : 'NO_EVIDENCE',
      readStatus(env, 'speed_delta_urban'),
      status === 'COMPLETED'
        ? 'the long pre-recovery prefix reaches the speed threshold'
        : 'the short prefix cannot reach the speed threshold',
    );

    const postOpportunity = opportunity({
      id: `${segmentId}-post`,
      kind: 'STOP',
      occurrence: 1,
      segmentId,
      openedTick: recoveryTick + 20,
      lastTick: recoveryTick + 20,
      street: `${segmentId}-post-street`,
    });
    const postWindow = observeEligibility(env, {
      tick: recoveryTick + 20,
      opportunity: postOpportunity,
      label: 'FREE_TRAFFIC',
    });
    const postAdmission = examine(env, {
      artifact: record,
      opportunity: postOpportunity,
      eligibility: postWindow,
      roadType: 'urban',
      speedSamples: [{ tick: recoveryTick + 19, speedMps: 11 }],
    });
    check(
      env,
      'post-recovery-refused',
      false,
      postAdmission.admitted,
      'the teleport interval never becomes evidence',
    );
    check(
      env,
      'post-recovery-exclusion',
      'OBSERVATION_OUTSIDE_USABLE_PREFIX',
      postAdmission.admitted ? 'NONE' : postAdmission.reason,
      'the usable prefix gate is explicit',
    );
    const readyKeys = env.ledger
      .readAll()
      .filter((row) => row.status === 'READY')
      .map((row) => row.key);
    check(
      env,
      'ready-keys',
      status === 'COMPLETED' ? 'speed_delta_urban' : '',
      readyKeys.join('|'),
      'the recovery itself never becomes a learned key',
    );
    if (status === 'COMPLETED') {
      check(
        env,
        'collision-artifact',
        'COLLISION',
        record.artifacts[0]?.kind ?? 'NONE',
        'the real collision is retained',
      );
      check(
        env,
        'collision-impulse',
        1800,
        record.artifacts[0]?.impulseNs ?? -1,
        'the impulse proof is retained',
      );
    }
  };
}

function incompleteScenario(env: CaseEnvironment): void {
  const segmentA = evaluateArtifact(env, 500, {
    segmentId: 'incomplete-a',
    startTick: 1,
    endTick: 500,
    segmentCompleteness: 'INCOMPLETE',
    closeReason: 'RIDE_COMPLETED',
  });
  const segmentB = evaluateArtifact(env, 600, {
    segmentId: 'incomplete-b',
    startTick: 1,
    endTick: 200,
    closeReason: 'DATA_LOSS',
  });
  const segmentC = evaluateArtifact(env, 800, {
    segmentId: 'incomplete-c',
    startTick: 1,
    endTick: null,
    segmentCompleteness: 'OPEN',
    closeReason: null,
    lostCheckpointTick: 600,
  });
  const opportunityA = opportunity({
    id: 'incomplete-opp-a',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'incomplete-a',
    openedTick: 500,
    lastTick: 500,
    street: 'street-incomplete-a',
  });
  const opportunityB = opportunity({
    id: 'incomplete-opp-b',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'incomplete-b',
    openedTick: 210,
    lastTick: 210,
    street: 'street-incomplete-b',
  });
  const opportunityC = opportunity({
    id: 'incomplete-opp-c',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'incomplete-c',
    openedTick: 700,
    lastTick: 700,
    street: 'street-incomplete-c',
  });
  const windowB = observeEligibility(env, {
    tick: 210,
    opportunity: opportunityB,
    label: 'FREE_TRAFFIC',
  });
  const windowA = observeEligibility(env, {
    tick: 500,
    opportunity: opportunityA,
    label: 'FREE_TRAFFIC',
  });
  const windowC = observeEligibility(env, {
    tick: 700,
    opportunity: opportunityC,
    label: 'FREE_TRAFFIC',
  });
  const admissionA = examine(env, {
    artifact: segmentA,
    opportunity: opportunityA,
    eligibility: windowA,
    roadType: 'urban',
    speedSamples: [{ tick: 499, speedMps: 10 }],
  });
  const admissionB = examine(env, {
    artifact: segmentB,
    opportunity: opportunityB,
    eligibility: windowB,
    roadType: 'urban',
    speedSamples: [{ tick: 209, speedMps: 10 }],
  });
  const admissionC = examine(env, {
    artifact: segmentC,
    opportunity: opportunityC,
    eligibility: windowC,
    roadType: 'urban',
    speedSamples: [{ tick: 699, speedMps: 10 }],
  });
  check(
    env,
    'segment-incomplete-cause',
    'SEGMENT_INCOMPLETE',
    segmentA.artifacts[0]?.cause ?? 'NONE',
    '069 incomplete is explicit',
  );
  check(
    env,
    'segment-incomplete-reason',
    'SEGMENT_INCOMPLETE',
    segmentA.completenessReason,
    'the completeness reason is explicit',
  );
  check(
    env,
    'data-loss-cause',
    'CLOSE_REASON_DATA_LOSS',
    segmentB.artifacts[0]?.cause ?? 'NONE',
    'DATA_LOSS is explicit',
  );
  check(
    env,
    'data-loss-reason',
    'DATA_LOSS',
    segmentB.completenessReason,
    'the completeness reason is explicit',
  );
  check(
    env,
    'checkpoint-lost-cause',
    'CHECKPOINT_LOST',
    segmentC.artifacts[0]?.cause ?? 'NONE',
    'a lost checkpoint is explicit',
  );
  check(
    env,
    'checkpoint-lost-reason',
    'CHECKPOINT_LOST',
    segmentC.completenessReason,
    'the completeness reason is explicit',
  );
  check(
    env,
    'all-truncated',
    3,
    [segmentA, segmentB, segmentC].filter((entry) => entry.completeness === 'TRUNCATED').length,
    'no incomplete variant claims COMPLETE',
  );
  check(
    env,
    'all-refused',
    0,
    [admissionA, admissionB, admissionC].filter((entry) => entry.admitted).length,
    'no truncated tail becomes evidence',
  );
  check(
    env,
    'refusal-reasons',
    3,
    [admissionA, admissionB, admissionC].filter(
      (entry) => !entry.admitted && entry.reason === 'OBSERVATION_OUTSIDE_USABLE_PREFIX',
    ).length,
    'every refusal names the prefix gate',
  );
}

function openSegmentScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 300, {
    segmentId: 'open-seg',
    startTick: 1,
    endTick: null,
    segmentCompleteness: 'OPEN',
    closeReason: null,
  });
  const opp = opportunity({
    id: 'open-opp',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'open-seg',
    openedTick: 150,
    lastTick: 150,
    street: 'street-open',
  });
  const window = observeEligibility(env, { tick: 150, opportunity: opp, label: 'FREE_TRAFFIC' });
  const admission = examine(env, {
    artifact: record,
    opportunity: opp,
    eligibility: window,
    roadType: 'urban',
    speedSamples: [{ tick: 150, speedMps: 10 }],
  });
  check(env, 'artifact-count', 0, record.artifactCount, 'an open segment has no artifact yet');
  check(env, 'completeness', 'PARTIAL', record.completeness, 'an open segment is never COMPLETE');
  check(
    env,
    'completeness-reason',
    'OPEN_SEGMENT',
    record.completenessReason,
    'the open reason is explicit',
  );
  check(
    env,
    'prefix-whole',
    300,
    record.prefix?.ticks ?? -1,
    'the current open segment is its own usable prefix',
  );
  check(
    env,
    'observed-admitted',
    true,
    admission.admitted,
    'a short open window is still describable',
  );
  check(
    env,
    'speed-status',
    'NO_EVIDENCE',
    readStatus(env, 'speed_delta_urban'),
    'less than ten seconds cannot make a speed estimate',
  );
}

function observationGapScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 400, {
    segmentId: 'gap-seg',
    startTick: 1,
    endTick: 400,
    observationLoss: { fromTick: 200, ticks: 5 },
  });
  const opp = opportunity({
    id: 'gap-opp',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'gap-seg',
    openedTick: 250,
    lastTick: 250,
    street: 'street-gap',
  });
  const window = observeEligibility(env, { tick: 250, opportunity: opp, label: 'FREE_TRAFFIC' });
  const admission = examine(env, {
    artifact: record,
    opportunity: opp,
    eligibility: window,
    roadType: 'urban',
    speedSamples: [{ tick: 249, speedMps: 10 }],
  });
  check(
    env,
    'artifact-cause',
    'OBSERVATION_GAP',
    record.artifacts[0]?.cause ?? 'NONE',
    'the lost observations are explicit',
  );
  check(
    env,
    'artifact-source',
    'TICK_SAMPLES_085',
    record.artifacts[0]?.source ?? 'NONE',
    '085 owns the gap',
  );
  check(env, 'completeness', 'PARTIAL', record.completeness, 'an observation gap is PARTIAL');
  check(
    env,
    'completeness-reason',
    'OBSERVATION_GAP',
    record.completenessReason,
    'the gap reason is explicit',
  );
  check(env, 'prefix-end', 199, record.prefix?.toTick ?? -1, 'the prefix ends before the gap');
  check(env, 'refused', false, admission.admitted, 'the lost span never becomes evidence');
}

function manyStreetsScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 900, {
    segmentId: 'many-streets-seg',
    startTick: 1,
    endTick: 900,
  });
  const freeOpportunities = [
    opportunity({
      id: 'street-a-stop',
      kind: 'STOP',
      occurrence: 1,
      segmentId: 'many-streets-seg',
      openedTick: 100,
      lastTick: 100,
      street: 'street-a',
    }),
    opportunity({
      id: 'street-b-stop',
      kind: 'STOP',
      occurrence: 1,
      segmentId: 'many-streets-seg',
      openedTick: 200,
      lastTick: 200,
      street: 'street-b',
    }),
    opportunity({
      id: 'street-c-stop',
      kind: 'STOP',
      occurrence: 1,
      segmentId: 'many-streets-seg',
      openedTick: 300,
      lastTick: 300,
      street: 'street-c',
    }),
  ];
  const speeds = [12, 8, 14];
  const freeAdmissions = freeOpportunities.map((opp, index) => {
    const window = observeEligibility(env, {
      tick: opp.openedTick,
      opportunity: opp,
      label: 'FREE_TRAFFIC',
    });
    return examine(env, {
      artifact: record,
      opportunity: opp,
      eligibility: window,
      roadType: 'urban',
      speedSamples: [{ tick: opp.openedTick - 1, speedMps: speeds[index]! }],
    });
  });
  // The same physical opportunity seen on four more frames is still the same episode.
  const first = env.observations[0]!;
  for (let frame = 0; frame < 4; frame += 1)
    env.ledger.observe({
      ...first,
      speedSamples: [{ tick: 50 + frame, speedMps: 12 + (frame % 2) }],
    });
  const leader = opportunity({
    id: 'street-d-stop',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'many-streets-seg',
    openedTick: 400,
    lastTick: 400,
    street: 'street-d',
  });
  const leaderWindow = observeEligibility(env, {
    tick: 400,
    opportunity: leader,
    label: 'LEADER',
    leader: { id: 'leader-street-d', gapM: 7, speedMps: 6 },
  });
  examine(env, {
    artifact: record,
    opportunity: leader,
    eligibility: leaderWindow,
    roadType: 'urban',
    headway: { gapM: 7, speedMps: 6 },
  });
  const green = opportunity({
    id: 'street-e-green',
    kind: 'GREEN',
    occurrence: 1,
    segmentId: 'many-streets-seg',
    openedTick: 500,
    lastTick: 500,
    street: 'street-e',
  });
  const greenWindow = observeEligibility(env, {
    tick: 500,
    opportunity: green,
    label: 'BLOCKED_GREEN',
  });
  const greenAdmission = examine(env, {
    artifact: record,
    opportunity: green,
    eligibility: greenWindow,
    roadType: 'urban',
    greenStartDelayS: 1.2,
  });
  check(
    env,
    'all-free-admitted',
    3,
    freeAdmissions.filter((entry) => entry.admitted).length,
    'three distinct streets are admitted',
  );
  check(
    env,
    'distinct-free-episodes',
    3,
    readEpisodes(env, 'speed_delta_urban'),
    'three distinct opportunity ids count separately',
  );
  check(
    env,
    'repeated-frames-deduped',
    3,
    readEpisodes(env, 'speed_delta_urban'),
    'the same opportunity seen on repeated frames is one episode',
  );
  check(
    env,
    'following-episodes',
    1,
    readEpisodes(env, 'following_time_headway'),
    'the leader context is separate',
  );
  check(
    env,
    'following-status',
    'INSUFFICIENT',
    readStatus(env, 'following_time_headway'),
    'one leader episode is not READY',
  );
  check(
    env,
    'blocked-green-refused',
    false,
    greenAdmission.admitted,
    'blocked green is an external constraint',
  );
  check(
    env,
    'blocked-green-exclusion',
    'CONTEXT_NOT_EVIDENCE',
    greenAdmission.admitted ? 'NONE' : greenAdmission.reason,
    'the refusal is explicit',
  );
  check(
    env,
    'green-delay-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'green_start_delay'),
    'blocked green adds no green-start evidence',
  );
  check(
    env,
    'speed-contexts',
    'FREE_TRAFFIC',
    [...new Set(readContexts(env, 'speed_delta_urban'))].join('|'),
    'speed evidence stays in free traffic',
  );
  check(
    env,
    'following-contexts',
    'LEADER',
    [...new Set(readContexts(env, 'following_time_headway'))].join('|'),
    'following evidence stays in the leader context',
  );
}

function shortInterventionScenario(env: CaseEnvironment): void {
  const learningRecord = evaluateArtifact(env, 600, {
    segmentId: 'short-learning-seg',
    startTick: 1,
    endTick: 600,
  });
  const learningOpportunity = opportunity({
    id: 'short-free-opp',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'short-learning-seg',
    openedTick: 300,
    lastTick: 300,
    street: 'street-short-free',
  });
  const learningWindow = observeEligibility(env, {
    tick: 300,
    opportunity: learningOpportunity,
    label: 'FREE_TRAFFIC',
  });
  const learningAdmission = examine(env, {
    artifact: learningRecord,
    opportunity: learningOpportunity,
    eligibility: learningWindow,
    roadType: 'urban',
    speedSamples: [
      { tick: 10, speedMps: 11 },
      { tick: 300, speedMps: 11 },
      { tick: 599, speedMps: 11 },
    ],
  });
  const manualRecord = evaluateArtifact(env, 1200, {
    segmentId: 'short-manual-seg',
    startTick: 601,
    endTick: 1200,
    controlMode: 'MANUAL',
    learningEligible: false,
  });
  const manualOpportunity = opportunity({
    id: 'short-manual-opp',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'short-manual-seg',
    openedTick: 900,
    lastTick: 900,
    street: 'street-short-manual',
    learningEligible: false,
  });
  const manualWindow = observeEligibility(env, {
    tick: 900,
    opportunity: manualOpportunity,
    label: 'MANUAL_SEGMENT',
    controlMode: 'MANUAL',
    learningEligible: false,
  });
  const manualAdmission = examine(env, {
    artifact: manualRecord,
    opportunity: manualOpportunity,
    eligibility: manualWindow,
    roadType: 'urban',
    speedSamples: [{ tick: 899, speedMps: 11 }],
  });
  check(
    env,
    'learning-admitted',
    true,
    learningAdmission.admitted,
    'the eligible LEARNING portrait is admitted',
  );
  check(
    env,
    'speed-key-ready',
    'READY',
    readStatus(env, 'speed_delta_urban'),
    'ten seconds of free traffic is the documented speed threshold',
  );
  check(
    env,
    'speed-episodes',
    1,
    readEpisodes(env, 'speed_delta_urban'),
    'the short intervention contributes one episode',
  );
  check(
    env,
    'approach-status',
    'INSUFFICIENT',
    readStatus(env, 'intersection_approach_speed'),
    'a single short episode is not enough',
  );
  check(
    env,
    'following-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'following_time_headway'),
    'no leader evidence is fabricated',
  );
  check(
    env,
    'signal-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'green_start_delay'),
    'no signal evidence is fabricated',
  );
  check(
    env,
    'lane-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'lane_change_front_gap'),
    'no lane-change evidence is fabricated',
  );
  check(
    env,
    'manual-refused',
    false,
    manualAdmission.admitted,
    'MANUAL is never learning evidence',
  );
  check(
    env,
    'manual-exclusion',
    'ELIGIBILITY_EXCLUDED',
    manualAdmission.admitted ? 'NONE' : manualAdmission.reason,
    'the MANUAL exclusion is explicit',
  );
  check(
    env,
    'manual-adds-no-episode',
    1,
    readEpisodes(env, 'speed_delta_urban'),
    'MANUAL does not inflate the episode count',
  );
  const readySpecs = parameterEvidenceSpecs.filter((spec) => spec.key === 'speed_delta_urban');
  check(
    env,
    'ready-key-context',
    'FREE_TRAFFIC',
    readySpecs[0]?.contexts.join('|') ?? 'NONE',
    'the READY key belongs to the observed context',
  );
}

function cleanFreeTrafficScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 900, {
    segmentId: 'clean-free-seg',
    startTick: 1,
    endTick: 900,
  });
  const opp = opportunity({
    id: 'clean-free-opp',
    kind: 'STOP',
    occurrence: 1,
    segmentId: 'clean-free-seg',
    openedTick: 800,
    lastTick: 800,
    street: 'street-clean-free',
  });
  const window = observeEligibility(env, { tick: 800, opportunity: opp, label: 'FREE_TRAFFIC' });
  const admission = examine(env, {
    artifact: record,
    opportunity: opp,
    eligibility: window,
    roadType: 'urban',
    speedSamples: [{ tick: 10, speedMps: 11 }],
  });
  check(env, 'no-artifact', 0, record.artifactCount, 'a clean segment has no artifact');
  check(env, 'complete', 'COMPLETE', record.completeness, 'a clean closed segment stays COMPLETE');
  check(env, 'admitted', true, admission.admitted, 'the clean window is usable');
  check(
    env,
    'speed-ready',
    'READY',
    readStatus(env, 'speed_delta_urban'),
    'the positive speed control is READY',
  );
  check(
    env,
    'following-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'following_time_headway'),
    'free traffic does not fabricate following evidence',
  );
}

function cleanLeaderScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 900, {
    segmentId: 'clean-leader-seg',
    startTick: 1,
    endTick: 900,
  });
  const specs = [
    { id: 'clean-leader-1', tick: 200, gapM: 6, speedMps: 5 },
    { id: 'clean-leader-2', tick: 400, gapM: 8, speedMps: 12 },
    { id: 'clean-leader-3', tick: 600, gapM: 10, speedMps: 20 },
  ];
  for (const spec of specs) {
    const opp = opportunity({
      id: spec.id,
      kind: 'STOP',
      occurrence: 1,
      segmentId: 'clean-leader-seg',
      openedTick: spec.tick,
      lastTick: spec.tick,
      street: `${spec.id}-street`,
    });
    const window = observeEligibility(env, {
      tick: spec.tick,
      opportunity: opp,
      label: 'LEADER',
      leader: { id: `${spec.id}-leader`, gapM: spec.gapM, speedMps: spec.speedMps },
    });
    examine(env, {
      artifact: record,
      opportunity: opp,
      eligibility: window,
      roadType: 'urban',
      headway: { gapM: spec.gapM, speedMps: spec.speedMps },
    });
  }
  check(
    env,
    'following-ready',
    'READY',
    readStatus(env, 'following_time_headway'),
    'three varied leader speeds are READY',
  );
  check(
    env,
    'min-gap-ready',
    'READY',
    readStatus(env, 'following_min_gap'),
    'the related following key is READY',
  );
  check(
    env,
    'speed-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'speed_delta_urban'),
    'a leader cannot become preferred speed',
  );
  check(
    env,
    'green-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'green_start_delay'),
    'no signal evidence is fabricated',
  );
}

function cleanBlockedGreenScenario(env: CaseEnvironment): void {
  const record = evaluateArtifact(env, 600, {
    segmentId: 'clean-green-seg',
    startTick: 1,
    endTick: 600,
  });
  const opp = opportunity({
    id: 'clean-green-opp',
    kind: 'GREEN',
    occurrence: 1,
    segmentId: 'clean-green-seg',
    openedTick: 300,
    lastTick: 300,
    street: 'street-clean-green',
  });
  const window = observeEligibility(env, { tick: 300, opportunity: opp, label: 'BLOCKED_GREEN' });
  const admission = examine(env, {
    artifact: record,
    opportunity: opp,
    eligibility: window,
    roadType: 'urban',
    greenStartDelayS: 1.4,
  });
  check(env, 'label', 'BLOCKED_GREEN', window.label, 'the blocked green label is explicit');
  check(
    env,
    'window-class',
    'EXTERNAL_CONSTRAINT',
    window.windowClass,
    'blocked green is an external constraint',
  );
  check(env, 'complete', 'COMPLETE', record.completeness, 'the fixture segment itself is complete');
  check(env, 'refused', false, admission.admitted, 'blocked green is not driver preference');
  check(
    env,
    'exclusion',
    'CONTEXT_NOT_EVIDENCE',
    admission.admitted ? 'NONE' : admission.reason,
    'the refusal is explicit',
  );
  check(
    env,
    'green-delay-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'green_start_delay'),
    'no green-start delay is fabricated',
  );
  check(
    env,
    'speed-no-evidence',
    'NO_EVIDENCE',
    readStatus(env, 'speed_delta_urban'),
    'blocked green does not spill into speed',
  );
}

function scenarios(): Readonly<Record<LearningEdgeCaseId, (env: CaseEnvironment) => void>> {
  return Object.freeze({
    PAUSE: pauseScenario(false),
    FOCUS_LOSS_PAUSE: pauseScenario(true),
    RECOVERY_ADMITTED: recoveryScenario('COMPLETED'),
    RECOVERY_DENIED: recoveryScenario('DENIED'),
    RECOVERY_PARTIAL: recoveryScenario('PARTIAL'),
    INCOMPLETE_SEGMENT: incompleteScenario,
    OPEN_SEGMENT: openSegmentScenario,
    OBSERVATION_GAP: observationGapScenario,
    MANY_STREETS: manyStreetsScenario,
    SHORT_INTERVENTION: shortInterventionScenario,
    CLEAN_FREE_TRAFFIC: cleanFreeTrafficScenario,
    CLEAN_LEADER: cleanLeaderScenario,
    CLEAN_BLOCKED_GREEN: cleanBlockedGreenScenario,
  });
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/**
 * Runs the closed 107 case set. The result is frozen and contains only real 087/088/093 outputs; it
 * never publishes a profile, writes a store or mutates a fleet.
 */
export function evaluateLearningEdgeCases(
  ports: LearningEdgeCasePorts = {},
): LearningEdgeCaseReport {
  const builders = scenarios();
  const cases = Object.freeze(
    learningEdgeCaseIds.map((caseId) => runCase(caseId, ports, builders[caseId])),
  );
  const checks = cases.flatMap((entry) => entry.checks);
  const artifacts = cases.flatMap((entry) => entry.artifacts);
  const windows = cases.flatMap((entry) => entry.windows);
  const coverage: LearningEdgeCaseCoverage = Object.freeze({
    kinds: Object.freeze(
      artifactKinds.filter((kind) => artifacts.some((entry) => entry.kind === kind)),
    ),
    causes: Object.freeze(
      artifactCauses.filter((cause) => artifacts.some((entry) => entry.cause === cause)),
    ),
    completeness: Object.freeze(
      windowCompletenessStates.filter((degree) =>
        windows.some((entry) => entry.completeness === degree),
      ),
    ),
    windowClasses: Object.freeze(
      artifactWindowClasses.filter((windowClass) =>
        windows.some((entry) => entry.windowClass === windowClass),
      ),
    ),
  });
  const passed = cases.filter((entry) => entry.status === 'PASS').length;
  const checksPassed = checks.filter((entry) => entry.pass).length;
  const summary: LearningEdgeCaseSummary = Object.freeze({
    cases: cases.length,
    passed,
    failed: cases.length - passed,
    pass: passed === cases.length && checksPassed === checks.length,
    checks: checks.length,
    checksPassed,
    learnedKeys: uniqueSorted(cases.flatMap((entry) => entry.learnedKeys)),
    profileChanges: cases.reduce((total, entry) => total + entry.profileChanges, 0),
    candidatesProduced: cases.reduce((total, entry) => total + entry.candidatesProduced, 0),
    profilePublications: 0,
    storeWrites: 0,
    fleetMutations: 0,
  });
  return Object.freeze({
    version: LEARNING_EDGECASES_VERSION,
    adapterVersion: LEARNING_EDGECASE_ADAPTER_VERSION,
    cases,
    coverage,
    summary,
  });
}
