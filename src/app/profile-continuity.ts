import {
  choice,
  deriveVehicleSeed,
  fields,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { evaluateSignalPolicy } from '../autonomy';
import type {
  LaneChangeState,
  SignalPolicyDecision,
  SignalPolicyInput,
  SignalPolicyObservation,
  SignalPolicyProfile,
} from '../autonomy';
import { PROFILE_CONTINUITY_VERSION, publishWithContinuity } from '../fleet';
import type {
  FleetRegistry,
  HeldManualCommand,
  LaneChangeSnapshot,
  ManeuverSnapshot,
  ManualHold,
  OpportunityDecisionMemo,
  OpportunityDecisionSampler,
  OpportunityMemoInput,
  OpportunitySamplerResult,
  ProfileActivation,
  ProfileActivationReport,
  ProfileContinuityViolation,
  SignalOpportunitySnapshot,
} from '../fleet';

/**
 * Composition root for 111.
 *
 * It reads the real accepted maneuver state (057 registry, physics readback, 053 lane-change latch,
 * 050 signal decision and 066 authority seat), delegates the activation itself to 110 and passes
 * the result through the continuity guard. It never writes physics, never resolves a new profile
 * version itself and never re-implements a policy: the red-light sample is the real 050
 * `evaluateSignalPolicy` addressed by the 006 seeds, and the lane-change/authority state is the
 * caller's real accepted read.
 */
export const PROFILE_CONTINUITY_APP_VERSION = '111-profile-continuity-app-v1' as const;

/** Closed composition errors; they reject before any 110 write is attempted. */
export const profileContinuityAppErrors = [
  'VEHICLE_MISSING',
  'FOREIGN_ACTIVATION',
  'STALE_TICK',
] as const;
export type ProfileContinuityAppError = (typeof profileContinuityAppErrors)[number];

export interface ProfileContinuityAppRejection {
  readonly code: ProfileContinuityAppError;
  readonly message: string;
}

/** Authoritative SI readback for one tick, derived by the physics/047 owner, never here. */
export interface VehicleMotionRead {
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly speedMps: number;
  readonly headingRad: number;
}

export interface VehicleMotionReadSource {
  readonly vehicleId: string;
  read(tick: number): VehicleMotionRead | null;
}

/** Real 053 latch plus the controller-owned completion ratio; null means no lane change source. */
export interface LaneChangeRead {
  readonly state: LaneChangeState;
  readonly progress: number;
}

export interface LaneChangeReadSource {
  read(tick: number): LaneChangeRead | null;
}

/** Already evaluated 050 opportunity; the decision object is kept untouched. */
export interface SignalOpportunityRead {
  readonly opportunityId: string;
  readonly occurrence: number;
  readonly decision: SignalPolicyDecision;
  readonly sampledTick: number;
  readonly profileVersion: string;
}

export interface SignalOpportunityReadSource {
  read(tick: number): SignalOpportunityRead | null;
}

/** Real 066 seat and the command that keeps running while PLAYER holds the vehicle. */
export interface ManualAuthorityRead {
  readonly seat: 'PLAYER' | 'NONE';
  readonly mode: 'MANUAL' | 'LEARNING' | null;
  readonly command: HeldManualCommand | null;
}

export interface ManualAuthorityReadSource {
  read(vehicleId: string, tick: number): ManualAuthorityRead | null;
}

export interface ManeuverSnapshotSources {
  readonly fleet: FleetRegistry;
  readonly vehicle: VehicleMotionReadSource;
  readonly laneChange?: LaneChangeReadSource | null;
  readonly signal?: SignalOpportunityReadSource | null;
  readonly authority?: ManualAuthorityReadSource | null;
}

const sourceFields = ['fleet', 'vehicle', 'laneChange', 'signal', 'authority'] as const;
const signalDecisions = ['PROCEED', 'START_DELAY', 'STOP', 'UNKNOWN'] as const;
const signalReasons = [
  'NO_SIGNAL',
  'UNAVAILABLE',
  'GREEN_RELEASE',
  'GREEN_START_DELAY',
  'STOP_LINE_APPROACH',
  'STOP_LINE_HOLD',
  'CROSS_RED_BY_PROFILE',
  'LATE_RED_BRAKE',
] as const;

function readFleet(value: unknown): FleetRegistry {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as FleetRegistry).configuration === 'object' &&
      (value as FleetRegistry).configuration !== null &&
      typeof (value as FleetRegistry).configuration.profile?.profileId === 'string' &&
      typeof (value as FleetRegistry).get === 'function' &&
      typeof (value as FleetRegistry).state === 'function',
    'Profile continuity requires a real fleet registry',
  );
  return value as FleetRegistry;
}

