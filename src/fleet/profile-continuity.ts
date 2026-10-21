import {
  choice,
  fields,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import type { ControlMode } from '../vehicles';
import type { ProfileActivation, ProfileActivationReport } from './profile-activation';

/**
 * 111 maneuver continuity on top of the 110 fleet activation.
 *
 * Where 110 proves *what* is written (`tick` and `appliedProfileVersion` only), this module proves
 * that publishing a profile leaves an engaged maneuver untouched: position, speed, heading, control
 * mode, a committed lane change, an already evaluated red-light opportunity and the player's
 * authority seat/held command are carried across the activation tick without teleport, speed reset
 * or re-sampling.
 *
 * Placement: `src/fleet` owns the 110 activation contract and already depends on the autonomy read
 * models (`civil-traffic`). `src/autonomy` does not depend on `src/fleet`, so putting this guard in
 * autonomy would create a domain cycle. The module exposes a structural snapshot instead of
 * importing the 050/053/066 owners: the composition root projects their real accepted state.
 *
 * It never repairs a violation. The 110 writes have already happened when the guard returns
 * `BLOCKED`; the real activation report is kept verbatim and the mismatch is enumerated. It owns no
 * physics, no profile store and no fleet writes beyond handing the pending command to 110.
 */
export const PROFILE_CONTINUITY_VERSION = '111-profile-continuity-v1' as const;

/** Closed continuity violation vocabulary, reported in this canonical order. */
export const profileContinuityViolations = [
  'POSITION_CHANGED',
  'SPEED_CHANGED',
  'HEADING_CHANGED',
  'CONTROL_MODE_CHANGED',
  'LANE_CHANGE_CANCELLED',
  'MANUAL_COMMAND_OVERRIDDEN',
  'OPPORTUNITY_RESAMPLED',
  'VERSION_NOT_APPLIED',
] as const;
export type ProfileContinuityViolation = (typeof profileContinuityViolations)[number];

export const PROFILE_CONTINUITY_LIMITS = Object.freeze({
  /** Retained opportunity decisions; the oldest sample is evicted first. */
  decisions: 256,
  maxDecisions: 4096,
  idCodeUnits: 256,
  positionM: 1_000_000,
  speedMps: 100,
});

export interface ManeuverPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Committed optional lane change; `progress` is the caller's real completion ratio in [0,1]. */
export interface LaneChangeSnapshot {
  readonly phase: 'COMMITTED' | 'IDLE';
  readonly targetLaneId: string | null;
  readonly startedTick: number | null;
  readonly progress: number;
  readonly lastChangeTick: number | null;
}

/** The already evaluated signal opportunity and the version that produced its decision. */
export interface SignalOpportunitySnapshot {
  readonly opportunityId: string;
  /** Phase occurrence index; with the vehicle and opportunity it forms the memo key. */
  readonly occurrence: number;
  /** Stable decision identity, e.g. `STOP:STOP_LINE_APPROACH`. */
  readonly decision: string;
  readonly sampledTick: number;
  readonly profileVersion: string;
}

export interface HeldManualCommand {
  readonly commandId: string;
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
}

/** 066 authority seat plus the command that keeps running; null command means no held input. */
export interface ManualHold {
  readonly seat: 'PLAYER' | 'NONE';
  readonly mode: 'MANUAL' | 'LEARNING' | null;
  readonly command: HeldManualCommand | null;
}

/**
 * One accepted read of the maneuver. Position/speed/heading are compared with exact equality
 * (`Object.is`), so the documented float tolerance for state fields is zero.
 */
export interface ManeuverSnapshot {
  readonly version: typeof PROFILE_CONTINUITY_VERSION;
  readonly vehicleId: string;
  readonly tick: number;
  readonly positionM: ManeuverPosition;
  readonly speedMps: number;
  readonly headingRad: number;
  readonly controlMode: ControlMode;
  readonly appliedProfileVersion: string;
  readonly laneChange: LaneChangeSnapshot | null;
  readonly signalOpportunity: SignalOpportunitySnapshot | null;
  readonly manual: ManualHold | null;
}

/** What the activation is allowed to change: the applied version and the tick. */
export interface ContinuityActivation {
  /** Optional; it defaults to the snapshot vehicle and must match when supplied. */
  readonly vehicleId?: string;
  readonly versionId: string;
  readonly tick: number;
}

const snapshotFields = [
  'version',
  'vehicleId',
  'tick',
  'positionM',
  'speedMps',
  'headingRad',
  'controlMode',
  'appliedProfileVersion',
  'laneChange',
  'signalOpportunity',
  'manual',
] as const;

const laneChangeFields = [
  'phase',
  'targetLaneId',
  'startedTick',
  'progress',
  'lastChangeTick',
] as const;

const opportunityFields = [
  'opportunityId',
  'occurrence',
  'decision',
  'sampledTick',
  'profileVersion',
] as const;

const manualFields = ['seat', 'mode', 'command'] as const;
const commandFields = ['commandId', 'throttle', 'brake', 'steering', 'handbrake'] as const;

function identity(value: unknown, field: string): string {
  const result = text(value);
  requireContract(
    result.trim() === result && result.length <= PROFILE_CONTINUITY_LIMITS.idCodeUnits,
    `Invalid continuity ${field}`,
  );
  return result;
}

function point(value: unknown): ManeuverPosition {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(data.x, -PROFILE_CONTINUITY_LIMITS.positionM, PROFILE_CONTINUITY_LIMITS.positionM),
    y: number(data.y, -PROFILE_CONTINUITY_LIMITS.positionM, PROFILE_CONTINUITY_LIMITS.positionM),
    z: number(data.z, -PROFILE_CONTINUITY_LIMITS.positionM, PROFILE_CONTINUITY_LIMITS.positionM),
  });
}

