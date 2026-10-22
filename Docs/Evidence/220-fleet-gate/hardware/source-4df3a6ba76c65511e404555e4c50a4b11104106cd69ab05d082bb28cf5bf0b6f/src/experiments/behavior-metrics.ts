import { requireContract } from '../sessions';
import type { FleetRegistry } from '../fleet';
import {
  opportunityKinds,
  opportunityOutcomeTable,
  opportunitySuccessOutcomes,
} from '../telemetry';
import type { OpportunityKind, OpportunityOutcome } from '../telemetry';

/**
 * 138 behavior metrics: incremental compliance, violation, reaction, speed and headway indicators
 * over idempotent events.
 *
 * The service owns no clock, world, renderer, DOM, profile or policy. It accumulates counters, sums
 * and bounded histograms from accepted events, so a snapshot never rescans a history: `historyScans`
 * is structurally `0` and no full sample history is retained.
 *
 * Three rules are structural:
 *
 * 1. The opportunity denominator is the set of distinct `(opportunityId, occurrence)` identities. A
 *    repeated frame of the same occurrence is `DUPLICATE` and never changes a numerator or the
 *    denominator, so the same opportunities observed at 10 Hz or 60 Hz produce identical results.
 * 2. An empty denominator is `UNAVAILABLE` with `value: null`, never an apparently perfect rate; a
 *    real zero with a positive denominator stays `AVAILABLE` with `value: 0`.
 * 3. Success and violation are read from the real 086 outcome vocabulary
 *    (`opportunitySuccessOutcomes` and the documented failure table), never inferred from a frame
 *    count. An outcome that contradicts the declared `success`/`violation` flag is rejected.
 *
 * Events may arrive out of tick order. Every aggregate is a sum/count/histogram, so the final
 * snapshot is independent of arrival order; `minTick`/`maxTick` report the accepted range instead of
 * forcing monotonicity. The service never fabricates a duration, a speed, a limit or an opportunity.
 */
export const BEHAVIOR_METRICS_VERSION = '138-behavior-metrics-v1' as const;

/** Alias used by composition roots that name the contract by its exported symbol. */
export const behaviorMetricsVersion = BEHAVIOR_METRICS_VERSION;

/** Pseudo-kind of the aggregated row; every real row keeps its 086 kind. */
export const BEHAVIOR_OVERALL = 'ALL' as const;
export type BehaviorGroupKind = OpportunityKind | typeof BEHAVIOR_OVERALL;

/** Closed event vocabulary. The discriminator is `kind`. */
export const behaviorEventKinds = ['OPPORTUNITY_RESOLVED', 'SPEED_SAMPLE'] as const;
export type BehaviorEventKind = (typeof behaviorEventKinds)[number];

export const behaviorMetricUnits = ['count', 'ratio', 'percentage', 'seconds', 'mps'] as const;
export type BehaviorMetricUnit = (typeof behaviorMetricUnits)[number];

export const behaviorMetricStates = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type BehaviorMetricState = (typeof behaviorMetricStates)[number];

export const behaviorIngestStatuses = ['ACCEPTED', 'DUPLICATE', 'REJECTED'] as const;
export type BehaviorIngestStatus = (typeof behaviorIngestStatuses)[number];

/** Closed rejection vocabulary; a rejected event never changes an aggregate. */
export const behaviorRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'UNKNOWN_KIND',
  'UNKNOWN_OUTCOME',
  'INCONSISTENT_OUTCOME',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'LIMIT_EXCEEDED',
] as const;
export type BehaviorRejectionReason = (typeof behaviorRejectionReasons)[number];

/** Closed unavailable vocabulary; an unavailable value is never a zero. */
export const behaviorUnavailableReasons = [
  'NO_OPPORTUNITIES',
  'NO_REACTION_SAMPLES',
  'NO_STOP_DWELL',
  'NO_SPEED_SAMPLES',
  'NO_LIMIT',
  'NO_ELIGIBLE_SPEED',
  'NO_HEADWAY_SAMPLES',
] as const;
export type BehaviorUnavailableReason = (typeof behaviorUnavailableReasons)[number];

/** Closed metric identity, in canonical order. Each identity carries exactly one unit. */
export const BEHAVIOR_METRIC_IDS = [
  'eligibleOpportunities',
  'successes',
  'violations',
  'complianceRate',
  'violationRate',
  'completeStops',
  'stopDwellSeconds',
  'meanStopDwellSeconds',
  'reactionSamples',
  'meanReactionSeconds',
  'medianReactionSeconds',
  'speedSamples',
  'meanSpeedMps',
  'medianSpeedMps',
  'p90SpeedMps',
  'limitedSpeedSamples',
  'limitedSeconds',
  'meanLimitMps',
  'overLimitSamples',
  'overLimitSeconds',
  'overLimitFraction',
  'headwaySamples',
  'ineligibleHeadwaySamples',
  'meanHeadwaySeconds',
  'medianHeadwaySeconds',
  'p90HeadwaySeconds',
] as const;
export type BehaviorMetricId = (typeof BEHAVIOR_METRIC_IDS)[number];