function readMotionSource(value: unknown): VehicleMotionReadSource {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      key === 'vehicleId' || key === 'read',
      `Unknown vehicle motion source field: ${key}`,
    );
  const vehicleId = text(data.vehicleId);
  requireContract(typeof data.read === 'function', 'A vehicle motion source needs a readback');
  return {
    vehicleId,
    read: (tick: number) => {
      const read = (data.read as (this: unknown, tick: number) => unknown).call(value, tick);
      return read === null ? null : motionOf(read);
    },
  };
}

function motionOf(value: unknown): VehicleMotionRead {
  const data = fields(value, ['positionM', 'speedMps', 'headingRad']);
  const position = fields(data.positionM, ['x', 'y', 'z']);
  return Object.freeze({
    positionM: Object.freeze({
      x: number(position.x, -1e6, 1e6),
      y: number(position.y, -1e6, 1e6),
      z: number(position.z, -1e6, 1e6),
    }),
    speedMps: number(data.speedMps, -100, 100),
    headingRad: number(data.headingRad, -Math.PI, Math.PI),
  });
}

function readLaneChangeSource(value: unknown): LaneChangeReadSource | null {
  if (value === undefined || value === null) return null;
  requireContract(
    typeof value === 'object' && typeof (value as LaneChangeReadSource).read === 'function',
    'A lane-change source needs a readback',
  );
  return value as LaneChangeReadSource;
}

function readSignalSource(value: unknown): SignalOpportunityReadSource | null {
  if (value === undefined || value === null) return null;
  requireContract(
    typeof value === 'object' && typeof (value as SignalOpportunityReadSource).read === 'function',
    'A signal opportunity source needs a readback',
  );
  return value as SignalOpportunityReadSource;
}

function readAuthoritySource(value: unknown): ManualAuthorityReadSource | null {
  if (value === undefined || value === null) return null;
  requireContract(
    typeof value === 'object' && typeof (value as ManualAuthorityReadSource).read === 'function',
    'A manual authority source needs a readback',
  );
  return value as ManualAuthorityReadSource;
}

function heldCommandOf(value: unknown): HeldManualCommand | null {
  if (value === null) return null;
  const data = fields(value, ['commandId', 'throttle', 'brake', 'steering', 'handbrake']);
  requireContract(typeof data.handbrake === 'boolean', 'Invalid held command handbrake');
  return Object.freeze({
    commandId: text(data.commandId),
    throttle: number(data.throttle, 0, 1),
    brake: number(data.brake, 0, 1),
    steering: number(data.steering, -1, 1),
    handbrake: data.handbrake,
  });
}

function manualOf(value: ManualAuthorityRead): ManualHold {
  const seat = choice(value.seat, ['PLAYER', 'NONE'] as const);
  const mode = value.mode === null ? null : choice(value.mode, ['MANUAL', 'LEARNING'] as const);
  const command = heldCommandOf(value.command);
  if (seat === 'NONE') requireContract(mode === null, 'A released seat carries no authority mode');
  return Object.freeze({ seat, mode, command });
}

function laneChangeOf(value: LaneChangeRead): LaneChangeSnapshot {
  requireContract(
    typeof value.state === 'object' && value.state !== null,
    'A lane-change read needs the real 053 latch',
  );
  const committed = value.state.committed;
  let targetLaneId: string | null = null;
  let startedTick: number | null = null;
  if (committed !== null) {
    requireContract(
      typeof committed === 'object',
      'A committed lane change needs a real latch record',
    );
    targetLaneId = text(committed.targetLaneId);
    startedTick = readTick(committed.startedTick);
  }
  const lastChangeTick =
    value.state.lastChangeTick === null ? null : readTick(value.state.lastChangeTick);
  return Object.freeze({
    phase: committed === null ? ('IDLE' as const) : ('COMMITTED' as const),
    targetLaneId,
    startedTick,
    progress: number(value.progress, 0, 1),
    lastChangeTick,
  });
}

