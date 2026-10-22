import type { FleetHealth, RideLifecycle, RideRecord } from '../fleet';
import type { CollisionIncident } from '../vehicles';
import type {
  CityDashboardSnapshot,
  CityExposure,
  CityIncident,
  CityIncidentPositionM,
  CityIncidentSeverity,
  CityMetric,
  CityMetricId,
  CityMetricObservation,
  CityMetricReason,
} from '../ui';
import {
  CITY_DASHBOARD_LIMITS,
  CITY_DASHBOARD_VERSION,
  CITY_METRIC_LABELS,
  CITY_METRIC_UNIT_BY_ID,
  compareCityIncidents,
} from '../ui';

/**
 * 082 composition root. It reads the real 061 ride lifecycle, the real 028 collision incidents and the
 * real 065 fleet health history, and fills everything the current build cannot certify (137 violations
 * and comfort) with an explicit `UNAVAILABLE` value instead of a fabricated zero.
 *
 * It imports no profile module: the dashboard cannot read, compare or change a driving profile, and
 * the focus port below only asks the host map to look at a point.
 */

/** Real 028 collision incidents retained by the host for the dashboard window. */
export interface CityCollisionSource {
  incidents(): readonly CollisionIncident[];
  /** `false` when incidents were dropped from the retained window; the rate is then uncertified. */
  complete?(): boolean;
}

/**
 * Presentation bands for the real 028 normal impulse. They classify how the event is displayed; they
 * are not a physics claim and never change the recorded impulse.
 */
export const CITY_COLLISION_SEVERITY_BANDS = Object.freeze({
  minorMaxNs: 500,
  moderateMaxNs: 5000,
});

/** Observation-window counters owned by the host when 061 retention is not the whole window. */
export interface CityExposureObservation {
  readonly windows: number;
  readonly observations: number;
  readonly durationSeconds: number;
}

export interface CityDashboardExposureProvider {
  /** `null` when the counters are not readable; zero counters are a real, available zero. */
  exposure(): CityExposureObservation | null;
}

/**
 * Optional provider for the metrics this build cannot certify. 137 (violations/comfort) is not Done,
 * so the default composition returns no observation and the dashboard shows `UNAVAILABLE`.
 */
export interface CityDashboardMetricsProvider {
  metric(id: 'violations' | 'comfortScore'): CityMetricObservation | null;
}

export interface CityDashboardSources {
  /** Real session context of the running world (for example the 057 registry context). */
  readonly context: Readonly<{ sessionId: string; worldEpoch: number }>;
  /** Real 061 lifecycle; completed rides are the only rides counted as finished work. */
  readonly lifecycle: RideLifecycle;
  /** Real 065 health; blockage incidents come from its bounded fact history. */
  readonly health: FleetHealth;
  /** Real 028 incidents captured by the host; absent means the collision rate is unavailable. */
  readonly collisions?: CityCollisionSource;
  /** Optional real observation-window counters. */
  readonly exposure?: CityDashboardExposureProvider;
  /** Optional 137-style provider. Absent means `UNAVAILABLE`, never zero. */
  readonly metrics?: CityDashboardMetricsProvider;
  /** Real host position read for one vehicle; `null` when no coordinate is known. */
  readonly positions?: (vehicleId: string) => CityIncidentPositionM | null;
  /** Real per-ride distance read; `null` when the source cannot measure it. */
  readonly rideDistanceM?: (ride: RideRecord) => number | null;
}

/** One host frame: the accepted tick and the current incident selection. */
export interface CityDashboardFrame {
  readonly tick: number;
  readonly selectedIncidentId: string | null;
}

function metricLabel(id: CityMetricId): string {
  return CITY_METRIC_LABELS[id];
}

function availableMetric(id: CityMetricId, value: number, sampleSize: number | null): CityMetric {
  return Object.freeze({
    id,
    label: metricLabel(id),
    unit: CITY_METRIC_UNIT_BY_ID[id],
    state: 'AVAILABLE' as const,
    value,
    sampleSize,
    reason: null,
  });
}

function unavailableMetric(id: CityMetricId, reason: CityMetricReason): CityMetric {
  return Object.freeze({
    id,
    label: metricLabel(id),
    unit: CITY_METRIC_UNIT_BY_ID[id],
    state: 'UNAVAILABLE' as const,
    value: null,
    sampleSize: null,
    reason,
  });
}

