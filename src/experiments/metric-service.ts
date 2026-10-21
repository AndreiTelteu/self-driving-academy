import { requireContract } from '../sessions';
import type { FleetRegistry } from '../fleet';

/**
 * 137 metric service: incremental service indicators over idempotent events.
 *
 * The service owns no clock, world, renderer, DOM or profile. It accumulates only counters, sums and
 * min/max tick bounds from accepted events, so a snapshot never rescans a history: `historyScans` is
 * structurally `0`.
 *
 * Two rules are structural:
 *
 * 1. The denominator is the whole fleet, read from `fleet.counts()` (hidden and unselected vehicles
 *    included). The snapshot never asks for a list, a selection or a camera state.
 * 2. A missing denominator is `UNAVAILABLE` with `value: null`; a real zero with a real denominator
 *    stays `AVAILABLE` with `value: 0`. A zero exposure never produces an apparently perfect rate.
 *
 * Events may arrive out of tick order. Every aggregate is a sum/count/min/max, so the final snapshot
 * is independent of arrival order; `minTick`/`maxTick` report the accepted range instead of forcing
 * monotonicity. The service never fabricates a duration, distance or opportunity.
 */
export const METRIC_SERVICE_VERSION = '137-metric-service-v1' as const;

/** Alias used by composition roots that name the contract by its exported symbol. */
export const metricServiceVersion = METRIC_SERVICE_VERSION;

/** Closed event vocabulary. The discriminator is `kind`. */
export const metricEventKinds = [
  'RIDE_TERMINAL',
  'VEHICLE_DISTANCE',
  'BLOCKED_INTERVAL',
  'COLLISION',
  'VIOLATION',
] as const;
export type MetricEventKind = (typeof metricEventKinds)[number];

/** Terminal ride states of the real 061 lifecycle. */
export const METRIC_RIDE_TERMINAL_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type MetricRideTerminalState = (typeof METRIC_RIDE_TERMINAL_STATES)[number];

/** Blockage facts published by the real 065 health history. */
export const METRIC_BLOCKED_REASONS = ['TRAFFIC_BLOCK', 'IMMOBILIZATION'] as const;
export type MetricBlockedReason = (typeof METRIC_BLOCKED_REASONS)[number];

/** Closed subset of the real 086 opportunity kinds whose failure outcomes are violations. */
export const METRIC_VIOLATION_KINDS = ['RED', 'STOP', 'YIELD'] as const;
export type MetricViolationKind = (typeof METRIC_VIOLATION_KINDS)[number];

export const metricUnits = [
  'count',
  'seconds',
  'metres',
  'km',
  'ratio',
  'per100km',
  'percentage',
] as const;
export type MetricUnit = (typeof metricUnits)[number];

export const metricStates = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type MetricState = (typeof metricStates)[number];

/** Closed unavailable vocabulary; an unavailable value is never a zero. */
export const METRIC_REASONS = [
  'NO_EXPOSURE',
  'NO_RIDES',
  'NO_DISTANCE',
  'NO_FLEET',
  'NO_OPPORTUNITIES',
] as const;
export type MetricReason = (typeof METRIC_REASONS)[number];

export const metricIngestStatuses = ['ACCEPTED', 'DUPLICATE', 'REJECTED'] as const;
export type MetricIngestStatus = (typeof metricIngestStatuses)[number];

/** Closed rejection vocabulary; a rejected event never changes an aggregate. */
export const metricRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'UNKNOWN_KIND',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'LIMIT_EXCEEDED',
] as const;
export type MetricRejectionReason = (typeof metricRejectionReasons)[number];

