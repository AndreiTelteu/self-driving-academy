import { RIDE_TERMINAL_STATES } from '../fleet';
import type { FleetHealthHistoryEntry, FleetRegistry, RideRecord } from '../fleet';
import type { CollisionIncident } from '../vehicles';
import type {
  MetricIngestResult,
  MetricReason,
  MetricService,
  MetricSnapshot,
} from '../experiments';
import type { MetricId, MetricValue } from '../experiments';
import { CITY_METRIC_IDS, CITY_METRIC_LABELS, CITY_METRIC_UNIT_BY_ID } from '../ui';
import type { CityMetric, CityMetricId, CityMetricReason } from '../ui';
import { requireContract } from '../sessions';

/**
 * 137 composition root. It wires the real 061 terminal rides, the real 028 collision incidents and the
 * real 065 blockage history into the incremental metric service, and exposes one adapter for the 082
 * dashboard metrics this module can certify.
 *
 * It reads no clock, selects no vehicle, changes no physics/ride/profile state and never scans a
 * history to build a snapshot: `readMetricSnapshot` only forwards the whole-fleet counts port.
 */
export const METRIC_APP_VERSION = '137-metric-service-app-v1' as const;

export interface MetricSnapshotSources {
  readonly metrics: MetricService;
  /** Whole-fleet denominator port; a registry list or selection is never read. */
  readonly fleet: Pick<FleetRegistry, 'counts'>;
}

export interface MetricSnapshotFrame {
  readonly tick: number;
  readonly simulatedSeconds: number;
  readonly distanceAvailable: boolean;
  /** 086 opportunity denominator; absent means the violation rate is unavailable. */
  readonly opportunities?: number;
}

function requireMetricService(service: MetricService): MetricService {
  requireContract(
    typeof service === 'object' &&
      service !== null &&
      typeof service.ingest === 'function' &&
      typeof service.snapshot === 'function',
    'Metric composition requires a real metric service',
  );
  return service;
}

function requireFleetPort(fleet: Pick<FleetRegistry, 'counts'>): Pick<FleetRegistry, 'counts'> {
  requireContract(
    typeof fleet === 'object' && fleet !== null && typeof fleet.counts === 'function',
    'Metric composition requires a real fleet counts port',
  );
  return fleet;
}

/** Reads the frozen snapshot of the incremental accumulators; no history is rescanned. */
export function readMetricSnapshot(
  sources: MetricSnapshotSources,
  frame: MetricSnapshotFrame,
): MetricSnapshot {
  requireContract(
    typeof sources === 'object' && sources !== null,
    'Metric snapshot requires its sources',
  );
  const metrics = requireMetricService(sources.metrics);
  const fleet = requireFleetPort(sources.fleet);
  requireContract(
    typeof frame === 'object' && frame !== null,
    'Metric snapshot requires its frame',
  );
  return metrics.snapshot({
    fleet,
    tick: frame.tick,
    simulatedSeconds: frame.simulatedSeconds,
    distanceAvailable: frame.distanceAvailable,
    opportunities: frame.opportunities,
  });
}

function isTerminalState(state: string): boolean {
  return (RIDE_TERMINAL_STATES as readonly string[]).includes(state);
}

function realDistance(distanceM: number | null): number | null {
  return distanceM !== null && Number.isFinite(distanceM) && distanceM >= 0 ? distanceM : null;
}

/**
 * Ingests one real 061 terminal ride. A non-terminal ride is skipped with `null` instead of being
 * counted as finished work, and the idempotency key is `(rideId, state)` so a duplicated close never
 * counts twice. `distanceM` is optional and never invented.
 */
export function ingestRideTerminal(
  service: MetricService,
  ride: RideRecord,
  distanceM: number | null = null,
): MetricIngestResult | null {
  const metrics = requireMetricService(service);
  requireContract(
    typeof ride === 'object' && ride !== null,
    'Ride metric ingest requires a real ride record',
  );
  if (ride.terminal !== true || !isTerminalState(ride.state)) return null;
  return metrics.ingest({
    eventId: `ride-terminal:${ride.rideId}:${ride.state}`,
    kind: 'RIDE_TERMINAL',
    rideId: ride.rideId,
    taxiId: ride.taxiId,
    state: ride.state,
    tick: ride.updatedTick,
    pickupSeconds: ride.pickupCostSeconds,
    tripSeconds: ride.tripCostSeconds,
    distanceM: realDistance(distanceM),
  });
}

/**
 * Ingests one real 028 collision incident. The idempotency key is the stable 028 `incidentId`, so a
 * retried drain never doubles the collision count.
 */
