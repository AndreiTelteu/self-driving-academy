import { requireContract } from '../sessions';
import type { FleetRegistry } from '../fleet';
import type { RideState } from '../fleet';
import type { ComfortIngestResult, ComfortMetrics, ComfortMetricsSnapshot } from '../experiments';
import {
  COMFORT_SIMULATION_HZ,
  comfortPassengerAboard,
  comfortReviewModel,
  deriveComfortIntervals,
} from '../experiments';
import type { FilteredWindowRecord, TickSampleReadout } from '../telemetry';
import type { CollisionIncident } from '../vehicles';
import { CITY_METRIC_LABELS, CITY_METRIC_UNIT_BY_ID } from '../ui';
import type { CityMetric, CityMetricObservation } from '../ui';

/**
 * 139 composition root. It wires the real 085 tick-sample telemetry, the real 088 artefact filter
 * windows and the real 061 ride lifecycle into the incremental comfort metric service, and exposes
 * one adapter for the 082 dashboard metric this module owns.
 *
 * The composition knows nothing about the camera, the selection or the renderer: a taxi outside
 * the camera is ingested exactly like a visible one, because the comfort metric reads the
 * telemetry of the fleet and nothing else. The learning eligibility of the 069 segment is carried
 * as a fact and never used to skip an interval.
 *
 * It reads no clock, changes no physics, ride or profile state and never publishes.
 */
export const COMFORT_METRICS_APP_VERSION = '139-comfort-metrics-app-v1' as const;

/** The real facts of one ride with a passenger. */
export interface ComfortRideFacts {
  readonly rideId: string;
  readonly vehicleId: string;
  /** Real 061 ride state; the passenger presence is derived from it. */
  readonly rideState: RideState;
  /** Real 085 tick-sample readouts of the ride, in tick order. */
  readonly readouts: readonly TickSampleReadout[];
  /** Real 088 windows of the ride; their suppressed spans are the only exclusion source. */
  readonly artifactWindows: readonly FilteredWindowRecord[];
}

export interface ComfortRideIngestResult {
  readonly rideId: string;
  readonly vehicleId: string;
  /** Accepted passenger intervals. */
  readonly intervals: number;
  /** Samples the 088 filter suppressed. */
  readonly excludedSamples: number;
  /** Intervals the 088 filter cut. */
  readonly excludedIntervals: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
}

function requireService(service: ComfortMetrics): ComfortMetrics {
  requireContract(
    typeof service === 'object' &&
      service !== null &&
      typeof service.ingest === 'function' &&
      typeof service.snapshot === 'function',
    'Comfort composition requires a real comfort metric service',
  );
  return service;
}

function readSpeed(readout: TickSampleReadout): number {
  const velocity = readout.observation.state.velocityMps;
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

function readCapability(readout: TickSampleReadout): number {
  return readout.observation.capabilities.maxLateralAccelerationMps2;
}

/**
 * Ingests one real ride with a passenger.
 *
 * The passenger is derived from the real 061 ride state: a ride without a passenger is skipped
 * with `null`, because comfort of the command is only defined with a passenger aboard. The
 * intervals come from the real 085 telemetry through the shared derivation, and the excluded
 * ranges are exactly the suppressed spans of the real 088 windows, so a 030 recovery teleport and
 * the impulse of a real collision never become comfort of the command.
 *
 * The idempotency key is `(rideId, fromTick, toTick)`, so a repeated drain of the same ride never
 * double counts an interval.
 */
export function ingestComfortRide(
  service: ComfortMetrics,
  facts: ComfortRideFacts,
): ComfortRideIngestResult | null {
  const metrics = requireService(service);
  requireContract(
    typeof facts === 'object' && facts !== null,
    'Comfort ride ingest requires the real ride facts',
  );
  requireContract(
    typeof facts.rideId === 'string' && facts.rideId.length > 0,
    'Comfort ride ingest requires the real ride id',
  );
  requireContract(
    typeof facts.vehicleId === 'string' && facts.vehicleId.length > 0,
    'Comfort ride ingest requires the real vehicle id',
  );
  requireContract(Array.isArray(facts.readouts), 'Comfort ride ingest requires 085 readouts');
  requireContract(Array.isArray(facts.artifactWindows), 'Comfort ride ingest requires 088 windows');
  if (!comfortPassengerAboard(facts.rideState)) return null;
  if (facts.readouts.length === 0) return null;

  const samples = facts.readouts.map((readout) => {
    const velocity = readout.observation.state.velocityMps;
    return {
      tick: readout.observation.tick,
      speedMps: readSpeed(readout),
      controlMode: readout.controlMode,
      velocityMps: { x: velocity.x, y: velocity.y, z: velocity.z },
    };
  });
  const capability = readCapability(facts.readouts[0]!);
  for (const readout of facts.readouts)
    requireContract(
      readCapability(readout) === capability,
      'Comfort ride mixes vehicle capabilities',
    );
  const suppressedSpans = facts.artifactWindows
    .filter((window) => window.suppressed !== null)
    .map((window) => ({
      fromTick: window.suppressed!.fromTick,
      toTick: window.suppressed!.toTick,
    }));
  const derivation = deriveComfortIntervals({
    samples,
    suppressedSpans,
    lateralLimitMps2: capability,
    tickHz: COMFORT_SIMULATION_HZ,
  });

  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const interval of derivation.intervals) {
    const outcome = metrics.ingest({
      eventId: `comfort-interval:${facts.rideId}:${interval.fromTick}:${interval.toTick}`,
      kind: 'PASSENGER_INTERVAL',
      rideId: facts.rideId,
      vehicleId: facts.vehicleId,
      controlMode: interval.controlMode,
      learningEligible: interval.controlMode === 'LEARNING',
      fromTick: interval.fromTick,
      toTick: interval.toTick,
      durationSeconds: interval.durationSeconds,
      longitudinalAccelerationMps2: interval.longitudinalAccelerationMps2,
      lateralAccelerationMps2: interval.lateralAccelerationMps2,
      lateralLimitMps2: interval.lateralLimitMps2,
    });
    if (outcome.status === 'ACCEPTED') accepted += 1;
    else if (outcome.status === 'DUPLICATE') duplicates += 1;
    else rejected += 1;
  }
  return Object.freeze({
    rideId: facts.rideId,
    vehicleId: facts.vehicleId,
    intervals: derivation.intervals.length,
    excludedSamples: derivation.excludedSamples,
    excludedIntervals: derivation.excludedIntervals,
    accepted,
    duplicates,
    rejected,
  });
}