/** Closed metric identity, in canonical snapshot order. */
export const METRIC_IDS = [
  'completedRides',
  'failedRides',
  'cancelledRides',
  'terminalRides',
  'completionRate',
  'averagePickupSeconds',
  'averageTripSeconds',
  'totalDistanceM',
  'vehicleKilometres',
  'rideDistanceM',
  'blockedIntervals',
  'blockedSeconds',
  'blockedFraction',
  'collisions',
  'collisionsPer100VehicleKm',
  'violations',
  'violationsPerOpportunity',
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** One metric identity carries exactly one unit. */
export const METRIC_UNIT_BY_ID: Readonly<Record<MetricId, MetricUnit>> = Object.freeze({
  completedRides: 'count',
  failedRides: 'count',
  cancelledRides: 'count',
  terminalRides: 'count',
  completionRate: 'percentage',
  averagePickupSeconds: 'seconds',
  averageTripSeconds: 'seconds',
  totalDistanceM: 'metres',
  vehicleKilometres: 'km',
  rideDistanceM: 'metres',
  blockedIntervals: 'count',
  blockedSeconds: 'seconds',
  blockedFraction: 'ratio',
  collisions: 'count',
  collisionsPer100VehicleKm: 'per100km',
  violations: 'count',
  violationsPerOpportunity: 'ratio',
});

export const METRIC_SERVICE_LIMITS = Object.freeze({
  version: METRIC_SERVICE_VERSION,
  /** Bounded idempotency memory; the oldest accepted key is evicted first. */
  retainedKeys: 8192,
  /** Code units per accepted identity. */
  idCodeUnits: 1024,
  /** One event can describe at most one simulated day of service or blockage. */
  maximumSecondsPerEvent: 86_400,
  /** One event can describe at most 10 000 km of travel. */
  maximumDistanceMPerEvent: 10_000_000,
  /** Upper bound of every accumulated counter/sum. */
  maximumSum: Number.MAX_SAFE_INTEGER,
});

/** One metric value. `value` is `null` exactly when `state` is `UNAVAILABLE`. */
export interface MetricValue {
  readonly id: MetricId;
  readonly unit: MetricUnit;
  readonly state: MetricState;
  readonly value: number | null;
  /** Denominator/numerator count the value was derived from; `null` when unavailable. */
  readonly sampleSize: number | null;
  readonly reason: MetricReason | null;
}

export interface MetricFleetCounts {
  readonly vehicles: number;
  readonly taxis: number;
  readonly civilians: number;
}

/** One frozen read model over the accepted aggregates. No list or history is read to build it. */
export interface MetricSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof METRIC_SERVICE_VERSION;
  readonly tick: number;
  /** Simulated exposure of the whole fleet, in seconds. */
  readonly simulatedSeconds: number;
  /** `true` only when the caller declares a real distance source. */
  readonly distanceAvailable: boolean;
  readonly fleet: MetricFleetCounts;
  /** Whole-fleet denominator: `fleet.vehicles × simulatedSeconds`. */
  readonly fleetVehicleSeconds: number;
  /** Opportunity denominator supplied by the caller; `null` when it was not declared. */
  readonly opportunities: number | null;
  readonly metrics: readonly MetricValue[];
  /** Structural proof that the snapshot performed no history scan. */
  readonly historyScans: 0;
  readonly snapshotCalls: number;
}

export interface MetricSnapshotInput {
  /** Only `counts` is read; a registry list, selection or camera state is never consulted. */
  readonly fleet: Pick<FleetRegistry, 'counts'>;
  readonly tick: number;
  readonly simulatedSeconds: number;
  readonly distanceAvailable: boolean;
  /** 086 opportunity denominator; absent means `violationsPerOpportunity` is unavailable. */
  readonly opportunities?: number;
}

export interface MetricIngestResult {
  readonly status: MetricIngestStatus;
  /** Event id for an accepted or duplicate event; `null` for a rejected payload. */
  readonly eventId: string | null;
  /** Closed rejection reason; `null` for accepted/duplicate events. */
  readonly reason: MetricRejectionReason | null;
}

export interface MetricBatchResult {
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
}

