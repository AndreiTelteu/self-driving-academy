/**
 * 147 passenger visual contract. It is a pure visual read model over the real 061 ride state:
 * pickup/dropoff markers at real 032 service-zone anchors plus the V1 occupant state.
 *
 * The projection never creates a passenger actor, a pedestrian, a ride event, an opportunity or
 * telemetry. It carries no clock and no renderer: the composition root (147 app) reads the real
 * lifecycle and map, and the adapter writes a small marker port.
 *
 * Identity rule: a marker is identified by `rideId + role` (`passengerMarkerId`), never by an array
 * position or by a coordinate. Re-projecting the same ride after a phase change keeps the same id for
 * a role that is still visible and removes the roles that are no longer part of the phase.
 */
export const PASSENGER_VISUAL_VERSION = '147-passenger-visual-v1' as const;

export const PASSENGER_VISUAL_LIMITS = Object.freeze({
  version: PASSENGER_VISUAL_VERSION,
  /** One pickup/passenger pair or one dropoff marker; the V1 passenger is never a crowd. */
  markers: 2,
  /** At most one omission per zone-backed marker role. */
  omissions: 2,
  /** Worst-case marker port writes for one accepted frame: 2 removals + 2 sets + 1 visibility. */
  commandsPerFrame: 5,
  /** Code units per session, taxi, ride and marker identity. */
  idCodeUnits: 512,
  /** Code units per zone identity kept on a marker or an omission. */
  zoneIdCodeUnits: 512,
  /** Code units per short label (phase, occupancy, passenger). */
  labelCodeUnits: 64,
  /** Code units per accessible description. */
  textCodeUnits: 1024,
  retainedFrames: 1,
  /** V1 renders no pedestrian actor; pedestrians are owned by V2. */
  pedestrianActors: 0,
});

export const passengerVisualPhases = [
  'NONE',
  'WAITING_PICKUP',
  'BOARDING',
  'ONBOARD',
  'DROPPING_OFF',
] as const;
export type PassengerVisualPhase = (typeof passengerVisualPhases)[number];

export const passengerMarkerRoles = ['PICKUP', 'PASSENGER', 'DROPOFF'] as const;
export type PassengerMarkerRole = (typeof passengerMarkerRoles)[number];

/** Closed reasons for omitting a marker; a missing anchor is never replaced with a fake point. */
export const PASSENGER_MARKER_OMISSION_REASONS = ['ZONE_MISSING', 'ANCHOR_MISSING'] as const;
export type PassengerMarkerOmissionReason = (typeof PASSENGER_MARKER_OMISSION_REASONS)[number];

export type PassengerMarkerLabel = 'P' | 'D' | 'S';

/** One marker at a real map coordinate; `x`/`z` are the validated 032 anchor in metres. */
export interface PassengerMarker {
  /** Stable `passengerMarkerId(rideId, role)`; never an array index or a coordinate. */
  readonly markerId: string;
  readonly role: PassengerMarkerRole;
  /** Real 032 service-zone id that owns the anchor. */
  readonly zoneId: string;
  readonly x: number;
  readonly z: number;
  readonly label: PassengerMarkerLabel;
}

/** A marker that could not be placed because the real zone or its anchor is missing. */
export interface PassengerMarkerOmission {
  readonly role: 'PICKUP' | 'DROPOFF';
  readonly zoneId: string;
  readonly reason: PassengerMarkerOmissionReason;
}

/** Short, deterministic text for the adapter; `accessibleText` carries the full sentence. */
export interface PassengerVisualLabels {
  readonly phase: string;
  readonly occupancy: string;
  readonly passenger: string;
}

/**
 * One visual frame. `passengerVisible` says the V1 passenger representation exists (waiting at the
 * pickup anchor or seated in the claimed taxi); `occupancy` says whether that passenger is inside the
 * taxi. Onboard phases therefore have no world marker, because the ride owns no seat coordinate.
 */
