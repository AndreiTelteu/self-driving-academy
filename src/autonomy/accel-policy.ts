import { boolean, choice, fields, number, requireContract, tick } from '../sessions';
import { parsePublishableDrivingProfile } from '../profiles';
import type { ParameterUnit } from '../profiles';
import { parseVehicleCommand } from '../vehicles';
import type { VehicleCommand } from '../vehicles';
import { captureLongitudinalProfileData } from './longitudinal-control';
import type { LongitudinalResult } from './longitudinal-control';
import type { BehaviorActor, BehaviorScope } from './behavior-fsm';

/**
 * 169 longitudinal style layer: coasting, braking jerk, throttle release and launch intensity.
 *
 * The four reserved keys act on the command already delivered by 047. They never create a second
 * longitudinal controller: the 047 result is admitted as-is, and the layer only shapes how that
 * request is applied. Every key owns a distinct actuation channel:
 *
 * 1. `braking_jerk` (m/s³) rate-limits the growth of the demanded deceleration; the onset tick is
 *    untouched, so `brake_reaction_delay` keeps its 047 meaning.
 * 2. `throttle_release_delay` (s) holds the previous throttle for a bounded time when the request
 *    falls to zero without a braking demand; any braking demand cancels the hold.
 * 3. `launch_intensity` (ratio) scales a positive request below the launch speed, between a gentle
 *    fraction and the full 047 request; it can only reduce the 047 request.
 * 4. `coasting_bias` (ratio) releases a mild positive request above the launch speed, between the
 *    full request and a free roll; it never touches braking or a strong request.
 *
 * Safety stays with the 047 envelope: the layer never asks for more acceleration or more braking
 * than 047 demanded, a stop request or a lead inside the minimum gap vetoes throttle and hold, and
 * a braking demand always wins over coasting and over the release delay.
 */
