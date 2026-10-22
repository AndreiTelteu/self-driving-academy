import { number, record, requireContract, text, tick } from '../sessions';
import { parseRoadMap } from '../world';
import type { RoadMap } from '../world';
import type { RideLifecycle, RideRecord, RideState } from './ride-fsm';

export const PICKUP_VERSION = '062-pickup-v1' as const;

/**
 * Closed vocabulary for an observation that did not board a passenger. Every rejected or
 * still-pending observation carries exactly one of these reasons; there is no free-form refusal.
 */
export const PICKUP_REJECTION_REASONS = [
  'WRONG_ZONE',
  'TOO_FAST',
  'NOT_STATIONARY',
  'WRONG_RIDE',
  'NOT_AT_PICKUP',
  'STALE_TICK',
  'FOREIGN_VEHICLE',
] as const;
export type PickupRejectionReason = (typeof PICKUP_REJECTION_REASONS)[number];

export interface PickupPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PickupObservation {
  readonly rideId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly positionM: PickupPoint;
  /** Authoritative longitudinal speed of the taxi in m/s for this tick. */
  readonly speedMps: number;
}

export interface PickupBoarding {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly tick: number;
  /** Observed stationary duration at boarding; `null` for a boarding reconstructed after restart. */
  readonly dwellTicks: number | null;
  readonly fromState: RideState;
  readonly toState: RideState;
  /** Present when this module had to write the 061 `ARRIVED_PICKUP` edge itself. */
  readonly arrivedEventId: string | null;
  readonly completeEventId: string;
}

export interface PickupAttemptView {
  readonly rideId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly inPickupZone: boolean;
  readonly lastTick: number;
  readonly stationaryStartTick: number | null;
  readonly dwellTicks: number;
  readonly dwellSeconds: number;
  readonly requiredDwellTicks: number;
  readonly boardedTick: number | null;
}

export type PickupStatus = 'BOARDED' | 'PENDING' | 'REJECTED';

export interface PickupDecision {
  readonly status: PickupStatus;
  /** `null` only for a boarded decision; every other decision carries one closed reason. */
  readonly reason: PickupRejectionReason | null;
  /** The exact observation tick was already processed or the ride was already boarded. */
  readonly duplicate: boolean;
  readonly tick: number;
  readonly rideId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string | null;
  readonly inPickupZone: boolean;
  readonly speedMps: number;
  readonly dwellTicks: number;
  readonly dwellSeconds: number;
  readonly requiredDwellTicks: number;
  readonly boarding: PickupBoarding | null;
  readonly ride: RideRecord | null;
}

export interface RidePickupStats {
  readonly version: typeof PICKUP_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly attempts: number;
  readonly observations: number;
  readonly boarded: number;
  readonly pending: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly byReason: Readonly<Record<PickupRejectionReason, number>>;
  readonly disposed: boolean;
}

export interface RidePickup {
  readonly namespace: string;
  readonly tickRateHz: number;
  readonly speedThresholdMps: number;
  readonly requiredDwellTicks: number;
  readonly displacementToleranceM: number;
  /** Authoritative simulated tick; the module never reads a wall clock. */
  currentTick(): number;
  observe(input: unknown): PickupDecision;
  attempt(rideId: string): PickupAttemptView | undefined;
  boardings(): readonly PickupBoarding[];
  stats(): RidePickupStats;
  dispose(): void;
}

export const PICKUP_LIMITS = Object.freeze({
  version: PICKUP_VERSION,
  /** The V1 fleet has at most 30 taxis; 64 attempts match the 061 active-ride cap. */
  attempts: 64,
  /** Retained boarding records for idempotent replays; matches the 061 terminal-ride cap. */
  boardings: 128,
  /** Vertices accepted per authored 032 service-zone polygon. */
  polygonVertices: 256,
  /** Code units per observation identity. */
  idCodeUnits: 512,
});

/**
 * Provisional objective thresholds, measured in simulated ticks. They are pickup service rules,
 * not driver-style profile preferences; calibration stays open until a gameplay playtest.
 */