function laneChangeOf(value: unknown): LaneChangeSnapshot | null {
  if (value === null) return null;
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (laneChangeFields as readonly string[]).includes(key),
      `Unknown lane-change field: ${key}`,
    );
  for (const key of ['phase', 'targetLaneId', 'startedTick', 'progress'] as const)
    requireContract(data[key] !== undefined, `Missing lane-change field: ${key}`);
  const phase = choice(data.phase, ['COMMITTED', 'IDLE'] as const);
  const targetLaneId =
    data.targetLaneId === null ? null : identity(data.targetLaneId, 'lane-change target');
  const startedTick = data.startedTick === null ? null : readTick(data.startedTick);
  const lastChangeTick =
    data.lastChangeTick === undefined || data.lastChangeTick === null
      ? null
      : readTick(data.lastChangeTick);
  if (phase === 'COMMITTED')
    requireContract(
      targetLaneId !== null && startedTick !== null,
      'A committed lane change needs a target lane and a start tick',
    );
  if (phase === 'IDLE')
    requireContract(targetLaneId === null, 'An idle lane change cannot carry a target lane');
  return Object.freeze({
    phase,
    targetLaneId,
    startedTick,
    progress: number(data.progress, 0, 1),
    lastChangeTick,
  });
}

function opportunityOf(value: unknown): SignalOpportunitySnapshot | null {
  if (value === null) return null;
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (opportunityFields as readonly string[]).includes(key),
      `Unknown signal opportunity field: ${key}`,
    );
  for (const key of ['opportunityId', 'decision', 'sampledTick', 'profileVersion'] as const)
    requireContract(data[key] !== undefined, `Missing signal opportunity field: ${key}`);
  return Object.freeze({
    opportunityId: identity(data.opportunityId, 'opportunity id'),
    occurrence: data.occurrence === undefined ? 1 : readTick(data.occurrence),
    decision: identity(data.decision, 'opportunity decision'),
    sampledTick: readTick(data.sampledTick),
    profileVersion: identity(data.profileVersion, 'opportunity profile version'),
  });
}

function heldCommandOf(value: unknown): HeldManualCommand | null {
  if (value === null) return null;
  const data = fields(value, commandFields);
  requireContract(typeof data.handbrake === 'boolean', 'Invalid held command handbrake');
  return Object.freeze({
    commandId: identity(data.commandId, 'held command id'),
    throttle: number(data.throttle, 0, 1),
    brake: number(data.brake, 0, 1),
    steering: number(data.steering, -1, 1),
    handbrake: data.handbrake,
  });
}