export const BEHAVIOR_UNIT_BY_ID: Readonly<Record<BehaviorMetricId, BehaviorMetricUnit>> =
  Object.freeze({
    eligibleOpportunities: 'count',
    successes: 'count',
    violations: 'count',
    complianceRate: 'percentage',
    violationRate: 'percentage',
    completeStops: 'count',
    stopDwellSeconds: 'seconds',
    meanStopDwellSeconds: 'seconds',
    reactionSamples: 'count',
    meanReactionSeconds: 'seconds',
    medianReactionSeconds: 'seconds',
    speedSamples: 'count',
    meanSpeedMps: 'mps',
    medianSpeedMps: 'mps',
    p90SpeedMps: 'mps',
    limitedSpeedSamples: 'count',
    limitedSeconds: 'seconds',
    meanLimitMps: 'mps',
    overLimitSamples: 'count',
    overLimitSeconds: 'seconds',
    overLimitFraction: 'ratio',
    headwaySamples: 'count',
    ineligibleHeadwaySamples: 'count',
    meanHeadwaySeconds: 'seconds',
    medianHeadwaySeconds: 'seconds',
    p90HeadwaySeconds: 'seconds',
  });

/**
 * The documented consequence of each real 086 outcome. `success` comes from
 * `opportunitySuccessOutcomes`; `violation` is the failure half that is a traffic violation (a missed
 * green or an aborted lane change is a failure but not a violation). An explicit `violation` flag
 * must match this table, otherwise the event is rejected as `INCONSISTENT_OUTCOME`.
 */
export const BEHAVIOR_OUTCOME_VIOLATION: Readonly<Record<OpportunityOutcome, boolean>> =
  Object.freeze({
    STOPPED: false,
    CROSSED_WITHOUT_STOP: true,
    HELD: false,
    CROSSED: true,
    RELEASED: false,
    MISSED: false,
    YIELDED: false,
    PROCEEDED: true,
    COMPLETED: false,
    ABORTED: false,
  });

/** Every outcome of the closed 086 table, used only to distinguish `UNKNOWN_OUTCOME`. */
const allOutcomes: readonly OpportunityOutcome[] = Object.freeze(
  opportunityKinds.flatMap((kind) => [...opportunityOutcomeTable[kind]]),
);

export const BEHAVIOR_LIMITS = Object.freeze({
  version: BEHAVIOR_METRICS_VERSION,
  /** Bounded idempotency memory; the oldest accepted key is evicted first. */
  retainedKeys: 8192,
  /** Code units per accepted identity. */
  idCodeUnits: 1024,
  /** Upper bound of every accumulated counter/sum. */
  maximumSum: Number.MAX_SAFE_INTEGER,
  /** One event can describe at most one simulated day at the fixed 60 Hz tick rate. */
  maximumTicksPerEvent: 86_400 * 60,
  /** One speed observation above this is not a road vehicle; it is refused, not clamped. */
  maximumSpeedMps: 200,
  /** One headway observation above one simulated day is refused, not clamped. */
  maximumHeadwaySeconds: 86_400,
  /** Same standstill threshold as the real 048 following contract; headway needs a moving ego. */
  minimumEligibleSpeedMps: 0.1,
  /** Fixed simulation rate used to express a tick span in seconds; no wall clock is read. */
  reactionTickHz: 60,
  /** Declared simulated duration of one accepted speed sample (10 Hz decision cadence). */
  sampleSeconds: 0.1,
});

/**
 * Histogram resolution, documented because `median`/`p90` are bucket estimates, not exact order
 * statistics: retaining every sample would be an unbounded history. The bucket *midpoint* is
 * reported, so the maximum error is half the width of one bucket.
 */
export const BEHAVIOR_HISTOGRAMS = Object.freeze({
  speed: Object.freeze({ binWidth: 0.5, bins: 401 }),
  reaction: Object.freeze({ binWidth: 0.25, bins: 241 }),
  headway: Object.freeze({ binWidth: 0.25, bins: 481 }),
});

/** One metric value. `value` is `null` exactly when `state` is `UNAVAILABLE`. */
export interface BehaviorMetricValue {
  readonly id: BehaviorMetricId;
  readonly unit: BehaviorMetricUnit;
  readonly state: BehaviorMetricState;
  readonly value: number | null;
  /** Denominator/numerator count the value was derived from; `null` when unavailable. */
  readonly sampleSize: number | null;
  readonly reason: BehaviorUnavailableReason | null;
}

export interface BehaviorKindMetrics {
  readonly kind: BehaviorGroupKind;
  /** Distinct eligible 086 occurrences of this kind; the denominator. */
  readonly eligibleOpportunities: BehaviorMetricValue;
  readonly successes: BehaviorMetricValue;
  readonly violations: BehaviorMetricValue;
  /** `successes / eligibleOpportunities × 100`; `NO_OPPORTUNITIES` at a zero denominator. */
  readonly complianceRate: BehaviorMetricValue;
  /** `violations / eligibleOpportunities × 100`; `NO_OPPORTUNITIES` at a zero denominator. */
  readonly violationRate: BehaviorMetricValue;
}

export interface BehaviorStopMetrics {
  readonly kind: 'STOP';
  /** STOP opportunities resolved `STOPPED`. */
  readonly completeStops: BehaviorMetricValue;
  /** Sum of observed dwell, only for stops with a real dwell sample. */
  readonly stopDwellSeconds: BehaviorMetricValue;
  readonly meanStopDwellSeconds: BehaviorMetricValue;
}

export interface BehaviorReactionMetrics {
  readonly kind: 'GREEN';
  /** Eligible GREEN opportunities that carried a reaction sample. */
  readonly reactionSamples: BehaviorMetricValue;
  readonly meanReactionSeconds: BehaviorMetricValue;
  readonly medianReactionSeconds: BehaviorMetricValue;
}