export interface MetricServiceStats {
  readonly version: typeof METRIC_SERVICE_VERSION;
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
  readonly lastRejection: MetricRejectionReason | null;
  readonly disposed: boolean;
}

export interface MetricServiceResetOptions {
  /** Keeps the ingest/snapshot counters when `true`; aggregates and keys are always cleared. */
  readonly preserveStats?: boolean;
}

export interface MetricServiceReset {
  readonly preserveStats: boolean;
  readonly clearedKeys: number;
  readonly clearedEvents: number;
}

export interface MetricServiceOptions {
  /** Bounded idempotency memory; defaults to `METRIC_SERVICE_LIMITS.retainedKeys`. */
  readonly retainedKeys?: number;
}

export interface MetricService {
  readonly version: typeof METRIC_SERVICE_VERSION;
  ingest(event: unknown): MetricIngestResult;
  ingestMany(events: readonly unknown[]): MetricBatchResult;
  snapshot(input: unknown): MetricSnapshot;
  getStats(): MetricServiceStats;
  reset(options?: unknown): MetricServiceReset;
  dispose(): void;
}

/** Closed input of one ride-terminal event. `distanceM` is optional and never invented. */
export interface MetricRideTerminalEvent {
  readonly eventId: string;
  readonly kind: 'RIDE_TERMINAL';
  readonly rideId: string;
  readonly taxiId: string;
  readonly state: MetricRideTerminalState;
  readonly tick: number;
  readonly pickupSeconds: number;
  readonly tripSeconds: number;
  readonly distanceM: number | null;
}

export interface MetricVehicleDistanceEvent {
  readonly eventId: string;
  readonly kind: 'VEHICLE_DISTANCE';
  readonly vehicleId: string;
  readonly tick: number;
  readonly distanceM: number;
}

export interface MetricBlockedIntervalEvent {
  readonly eventId: string;
  readonly kind: 'BLOCKED_INTERVAL';
  readonly vehicleId: string;
  readonly tick: number;
  readonly blockedSeconds: number;
  readonly reason: MetricBlockedReason;
}

export interface MetricCollisionEvent {
  readonly eventId: string;
  readonly kind: 'COLLISION';
  readonly vehicleId: string;
  readonly tick: number;
  readonly incidentId: string;
}

export interface MetricViolationEvent {
  readonly eventId: string;
  readonly kind: 'VIOLATION';
  readonly vehicleId: string;
  readonly tick: number;
  readonly opportunityId: string;
  readonly violationKind: MetricViolationKind;
}

export type MetricEvent =
  | MetricRideTerminalEvent
  | MetricVehicleDistanceEvent
  | MetricBlockedIntervalEvent
  | MetricCollisionEvent
  | MetricViolationEvent;

class MetricServiceRejection extends Error {
  readonly reason: MetricRejectionReason;
  constructor(reason: MetricRejectionReason) {
    super(`Metric event rejected: ${reason}`);
    this.name = 'MetricServiceRejection';
    this.reason = reason;
  }
}

interface Totals {
  completed: number;
  failed: number;
  cancelled: number;
  pickupSum: number;
  pickupSamples: number;
  tripSum: number;
  tripSamples: number;
  rideDistanceSum: number;
  rideDistanceSamples: number;
  vehicleDistanceSum: number;
  vehicleDistanceSamples: number;
  blockedSum: number;
  blockedIntervals: number;
  collisions: number;
  violations: number;
  minTick: number | null;
  maxTick: number | null;
}

type ParsedEvent =
  | {
      readonly kind: 'RIDE_TERMINAL';
      readonly eventId: string;
      readonly tick: number;
      readonly state: MetricRideTerminalState;
      readonly pickupSeconds: number;
      readonly tripSeconds: number;
      readonly distanceM: number | null;
    }
  | {
      readonly kind: 'VEHICLE_DISTANCE';
      readonly eventId: string;
      readonly tick: number;
      readonly distanceM: number;
    }
  | {
      readonly kind: 'BLOCKED_INTERVAL';
      readonly eventId: string;
      readonly tick: number;
      readonly blockedSeconds: number;
    }
  | {
      readonly kind: 'COLLISION' | 'VIOLATION';
      readonly eventId: string;
      readonly tick: number;
    };