function manualOf(value: unknown): ManualHold | null {
  if (value === null) return null;
  const data = fields(value, manualFields);
  const seat = choice(data.seat, ['PLAYER', 'NONE'] as const);
  const mode = data.mode === null ? null : choice(data.mode, ['MANUAL', 'LEARNING'] as const);
  const command = heldCommandOf(data.command);
  if (seat === 'NONE') requireContract(mode === null, 'A released seat carries no authority mode');
  if (seat === 'NONE') requireContract(command === null, 'A released seat carries no held command');
  return Object.freeze({ seat, mode, command });
}

/** Strict structural read of one snapshot; used by both the verifier and the composition guard. */
export function parseManeuverSnapshot(value: unknown): ManeuverSnapshot {
  const data = fields(value, snapshotFields);
  requireContract(
    data.version === PROFILE_CONTINUITY_VERSION,
    'Maneuver snapshot version mismatch',
  );
  return Object.freeze({
    version: PROFILE_CONTINUITY_VERSION,
    vehicleId: identity(data.vehicleId, 'vehicle id'),
    tick: readTick(data.tick),
    positionM: point(data.positionM),
    speedMps: number(
      data.speedMps,
      -PROFILE_CONTINUITY_LIMITS.speedMps,
      PROFILE_CONTINUITY_LIMITS.speedMps,
    ),
    headingRad: number(data.headingRad),
    controlMode: choice(data.controlMode, ['AUTO', 'MANUAL', 'LEARNING'] as const),
    appliedProfileVersion: identity(data.appliedProfileVersion, 'profile version'),
    laneChange: laneChangeOf(data.laneChange),
    signalOpportunity: opportunityOf(data.signalOpportunity),
    manual: manualOf(data.manual),
  });
}

function activationOf(value: unknown): ContinuityActivation {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      key === 'vehicleId' || key === 'versionId' || key === 'tick',
      `Unknown continuity activation field: ${key}`,
    );
  requireContract(data.versionId !== undefined, 'Missing continuity activation version');
  requireContract(data.tick !== undefined, 'Missing continuity activation tick');
  return Object.freeze({
    vehicleId:
      data.vehicleId === undefined ? undefined : identity(data.vehicleId, 'activation vehicle'),
    versionId: identity(data.versionId, 'activation version'),
    tick: readTick(data.tick),
  });
}

function samePoint(left: ManeuverPosition, right: ManeuverPosition): boolean {
  return Object.is(left.x, right.x) && Object.is(left.y, right.y) && Object.is(left.z, right.z);
}

function sameCommand(left: HeldManualCommand | null, right: HeldManualCommand | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.commandId === right.commandId &&
    Object.is(left.throttle, right.throttle) &&
    Object.is(left.brake, right.brake) &&
    Object.is(left.steering, right.steering) &&
    left.handbrake === right.handbrake
  );
}

function sameManual(left: ManualHold | null, right: ManualHold | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.seat === right.seat && left.mode === right.mode && sameCommand(left.command, right.command)
  );
}

function sameLaneChange(
  left: LaneChangeSnapshot | null,
  right: LaneChangeSnapshot | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.phase === right.phase &&
    left.targetLaneId === right.targetLaneId &&
    Object.is(left.startedTick, right.startedTick) &&
    Object.is(left.progress, right.progress) &&
    Object.is(left.lastChangeTick, right.lastChangeTick)
  );
}

function sameOpportunity(
  left: SignalOpportunitySnapshot | null,
  right: SignalOpportunitySnapshot | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.opportunityId === right.opportunityId &&
    Object.is(left.occurrence, right.occurrence) &&
    left.decision === right.decision &&
    Object.is(left.sampledTick, right.sampledTick) &&
    left.profileVersion === right.profileVersion
  );
}

/** Frozen `Violation` list in the canonical contract order, without duplicates. */
function canonicalViolations(
  list: readonly ProfileContinuityViolation[],
): readonly ProfileContinuityViolation[] {
  return Object.freeze(profileContinuityViolations.filter((code) => list.includes(code)));
}

/**
 * Verified continuity between the snapshot before the common tick and the snapshot at it.
 *
 * Only `appliedProfileVersion` and `tick` may differ. Every state field is compared with exact
 * equality (float tolerance 0). A lane change must keep its phase, target, start tick, progress and
 * cooldown tick; the manual seat and held command must be identical; an already evaluated
 * opportunity must keep the same identity, decision, sample tick and sampling version. Any change
 * of the signal opportunity across the activation tick — including losing it — is
 * `OPPORTUNITY_RESAMPLED`, because activation may change nothing else.
 */