export interface BehaviorSpeedMetrics {
  readonly samples: BehaviorMetricValue;
  readonly meanMps: BehaviorMetricValue;
  readonly medianMps: BehaviorMetricValue;
  readonly p90Mps: BehaviorMetricValue;
  /** Samples that carried a real limit; the only subset the over-limit metrics may use. */
  readonly limitedSamples: BehaviorMetricValue;
  /** `limitedSamples × speedSampleSeconds`. */
  readonly limitedSeconds: BehaviorMetricValue;
  readonly meanLimitMps: BehaviorMetricValue;
  readonly overLimitSamples: BehaviorMetricValue;
  /** `overLimitSamples × speedSampleSeconds`. */
  readonly overLimitSeconds: BehaviorMetricValue;
  /** `overLimitSamples / limitedSamples`; a sample-weighted fraction, never a guess. */
  readonly overLimitFraction: BehaviorMetricValue;
}

export interface BehaviorHeadwayMetrics {
  /** Headway samples taken at an eligible (moving) ego speed. */
  readonly samples: BehaviorMetricValue;
  /** Headway observations refused for the distribution because the ego was not moving. */
  readonly ineligibleSamples: BehaviorMetricValue;
  readonly meanSeconds: BehaviorMetricValue;
  readonly medianSeconds: BehaviorMetricValue;
  readonly p90Seconds: BehaviorMetricValue;
}

export interface BehaviorFleetCounts {
  readonly vehicles: number;
  readonly taxis: number;
  readonly civilians: number;
}

/** One frozen read model over the accepted aggregates. No list or history is read to build it. */
export interface BehaviorMetricsSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof BEHAVIOR_METRICS_VERSION;
  readonly tick: number;
  /** Declared simulated exposure; informational, never a denominator for the per-opportunity rates. */
  readonly simulatedSeconds: number;
  /** Optional whole-fleet context; `null` when the caller did not declare it. */
  readonly fleet: BehaviorFleetCounts | null;
  readonly overall: BehaviorKindMetrics;
  /** Canonical order: STOP, RED, GREEN, YIELD, LANE_CHANGE. */
  readonly byKind: readonly BehaviorKindMetrics[];
  readonly stops: BehaviorStopMetrics;
  readonly reactions: BehaviorReactionMetrics;
  readonly speed: BehaviorSpeedMetrics;
  readonly headway: BehaviorHeadwayMetrics;
  /** Declared simulated duration of one accepted speed sample. */
  readonly speedSampleSeconds: number;
  /** Structural proof that the snapshot performed no history scan. */
  readonly historyScans: 0;
  readonly snapshotCalls: number;
}

export interface BehaviorSnapshotInput {
  /** Optional whole-fleet context; only `counts` is read. */
  readonly fleet?: Pick<FleetRegistry, 'counts'>;
  readonly tick: number;
  readonly simulatedSeconds?: number;
}

export interface BehaviorIngestResult {
  readonly status: BehaviorIngestStatus;
  /** Event id for an accepted or duplicate event; `null` for a rejected payload. */
  readonly eventId: string | null;
  /** Closed rejection reason; `null` for accepted/duplicate events. */
  readonly reason: BehaviorRejectionReason | null;
}

export interface BehaviorBatchResult {
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
}

export interface BehaviorMetricsStats {
  readonly version: typeof BEHAVIOR_METRICS_VERSION;
  /** Ingest attempts, including duplicates and rejections. */
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  /** Always `0`: aggregates are incremental and no history is ever rescanned. */
  readonly historyScans: 0;
  readonly retainedKeys: number;
  readonly droppedKeys: number;
  readonly snapshotCalls: number;
  readonly minTick: number | null;
  readonly maxTick: number | null;
  readonly lastRejection: BehaviorRejectionReason | null;
  readonly disposed: boolean;
}

export interface BehaviorMetricsResetOptions {
  /** Keeps the ingest/snapshot counters when `true`; aggregates and keys are always cleared. */
  readonly preserveStats?: boolean;
}

export interface BehaviorMetricsReset {
  readonly preserveStats: boolean;
  readonly clearedKeys: number;
  readonly clearedEvents: number;
}

export interface BehaviorMetricsOptions {
  /** Bounded idempotency memory; defaults to `BEHAVIOR_LIMITS.retainedKeys`. */
  readonly retainedKeys?: number;
  /** Declared simulated duration of one accepted speed sample; defaults to `0.1` s. */
  readonly sampleSeconds?: number;
}

export interface BehaviorMetrics {
  readonly version: typeof BEHAVIOR_METRICS_VERSION;
  ingest(event: unknown): BehaviorIngestResult;
  ingestMany(events: readonly unknown[]): BehaviorBatchResult;
  snapshot(input: unknown): BehaviorMetricsSnapshot;
  getStats(): BehaviorMetricsStats;
  reset(options?: unknown): BehaviorMetricsReset;
  dispose(): void;
}

/** Closed input of one resolved 086 occurrence. Timing is optional and never invented. */
export interface BehaviorOpportunityEvent {
  readonly eventId: string;
  readonly kind: 'OPPORTUNITY_RESOLVED';
  readonly opportunityId: string;
  /** Per-registry ordinal of the physical occurrence; the second half of the identity key. */
  readonly occurrence: number;
  readonly opportunityKind: OpportunityKind;
  readonly vehicleId: string;
  readonly resolvedTick: number;
  readonly outcome: OpportunityOutcome;
  /** Must equal membership in the real 086 `opportunitySuccessOutcomes`. */
  readonly success: boolean;
  /** Explicit violation, or `null` to derive it from the real outcome table. */
  readonly violation: boolean | null;
  readonly reactionTicks: number | null;
  readonly dwellTicks: number | null;
  /** Only a sample taken at an eligible (moving) ego speed enters the headway distribution. */
  readonly headwaySeconds: number | null;
  readonly speedMps: number | null;
  readonly limitMps: number | null;
}