function signalOpportunityOf(value: SignalOpportunityRead): SignalOpportunitySnapshot {
  const decision = record(value.decision);
  const action = choice(decision.action, signalDecisions);
  const reason = choice(decision.reason, signalReasons);
  return Object.freeze({
    opportunityId: text(value.opportunityId),
    occurrence: readTick(value.occurrence),
    decision: `${action}:${reason}`,
    sampledTick: readTick(value.sampledTick),
    profileVersion: text(value.profileVersion),
  });
}

/**
 * Reads one accepted maneuver snapshot. Missing optional pieces are explicit nulls; a missing
 * vehicle or motion readback returns null. A fleet state ahead of the requested tick rejects
 * (`STALE_TICK`) instead of fabricating a past readback.
 */
export function readManeuverSnapshot(
  sources: unknown,
  tickInput: unknown,
): ManeuverSnapshot | null {
  const atTick = readTick(tickInput);
  const data = record(sources);
  for (const key of Object.keys(data))
    requireContract(
      (sourceFields as readonly string[]).includes(key),
      `Unknown maneuver snapshot source: ${key}`,
    );
  const fleet = readFleet(data.fleet);
  const vehicle = readMotionSource(data.vehicle);
  const laneChange = readLaneChangeSource(data.laneChange);
  const signal = readSignalSource(data.signal);
  const authority = readAuthoritySource(data.authority);
  const state = fleet.state(vehicle.vehicleId);
  if (state === undefined || fleet.get(vehicle.vehicleId) === undefined) return null;
  requireContract(
    state.tick <= atTick,
    `STALE_TICK: fleet state ${state.tick} is ahead of the requested tick ${atTick}`,
  );
  const motion = vehicle.read(atTick);
  if (motion === null) return null;
  const laneRead = laneChange?.read(atTick) ?? null;
  const signalRead = signal?.read(atTick) ?? null;
  const authorityRead = authority?.read(vehicle.vehicleId, atTick) ?? null;
  return Object.freeze({
    version: PROFILE_CONTINUITY_VERSION,
    vehicleId: vehicle.vehicleId,
    tick: state.tick,
    positionM: motion.positionM,
    speedMps: motion.speedMps,
    headingRad: motion.headingRad,
    controlMode: state.controlMode,
    appliedProfileVersion: state.appliedProfileVersion,
    laneChange: laneRead === null ? null : laneChangeOf(laneRead),
    signalOpportunity: signalRead === null ? null : signalOpportunityOf(signalRead),
    manual: authorityRead === null ? null : manualOf(authorityRead),
  });
}

/**
 * Real 050 sampler. The compliance unit is the one `evaluateSignalPolicy` derives from the 006
 * vehicle seed and the caller's canonical opportunity key; this factory only addresses the seed
 * deterministically by vehicle and records the profile version that produced the sample.
 */
export interface SignalDecisionSamplerConfig {
  /** Defaults to the real 050 `evaluateSignalPolicy`; injection is for the composition root only. */
  readonly policy?: Readonly<{ evaluate(input: SignalPolicyInput): SignalPolicyDecision }>;
  /** Root scenario seed; the vehicle seed is derived from it and the vehicle id. */
  readonly seed: number;
  readonly scope: Readonly<{ sessionId: string; worldEpoch: number }>;
  readonly profile: SignalPolicyProfile;
  readonly observation: SignalPolicyObservation | null;
  readonly speedMps: number;
  readonly incarnation?: number;
}

export type SignalDecisionSampler = OpportunityDecisionSampler<SignalPolicyDecision>;