export function verifyContinuity(
  beforeInput: unknown,
  afterInput: unknown,
  activationInput: unknown,
): readonly ProfileContinuityViolation[] {
  const before = parseManeuverSnapshot(beforeInput);
  const after = parseManeuverSnapshot(afterInput);
  const activation = activationOf(activationInput);
  requireContract(
    before.vehicleId === after.vehicleId &&
      (activation.vehicleId === undefined || activation.vehicleId === before.vehicleId),
    'Continuity snapshots and activation must address the same vehicle',
  );
  requireContract(after.tick >= before.tick, 'Continuity snapshot tick moved backwards');
  requireContract(
    after.tick === activation.tick,
    'The after snapshot must be read at the activation tick',
  );
  const violations: ProfileContinuityViolation[] = [];
  if (!samePoint(before.positionM, after.positionM)) violations.push('POSITION_CHANGED');
  if (!Object.is(before.speedMps, after.speedMps)) violations.push('SPEED_CHANGED');
  if (!Object.is(before.headingRad, after.headingRad)) violations.push('HEADING_CHANGED');
  if (before.controlMode !== after.controlMode) violations.push('CONTROL_MODE_CHANGED');
  if (!sameLaneChange(before.laneChange, after.laneChange))
    violations.push('LANE_CHANGE_CANCELLED');
  if (!sameManual(before.manual, after.manual)) violations.push('MANUAL_COMMAND_OVERRIDDEN');
  if (!sameOpportunity(before.signalOpportunity, after.signalOpportunity))
    violations.push('OPPORTUNITY_RESAMPLED');
  if (after.appliedProfileVersion !== activation.versionId) violations.push('VERSION_NOT_APPLIED');
  return canonicalViolations(violations);
}

/** Key of the decision memo; profile version and tick are deliberately excluded. */
export interface OpportunityMemoInput {
  readonly vehicleId: string;
  readonly opportunityId: string;
  readonly occurrence: number;
  readonly tick: number;
  readonly profileVersion: string;
}

export interface OpportunitySamplerResult<T> {
  readonly decision: T;
  readonly profileVersion: string;
  /** Stable decision identity used by `verifyContinuity` and the memo probe. */
  readonly signature: string;
}

export type OpportunityDecisionSampler<T> = (
  input: OpportunityMemoInput,
) => OpportunitySamplerResult<T>;

export interface OpportunityMemoSample<T> {
  readonly key: string;
  readonly vehicleId: string;
  readonly opportunityId: string;
  readonly occurrence: number;
  readonly decision: T;
  readonly profileVersion: string;
  readonly signature: string;
  readonly sampledTick: number;
}

export interface OpportunityDecisionMemoStats {
  readonly version: typeof PROFILE_CONTINUITY_VERSION;
  readonly capacity: number;
  readonly size: number;
  /** Total `decideOnce` calls. */
  readonly decisions: number;
  /** Calls answered from the memo; zero sampler invocations. */
  readonly cached: number;
  /** Calls that invoked the sampler (first sample of a key). */
  readonly sampled: number;
  readonly evictions: number;
}

export interface OpportunityDecisionMemo<T> {
  readonly version: typeof PROFILE_CONTINUITY_VERSION;
  readonly capacity: number;
  decideOnce(input: unknown, sampler: unknown): OpportunityMemoSample<T>;
  peek(input: unknown): OpportunityMemoSample<T> | null;
  stats(): OpportunityDecisionMemoStats;
  clear(): void;
}

export interface OpportunityDecisionMemoOptions {
  readonly capacity?: unknown;
}

interface MemoKey {
  readonly key: string;
  readonly vehicleId: string;
  readonly opportunityId: string;
  readonly occurrence: number;
}

function memoKeyOf(value: unknown): MemoKey {
  const data = fields(value, [
    'vehicleId',
    'opportunityId',
    'occurrence',
    'tick',
    'profileVersion',
  ]);
  const vehicleId = identity(data.vehicleId, 'memo vehicle');
  const opportunityId = identity(data.opportunityId, 'memo opportunity');
  const occurrence = readTick(data.occurrence);
  readTick(data.tick);
  identity(data.profileVersion, 'memo profile version');
  return {
    key: JSON.stringify([vehicleId, opportunityId, occurrence]),
    vehicleId,
    opportunityId,
    occurrence,
  };
}