export interface BehaviorSpeedSampleEvent {
  readonly eventId: string;
  readonly kind: 'SPEED_SAMPLE';
  readonly tick: number;
  readonly vehicleId: string;
  readonly speedMps: number;
  /** A real map limit, or `null` when the caller cannot certify one. */
  readonly limitMps: number | null;
}

export type BehaviorEvent = BehaviorOpportunityEvent | BehaviorSpeedSampleEvent;

class BehaviorMetricsRejection extends Error {
  readonly reason: BehaviorRejectionReason;
  constructor(reason: BehaviorRejectionReason) {
    super(`Behavior event rejected: ${reason}`);
    this.name = 'BehaviorMetricsRejection';
    this.reason = reason;
  }
}

interface KindTotals {
  eligible: number;
  successes: number;
  violations: number;
}

type ParsedEvent =
  | {
      readonly kind: 'OPPORTUNITY_RESOLVED';
      readonly eventId: string;
      readonly opportunityId: string;
      readonly occurrence: number;
      readonly opportunityKind: OpportunityKind;
      readonly vehicleId: string;
      readonly resolvedTick: number;
      readonly outcome: OpportunityOutcome;
      readonly success: boolean;
      readonly violation: boolean;
      readonly reactionTicks: number | null;
      readonly dwellTicks: number | null;
      readonly headwaySeconds: number | null;
      readonly speedMps: number | null;
      readonly limitMps: number | null;
    }
  | {
      readonly kind: 'SPEED_SAMPLE';
      readonly eventId: string;
      readonly tick: number;
      readonly vehicleId: string;
      readonly speedMps: number;
      readonly limitMps: number | null;
    };

const opportunityFields = [
  'eventId',
  'kind',
  'opportunityId',
  'occurrence',
  'opportunityKind',
  'vehicleId',
  'resolvedTick',
  'outcome',
  'success',
  'violation',
  'reactionTicks',
  'dwellTicks',
  'headwaySeconds',
  'speedMps',
  'limitMps',
] as const;
const speedFields = ['eventId', 'kind', 'tick', 'vehicleId', 'speedMps', 'limitMps'] as const;
const snapshotFields = ['fleet', 'tick', 'simulatedSeconds'] as const;
const snapshotRequired = ['tick'] as const;
const optionKeys = ['retainedKeys', 'sampleSeconds'] as const;

function reject(reason: BehaviorRejectionReason): never {
  throw new BehaviorMetricsRejection(reason);
}

function plainEvent(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) reject('INVALID_SHAPE');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject('INVALID_SHAPE');
  return value as Record<string, unknown>;
}

function readClosedFields(
  data: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): void {
  const keys = Object.keys(data);
  if (keys.length < required.length || keys.length > required.length + optional.length)
    reject('UNKNOWN_FIELD');
  for (const key of required) if (!Object.hasOwn(data, key)) reject('INVALID_SHAPE');
  for (const key of keys)
    if (!required.includes(key) && !optional.includes(key)) reject('UNKNOWN_FIELD');
}

function readIdentity(value: unknown): string {
  if (typeof value !== 'string') reject('INVALID_IDENTITY');
  if (value.length === 0 || value.length > BEHAVIOR_LIMITS.idCodeUnits) reject('INVALID_IDENTITY');
  if (value.trim() !== value) reject('INVALID_IDENTITY');
  return value;
}

function readTickValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    reject('INVALID_NUMBER');
  return value;
}

function readBoundedNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    reject('INVALID_NUMBER');
  return value;
}

function readChoice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value))
    reject('UNKNOWN_KIND');
  return value as T;
}

function readFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') reject('INVALID_SHAPE');
  return value;
}

function readOptionalTicks(value: unknown): number | null {
  if (value === null) return null;
  const result = readTickValue(value);
  if (result > BEHAVIOR_LIMITS.maximumTicksPerEvent) reject('LIMIT_EXCEEDED');
  return result;
}

function readOptionalSpeed(value: unknown): number | null {
  if (value === null) return null;
  const result = readBoundedNumber(value, 0, BEHAVIOR_LIMITS.maximumSpeedMps);
  return result;
}

function readOptionalHeadway(value: unknown): number | null {
  if (value === null) return null;
  const result = readBoundedNumber(value, 0, BEHAVIOR_LIMITS.maximumHeadwaySeconds);
  return result;
}

function readOutcome(value: unknown, kind: OpportunityKind): OpportunityOutcome {
  if (typeof value !== 'string' || !(allOutcomes as readonly string[]).includes(value))
    reject('UNKNOWN_OUTCOME');
  if (!(opportunityOutcomeTable[kind] as readonly string[]).includes(value))
    reject('UNKNOWN_OUTCOME');
  return value as OpportunityOutcome;
}