const rideTerminalFields = [
  'eventId',
  'kind',
  'rideId',
  'taxiId',
  'state',
  'tick',
  'pickupSeconds',
  'tripSeconds',
] as const;
const rideTerminalOptional = ['distanceM'] as const;
const vehicleDistanceFields = ['eventId', 'kind', 'vehicleId', 'tick', 'distanceM'] as const;
const blockedIntervalFields = [
  'eventId',
  'kind',
  'vehicleId',
  'tick',
  'blockedSeconds',
  'reason',
] as const;
const collisionFields = ['eventId', 'kind', 'vehicleId', 'tick', 'incidentId'] as const;
const violationFields = [
  'eventId',
  'kind',
  'vehicleId',
  'tick',
  'opportunityId',
  'violationKind',
] as const;

const snapshotFields = [
  'fleet',
  'tick',
  'simulatedSeconds',
  'distanceAvailable',
  'opportunities',
] as const;
const snapshotRequired = ['fleet', 'tick', 'simulatedSeconds', 'distanceAvailable'] as const;

function reject(reason: MetricRejectionReason): never {
  throw new MetricServiceRejection(reason);
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
  if (value.length === 0 || value.length > METRIC_SERVICE_LIMITS.idCodeUnits)
    reject('INVALID_IDENTITY');
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

function readDistance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) reject('INVALID_NUMBER');
  if (value > METRIC_SERVICE_LIMITS.maximumDistanceMPerEvent) reject('LIMIT_EXCEEDED');
  return value;
}

function readNullableDistance(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) reject('INVALID_NUMBER');
  if (value > METRIC_SERVICE_LIMITS.maximumDistanceMPerEvent) reject('LIMIT_EXCEEDED');
  return value;
}

function readBlockedSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) reject('INVALID_NUMBER');
  if (value > METRIC_SERVICE_LIMITS.maximumSecondsPerEvent) reject('LIMIT_EXCEEDED');
  return value;
}

function parseEvent(value: unknown): ParsedEvent {
  const data = plainEvent(value);
  const kind = readChoice(data.kind, metricEventKinds);
  switch (kind) {
    case 'RIDE_TERMINAL': {
      readClosedFields(data, rideTerminalFields, rideTerminalOptional);
      const eventId = readIdentity(data.eventId);
      readIdentity(data.rideId);
      readIdentity(data.taxiId);
      return {
        kind,
        eventId,
        tick: readTickValue(data.tick),
        state: readChoice(data.state, METRIC_RIDE_TERMINAL_STATES),
        pickupSeconds: readBoundedNumber(
          data.pickupSeconds,
          0,
          METRIC_SERVICE_LIMITS.maximumSecondsPerEvent,
        ),
        tripSeconds: readBoundedNumber(
          data.tripSeconds,
          0,
          METRIC_SERVICE_LIMITS.maximumSecondsPerEvent,
        ),
        distanceM: Object.hasOwn(data, 'distanceM') ? readNullableDistance(data.distanceM) : null,
      };
    }
    case 'VEHICLE_DISTANCE': {
      readClosedFields(data, vehicleDistanceFields, []);
      const eventId = readIdentity(data.eventId);
      readIdentity(data.vehicleId);
      return {
        kind,
        eventId,
        tick: readTickValue(data.tick),
        distanceM: readDistance(data.distanceM),
      };
    }
    case 'BLOCKED_INTERVAL': {
      readClosedFields(data, blockedIntervalFields, []);
      const eventId = readIdentity(data.eventId);
      readIdentity(data.vehicleId);
      readChoice(data.reason, METRIC_BLOCKED_REASONS);
      return {
        kind,
        eventId,
        tick: readTickValue(data.tick),
        blockedSeconds: readBlockedSeconds(data.blockedSeconds),
      };
    }
    case 'COLLISION': {
      readClosedFields(data, collisionFields, []);
      const eventId = readIdentity(data.eventId);
      readIdentity(data.vehicleId);
      readIdentity(data.incidentId);
      return { kind, eventId, tick: readTickValue(data.tick) };
    }
    case 'VIOLATION': {
      readClosedFields(data, violationFields, []);
      const eventId = readIdentity(data.eventId);
      readIdentity(data.vehicleId);
      readIdentity(data.opportunityId);
      readChoice(data.violationKind, METRIC_VIOLATION_KINDS);
      return { kind, eventId, tick: readTickValue(data.tick) };
    }
  }
}