/** A provider observation is copied only when it is a finite, nonnegative certified value. */
function metricFromObservation(
  id: CityMetricId,
  observation: CityMetricObservation | null,
  fallback: CityMetricReason,
): CityMetric {
  if (observation === null) return unavailableMetric(id, fallback);
  if (observation.state !== 'AVAILABLE' || observation.value === null)
    return unavailableMetric(id, observation.reason ?? fallback);
  if (!Number.isFinite(observation.value) || observation.value < 0)
    return unavailableMetric(id, 'NOT_CERTIFIED');
  return availableMetric(id, observation.value, observation.sampleSize);
}

function finiteDistance(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function collisionSeverity(impulseNs: number): CityIncidentSeverity {
  if (impulseNs < CITY_COLLISION_SEVERITY_BANDS.minorMaxNs) return 'MINOR';
  if (impulseNs < CITY_COLLISION_SEVERITY_BANDS.moderateMaxNs) return 'MODERATE';
  return 'SEVERE';
}

function isBlockageFact(fact: string): boolean {
  return fact === 'TRAFFIC_BLOCK' || fact === 'IMMOBILIZATION';
}

function positionReader(
  read: ((vehicleId: string) => CityIncidentPositionM | null) | undefined,
): (vehicleId: string) => CityIncidentPositionM | null {
  return (vehicleId: string) => {
    if (read === undefined) return null;
    const position = read(vehicleId);
    if (position === null || position === undefined) return null;
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    )
      return null;
    return Object.freeze({ x: position.x, y: position.y, z: position.z });
  };
}

/**
 * Collisions keep the real 028 incident id/tick/vehicle; 028 reports no coordinate, so `positionM` is
 * `null` unless the host supplies a real read. No coordinate is ever invented. A collision has no ride
 * association in 028, so `rideId` stays `null` as well.
 */
function collisionIncidents(
  source: CityCollisionSource | undefined,
  positionOf: (vehicleId: string) => CityIncidentPositionM | null,
): CityIncident[] {
  if (source === undefined) return [];
  const incidents: CityIncident[] = [];
  for (const incident of source.incidents())
    incidents.push(
      Object.freeze({
        incidentId: incident.incidentId,
        kind: 'COLLISION' as const,
        tick: incident.tick,
        vehicleId: incident.vehicleId,
        rideId: null,
        severity: collisionSeverity(incident.impulseNs),
        positionM: positionOf(incident.vehicleId),
        label: `Coliziune · ${incident.vehicleId}`,
        detail: `impuls ${Math.round(incident.impulseNs)} N·s cu ${incident.otherEntityId}`,
      }),
    );
  return incidents;
}

/**
 * Blockages come from the real 065 fact history. The incident id namespaces the real `factId`; a ride
 * that the fact closed keeps its real 061 `rideId`, and an unknown position stays `null`.
 */
function blockageIncidents(
  health: FleetHealth,
  positionOf: (vehicleId: string) => CityIncidentPositionM | null,
): CityIncident[] {
  const incidents: CityIncident[] = [];
  for (const entry of health.history()) {
    if (!isBlockageFact(entry.fact)) continue;
    incidents.push(
      Object.freeze({
        incidentId: `blockage:${entry.factId}`,
        kind: 'BLOCKAGE' as const,
        tick: entry.tick,
        vehicleId: entry.taxiId,
        rideId: entry.releasedRideId,
        severity: 'MODERATE' as const,
        positionM: positionOf(entry.taxiId),
        label: `Blocaj · ${entry.taxiId}`,
        detail: `${entry.fact} · ${entry.from} → ${entry.to}`,
      }),
    );
  }
  return incidents;
}

/**
 * Exposure is either the host's real window counters or the 061 terminal retention. A truncated 061
 * retention (`droppedTerminal > 0`) cannot certify the window, so it is `UNAVAILABLE` and never zero.
 */