export interface PassengerVisualFrame {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof PASSENGER_VISUAL_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly taxiId: string;
  readonly rideId: string | null;
  readonly phase: PassengerVisualPhase;
  readonly occupancy: 0 | 1;
  readonly passengerVisible: boolean;
  readonly markers: readonly PassengerMarker[];
  readonly omissions: readonly PassengerMarkerOmission[];
  readonly labels: PassengerVisualLabels;
  readonly accessibleText: string;
  /** `true` only for `NONE`: the adapter clears every marker and the occupancy. */
  readonly reset: boolean;
}

export const PASSENGER_VISUAL_FRAME_FIELDS = Object.freeze([
  'schemaVersion',
  'units',
  'version',
  'sessionId',
  'worldEpoch',
  'tick',
  'taxiId',
  'rideId',
  'phase',
  'occupancy',
  'passengerVisible',
  'markers',
  'omissions',
  'labels',
  'accessibleText',
  'reset',
] as const);

const MARKER_FIELDS = ['markerId', 'role', 'zoneId', 'x', 'z', 'label'] as const,
  OMISSION_FIELDS = ['role', 'zoneId', 'reason'] as const,
  LABEL_FIELDS = ['phase', 'occupancy', 'passenger'] as const;

const MARKER_ORDER: Readonly<Record<PassengerMarkerRole, number>> = Object.freeze({
  PICKUP: 0,
  PASSENGER: 1,
  DROPOFF: 2,
});

const MARKER_LABELS: Readonly<Record<PassengerMarkerRole, PassengerMarkerLabel>> = Object.freeze({
  PICKUP: 'P',
  PASSENGER: 'S',
  DROPOFF: 'D',
});

/** Marker roles required by a phase; terminal/no-ride phases require none. */
export const PASSENGER_PHASE_MARKERS: Readonly<
  Record<PassengerVisualPhase, readonly PassengerMarkerRole[]>
> = Object.freeze({
  NONE: Object.freeze([]),
  WAITING_PICKUP: Object.freeze(['PICKUP'] as const),
  BOARDING: Object.freeze(['PICKUP', 'PASSENGER'] as const),
  ONBOARD: Object.freeze(['DROPOFF'] as const),
  DROPPING_OFF: Object.freeze(['DROPOFF'] as const),
});

/** Closed phase mapping of the real 061 ride states. Terminal states never become a phase. */
export const PASSENGER_STATE_PHASES: Readonly<Record<string, PassengerVisualPhase>> = Object.freeze(
  {
    TO_PICKUP: 'WAITING_PICKUP',
    PICKUP: 'BOARDING',
    TO_DROPOFF: 'ONBOARD',
    DROPOFF: 'DROPPING_OFF',
    COMPLETED: 'NONE',
    FAILED: 'NONE',
    CANCELLED: 'NONE',
  },
);

/** Stable marker identity: one role per ride, independent of tick, phase repetition or order. */
export function passengerMarkerId(rideId: string, role: PassengerMarkerRole): string {
  return `passenger:${rideId}:${role}`;
}

function fail(message: string): never {
  throw new Error(message);
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
  return data;
}

function id(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail(`${label} identity`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a nonnegative integer`);
  return value;
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} text`);
  return value;
}

function parseMarker(value: unknown, rideId: string | null): PassengerMarker {
  const data = exact(value, MARKER_FIELDS, 'Passenger marker'),
    role = data.role as PassengerMarkerRole;
  if (!(passengerMarkerRoles as readonly string[]).includes(role)) fail('Passenger marker role');
  if (rideId === null) fail('Passenger marker requires a ride');
  const markerId = id(data.markerId, PASSENGER_VISUAL_LIMITS.idCodeUnits, 'Passenger marker');
  if (markerId !== passengerMarkerId(rideId, role))
    fail('Passenger marker id is not the stable rideId + role identity');
  if (data.label !== MARKER_LABELS[role]) fail('Passenger marker label');
  return Object.freeze({
    markerId,
    role,
    zoneId: id(data.zoneId, PASSENGER_VISUAL_LIMITS.zoneIdCodeUnits, 'Passenger marker zone'),
    x: finite(data.x, 'Passenger marker x'),
    z: finite(data.z, 'Passenger marker z'),
    label: MARKER_LABELS[role],
  });
}