export const PICKUP_DEFAULTS = Object.freeze({
  tickRateHz: 60,
  speedThresholdMps: 0.3,
  dwellTicks: 180,
  displacementToleranceM: 0.05,
});

/** Stable 061 event id for the arrival edge; derived from the real 059 request, not a clock. */
export function pickupArrivedEventId(requestId: string): string {
  return `pickup-arrived:${requestId}`;
}

/** Stable 061 event id for boarding; a second observation can never write a second boarding. */
export function pickupBoardedEventId(requestId: string): string {
  return `pickup-boarded:${requestId}`;
}

interface PickupZone {
  readonly id: string;
  readonly laneId: string;
  readonly kind: 'PICKUP' | 'DROPOFF' | 'BOTH';
  readonly access: readonly ('TAXI' | 'CIVIL')[];
  readonly vertices: readonly PickupPoint[];
}

interface PickupAttempt {
  readonly rideId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  inPickupZone: boolean;
  lastTick: number;
  stationaryStartTick: number | null;
  previousPosition: PickupPoint | null;
  dwellTicks: number;
  lastDecision: PickupDecision | null;
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
    result.length <= PICKUP_LIMITS.idCodeUnits && result.trim() === result,
    `Invalid ${label} identity or code-unit length`,
  );
  return result;
}

function readPoint(value: unknown): PickupPoint {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (['x', 'y', 'z'] as readonly string[]).includes(key),
      'Unknown pickup position field',
    );
  for (const key of ['x', 'y', 'z'] as const)
    requireContract(data[key] !== undefined, `Missing pickup position field: ${key}`);
  return Object.freeze({
    x: number(data.x, -1_000_000, 1_000_000),
    y: number(data.y, -1_000_000, 1_000_000),
    z: number(data.z, -1_000_000, 1_000_000),
  });
}

function readObservation(value: unknown): PickupObservation {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (observationFields as readonly string[]).includes(key),
      'Unknown pickup observation field',
    );
  for (const key of observationFields)
    requireContract(data[key] !== undefined, `Missing pickup observation field: ${key}`);
  return Object.freeze({
    rideId: boundedId(data.rideId, 'pickup ride'),
    taxiId: boundedId(data.taxiId, 'pickup taxi'),
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
    'Ride pickup requires a real ride lifecycle',
  );
  const lifecycle = value as RideLifecycle;
  requireContract(lifecycle.namespace.trim().length > 0, 'Invalid ride pickup namespace');
  return lifecycle;
}

function readInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

function cross(a: PickupPoint, b: PickupPoint, point: PickupPoint): number {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
}

