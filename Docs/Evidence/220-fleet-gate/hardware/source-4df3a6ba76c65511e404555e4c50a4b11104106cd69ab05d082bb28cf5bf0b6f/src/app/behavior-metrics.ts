import { requireContract } from '../sessions';
import type { FleetRegistry } from '../fleet';
import type {
  BehaviorIngestResult,
  BehaviorMetrics,
  BehaviorMetricsSnapshot,
} from '../experiments';
import type { OpportunityRecord } from '../telemetry';
import { CITY_METRIC_LABELS, CITY_METRIC_UNIT_BY_ID } from '../ui';
import type { CityMetric } from '../ui';

/**
 * 138 composition root. It wires the real 086 opportunity record and a real per-tick speed
 * observation into the incremental behavior metric service, and exposes one adapter for the 082
 * dashboard metric this module owns.
 *
 * It reads no clock, selects no vehicle, changes no physics/ride/profile state and never publishes.
 * A non-resolved, truncated or incomplete opportunity is skipped with `null`: an incomplete
 * observation is not a compliance failure. Missing timing stays `null`; the host measures reaction
 * and dwell, this module never invents them.
 */
export const BEHAVIOR_METRICS_APP_VERSION = '138-behavior-metrics-app-v1' as const;

/** Optional real timing the host measured for one resolved occurrence. */
export interface BehaviorOpportunityTiming {
  /** Ticks between the eligible stimulus and the response. */
  readonly reactionTicks?: number | null;
  /** Ticks the vehicle actually stayed stopped at the line. */
  readonly dwellTicks?: number | null;
  /** Real time headway at the moment of the observation. */
  readonly headwaySeconds?: number | null;
  /** Ego speed that makes the headway eligible (moving ego only). */
  readonly speedMps?: number | null;
  /** Real map limit at the observation, or `null` when it cannot be certified. */
  readonly limitMps?: number | null;
}

export interface BehaviorSpeedSampleInput {
  readonly eventId: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly speedMps: number;
  /** A real map limit; omit or `null` when the caller cannot certify one. */
  readonly limitMps?: number | null;
}

export interface BehaviorSnapshotContext {
  readonly tick: number;
  readonly simulatedSeconds?: number;
  /** Optional whole-fleet context; only `counts()` is read. */
  readonly fleet?: Pick<FleetRegistry, 'counts'>;
}

function requireService(service: BehaviorMetrics): BehaviorMetrics {
  requireContract(
    typeof service === 'object' &&
      service !== null &&
      typeof service.ingest === 'function' &&
      typeof service.snapshot === 'function',
    'Behavior composition requires a real behavior metric service',
  );
  return service;
}

function timed(value: number | null | undefined): number | null {
  return value === undefined ? null : value;
}

/**
 * Ingests one real 086 record. Only `RESOLVED` records with a certain outcome are evidence: a
 * `TRUNCATED`/`ENTERED` opportunity is an explicit skip (`null`), because an incomplete observation
 * is never a compliance failure. Idempotency comes from the record's own `(id, occurrence)`, so a
 * repeated drain of the same record cannot change the denominator.
 */
export function ingestOpportunityRecord(
  service: BehaviorMetrics,
  record: OpportunityRecord,
  timing: BehaviorOpportunityTiming = {},
): BehaviorIngestResult | null {
  const metrics = requireService(service);
  requireContract(
    typeof record === 'object' && record !== null,
    'Behavior ingest requires a real 086 opportunity record',
  );
  if (record.state !== 'RESOLVED' || record.outcome === null || record.result === null) return null;
  requireContract(
    Number.isSafeInteger(record.occurrence) && record.occurrence >= 0,
    'Behavior ingest requires the real 086 occurrence ordinal',
  );
  const resolvedTick = record.resolvedTick ?? record.lastTick;
  requireContract(
    Number.isSafeInteger(resolvedTick) && resolvedTick >= 0,
    'Behavior ingest requires the real 086 resolved tick',
  );
  return metrics.ingest({
    eventId: `opportunity-resolved:${record.id}:${record.occurrence}`,
    kind: 'OPPORTUNITY_RESOLVED',
    opportunityId: record.id,
    occurrence: record.occurrence,
    opportunityKind: record.kind,
    vehicleId: record.vehicleId,
    resolvedTick,
    outcome: record.outcome,
    success: record.result === 'SUCCESS',
    violation: null,
    reactionTicks: timed(timing.reactionTicks),
    dwellTicks: timed(timing.dwellTicks),
    headwaySeconds: timed(timing.headwaySeconds),
    speedMps: timed(timing.speedMps),
    limitMps: timed(timing.limitMps),
  });
}

/** Ingests one real speed observation. Duplicate `eventId` is a no-op that never double counts. */
export function ingestSpeedSample(
  service: BehaviorMetrics,
  input: BehaviorSpeedSampleInput,
): BehaviorIngestResult {
  const metrics = requireService(service);
  requireContract(
    typeof input === 'object' && input !== null,
    'Speed sample ingest requires a real observation',
  );
  return metrics.ingest({
    eventId: input.eventId,
    kind: 'SPEED_SAMPLE',
    tick: input.tick,
    vehicleId: input.vehicleId,
    speedMps: input.speedMps,
    limitMps: input.limitMps ?? null,
  });
}

/** Reads the frozen snapshot of the incremental accumulators; no history is rescanned. */
export function readBehaviorMetricSnapshot(
  service: BehaviorMetrics,
  context: BehaviorSnapshotContext,
): BehaviorMetricsSnapshot {
  const metrics = requireService(service);
  requireContract(
    typeof context === 'object' && context !== null,
    'Behavior snapshot requires its context',
  );
  return metrics.snapshot({
    tick: context.tick,
    simulatedSeconds: context.simulatedSeconds,
    fleet: context.fleet,
  });
}

/** 082 metric ids this module owns; comfort stays with 139. */
export const BEHAVIOR_CITY_METRIC_IDS = ['violations'] as const;

/**
 * Adapts the frozen 138 snapshot to the 082 `CityMetric` shape. Only violations are exposed: 138
 * owns violations, while comfort and every service indicator stay with their own owners. A 138
 * unavailable value stays `UNAVAILABLE` with `value: null`; it never becomes an apparently perfect
 * zero. The 082 contract itself is not modified.
 */
export function toCityDashboardBehaviorMetrics(
  snapshot: BehaviorMetricsSnapshot,
): readonly CityMetric[] {
  requireContract(
    typeof snapshot === 'object' &&
      snapshot !== null &&
      typeof snapshot.overall === 'object' &&
      snapshot.overall !== null,
    'City behavior metric adapter requires a behavior snapshot',
  );
  const violations = snapshot.overall.violations;
  const eligible = snapshot.overall.eligibleOpportunities.sampleSize ?? 0;
  const base = {
    id: 'violations' as const,
    label: CITY_METRIC_LABELS.violations,
    unit: CITY_METRIC_UNIT_BY_ID.violations,
  };
  const metric: CityMetric =
    violations.state === 'AVAILABLE' && violations.value !== null
      ? Object.freeze({
          ...base,
          state: 'AVAILABLE' as const,
          value: violations.value,
          sampleSize: eligible,
          reason: null,
        })
      : Object.freeze({
          ...base,
          state: 'UNAVAILABLE' as const,
          value: null,
          sampleSize: null,
          reason:
            violations.reason === 'NO_OPPORTUNITIES'
              ? ('NO_EXPOSURE' as const)
              : ('NOT_CERTIFIED' as const),
        });
  return Object.freeze([metric]);
}