function parseEvent(value: unknown): ParsedEvent {
  const data = plainEvent(value);
  const kind = readChoice(data.kind, behaviorEventKinds);
  if (kind === 'OPPORTUNITY_RESOLVED') {
    readClosedFields(data, opportunityFields, []);
    const eventId = readIdentity(data.eventId);
    const opportunityId = readIdentity(data.opportunityId);
    const occurrence = readTickValue(data.occurrence);
    const opportunityKind = readChoice(data.opportunityKind, opportunityKinds);
    const vehicleId = readIdentity(data.vehicleId);
    const resolvedTick = readTickValue(data.resolvedTick);
    const outcome = readOutcome(data.outcome, opportunityKind);
    const success = readFlag(data.success);
    if (success !== opportunitySuccessOutcomes.includes(outcome)) reject('INCONSISTENT_OUTCOME');
    const explicitViolation = data.violation === null ? null : readFlag(data.violation);
    const violation = BEHAVIOR_OUTCOME_VIOLATION[outcome];
    if (explicitViolation !== null && explicitViolation !== violation)
      reject('INCONSISTENT_OUTCOME');
    return {
      kind,
      eventId,
      opportunityId,
      occurrence,
      opportunityKind,
      vehicleId,
      resolvedTick,
      outcome,
      success,
      violation,
      reactionTicks: readOptionalTicks(data.reactionTicks),
      dwellTicks: readOptionalTicks(data.dwellTicks),
      headwaySeconds: readOptionalHeadway(data.headwaySeconds),
      speedMps: readOptionalSpeed(data.speedMps),
      limitMps: readOptionalSpeed(data.limitMps),
    };
  }
  readClosedFields(data, speedFields, []);
  return {
    kind,
    eventId: readIdentity(data.eventId),
    tick: readTickValue(data.tick),
    vehicleId: readIdentity(data.vehicleId),
    speedMps: readBoundedNumber(data.speedMps, 0, BEHAVIOR_LIMITS.maximumSpeedMps),
    limitMps: readOptionalSpeed(data.limitMps),
  };
}

function plainSnapshotInput(value: unknown): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Behavior snapshot requires an object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Behavior snapshot requires plain data',
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  requireContract(
    keys.length >= snapshotRequired.length && keys.length <= snapshotFields.length,
    'Behavior snapshot fields',
  );
  for (const key of snapshotRequired)
    requireContract(Object.hasOwn(data, key), `Missing behavior snapshot field: ${key}`);
  for (const key of keys)
    requireContract(
      (snapshotFields as readonly string[]).includes(key),
      'Unknown behavior snapshot field',
    );
  return data;
}

function readCountField(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    `Fleet ${label} count must be a nonnegative integer`,
  );
  return value;
}

function readFleet(value: unknown): BehaviorFleetCounts {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as { counts?: unknown }).counts === 'function',
    'Behavior snapshot requires a fleet counts port',
  );
  const raw: unknown = (value as { counts: () => unknown }).counts();
  requireContract(
    typeof raw === 'object' && raw !== null && !Array.isArray(raw),
    'Fleet counts must be an object',
  );
  const counts = raw as Record<string, unknown>;
  const vehicles = readCountField(counts.vehicles, 'vehicle');
  const taxis = readCountField(counts.taxis, 'taxi');
  const civilians = readCountField(counts.civilians, 'civilian');
  requireContract(
    vehicles === taxis + civilians,
    'Fleet counts must include every vehicle exactly once',
  );
  return Object.freeze({ vehicles, taxis, civilians });
}

function availableMetric(
  id: BehaviorMetricId,
  value: number,
  sampleSize: number,
): BehaviorMetricValue {
  return Object.freeze({
    id,
    unit: BEHAVIOR_UNIT_BY_ID[id],
    state: 'AVAILABLE' as const,
    value,
    sampleSize,
    reason: null,
  });
}

function unavailableMetric(
  id: BehaviorMetricId,
  reason: BehaviorUnavailableReason,
): BehaviorMetricValue {
  return Object.freeze({
    id,
    unit: BEHAVIOR_UNIT_BY_ID[id],
    state: 'UNAVAILABLE' as const,
    value: null,
    sampleSize: null,
    reason,
  });
}

interface Histogram {
  add(value: number): void;
  clear(): void;
  readonly total: number;
  readonly sum: number;
  readonly mean: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  percentile(fraction: number): number | null;
}

/**
 * Bounded, order-independent histogram. `percentile` reports the midpoint of the bucket where the
 * nearest-rank crossing happens; the error is at most half a bucket width, which is why the width is
 * documented instead of pretending to be an exact order statistic.
 */
function createHistogram(config: { readonly binWidth: number; readonly bins: number }): Histogram {
  const { binWidth, bins } = config;
  const counts = new Array<number>(bins).fill(0);
  let total = 0;
  let sum = 0;
  let minimum: number | null = null;
  let maximum: number | null = null;
  return {
    add(value: number) {
      const index = Math.min(Math.max(Math.floor(value / binWidth), 0), bins - 1);
      counts[index] += 1;
      total += 1;
      sum += value;
      minimum = minimum === null ? value : Math.min(minimum, value);
      maximum = maximum === null ? value : Math.max(maximum, value);
    },
    clear() {
      counts.fill(0);
      total = 0;
      sum = 0;
      minimum = null;
      maximum = null;
    },
    get total() {
      return total;
    },
    get sum() {
      return sum;
    },
    get mean() {
      return total === 0 ? null : sum / total;
    },
    get minimum() {
      return minimum;
    },
    get maximum() {
      return maximum;
    },
    percentile(fraction: number) {
      if (total === 0) return null;
      const rank = Math.max(1, Math.min(total, Math.ceil(fraction * total)));
      let cumulative = 0;
      for (let index = 0; index < bins; index += 1) {
        cumulative += counts[index];
        if (cumulative >= rank) return index * binWidth + binWidth / 2;
      }
      return (bins - 1) * binWidth + binWidth / 2;
    },
  };
}