function readExposure(
  sources: CityDashboardSources,
  terminalRides: readonly RideRecord[],
  durationObservations: readonly RideRecord[],
  droppedTerminal: number,
): CityExposure {
  if (sources.exposure !== undefined) {
    const observation = sources.exposure.exposure();
    if (observation === null) return unavailableExposure('SOURCE_MISSING');
    const duration = finiteDistance(observation.durationSeconds);
    if (
      duration === null ||
      !Number.isSafeInteger(observation.windows) ||
      observation.windows < 0 ||
      !Number.isSafeInteger(observation.observations) ||
      observation.observations < 0
    )
      return unavailableExposure('NOT_CERTIFIED');
    return Object.freeze({
      state: 'AVAILABLE' as const,
      windows: observation.windows,
      observations: observation.observations,
      durationSeconds: duration,
      reason: null,
    });
  }
  if (droppedTerminal > 0) return unavailableExposure('NOT_CERTIFIED');
  let durationSeconds = 0;
  for (const ride of durationObservations) durationSeconds += ride.totalCostSeconds;
  return Object.freeze({
    state: 'AVAILABLE' as const,
    windows: terminalRides.length,
    observations: durationObservations.length,
    durationSeconds,
    reason: null,
  });
}

function unavailableExposure(reason: CityMetricReason): CityExposure {
  return Object.freeze({
    state: 'UNAVAILABLE' as const,
    windows: null,
    observations: null,
    durationSeconds: null,
    reason,
  });
}

/**
 * Reads the real sources into one 082 frame. Nothing is fabricated: a source the build cannot read
 * becomes `UNAVAILABLE` with a closed reason, and an incident without a coordinate stays unlocatable.
 */
export function readCityDashboardSnapshot(
  sources: CityDashboardSources,
  frame: CityDashboardFrame,
): CityDashboardSnapshot {
  const terminalRides = sources.lifecycle.terminal(),
    healthStats = sources.health.stats(),
    healthHistory = sources.health.history(),
    historyComplete = healthStats.facts <= healthHistory.length,
    droppedTerminal = sources.lifecycle.stats().droppedTerminal,
    completed = terminalRides.filter((ride) => ride.state === 'COMPLETED'),
    durationObservations = completed.filter(
      (ride) => Number.isFinite(ride.totalCostSeconds) && ride.totalCostSeconds >= 0,
    ),
    collisions = collisionIncidents(sources.collisions, positionReader(sources.positions)),
    blockages = blockageIncidents(sources.health, positionReader(sources.positions)),
    collisionsComplete =
      sources.collisions === undefined ? false : (sources.collisions.complete?.() ?? true),
    incidents = Object.freeze(
      [...collisions, ...blockages]
        .sort(compareCityIncidents)
        .slice(0, CITY_DASHBOARD_LIMITS.incidents),
    );
  const metrics: CityMetric[] = [];
  metrics.push(
    droppedTerminal > 0
      ? unavailableMetric('completedRides', 'NOT_CERTIFIED')
      : availableMetric('completedRides', completed.length, completed.length),
  );
  if (droppedTerminal > 0) metrics.push(unavailableMetric('averageRideSeconds', 'NOT_CERTIFIED'));
  else if (durationObservations.length === 0)
    metrics.push(unavailableMetric('averageRideSeconds', 'NO_EXPOSURE'));
  else {
    let total = 0;
    for (const ride of durationObservations) total += ride.totalCostSeconds;
    metrics.push(
      availableMetric(
        'averageRideSeconds',
        total / durationObservations.length,
        durationObservations.length,
      ),
    );
  }
  if (sources.rideDistanceM === undefined)
    metrics.push(unavailableMetric('totalDistanceM', 'SOURCE_MISSING'));
  else if (droppedTerminal > 0) metrics.push(unavailableMetric('totalDistanceM', 'NOT_CERTIFIED'));
  else if (completed.length === 0) metrics.push(unavailableMetric('totalDistanceM', 'NO_EXPOSURE'));
  else {
    let total = 0,
      samples = 0;
    for (const ride of completed) {
      const distance = finiteDistance(sources.rideDistanceM(ride));
      if (distance === null) continue;
      total += distance;
      samples += 1;
    }
    metrics.push(
      samples === 0
        ? unavailableMetric('totalDistanceM', 'SOURCE_MISSING')
        : availableMetric('totalDistanceM', total, samples),
    );
  }
  metrics.push(
    sources.metrics === undefined
      ? unavailableMetric('violations', 'SOURCE_MISSING')
      : metricFromObservation('violations', sources.metrics.metric('violations'), 'SOURCE_MISSING'),
  );
  metrics.push(
    sources.collisions === undefined
      ? unavailableMetric('collisions', 'SOURCE_MISSING')
      : collisionsComplete
        ? availableMetric('collisions', collisions.length, collisions.length)
        : unavailableMetric('collisions', 'NOT_CERTIFIED'),
  );
  metrics.push(
    historyComplete
      ? availableMetric('blockages', blockages.length, blockages.length)
      : unavailableMetric('blockages', 'NOT_CERTIFIED'),
  );
  metrics.push(
    sources.metrics === undefined
      ? unavailableMetric('comfortScore', 'SOURCE_MISSING')
      : metricFromObservation(
          'comfortScore',
          sources.metrics.metric('comfortScore'),
          'SOURCE_MISSING',
        ),
  );
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: CITY_DASHBOARD_VERSION,
    sessionId: sources.context.sessionId,
    worldEpoch: sources.context.worldEpoch,
    tick: frame.tick,
    metrics: Object.freeze(metrics),
    incidents,
    selectedIncidentId: frame.selectedIncidentId,
    exposure: readExposure(sources, terminalRides, durationObservations, droppedTerminal),
  });
}