export function ingestCollision(
  service: MetricService,
  incident: CollisionIncident,
): MetricIngestResult {
  const metrics = requireMetricService(service);
  requireContract(
    typeof incident === 'object' && incident !== null,
    'Collision metric ingest requires a real incident',
  );
  requireContract(
    typeof incident.incidentId === 'string' && incident.incidentId.length > 0,
    'Collision metric ingest requires the real 028 incident id',
  );
  requireContract(
    typeof incident.vehicleId === 'string' && incident.vehicleId.length > 0,
    'Collision metric ingest requires the real vehicle id',
  );
  requireContract(
    Number.isSafeInteger(incident.tick) && incident.tick >= 0,
    'Collision metric ingest requires the real incident tick',
  );
  return metrics.ingest({
    eventId: `collision:${incident.incidentId}`,
    kind: 'COLLISION',
    vehicleId: incident.vehicleId,
    tick: incident.tick,
    incidentId: incident.incidentId,
  });
}

export interface BlockedIntervalInput {
  /** One real 065 health history entry. */
  readonly entry: FleetHealthHistoryEntry;
  /**
   * Real blocked duration in seconds, measured by the host. Absent or `null` means the duration is
   * unknown, so nothing is ingested: a blockage is never given an invented duration.
   */
  readonly blockedSeconds?: number | null;
}

function isBlockageFact(fact: string): boolean {
  return fact === 'TRAFFIC_BLOCK' || fact === 'IMMOBILIZATION';
}

/**
 * Ingests one real 065 blockage when the host can measure its duration. A non-blockage fact, a
 * missing duration or a non-positive duration is an explicit skip (`null`), never a fabricated
 * second.
 */
export function ingestBlockedInterval(
  service: MetricService,
  input: BlockedIntervalInput,
): MetricIngestResult | null {
  const metrics = requireMetricService(service);
  requireContract(
    typeof input === 'object' && input !== null && typeof input.entry === 'object',
    'Blocked interval ingest requires a health history entry',
  );
  const { entry } = input;
  if (!isBlockageFact(entry.fact)) return null;
  const seconds = input.blockedSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return metrics.ingest({
    eventId: `blocked:${entry.factId}`,
    kind: 'BLOCKED_INTERVAL',
    vehicleId: entry.taxiId,
    tick: entry.tick,
    blockedSeconds: seconds,
    reason: entry.fact,
  });
}

/** Closed mapping from a 137 unavailable reason to the 082 closed reason vocabulary. */
export const METRIC_TO_CITY_REASON: Readonly<Record<MetricReason, CityMetricReason>> =
  Object.freeze({
    NO_EXPOSURE: 'NO_EXPOSURE',
    NO_RIDES: 'NO_EXPOSURE',
    NO_DISTANCE: 'SOURCE_MISSING',
    NO_FLEET: 'NOT_CERTIFIED',
    NO_OPPORTUNITIES: 'NO_EXPOSURE',
  });

/**
 * 082 metric id ← 137 metric id. `null` means another owner supplies it: violations and comfort stay
 * `SOURCE_MISSING` in 082 until 138/139. The adapter never modifies the 082 contract.
 */
export const CITY_METRIC_SOURCE_IDS: Readonly<Record<CityMetricId, MetricId | null>> =
  Object.freeze({
    completedRides: 'completedRides',
    averageRideSeconds: 'averageTripSeconds',
    totalDistanceM: 'totalDistanceM',
    violations: null,
    collisions: 'collisions',
    blockages: 'blockedIntervals',
    comfortScore: null,
  });

function cityMetric(id: CityMetricId, metric: MetricValue): CityMetric {
  const base = {
    id,
    label: CITY_METRIC_LABELS[id],
    unit: CITY_METRIC_UNIT_BY_ID[id],
  };
  if (metric.state === 'AVAILABLE' && metric.value !== null)
    return Object.freeze({
      ...base,
      state: 'AVAILABLE' as const,
      value: metric.value,
      sampleSize: metric.sampleSize ?? 0,
      reason: null,
    });
  return Object.freeze({
    ...base,
    state: 'UNAVAILABLE' as const,
    value: null,
    sampleSize: null,
    reason:
      metric.reason === null ? ('NOT_CERTIFIED' as const) : METRIC_TO_CITY_REASON[metric.reason],
  });
}

/**
 * Adapts a frozen 137 snapshot to `CityMetric[]` values for the 082 dashboard. A 137 unavailable
 * value stays `UNAVAILABLE` with `value: null`; it never becomes an apparently perfect zero.
 */
export function toCityDashboardMetrics(snapshot: MetricSnapshot): readonly CityMetric[] {
  requireContract(
    typeof snapshot === 'object' && snapshot !== null && Array.isArray(snapshot.metrics),
    'City metric adapter requires a metric snapshot',
  );
  const byId = new Map<MetricId, MetricValue>();
  for (const metric of snapshot.metrics) byId.set(metric.id, metric);
  const metrics: CityMetric[] = [];
  for (const id of CITY_METRIC_IDS) {
    const source = CITY_METRIC_SOURCE_IDS[id];
    if (source === null) continue;
    const metric = byId.get(source);
    if (metric === undefined) continue;
    metrics.push(cityMetric(id, metric));
  }
  return Object.freeze(metrics);
}