function parseOmission(value: unknown): PassengerMarkerOmission {
  const data = exact(value, OMISSION_FIELDS, 'Passenger marker omission'),
    role = data.role;
  if (role !== 'PICKUP' && role !== 'DROPOFF') fail('Passenger marker omission role');
  const reason = data.reason;
  if (!(PASSENGER_MARKER_OMISSION_REASONS as readonly unknown[]).includes(reason))
    fail('Passenger marker omission reason');
  return Object.freeze({
    role,
    zoneId: id(
      data.zoneId,
      PASSENGER_VISUAL_LIMITS.zoneIdCodeUnits,
      'Passenger marker omission zone',
    ),
    reason: reason as PassengerMarkerOmissionReason,
  });
}

function parseLabels(value: unknown): PassengerVisualLabels {
  const data = exact(value, LABEL_FIELDS, 'Passenger visual labels');
  return Object.freeze({
    phase: text(data.phase, PASSENGER_VISUAL_LIMITS.labelCodeUnits, 'Passenger phase label'),
    occupancy: text(
      data.occupancy,
      PASSENGER_VISUAL_LIMITS.labelCodeUnits,
      'Passenger occupancy label',
    ),
    passenger: text(data.passenger, PASSENGER_VISUAL_LIMITS.labelCodeUnits, 'Passenger label'),
  });
}

/**
 * Validates and freezes one frame before any marker port write. Contract invariants are closed:
 * a phase determines the allowed marker roles, occupancy and visibility; an omitted zone-backed
 * marker needs an explicit reason; roles cannot repeat.
 */
