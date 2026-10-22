import { number, record, requireContract, text, tick } from '../sessions';
import { parseRoadMap } from '../world';
import type { RoadMap } from '../world';
import type { RideLifecycle, RideRecord, RideRelease, RideState } from './ride-fsm';

export const DROPOFF_VERSION = '063-dropoff-v1' as const;

/**
 * Closed vocabulary for an observation that did not complete the delivery. Every rejected or
 * still-pending observation carries exactly one of these reasons; there is no free-form refusal.
 */
export const DROPOFF_REJECTION_REASONS = [
  'WRONG_ZONE',
  'TOO_FAST',
  'NOT_STATIONARY',
  'WRONG_RIDE',
  'NOT_AT_DROPOFF',
  'STALE_TICK',
  'FOREIGN_VEHICLE',
  'RIDE_NOT_ON_TRIP',
] as const;
export type DropoffRejectionReason = (typeof DROPOFF_REJECTION_REASONS)[number];

export interface DropoffPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DropoffObservation {
  readonly rideId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly positionM: DropoffPoint;
  /** Authoritative longitudinal speed of the taxi in m/s for this tick. */
  readonly speedMps: number;
}

/**
 * The ride metrics the delivery must preserve. They are copied from the 061 record before the
 * completion edges run, so a completion can never rewrite the trip that already happened.
 */
export interface DropoffRideMetrics {
  readonly startedTick: number;
  readonly completedTick: number;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
  readonly totalCostSeconds: number;
  readonly pickupRouteLaneIds: readonly string[];
  readonly tripRouteLaneIds: readonly string[];
  readonly transitions: number;
}

export interface DropoffCompletion {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  /** The exact `ride.dropoffZoneId` of the real 060 assignment, never a parallel id. */
  readonly dropoffZoneId: string;
  readonly tick: number;
  /** Observed stationary duration at completion; `null` for a completion reconstructed after restart. */
  readonly dwellTicks: number | null;
  readonly fromState: RideState;
  readonly toState: RideState;
  /** Present when this module had to write the 061 `ARRIVED_DROPOFF` edge itself. */
  readonly arrivedEventId: string | null;
  readonly completeEventId: string;
  /** The real 060 release that closed the ride; never invented by this module. */
  readonly release: RideRelease | null;
  readonly metrics: DropoffRideMetrics;
}

export interface DropoffAttemptView {
  readonly rideId: string;
  readonly taxiId: string;
  readonly dropoffZoneId: string;
  readonly inDropoffZone: boolean;
  readonly lastTick: number;
  readonly stationaryStartTick: number | null;
  readonly dwellTicks: number;
  readonly dwellSeconds: number;
  readonly requiredDwellTicks: number;
  readonly completedTick: number | null;
}

export type DropoffStatus = 'COMPLETED' | 'PENDING' | 'REJECTED';

export interface DropoffDecision {
  readonly status: DropoffStatus;
  /** `null` only for a completed decision; every other decision carries one closed reason. */
  readonly reason: DropoffRejectionReason | null;
  /** The exact observation tick was already processed or the ride was already completed. */
  readonly duplicate: boolean;
  readonly tick: number;
  readonly rideId: string;
  readonly taxiId: string;
  readonly dropoffZoneId: string | null;
  readonly inDropoffZone: boolean;
  readonly speedMps: number;
  readonly dwellTicks: number;
  readonly dwellSeconds: number;
  readonly requiredDwellTicks: number;
  readonly completion: DropoffCompletion | null;
  readonly ride: RideRecord | null;
}

export interface RideDropoffStats {
  readonly version: typeof DROPOFF_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly attempts: number;
  readonly observations: number;
  readonly completed: number;
  readonly pending: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly byReason: Readonly<Record<DropoffRejectionReason, number>>;
  readonly disposed: boolean;
}

export interface RideDropoff {
  readonly namespace: string;
  readonly tickRateHz: number;
  readonly speedThresholdMps: number;
  readonly requiredDwellTicks: number;
  readonly displacementToleranceM: number;
  /** Authoritative simulated tick; the module never reads a wall clock. */
  currentTick(): number;
  observe(input: unknown): DropoffDecision;
  attempt(rideId: string): DropoffAttemptView | undefined;
  completions(): readonly DropoffCompletion[];
  stats(): RideDropoffStats;
  dispose(): void;
}