export function createSignalDecisionSampler(
  config: SignalDecisionSamplerConfig,
): SignalDecisionSampler {
  const data = record(config);
  for (const key of Object.keys(data))
    requireContract(
      ['policy', 'seed', 'scope', 'profile', 'observation', 'speedMps', 'incarnation'].includes(
        key,
      ),
      `Unknown signal sampler field: ${key}`,
    );
  const policySource =
    data.policy === undefined
      ? ({ evaluate: evaluateSignalPolicy } as Readonly<{
          evaluate(input: SignalPolicyInput): SignalPolicyDecision;
        }>)
      : data.policy;
  const policy = record(policySource);
  requireContract(
    typeof policy.evaluate === 'function',
    'A signal sampler needs the real 050 policy',
  );
  requireContract(
    typeof data.seed === 'number' &&
      Number.isSafeInteger(data.seed) &&
      data.seed >= 0 &&
      data.seed <= 0xffff_ffff,
    'A signal sampler needs a uint32 scenario seed',
  );
  const scope = fields(data.scope, ['sessionId', 'worldEpoch']);
  const sessionId = text(scope.sessionId);
  const worldEpoch = readTick(scope.worldEpoch);
  const seed = data.seed;
  requireContract(
    typeof data.profile === 'object' && data.profile !== null,
    'A signal sampler needs the projected 050 profile',
  );
  const profile = data.profile as SignalPolicyProfile;
  requireContract(
    data.observation === null ||
      (typeof data.observation === 'object' && data.observation !== null),
    'A signal sampler needs the real 050 observation or an explicit null',
  );
  const observation =
    data.observation === null ? null : (data.observation as SignalPolicyObservation);
  const speedMps = number(data.speedMps, -100, 100);
  const incarnation = data.incarnation === undefined ? 1 : readTick(data.incarnation);
  const evaluate = policy.evaluate as (input: SignalPolicyInput) => SignalPolicyDecision;
  return (input: OpportunityMemoInput): OpportunitySamplerResult<SignalPolicyDecision> => {
    const decision = evaluate.call(policySource, {
      sessionId,
      worldEpoch,
      actor: Object.freeze({ id: input.vehicleId, incarnation }),
      decisionTick: input.tick,
      speedMps,
      seed: deriveVehicleSeed(seed, input.vehicleId),
      opportunityKey: input.opportunityId,
      profile,
      observation,
    });
    return Object.freeze({
      decision,
      profileVersion: decision.profileVersionId ?? input.profileVersion,
      signature: `${decision.action}:${decision.reason}`,
    });
  };
}

export interface ApplyActivationDuringManeuverInput<T> extends ManeuverSnapshotSources {
  readonly activation: ProfileActivation;
  /** Accepted fixed tick of the frame that applies the activation. */
  readonly tick: number;
  readonly memo?: OpportunityDecisionMemo<T>;
  readonly sampler?: OpportunityDecisionSampler<T>;
}

export interface ApplyActivationDuringManeuverResult {
  readonly version: typeof PROFILE_CONTINUITY_APP_VERSION;
  readonly status: 'APPLIED' | 'BLOCKED' | 'REJECTED';
  readonly report: ProfileActivationReport | null;
  readonly violations: readonly ProfileContinuityViolation[];
  readonly before: ManeuverSnapshot | null;
  readonly after: ManeuverSnapshot | null;
  /** The authority seat and held command survived the activation; activation is not a takeover. */
  readonly manualPreserved: boolean;
  readonly rejection: ProfileContinuityAppRejection | null;
}

function rejected(
  code: ProfileContinuityAppError,
  message: string,
): ApplyActivationDuringManeuverResult {
  return Object.freeze({
    version: PROFILE_CONTINUITY_APP_VERSION,
    status: 'REJECTED' as const,
    report: null,
    violations: Object.freeze([]),
    before: null,
    after: null,
    manualPreserved: false,
    rejection: Object.freeze({ code, message }),
  });
}

function readActivation(value: unknown): ProfileActivation {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as ProfileActivation).applyAt === 'function' &&
      typeof (value as ProfileActivation).pending === 'function' &&
      typeof (value as ProfileActivation).profileId === 'string',
    'Profile continuity requires a real 110 profile activation',
  );
  return value as ProfileActivation;
}