export function parsePassengerVisualFrame(value: unknown): PassengerVisualFrame {
  const data = exact(value, PASSENGER_VISUAL_FRAME_FIELDS, 'Passenger visual frame'),
    tick = count(data.tick, 'Passenger visual tick');
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== PASSENGER_VISUAL_VERSION)
    fail('Passenger visual frame contract');
  const phase = data.phase as PassengerVisualPhase;
  if (!(passengerVisualPhases as readonly string[]).includes(phase)) fail('Passenger visual phase');
  const rideId =
    data.rideId === null
      ? null
      : id(data.rideId, PASSENGER_VISUAL_LIMITS.idCodeUnits, 'Passenger visual ride');
  if (data.occupancy !== 0 && data.occupancy !== 1) fail('Passenger visual occupancy');
  const occupancy = data.occupancy,
    expectedOccupancy = phase === 'ONBOARD' || phase === 'DROPPING_OFF' ? 1 : 0,
    expectedVisible = phase === 'BOARDING' || phase === 'ONBOARD' || phase === 'DROPPING_OFF',
    expectedReset = phase === 'NONE';
  if (occupancy !== expectedOccupancy) fail('Passenger visual occupancy does not match the phase');
  if (typeof data.passengerVisible !== 'boolean') fail('Passenger visual visibility flag');
  if (data.passengerVisible !== expectedVisible)
    fail('Passenger visual visibility does not match the phase');
  if (typeof data.reset !== 'boolean') fail('Passenger visual reset flag');
  if (data.reset !== expectedReset) fail('Passenger visual reset does not match the phase');
  if (phase !== 'NONE' && rideId === null) fail('Passenger visual phase requires a ride');
  if (!Array.isArray(data.markers)) fail('Passenger visual marker list');
  if (!Array.isArray(data.omissions)) fail('Passenger visual omission list');
  if (data.markers.length > PASSENGER_VISUAL_LIMITS.markers)
    fail('Passenger visual marker ceiling');
  if (data.omissions.length > PASSENGER_VISUAL_LIMITS.omissions)
    fail('Passenger visual omission ceiling');
  const markers = data.markers.map((marker) => parseMarker(marker, rideId)),
    seenRoles = new Set<PassengerMarkerRole>();
  for (const marker of markers) {
    if (seenRoles.has(marker.role)) fail('Passenger visual repeats a marker role');
    seenRoles.add(marker.role);
  }
  markers.sort((left, right) => MARKER_ORDER[left.role] - MARKER_ORDER[right.role]);
  const required = PASSENGER_PHASE_MARKERS[phase],
    omissions = data.omissions.map(parseOmission),
    omittedRoles = new Set<string>();
  for (const omission of omissions) {
    if (omittedRoles.has(omission.role)) fail('Passenger visual repeats an omission role');
    omittedRoles.add(omission.role);
    if (!required.includes(omission.role))
      fail('Passenger visual omission is not part of the phase');
    if (omission.role === 'PICKUP' && (seenRoles.has('PICKUP') || seenRoles.has('PASSENGER')))
      fail('Passenger visual omission conflicts with a placed pickup marker');
    if (omission.role === 'DROPOFF' && seenRoles.has('DROPOFF'))
      fail('Passenger visual omission conflicts with a placed dropoff marker');
  }
  for (const role of seenRoles)
    if (!required.includes(role)) fail('Passenger visual marker is not part of the phase');
  for (const role of required) {
    if (seenRoles.has(role)) continue;
    // The single V1 passenger stands at the pickup anchor, so a missing pickup anchor also omits it.
    if (role === 'PASSENGER') {
      if (!omittedRoles.has('PICKUP'))
        fail('Passenger visual boarding frame is missing the passenger marker');
      continue;
    }
    if (!omittedRoles.has(role))
      fail('Passenger visual phase is missing a required marker without a reason');
  }
  if (omittedRoles.has('PICKUP') && seenRoles.has('PASSENGER'))
    fail('Passenger visual passenger marker has no real pickup anchor');
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: PASSENGER_VISUAL_VERSION,
    sessionId: id(data.sessionId, PASSENGER_VISUAL_LIMITS.idCodeUnits, 'Passenger visual session'),
    worldEpoch: count(data.worldEpoch, 'Passenger visual world epoch'),
    tick,
    taxiId: id(data.taxiId, PASSENGER_VISUAL_LIMITS.idCodeUnits, 'Passenger visual taxi'),
    rideId,
    phase,
    occupancy,
    passengerVisible: data.passengerVisible,
    markers: Object.freeze(markers),
    omissions: Object.freeze(omissions),
    labels: parseLabels(data.labels),
    accessibleText: text(
      data.accessibleText,
      PASSENGER_VISUAL_LIMITS.textCodeUnits,
      'Passenger visual accessible description',
    ),
    reset: data.reset,
  });
}

/** Deterministic signature of every semantic field; adapter writes are skipped when it is unchanged. */
export function passengerVisualSignature(frame: PassengerVisualFrame): string {
  return JSON.stringify([
    PASSENGER_VISUAL_VERSION,
    frame.sessionId,
    frame.worldEpoch,
    frame.tick,
    frame.taxiId,
    frame.rideId,
    frame.phase,
    frame.occupancy,
    frame.passengerVisible,
    frame.markers.map((marker) => [
      marker.markerId,
      marker.role,
      marker.zoneId,
      marker.x,
      marker.z,
      marker.label,
    ]),
    frame.omissions.map((omission) => [omission.role, omission.zoneId, omission.reason]),
    frame.labels.phase,
    frame.labels.occupancy,
    frame.labels.passenger,
    frame.accessibleText,
    frame.reset,
  ]);
}