export const DROPOFF_LIMITS = Object.freeze({
  version: DROPOFF_VERSION,
  /** The V1 fleet has at most 30 taxis; 64 attempts match the 061 active-ride cap. */
  attempts: 64,
  /** Retained completion records for idempotent replays; matches the 061 terminal-ride cap. */
  completions: 128,
  /** Vertices accepted per authored 032 service-zone polygon. */
  vertices: 256,
  /** Code units per observation identity. */
  idCodeUnits: 512,
});

/**
 * Provisional objective thresholds, measured in simulated ticks. Delivery uses the same service
 * rules as pickup 062: inside the real zone, at or below the speed threshold, stationary for the
 * exact dwell. The values are duplicated instead of imported so a future calibration of one
 * service rule cannot silently change the other; tests assert the two tables stay equal.
 */
export const DROPOFF_DEFAULTS = Object.freeze({
  tickRateHz: 60,
  speedThresholdMps: 0.3,
  dwellTicks: 180,
  displacementToleranceM: 0.05,
});

/** Stable 061 event id for the destination arrival edge; derived from the real 059 request. */
export function dropoffArrivedEventId(requestId: string): string {
  return `dropoff-arrived:${requestId}`;
}

/** Stable 061 event id for delivery completion; a second observation can never complete twice. */
export function dropoffCompleteEventId(requestId: string): string {
  return `dropoff-complete:${requestId}`;
}

interface DropoffZone {
  readonly id: string;
  readonly laneId: string;
  readonly kind: 'PICKUP' | 'DROPOFF' | 'BOTH';
  readonly access: readonly ('TAXI' | 'CIVIL')[];
  readonly vertices: readonly DropoffPoint[];
}

interface DropoffAttempt {
  readonly rideId: string;
  readonly taxiId: string;
  readonly dropoffZoneId: string;
  inDropoffZone: boolean;
  lastTick: number;
  stationaryStartTick: number | null;
  previousPosition: DropoffPoint | null;
  dwellTicks: number;
  lastDecision: DropoffDecision | null;
}

const optionFields = [
  'map',
  'lifecycle',
  'tickRateHz',
  'speedThresholdMps',
  'dwellTicks',
  'displacementToleranceM',
] as const;

const observationFields = ['rideId', 'taxiId', 'tick', 'positionM', 'speedMps'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedId(value: unknown, label: string): string {
  const result = text(value);
  requireContract(
    result.length <= DROPOFF_LIMITS.idCodeUnits && result.trim() === result,
    `Invalid ${label} identity or code-unit length`,
  );
  return result;
}

function readPoint(value: unknown): DropoffPoint {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (['x', 'y', 'z'] as readonly string[]).includes(key),
      'Unknown dropoff position field',
    );
  for (const key of ['x', 'y', 'z'] as const)
    requireContract(data[key] !== undefined, `Missing dropoff position field: ${key}`);
  return Object.freeze({
    x: number(data.x, -1_000_000, 1_000_000),
    y: number(data.y, -1_000_000, 1_000_000),
    z: number(data.z, -1_000_000, 1_000_000),
  });
}

function readObservation(value: unknown): DropoffObservation {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (observationFields as readonly string[]).includes(key),
      'Unknown dropoff observation field',
    );
  for (const key of observationFields)
    requireContract(data[key] !== undefined, `Missing dropoff observation field: ${key}`);
  return Object.freeze({
    rideId: boundedId(data.rideId, 'dropoff ride'),
    taxiId: boundedId(data.taxiId, 'dropoff taxi'),
    tick: tick(data.tick),
    positionM: readPoint(data.positionM),
    speedMps: number(data.speedMps, 0, 100),
  });
}

function readLifecycle(value: unknown): RideLifecycle {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as RideLifecycle).namespace === 'string' &&
      typeof (value as RideLifecycle).currentTick === 'function' &&
      typeof (value as RideLifecycle).ride === 'function' &&
      typeof (value as RideLifecycle).apply === 'function',
    'Ride dropoff requires a real ride lifecycle',
  );
  const lifecycle = value as RideLifecycle;
  requireContract(lifecycle.namespace.trim().length > 0, 'Invalid ride dropoff namespace');
  return lifecycle;
}

function readInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

function cross(a: DropoffPoint, b: DropoffPoint, point: DropoffPoint): number {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
}