function kindGroup(kind: BehaviorGroupKind, totals: KindTotals): BehaviorKindMetrics {
  const eligible = totals.eligible;
  return Object.freeze({
    kind,
    eligibleOpportunities: availableMetric('eligibleOpportunities', eligible, eligible),
    successes: availableMetric('successes', totals.successes, totals.successes),
    violations: availableMetric('violations', totals.violations, totals.violations),
    complianceRate:
      eligible === 0
        ? unavailableMetric('complianceRate', 'NO_OPPORTUNITIES')
        : availableMetric('complianceRate', (totals.successes / eligible) * 100, eligible),
    violationRate:
      eligible === 0
        ? unavailableMetric('violationRate', 'NO_OPPORTUNITIES')
        : availableMetric('violationRate', (totals.violations / eligible) * 100, eligible),
  });
}

function zeroKindTotals(): KindTotals {
  return { eligible: 0, successes: 0, violations: 0 };
}

export function createBehaviorMetrics(options: BehaviorMetricsOptions = {}): BehaviorMetrics {
  const option = plainEvent(options);
  readClosedFields(option, [], optionKeys);
  const retainedKeys = Object.hasOwn(option, 'retainedKeys')
    ? readBoundedNumber(option.retainedKeys, 1, BEHAVIOR_LIMITS.retainedKeys)
    : BEHAVIOR_LIMITS.retainedKeys;
  requireContract(
    Number.isSafeInteger(retainedKeys),
    'Behavior metrics retained key capacity must be an integer',
  );
  const sampleSeconds = Object.hasOwn(option, 'sampleSeconds')
    ? readBoundedNumber(option.sampleSeconds, 0.001, 86_400)
    : BEHAVIOR_LIMITS.sampleSeconds;
  // Duration is `samples / samplesPerSecond` so a decimal interval such as 0.1 s stays exact.
  const samplesPerSecond = 1 / sampleSeconds;
  const sampleDuration = (samples: number) => samples / samplesPerSecond;

  const keys = new Map<string, true>();
  const kindTotals = new Map<OpportunityKind, KindTotals>(
    opportunityKinds.map((kind) => [kind, zeroKindTotals()]),
  );
  const speedHistogram = createHistogram(BEHAVIOR_HISTOGRAMS.speed);
  const reactionHistogram = createHistogram(BEHAVIOR_HISTOGRAMS.reaction);
  const headwayHistogram = createHistogram(BEHAVIOR_HISTOGRAMS.headway);
  let speedSamples = 0;
  let limitedSamples = 0;
  let limitSum = 0;
  let overLimitSamples = 0;
  let completeStops = 0;
  let dwellSamples = 0;
  let dwellSum = 0;
  let reactionSamples = 0;
  let headwayOffered = 0;
  let headwayEligible = 0;
  let eventsTotal = 0;
  let acceptedTotal = 0;
  let duplicates = 0;
  let rejected = 0;
  let droppedKeys = 0;
  let snapshotCalls = 0;
  let minTick: number | null = null;
  let maxTick: number | null = null;
  let lastRejection: BehaviorRejectionReason | null = null;
  let disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Behavior metrics disposed');
  }

  function nextCounter(value: number): number {
    if (value >= BEHAVIOR_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return value + 1;
  }

  function nextSum(current: number, delta: number): number {
    const next = current + delta;
    if (!Number.isFinite(next) || next > BEHAVIOR_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return next;
  }

  function noteTick(atTick: number): void {
    minTick = minTick === null ? atTick : Math.min(minTick, atTick);
    maxTick = maxTick === null ? atTick : Math.max(maxTick, atTick);
  }

  function remember(key: string): void {
    keys.set(key, true);
    while (keys.size > retainedKeys) {
      const oldest = keys.keys().next().value;
      if (oldest === undefined) break;
      keys.delete(oldest);
      droppedKeys += 1;
    }
  }

  /** Applies one parsed event; the identity key is checked before any accumulator is touched. */
  function applyEvent(event: ParsedEvent): void {
    if (event.kind === 'SPEED_SAMPLE') {
      speedSamples = nextCounter(speedSamples);
      speedHistogram.add(event.speedMps);
      if (event.limitMps !== null) {
        limitedSamples = nextCounter(limitedSamples);
        limitSum = nextSum(limitSum, event.limitMps);
        if (event.speedMps > event.limitMps) overLimitSamples = nextCounter(overLimitSamples);
      }
      noteTick(event.tick);
      return;
    }
    const totals = kindTotals.get(event.opportunityKind)!;
    totals.eligible = nextCounter(totals.eligible);
    if (event.success) totals.successes = nextCounter(totals.successes);
    if (event.violation) totals.violations = nextCounter(totals.violations);
    if (event.opportunityKind === 'STOP' && event.outcome === 'STOPPED') {
      completeStops = nextCounter(completeStops);
      if (event.dwellTicks !== null) {
        dwellSamples = nextCounter(dwellSamples);
        dwellSum = nextSum(dwellSum, event.dwellTicks / BEHAVIOR_LIMITS.reactionTickHz);
      }
    }
    if (event.opportunityKind === 'GREEN' && event.reactionTicks !== null) {
      reactionSamples = nextCounter(reactionSamples);
      reactionHistogram.add(event.reactionTicks / BEHAVIOR_LIMITS.reactionTickHz);
    }
    if (event.headwaySeconds !== null) {
      headwayOffered = nextCounter(headwayOffered);
      if (event.speedMps !== null && event.speedMps >= BEHAVIOR_LIMITS.minimumEligibleSpeedMps) {
        headwayEligible = nextCounter(headwayEligible);
        headwayHistogram.add(event.headwaySeconds);
      }
    }
    noteTick(event.resolvedTick);
  }

  function result(
    status: BehaviorIngestStatus,
    eventId: string | null,
    reason: BehaviorRejectionReason | null,
  ): BehaviorIngestResult {
    return Object.freeze({ status, eventId, reason });
  }

  function ingest(event: unknown): BehaviorIngestResult {
    assertLive();
    requireContract(
      eventsTotal < BEHAVIOR_LIMITS.maximumSum,
      'Behavior metrics event counter exhausted',
    );
    eventsTotal += 1;
    try {
      const parsed = parseEvent(event);
      // 138 rule: the opportunity identity is (opportunityId, occurrence), never the frame/event id.
      const key =
        parsed.kind === 'OPPORTUNITY_RESOLVED'
          ? JSON.stringify(['opportunity', parsed.opportunityId, parsed.occurrence])
          : JSON.stringify(['speed', parsed.eventId]);
      if (keys.has(key)) {
        duplicates += 1;
        return result('DUPLICATE', parsed.eventId, null);
      }
      applyEvent(parsed);
      remember(key);
      acceptedTotal += 1;
      return result('ACCEPTED', parsed.eventId, null);
    } catch (error: unknown) {
      if (error instanceof BehaviorMetricsRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return result('REJECTED', null, error.reason);
      }
      throw error;
    }
  }

  function ingestMany(events: readonly unknown[]): BehaviorBatchResult {
    assertLive();
    requireContract(Array.isArray(events), 'Behavior ingestMany requires an array of events');
    let accepted = 0,
      duplicate = 0,
      failed = 0;
    for (let index = 0; index < events.length; index += 1) {
      const entry = ingest(events[index]);
      if (entry.status === 'ACCEPTED') accepted += 1;
      else if (entry.status === 'DUPLICATE') duplicate += 1;
      else failed += 1;
    }
    return Object.freeze({
      events: events.length,
      accepted,
      duplicates: duplicate,
      rejected: failed,
    });
  }

  function speedBlock(): BehaviorSpeedMetrics {
    const noSamples = speedSamples === 0;
    const noLimit = limitedSamples === 0;
    const mean = speedHistogram.mean;
    return Object.freeze({
      samples: availableMetric('speedSamples', speedSamples, speedSamples),
      meanMps: noSamples
        ? unavailableMetric('meanSpeedMps', 'NO_SPEED_SAMPLES')
        : availableMetric('meanSpeedMps', mean!, speedSamples),
      medianMps: noSamples
        ? unavailableMetric('medianSpeedMps', 'NO_SPEED_SAMPLES')
        : availableMetric('medianSpeedMps', speedHistogram.percentile(0.5)!, speedSamples),
      p90Mps: noSamples
        ? unavailableMetric('p90SpeedMps', 'NO_SPEED_SAMPLES')
        : availableMetric('p90SpeedMps', speedHistogram.percentile(0.9)!, speedSamples),
      limitedSamples: availableMetric('limitedSpeedSamples', limitedSamples, limitedSamples),
      limitedSeconds: noLimit
        ? unavailableMetric('limitedSeconds', 'NO_LIMIT')
        : availableMetric('limitedSeconds', sampleDuration(limitedSamples), limitedSamples),
      meanLimitMps: noLimit
        ? unavailableMetric('meanLimitMps', 'NO_LIMIT')
        : availableMetric('meanLimitMps', limitSum / limitedSamples, limitedSamples),
      overLimitSamples: availableMetric('overLimitSamples', overLimitSamples, overLimitSamples),
      overLimitSeconds: noLimit
        ? unavailableMetric('overLimitSeconds', 'NO_LIMIT')
        : availableMetric('overLimitSeconds', sampleDuration(overLimitSamples), limitedSamples),
      overLimitFraction: noLimit
        ? unavailableMetric('overLimitFraction', 'NO_LIMIT')
        : availableMetric('overLimitFraction', overLimitSamples / limitedSamples, limitedSamples),
    });
  }

  function headwayBlock(): BehaviorHeadwayMetrics {
    const reason: BehaviorUnavailableReason | null =
      headwayEligible > 0 ? null : headwayOffered > 0 ? 'NO_ELIGIBLE_SPEED' : 'NO_HEADWAY_SAMPLES';
    return Object.freeze({
      samples: availableMetric('headwaySamples', headwayEligible, headwayEligible),
      ineligibleSamples: availableMetric(
        'ineligibleHeadwaySamples',
        headwayOffered - headwayEligible,
        headwayOffered - headwayEligible,
      ),
      meanSeconds:
        reason === null
          ? availableMetric('meanHeadwaySeconds', headwayHistogram.mean!, headwayEligible)
          : unavailableMetric('meanHeadwaySeconds', reason),
      medianSeconds:
        reason === null
          ? availableMetric(
              'medianHeadwaySeconds',
              headwayHistogram.percentile(0.5)!,
              headwayEligible,
            )
          : unavailableMetric('medianHeadwaySeconds', reason),
      p90Seconds:
        reason === null
          ? availableMetric('p90HeadwaySeconds', headwayHistogram.percentile(0.9)!, headwayEligible)
          : unavailableMetric('p90HeadwaySeconds', reason),
    });
  }

  function snapshot(input: unknown): BehaviorMetricsSnapshot {
    assertLive();
    const data = plainSnapshotInput(input);
    const atTick = readTickValue(data.tick);
    const simulatedSeconds =
      data.simulatedSeconds === undefined
        ? 0
        : readBoundedNumber(data.simulatedSeconds, 0, Number.MAX_SAFE_INTEGER);
    const fleet = data.fleet === undefined ? null : readFleet(data.fleet);
    const overallTotals = zeroKindTotals();
    for (const totals of kindTotals.values()) {
      overallTotals.eligible += totals.eligible;
      overallTotals.successes += totals.successes;
      overallTotals.violations += totals.violations;
    }
    const byKind = Object.freeze(
      opportunityKinds.map((kind) => kindGroup(kind, kindTotals.get(kind)!)),
    );
    const reason: BehaviorUnavailableReason | null =
      reactionSamples === 0 ? 'NO_REACTION_SAMPLES' : null;
    snapshotCalls += 1;
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: BEHAVIOR_METRICS_VERSION,
      tick: atTick,
      simulatedSeconds,
      fleet,
      overall: kindGroup(BEHAVIOR_OVERALL, overallTotals),
      byKind,
      stops: Object.freeze({
        kind: 'STOP' as const,
        completeStops: availableMetric('completeStops', completeStops, completeStops),
        stopDwellSeconds:
          dwellSamples === 0
            ? unavailableMetric('stopDwellSeconds', 'NO_STOP_DWELL')
            : availableMetric('stopDwellSeconds', dwellSum, dwellSamples),
        meanStopDwellSeconds:
          dwellSamples === 0
            ? unavailableMetric('meanStopDwellSeconds', 'NO_STOP_DWELL')
            : availableMetric('meanStopDwellSeconds', dwellSum / dwellSamples, dwellSamples),
      }),
      reactions: Object.freeze({
        kind: 'GREEN' as const,
        reactionSamples: availableMetric('reactionSamples', reactionSamples, reactionSamples),
        meanReactionSeconds:
          reason === null
            ? availableMetric('meanReactionSeconds', reactionHistogram.mean!, reactionSamples)
            : unavailableMetric('meanReactionSeconds', reason),
        medianReactionSeconds:
          reason === null
            ? availableMetric(
                'medianReactionSeconds',
                reactionHistogram.percentile(0.5)!,
                reactionSamples,
              )
            : unavailableMetric('medianReactionSeconds', reason),
      }),
      speed: speedBlock(),
      headway: headwayBlock(),
      speedSampleSeconds: sampleSeconds,
      historyScans: 0 as const,
      snapshotCalls,
    });
  }

  function getStats(): BehaviorMetricsStats {
    return Object.freeze({
      version: BEHAVIOR_METRICS_VERSION,
      events: disposed ? 0 : eventsTotal,
      accepted: disposed ? 0 : acceptedTotal,
      duplicates: disposed ? 0 : duplicates,
      rejected: disposed ? 0 : rejected,
      historyScans: 0 as const,
      retainedKeys: disposed ? 0 : keys.size,
      droppedKeys: disposed ? 0 : droppedKeys,
      snapshotCalls: disposed ? 0 : snapshotCalls,
      minTick: disposed ? null : minTick,
      maxTick: disposed ? null : maxTick,
      lastRejection: disposed ? null : lastRejection,
      disposed,
    });
  }

  function reset(options: unknown = undefined): BehaviorMetricsReset {
    assertLive();
    const data = options === undefined ? {} : plainEvent(options);
    readClosedFields(data, [], ['preserveStats']);
    const preserveStats = data.preserveStats === undefined ? false : data.preserveStats;
    if (typeof preserveStats !== 'boolean')
      throw new Error('Behavior reset preserveStats must be a boolean');
    const clearedKeys = keys.size;
    const clearedEvents = acceptedTotal;
    keys.clear();
    for (const totals of kindTotals.values()) {
      totals.eligible = 0;
      totals.successes = 0;
      totals.violations = 0;
    }
    speedHistogram.clear();
    reactionHistogram.clear();
    headwayHistogram.clear();
    speedSamples = 0;
    limitedSamples = 0;
    limitSum = 0;
    overLimitSamples = 0;
    completeStops = 0;
    dwellSamples = 0;
    dwellSum = 0;
    reactionSamples = 0;
    headwayOffered = 0;
    headwayEligible = 0;
    minTick = null;
    maxTick = null;
    if (!preserveStats) {
      eventsTotal = 0;
      acceptedTotal = 0;
      duplicates = 0;
      rejected = 0;
      droppedKeys = 0;
      snapshotCalls = 0;
      lastRejection = null;
    }
    return Object.freeze({ preserveStats, clearedKeys, clearedEvents });
  }

  return Object.freeze({
    version: BEHAVIOR_METRICS_VERSION,
    ingest,
    ingestMany,
    snapshot,
    getStats,
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      keys.clear();
      for (const totals of kindTotals.values()) {
        totals.eligible = 0;
        totals.successes = 0;
        totals.violations = 0;
      }
      speedHistogram.clear();
      reactionHistogram.clear();
      headwayHistogram.clear();
      speedSamples = 0;
      limitedSamples = 0;
      limitSum = 0;
      overLimitSamples = 0;
      completeStops = 0;
      dwellSamples = 0;
      dwellSum = 0;
      reactionSamples = 0;
      headwayOffered = 0;
      headwayEligible = 0;
      eventsTotal = 0;
      acceptedTotal = 0;
      duplicates = 0;
      rejected = 0;
      droppedKeys = 0;
      snapshotCalls = 0;
      minTick = null;
      maxTick = null;
      lastRejection = null;
    },
  });
}