/** Host port used to turn one selected incident into a map drilldown. */
export interface CityFocusMapPort {
  /** Move the map view to a real world point. Returns `true` when the focus was accepted. */
  focusMap(positionM: CityIncidentPositionM, incidentId: string): boolean;
}

/**
 * Maps a dashboard selection to the host map. This is a **map drilldown**, not a profile change: the
 * port receives only the incident id and its real point, refuses a non-finite point without calling
 * the host, and never touches a profile, camera mode, authority or physics.
 */
export function createCityDashboardFocusPort(
  sources: CityFocusMapPort,
): (incidentId: string, positionM: CityIncidentPositionM) => boolean {
  return (incidentId: string, positionM: CityIncidentPositionM) => {
    if (typeof incidentId !== 'string' || !incidentId.trim()) return false;
    if (
      positionM === null ||
      positionM === undefined ||
      !Number.isFinite(positionM.x) ||
      !Number.isFinite(positionM.y) ||
      !Number.isFinite(positionM.z)
    )
      return false;
    return (
      sources.focusMap(
        Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
        incidentId,
      ) === true
    );
  };
}

export interface CityCollisionLogStats {
  readonly recorded: number;
  readonly retained: number;
  readonly duplicates: number;
  readonly dropped: number;
  readonly disposed: boolean;
}

/** Bounded sink for the real 028 incidents, fed from the host's synchronous `episodes.drain`. */
export interface CityCollisionLog extends CityCollisionSource {
  record(incident: CollisionIncident): void;
  complete(): boolean;
  stats(): CityCollisionLogStats;
  dispose(): void;
}

/**
 * Bounded collision log. The host records what the real 028 `drain(publish)` delivers, so the
 * dashboard lists the exact incident ids, ticks and vehicles of the collision module. Once the
 * capacity drops an older incident, `complete()` is `false` and the collision rate is not certified.
 */
export function createCityCollisionLog(
  options: Readonly<{ capacity?: number }> = {},
): CityCollisionLog {
  const capacity = options.capacity ?? CITY_DASHBOARD_LIMITS.incidents;
  if (
    !Number.isSafeInteger(capacity) ||
    capacity <= 0 ||
    capacity > CITY_DASHBOARD_LIMITS.incidents
  )
    throw new Error('City collision log capacity');
  const retained: CollisionIncident[] = [],
    ids = new Set<string>();
  let recorded = 0,
    duplicates = 0,
    dropped = 0,
    disposed = false;
  return Object.freeze({
    record(incident: CollisionIncident) {
      if (disposed) throw new Error('City collision log disposed');
      if (
        incident === null ||
        typeof incident !== 'object' ||
        typeof incident.incidentId !== 'string' ||
        !incident.incidentId.trim() ||
        typeof incident.vehicleId !== 'string' ||
        !incident.vehicleId.trim() ||
        !Number.isSafeInteger(incident.tick) ||
        incident.tick < 0 ||
        !Number.isFinite(incident.impulseNs)
      )
        throw new Error('City collision log incident');
      recorded += 1;
      if (ids.has(incident.incidentId)) {
        duplicates += 1;
        return;
      }
      if (retained.length >= capacity) {
        const removed = retained.shift();
        if (removed !== undefined) {
          ids.delete(removed.incidentId);
          dropped += 1;
        }
      }
      retained.push(incident);
      ids.add(incident.incidentId);
    },
    incidents: () => Object.freeze(retained.slice()),
    complete: () => !disposed && dropped === 0,
    stats: () =>
      Object.freeze({
        recorded,
        retained: retained.length,
        duplicates,
        dropped,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      retained.length = 0;
      ids.clear();
    },
  });
}
