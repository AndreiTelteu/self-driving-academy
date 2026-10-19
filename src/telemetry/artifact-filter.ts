import {
  boolean,
  choice,
  createStableId,
  fields,
  list,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';
import { segmentCloseReasons } from './contracts';
import type { TickSampleCloseReason } from './tick-samples';

/**
 * 088 telemetry artefact filter and partial segments: the layer that separates collisions, recovery
 * teleports, pauses and incomplete samples from the samples a later estimator may use.
 *
 * It owns no clock, physics, renderer, DOM, scheduler, event bus or storage and never publishes. It
 * consumes the already authoritative facts of its owners and never re-derives them:
 *   - 028 collision incidents (`CollisionIncident`) - the impact impulse;
 *   - 030 recovery records (`RecoveryRecord`, kind `TELEPORT`) - the placement including its cause
 *     and proof;
 *   - 070 `createPauseFocusOwner` (`PauseFocusCause`) and the 012 loop host causes - the suspension;
 *   - 069/085 segment lifecycle (`segmentCloseReasons`, `completeness`, `tickGaps`) - the close reason
 *     and the incomplete sample;
 *   - the 222 durable-checkpoint owner - the lost checkpoint reported by the caller.
 *
 * Criterion 1 is enforced by construction. The window record is a discriminated union: a
 * `FullySuppressedWindowRecord` is a different TypeScript type from a `PrefixEligibleWindowRecord`,
 * and `emitPreImpactEvidence` accepts **only** the latter, re-checking at runtime that the record is
 * still owned by this layer and still has a non-empty prefix. The split is exact: the artifact's own
 * `boundaryTick` and everything after it is suppressed, the samples strictly before it stay usable
 * with their own prefix denominator. A constrained situation therefore never becomes free behaviour
 * while the data that preceded the impact remains useful.
 *
 * Criterion 2 is enforced by construction. Every window exposes an explicit `completeness`
 * (`COMPLETE` / `PARTIAL` / `TRUNCATED`) with a closed `completenessReason`, and a recovery keeps the
 * full 030 cause and proof (`operationId`, `pointId`, `mapId`, `laneId`, `mode`, `validatedTick`) so
 * a later estimator cannot treat a recovered or truncated segment as complete.
 */

export const ARTIFACT_FILTER_VERSION = '088-artifact-filter-v1' as const;

/** Fixed simulation rate used only to express a tick span; no wall clock is read. */
export const ARTIFACT_FILTER_TICK_HZ = 60;

/** The closed artefact vocabulary. Every discontinuity is exactly one of these. */
export const artifactKinds = ['COLLISION', 'TELEPORT', 'PAUSE', 'INCOMPLETE_SAMPLE'] as const;
export type ArtifactKind = (typeof artifactKinds)[number];

/**
 * The closed cause vocabulary. A cause is more specific than a kind: the pause kind is reached by a
 * plain suspension or a focus loss, the teleport kind by an admitted, denied or partial placement.
 */
export const artifactCauses = [
  'COLLISION_IMPULSE',
  'RECOVERY_TELEPORT',
  'RECOVERY_DENIED',
  'RECOVERY_PARTIAL',
  'SUSPENSION_PAUSE',
  'SUSPENSION_FOCUS_LOST',
  'SEGMENT_INCOMPLETE',
  'CLOSE_REASON_DATA_LOSS',
  'CHECKPOINT_LOST',
  'OBSERVATION_GAP',
] as const;
export type ArtifactCause = (typeof artifactCauses)[number];

/** Authoritative owner that proves the artefact; provenance, not a second data source. */
export const artifactSources = [
  'COLLISION_028',
  'RECOVERY_030',
  'SUSPENSION_070',
  'LOOP_012',
  'SEGMENT_069',
  'TICK_SAMPLES_085',
  'CHECKPOINT_222',
] as const;
export type ArtifactSource = (typeof artifactSources)[number];

/** Fixed and exhaustive: every cause maps to exactly one kind. */
export const artifactCauseKinds = Object.freeze({
  COLLISION_IMPULSE: 'COLLISION',
  RECOVERY_TELEPORT: 'TELEPORT',
  RECOVERY_DENIED: 'TELEPORT',
  RECOVERY_PARTIAL: 'TELEPORT',
  SUSPENSION_PAUSE: 'PAUSE',
  SUSPENSION_FOCUS_LOST: 'PAUSE',
  SEGMENT_INCOMPLETE: 'INCOMPLETE_SAMPLE',
  CLOSE_REASON_DATA_LOSS: 'INCOMPLETE_SAMPLE',
  CHECKPOINT_LOST: 'INCOMPLETE_SAMPLE',
  OBSERVATION_GAP: 'INCOMPLETE_SAMPLE',
} as const satisfies Record<ArtifactCause, ArtifactKind>);

/** Fixed and exhaustive: the owners that may prove each cause. */
export const artifactCauseSources = Object.freeze({
  COLLISION_IMPULSE: ['COLLISION_028'],
  RECOVERY_TELEPORT: ['RECOVERY_030'],
  RECOVERY_DENIED: ['RECOVERY_030'],
  RECOVERY_PARTIAL: ['RECOVERY_030'],
  SUSPENSION_PAUSE: ['SUSPENSION_070', 'LOOP_012'],
  SUSPENSION_FOCUS_LOST: ['SUSPENSION_070'],
  SEGMENT_INCOMPLETE: ['SEGMENT_069'],
  CLOSE_REASON_DATA_LOSS: ['SEGMENT_069'],
  CHECKPOINT_LOST: ['CHECKPOINT_222'],
  OBSERVATION_GAP: ['TICK_SAMPLES_085'],
} as const satisfies Record<ArtifactCause, readonly ArtifactSource[]>);

/** The real 030 `RecoveryRecord.status` vocabulary. */
export const recoveryPlacementStatuses = ['ADMITTED', 'DENIED', 'PARTIAL', 'COMPLETED'] as const;
export type RecoveryPlacementStatus = (typeof recoveryPlacementStatuses)[number];

/** The 070 surface/focus causes plus the 012 `manual`/`background`/`overload` host causes. */
export const suspensionCauses = [
  'focus',
  'menu',
  'panel',
  'manual',
  'background',
  'overload',
] as const;
export type SuspensionCause = (typeof suspensionCauses)[number];

/** The 085 `completeness` field of the input segment. */
export const artifactSegmentCompletenessInputs = ['OPEN', 'CLOSED', 'INCOMPLETE'] as const;
export type ArtifactSegmentCompletenessInput = (typeof artifactSegmentCompletenessInputs)[number];

/** The completeness degree of a filtered window; a later estimator reads this, never a default. */
export const windowCompletenessStates = ['COMPLETE', 'PARTIAL', 'TRUNCATED'] as const;
export type WindowCompleteness = (typeof windowCompletenessStates)[number];

/** Explicit reason for the completeness degree; more restrictive states win. */
export const completenessReasons = [
  'SEGMENT_CLOSED',
  'OPEN_SEGMENT',
  'TRUNCATED_BY_ARTIFACT',
  'OBSERVATION_GAP',
  'RECOVERY',
  'SHUTDOWN',
  'SEGMENT_INCOMPLETE',
  'DATA_LOSS',
  'CHECKPOINT_LOST',
] as const;
export type CompletenessReason = (typeof completenessReasons)[number];

export const artifactWindowClasses = ['PREFIX_ELIGIBLE', 'FULLY_SUPPRESSED'] as const;
export type ArtifactWindowClass = (typeof artifactWindowClasses)[number];

/** A half-open tick span; `ticks` is the exact count of usable/suppressed ticks. */
export interface TelemetrySpan {
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: number;
}

/** Real 028 `CollisionIncident` fact: the impact impulse at one tick. */
export interface ArtifactCollisionFact {
  readonly tick: number;
  readonly incidentId: string;
  readonly impulseNs: number;
  readonly otherEntityId: string;
}

/** Real 030 `RecoveryRecord` fact: `kind` is the recovery's own `'TELEPORT'` kind. */
export interface ArtifactRecoveryFact {
  readonly tick: number;
  readonly operationId: string;
  readonly status: RecoveryPlacementStatus;
  readonly pointId: string;
  readonly mapId: string;
  readonly laneId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly validatedTick: number;
  readonly learningEligible: false;
}

/** Real 070/012 suspension fact; a single suspension decision spanning a tick range. */
export interface ArtifactSuspensionFact {
  readonly fromTick: number;
  readonly toTick: number | null;
  readonly cause: SuspensionCause;
}

/** The 085 `tickGaps` window: the first tick at or after which observations were lost. */
export interface ArtifactObservationLossFact {
  readonly fromTick: number;
  readonly ticks: number;
}

export interface ArtifactFilterInput {
  /** Evaluation tick; monotone across calls, exactly like the 087 layer. */
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  /** Frozen 069/085 controlMode; MANUAL and AUTO stay non-learning by construction. */
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  /** null while the segment is still open, mirroring the 005 contract. */
  readonly endTick: number | null;
  readonly segmentCompleteness: ArtifactSegmentCompletenessInput;
  readonly closeReason: TickSampleCloseReason | null;
  /** The tick at which the 222 durable checkpoint was lost, or null when it was not. */
  readonly lostCheckpointTick: number | null;
  /** The 085 lost-observation window, or null when no tick was lost. */
  readonly observationLoss: ArtifactObservationLossFact | null;
  readonly collisions: readonly ArtifactCollisionFact[];
  readonly recoveries: readonly ArtifactRecoveryFact[];
  readonly suspensions: readonly ArtifactSuspensionFact[];
}

/**
 * One labelled artefact. The boundary tick is the first tick that is **not** usable; the artefact
 * itself is never preferred evidence. The flat optional fields carry the preserved cause/proof of
 * the owning contract (028 incident, 030 placement, 070/012 suspension).
 */
export interface TelemetryArtifact {
  readonly artifactId: string;
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
  readonly suspensionCause: SuspensionCause | null;
}

interface FilteredWindowBase {
  readonly windowId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: WindowCompleteness;
  readonly completenessReason: CompletenessReason;
  /** Ordered oldest-first; the split boundary is the minimum `boundaryTick`. */
  readonly artifacts: readonly TelemetryArtifact[];
  readonly artifactCount: number;
  readonly boundaryTick: number | null;
  readonly boundaryCause: ArtifactCause | null;
  readonly suppressed: TelemetrySpan | null;
  readonly openedTick: number;
  /** Cadence-visible. */
  readonly lastTick: number;
  /** Cadence-visible: how many evaluations touched this window. Never used for identity. */
  readonly observationCount: number;
}

/** A window with a non-empty usable prefix; the only record `emitPreImpactEvidence` accepts. */
export interface PrefixEligibleWindowRecord extends FilteredWindowBase {
  readonly windowClass: 'PREFIX_ELIGIBLE';
  readonly prefix: TelemetrySpan;
}

/** A window whose first artifact sits at its first tick, so no tick is usable. */
export interface FullySuppressedWindowRecord extends FilteredWindowBase {
  readonly windowClass: 'FULLY_SUPPRESSED';
  readonly prefix: null;
}

export type FilteredWindowRecord = PrefixEligibleWindowRecord | FullySuppressedWindowRecord;

/** The usable pre-impact portion as preference evidence; a suppressed window cannot produce one. */
export interface PreImpactEvidenceRecord {
  readonly version: typeof ARTIFACT_FILTER_VERSION;
  readonly windowId: string;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly usableFromTick: number;
  readonly usableToTick: number;
  readonly usableTicks: number;
  /** True when no artifact at all cut the window. */
  readonly wholeWindow: boolean;
  readonly boundaryTick: number | null;
  readonly boundaryCause: ArtifactCause | null;
}

export interface ArtifactKindDenominator {
  readonly kind: ArtifactKind;
  readonly count: number;
}

export interface ArtifactCauseDenominator {
  readonly cause: ArtifactCause;
  readonly source: ArtifactSource;
  readonly count: number;
}

export interface ArtifactDenominators {
  readonly version: typeof ARTIFACT_FILTER_VERSION;
  /** Every window ever evaluated; counted in exactly one class. */
  readonly total: number;
  readonly prefixEligible: number;
  readonly fullySuppressed: number;
  readonly complete: number;
  readonly partial: number;
  readonly truncated: number;
  readonly usableTicks: number;
  readonly suppressedTicks: number;
  readonly artifactsTotal: number;
  readonly byKind: readonly ArtifactKindDenominator[];
  readonly byCause: readonly ArtifactCauseDenominator[];
  readonly preferenceEvidenceEmitted: number;
  readonly preferenceEvidenceRefused: number;
}

export interface ArtifactStats {
  readonly version: typeof ARTIFACT_FILTER_VERSION;
  readonly disposed: boolean;
  readonly maxWindows: number;
  /** Cumulative since construction; survives eviction and `dispose()`. */
  readonly windowsEvaluated: number;
  readonly evaluationCalls: number;
  readonly checkpointLosses: number;
  readonly retiredTotal: number;
  readonly rejectedTotal: number;
  readonly skippedTicks: number;
  readonly preferenceEvidenceEmitted: number;
  readonly preferenceEvidenceRefused: number;
  /** Live owned resources; every one returns to zero after `dispose()`. */
  readonly retained: number;
  readonly prefixEligibleRetained: number;
  readonly identityCodeUnits: number;
  readonly estimatedBytes: number;
  readonly estimatedBytesMaximum: number;
}

export interface ArtifactFilterOptions {
  readonly maxWindows?: number;
}

export interface ArtifactFilter {
  readonly version: typeof ARTIFACT_FILTER_VERSION;
  /** Classifies (or tightens) one segment window and returns its record. */
  evaluate(input: ArtifactFilterInput): FilteredWindowRecord;
  /**
   * The only path that can turn the usable pre-impact portion into preference evidence. Refused for
   * a fully suppressed window, a forged record or a record no longer owned by this layer.
   */
  emitPreImpactEvidence(entry: PrefixEligibleWindowRecord): PreImpactEvidenceRecord;
  getWindow(segmentId: string): FilteredWindowRecord | null;
  getWindows(): readonly FilteredWindowRecord[];
  getDenominators(): ArtifactDenominators;
  getStats(): ArtifactStats;
  dispose(): void;
}

export const ARTIFACT_CAPACITY = Object.freeze({
  minimum: 32,
  /** Mirrors 086/087 so the bounded owners share the manifest `diagnosticSamples` figure. */
  default: 4096,
  maximum: 7168,
});

/** A window cannot accumulate more than this many artifacts; beyond it the input is refused. */
export const ARTIFACT_MAX_PER_WINDOW = 64;
export const ARTIFACT_DENSE_SLOTS = 24;
export const ARTIFACT_BYTES_PER_RECORD = ARTIFACT_DENSE_SLOTS * 8;
export const ARTIFACT_IDENTITY_CODE_UNITS_CEILING = 2048;
export const ARTIFACT_RECORD_BYTES_CEILING =
  ARTIFACT_BYTES_PER_RECORD + ARTIFACT_IDENTITY_CODE_UNITS_CEILING * 2;
/** `Docs/performance-budgets.json` `proposedCapacities.recorderRamBytes`. */
export const ARTIFACT_RECORDER_RAM_BYTES = 33_554_432;

const collisionFields = ['tick', 'incidentId', 'impulseNs', 'otherEntityId'] as const;
const recoveryFields = [
  'tick',
  'operationId',
  'status',
  'pointId',
  'mapId',
  'laneId',
  'mode',
  'validatedTick',
  'learningEligible',
] as const;
const suspensionFields = ['fromTick', 'toTick', 'cause'] as const;
const observationLossFields = ['fromTick', 'ticks'] as const;
const inputFields = [
  'tick',
  'sessionId',
  'worldEpoch',
  'segmentId',
  'vehicleId',
  'incarnation',
  'controlMode',
  'learningEligible',
  'startTick',
  'endTick',
  'segmentCompleteness',
  'closeReason',
  'lostCheckpointTick',
  'observationLoss',
  'collisions',
  'recoveries',
  'suspensions',
] as const;
const optionKeys = ['maxWindows'] as const;
const recoveryModes = ['MANUAL', 'LEARNING'] as const;
const controlModeValues = controlModes;

const identity = (value: unknown, maximum = 256): string => {
  const result = text(value);
  requireContract(result.length <= maximum, 'Artifact identity capacity exceeded');
  return result;
};

const recoverableCause = (status: RecoveryPlacementStatus): ArtifactCause =>
  status === 'DENIED'
    ? 'RECOVERY_DENIED'
    : status === 'PARTIAL'
      ? 'RECOVERY_PARTIAL'
      : 'RECOVERY_TELEPORT';

const suspensionCauseOf = (cause: SuspensionCause): ArtifactCause =>
  cause === 'focus' ? 'SUSPENSION_FOCUS_LOST' : 'SUSPENSION_PAUSE';

const suspensionSourceOf = (cause: SuspensionCause): ArtifactSource =>
  cause === 'focus' || cause === 'menu' || cause === 'panel' ? 'SUSPENSION_070' : 'LOOP_012';

interface InternalArtifact {
  readonly artifactId: string;
  readonly dedupeKey: string;
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
  readonly suspensionCause: SuspensionCause | null;
}

const emptyArtifact = (
  base: Pick<
    InternalArtifact,
    'artifactId' | 'dedupeKey' | 'kind' | 'cause' | 'source' | 'boundaryTick' | 'endTick'
  >,
): InternalArtifact =>
  Object.freeze({
    ...base,
    incidentId: null,
    impulseNs: null,
    otherEntityId: null,
    operationId: null,
    recoveryPointId: null,
    recoveryMapId: null,
    recoveryLaneId: null,
    recoveryMode: null,
    recoveryValidatedTick: null,
    suspensionCause: null,
  });

const artifactIdOf = (
  sessionId: string,
  worldEpoch: number,
  segmentId: string,
  dedupeKey: string,
): string =>
  createStableId('telemetry-artifact', sessionId, [String(worldEpoch), segmentId, dedupeKey]);

const readCollision = (
  value: unknown,
  sessionId: string,
  worldEpoch: number,
  segmentId: string,
): InternalArtifact => {
  const data = fields(value, collisionFields);
  const at = readTick(data.tick);
  const dedupeKey = `collision:${identity(data.incidentId)}`;
  return Object.freeze({
    ...emptyArtifact({
      artifactId: artifactIdOf(sessionId, worldEpoch, segmentId, dedupeKey),
      dedupeKey,
      kind: 'COLLISION',
      cause: 'COLLISION_IMPULSE',
      source: 'COLLISION_028',
      boundaryTick: at,
      endTick: null,
    }),
    incidentId: identity(data.incidentId),
    impulseNs: number(data.impulseNs, 0),
    otherEntityId: identity(data.otherEntityId),
  });
};

const readRecovery = (
  value: unknown,
  sessionId: string,
  worldEpoch: number,
  segmentId: string,
): InternalArtifact => {
  const data = fields(value, recoveryFields);
  const at = readTick(data.tick);
  requireContract(
    boolean(data.learningEligible) === false,
    'A recovery placement is never learning-eligible',
  );
  const status = choice(data.status, recoveryPlacementStatuses);
  const dedupeKey = `recovery:${identity(data.operationId)}`;
  // The full 030 cause and proof is preserved so a later estimator can attribute the placement.
  return Object.freeze({
    ...emptyArtifact({
      artifactId: artifactIdOf(sessionId, worldEpoch, segmentId, dedupeKey),
      dedupeKey,
      kind: 'TELEPORT',
      cause: recoverableCause(status),
      source: 'RECOVERY_030',
      boundaryTick: at,
      endTick: null,
    }),
    operationId: identity(data.operationId),
    recoveryPointId: identity(data.pointId),
    recoveryMapId: identity(data.mapId),
    recoveryLaneId: identity(data.laneId),
    recoveryMode: choice(data.mode, recoveryModes),
    recoveryValidatedTick: readTick(data.validatedTick),
  });
};

const readSuspension = (
  value: unknown,
  sessionId: string,
  worldEpoch: number,
  segmentId: string,
): InternalArtifact => {
  const data = fields(value, suspensionFields);
  const fromTick = readTick(data.fromTick);
  const cause = choice(data.cause, suspensionCauses);
  const toTick = data.toTick === null ? null : readTick(data.toTick);
  requireContract(toTick === null || toTick >= fromTick, 'Suspension ends before it starts');
  const dedupeKey = `pause:${fromTick}:${cause}`;
  return Object.freeze({
    ...emptyArtifact({
      artifactId: artifactIdOf(sessionId, worldEpoch, segmentId, dedupeKey),
      dedupeKey,
      kind: 'PAUSE',
      cause: suspensionCauseOf(cause),
      source: suspensionSourceOf(cause),
      boundaryTick: fromTick,
      endTick: toTick,
    }),
    suspensionCause: cause,
  });
};

const incompleteArtifact = (
  sessionId: string,
  worldEpoch: number,
  segmentId: string,
  cause: ArtifactCause,
  source: ArtifactSource,
  boundaryTick: number,
): InternalArtifact => {
  const dedupeKey = `incomplete:${cause}:${boundaryTick}`;
  return emptyArtifact({
    artifactId: artifactIdOf(sessionId, worldEpoch, segmentId, dedupeKey),
    dedupeKey,
    kind: 'INCOMPLETE_SAMPLE',
    cause,
    source,
    boundaryTick,
    endTick: null,
  });
};

/** The incomplete-sample artifacts the segment facts prove; each has a stable, explicit tick. */
const incompleteArtifacts = (params: {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly segmentCompleteness: ArtifactSegmentCompletenessInput;
  readonly closeReason: TickSampleCloseReason | null;
  readonly endTick: number | null;
  readonly lostCheckpointTick: number | null;
  readonly observationLossFromTick: number | null;
}): readonly InternalArtifact[] => {
  const result: InternalArtifact[] = [];
  if (params.lostCheckpointTick !== null)
    result.push(
      incompleteArtifact(
        params.sessionId,
        params.worldEpoch,
        params.segmentId,
        'CHECKPOINT_LOST',
        'CHECKPOINT_222',
        params.lostCheckpointTick,
      ),
    );
  if (params.observationLossFromTick !== null)
    result.push(
      incompleteArtifact(
        params.sessionId,
        params.worldEpoch,
        params.segmentId,
        'OBSERVATION_GAP',
        'TICK_SAMPLES_085',
        params.observationLossFromTick,
      ),
    );
  if (params.endTick !== null) {
    if (params.segmentCompleteness === 'INCOMPLETE')
      result.push(
        incompleteArtifact(
          params.sessionId,
          params.worldEpoch,
          params.segmentId,
          'SEGMENT_INCOMPLETE',
          'SEGMENT_069',
          params.endTick,
        ),
      );
    if (params.closeReason === 'DATA_LOSS')
      result.push(
        incompleteArtifact(
          params.sessionId,
          params.worldEpoch,
          params.segmentId,
          'CLOSE_REASON_DATA_LOSS',
          'SEGMENT_069',
          params.endTick,
        ),
      );
  }
  return Object.freeze(result);
};

/** The documented split rule, exported so a reader can reproduce the exact boundary. */
export function splitWindowAtArtifacts(input: {
  readonly startTick: number;
  readonly windowEndTick: number;
  readonly artifacts: readonly Pick<InternalArtifact, 'boundaryTick'>[];
}): {
  readonly boundaryTick: number | null;
  readonly prefix: TelemetrySpan | null;
  readonly suppressed: TelemetrySpan | null;
} {
  const startTick = readTick(input.startTick);
  const windowEndTick = readTick(input.windowEndTick);
  requireContract(windowEndTick >= startTick, 'Window ends before it starts');
  let boundaryTick: number | null = null;
  for (const artifact of input.artifacts) {
    const at = readTick(artifact.boundaryTick);
    if (boundaryTick === null || at < boundaryTick) boundaryTick = at;
  }
  if (boundaryTick === null)
    return Object.freeze({
      boundaryTick: null,
      prefix: Object.freeze({
        fromTick: startTick,
        toTick: windowEndTick,
        ticks: windowEndTick - startTick + 1,
      }),
      suppressed: null,
    });
  if (boundaryTick <= startTick)
    return Object.freeze({
      boundaryTick,
      prefix: null,
      suppressed: Object.freeze({
        fromTick: startTick,
        toTick: windowEndTick,
        ticks: windowEndTick - startTick + 1,
      }),
    });
  return Object.freeze({
    boundaryTick,
    prefix: Object.freeze({
      fromTick: startTick,
      toTick: boundaryTick - 1,
      ticks: boundaryTick - startTick,
    }),
    suppressed: Object.freeze({
      fromTick: boundaryTick,
      toTick: windowEndTick,
      ticks: windowEndTick - boundaryTick + 1,
    }),
  });
}

interface Completeness {
  readonly completeness: WindowCompleteness;
  readonly reason: CompletenessReason;
}

const completenessRank: Record<WindowCompleteness, number> = {
  COMPLETE: 0,
  PARTIAL: 1,
  TRUNCATED: 2,
};

/** Input completeness tightens in this order: OPEN -> CLOSED -> INCOMPLETE. */
const segmentCompletenessRank: Record<ArtifactSegmentCompletenessInput, number> = {
  OPEN: 0,
  CLOSED: 1,
  INCOMPLETE: 2,
};

const resolveCompleteness = (input: {
  readonly segmentCompleteness: ArtifactSegmentCompletenessInput;
  readonly closeReason: TickSampleCloseReason | null;
  readonly lostCheckpointTick: number | null;
  readonly observationGapTicks: number;
  readonly hasTeleport: boolean;
  readonly hasCollisionOrPause: boolean;
}): Completeness => {
  if (input.lostCheckpointTick !== null)
    return Object.freeze({ completeness: 'TRUNCATED', reason: 'CHECKPOINT_LOST' });
  if (input.closeReason === 'DATA_LOSS')
    return Object.freeze({ completeness: 'TRUNCATED', reason: 'DATA_LOSS' });
  if (input.segmentCompleteness === 'INCOMPLETE')
    return Object.freeze({ completeness: 'TRUNCATED', reason: 'SEGMENT_INCOMPLETE' });
  if (input.observationGapTicks > 0)
    return Object.freeze({ completeness: 'PARTIAL', reason: 'OBSERVATION_GAP' });
  if (input.hasTeleport) return Object.freeze({ completeness: 'PARTIAL', reason: 'RECOVERY' });
  if (input.hasCollisionOrPause)
    return Object.freeze({ completeness: 'PARTIAL', reason: 'TRUNCATED_BY_ARTIFACT' });
  if (input.segmentCompleteness === 'OPEN')
    return Object.freeze({ completeness: 'PARTIAL', reason: 'OPEN_SEGMENT' });
  if (input.closeReason === 'SHUTDOWN')
    return Object.freeze({ completeness: 'PARTIAL', reason: 'SHUTDOWN' });
  return Object.freeze({ completeness: 'COMPLETE', reason: 'SEGMENT_CLOSED' });
};

const mostRestrictive = (left: Completeness, right: Completeness): Completeness =>
  completenessRank[right.completeness] > completenessRank[left.completeness] ? right : left;

interface InternalWindow {
  readonly windowId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly openedTick: number;
  startTick: number;
  endTick: number | null;
  segmentCompleteness: ArtifactSegmentCompletenessInput;
  closeReason: TickSampleCloseReason | null;
  lostCheckpointTick: number | null;
  lostObservationFromTick: number | null;
  observationGapTicks: number;
  lastTick: number;
  observationCount: number;
  readonly artifactKeys: Set<string>;
  readonly artifacts: InternalArtifact[];
}

function materialize(entry: InternalWindow): FilteredWindowRecord {
  const windowEndTick = entry.endTick ?? entry.lastTick;
  const split = splitWindowAtArtifacts({
    startTick: entry.startTick,
    windowEndTick,
    artifacts: entry.artifacts,
  });
  const hasTeleport = entry.artifacts.some((artifact) => artifact.kind === 'TELEPORT');
  const hasCollisionOrPause = entry.artifacts.some(
    (artifact) => artifact.kind === 'COLLISION' || artifact.kind === 'PAUSE',
  );
  const { completeness, reason } = resolveCompleteness({
    segmentCompleteness: entry.segmentCompleteness,
    closeReason: entry.closeReason,
    lostCheckpointTick: entry.lostCheckpointTick,
    observationGapTicks: entry.observationGapTicks,
    hasTeleport,
    hasCollisionOrPause,
  });
  const ordered = Object.freeze(
    [...entry.artifacts].sort((left, right) =>
      left.boundaryTick === right.boundaryTick
        ? left.dedupeKey < right.dedupeKey
          ? -1
          : left.dedupeKey > right.dedupeKey
            ? 1
            : 0
        : left.boundaryTick < right.boundaryTick
          ? -1
          : 1,
    ),
  );
  const boundary = entry.artifacts.find((artifact) => artifact.boundaryTick === split.boundaryTick);
  const publicArtifacts: readonly TelemetryArtifact[] = Object.freeze(
    ordered.map((artifact) =>
      Object.freeze({
        artifactId: artifact.artifactId,
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
  const base = {
    windowId: entry.windowId,
    sessionId: entry.sessionId,
    worldEpoch: entry.worldEpoch,
    segmentId: entry.segmentId,
    vehicleId: entry.vehicleId,
    incarnation: entry.incarnation,
    controlMode: entry.controlMode,
    learningEligible: entry.learningEligible,
    startTick: entry.startTick,
    endTick: entry.endTick,
    completeness,
    completenessReason: reason,
    artifacts: publicArtifacts,
    artifactCount: publicArtifacts.length,
    boundaryTick: split.boundaryTick,
    boundaryCause: boundary ? boundary.cause : null,
    suppressed: split.suppressed,
    openedTick: entry.openedTick,
    lastTick: entry.lastTick,
    observationCount: entry.observationCount,
  };
  if (split.prefix === null)
    return Object.freeze({ ...base, windowClass: 'FULLY_SUPPRESSED', prefix: null });
  return Object.freeze({ ...base, windowClass: 'PREFIX_ELIGIBLE', prefix: split.prefix });
}

function windowCodeUnits(entry: InternalWindow): number {
  let units =
    entry.windowId.length +
    entry.segmentId.length +
    entry.vehicleId.length +
    entry.incarnation.length +
    entry.sessionId.length;
  for (const artifact of entry.artifacts)
    units += artifact.artifactId.length + artifact.dedupeKey.length;
  return units;
}

/**
 * Bounded 088 artefact filter. Windows are keyed by the 069/085 segment id; a later evaluation only
 * ever adds artifacts or worsens the completeness, so a segment that was once partially suppressed
 * can never drift back into a complete, fully usable observation.
 */
export function createArtifactFilter(options: ArtifactFilterOptions = {}): ArtifactFilter {
  const config = record(options);
  for (const key of Object.keys(config))
    requireContract(
      optionKeys.includes(key as (typeof optionKeys)[number]),
      'Unknown artifact filter option',
    );
  const maxWindows =
    config.maxWindows === undefined ? ARTIFACT_CAPACITY.default : readTick(config.maxWindows);
  requireContract(
    maxWindows >= ARTIFACT_CAPACITY.minimum && maxWindows <= ARTIFACT_CAPACITY.maximum,
    'Artifact filter capacity out of range',
  );
  requireContract(
    maxWindows * ARTIFACT_RECORD_BYTES_CEILING <= ARTIFACT_RECORDER_RAM_BYTES,
    'Artifact filter cannot fit the recorder RAM budget',
  );

  let disposed = false;
  let sessionId: string | null = null;
  let worldEpoch: number | null = null;
  let lastEvaluatedTick: number | null = null;
  let windowsEvaluated = 0;
  let evaluationCalls = 0;
  let checkpointLosses = 0;
  let retiredTotal = 0;
  let rejectedTotal = 0;
  let skippedTicks = 0;
  let preferenceEvidenceEmitted = 0;
  let preferenceEvidenceRefused = 0;

  const classCounts = new Map<ArtifactWindowClass, number>([
    ['PREFIX_ELIGIBLE', 0],
    ['FULLY_SUPPRESSED', 0],
  ]);
  const completenessCounts = new Map<WindowCompleteness, number>([
    ['COMPLETE', 0],
    ['PARTIAL', 0],
    ['TRUNCATED', 0],
  ]);
  const kindCounts = new Map<ArtifactKind, number>(artifactKinds.map((kind) => [kind, 0]));
  const causeCounts = new Map<ArtifactCause, number>(artifactCauses.map((cause) => [cause, 0]));
  let usableTicks = 0;
  let suppressedTicks = 0;
  let artifactsTotal = 0;
  const retained = new Map<string, InternalWindow>();
  const order: InternalWindow[] = [];

  const alive = () => requireContract(!disposed, 'Artifact filter disposed');

  const addArtifact = (entry: InternalWindow, artifact: InternalArtifact): void => {
    if (entry.artifactKeys.has(artifact.dedupeKey)) return;
    entry.artifactKeys.add(artifact.dedupeKey);
    entry.artifacts.push(artifact);
    artifactsTotal += 1;
    kindCounts.set(artifact.kind, (kindCounts.get(artifact.kind) ?? 0) + 1);
    causeCounts.set(artifact.cause, (causeCounts.get(artifact.cause) ?? 0) + 1);
  };

  /** Re-scores the cumulative window/class/tick denominators after a monotone change. */
  const rescore = (before: FilteredWindowRecord | null, after: FilteredWindowRecord): void => {
    if (before !== null) {
      classCounts.set(before.windowClass, (classCounts.get(before.windowClass) ?? 0) - 1);
      completenessCounts.set(
        before.completeness,
        (completenessCounts.get(before.completeness) ?? 0) - 1,
      );
      usableTicks -= before.prefix?.ticks ?? 0;
      suppressedTicks -= before.suppressed?.ticks ?? 0;
    }
    classCounts.set(after.windowClass, (classCounts.get(after.windowClass) ?? 0) + 1);
    completenessCounts.set(
      after.completeness,
      (completenessCounts.get(after.completeness) ?? 0) + 1,
    );
    usableTicks += after.prefix?.ticks ?? 0;
    suppressedTicks += after.suppressed?.ticks ?? 0;
  };

  const retire = (entry: InternalWindow) => {
    // Cumulative window/class/tick evidence survives retirement, exactly like the 086/087
    // denominators; only the retained store shrinks.
    retained.delete(entry.segmentId);
    retiredTotal += 1;
  };

  return Object.freeze({
    version: ARTIFACT_FILTER_VERSION,
    evaluate(value: ArtifactFilterInput): FilteredWindowRecord {
      alive();
      const data = fields(value, inputFields);
      const tick = readTick(data.tick);
      const evaluationSession = identity(data.sessionId);
      const evaluationEpoch = readTick(data.worldEpoch);
      if (sessionId === null && worldEpoch === null) {
        sessionId = evaluationSession;
        worldEpoch = evaluationEpoch;
      }
      requireContract(
        evaluationSession === sessionId && evaluationEpoch === worldEpoch,
        'Artifact evaluation belongs to another session or world epoch',
      );
      if (lastEvaluatedTick !== null) {
        requireContract(tick >= lastEvaluatedTick, 'Artifact evaluation tick regressed');
        skippedTicks += tick - lastEvaluatedTick - 1;
      }
      lastEvaluatedTick = tick;
      evaluationCalls += 1;

      const segment = identity(data.segmentId);
      const vehicleId = identity(data.vehicleId);
      const incarnation = identity(data.incarnation);
      const controlMode = choice(data.controlMode, controlModeValues);
      const learningEligible = boolean(data.learningEligible);
      requireContract(
        !learningEligible || controlMode === 'LEARNING',
        'Only LEARNING can produce learning-eligible windows',
      );
      const startTick = readTick(data.startTick);
      const endTick = data.endTick === null ? null : readTick(data.endTick);
      requireContract(endTick === null || endTick >= startTick, 'Segment ends before it starts');
      const segmentCompleteness = choice(
        data.segmentCompleteness,
        artifactSegmentCompletenessInputs,
      );
      requireContract(
        (segmentCompleteness === 'OPEN') === (endTick === null),
        'Segment completeness and end tick disagree',
      );
      const closeReason =
        data.closeReason === null ? null : choice(data.closeReason, segmentCloseReasons);
      requireContract(
        (segmentCompleteness === 'OPEN') === (closeReason === null),
        'Segment completeness and close reason disagree',
      );
      const lostCheckpointTick =
        data.lostCheckpointTick === null ? null : readTick(data.lostCheckpointTick);
      requireContract(
        lostCheckpointTick === null || lostCheckpointTick >= startTick,
        'Lost checkpoint precedes the window',
      );
      const observationLoss =
        data.observationLoss === null
          ? null
          : (() => {
              const lossData = fields(data.observationLoss, observationLossFields);
              const fromTick = readTick(lossData.fromTick);
              requireContract(fromTick >= startTick, 'Observation loss precedes the window');
              return Object.freeze({ fromTick, ticks: readTick(lossData.ticks) });
            })();
      const observationGapTicks = observationLoss?.ticks ?? 0;

      const collisions = list(data.collisions, (entry) =>
        readCollision(entry, evaluationSession, evaluationEpoch, segment),
      );
      const recoveries = list(data.recoveries, (entry) =>
        readRecovery(entry, evaluationSession, evaluationEpoch, segment),
      );
      const suspensions = list(data.suspensions, (entry) =>
        readSuspension(entry, evaluationSession, evaluationEpoch, segment),
      );
      for (const artifact of [...collisions, ...recoveries, ...suspensions])
        requireContract(
          artifact.boundaryTick >= startTick &&
            (endTick === null || artifact.boundaryTick <= endTick),
          'Artifact lies outside the window',
        );
      const proven = incompleteArtifacts({
        sessionId: evaluationSession,
        worldEpoch: evaluationEpoch,
        segmentId: segment,
        segmentCompleteness,
        closeReason,
        endTick,
        lostCheckpointTick,
        observationLossFromTick: observationLoss?.fromTick ?? null,
      });

      const existing = retained.get(segment);
      if (existing !== undefined) {
        requireContract(
          existing.vehicleId === vehicleId &&
            existing.incarnation === incarnation &&
            existing.controlMode === controlMode &&
            existing.learningEligible === learningEligible,
          'Artifact window identity changed mid-segment',
        );
        const before = materialize(existing);
        existing.endTick =
          endTick === null ? existing.endTick : Math.max(existing.endTick ?? endTick, endTick);
        // The input completeness only ever tightens: OPEN -> CLOSED -> INCOMPLETE.
        existing.segmentCompleteness =
          segmentCompletenessRank[segmentCompleteness] >
          segmentCompletenessRank[existing.segmentCompleteness]
            ? segmentCompleteness
            : existing.segmentCompleteness;
        if (closeReason !== null) existing.closeReason = closeReason;
        if (lostCheckpointTick !== null)
          existing.lostCheckpointTick =
            existing.lostCheckpointTick === null
              ? lostCheckpointTick
              : Math.min(existing.lostCheckpointTick, lostCheckpointTick);
        if (observationLoss !== null)
          existing.lostObservationFromTick =
            existing.lostObservationFromTick === null
              ? observationLoss.fromTick
              : Math.min(existing.lostObservationFromTick, observationLoss.fromTick);
        existing.observationGapTicks = Math.max(existing.observationGapTicks, observationGapTicks);
        for (const artifact of [
          ...collisions,
          ...recoveries,
          ...suspensions,
          ...incompleteArtifacts({
            sessionId: evaluationSession,
            worldEpoch: evaluationEpoch,
            segmentId: segment,
            segmentCompleteness: existing.segmentCompleteness,
            closeReason: existing.closeReason,
            endTick: existing.endTick,
            lostCheckpointTick: existing.lostCheckpointTick,
            observationLossFromTick: existing.lostObservationFromTick,
          }),
        ])
          addArtifact(existing, artifact);
        requireContract(
          existing.artifacts.length <= ARTIFACT_MAX_PER_WINDOW,
          'Artifact window capacity exceeded',
        );
        existing.lastTick = Math.max(existing.lastTick, tick);
        existing.observationCount += 1;
        const after = materialize(existing);
        // The completeness can only tighten; a window never becomes more complete than it was.
        const tightened = mostRestrictive(
          { completeness: before.completeness, reason: before.completenessReason },
          { completeness: after.completeness, reason: after.completenessReason },
        );
        const finalRecord: FilteredWindowRecord =
          tightened.completeness === after.completeness
            ? after
            : Object.freeze({
                ...after,
                completeness: tightened.completeness,
                completenessReason: tightened.reason,
              });
        rescore(before, finalRecord);
        return finalRecord;
      }

      while (order.length >= maxWindows) {
        const oldest = order.shift();
        if (oldest === undefined) break;
        retire(oldest);
      }
      const opened: InternalWindow = {
        windowId: createStableId('telemetry-window', evaluationSession, [
          String(evaluationEpoch),
          segment,
        ]),
        sessionId: evaluationSession,
        worldEpoch: evaluationEpoch,
        segmentId: segment,
        vehicleId,
        incarnation,
        controlMode,
        learningEligible,
        openedTick: tick,
        startTick,
        endTick,
        segmentCompleteness,
        closeReason,
        lostCheckpointTick,
        lostObservationFromTick: observationLoss?.fromTick ?? null,
        observationGapTicks,
        lastTick: tick,
        observationCount: 1,
        artifactKeys: new Set<string>(),
        artifacts: [],
      };
      for (const artifact of [...collisions, ...recoveries, ...suspensions, ...proven])
        addArtifact(opened, artifact);
      if (opened.artifactKeys.size > ARTIFACT_MAX_PER_WINDOW) {
        rejectedTotal += 1;
        throw new Error('Artifact window capacity exceeded');
      }
      if (lostCheckpointTick !== null) checkpointLosses += 1;
      retained.set(segment, opened);
      order.push(opened);
      windowsEvaluated += 1;
      const record = materialize(opened);
      rescore(null, record);
      return record;
    },
    emitPreImpactEvidence(entry: PrefixEligibleWindowRecord): PreImpactEvidenceRecord {
      alive();
      const owned = retained.get(entry.segmentId);
      // The runtime gate: the window must still be owned by this layer, still have a usable prefix,
      // and the caller's record must still claim PREFIX_ELIGIBLE.
      const valid =
        owned !== undefined &&
        owned.windowId === entry.windowId &&
        entry.windowClass === 'PREFIX_ELIGIBLE' &&
        entry.prefix !== null &&
        entry.prefix.ticks > 0 &&
        materialize(owned).windowClass === 'PREFIX_ELIGIBLE';
      if (!valid) {
        preferenceEvidenceRefused += 1;
        throw new Error(
          'Only a window with a usable pre-impact prefix can become preference evidence',
        );
      }
      preferenceEvidenceEmitted += 1;
      return Object.freeze({
        version: ARTIFACT_FILTER_VERSION,
        windowId: entry.windowId,
        segmentId: entry.segmentId,
        vehicleId: entry.vehicleId,
        incarnation: entry.incarnation,
        usableFromTick: entry.prefix.fromTick,
        usableToTick: entry.prefix.toTick,
        usableTicks: entry.prefix.ticks,
        wholeWindow: entry.boundaryTick === null,
        boundaryTick: entry.boundaryTick,
        boundaryCause: entry.boundaryCause,
      });
    },
    getWindow(segmentId: string) {
      const found = retained.get(identity(segmentId));
      return found ? materialize(found) : null;
    },
    getWindows: () => Object.freeze(order.map(materialize)),
    getDenominators(): ArtifactDenominators {
      const byKind = artifactKinds.map((kind) =>
        Object.freeze({ kind, count: kindCounts.get(kind) ?? 0 }),
      );
      const byCause = artifactCauses.map((cause) =>
        Object.freeze({
          cause,
          source: artifactCauseSources[cause][0]!,
          count: causeCounts.get(cause) ?? 0,
        }),
      );
      return Object.freeze({
        version: ARTIFACT_FILTER_VERSION,
        total: windowsEvaluated,
        prefixEligible: classCounts.get('PREFIX_ELIGIBLE') ?? 0,
        fullySuppressed: classCounts.get('FULLY_SUPPRESSED') ?? 0,
        complete: completenessCounts.get('COMPLETE') ?? 0,
        partial: completenessCounts.get('PARTIAL') ?? 0,
        truncated: completenessCounts.get('TRUNCATED') ?? 0,
        usableTicks,
        suppressedTicks,
        artifactsTotal,
        byKind: Object.freeze(byKind),
        byCause: Object.freeze(byCause),
        preferenceEvidenceEmitted,
        preferenceEvidenceRefused,
      });
    },
    getStats(): ArtifactStats {
      let identityCodeUnits = 0;
      let prefixEligibleRetained = 0;
      for (const entry of order) {
        identityCodeUnits += windowCodeUnits(entry);
        if (materialize(entry).windowClass === 'PREFIX_ELIGIBLE') prefixEligibleRetained += 1;
      }
      return Object.freeze({
        version: ARTIFACT_FILTER_VERSION,
        disposed,
        maxWindows,
        windowsEvaluated,
        evaluationCalls,
        checkpointLosses,
        retiredTotal,
        rejectedTotal,
        skippedTicks,
        preferenceEvidenceEmitted,
        preferenceEvidenceRefused,
        retained: order.length,
        prefixEligibleRetained,
        identityCodeUnits,
        estimatedBytes: order.length * ARTIFACT_BYTES_PER_RECORD + identityCodeUnits * 2,
        estimatedBytesMaximum: maxWindows * ARTIFACT_RECORD_BYTES_CEILING,
      });
    },
    dispose() {
      if (disposed) return;
      order.length = 0;
      retained.clear();
      disposed = true;
    },
  });
}