function memoCapacity(value: unknown): number {
  if (value === undefined) return PROFILE_CONTINUITY_LIMITS.decisions;
  requireContract(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= PROFILE_CONTINUITY_LIMITS.maxDecisions,
    'Invalid opportunity memo capacity',
  );
  return value;
}

/**
 * Bounded decision memo keyed by `vehicleId + opportunityId + occurrence`.
 *
 * `decideOnce` samples exactly once per key and returns the cached decision for every later call,
 * including after a profile activation: the key carries no tick or version. A new opportunity is a
 * miss and samples with the sampler supplied at that call, which records the profile version used
 * at sampling. The memo owns no frame counter, timer or profile store.
 */
export function createOpportunityDecisionMemo<T>(
  options: OpportunityDecisionMemoOptions = {},
): OpportunityDecisionMemo<T> {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(key === 'capacity', `Unknown opportunity memo option: ${key}`);
  const capacity = memoCapacity(data.capacity);
  const samples = new Map<string, OpportunityMemoSample<T>>();
  let decisions = 0;
  let cached = 0;
  let evictions = 0;

  function readSample(source: unknown): OpportunitySamplerResult<T> {
    requireContract(
      typeof source === 'object' && source !== null,
      'An opportunity sampler must return a sample',
    );
    const result = source as Record<string, unknown>;
    requireContract(Object.hasOwn(result, 'decision'), 'An opportunity sample needs a decision');
    return Object.freeze({
      decision: result.decision as T,
      profileVersion: identity(result.profileVersion, 'sampled profile version'),
      signature: identity(result.signature, 'sampled decision signature'),
    });
  }

  return Object.freeze({
    version: PROFILE_CONTINUITY_VERSION,
    capacity,
    decideOnce(input: unknown, sampler: unknown): OpportunityMemoSample<T> {
      const key = memoKeyOf(input);
      const memoInput = input as OpportunityMemoInput;
      decisions += 1;
      const existing = samples.get(key.key);
      if (existing !== undefined) {
        cached += 1;
        return existing;
      }
      requireContract(typeof sampler === 'function', 'An opportunity decision needs a sampler');
      const result = readSample((sampler as OpportunityDecisionSampler<T>)(memoInput));
      const sample: OpportunityMemoSample<T> = Object.freeze({
        key: key.key,
        vehicleId: key.vehicleId,
        opportunityId: key.opportunityId,
        occurrence: key.occurrence,
        decision: result.decision,
        profileVersion: result.profileVersion,
        signature: result.signature,
        sampledTick: readTick(memoInput.tick),
      });
      samples.set(key.key, sample);
      while (samples.size > capacity) {
        const oldest = samples.keys().next();
        if (oldest.done === true) break;
        samples.delete(oldest.value);
        evictions += 1;
      }
      return sample;
    },
    peek(input: unknown): OpportunityMemoSample<T> | null {
      return samples.get(memoKeyOf(input).key) ?? null;
    },
    stats(): OpportunityDecisionMemoStats {
      return Object.freeze({
        version: PROFILE_CONTINUITY_VERSION,
        capacity,
        size: samples.size,
        decisions,
        cached,
        sampled: decisions - cached,
        evictions,
      });
    },
    clear(): void {
      samples.clear();
      decisions = 0;
      cached = 0;
      evictions = 0;
    },
  });
}

export interface PublishWithContinuityInput<T> {
  readonly activation: unknown;
  readonly before: unknown;
  /** Snapshot reader at a tick: a function or a `{ read(tick) }` port. */
  readonly read: unknown;
  /** Defaults to the pending command's common tick, then to the before snapshot tick. */
  readonly tick?: unknown;
  readonly memo?: OpportunityDecisionMemo<T>;
  readonly sampler?: OpportunityDecisionSampler<T>;
}

