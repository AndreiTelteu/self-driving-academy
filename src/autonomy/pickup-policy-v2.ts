import { choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { roadSurface, vehicleClass } from '../vehicles';
import type { RoadSurfaceId, VehicleClassId } from '../vehicles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 185 extended pickup and passenger-comfort policy: the preferred approach speed, curb distance,
 * stop precision and dwell of a service stop, the dropoff approach speed and curb distance, and
 * the two scales that apply **only** while the passenger is aboard.
 *
 * The layer is a policy over the observable facts of the tick, never a second pickup/dropoff
 * system: `062-pickup-v1` owns the marked service zone, the stationary speed threshold and the
 * boarding dwell, `061-ride-fsm-v1` owns the ride state that decides whether the cabin is
 * occupied, `032` owns the authored service-zone polygon, `023` owns the vehicle width and grip,
 * and `026` the declared road surface. The layer reads those facts and only decides how the driver
 * approaches, where the body may stop and when the vehicle may leave.
 *
 * **The three kinds of value are kept apart.**
 * 1. **Service preferences** — the four preference keys of the stop: `pickup_approach_speed` (m/s),
 *    `pickup_curb_distance` (m), `pickup_stop_precision` (m) and `pickup_dwell_time` (s), plus the
 *    two dropoff preferences `dropoff_approach_speed` (m/s) and `dropoff_curb_distance` (m).
 *    A preference is honoured inside the envelope the mandatory rules allow and never changes it.
 * 2. **Mandatory thresholds** — the authored marked service zone (the client may be taken or left
 *    only inside it), the curb band of that zone (the body must stay off the curb and out of the
 *    travel lane), the 062 stationary threshold, the boarding dwell and the 061 boarding/alighting
 *    confirmation. They are facts plus documented policy constants; no key can move them.
 * 3. **Occupied state** — `occupied_acceleration_scale` and `occupied_lateral_accel_scale` (ratio)
 *    only modify the acceleration and lateral accelerations while the 061 ride carries a
 *    passenger, and are capped by comfort and by adhesion whatever the key says.
 *
 * **What each key does, in its own scenario.**
 * 1. `pickup_approach_speed` — the speed commanded on the approach to the marked pickup stop,
 *    `min(key, sqrt(2 · comfort_deceleration · distanceToStop))`: no admissible key can stop past
 *    the marked stop point, so the vehicle can never stop beyond the authored zone.
 * 2. `pickup_curb_distance` — the desired clearance between the ego body and the curb, clamped to
 *    `[minimumCurbClearanceM, curbBandM − trackM]`: the lower bound keeps the body off the curb,
 *    the upper bound keeps it inside the authored bay instead of the travel lane.
 * 3. `pickup_stop_precision` — the tolerated longitudinal stop error, clamped to
 *    `[physicalPositionToleranceM, min(stopOffset, length − stopOffset)]`: the declared precision
 *    cannot be tighter than the delivered 062 displacement tolerance and cannot be so loose that
 *    the passenger would be left outside the marked zone.
 * 4. `pickup_dwell_time` — the preferred stationary time at the pickup, raised to
 *    `max(062 boarding dwell, M stop_dwell_time)`. The vehicle may not leave before the 061 ride
 *    confirms the boarding, at any key value.
 * 5. `dropoff_approach_speed` — the same kinematic approach envelope on the dropoff approach.
 * 6. `dropoff_curb_distance` — the same curb band on the dropoff stop.
 * 7. `occupied_acceleration_scale` — the longitudinal acceleration with a passenger aboard,
 *    `min(key · desired_acceleration, comfort_deceleration, grip · tireGripScale · g)`. Alone in
 *    the cabin the scale is inert and the delivered M acceleration is kept.
 * 8. `occupied_lateral_accel_scale` — the lateral acceleration with a passenger aboard,
 *    `min(key · curve_lateral_accel, curve_lateral_accel, grip · tireGripScale · g)`: the delivered
 *    cornering preference is the comfort ceiling, and the tyre is the physical one.
 *
 * **M interaction.** The layer reads four delivered M keys without rewriting them:
 * `desired_acceleration` (m/s²) is the base of the occupied longitudinal scale,
 * `comfort_deceleration` (m/s²) is the deceleration of every approach cap and the comfort ceiling
 * of the occupied acceleration, `curve_lateral_accel` (m/s²) is the base and the comfort ceiling of
 * the occupied lateral acceleration, and `stop_dwell_time` (s) is raised into the pickup dwell
 * floor. Units stay the catalog units and the inherited values are reported next to the R
 * contribution.
 *
 * The layer keeps no history (`retainedHistory: 0`): every decision is a pure function of the
 * input, and a repeated evaluation of the same tick reproduces the same command.
 */
export const PICKUP_POLICY_V2_KEYS = Object.freeze([
  'pickup_approach_speed',
  'pickup_curb_distance',
  'pickup_stop_precision',
  'pickup_dwell_time',
  'dropoff_approach_speed',
  'dropoff_curb_distance',
  'occupied_acceleration_scale',
  'occupied_lateral_accel_scale',
] as const);
export type PickupPolicyV2Key = (typeof PICKUP_POLICY_V2_KEYS)[number];
/** The delivered M keys the layer reads without changing their meaning. */
export const PICKUP_POLICY_V2_M_KEYS = Object.freeze([
  'desired_acceleration',
  'comfort_deceleration',
  'curve_lateral_accel',
  'stop_dwell_time',
] as const);
export type PickupPolicyV2MKey = (typeof PICKUP_POLICY_V2_M_KEYS)[number];
/** The closed 061 ride-state vocabulary, mirrored here because the policy must not import fleet. */
export const PICKUP_POLICY_V2_RIDE_STATES = Object.freeze([
  'TO_PICKUP',
  'PICKUP',
  'TO_DROPOFF',
  'DROPOFF',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const);
export type PickupPolicyRideState = (typeof PICKUP_POLICY_V2_RIDE_STATES)[number];
/** The 061 states that carry the passenger, the same rule 139 declares for comfort. */
export const PICKUP_POLICY_V2_ABOARD_RIDE_STATES = Object.freeze([
  'TO_DROPOFF',
  'DROPOFF',
] as const);
export const PICKUP_POLICY_V2_LIMITS = Object.freeze({
  version: '185-pickup-policy-v2' as const,
  observationVersion: '185-pickup-observation-v1' as const,
  mechanicsVersion: '023-mechanics-v1' as const,
  surfaceVersion: '026-flat-surfaces-v1' as const,
  rideStateVersion: '061-ride-fsm-v1' as const,
  idCodeUnits: 256,
  profileCodeUnits: 128,
  maximumDistanceM: 1000,
  maximumSpeedMps: 100,
  maximumTimeS: 3600,
  /** Mechanical coverage ceiling of the delivered speed policies (046/167): 30 m/s. */
  maximumCommandedSpeedMps: 30,
  /** Standard gravity, used to turn the delivered tyre grip into an adhesion limit. */
  standardGravityMps2: 9.81,
  /**
   * Documented body clearance from the curb. The 032 zone is the marked bay; a body edge closer
   * than this to the outer boundary would mount the curb, so the lower curb bound is a policy
   * constant (the vehicle geometry owns the width, not this reserve).
   */
  minimumCurbClearanceM: 0.15,
  /**
   * The delivered 062 displacement tolerance (0.05 m between two stationary observations). A
   * declared stop precision can never be tighter than the position proof the service accepts.
   */
  physicalPositionToleranceM: 0.05,
  /**
   * The delivered 062 boarding dwell: 180 simulated ticks at 60 Hz. The 061 ride only confirms the
   * boarding after that stationary proof, so no key can make a departure happen sooner.
   */
  boardingDwellS: 3,
  /** The delivered 062 stationary speed threshold: at or below it the taxi counts as stopped. */
  standstillMps: 0.3,
  tickHz: 60,
  retainedHistory: 0,
});
export interface PickupPolicyV2Profile {
  readonly version: '185-pickup-policy-v2';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<PickupPolicyV2Key, number>>;
  readonly units: Readonly<Record<PickupPolicyV2Key, ParameterUnit>>;
  readonly provenance: Readonly<Record<PickupPolicyV2Key, string>>;
  readonly mValues: Readonly<Record<PickupPolicyV2MKey, number>>;
  readonly mUnits: Readonly<Record<PickupPolicyV2MKey, ParameterUnit>>;
}
export type PickupServiceKind = 'PICKUP' | 'DROPOFF' | 'BOTH';
export type PickupServicePhase = 'PICKUP' | 'DROPOFF';
/**
 * The authored service stop of the tick. `062-pickup-v1`/`063-dropoff-v1` own the zone access and
 * the containment proof; the widths, lengths and the marked stop point come from the real 032
 * polygon and its authored anchor node, and the distances are the ego placement of the scenario.
 */
export interface PickupPolicyV2Service {
  readonly zoneId: string;
  readonly zoneKind: PickupServiceKind;
  /** The service being performed, as the caller derives it from the 061 ride state. */
  readonly phase: PickupServicePhase;
  /** True when the authored zone admits TAXI access; a CIVIL-only zone is not a service stop. */
  readonly taxiAccess: boolean;
  /** Signed distance to the marked stop point, m; positive before it, negative after it. */
  readonly distanceToStopM: number;
  /** Authored longitudinal length of the marked bay, m. */
  readonly lengthM: number;
  /** Offset of the authored stop point from the bay entry, m; inside `[0, lengthM]`. */
  readonly stopOffsetM: number;
  /** Authored lateral depth of the bay measured from the curb, m. */
  readonly curbBandM: number;
  /** Current clearance between the ego body and the curb, m. */
  readonly curbDistanceM: number;
}
export interface PickupPolicyV2Mechanics {
  readonly version: '023-mechanics-v1';
  readonly classId: VehicleClassId;
}
export interface PickupPolicyV2Surface {
  readonly version: '026-flat-surfaces-v1';
  readonly id: RoadSurfaceId;
}
export interface PickupPolicyV2Observation extends BehaviorScope {
  readonly version: '185-pickup-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly speedMps: number;
  readonly mechanics: PickupPolicyV2Mechanics;
  readonly surface: PickupPolicyV2Surface;
  /** The real 061 ride state; it decides the occupied cabin, never a free assertion. */
  readonly rideState: PickupPolicyRideState;
  /** Simulated seconds already spent stationary at the stop, from the caller's service clock. */
  readonly dwellElapsedS: number;
  readonly service: PickupPolicyV2Service | null;
}
export interface PickupPolicyV2Input extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: PickupPolicyV2Profile | null;
  readonly observation: PickupPolicyV2Observation;
}
export type PickupPolicyV2Action =
  'CRUISE' | 'APPROACH' | 'HOLD' | 'DEPART' | 'GO_AROUND' | 'UNAVAILABLE';
export type PickupPolicyV2BlockedReason =
  | 'ZONE_KIND_MISMATCH'
  | 'ZONE_NOT_TAXI'
  | 'STOP_BEYOND_ZONE'
  | 'BAY_TOO_NARROW'
  | 'STOP_WINDOW_TOO_TIGHT';
export type PickupPolicyV2Reason =
  | 'PICKUP_POLICY_V2'
  | 'NO_AUTO_AUTHORITY'
  | 'MISSING_PROFILE'
  | 'FOREIGN_OR_STALE_OBSERVATION'
  | 'NO_SERVICE'
  | 'PASSENGER_LIMITS'
  | PickupPolicyV2BlockedReason
  | 'APPROACH'
  | 'HOLD'
  | 'SERVICE_NOT_CONFIRMED'
  | 'DWELL_PENDING'
  | 'READY_TO_DEPART';
export type PickupPolicyV2DepartureReason =
  | 'STOP_NOT_ALLOWED'
  | 'STOP_NOT_IN_ZONE'
  | 'SERVICE_NOT_CONFIRMED'
  | 'DWELL_PENDING'
  | 'NOT_STATIONARY';
export interface PickupPolicyV2ApproachCommand {
  readonly key: PickupPolicyV2Key;
  readonly keyValue: number;
  readonly preferredSpeedMps: number;
  /** Fastest approach that still stops at the marked point at the delivered comfort deceleration. */
  readonly feasibleSpeedMps: number;
  readonly commandedSpeedMps: number;
  readonly stoppingDistanceM: number;
  /** Offset from the bay entry at which the commanded speed would stop, m. */
  readonly projectedStopOffsetM: number;
  readonly capped: boolean;
}
export interface PickupPolicyV2CurbCommand {
  readonly key: PickupPolicyV2Key;
  readonly keyValue: number;
  readonly desiredM: number;
  readonly effectiveM: number;
  readonly minimumM: number;
  readonly maximumM: number;
  readonly bandM: number;
  readonly widthM: number;
  readonly clampedLow: boolean;
  readonly clampedHigh: boolean;
  readonly currentM: number;
  readonly insideBand: boolean;
}
export interface PickupPolicyV2PrecisionCommand {
  readonly keyValue: number;
  readonly desiredM: number;
  readonly effectiveM: number;
  /** The delivered 062 position proof: no declared tolerance can be tighter than this. */
  readonly floorM: number;
  /** The largest tolerance that still keeps the passenger inside the marked bay, m. */
  readonly maximumM: number;
  readonly floored: boolean;
  readonly capped: boolean;
  /** The worst-case stop window, always inside the marked bay: `[fromM, toM]`. */
  readonly windowFromM: number;
  readonly windowToM: number;
}
export interface PickupPolicyV2DwellCommand {
  readonly preferredS: number;
  readonly effectiveS: number;
  /** `max(062 boarding dwell, M stop_dwell_time)`, s. */
  readonly minimumS: number;
  readonly boardingMinimumS: number;
  readonly mMinimumS: number;
  readonly elapsedS: number;
  readonly satisfied: boolean;
  readonly remainingS: number;
}
export interface PickupPolicyV2ScaleCommand {
  readonly key: PickupPolicyV2Key;
  readonly keyValue: number;
  /** The delivered M preference the scale multiplies, m/s². */
  readonly baseMps2: number;
  readonly comfortCapMps2: number;
  readonly adhesionLimitMps2: number;
  readonly requestedMps2: number;
  readonly commandedMps2: number;
  /** True only with the passenger aboard; alone in the cabin the key has no effect at all. */
  readonly applied: boolean;
  readonly cappedBy: 'NONE' | 'COMFORT' | 'ADHESION';
}
export interface PickupPolicyV2PassengerCommand {
  readonly aboard: boolean;
  readonly acceleration: PickupPolicyV2ScaleCommand;
  readonly lateralAccel: PickupPolicyV2ScaleCommand;
}
export interface PickupPolicyV2Mandatory {
  readonly zoneId: string;
  readonly zoneKind: PickupServiceKind;
  readonly phase: PickupServicePhase;
  readonly taxiAccess: boolean;
  readonly lengthM: number;
  readonly stopOffsetM: number;
  /** Ego offset from the bay entry, m; negative before the bay, above `lengthM` past it. */
  readonly entryOffsetM: number;
  readonly insideZone: boolean;
  readonly curbMinimumM: number;
  readonly curbMaximumM: number;
  readonly curbBandM: number;
  readonly dwellMinimumS: number;
  readonly precisionFloorM: number;
  readonly stopAllowed: boolean;
  readonly blockedReason: PickupPolicyV2BlockedReason | null;
}
export interface PickupPolicyV2Departure {
  /** The 061 edge that confirms the boarding (pickup) or the alighting (dropoff). */
  readonly confirmed: boolean;
  readonly dwellSatisfied: boolean;
  readonly stationary: boolean;
  readonly insideZone: boolean;
  readonly mayDepart: boolean;
  readonly reason: PickupPolicyV2DepartureReason | null;
}
export interface PickupPolicyV2Geometry {
  readonly classId: VehicleClassId;
  readonly widthM: number;
  readonly grip: number;
  readonly adhesionLimitMps2: number;
}
export interface PickupPolicyV2Command extends BehaviorScope {
  readonly version: '185-pickup-policy-v2';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: PickupPolicyV2Reason;
  readonly action: PickupPolicyV2Action;
  readonly rideState: PickupPolicyRideState;
  readonly geometry: PickupPolicyV2Geometry;
  readonly surfaceId: RoadSurfaceId;
  readonly tireGripScale: number;
  readonly mandatory: PickupPolicyV2Mandatory | null;
  readonly approach: PickupPolicyV2ApproachCommand | null;
  readonly curb: PickupPolicyV2CurbCommand | null;
  readonly precision: PickupPolicyV2PrecisionCommand | null;
  readonly dwell: PickupPolicyV2DwellCommand | null;
  readonly passenger: PickupPolicyV2PassengerCommand;
  readonly departure: PickupPolicyV2Departure;
  readonly commandedSpeedMps: number;
  readonly retainedHistory: 0;
}
let compiling = false;
let evaluating = false;
export function getPickupPolicyV2Stats() {
  return Object.freeze({ compiling, evaluating, retainedHistory: 0 });
}
const profiles = new WeakSet<object>();
const observationFields = [
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'speedMps',
  'mechanics',
  'surface',
  'rideState',
  'dwellElapsedS',
  'service',
] as const;
const serviceFields = [
  'zoneId',
  'zoneKind',
  'phase',
  'taxiAccess',
  'distanceToStopM',
  'lengthM',
  'stopOffsetM',
  'curbBandM',
  'curbDistanceM',
] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'profile',
  'observation',
] as const;
function identity(value: unknown, maximum: number = PICKUP_POLICY_V2_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid pickup policy v2 identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: identity(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
function flag(value: unknown, message: string): boolean {
  requireContract(typeof value === 'boolean', message);
  return value;
}
export function compilePickupPolicyProfile(input: unknown): PickupPolicyV2Profile {
  requireContract(!compiling, 'Reentrant pickup policy v2 profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<PickupPolicyV2Key, number>,
      units = {} as Record<PickupPolicyV2Key, ParameterUnit>,
      provenance = {} as Record<PickupPolicyV2Key, string>,
      mValues = {} as Record<PickupPolicyV2MKey, number>,
      mUnits = {} as Record<PickupPolicyV2MKey, ParameterUnit>;
    for (const key of PICKUP_POLICY_V2_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing pickup policy v2 parameter',
      );
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    for (const key of PICKUP_POLICY_V2_M_KEYS) {
      requireContract(
        Object.hasOwn(published.parameters, key),
        'Missing pickup policy v2 M parameter',
      );
      mValues[key] = published.parameters[key];
      mUnits[key] = published.unitsByParameter[key];
    }
    const result: PickupPolicyV2Profile = Object.freeze({
      version: PICKUP_POLICY_V2_LIMITS.version,
      profileId: identity(published.profileId),
      versionId: identity(published.versionId, PICKUP_POLICY_V2_LIMITS.profileCodeUnits),
      engineVersion: identity(published.engineVersion),
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
      mValues: Object.freeze(mValues),
      mUnits: Object.freeze(mUnits),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
function service(value: unknown): PickupPolicyV2Service | null {
  if (value === null) return null;
  const data = fields(value, serviceFields),
    lengthM = number(data.lengthM, 0.1, PICKUP_POLICY_V2_LIMITS.maximumDistanceM);
  return Object.freeze({
    zoneId: identity(data.zoneId),
    zoneKind: choice(data.zoneKind, ['PICKUP', 'DROPOFF', 'BOTH'] as const),
    phase: choice(data.phase, ['PICKUP', 'DROPOFF'] as const),
    taxiAccess: flag(data.taxiAccess, 'Invalid pickup service TAXI access flag'),
    distanceToStopM: number(
      data.distanceToStopM,
      -PICKUP_POLICY_V2_LIMITS.maximumDistanceM,
      PICKUP_POLICY_V2_LIMITS.maximumDistanceM,
    ),
    lengthM,
    stopOffsetM: number(data.stopOffsetM, 0, lengthM),
    curbBandM: number(data.curbBandM, 0.1, 100),
    curbDistanceM: number(data.curbDistanceM, 0, 100),
  });
}
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly speedMps: number;
  readonly mechanics: PickupPolicyV2Mechanics;
  readonly surface: PickupPolicyV2Surface;
  readonly rideState: PickupPolicyRideState;
  readonly dwellElapsedS: number;
  readonly service: PickupPolicyV2Service | null;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields),
    mechanics = fields(data.mechanics, ['version', 'classId']),
    surface = fields(data.surface, ['version', 'id']);
  requireContract(
    data.version === PICKUP_POLICY_V2_LIMITS.observationVersion && data.units === 'SI',
    'Invalid pickup policy v2 observation version/units',
  );
  requireContract(
    mechanics.version === PICKUP_POLICY_V2_LIMITS.mechanicsVersion,
    'Invalid pickup policy v2 mechanics version',
  );
  requireContract(
    surface.version === PICKUP_POLICY_V2_LIMITS.surfaceVersion,
    'Invalid pickup policy v2 surface version',
  );
  const rideState = choice(data.rideState, PICKUP_POLICY_V2_RIDE_STATES),
    parsedService = service(data.service);
  if (parsedService !== null) {
    const pickupStates: readonly PickupPolicyRideState[] = ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF'],
      dropoffStates: readonly PickupPolicyRideState[] = ['TO_DROPOFF', 'DROPOFF', 'COMPLETED'];
    requireContract(
      parsedService.phase === 'PICKUP'
        ? pickupStates.includes(rideState)
        : dropoffStates.includes(rideState),
      'Ride state does not belong to the declared service phase',
    );
  }
  return Object.freeze({
    sessionId: identity(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    actor: actor(data.actor),
    tick: tick(data.tick),
    speedMps: number(data.speedMps, 0, PICKUP_POLICY_V2_LIMITS.maximumSpeedMps),
    mechanics: Object.freeze({
      version: PICKUP_POLICY_V2_LIMITS.mechanicsVersion,
      classId: choice(mechanics.classId, ['sedan', 'compact'] as const),
    }),
    surface: Object.freeze({
      version: PICKUP_POLICY_V2_LIMITS.surfaceVersion,
      id: choice(surface.id, ['dry-asphalt', 'reduced-adhesion'] as const),
    }),
    rideState,
    dwellElapsedS: number(data.dwellElapsedS, 0, PICKUP_POLICY_V2_LIMITS.maximumTimeS),
    service: parsedService,
  });
}
function passengerAboard(rideState: PickupPolicyRideState): boolean {
  return (PICKUP_POLICY_V2_ABOARD_RIDE_STATES as readonly string[]).includes(rideState);
}
function confirmedRide(phase: PickupServicePhase, rideState: PickupPolicyRideState): boolean {
  return phase === 'PICKUP'
    ? rideState !== 'TO_PICKUP' && rideState !== 'PICKUP'
    : rideState === 'COMPLETED';
}
function scaleCommand(
  key: PickupPolicyV2Key,
  keyValue: number,
  baseMps2: number,
  comfortCapMps2: number,
  adhesionLimitMps2: number,
  aboard: boolean,
): PickupPolicyV2ScaleCommand {
  const requestedMps2 = keyValue * baseMps2,
    capMps2 = Math.min(comfortCapMps2, adhesionLimitMps2),
    commandedMps2 = aboard ? Math.min(requestedMps2, capMps2) : baseMps2,
    cappedBy =
      !aboard || requestedMps2 <= capMps2 + 1e-9
        ? 'NONE'
        : comfortCapMps2 <= adhesionLimitMps2
          ? 'COMFORT'
          : 'ADHESION';
  return Object.freeze({
    key,
    keyValue,
    baseMps2,
    comfortCapMps2,
    adhesionLimitMps2,
    requestedMps2,
    commandedMps2,
    applied: aboard,
    cappedBy,
  });
}
/**
 * Pure 185 layer. The input is admitted first and every refusal dominates; then the mandatory bay
 * envelope is computed from the facts alone, each service preference is placed inside it, and the
 * occupied scales are capped by comfort and adhesion.
 */
export function evaluatePickupPolicyV2(input: PickupPolicyV2Input): PickupPolicyV2Command {
  requireContract(!evaluating, 'Reentrant pickup policy v2 evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      world = { sessionId: identity(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Pickup policy v2 profile token provenance',
    );
    const profile = data.profile as PickupPolicyV2Profile | null,
      observed = observation(data.observation),
      geometry = vehicleClass(observed.mechanics.classId, observed.mechanics.version),
      surface = roadSurface(observed.surface.id, observed.surface.version),
      adhesionLimitMps2 =
        geometry.grip * surface.tireGripScale * PICKUP_POLICY_V2_LIMITS.standardGravityMps2,
      commandGeometry: PickupPolicyV2Geometry = Object.freeze({
        classId: geometry.classId,
        widthM: geometry.wheels.trackM,
        grip: geometry.grip,
        adhesionLimitMps2,
      });
    let reason: PickupPolicyV2Reason = 'PICKUP_POLICY_V2',
      action: PickupPolicyV2Action = 'UNAVAILABLE',
      mandatory: PickupPolicyV2Mandatory | null = null,
      approach: PickupPolicyV2ApproachCommand | null = null,
      curb: PickupPolicyV2CurbCommand | null = null,
      precision: PickupPolicyV2PrecisionCommand | null = null,
      dwell: PickupPolicyV2DwellCommand | null = null,
      departure: PickupPolicyV2Departure = Object.freeze({
        confirmed: false,
        dwellSatisfied: true,
        stationary: observed.speedMps <= PICKUP_POLICY_V2_LIMITS.standstillMps,
        insideZone: false,
        mayDepart: false,
        reason: 'STOP_NOT_ALLOWED',
      });
    let passengerCommand: PickupPolicyV2PassengerCommand = Object.freeze({
      aboard: passengerAboard(observed.rideState),
      acceleration: scaleCommand('occupied_acceleration_scale', 0, 0, 0, adhesionLimitMps2, false),
      lateralAccel: scaleCommand('occupied_lateral_accel_scale', 0, 0, 0, adhesionLimitMps2, false),
    });
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(world, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    if (reason === 'PICKUP_POLICY_V2' && profile !== null) {
      const values = profile.values,
        mValues = profile.mValues,
        widthM = geometry.wheels.trackM,
        aboard = passengerAboard(observed.rideState),
        activeService = observed.service;
      let speedCommand = 0;
      passengerCommand = Object.freeze({
        aboard,
        acceleration: scaleCommand(
          'occupied_acceleration_scale',
          values.occupied_acceleration_scale,
          mValues.desired_acceleration,
          mValues.comfort_deceleration,
          adhesionLimitMps2,
          aboard,
        ),
        lateralAccel: scaleCommand(
          'occupied_lateral_accel_scale',
          values.occupied_lateral_accel_scale,
          mValues.curve_lateral_accel,
          mValues.curve_lateral_accel,
          adhesionLimitMps2,
          aboard,
        ),
      });
      if (activeService === null) {
        reason = aboard ? 'PASSENGER_LIMITS' : 'NO_SERVICE';
        action = 'CRUISE';
      } else {
        const phase = activeService.phase,
          entryOffsetM = activeService.stopOffsetM - activeService.distanceToStopM,
          insideZone = entryOffsetM >= -1e-9 && entryOffsetM <= activeService.lengthM + 1e-9,
          curbMinimumM = PICKUP_POLICY_V2_LIMITS.minimumCurbClearanceM,
          curbMaximumM = Math.max(0, activeService.curbBandM - widthM),
          dwellMinimumS = Math.max(PICKUP_POLICY_V2_LIMITS.boardingDwellS, mValues.stop_dwell_time),
          precisionFloorM = PICKUP_POLICY_V2_LIMITS.physicalPositionToleranceM,
          precisionMaximumM = Math.max(
            0,
            Math.min(activeService.stopOffsetM, activeService.lengthM - activeService.stopOffsetM),
          );
        let blockedReason: PickupPolicyV2BlockedReason | null = null;
        if (activeService.zoneKind !== 'BOTH' && activeService.zoneKind !== phase)
          blockedReason = 'ZONE_KIND_MISMATCH';
        else if (!activeService.taxiAccess) blockedReason = 'ZONE_NOT_TAXI';
        else if (entryOffsetM > activeService.lengthM + 1e-9) blockedReason = 'STOP_BEYOND_ZONE';
        else if (curbMaximumM <= 0 || curbMaximumM + 1e-9 < curbMinimumM)
          blockedReason = 'BAY_TOO_NARROW';
        else if (precisionMaximumM + 1e-9 < precisionFloorM)
          blockedReason = 'STOP_WINDOW_TOO_TIGHT';
        mandatory = Object.freeze({
          zoneId: activeService.zoneId,
          zoneKind: activeService.zoneKind,
          phase,
          taxiAccess: activeService.taxiAccess,
          lengthM: activeService.lengthM,
          stopOffsetM: activeService.stopOffsetM,
          entryOffsetM,
          insideZone,
          curbMinimumM,
          curbMaximumM,
          curbBandM: activeService.curbBandM,
          dwellMinimumS,
          precisionFloorM,
          stopAllowed: blockedReason === null,
          blockedReason,
        });
        // 1/5. Approach speed: the feasible cap stops exactly at the marked stop point.
        const approachKey: PickupPolicyV2Key =
            phase === 'PICKUP' ? 'pickup_approach_speed' : 'dropoff_approach_speed',
          preferredSpeedMps = values[approachKey],
          feasibleSpeedMps =
            activeService.distanceToStopM > 0
              ? Math.sqrt(2 * mValues.comfort_deceleration * activeService.distanceToStopM)
              : 0,
          approachSpeedMps = Math.min(
            preferredSpeedMps,
            feasibleSpeedMps,
            PICKUP_POLICY_V2_LIMITS.maximumCommandedSpeedMps,
          ),
          stoppingDistanceM =
            (approachSpeedMps * approachSpeedMps) / (2 * mValues.comfort_deceleration);
        speedCommand = approachSpeedMps;
        approach = Object.freeze({
          key: approachKey,
          keyValue: preferredSpeedMps,
          preferredSpeedMps,
          feasibleSpeedMps,
          commandedSpeedMps: approachSpeedMps,
          stoppingDistanceM,
          projectedStopOffsetM:
            activeService.stopOffsetM - activeService.distanceToStopM + stoppingDistanceM,
          capped:
            preferredSpeedMps > feasibleSpeedMps + 1e-9 ||
            feasibleSpeedMps > PICKUP_POLICY_V2_LIMITS.maximumCommandedSpeedMps + 1e-9,
        });
        // 2/6. Curb distance: the curb band of the authored bay bounds the preference.
        const curbKey: PickupPolicyV2Key =
            phase === 'PICKUP' ? 'pickup_curb_distance' : 'dropoff_curb_distance',
          desiredCurbM = values[curbKey],
          effectiveCurbM = Math.min(Math.max(desiredCurbM, curbMinimumM), curbMaximumM);
        curb = Object.freeze({
          key: curbKey,
          keyValue: desiredCurbM,
          desiredM: desiredCurbM,
          effectiveM: effectiveCurbM,
          minimumM: curbMinimumM,
          maximumM: curbMaximumM,
          bandM: activeService.curbBandM,
          widthM,
          clampedLow: desiredCurbM < curbMinimumM - 1e-9,
          clampedHigh: desiredCurbM > curbMaximumM + 1e-9,
          currentM: activeService.curbDistanceM,
          insideBand:
            activeService.curbDistanceM >= curbMinimumM - 1e-9 &&
            activeService.curbDistanceM <= curbMaximumM + 1e-9,
        });
        if (phase === 'PICKUP') {
          // 3. Stop precision: physical floor below, marked bay above.
          const desiredPrecisionM = values.pickup_stop_precision,
            effectivePrecisionM = Math.min(
              Math.max(desiredPrecisionM, precisionFloorM),
              precisionMaximumM,
            );
          precision = Object.freeze({
            keyValue: desiredPrecisionM,
            desiredM: desiredPrecisionM,
            effectiveM: effectivePrecisionM,
            floorM: precisionFloorM,
            maximumM: precisionMaximumM,
            floored: desiredPrecisionM < precisionFloorM - 1e-9,
            capped: desiredPrecisionM > precisionMaximumM + 1e-9,
            windowFromM: Math.max(0, activeService.stopOffsetM - effectivePrecisionM),
            windowToM: Math.min(
              activeService.lengthM,
              activeService.stopOffsetM + effectivePrecisionM,
            ),
          });
          // 4. Dwell: the preferred wait, raised to the boarding proof the service requires.
          const preferredDwellS = values.pickup_dwell_time,
            effectiveDwellS = Math.max(preferredDwellS, dwellMinimumS),
            satisfied = observed.dwellElapsedS >= effectiveDwellS - 1e-9;
          dwell = Object.freeze({
            preferredS: preferredDwellS,
            effectiveS: effectiveDwellS,
            minimumS: dwellMinimumS,
            boardingMinimumS: PICKUP_POLICY_V2_LIMITS.boardingDwellS,
            mMinimumS: mValues.stop_dwell_time,
            elapsedS: observed.dwellElapsedS,
            satisfied,
            remainingS: Math.max(0, effectiveDwellS - observed.dwellElapsedS),
          });
        }
        // 5. Departure gate: confirmation, dwell, standstill and the marked bay, all mandatory.
        const confirmed = confirmedRide(phase, observed.rideState),
          dwellSatisfied = dwell === null ? true : dwell.satisfied,
          stationary = observed.speedMps <= PICKUP_POLICY_V2_LIMITS.standstillMps,
          mayDepart =
            blockedReason === null && insideZone && confirmed && dwellSatisfied && stationary,
          departureReason: PickupPolicyV2DepartureReason | null =
            blockedReason !== null
              ? 'STOP_NOT_ALLOWED'
              : !insideZone
                ? 'STOP_NOT_IN_ZONE'
                : !confirmed
                  ? 'SERVICE_NOT_CONFIRMED'
                  : !dwellSatisfied
                    ? 'DWELL_PENDING'
                    : !stationary
                      ? 'NOT_STATIONARY'
                      : null;
        departure = Object.freeze({
          confirmed,
          dwellSatisfied,
          stationary,
          insideZone,
          mayDepart,
          reason: departureReason,
        });
        reason =
          blockedReason !== null
            ? blockedReason
            : mayDepart
              ? 'READY_TO_DEPART'
              : insideZone && stationary
                ? !confirmed
                  ? 'SERVICE_NOT_CONFIRMED'
                  : !dwellSatisfied
                    ? 'DWELL_PENDING'
                    : 'HOLD'
                : 'APPROACH';
        action =
          blockedReason !== null
            ? 'GO_AROUND'
            : mayDepart
              ? 'DEPART'
              : insideZone && stationary
                ? 'HOLD'
                : 'APPROACH';
      }
      return Object.freeze({
        ...world,
        version: PICKUP_POLICY_V2_LIMITS.version,
        units: 'SI',
        actor: subject,
        decisionTick,
        profileVersionId: profile.versionId,
        reason,
        action,
        rideState: observed.rideState,
        geometry: commandGeometry,
        surfaceId: surface.id,
        tireGripScale: surface.tireGripScale,
        mandatory,
        approach,
        curb,
        precision,
        dwell,
        passenger: passengerCommand,
        departure,
        commandedSpeedMps: speedCommand,
        retainedHistory: 0,
      });
    }
    return Object.freeze({
      ...world,
      version: PICKUP_POLICY_V2_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      action,
      rideState: observed.rideState,
      geometry: commandGeometry,
      surfaceId: surface.id,
      tireGripScale: surface.tireGripScale,
      mandatory,
      approach,
      curb,
      precision,
      dwell,
      passenger: passengerCommand,
      departure,
      commandedSpeedMps: 0,
      retainedHistory: 0,
    });
  } finally {
    evaluating = false;
  }
}