function onSegment(a: PickupPoint, b: PickupPoint, point: PickupPoint): boolean {
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
function insidePolygon(vertices: readonly PickupPoint[], point: PickupPoint): boolean {
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

function buildZones(map: RoadMap): ReadonlyMap<string, PickupZone> {
  const nodes = new Map<string, PickupPoint>(),
    areas = new Map<string, readonly string[]>(),
    zones = new Map<string, PickupZone>();
  for (const node of map.geometry.nodes) nodes.set(node.id, node.positionM);
  for (const area of map.geometry.areas) areas.set(area.id, area.vertexNodeIds);
  for (const zone of map.serviceZones) {
    const vertexNodeIds = areas.get(zone.geometryId);
    requireContract(vertexNodeIds !== undefined, 'Service zone geometry is missing');
    requireContract(
      vertexNodeIds.length >= 3 && vertexNodeIds.length <= PICKUP_LIMITS.polygonVertices,
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
  zones: ReadonlyMap<string, PickupZone>,
  point: PickupPoint,
): PickupZone | undefined {
  for (const zone of zones.values()) if (insidePolygon(zone.vertices, point)) return zone;
  return undefined;
}

function distanceXZ(left: PickupPoint, right: PickupPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function zeroByReason(): Record<PickupRejectionReason, number> {
  return {
    WRONG_ZONE: 0,
    TOO_FAST: 0,
    NOT_STATIONARY: 0,
    WRONG_RIDE: 0,
    NOT_AT_PICKUP: 0,
    STALE_TICK: 0,
    FOREIGN_VEHICLE: 0,
  };
}

function attemptView(
  attempt: PickupAttempt,
  requiredDwellTicks: number,
  tickRateHz: number,
  boardedTick: number | null,
): PickupAttemptView {
  return Object.freeze({
    rideId: attempt.rideId,
    taxiId: attempt.taxiId,
    pickupZoneId: attempt.pickupZoneId,
    inPickupZone: attempt.inPickupZone,
    lastTick: attempt.lastTick,
    stationaryStartTick: attempt.stationaryStartTick,
    dwellTicks: attempt.dwellTicks,
    dwellSeconds: attempt.dwellTicks / tickRateHz,
    requiredDwellTicks,
    boardedTick,
  });
}

export function createRidePickup(options: unknown): RidePickup {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown ride pickup option field',
    );
  requireContract(data.map !== undefined, 'Ride pickup requires a map');
  requireContract(data.lifecycle !== undefined, 'Ride pickup requires a ride lifecycle');
  const map = parseRoadMap(data.map),
    lifecycle = readLifecycle(data.lifecycle),
    namespace = text(lifecycle.namespace),
    tickRateHz =
      data.tickRateHz === undefined
        ? PICKUP_DEFAULTS.tickRateHz
        : readInteger(data.tickRateHz, 1, 1_000, 'Ride pickup tick rate'),
    speedThresholdMps =
      data.speedThresholdMps === undefined
        ? PICKUP_DEFAULTS.speedThresholdMps
        : number(data.speedThresholdMps, 0, 10),
    requiredDwellTicks =
      data.dwellTicks === undefined
        ? PICKUP_DEFAULTS.dwellTicks
        : readInteger(data.dwellTicks, 1, 60_000, 'Ride pickup dwell'),
    displacementToleranceM =
      data.displacementToleranceM === undefined
        ? PICKUP_DEFAULTS.displacementToleranceM
        : number(data.displacementToleranceM, 0, 10),
    zones = buildZones(map),
    attempts = new Map<string, PickupAttempt>(),
    boardings = new Map<string, PickupBoarding>();
  let lastTick = 0,
    observations = 0,
    boardedCount = 0,
    pendingCount = 0,
    rejectedCount = 0,
    duplicates = 0,
    disposed = false;
  const byReason = zeroByReason();

  function assertLive(): void {
    if (disposed) throw new Error('Ride pickup disposed');
  }

  /** A boarded attempt is evictable; its idempotency lives in the boarding record. */
  function makeAttemptRoom(): void {
    if (attempts.size < PICKUP_LIMITS.attempts) return;
    const evictable = [...attempts.values()]
      .filter((attempt) => boardings.has(attempt.rideId))
      .sort(
        (left, right) => left.lastTick - right.lastTick || compareText(left.rideId, right.rideId),
      )[0];
    requireContract(evictable !== undefined, 'Ride pickup attempt capacity exceeded');
    attempts.delete(evictable.rideId);
  }

  function evictOldestBoarding(): void {
    while (boardings.size > PICKUP_LIMITS.boardings) {
      const oldest = [...boardings.values()].sort(
        (left, right) => left.tick - right.tick || compareText(left.rideId, right.rideId),
      )[0]!;
      boardings.delete(oldest.rideId);
    }
  }

  function zeroStats(): RidePickupStats {
    return Object.freeze({
      version: PICKUP_VERSION,
      namespace,
      tick: 0,
      attempts: 0,
      observations: 0,
      boarded: 0,
      pending: 0,
      rejected: 0,
      duplicates: 0,
      byReason: Object.freeze(zeroByReason()),
      disposed: true,
    });
  }

  function decision(
    status: PickupStatus,
    reason: PickupRejectionReason | null,
    duplicate: boolean,
    observation: PickupObservation,
    ride: RideRecord | null,
    boarding: PickupBoarding | null,
    dwellTicks: number,
    inPickupZone: boolean,
  ): PickupDecision {
    return Object.freeze({
      status,
      reason,
      duplicate,
      tick: observation.tick,
      rideId: observation.rideId,
      taxiId: observation.taxiId,
      pickupZoneId: ride?.pickupZoneId ?? null,
      inPickupZone,
      speedMps: observation.speedMps,
      dwellTicks,
      dwellSeconds: dwellTicks / tickRateHz,
      requiredDwellTicks,
      boarding,
      ride,
    });
  }

  function reject(
    observation: PickupObservation,
    reason: PickupRejectionReason,
    ride: RideRecord | null,
    attempt: PickupAttempt | null,
  ): PickupDecision {
    const result = decision(
      reason === 'NOT_STATIONARY' ? 'PENDING' : 'REJECTED',
      reason,
      false,
      observation,
      ride,
      null,
      attempt?.dwellTicks ?? 0,
      attempt?.inPickupZone ?? false,
    );
    if (reason === 'NOT_STATIONARY') pendingCount += 1;
    else rejectedCount += 1;
    byReason[reason] += 1;
    observations += 1;
    if (attempt !== null) attempt.lastDecision = result;
    return result;
  }

  function boardingFor(ride: RideRecord): PickupBoarding | null {
    const known = boardings.get(ride.rideId);
    if (known !== undefined) return known;
    const completeEventId = pickupBoardedEventId(ride.requestId),
      transition = ride.transitions.find(
        (entry) => entry.eventId === completeEventId && entry.event === 'PICKUP_COMPLETE',
      );
    if (transition === undefined) return null;
    const reconstructed = Object.freeze({
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      pickupZoneId: ride.pickupZoneId,
      tick: transition.tick,
      dwellTicks: null,
      fromState: transition.from ?? 'PICKUP',
      toState: transition.to,
      arrivedEventId: transition.from === 'TO_PICKUP' ? pickupArrivedEventId(ride.requestId) : null,
      completeEventId,
    });
    boardings.set(ride.rideId, reconstructed);
    return reconstructed;
  }

  function board(
    observation: PickupObservation,
    ride: RideRecord,
    attempt: PickupAttempt,
    dwellTicks: number,
  ): PickupDecision {
    const fromState = ride.state,
      arrivedEventId = pickupArrivedEventId(ride.requestId),
      completeEventId = pickupBoardedEventId(ride.requestId);
    let wroteArrival = false;
    if (fromState === 'TO_PICKUP') {
      lifecycle.apply({
        rideId: ride.rideId,
        eventId: arrivedEventId,
        event: 'ARRIVED_PICKUP',
        tick: observation.tick,
      });
      wroteArrival = true;
    }
    const applied = lifecycle.apply({
      rideId: ride.rideId,
      eventId: completeEventId,
      event: 'PICKUP_COMPLETE',
      tick: observation.tick,
    });
    const boarding = Object.freeze({
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      pickupZoneId: ride.pickupZoneId,
      tick: observation.tick,
      dwellTicks,
      fromState,
      toState: applied.ride.state,
      arrivedEventId: wroteArrival ? arrivedEventId : null,
      completeEventId,
    });
    boardings.set(ride.rideId, boarding);
    evictOldestBoarding();
    attempt.lastTick = observation.tick;
    attempt.inPickupZone = true;
    attempt.previousPosition = observation.positionM;
    attempt.dwellTicks = dwellTicks;
    boardedCount += 1;
    observations += 1;
    const result = decision(
      'BOARDED',
      null,
      false,
      observation,
      applied.ride,
      boarding,
      dwellTicks,
      true,
    );
    attempt.lastDecision = result;
    return result;
  }

  function observe(input: unknown): PickupDecision {
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

    const boarding = boardingFor(ride);
    if (boarding !== null) {
      const existing = attempts.get(ride.rideId) ?? null;
      if (existing !== null) existing.lastTick = observation.tick;
      duplicates += 1;
      observations += 1;
      return decision(
        'BOARDED',
        null,
        true,
        observation,
        ride,
        boarding,
        boarding.dwellTicks ?? 0,
        existing?.inPickupZone ?? false,
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

    if (ride.state !== 'TO_PICKUP' && ride.state !== 'PICKUP')
      return reject(observation, 'WRONG_RIDE', ride, null);

    const zone = zones.get(ride.pickupZoneId);
    if (zone === undefined || !zone.access.includes('TAXI') || zone.kind === 'DROPOFF') {
      attempts.delete(ride.rideId);
      return reject(observation, 'WRONG_ZONE', ride, null);
    }

    if (attempt === undefined) {
      makeAttemptRoom();
      attempt = {
        rideId: ride.rideId,
        taxiId: ride.taxiId,
        pickupZoneId: ride.pickupZoneId,
        inPickupZone: false,
        lastTick: observation.tick,
        stationaryStartTick: null,
        previousPosition: null,
        dwellTicks: 0,
        lastDecision: null,
      };
      attempts.set(ride.rideId, attempt);
    }

    const inPickupZone = insidePolygon(zone.vertices, observation.positionM);
    if (!inPickupZone) {
      const other = zoneAt(zones, observation.positionM),
        reason: PickupRejectionReason = other === undefined ? 'NOT_AT_PICKUP' : 'WRONG_ZONE';
      attempt.inPickupZone = false;
      attempt.lastTick = observation.tick;
      attempt.stationaryStartTick = null;
      attempt.previousPosition = null;
      attempt.dwellTicks = 0;
      return reject(observation, reason, ride, attempt);
    }

    if (observation.speedMps > speedThresholdMps) {
      attempt.inPickupZone = true;
      attempt.lastTick = observation.tick;
      attempt.stationaryStartTick = null;
      attempt.previousPosition = observation.positionM;
      attempt.dwellTicks = 0;
      return reject(observation, 'TOO_FAST', ride, attempt);
    }

    const contiguous =
        attempt.inPickupZone &&
        attempt.stationaryStartTick !== null &&
        observation.tick === attempt.lastTick + 1,
      moved =
        contiguous &&
        attempt.previousPosition !== null &&
        distanceXZ(attempt.previousPosition, observation.positionM) > displacementToleranceM;
    let stationaryStartTick: number;
    if (!contiguous || moved) {
      stationaryStartTick = observation.tick;
    } else {
      stationaryStartTick = attempt.stationaryStartTick!;
    }
    const dwellTicks = observation.tick - stationaryStartTick;
    attempt.inPickupZone = true;
    attempt.lastTick = observation.tick;
    attempt.stationaryStartTick = stationaryStartTick;
    attempt.previousPosition = observation.positionM;
    attempt.dwellTicks = dwellTicks;
    if (dwellTicks >= requiredDwellTicks) return board(observation, ride, attempt, dwellTicks);
    return reject(observation, 'NOT_STATIONARY', ride, attempt);
  }

  return Object.freeze({
    namespace,
    tickRateHz,
    speedThresholdMps,
    requiredDwellTicks,
    displacementToleranceM,
    currentTick: () => lastTick,
    observe,
    attempt(rideId: string): PickupAttemptView | undefined {
      if (disposed) return undefined;
      const attempt = attempts.get(rideId);
      if (attempt === undefined) return undefined;
      return attemptView(
        attempt,
        requiredDwellTicks,
        tickRateHz,
        boardings.get(rideId)?.tick ?? null,
      );
    },
    boardings(): readonly PickupBoarding[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...boardings.values()].sort((left, right) => compareText(left.rideId, right.rideId)),
      );
    },
    stats(): RidePickupStats {
      if (disposed) return zeroStats();
      return Object.freeze({
        version: PICKUP_VERSION,
        namespace,
        tick: lastTick,
        attempts: attempts.size,
        observations,
        boarded: boardedCount,
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
      boardings.clear();
      lastTick = 0;
      observations = 0;
      boardedCount = 0;
      pendingCount = 0;
      rejectedCount = 0;
      duplicates = 0;
      for (const reason of PICKUP_REJECTION_REASONS) byReason[reason] = 0;
    },
  });
}