function onSegment(a: DropoffPoint, b: DropoffPoint, point: DropoffPoint): boolean {
  const epsilon = 1e-9;
  return (
    Math.abs(cross(a, b, point)) <= epsilon &&
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.z >= Math.min(a.z, b.z) - epsilon &&
    point.z <= Math.max(a.z, b.z) + epsilon
  );
}

/** XZ point-in-polygon with exact boundary inclusion; authored zones are ground-level areas. */
function insidePolygon(vertices: readonly DropoffPoint[], point: DropoffPoint): boolean {
  let inside = false;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!,
      b = vertices[(index + 1) % vertices.length]!;
    if (onSegment(a, b, point)) return true;
    if (a.z > point.z !== b.z > point.z) {
      const x = ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function buildZones(map: RoadMap): ReadonlyMap<string, DropoffZone> {
  const nodes = new Map<string, DropoffPoint>(),
    areas = new Map<string, readonly string[]>(),
    zones = new Map<string, DropoffZone>();
  for (const node of map.geometry.nodes) nodes.set(node.id, node.positionM);
  for (const area of map.geometry.areas) areas.set(area.id, area.vertexNodeIds);
  for (const zone of map.serviceZones) {
    const vertexNodeIds = areas.get(zone.geometryId);
    requireContract(vertexNodeIds !== undefined, 'Service zone geometry is missing');
    requireContract(
      vertexNodeIds.length >= 3 && vertexNodeIds.length <= DROPOFF_LIMITS.vertices,
      'Service zone polygon capacity',
    );
    const vertices = vertexNodeIds.map((nodeId) => {
      const position = nodes.get(nodeId);
      requireContract(position !== undefined, 'Service zone vertex is missing');
      return Object.freeze({ x: position.x, y: position.y, z: position.z });
    });
    zones.set(
      zone.id,
      Object.freeze({
        id: zone.id,
        laneId: zone.laneId,
        kind: zone.kind,
        access: zone.access,
        vertices: Object.freeze(vertices),
      }),
    );
  }
  return zones;
}

function zoneAt(
  zones: ReadonlyMap<string, DropoffZone>,
  point: DropoffPoint,
): DropoffZone | undefined {
  for (const zone of zones.values()) if (insidePolygon(zone.vertices, point)) return zone;
  return undefined;
}

function distanceXZ(left: DropoffPoint, right: DropoffPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function zeroByReason(): Record<DropoffRejectionReason, number> {
  return {
    WRONG_ZONE: 0,
    TOO_FAST: 0,
    NOT_STATIONARY: 0,
    WRONG_RIDE: 0,
    NOT_AT_DROPOFF: 0,
    STALE_TICK: 0,
    FOREIGN_VEHICLE: 0,
    RIDE_NOT_ON_TRIP: 0,
  };
}

function attemptView(
  attempt: DropoffAttempt,
  requiredDwellTicks: number,
  tickRateHz: number,
  completedTick: number | null,
): DropoffAttemptView {
  return Object.freeze({
    rideId: attempt.rideId,
    taxiId: attempt.taxiId,
    dropoffZoneId: attempt.dropoffZoneId,
    inDropoffZone: attempt.inDropoffZone,
    lastTick: attempt.lastTick,
    stationaryStartTick: attempt.stationaryStartTick,
    dwellTicks: attempt.dwellTicks,
    dwellSeconds: attempt.dwellTicks / tickRateHz,
    requiredDwellTicks,
    completedTick,
  });
}

/** Copies the 061 trip metrics before the terminal edges so completion cannot rewrite them. */
function metricsOf(
  ride: RideRecord,
  completedTick: number,
  transitions: number,
): DropoffRideMetrics {
  return Object.freeze({
    startedTick: ride.startedTick,
    completedTick,
    pickupZoneId: ride.pickupZoneId,
    dropoffZoneId: ride.dropoffZoneId,
    pickupCostSeconds: ride.pickupCostSeconds,
    tripCostSeconds: ride.tripCostSeconds,
    totalCostSeconds: ride.totalCostSeconds,
    pickupRouteLaneIds: ride.pickupRouteLaneIds,
    tripRouteLaneIds: ride.tripRouteLaneIds,
    transitions,
  });
}

export function createRideDropoff(options: unknown): RideDropoff {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown ride dropoff option field',
    );
  requireContract(data.map !== undefined, 'Ride dropoff requires a map');
  requireContract(data.lifecycle !== undefined, 'Ride dropoff requires a ride lifecycle');
  const map = parseRoadMap(data.map),
    lifecycle = readLifecycle(data.lifecycle),
    namespace = text(lifecycle.namespace),
    tickRateHz =
      data.tickRateHz === undefined
        ? DROPOFF_DEFAULTS.tickRateHz
        : readInteger(data.tickRateHz, 1, 1_000, 'Ride dropoff tick rate'),
    speedThresholdMps =
      data.speedThresholdMps === undefined
        ? DROPOFF_DEFAULTS.speedThresholdMps
        : number(data.speedThresholdMps, 0, 10),
    requiredDwellTicks =
      data.dwellTicks === undefined
        ? DROPOFF_DEFAULTS.dwellTicks
        : readInteger(data.dwellTicks, 1, 60_000, 'Ride dropoff dwell'),
    displacementToleranceM =
      data.displacementToleranceM === undefined
        ? DROPOFF_DEFAULTS.displacementToleranceM
        : number(data.displacementToleranceM, 0, 10),
    zones = buildZones(map),
    attempts = new Map<string, DropoffAttempt>(),
    completions = new Map<string, DropoffCompletion>();
  let lastTick = 0,
    observations = 0,
    completedCount = 0,
    pendingCount = 0,
    rejectedCount = 0,
    duplicates = 0,
    disposed = false;
  const byReason = zeroByReason();

  function assertLive(): void {
    if (disposed) throw new Error('Ride dropoff disposed');
  }

  /** A completed attempt is evictable; its idempotency lives in the completion record. */
  function makeAttemptRoom(): void {
    if (attempts.size < DROPOFF_LIMITS.attempts) return;
    const evictable = [...attempts.values()]
      .filter((attempt) => completions.has(attempt.rideId))
      .sort(
        (left, right) => left.lastTick - right.lastTick || compareText(left.rideId, right.rideId),
      )[0];
    requireContract(evictable !== undefined, 'Ride dropoff attempt capacity exceeded');
    attempts.delete(evictable.rideId);
  }

  function evictOldestCompletion(): void {
    while (completions.size > DROPOFF_LIMITS.completions) {
      const oldest = [...completions.values()].sort(
        (left, right) => left.tick - right.tick || compareText(left.rideId, right.rideId),
      )[0]!;
      completions.delete(oldest.rideId);
    }
  }

  function zeroStats(): RideDropoffStats {
    return Object.freeze({
      version: DROPOFF_VERSION,
      namespace,
      tick: 0,
      attempts: 0,
      observations: 0,
      completed: 0,
      pending: 0,
      rejected: 0,
      duplicates: 0,
      byReason: Object.freeze(zeroByReason()),
      disposed: true,
    });
  }

  function decision(
    status: DropoffStatus,
    reason: DropoffRejectionReason | null,
    duplicate: boolean,
    observation: DropoffObservation,
    ride: RideRecord | null,
    completion: DropoffCompletion | null,
    dwellTicks: number,
    inDropoffZone: boolean,
  ): DropoffDecision {
    return Object.freeze({
      status,
      reason,
      duplicate,
      tick: observation.tick,
      rideId: observation.rideId,
      taxiId: observation.taxiId,
      dropoffZoneId: ride?.dropoffZoneId ?? null,
      inDropoffZone,
      speedMps: observation.speedMps,
      dwellTicks,
      dwellSeconds: dwellTicks / tickRateHz,
      requiredDwellTicks,
      completion,
      ride,
    });
  }

  function reject(
    observation: DropoffObservation,
    reason: DropoffRejectionReason,
    ride: RideRecord | null,
    attempt: DropoffAttempt | null,
  ): DropoffDecision {
    const result = decision(
      reason === 'NOT_STATIONARY' ? 'PENDING' : 'REJECTED',
      reason,
      false,
      observation,
      ride,
      null,
      attempt?.dwellTicks ?? 0,
      attempt?.inDropoffZone ?? false,
    );
    if (reason === 'NOT_STATIONARY') pendingCount += 1;
    else rejectedCount += 1;
    byReason[reason] += 1;
    observations += 1;
    if (attempt !== null) attempt.lastDecision = result;
    return result;
  }

  /** An already closed delivery is replayable from its stable event id, even after a restart. */
  function completionFor(ride: RideRecord): DropoffCompletion | null {
    const known = completions.get(ride.rideId);
    if (known !== undefined) return known;
    const completeEventId = dropoffCompleteEventId(ride.requestId),
      transition = ride.transitions.find(
        (entry) => entry.eventId === completeEventId && entry.event === 'DROPOFF_COMPLETE',
      );
    if (transition === undefined) return null;
    const arrivedEventId = dropoffArrivedEventId(ride.requestId),
      arrival = ride.transitions.find(
        (entry) => entry.eventId === arrivedEventId && entry.event === 'ARRIVED_DROPOFF',
      ),
      reconstructed = Object.freeze({
        rideId: ride.rideId,
        requestId: ride.requestId,
        taxiId: ride.taxiId,
        dropoffZoneId: ride.dropoffZoneId,
        tick: transition.tick,
        dwellTicks: null,
        fromState: transition.from ?? 'DROPOFF',
        toState: transition.to,
        arrivedEventId: arrival === undefined ? null : arrivedEventId,
        completeEventId,
        release: transition.release,
        metrics: metricsOf(ride, transition.tick, ride.transitions.length),
      });
    completions.set(ride.rideId, reconstructed);
    evictOldestCompletion();
    return reconstructed;
  }

  function complete(
    observation: DropoffObservation,
    ride: RideRecord,
    attempt: DropoffAttempt,
    dwellTicks: number,
  ): DropoffDecision {
    const fromState = ride.state,
      arrivedEventId = dropoffArrivedEventId(ride.requestId),
      completeEventId = dropoffCompleteEventId(ride.requestId),
      metrics = metricsOf(ride, observation.tick, ride.transitions.length);
    let wroteArrival = false;
    if (fromState === 'TO_DROPOFF') {
      lifecycle.apply({
        rideId: ride.rideId,
        eventId: arrivedEventId,
        event: 'ARRIVED_DROPOFF',
        tick: observation.tick,
      });
      wroteArrival = true;
    }
    const applied = lifecycle.apply({
      rideId: ride.rideId,
      eventId: completeEventId,
      event: 'DROPOFF_COMPLETE',
      tick: observation.tick,
    });
    const completion = Object.freeze({
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      dropoffZoneId: ride.dropoffZoneId,
      tick: observation.tick,
      dwellTicks,
      fromState,
      toState: applied.ride.state,
      arrivedEventId: wroteArrival ? arrivedEventId : null,
      completeEventId,
      release: applied.transition.release,
      metrics: Object.freeze({
        ...metrics,
        completedTick: applied.ride.updatedTick,
        transitions: applied.ride.transitions.length,
      }),
    });
    completions.set(ride.rideId, completion);
    evictOldestCompletion();
    attempt.lastTick = observation.tick;
    attempt.inDropoffZone = true;
    attempt.previousPosition = observation.positionM;
    attempt.dwellTicks = dwellTicks;
    completedCount += 1;
    observations += 1;
    const result = decision(
      'COMPLETED',
      null,
      false,
      observation,
      applied.ride,
      completion,
      dwellTicks,
      true,
    );
    attempt.lastDecision = result;
    return result;
  }

  function observe(input: unknown): DropoffDecision {
    assertLive();
    const observation = readObservation(input),
      lifecycleTick = lifecycle.currentTick();
    if (observation.tick < lastTick || observation.tick < lifecycleTick)
      return reject(observation, 'STALE_TICK', null, null);
    lastTick = observation.tick;
    const ride = lifecycle.ride(observation.rideId);
    if (ride === undefined) return reject(observation, 'WRONG_RIDE', null, null);
    if (ride.taxiId !== observation.taxiId)
      return reject(observation, 'FOREIGN_VEHICLE', ride, null);

    const completion = completionFor(ride);
    if (completion !== null) {
      const existing = attempts.get(ride.rideId) ?? null;
      if (existing !== null) existing.lastTick = observation.tick;
      duplicates += 1;
      observations += 1;
      return decision(
        'COMPLETED',
        null,
        true,
        observation,
        ride,
        completion,
        completion.dwellTicks ?? 0,
        existing?.inDropoffZone ?? false,
      );
    }

    let attempt = attempts.get(ride.rideId);
    if (
      attempt !== undefined &&
      attempt.lastTick === observation.tick &&
      attempt.lastDecision !== null
    ) {
      duplicates += 1;
      observations += 1;
      return Object.freeze({ ...attempt.lastDecision, duplicate: true });
    }

    if (ride.terminal) return reject(observation, 'WRONG_RIDE', ride, attempt ?? null);
    if (ride.state !== 'TO_DROPOFF' && ride.state !== 'DROPOFF')
      return reject(observation, 'RIDE_NOT_ON_TRIP', ride, attempt ?? null);

    const zone = zones.get(ride.dropoffZoneId);
    if (zone === undefined || !zone.access.includes('TAXI') || zone.kind === 'PICKUP') {
      attempts.delete(ride.rideId);
      return reject(observation, 'WRONG_ZONE', ride, null);
    }

    if (attempt === undefined) {
      makeAttemptRoom();
      attempt = {
        rideId: ride.rideId,
        taxiId: ride.taxiId,
        dropoffZoneId: ride.dropoffZoneId,
        inDropoffZone: false,
        lastTick: observation.tick,
        stationaryStartTick: null,
        previousPosition: null,
        dwellTicks: 0,
        lastDecision: null,
      };
      attempts.set(ride.rideId, attempt);
    }
    const current = attempt;

    const inDropoffZone = insidePolygon(zone.vertices, observation.positionM);
    if (!inDropoffZone) {
      const other = zoneAt(zones, observation.positionM),
        reason: DropoffRejectionReason = other === undefined ? 'NOT_AT_DROPOFF' : 'WRONG_ZONE';
      current.inDropoffZone = false;
      current.lastTick = observation.tick;
      current.stationaryStartTick = null;
      current.previousPosition = null;
      current.dwellTicks = 0;
      return reject(observation, reason, ride, current);
    }

    if (observation.speedMps > speedThresholdMps) {
      current.inDropoffZone = true;
      current.lastTick = observation.tick;
      current.stationaryStartTick = null;
      current.previousPosition = observation.positionM;
      current.dwellTicks = 0;
      return reject(observation, 'TOO_FAST', ride, current);
    }

    const contiguous =
        current.inDropoffZone &&
        current.stationaryStartTick !== null &&
        observation.tick === current.lastTick + 1,
      moved =
        contiguous &&
        current.previousPosition !== null &&
        distanceXZ(current.previousPosition, observation.positionM) > displacementToleranceM;
    let stationaryStartTick: number;
    if (!contiguous || moved) {
      stationaryStartTick = observation.tick;
    } else {
      stationaryStartTick = current.stationaryStartTick!;
    }
    const dwellTicks = observation.tick - stationaryStartTick;
    current.inDropoffZone = true;
    current.lastTick = observation.tick;
    current.stationaryStartTick = stationaryStartTick;
    current.previousPosition = observation.positionM;
    current.dwellTicks = dwellTicks;
    if (dwellTicks >= requiredDwellTicks) return complete(observation, ride, current, dwellTicks);
    return reject(observation, 'NOT_STATIONARY', ride, current);
  }

  return Object.freeze({
    namespace,
    tickRateHz,
    speedThresholdMps,
    requiredDwellTicks,
    displacementToleranceM,
    currentTick: () => lastTick,
    observe,
    attempt(rideId: string): DropoffAttemptView | undefined {
      if (disposed) return undefined;
      const attempt = attempts.get(rideId);
      if (attempt === undefined) return undefined;
      return attemptView(
        attempt,
        requiredDwellTicks,
        tickRateHz,
        completions.get(rideId)?.tick ?? null,
      );
    },
    completions(): readonly DropoffCompletion[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...completions.values()].sort((left, right) => compareText(left.rideId, right.rideId)),
      );
    },
    stats(): RideDropoffStats {
      if (disposed) return zeroStats();
      return Object.freeze({
        version: DROPOFF_VERSION,
        namespace,
        tick: lastTick,
        attempts: attempts.size,
        observations,
        completed: completedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        duplicates,
        byReason: Object.freeze({ ...byReason }),
        disposed: false,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      attempts.clear();
      completions.clear();
      lastTick = 0;
      observations = 0;
      completedCount = 0;
      pendingCount = 0;
      rejectedCount = 0;
      duplicates = 0;
      for (const reason of DROPOFF_REJECTION_REASONS) byReason[reason] = 0;
    },
  });
}