export interface ProfileContinuityResult {
  readonly version: typeof PROFILE_CONTINUITY_VERSION;
  /** `BLOCKED` means the guard did not certify continuity; the real 110 report is kept as-is. */
  readonly status: 'APPLIED' | 'BLOCKED';
  readonly report: ProfileActivationReport;
  readonly violations: readonly ProfileContinuityViolation[];
  readonly before: ManeuverSnapshot;
  readonly after: ManeuverSnapshot | null;
  /** `true` when the evaluated opportunity was probed against the memo after activation. */
  readonly opportunityChecked: boolean;
  readonly memoStats: OpportunityDecisionMemoStats | null;
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

function readSnapshotReader(value: unknown): (tick: number) => ManeuverSnapshot {
  if (typeof value === 'function')
    return (tick: number) => parseManeuverSnapshot((value as (tick: number) => unknown)(tick));
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as { read?: unknown }).read === 'function',
    'Profile continuity requires a maneuver snapshot reader',
  );
  const reader = value as { read: (tick: number) => unknown };
  return (tick: number) => parseManeuverSnapshot(reader.read(tick));
}

/**
 * Applies the pending 110 activation at the common tick, reads the after snapshot, verifies
 * continuity and probes the decision memo with the new active version.
 *
 * The probe calls `decideOnce` for the already evaluated opportunity with the *after* version. A
 * cache hit invokes no sampler; if the sampler is invoked or the cached signature changes, the
 * result is `OPPORTUNITY_RESAMPLED`. Nothing is repaired, reverted or resampled silently.
 */
export function publishWithContinuity<T>(
  input: PublishWithContinuityInput<T>,
): ProfileContinuityResult {
  requireContract(
    typeof input === 'object' && input !== null,
    'Profile continuity requires a publication input',
  );
  const activation = readActivation(input.activation);
  const before = parseManeuverSnapshot(input.before);
  const read = readSnapshotReader(input.read);
  const pending = activation.pending();
  const atTick =
    input.tick === undefined ? (pending?.activateAtTick ?? before.tick) : readTick(input.tick);
  const report = activation.applyAt(atTick);
  if (report.status !== 'APPLIED' || report.versionId === null || report.appliedTick === null) {
    return Object.freeze({
      version: PROFILE_CONTINUITY_VERSION,
      status: 'BLOCKED' as const,
      report,
      violations: Object.freeze([]),
      before,
      after: null,
      opportunityChecked: false,
      memoStats: input.memo?.stats() ?? null,
    });
  }
  const after = read(report.appliedTick);
  const violations: ProfileContinuityViolation[] = [
    ...verifyContinuity(before, after, {
      vehicleId: before.vehicleId,
      versionId: report.versionId,
      tick: report.appliedTick,
    }),
  ];
  let opportunityChecked = false;
  const opportunity = before.signalOpportunity;
  if (opportunity !== null) {
    requireContract(
      input.memo !== undefined && input.sampler !== undefined,
      'An evaluated opportunity needs its decision memo and sampler',
    );
    opportunityChecked = true;
    const key = {
      vehicleId: before.vehicleId,
      opportunityId: opportunity.opportunityId,
      occurrence: opportunity.occurrence,
      tick: after.tick,
      profileVersion: after.appliedProfileVersion,
    };
    const existing = input.memo.peek(key);
    const recorded =
      existing !== null &&
      existing.signature === opportunity.decision &&
      existing.sampledTick === opportunity.sampledTick &&
      existing.profileVersion === opportunity.profileVersion;
    if (!recorded) violations.push('OPPORTUNITY_RESAMPLED');
    let samplerCalls = 0;
    const probe: OpportunityDecisionSampler<T> = (memoInput) => {
      samplerCalls += 1;
      return input.sampler!(memoInput);
    };
    const replayed = input.memo.decideOnce(key, probe);
    if (
      samplerCalls !== 0 ||
      (existing !== null &&
        (replayed.decision !== existing.decision ||
          replayed.signature !== existing.signature ||
          replayed.profileVersion !== existing.profileVersion))
    )
      violations.push('OPPORTUNITY_RESAMPLED');
  }
  const finalViolations = canonicalViolations(violations);
  return Object.freeze({
    version: PROFILE_CONTINUITY_VERSION,
    status: finalViolations.length === 0 ? ('APPLIED' as const) : ('BLOCKED' as const),
    report,
    violations: finalViolations,
    before,
    after,
    opportunityChecked,
    memoStats: input.memo?.stats() ?? null,
  });
}