/**
 * Composes the 110 `applyAt` with the 111 guard during an engaged maneuver.
 *
 * The first evaluation of an opportunity happens *before* the profile change, through the same
 * memo; activation then only probes the memo with the new active version, so the decision is never
 * resampled. The manual seat and held command are read-only inputs: nothing here writes input,
 * rewrites the pose/speed, clears a lane change or takes over the vehicle.
 */
export function applyActivationDuringManeuver<T>(
  input: ApplyActivationDuringManeuverInput<T>,
): ApplyActivationDuringManeuverResult {
  const data = record(input);
  for (const key of Object.keys(data))
    requireContract(
      key === 'activation' ||
        key === 'tick' ||
        key === 'memo' ||
        key === 'sampler' ||
        (sourceFields as readonly string[]).includes(key),
      `Unknown activation-during-maneuver field: ${key}`,
    );
  const fleet = readFleet(data.fleet);
  const vehicle = readMotionSource(data.vehicle);
  const atTick = readTick(data.tick);
  const activation = readActivation(data.activation);
  const memo = data.memo as OpportunityDecisionMemo<T> | undefined;
  const sampler = data.sampler as OpportunityDecisionSampler<T> | undefined;
  requireContract(
    memo === undefined ||
      (typeof memo === 'object' &&
        memo !== null &&
        typeof memo.peek === 'function' &&
        typeof memo.decideOnce === 'function'),
    'A continuity composition needs a real decision memo',
  );
  requireContract(
    sampler === undefined || typeof sampler === 'function',
    'A continuity composition needs a real decision sampler',
  );
  const state = fleet.state(vehicle.vehicleId);
  if (state === undefined || fleet.get(vehicle.vehicleId) === undefined)
    return rejected('VEHICLE_MISSING', `Unknown fleet vehicle ${vehicle.vehicleId}`);
  if (state.tick > atTick)
    return rejected(
      'STALE_TICK',
      `Tick ${atTick} is behind the accepted vehicle tick ${state.tick}`,
    );
  const profileId = fleet.configuration.profile.profileId;
  if (activation.profileId !== profileId)
    return rejected(
      'FOREIGN_ACTIVATION',
      `The activation belongs to ${activation.profileId}, not ${profileId}`,
    );
  const pending = activation.pending();
  if (pending !== null && pending.profileId !== profileId)
    return rejected(
      'FOREIGN_ACTIVATION',
      `The pending command belongs to ${pending.profileId}, not ${profileId}`,
    );
  const sources = {
    fleet,
    vehicle,
    laneChange: data.laneChange,
    signal: data.signal,
    authority: data.authority,
  };
  const before = readManeuverSnapshot(sources, atTick);
  if (before === null)
    return rejected('VEHICLE_MISSING', `No accepted readback for ${vehicle.vehicleId}`);
  // The opportunity must be evaluated before the version changes; the memo guarantees it samples
  // exactly once even if the caller already evaluated it earlier in the frame.
  if (before.signalOpportunity !== null) {
    requireContract(
      memo !== undefined && sampler !== undefined,
      'An evaluated opportunity needs its decision memo and sampler',
    );
    const key = {
      vehicleId: before.vehicleId,
      opportunityId: before.signalOpportunity.opportunityId,
      occurrence: before.signalOpportunity.occurrence,
      tick: atTick,
      profileVersion: before.appliedProfileVersion,
    };
    if (memo.peek(key) === null) memo.decideOnce(key, sampler);
  }
  const result = publishWithContinuity({
    activation,
    before,
    read: (tick: number) => {
      const snapshot = readManeuverSnapshot(sources, tick);
      requireContract(snapshot !== null, 'Missing vehicle readback during continuity verification');
      return snapshot;
    },
    tick: atTick,
    memo,
    sampler,
  });
  return Object.freeze({
    version: PROFILE_CONTINUITY_APP_VERSION,
    status: result.status,
    report: result.report,
    violations: result.violations,
    before: result.before,
    after: result.after,
    manualPreserved:
      result.after !== null && !result.violations.includes('MANUAL_COMMAND_OVERRIDDEN'),
    rejection: null,
  });
}