export interface ComfortImpactFacts {
  /** Real 028 collision incident. */
  readonly incident: CollisionIncident;
  readonly rideId: string;
  readonly vehicleId: string;
  /** Real 061 ride state at the moment of the incident. */
  readonly rideState: RideState;
}

/**
 * Ingests one real impact that happened while the passenger was aboard.
 *
 * The impact is a consequence of the passenger experience, so it is kept beside the comfort
 * aggregates and reaches the review model as an incident fact. It never becomes a comfort
 * violation: the comfort of the command is measured on the 088 usable telemetry only.
 */
export function ingestComfortImpact(
  service: ComfortMetrics,
  facts: ComfortImpactFacts,
): ComfortIngestResult | null {
  const metrics = requireService(service);
  requireContract(
    typeof facts === 'object' && facts !== null && typeof facts.incident === 'object',
    'Comfort impact ingest requires a real collision incident',
  );
  const { incident } = facts;
  requireContract(
    typeof incident.incidentId === 'string' && incident.incidentId.length > 0,
    'Comfort impact ingest requires the real 028 incident id',
  );
  requireContract(
    typeof facts.rideId === 'string' && facts.rideId.length > 0,
    'Comfort impact ingest requires the real ride id',
  );
  requireContract(
    Number.isSafeInteger(incident.tick) && incident.tick >= 0,
    'Comfort impact ingest requires the real incident tick',
  );
  if (!comfortPassengerAboard(facts.rideState)) return null;
  return metrics.ingest({
    eventId: `comfort-impact:${incident.incidentId}`,
    kind: 'PASSENGER_IMPACT',
    rideId: facts.rideId,
    vehicleId: facts.vehicleId,
    tick: incident.tick,
    incidentId: incident.incidentId,
    impulseNs: incident.impulseNs,
  });
}

export interface ComfortSnapshotContext {
  readonly tick: number;
  readonly simulatedSeconds?: number;
  /** Optional whole-fleet context; only `counts()` is read. */
  readonly fleet?: Pick<FleetRegistry, 'counts'>;
}

/** Reads the frozen snapshot of the incremental accumulators; no history is rescanned. */
export function readComfortSnapshot(
  service: ComfortMetrics,
  context: ComfortSnapshotContext,
): ComfortMetricsSnapshot {
  const metrics = requireService(service);
  requireContract(
    typeof context === 'object' && context !== null,
    'Comfort snapshot requires its context',
  );
  return metrics.snapshot({
    tick: context.tick,
    simulatedSeconds: context.simulatedSeconds,
    fleet: context.fleet,
  });
}

/** 082 metric ids this module owns; violations stay with 138. */
export const COMFORT_CITY_METRIC_IDS = ['comfortScore'] as const;

/**
 * The comfort observation of the 082 dashboard provider shape. The value is the comfort score of
 * the shared review model; without a passenger interval it stays `UNAVAILABLE` with `value: null`,
 * never an apparently perfect zero.
 */
export function toComfortCityObservation(snapshot: ComfortMetricsSnapshot): CityMetricObservation {
  requireContract(
    typeof snapshot === 'object' &&
      snapshot !== null &&
      typeof snapshot.overall === 'object' &&
      snapshot.overall !== null,
    'Comfort city observation requires a comfort snapshot',
  );
  const review = comfortReviewModel(snapshot);
  if (review.comfortScore === null)
    return Object.freeze({
      state: 'UNAVAILABLE' as const,
      value: null,
      sampleSize: null,
      reason: 'NO_EXPOSURE' as const,
    });
  return Object.freeze({
    state: 'AVAILABLE' as const,
    value: review.comfortScore,
    sampleSize: review.comfortIntervals,
    reason: null,
  });
}

/**
 * Adapts the frozen 139 snapshot to the 082 `CityMetric` shape. Only comfort is exposed: the
 * service indicators stay with 137 and the violations with 138. The 082 contract itself is not
 * modified.
 */
export function toCityDashboardComfortMetrics(
  snapshot: ComfortMetricsSnapshot,
): readonly CityMetric[] {
  const observation = toComfortCityObservation(snapshot);
  const base = {
    id: 'comfortScore' as const,
    label: CITY_METRIC_LABELS.comfortScore,
    unit: CITY_METRIC_UNIT_BY_ID.comfortScore,
  };
  if (observation.state === 'AVAILABLE' && observation.value !== null)
    return Object.freeze([
      Object.freeze({
        ...base,
        state: 'AVAILABLE' as const,
        value: observation.value,
        sampleSize: observation.sampleSize ?? 0,
        reason: null,
      }),
    ]);
  return Object.freeze([
    Object.freeze({
      ...base,
      state: 'UNAVAILABLE' as const,
      value: null,
      sampleSize: null,
      reason: observation.reason ?? ('NOT_CERTIFIED' as const),
    }),
  ]);
}