function plainSnapshotInput(value: unknown): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Metric snapshot requires an object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Metric snapshot requires plain data',
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  requireContract(
    keys.length >= snapshotRequired.length && keys.length <= snapshotFields.length,
    'Metric snapshot fields',
  );
  for (const key of snapshotRequired)
    requireContract(Object.hasOwn(data, key), `Missing metric snapshot field: ${key}`);
  for (const key of keys)
    requireContract(
      (snapshotFields as readonly string[]).includes(key),
      'Unknown metric snapshot field',
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

function readFleet(value: unknown): MetricFleetCounts {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as { counts?: unknown }).counts === 'function',
    'Metric snapshot requires a fleet counts port',
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

function availableMetric(id: MetricId, value: number, sampleSize: number): MetricValue {
  return Object.freeze({
    id,
    unit: METRIC_UNIT_BY_ID[id],
    state: 'AVAILABLE' as const,
    value,
    sampleSize,
    reason: null,
  });
}

function unavailableMetric(id: MetricId, reason: MetricReason): MetricValue {
  return Object.freeze({
    id,
    unit: METRIC_UNIT_BY_ID[id],
    state: 'UNAVAILABLE' as const,
    value: null,
    sampleSize: null,
    reason,
  });
}

/**
 * Whole-fleet distance needs a fleet, a declared distance source and real exposure. Anything else is
 * an explicit unavailable reason, never an apparently perfect rate.
 */
function distanceReason(
  counts: MetricFleetCounts,
  exposure: number,
  distanceAvailable: boolean,
): MetricReason | null {
  if (counts.vehicles === 0) return 'NO_FLEET';
  if (!distanceAvailable) return 'NO_DISTANCE';
  if (exposure === 0) return 'NO_EXPOSURE';
  return null;
}

function computeMetrics(
  counts: MetricFleetCounts,
  exposure: number,
  distanceAvailable: boolean,
  opportunities: number | null,
  totals: Totals,
): Readonly<Record<MetricId, MetricValue>> {
  const terminal = totals.completed + totals.failed + totals.cancelled;
  const vehicleSeconds = counts.vehicles * exposure;
  const distanceUnavailable = distanceReason(counts, exposure, distanceAvailable);
  const blockedAvailable = counts.vehicles > 0 && exposure > 0;
  return Object.freeze({
    completedRides: availableMetric('completedRides', totals.completed, totals.completed),
    failedRides: availableMetric('failedRides', totals.failed, totals.failed),
    cancelledRides: availableMetric('cancelledRides', totals.cancelled, totals.cancelled),
    terminalRides: availableMetric('terminalRides', terminal, terminal),
    completionRate:
      terminal === 0
        ? unavailableMetric('completionRate', 'NO_RIDES')
        : availableMetric('completionRate', (totals.completed / terminal) * 100, terminal),
    averagePickupSeconds:
      totals.pickupSamples === 0
        ? unavailableMetric('averagePickupSeconds', 'NO_RIDES')
        : availableMetric(
            'averagePickupSeconds',
            totals.pickupSum / totals.pickupSamples,
            totals.pickupSamples,
          ),
    averageTripSeconds:
      totals.tripSamples === 0
        ? unavailableMetric('averageTripSeconds', 'NO_RIDES')
        : availableMetric(
            'averageTripSeconds',
            totals.tripSum / totals.tripSamples,
            totals.tripSamples,
          ),
    totalDistanceM:
      distanceUnavailable === null
        ? availableMetric(
            'totalDistanceM',
            totals.vehicleDistanceSum,
            totals.vehicleDistanceSamples,
          )
        : unavailableMetric('totalDistanceM', distanceUnavailable),
    vehicleKilometres:
      distanceUnavailable === null
        ? availableMetric(
            'vehicleKilometres',
            totals.vehicleDistanceSum / 1000,
            totals.vehicleDistanceSamples,
          )
        : unavailableMetric('vehicleKilometres', distanceUnavailable),
    rideDistanceM:
      distanceUnavailable !== null
        ? unavailableMetric('rideDistanceM', distanceUnavailable)
        : totals.rideDistanceSamples === 0
          ? unavailableMetric('rideDistanceM', 'NO_DISTANCE')
          : availableMetric('rideDistanceM', totals.rideDistanceSum, totals.rideDistanceSamples),
    blockedIntervals: availableMetric(
      'blockedIntervals',
      totals.blockedIntervals,
      totals.blockedIntervals,
    ),
    blockedSeconds: blockedAvailable
      ? availableMetric('blockedSeconds', totals.blockedSum, totals.blockedIntervals)
      : unavailableMetric('blockedSeconds', counts.vehicles === 0 ? 'NO_FLEET' : 'NO_EXPOSURE'),
    blockedFraction: blockedAvailable
      ? availableMetric(
          'blockedFraction',
          totals.blockedSum / vehicleSeconds,
          totals.blockedIntervals,
        )
      : unavailableMetric('blockedFraction', counts.vehicles === 0 ? 'NO_FLEET' : 'NO_EXPOSURE'),
    collisions: availableMetric('collisions', totals.collisions, totals.collisions),
    collisionsPer100VehicleKm:
      counts.vehicles === 0
        ? unavailableMetric('collisionsPer100VehicleKm', 'NO_FLEET')
        : distanceUnavailable !== null
          ? unavailableMetric('collisionsPer100VehicleKm', distanceUnavailable)
          : totals.vehicleDistanceSum === 0
            ? unavailableMetric('collisionsPer100VehicleKm', 'NO_DISTANCE')
            : availableMetric(
                'collisionsPer100VehicleKm',
                (totals.collisions / (totals.vehicleDistanceSum / 1000)) * 100,
                totals.vehicleDistanceSamples,
              ),
    violations: availableMetric('violations', totals.violations, totals.violations),
    violationsPerOpportunity:
      opportunities === null || opportunities === 0
        ? unavailableMetric('violationsPerOpportunity', 'NO_OPPORTUNITIES')
        : availableMetric(
            'violationsPerOpportunity',
            totals.violations / opportunities,
            opportunities,
          ),
  });
}

function zeroTotals(): Totals {
  return {
    completed: 0,
    failed: 0,
    cancelled: 0,
    pickupSum: 0,
    pickupSamples: 0,
    tripSum: 0,
    tripSamples: 0,
    rideDistanceSum: 0,
    rideDistanceSamples: 0,
    vehicleDistanceSum: 0,
    vehicleDistanceSamples: 0,
    blockedSum: 0,
    blockedIntervals: 0,
    collisions: 0,
    violations: 0,
    minTick: null,
    maxTick: null,
  };
}

export function createMetricService(options: MetricServiceOptions = {}): MetricService {
  const option = plainEvent(options);
  readClosedFields(option, [], ['retainedKeys']);
  const retainedKeys = Object.hasOwn(option, 'retainedKeys')
    ? readBoundedNumber(option.retainedKeys, 1, METRIC_SERVICE_LIMITS.retainedKeys)
    : METRIC_SERVICE_LIMITS.retainedKeys;
  requireContract(
    Number.isSafeInteger(retainedKeys),
    'Metric service retained key capacity must be an integer',
  );

  const keys = new Map<string, true>();
  let totals = zeroTotals();
  let eventsTotal = 0,
    acceptedTotal = 0,
    duplicates = 0,
    rejected = 0,
    droppedKeys = 0,
    snapshotCalls = 0,
    lastRejection: MetricRejectionReason | null = null,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Metric service disposed');
  }

  function nextCounter(value: number): number {
    if (value >= METRIC_SERVICE_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return value + 1;
  }

  function nextSum(current: number, delta: number): number {
    const next = current + delta;
    if (!Number.isFinite(next) || next > METRIC_SERVICE_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return next;
  }

  function remember(eventId: string): void {
    keys.set(eventId, true);
    while (keys.size > retainedKeys) {
      const oldest = keys.keys().next().value;
      if (oldest === undefined) break;
      keys.delete(oldest);
      droppedKeys += 1;
    }
  }

  /** Applies one parsed event; every new value is computed before the accumulator is written. */
  function applyEvent(event: ParsedEvent): void {
    const current = totals;
    if (event.kind === 'RIDE_TERMINAL') {
      const completed =
        event.state === 'COMPLETED' ? nextCounter(current.completed) : current.completed;
      const failed = event.state === 'FAILED' ? nextCounter(current.failed) : current.failed;
      const cancelled =
        event.state === 'CANCELLED' ? nextCounter(current.cancelled) : current.cancelled;
      const pickupSum = nextSum(current.pickupSum, event.pickupSeconds);
      const pickupSamples = nextCounter(current.pickupSamples);
      const tripSum = nextSum(current.tripSum, event.tripSeconds);
      const tripSamples = nextCounter(current.tripSamples);
      const rideDistanceSum =
        event.distanceM === null
          ? current.rideDistanceSum
          : nextSum(current.rideDistanceSum, event.distanceM);
      const rideDistanceSamples =
        event.distanceM === null
          ? current.rideDistanceSamples
          : nextCounter(current.rideDistanceSamples);
      totals = {
        ...current,
        completed,
        failed,
        cancelled,
        pickupSum,
        pickupSamples,
        tripSum,
        tripSamples,
        rideDistanceSum,
        rideDistanceSamples,
      };
    } else if (event.kind === 'VEHICLE_DISTANCE') {
      const vehicleDistanceSum = nextSum(current.vehicleDistanceSum, event.distanceM);
      const vehicleDistanceSamples = nextCounter(current.vehicleDistanceSamples);
      totals = { ...current, vehicleDistanceSum, vehicleDistanceSamples };
    } else if (event.kind === 'BLOCKED_INTERVAL') {
      const blockedSum = nextSum(current.blockedSum, event.blockedSeconds);
      const blockedIntervals = nextCounter(current.blockedIntervals);
      totals = { ...current, blockedSum, blockedIntervals };
    } else if (event.kind === 'COLLISION') {
      totals = { ...current, collisions: nextCounter(current.collisions) };
    } else {
      totals = { ...current, violations: nextCounter(current.violations) };
    }
    totals.minTick = current.minTick === null ? event.tick : Math.min(current.minTick, event.tick);
    totals.maxTick = current.maxTick === null ? event.tick : Math.max(current.maxTick, event.tick);
  }

  function result(
    status: MetricIngestStatus,
    eventId: string | null,
    reason: MetricRejectionReason | null,
  ): MetricIngestResult {
    return Object.freeze({ status, eventId, reason });
  }

  function ingest(event: unknown): MetricIngestResult {
    assertLive();
    requireContract(
      eventsTotal < METRIC_SERVICE_LIMITS.maximumSum,
      'Metric service event counter exhausted',
    );
    eventsTotal += 1;
    try {
      const parsed = parseEvent(event);
      if (keys.has(parsed.eventId)) {
        duplicates += 1;
        return result('DUPLICATE', parsed.eventId, null);
      }
      applyEvent(parsed);
      remember(parsed.eventId);
      acceptedTotal += 1;
      return result('ACCEPTED', parsed.eventId, null);
    } catch (error: unknown) {
      if (error instanceof MetricServiceRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return result('REJECTED', null, error.reason);
      }
      throw error;
    }
  }

  function ingestMany(events: readonly unknown[]): MetricBatchResult {
    assertLive();
    requireContract(Array.isArray(events), 'Metric ingestMany requires an array of events');
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

  function snapshot(input: unknown): MetricSnapshot {
    assertLive();
    const data = plainSnapshotInput(input);
    const fleet = readFleet(data.fleet);
    const atTick = readTickValue(data.tick);
    const simulatedSeconds = readBoundedNumber(data.simulatedSeconds, 0, Number.MAX_SAFE_INTEGER);
    if (typeof data.distanceAvailable !== 'boolean')
      throw new Error('Metric snapshot distanceAvailable must be a boolean');
    const opportunities =
      data.opportunities === undefined ? null : readTickValue(data.opportunities);
    const fleetVehicleSeconds = fleet.vehicles * simulatedSeconds;
    requireContract(
      Number.isFinite(fleetVehicleSeconds),
      'Metric snapshot fleet vehicle-seconds must be finite',
    );
    const computed = computeMetrics(
      fleet,
      simulatedSeconds,
      data.distanceAvailable,
      opportunities,
      totals,
    );
    snapshotCalls += 1;
    return Object.freeze({
      schemaVersion: 1,
      units: 'SI',
      version: METRIC_SERVICE_VERSION,
      tick: atTick,
      simulatedSeconds,
      distanceAvailable: data.distanceAvailable,
      fleet,
      fleetVehicleSeconds,
      opportunities,
      metrics: Object.freeze(METRIC_IDS.map((id) => computed[id])),
      historyScans: 0 as const,
      snapshotCalls,
    });
  }

  function getStats(): MetricServiceStats {
    const current = disposed ? zeroTotals() : totals;
    return Object.freeze({
      version: METRIC_SERVICE_VERSION,
      events: disposed ? 0 : eventsTotal,
      accepted: disposed ? 0 : acceptedTotal,
      duplicates: disposed ? 0 : duplicates,
      rejected: disposed ? 0 : rejected,
      historyScans: 0 as const,
      retainedKeys: disposed ? 0 : keys.size,
      droppedKeys: disposed ? 0 : droppedKeys,
      snapshotCalls: disposed ? 0 : snapshotCalls,
      minTick: disposed ? null : current.minTick,
      maxTick: disposed ? null : current.maxTick,
      lastRejection: disposed ? null : lastRejection,
      disposed,
    });
  }

  function reset(options: unknown = undefined): MetricServiceReset {
    assertLive();
    const data = options === undefined ? {} : plainEvent(options);
    readClosedFields(data, [], ['preserveStats']);
    const preserveStats = data.preserveStats === undefined ? false : data.preserveStats;
    if (typeof preserveStats !== 'boolean')
      throw new Error('Metric reset preserveStats must be a boolean');
    const clearedKeys = keys.size;
    const clearedEvents = acceptedTotal;
    keys.clear();
    totals = zeroTotals();
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
    version: METRIC_SERVICE_VERSION,
    ingest,
    ingestMany,
    snapshot,
    getStats,
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      keys.clear();
      totals = zeroTotals();
      eventsTotal = 0;
      acceptedTotal = 0;
      duplicates = 0;
      rejected = 0;
      droppedKeys = 0;
      snapshotCalls = 0;
      lastRejection = null;
    },
  });
}