export const ACCEL_POLICY_KEYS = Object.freeze([
  'braking_jerk',
  'throttle_release_delay',
  'launch_intensity',
  'coasting_bias',
] as const);
export type AccelPolicyKey = (typeof ACCEL_POLICY_KEYS)[number];
export const ACCEL_POLICY_LIMITS = Object.freeze({
  version: '169-accel-policy-v1' as const,
  observationVersion: '169-observation-v1' as const,
  idCodeUnits: 256,
  tickHz: 60,
  /** Below this speed a positive request is a launch, not a cruise request. */
  launchSpeedMps: 2,
  /** A positive cruise request at or below this magnitude may be released to coasting. */
  coastingDemandMps2: 0.6,
  /** `launch_intensity` 0 keeps this fraction of the 047 request; 1 keeps all of it. */
  minimumLaunchFraction: 0.35,
  /** The delivered 047 controller covers targets up to 30 m/s. */
  maximumCoveredSpeedMps: 30,
  /** Bounded admission for the 047 acceleration readback. */
  maximumCoveredAccelerationMps2: 10,
  /** `throttle_release_delay` is catalog-bounded at 3 s. */
  maximumReleaseDelayTicks: 180,
  /** Same hard traffic floor as the 167 tempo layer. */
  minimumLeadGapM: 5,
  retainedHistory: 0,
});
export interface AccelPolicyProfile {
  readonly version: '169-accel-policy-v1';
  readonly profileId: string;
  readonly versionId: string;
  readonly engineVersion: string;
  readonly values: Readonly<Record<AccelPolicyKey, number>>;
  readonly units: Readonly<Record<AccelPolicyKey, ParameterUnit>>;
  readonly provenance: Readonly<Record<AccelPolicyKey, string>>;
}
export interface AccelPolicyObservation extends BehaviorScope {
  readonly version: '169-observation-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  /** Observed lead vehicle facts; both null when the lane ahead is free. */
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly stopRequired: boolean;
}
/** Caller-owned state: the previously committed actuation, fed back on the next tick. */
export interface AccelPolicyActuation {
  readonly accelerationMps2: number;
  readonly throttle: number;
  readonly brake: number;
  /** Remaining ticks of a throttle release hold; zero when no hold is active. */
  readonly throttleReleaseTicks: number;
}
export interface AccelPolicyInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly profile: AccelPolicyProfile | null;
  /** The genuine 047 result for this tick; never rebuilt from separate fields. */
  readonly longitudinal: LongitudinalResult;
  readonly observation: AccelPolicyObservation;
  readonly previous: AccelPolicyActuation;
}
export interface AccelPolicyCommand extends BehaviorScope {
  readonly version: '169-accel-policy-v1';
  readonly units: 'SI';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly profileVersionId: string | null;
  readonly reason: string;
  /** The admitted 047 diagnostic, forwarded unchanged. */
  readonly requestReason: string;
  readonly phase: LongitudinalResult['phase'];
  readonly command: VehicleCommand;
  readonly baseAccelerationMps2: number;
  readonly committedAccelerationMps2: number;
  readonly launchFactor: number;
  readonly coastingFactor: number;
  readonly brakingRampTicks: number;
  readonly throttleReleaseTicks: number;
  readonly throttleHeld: boolean;
  readonly coasting: boolean;
  readonly safetyVeto: boolean;
  readonly actuation: AccelPolicyActuation;
}
const profiles = new WeakSet<object>();
let compiling = false;
let evaluating = false;
const observationFields = [
  'version',
  'units',
  'sessionId',
  'worldEpoch',
  'actor',
  'tick',
  'longitudinalSpeedMps',
  'leadGapM',
  'leadSpeedMps',
  'stopRequired',
] as const;
const actuationFields = ['accelerationMps2', 'throttle', 'brake', 'throttleReleaseTicks'] as const;
const inputFields = [
  'sessionId',
  'worldEpoch',
  'actor',
  'decisionTick',
  'authority',
  'profile',
  'longitudinal',
  'observation',
  'previous',
] as const;
/** The delivered 047 result shape, re-admitted here exactly as 047 produced it. */
const longitudinalFields = [
  'version',
  'command',
  'accelerationMps2',
  'brakeEventTick',
  'reactionTicks',
  'phase',
  'reason',
  'targetMps',
  'availableAccelerationMps2',
  'profileVersionId',
] as const;
const phases = ['RELEASED', 'REACTION_DELAY', 'BRAKING', 'TRACKING'] as const;
function id(value: unknown, maximum: number = ACCEL_POLICY_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid accel policy identity',
  );
  return value;
}
function actor(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: id(data.id), incarnation: tick(data.incarnation) });
}
function sameScope(a: BehaviorScope, b: BehaviorScope): boolean {
  return a.sessionId === b.sessionId && a.worldEpoch === b.worldEpoch;
}
function sameActor(a: BehaviorActor, b: BehaviorActor): boolean {
  return a.id === b.id && a.incarnation === b.incarnation;
}
export function compileAccelPolicyProfile(input: unknown): AccelPolicyProfile {
  requireContract(!compiling, 'Reentrant accel policy profile compilation');
  compiling = true;
  try {
    const detached = captureLongitudinalProfileData(input),
      published = parsePublishableDrivingProfile(detached),
      values = {} as Record<AccelPolicyKey, number>,
      units = {} as Record<AccelPolicyKey, ParameterUnit>,
      provenance = {} as Record<AccelPolicyKey, string>;
    for (const key of ACCEL_POLICY_KEYS) {
      requireContract(Object.hasOwn(published.parameters, key), 'Missing accel policy parameter');
      values[key] = published.parameters[key];
      units[key] = published.unitsByParameter[key];
      provenance[key] = published.provenanceByParameter[key];
    }
    const result: AccelPolicyProfile = Object.freeze({
      version: ACCEL_POLICY_LIMITS.version,
      profileId: id(published.profileId),
      versionId: id(published.versionId),
      engineVersion: id(published.engineVersion),
      values: Object.freeze(values),
      units: Object.freeze(units),
      provenance: Object.freeze(provenance),
    });
    profiles.add(result);
    return result;
  } finally {
    compiling = false;
  }
}
interface AdmittedObservation extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly longitudinalSpeedMps: number;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly stopRequired: boolean;
}
function observation(value: unknown): AdmittedObservation {
  const data = fields(value, observationFields);
  requireContract(
    data.version === ACCEL_POLICY_LIMITS.observationVersion && data.units === 'SI',
    'Invalid accel policy observation version/units',
  );
  const leadGapM = data.leadGapM === null ? null : number(data.leadGapM, 0, 100000),
    leadSpeedMps = data.leadSpeedMps === null ? null : number(data.leadSpeedMps, 0, 100),
    result: AdmittedObservation = Object.freeze({
      sessionId: id(data.sessionId),
      worldEpoch: tick(data.worldEpoch),
      actor: actor(data.actor),
      tick: tick(data.tick),
      longitudinalSpeedMps: number(data.longitudinalSpeedMps, -1000, 1000),
      leadGapM,
      leadSpeedMps,
      stopRequired: boolean(data.stopRequired),
    });
  requireContract((leadGapM === null) === (leadSpeedMps === null), 'Incomplete lead vehicle facts');
  return result;
}
function previousActuation(value: unknown): AccelPolicyActuation {
  const data = fields(value, actuationFields),
    result: AccelPolicyActuation = Object.freeze({
      accelerationMps2: number(
        data.accelerationMps2,
        -ACCEL_POLICY_LIMITS.maximumCoveredAccelerationMps2,
        ACCEL_POLICY_LIMITS.maximumCoveredAccelerationMps2,
      ),
      throttle: number(data.throttle, 0, 1),
      brake: number(data.brake, 0, 1),
      throttleReleaseTicks: tick(data.throttleReleaseTicks),
    });
  requireContract(
    result.throttleReleaseTicks <= ACCEL_POLICY_LIMITS.maximumReleaseDelayTicks,
    'Accel policy release hold exceeds its bound',
  );
  requireContract(
    !(result.throttle > 0 && result.brake > 0),
    'Previous accel policy actuation applies throttle and brake together',
  );
  return result;
}
interface AdmittedRequest {
  readonly command: VehicleCommand;
  readonly accelerationMps2: number;
  readonly phase: LongitudinalResult['phase'];
  readonly reason: string;
  readonly targetMps: number | null;
  readonly profileVersionId: string | null;
}
function request(value: unknown): AdmittedRequest {
  const data = fields(value, longitudinalFields);
  requireContract(data.version === '047-longitudinal-v1', 'Unknown accel policy request version');
  const command = parseVehicleCommand(data.command),
    accelerationMps2 = number(
      data.accelerationMps2,
      -ACCEL_POLICY_LIMITS.maximumCoveredAccelerationMps2,
      ACCEL_POLICY_LIMITS.maximumCoveredAccelerationMps2,
    ),
    phase = choice(data.phase, phases),
    reason = id(data.reason, 128),
    targetMps =
      data.targetMps === null
        ? null
        : number(data.targetMps, 0, ACCEL_POLICY_LIMITS.maximumCoveredSpeedMps);
  number(data.availableAccelerationMps2, 0, 1000);
  if (data.brakeEventTick !== null) tick(data.brakeEventTick);
  tick(data.reactionTicks);
  requireContract(
    command.source === 'AUTONOMY',
    'Accel policy request must be an autonomous command',
  );
  requireContract(
    command.brake > 0 === accelerationMps2 < 0,
    'Inconsistent accel policy request braking',
  );
  requireContract(
    !(command.throttle > 0 && command.brake > 0),
    'Accel policy request applies throttle and brake together',
  );
  requireContract(
    (phase === 'BRAKING') === accelerationMps2 < 0 || phase === 'REACTION_DELAY',
    'Accel policy request phase disagrees with its acceleration',
  );
  return Object.freeze({
    command,
    accelerationMps2,
    phase,
    reason,
    targetMps,
    profileVersionId: data.profileVersionId === null ? null : id(data.profileVersionId, 128),
  });
}
/** Stateless style layer; the caller owns the previous actuation and feeds it back next tick. */
export function evaluateAccelPolicy(input: AccelPolicyInput): AccelPolicyCommand {
  requireContract(!evaluating, 'Reentrant accel policy evaluation');
  evaluating = true;
  try {
    const data = fields(input, inputFields),
      scope = { sessionId: id(data.sessionId), worldEpoch: tick(data.worldEpoch) },
      subject = actor(data.actor),
      decisionTick = tick(data.decisionTick),
      authority = choice(data.authority, ['AUTO', 'MANUAL', 'LEARNING']);
    requireContract(
      data.profile === null || (typeof data.profile === 'object' && profiles.has(data.profile)),
      'Accel policy profile token provenance',
    );
    const profile = data.profile as AccelPolicyProfile | null,
      observed = observation(data.observation),
      requested = request(data.longitudinal),
      previous = previousActuation(data.previous);
    let reason = 'ACCEL_POLICY';
    if (authority !== 'AUTO') reason = 'NO_AUTO_AUTHORITY';
    else if (profile === null) reason = 'MISSING_PROFILE';
    else if (
      !sameScope(scope, observed) ||
      !sameActor(subject, observed.actor) ||
      observed.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_OBSERVATION';
    else if (
      !sameScope(scope, requested.command) ||
      requested.command.vehicleId !== subject.id ||
      requested.command.tick !== decisionTick
    )
      reason = 'FOREIGN_OR_STALE_REQUEST';
    else if (requested.profileVersionId !== profile.versionId) reason = 'REQUEST_PROFILE_MISMATCH';
    const speed = Math.max(0, observed.longitudinalSpeedMps),
      safetyVeto =
        observed.stopRequired ||
        (observed.leadGapM !== null && observed.leadGapM <= ACCEL_POLICY_LIMITS.minimumLeadGapM);
    let committed = requested.accelerationMps2,
      throttle = requested.command.throttle,
      brake = requested.command.brake,
      launchFactor = 1,
      coastingFactor = 1,
      brakingRampTicks = 0,
      throttleReleaseTicks = 0,
      throttleHeld = false,
      coasting = false;
    if (reason === 'ACCEL_POLICY') {
      const values = profile!.values,
        base = requested.accelerationMps2,
        jerkStep = values.braking_jerk / ACCEL_POLICY_LIMITS.tickHz;
      if (base < 0) {
        // Braking wins: the reaction delay already decided the onset, this key only shapes growth.
        const demandedDecel = -base,
          startDecel = Math.max(0, -previous.accelerationMps2),
          nextDecel = Math.min(demandedDecel, startDecel + jerkStep);
        committed = -nextDecel;
        throttle = 0;
        brake = requested.command.brake * (nextDecel / demandedDecel);
        brakingRampTicks =
          nextDecel < demandedDecel ? Math.ceil((demandedDecel - nextDecel) / jerkStep) : 0;
      } else if (safetyVeto) {
        committed = 0;
        throttle = 0;
        brake = 0;
        launchFactor = 0;
        coastingFactor = 0;
      } else if (base > 0) {
        if (speed < ACCEL_POLICY_LIMITS.launchSpeedMps) {
          // Launch: a fraction of the driver's own request, never more than 047 asked for.
          launchFactor =
            ACCEL_POLICY_LIMITS.minimumLaunchFraction +
            (1 - ACCEL_POLICY_LIMITS.minimumLaunchFraction) * values.launch_intensity;
        } else if (base <= ACCEL_POLICY_LIMITS.coastingDemandMps2) {
          // Coasting: only a mild cruise request may be released; braking is handled above.
          coastingFactor = 1 - values.coasting_bias;
          coasting = coastingFactor < 1;
        }
        committed = base * launchFactor * coastingFactor;
        throttle = requested.command.throttle * launchFactor * coastingFactor;
        brake = 0;
      } else {
        // Lift: hold the previous throttle for the configured time, unless a veto applies.
        const holdTicks = Math.ceil(values.throttle_release_delay * ACCEL_POLICY_LIMITS.tickHz);
        if (previous.throttleReleaseTicks > 0) {
          throttleReleaseTicks = previous.throttleReleaseTicks - 1;
          throttle = previous.throttle;
          // The final held tick already commits zero acceleration, so a release cannot restart.
          committed = throttleReleaseTicks > 0 ? Math.max(0, previous.accelerationMps2) : 0;
          throttleHeld = true;
        } else if (holdTicks > 0 && previous.accelerationMps2 > 0 && previous.throttle > 0) {
          throttleReleaseTicks = holdTicks - 1;
          throttle = previous.throttle;
          committed = throttleReleaseTicks > 0 ? Math.max(0, previous.accelerationMps2) : 0;
          throttleHeld = true;
        } else {
          committed = 0;
          throttle = 0;
        }
        brake = 0;
      }
    }
    const actuation: AccelPolicyActuation = Object.freeze({
      accelerationMps2: committed,
      throttle,
      brake,
      throttleReleaseTicks,
    });
    return Object.freeze({
      ...scope,
      version: ACCEL_POLICY_LIMITS.version,
      units: 'SI',
      actor: subject,
      decisionTick,
      profileVersionId: profile?.versionId ?? null,
      reason,
      requestReason: requested.reason,
      phase: requested.phase,
      command: Object.freeze({ ...requested.command, throttle, brake }),
      baseAccelerationMps2: requested.accelerationMps2,
      committedAccelerationMps2: committed,
      launchFactor,
      coastingFactor,
      brakingRampTicks,
      throttleReleaseTicks,
      throttleHeld,
      coasting,
      safetyVeto,
      actuation,
    });
  } finally {
    evaluating = false;
  }
}
