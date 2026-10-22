import {
  choice,
  contextFields,
  fields,
  number,
  readContext,
  record,
  requireContract,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type {
  BodyIdentity,
  ControlMode,
  VehicleCommand,
  VehicleControlProjection,
  VehicleState,
} from '../vehicles';
import type { ControlAuthority, ModeControls, VehicleSelection } from '../input';
import type {
  DropoffDecision,
  PickupDecision,
  RideDropoff,
  RideLifecycle,
  RidePickup,
  RideState,
} from '../fleet';
import {
  INTERVENTION_LIMITS,
  createInterventionEventTransport,
  createInterventionIntake,
  createInterventionRecordStore,
} from '../telemetry';
import type {
  InterventionCause,
  InterventionCloseReason,
  InterventionPorts,
  InterventionTarget,
  InterventionTargetChange,
  TelemetrySample,
} from '../telemetry';
import { getParameterDefinition, parameterDefinitions } from '../profiles';
import type { ParameterKey } from '../profiles';
import { evaluateTakeoverContinuity } from '../autonomy';
import type {
  AuthorityReentryObservation,
  TakeoverCommand,
  TakeoverContinuityDecision,
  TakeoverPhysicalState,
} from '../autonomy';
import type { LaneGraph } from '../world';
import { createManualSegmentBridge } from './manual-segment-bridge';

/**
 * 072 complete manual trip and short manual intervention.
 *
 * The composition root drives **one** real 061 ride through the real 062/063 service gate while the
 * real 066 seat, 067 mode intents, 068 selection and 069 segment lifecycle are applied by the real
 * 066/067/068/069 bridge. A mode change never creates a second ride, never rewrites the ride and
 * never moves the passenger: the ride record, its real 060 claim and its pickup/dropoff zones are the
 * same object before and after the switch.
 *
 * MANUAL is a service mode, not a learning source: its samples are recorded in a MANUAL 069 record
 * with `learningEligible: false`, it can never enter the 069 intake and it publishes no parameter.
 * A closed eligible LEARNING segment is the only publication source, and the publication carries only
 * the parameter keys the host actually observed in that segment.
 *
 * The module owns no clock and no physics. Every accepted tick comes from the real 066 authority,
 * every pose comes from the host's authoritative readback, and the module rejects instead of
 * fabricating a tick, a body, a ride or a segment. The optional 071 continuity probe measures a
 * return-to-AUTO handover; the module records it and never repairs, clamps or teleports the state.
 */
export const MANUAL_TRIP_VERSION = '072-manual-trip-v1' as const;

export const MANUAL_TRIP_LIMITS = Object.freeze({
  version: MANUAL_TRIP_VERSION,
  /** 069 record ceiling: one open segment plus its protected closed history. */
  segments: INTERVENTION_LIMITS.records,
  /** 069 intake descriptors accepted by one trip. */
  publications: INTERVENTION_LIMITS.descriptors,
  /** 071 handover decisions retained for evidence. */
  handovers: INTERVENTION_LIMITS.records,
  /** 069 sample ceiling per segment; further manual ticks are counted, never fabricated. */
  samplesPerSegment: INTERVENTION_LIMITS.samples,
  idCodeUnits: INTERVENTION_LIMITS.idCodeUnits,
  tickHz: 60,
  dtSeconds: 1 / 60,
});

/** Closed refusals: an illegal intervention never mutates the ride, the seat or a segment. */
export const MANUAL_TRIP_REFUSAL_REASONS = [
  'NO_ACTIVE_RIDE',
  'DUPLICATE_RIDE',
  'RIDE_TERMINAL',
  'RIDE_MISMATCH',
  'TAXI_MISMATCH',
  'TICK_NOT_CURRENT',
  'TICK_NOT_NEXT',
  'UNKNOWN_MODE',
  'ALREADY_IN_MODE',
  'INTENT_ALREADY_QUEUED',
  'LEARNING_UNAVAILABLE',
  'TARGET_UNAVAILABLE',
  'AUTHORITY_SUSPENDED',
  'AUTHORITY_FAULT',
  'MODE_QUEUE_CONFLICT',
] as const;
export type ManualTripRefusalReason = (typeof MANUAL_TRIP_REFUSAL_REASONS)[number];

export type ManualTripMode = ControlMode;

/** Frozen profile read model. The trip never writes it; a digest proves the values/proofs survived. */
export interface ManualTripProfile {
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly controlPreferencesVersion: string;
  readonly engineVersion: string;
  readonly mapVersion: string;
  readonly inputType: 'KEYBOARD' | 'GAMEPAD';
  readonly values: Readonly<Record<string, number>>;
  readonly proofs: Readonly<Record<string, number>>;
}

/** Optional 071 layer: the real 033 graph, authoritative physical readback and 054 observation. */
export interface ManualTripContinuityPorts {
  readonly graph: LaneGraph | null;
  readonly readPhysical: (atTick: number) => TakeoverPhysicalState;
  readonly readReentry?: (atTick: number) => AuthorityReentryObservation | null;
}

export type ManualTripTelemetry = (
  atTick: number,
  state: VehicleState,
  control: VehicleControlProjection | null,
) => TelemetrySample | null;
export type ManualTripObservation = (
  atTick: number,
  state: VehicleState,
  mode: ManualTripMode,
) => readonly string[];

export interface ManualTripOptions {
  readonly context: ContractContext;
  readonly lifecycle: RideLifecycle;
  readonly pickup: RidePickup;
  readonly dropoff: RideDropoff;
  readonly authority: ControlAuthority;
  readonly modes: ModeControls;
  readonly selection: VehicleSelection;
  readonly taxiIdentity: BodyIdentity;
  readonly profile: ManualTripProfile;
  readonly ownerId?: string;
  /** Host authoritative 005 state for the accepted tick; the module never writes it. */
  readonly readState: (atTick: number) => VehicleState;
  /** Real 005 telemetry for the accepted tick, recorded into the OPEN MANUAL/LEARNING record. */
  readonly readTelemetry?: ManualTripTelemetry;
  /** Host observation facts; only these parameter keys can ever be published from LEARNING. */
  readonly readObservation?: ManualTripObservation;
  /** Synchronous LEARNING availability fact; absent/false keeps LEARNING unavailable. */
  readonly readLearningEligibility?: (atTick: number) => boolean | null;
  readonly continuity?: ManualTripContinuityPorts;
}

export interface ManualTripRefusal {
  readonly accepted: false;
  readonly reason: ManualTripRefusalReason;
  readonly tick: number;
  readonly detail: string;
}

export interface ManualTripBegin {
  readonly accepted: true;
  readonly tick: number;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly duplicate: false;
}

export interface ManualTripModeRequest {
  readonly accepted: true;
  readonly tick: number;
  readonly from: ManualTripMode;
  readonly to: ManualTripMode;
  readonly action: 'M' | 'L';
  readonly appliesAtTick: number;
}

export interface ManualTripStep {
  readonly accepted: true;
  readonly tick: number;
  readonly mode: ManualTripMode;
  readonly seatIdentity: string | null;
  readonly rideState: RideState | null;
  readonly pickup: PickupDecision | null;
  readonly dropoff: DropoffDecision | null;
  readonly activeSegmentId: string | null;
  readonly closedSegmentId: string | null;
  readonly handover: TakeoverContinuityDecision | null;
}

export interface ManualTripSegmentResult {
  readonly segmentId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
  readonly closeReason: InterventionCloseReason | null;
  readonly samples: number;
  readonly observedParameters: readonly ParameterKey[];
  readonly publishedParameters: readonly ParameterKey[];
  readonly publicationOperationId: string | null;
}

export interface ManualTripPublication {
  readonly segmentId: string;
  readonly operationId: string;
  readonly endTick: number;
  /** A real closed eligible LEARNING descriptor accepted by the 069 intake. */
  readonly mode: 'LEARNING';
  readonly learningEligible: true;
  readonly observedParameters: readonly ParameterKey[];
  readonly unobservedParameters: readonly ParameterKey[];
}

export interface ManualTripRideResult {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly assignmentId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly state: RideState;
  readonly terminal: boolean;
  readonly startedTick: number;
  readonly completedTick: number | null;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
  readonly totalCostSeconds: number;
  readonly pickupRouteLaneIds: readonly string[];
  readonly tripRouteLaneIds: readonly string[];
  readonly boardingTick: number | null;
  readonly boardingDwellTicks: number | null;
  readonly completionTick: number | null;
  readonly completionDwellTicks: number | null;
  readonly releaseReason: string | null;
  readonly transitions: readonly (readonly [string, number])[];
}

export interface ManualTripResult {
  readonly version: typeof MANUAL_TRIP_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly begun: boolean;
  readonly mode: ManualTripMode;
  readonly ride: ManualTripRideResult | null;
  readonly segments: readonly ManualTripSegmentResult[];
  readonly learning: Readonly<{
    intakeEntries: number;
    publications: readonly ManualTripPublication[];
    manualSegments: number;
    manualPublications: 0;
    learningSegments: number;
  }>;
  readonly profile: Readonly<{
    playerId: string;
    profileId: string;
    baseVersionId: string;
    learningEpoch: number;
    values: Readonly<Record<string, number>>;
    proofs: Readonly<Record<string, number>>;
    /** True when the host values/proofs read model is byte-identical after the whole trip. */
    unchanged: boolean;
  }>;
  readonly telemetry: Readonly<{
    ticks: Readonly<Record<ManualTripMode, number>>;
    samplesAppended: number;
    samplesSkipped: number;
    segmentSamples: Readonly<Record<string, number>>;
  }>;
  readonly handovers: readonly TakeoverContinuityDecision[];
  readonly refusals: Readonly<Record<ManualTripRefusalReason, number>>;
}

export interface ManualTripStats {
  readonly version: typeof MANUAL_TRIP_VERSION;
  readonly namespace: string;
  readonly tick: number;
  readonly begun: boolean;
  readonly rideId: string | null;
  readonly mode: ManualTripMode;
  readonly segments: number;
  readonly openSegments: number;
  readonly publications: number;
  readonly handovers: number;
  readonly samplesAppended: number;
  readonly ticks: Readonly<Record<ManualTripMode, number>>;
  readonly refusals: Readonly<Record<ManualTripRefusalReason, number>>;
  readonly profileUnchanged: boolean;
  readonly disposed: boolean;
}

export interface ManualTrip {
  readonly namespace: string;
  currentTick(): number;
  begin(input: unknown): ManualTripBegin | ManualTripRefusal;
  requestMode(input: unknown): ManualTripModeRequest | ManualTripRefusal;
  step(input: unknown): ManualTripStep | ManualTripRefusal;
  result(): ManualTripResult;
  stats(): ManualTripStats;
  dispose(): void;
}

interface SegmentTrack {
  readonly segmentId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly learningEligible: boolean;
  readonly startTick: number;
  endTick: number | null;
  completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
  closeReason: InterventionCloseReason | null;
  samples: number;
}

const PROFILE_FIELDS = [
  'playerId',
  'profileId',
  'baseVersionId',
  'learningEpoch',
  'controlPreferencesVersion',
  'engineVersion',
  'mapVersion',
  'inputType',
  'values',
  'proofs',
] as const;
const OPTION_REQUIRED = [
  'context',
  'lifecycle',
  'pickup',
  'dropoff',
  'authority',
  'modes',
  'selection',
  'taxiIdentity',
  'profile',
  'readState',
] as const;
const OPTION_OPTIONAL = [
  'ownerId',
  'readTelemetry',
  'readObservation',
  'readLearningEligibility',
  'continuity',
] as const;
const CONTINUITY_FIELDS = ['graph', 'readPhysical', 'readReentry'] as const;
const BEGIN_FIELDS = ['requestId', 'eventId', 'tick', 'taxiId'] as const;
const MODE_FIELDS = ['tick', 'mode'] as const;
const STEP_FIELDS = ['tick', 'packets'] as const;

const learningParameterKeys = Object.freeze(
  parameterDefinitions
    .filter((definition) => definition.implementationStage === 'initial_learning_target')
    .map((definition) => definition.key)
    .sort(),
) as readonly ParameterKey[];
const parameterKeys = Object.freeze(
  parameterDefinitions.map((definition) => definition.key).sort(),
) as readonly ParameterKey[];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedText(value: unknown, label: string): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.trim() === value &&
      value.length <= MANUAL_TRIP_LIMITS.idCodeUnits,
    `Invalid ${label} identity or code-unit length`,
  );
  return value;
}

function readFunction(value: unknown, label: string): (...args: never[]) => unknown {
  requireContract(typeof value === 'function', `Manual trip requires ${label}`);
  return value as (...args: never[]) => unknown;
}

function rejectUnknown(
  data: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(data))
    requireContract(allowed.includes(key), `Unknown ${label} field: ${key}`);
}

function requiredField(data: Record<string, unknown>, key: string, label: string): unknown {
  requireContract(data[key] !== undefined, `Missing ${label} field: ${key}`);
  return data[key];
}

function readProfile(value: unknown): ManualTripProfile {
  const data = record(value);
  for (const key of PROFILE_FIELDS) requiredField(data, key, 'manual trip profile');
  rejectUnknown(data, PROFILE_FIELDS, 'manual trip profile');
  const readNumbers = (entry: unknown): Readonly<Record<string, number>> => {
    const values = record(entry),
      result: Record<string, number> = {};
    for (const key of Object.keys(values).sort()) {
      getParameterDefinition(key);
      result[key] = number(values[key], 0);
    }
    return Object.freeze(result);
  };
  return Object.freeze({
    playerId: boundedText(data.playerId, 'profile player'),
    profileId: boundedText(data.profileId, 'profile'),
    baseVersionId: boundedText(data.baseVersionId, 'profile base version'),
    learningEpoch: tick(data.learningEpoch),
    controlPreferencesVersion: boundedText(
      data.controlPreferencesVersion,
      'control preferences version',
    ),
    engineVersion: boundedText(data.engineVersion, 'engine version'),
    mapVersion: boundedText(data.mapVersion, 'map version'),
    inputType: choice(data.inputType, ['KEYBOARD', 'GAMEPAD'] as const),
    values: readNumbers(data.values),
    proofs: readNumbers(data.proofs),
  });
}

function readIdentity(value: unknown): BodyIdentity {
  const data = fields(value, ['entityId', 'handle', 'generation']);
  requireContract(Number.isFinite(number(data.handle)), 'Invalid native handle');
  boundedText(data.entityId, 'taxi');
  tick(data.generation);
  // The host's exact native token, not a copy: 066/067/069 compare identity by token.
  return value as BodyIdentity;
}

function modeOf(seatMode: 'MANUAL' | 'LEARNING' | undefined): ManualTripMode {
  return seatMode ?? 'AUTO';
}

function intentFor(from: ManualTripMode, to: ManualTripMode): 'M' | 'L' | null {
  if (from === to) return null;
  if (to === 'AUTO') return 'M';
  if (to === 'MANUAL') return from === 'AUTO' ? 'M' : 'L';
  return 'L';
}

function takeoverCommandOf(command: VehicleCommand): TakeoverCommand {
  return Object.freeze({
    source: command.source,
    throttle: command.throttle,
    brake: command.brake,
    steering: command.steering,
    handbrake: command.handbrake,
  });
}

function speedOf(state: VehicleState): number {
  return Math.min(100, Math.hypot(state.velocityMps.x, state.velocityMps.z));
}

function zeroRefusals(): Record<ManualTripRefusalReason, number> {
  const result: Record<ManualTripRefusalReason, number> = Object.create(null);
  for (const reason of MANUAL_TRIP_REFUSAL_REASONS) result[reason] = 0;
  return result;
}

export function createManualTrip(options: unknown): ManualTrip {
  const data = record(options);
  for (const key of OPTION_REQUIRED) requiredField(data, key, 'manual trip option');
  rejectUnknown(data, [...OPTION_REQUIRED, ...OPTION_OPTIONAL], 'manual trip option');
  const context = Object.freeze(readContext(fields(data.context, contextFields))),
    lifecycle = data.lifecycle as RideLifecycle,
    pickup = data.pickup as RidePickup,
    dropoff = data.dropoff as RideDropoff,
    authority = data.authority as ControlAuthority,
    modes = data.modes as ModeControls,
    selection = data.selection as VehicleSelection,
    taxi = readIdentity(data.taxiIdentity),
    profile = readProfile(data.profile),
    ownerId = boundedText(
      data.ownerId === undefined ? `manual-trip:${taxi.entityId}` : data.ownerId,
      'manual trip owner',
    ),
    readState = readFunction(data.readState, 'readState') as (atTick: number) => VehicleState,
    readTelemetry =
      data.readTelemetry === undefined
        ? null
        : (readFunction(data.readTelemetry, 'readTelemetry') as ManualTripTelemetry),
    readObservation =
      data.readObservation === undefined
        ? null
        : (readFunction(data.readObservation, 'readObservation') as ManualTripObservation),
    readLearningEligibility =
      data.readLearningEligibility === undefined
        ? null
        : (readFunction(data.readLearningEligibility, 'readLearningEligibility') as (
            atTick: number,
          ) => boolean | null);
  requireContract(
    typeof lifecycle.namespace === 'string' &&
      typeof lifecycle.begin === 'function' &&
      typeof lifecycle.ride === 'function' &&
      typeof lifecycle.advance === 'function',
    'Manual trip requires a real ride lifecycle',
  );
  requireContract(
    typeof pickup.observe === 'function' &&
      typeof pickup.boardings === 'function' &&
      typeof dropoff.observe === 'function' &&
      typeof dropoff.completions === 'function',
    'Manual trip requires the real pickup/dropoff service modules',
  );
  requireContract(
    typeof authority.getStats === 'function' && typeof authority.step === 'function',
    'Manual trip requires the real control authority',
  );
  requireContract(
    typeof modes.enqueue === 'function' && typeof modes.prepare === 'function',
    'Manual trip requires the real mode controls',
  );
  requireContract(
    typeof selection.prepare === 'function' && typeof selection.settle === 'function',
    'Manual trip requires the real vehicle selection',
  );

  let continuity: ManualTripContinuityPorts | null = null;
  if (data.continuity !== undefined) {
    const c = record(data.continuity);
    rejectUnknown(c, CONTINUITY_FIELDS, 'manual trip continuity');
    const graph = requiredField(c, 'graph', 'manual trip continuity'),
      readPhysical = readFunction(
        requiredField(c, 'readPhysical', 'manual trip continuity'),
        'continuity readPhysical',
      ) as (atTick: number) => TakeoverPhysicalState;
    requireContract(
      graph === null ||
        (typeof (graph as LaneGraph).locateLane === 'function' &&
          typeof (graph as LaneGraph).getLane === 'function'),
      'Manual trip continuity needs the real 033 lane graph',
    );
    continuity = Object.freeze({
      graph: graph as LaneGraph | null,
      readPhysical,
      ...(c.readReentry === undefined
        ? {}
        : {
            readReentry: readFunction(c.readReentry, 'continuity readReentry') as (
              atTick: number,
            ) => AuthorityReentryObservation | null,
          }),
    });
  }

  const store = createInterventionRecordStore(context),
    events = createInterventionEventTransport(context),
    intake = createInterventionIntake(context),
    identities = new Map<string, BodyIdentity>([[taxi.entityId, taxi]]),
    causes = new Map<string, InterventionCause>(),
    targetChanges = new Map<string, InterventionTargetChange>(),
    /** Host-owned objects, kept by reference so the digest proves the trip never wrote them. */
    sourceProfileValues = (data.profile as { readonly values: unknown }).values,
    sourceProfileProofs = (data.profile as { readonly proofs: unknown }).proofs,
    initialProfileDigest = JSON.stringify([sourceProfileValues, sourceProfileProofs]);
  const now = (): number => authority.getStats().tick;
  const eligibility = (): boolean => {
    if (readLearningEligibility === null) return false;
    const value = readLearningEligibility(now());
    if (value === null) return false;
    requireContract(typeof value === 'boolean', 'Manual trip learning eligibility fact');
    return value;
  };
  const targetOf = (): InterventionTarget =>
    Object.freeze({
      ...context,
      version: '069-intervention-target-v1',
      playerId: profile.playerId,
      profileId: profile.profileId,
      baseVersionId: profile.baseVersionId,
      learningEpoch: profile.learningEpoch,
      controlPreferencesVersion: profile.controlPreferencesVersion,
      engineVersion: profile.engineVersion,
      mapVersion: profile.mapVersion,
      inputType: profile.inputType,
      learningEligible: eligibility(),
    });
  const ports: Omit<InterventionPorts, 'readAuthority'> = {
    bodyIdentity: (id: string) => identities.get(id),
    readTarget: targetOf,
    preparedCause: (operationId: string) => causes.get(operationId) ?? null,
    preparedTarget: (operationId: string) => targetChanges.get(operationId) ?? null,
    records: store.port,
    events: events.port,
    reserveIntake: (descriptor) => intake.reserve(descriptor),
    rejectIntake: (operationId) => intake.reject(operationId),
    inspectIntake: (operationId) => intake.inspect(operationId),
    acceptIntake: (descriptor) => {
      const receipt = intake.accept(descriptor);
      recordPublication(descriptor.segmentId, descriptor.operationId, descriptor.endTick);
      return receipt;
    },
    acknowledgeIntake(operationId: string) {
      const receipt = intake.inspect(operationId);
      requireContract(receipt !== null && receipt.accepted, 'Missing real intake receipt');
      intake.acknowledge(receipt);
    },
    inspectIntakeRelease: (operationId) => intake.inspectRelease(operationId),
  };
  const bridge = createManualSegmentBridge(context, ownerId, authority, ports);
  bridge.bind(modes, selection);

  let begun = false,
    rideId: string | null = null,
    disposed = false,
    fault: string | null = null,
    lastControl: VehicleControlProjection | null = null,
    lastPhysical: TakeoverPhysicalState | null = null,
    samplesAppended = 0,
    samplesSkipped = 0,
    completionBoundaryDone = false;
  const tracks = new Map<string, SegmentTrack>(),
    observed = new Map<string, Set<ParameterKey>>(),
    publications = new Map<string, ManualTripPublication>(),
    handovers: TakeoverContinuityDecision[] = [],
    ticks: Record<ManualTripMode, number> = { AUTO: 0, MANUAL: 0, LEARNING: 0 },
    refusals = zeroRefusals();

  function refuse(
    reason: ManualTripRefusalReason,
    atTick: number,
    detail: string,
  ): ManualTripRefusal {
    refusals[reason] += 1;
    return Object.freeze({ accepted: false as const, reason, tick: atTick, detail });
  }

  function assertLive(): void {
    requireContract(!disposed, 'Manual trip disposed');
    requireContract(fault === null, `Manual trip fault terminal: ${fault ?? ''}`);
  }

  function recordPublication(segmentId: string, operationId: string, endTick: number): void {
    if (publications.has(segmentId)) return;
    requireContract(
      publications.size < MANUAL_TRIP_LIMITS.publications,
      'Manual trip publication history exceeded',
    );
    const keys = Object.freeze(
        [...(observed.get(segmentId) ?? new Set<ParameterKey>())]
          .filter((key) => learningParameterKeys.includes(key))
          .sort(compareText),
      ),
      unobserved = Object.freeze(learningParameterKeys.filter((key) => !keys.includes(key)));
    publications.set(
      segmentId,
      Object.freeze({
        segmentId,
        operationId,
        endTick,
        mode: 'LEARNING' as const,
        learningEligible: true as const,
        observedParameters: keys,
        unobservedParameters: unobserved,
      }),
    );
  }

  function recordSegment(view: {
    readonly segmentId: string;
    readonly mode: 'MANUAL' | 'LEARNING';
    readonly startTick: number;
    readonly endTick: number | null;
    readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
    readonly closeReason: InterventionCloseReason | null;
  }): void {
    const known = tracks.get(view.segmentId),
      record = store.port.read(view.segmentId),
      samples = record === null ? (known?.samples ?? 0) : record.samples.length;
    if (known === undefined) {
      requireContract(
        tracks.size < MANUAL_TRIP_LIMITS.segments,
        'Manual trip segment history exceeded',
      );
      tracks.set(
        view.segmentId,
        Object.freeze({
          segmentId: view.segmentId,
          mode: view.mode,
          learningEligible: record?.learningEligible ?? false,
          startTick: view.startTick,
          endTick: view.endTick,
          completeness: view.completeness,
          closeReason: view.closeReason,
          samples,
        }),
      );
      return;
    }
    tracks.set(
      view.segmentId,
      Object.freeze({
        ...known,
        learningEligible: record?.learningEligible ?? known.learningEligible,
        endTick: view.endTick,
        completeness: view.completeness,
        closeReason: view.closeReason,
        samples,
      }),
    );
  }

  function updateSegments(): void {
    const view = bridge.lifecycle.observe();
    if (view.lastClosed !== null)
      recordSegment({
        segmentId: view.lastClosed.segmentId,
        mode: view.lastClosed.mode,
        startTick: view.lastClosed.startTick,
        endTick: view.lastClosed.endTick,
        completeness: view.lastClosed.completeness,
        closeReason: view.lastClosed.closeReason,
      });
    if (view.active !== null)
      recordSegment({
        segmentId: view.active.segmentId,
        mode: view.active.mode,
        startTick: view.active.startTick,
        endTick: null,
        completeness: 'OPEN',
        closeReason: null,
      });
  }

  function observeSegment(atTick: number, state: VehicleState): void {
    const view = bridge.lifecycle.observe();
    if (view.active === null || readObservation === null) return;
    const keys = readObservation(atTick, state, view.active.mode);
    requireContract(Array.isArray(keys), 'Manual trip observation must be an array');
    const set = observed.get(view.active.segmentId) ?? new Set<ParameterKey>();
    for (const key of keys) {
      getParameterDefinition(key);
      set.add(key as ParameterKey);
    }
    observed.set(view.active.segmentId, set);
  }

  function appendSample(
    atTick: number,
    state: VehicleState,
    control: VehicleControlProjection | null,
  ): void {
    const view = bridge.lifecycle.observe();
    if (view.active === null || readTelemetry === null) return;
    const sample = readTelemetry(atTick, state, control);
    if (sample === null) return;
    if ((tracks.get(view.active.segmentId)?.samples ?? 0) >= MANUAL_TRIP_LIMITS.samplesPerSegment) {
      samplesSkipped += 1;
      return;
    }
    bridge.lifecycle.appendSample(taxi, sample);
    samplesAppended += 1;
  }

  function continuityDecision(
    atTick: number,
    previousMode: ManualTripMode,
    previousControl: VehicleControlProjection | null,
    mode: ManualTripMode,
    control: VehicleControlProjection | null,
  ): TakeoverContinuityDecision | null {
    if (continuity === null || previousMode === 'AUTO' || previousMode === mode) return null;
    if (lastPhysical === null || previousControl === null) return null;
    const after = continuity.readPhysical(atTick);
    requireContract(
      after.tick === atTick && lastPhysical.tick + 1 === atTick,
      'Manual trip handover physical ticks',
    );
    if (handovers.length >= MANUAL_TRIP_LIMITS.handovers) return null;
    const decision = evaluateTakeoverContinuity({
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      actor: Object.freeze({ id: taxi.entityId, incarnation: 1 }),
      decisionTick: atTick,
      authority: mode,
      closedMode: previousMode,
      collisionObserved: false,
      graph: continuity.graph,
      before: lastPhysical,
      after,
      lastManualCommand: takeoverCommandOf(previousControl.command),
      firstAutonomyCommand:
        mode === 'AUTO' && control !== null ? takeoverCommandOf(control.command) : null,
      observation: continuity.readReentry === undefined ? null : continuity.readReentry(atTick),
    });
    handovers.push(decision);
    return decision;
  }

  function begin(input: unknown): ManualTripBegin | ManualTripRefusal {
    assertLive();
    const time = now(),
      event = record(input);
    for (const key of BEGIN_FIELDS) requiredField(event, key, 'manual trip begin');
    rejectUnknown(event, BEGIN_FIELDS, 'manual trip begin');
    const requestedRide = boundedText(event.requestId, 'ride request'),
      eventId = boundedText(event.eventId, 'ride event'),
      atTick = tick(event.tick),
      taxiId = boundedText(event.taxiId, 'ride taxi');
    if (begun) {
      const ride = rideId === null ? undefined : lifecycle.ride(rideId);
      return refuse(
        ride !== undefined && ride.terminal ? 'RIDE_TERMINAL' : 'DUPLICATE_RIDE',
        time,
        'This trip driver already owns one ride',
      );
    }
    if (atTick !== time)
      return refuse('TICK_NOT_CURRENT', time, 'A ride starts at the accepted authority tick only');
    if (taxiId !== taxi.entityId)
      return refuse('TAXI_MISMATCH', time, 'The trip driver is bound to its registered taxi');
    const result = lifecycle.begin({ requestId: requestedRide, eventId, tick: atTick });
    if (result.duplicate)
      return refuse('DUPLICATE_RIDE', time, 'The ride lifecycle already applied this begin event');
    requireContract(
      result.ride.taxiId === taxi.entityId,
      'Manual trip assignment taxi does not match the registered taxi',
    );
    begun = true;
    rideId = result.ride.rideId;
    return Object.freeze({
      accepted: true as const,
      tick: atTick,
      rideId: result.ride.rideId,
      requestId: result.ride.requestId,
      taxiId: result.ride.taxiId,
      duplicate: false as const,
    });
  }

  function requestMode(input: unknown): ManualTripModeRequest | ManualTripRefusal {
    assertLive();
    const time = now(),
      request = record(input);
    for (const key of MODE_FIELDS) requiredField(request, key, 'manual trip mode request');
    rejectUnknown(request, [...MODE_FIELDS, 'rideId'], 'manual trip mode request');
    const atTick = tick(request.tick),
      rawMode = request.mode,
      expectedRide = request.rideId === undefined ? null : boundedText(request.rideId, 'ride');
    if (!begun || rideId === null)
      return refuse('NO_ACTIVE_RIDE', time, 'No ride is owned by this trip driver');
    if (rawMode !== 'AUTO' && rawMode !== 'MANUAL' && rawMode !== 'LEARNING')
      return refuse('UNKNOWN_MODE', time, 'Unknown control mode');
    const requested: ManualTripMode = rawMode;
    if (expectedRide !== null && expectedRide !== rideId)
      return refuse('RIDE_MISMATCH', time, 'The intervention belongs to another ride');
    if (atTick !== time)
      return refuse(
        'TICK_NOT_CURRENT',
        time,
        'A mode intent is accepted only at the current accepted tick',
      );
    const stats = authority.getStats();
    if (stats.disposed) return refuse('AUTHORITY_FAULT', time, 'The control authority is disposed');
    if (stats.fault !== null)
      return refuse('AUTHORITY_FAULT', time, 'The control authority reports a terminal fault');
    if (stats.suspended)
      return refuse(
        'AUTHORITY_SUSPENDED',
        time,
        'The world is suspended; no intervention is legal',
      );
    if (modes.getStats().intents > 0)
      return refuse('INTENT_ALREADY_QUEUED', time, 'One mode intervention per accepted tick');
    const current = modeOf(stats.seat?.mode),
      action = intentFor(current, requested);
    if (action === null)
      return refuse('ALREADY_IN_MODE', time, 'The requested mode would create no new segment');
    if (requested === 'LEARNING' && !eligibility())
      return refuse(
        'LEARNING_UNAVAILABLE',
        time,
        'No explicit current LEARNING eligibility fact is available',
      );
    let enqueued = false;
    try {
      enqueued = modes.enqueue(action, taxi);
    } catch {
      return refuse('MODE_QUEUE_CONFLICT', time, 'The mode intent burst was rejected whole');
    }
    if (!enqueued)
      return refuse('TARGET_UNAVAILABLE', time, 'The selected taxi is not the registered target');
    return Object.freeze({
      accepted: true as const,
      tick: atTick,
      from: current,
      to: requested,
      action,
      appliesAtTick: atTick + 1,
    });
  }

  function step(input: unknown): ManualTripStep | ManualTripRefusal {
    assertLive();
    const time = now(),
      frame = record(input);
    for (const key of STEP_FIELDS)
      if (key !== 'packets') requiredField(frame, key, 'manual trip step');
    rejectUnknown(frame, STEP_FIELDS, 'manual trip step');
    const atTick = tick(frame.tick),
      packets = frame.packets === undefined ? [] : frame.packets;
    requireContract(Array.isArray(packets), 'Manual trip packets must be an array');
    if (atTick !== time + 1)
      return refuse('TICK_NOT_NEXT', time, 'One deterministic tick per step, without gaps');
    const before = authority.getStats();
    if (before.suspended)
      return refuse('AUTHORITY_SUSPENDED', time, 'A suspended world executes zero physical ticks');
    if (before.fault !== null)
      return refuse('AUTHORITY_FAULT', time, 'The control authority reports a terminal fault');
    const previousMode = modeOf(before.seat?.mode),
      previousControl = lastControl,
      activeBefore = bridge.lifecycle.observe().active;
    lifecycle.advance(atTick);
    const rideBefore = rideId === null ? undefined : lifecycle.ride(rideId);
    let completionCause: InterventionCause | null = null;
    if (
      rideBefore !== undefined &&
      rideBefore.terminal &&
      !completionBoundaryDone &&
      activeBefore !== null &&
      modes.getStats().intents === 0
    ) {
      const operationId = `${ownerId}:ride-completed:${rideId}:${atTick}`,
        cause: InterventionCause = Object.freeze({
          ...context,
          version: '069-admitted-cause-v1',
          operationId,
          timing: 'PREPARED_BEFORE_NEXT_TICK',
          tick: atTick,
          identity: taxi,
          reason: 'RIDE_COMPLETED',
        });
      causes.set(operationId, cause);
      completionCause = cause;
      completionBoundaryDone = true;
    }
    const result = bridge.step(
      {
        ...context,
        version: '066-control-authority-v1',
        tick: atTick,
        dtSeconds: MANUAL_TRIP_LIMITS.dtSeconds,
      },
      packets as never,
      { cause: completionCause, targetChange: null },
    );
    const after = authority.getStats(),
      mode = modeOf(after.seat?.mode),
      control = result.frame.controls.find((entry) => entry.identity === taxi) ?? null;
    ticks[mode] += 1;
    updateSegments();
    const state = readState(atTick);
    requireContract(
      state.tick === atTick && state.vehicleId === taxi.entityId && state.controlMode === mode,
      'Manual trip authoritative state identity/mode',
    );
    const rideAfter = rideId === null ? undefined : lifecycle.ride(rideId),
      pickupDecision =
        rideAfter !== undefined && (rideAfter.state === 'TO_PICKUP' || rideAfter.state === 'PICKUP')
          ? pickup.observe({
              rideId: rideAfter.rideId,
              taxiId: rideAfter.taxiId,
              tick: atTick,
              positionM: state.transform.positionM,
              speedMps: speedOf(state),
            })
          : null,
      dropoffDecision =
        rideAfter !== undefined &&
        (rideAfter.state === 'TO_DROPOFF' || rideAfter.state === 'DROPOFF')
          ? dropoff.observe({
              rideId: rideAfter.rideId,
              taxiId: rideAfter.taxiId,
              tick: atTick,
              positionM: state.transform.positionM,
              speedMps: speedOf(state),
            })
          : null;
    observeSegment(atTick, state);
    appendSample(atTick, state, control);
    const handover = continuityDecision(atTick, previousMode, previousControl, mode, control);
    lastControl = control;
    if (continuity !== null) lastPhysical = Object.freeze({ ...continuity.readPhysical(atTick) });
    const view = bridge.lifecycle.observe();
    return Object.freeze({
      accepted: true as const,
      tick: atTick,
      mode,
      seatIdentity: after.seat?.identity.entityId ?? null,
      rideState: rideAfter?.state ?? null,
      pickup: pickupDecision,
      dropoff: dropoffDecision,
      activeSegmentId: view.active?.segmentId ?? null,
      closedSegmentId: view.lastClosed?.segmentId ?? null,
      handover,
    });
  }

  function result(): ManualTripResult {
    assertLive();
    const ride = rideId === null ? undefined : lifecycle.ride(rideId),
      boarding =
        ride === undefined
          ? undefined
          : pickup.boardings().find((entry) => entry.rideId === ride.rideId),
      completion =
        ride === undefined
          ? undefined
          : dropoff.completions().find((entry) => entry.rideId === ride.rideId),
      segments = [...tracks.values()]
        .sort((left, right) => compareText(left.segmentId, right.segmentId))
        .map((track) =>
          Object.freeze({
            segmentId: track.segmentId,
            mode: track.mode,
            learningEligible: track.learningEligible,
            startTick: track.startTick,
            endTick: track.endTick,
            completeness: track.completeness,
            closeReason: track.closeReason,
            samples: track.samples,
            observedParameters: Object.freeze(
              [...(observed.get(track.segmentId) ?? new Set<ParameterKey>())].sort(compareText),
            ),
            publishedParameters: Object.freeze(
              publications.get(track.segmentId)?.observedParameters ?? [],
            ),
            publicationOperationId: publications.get(track.segmentId)?.operationId ?? null,
          }),
        ),
      segmentSamples: Record<string, number> = {};
    for (const track of segments) segmentSamples[track.segmentId] = track.samples;
    const rideResult: ManualTripRideResult | null =
        ride === undefined
          ? null
          : Object.freeze({
              rideId: ride.rideId,
              requestId: ride.requestId,
              taxiId: ride.taxiId,
              assignmentId: ride.assignmentId,
              pickupZoneId: ride.pickupZoneId,
              dropoffZoneId: ride.dropoffZoneId,
              state: ride.state,
              terminal: ride.terminal,
              startedTick: ride.startedTick,
              completedTick: ride.state === 'COMPLETED' ? ride.updatedTick : null,
              pickupCostSeconds: ride.pickupCostSeconds,
              tripCostSeconds: ride.tripCostSeconds,
              totalCostSeconds: ride.totalCostSeconds,
              pickupRouteLaneIds: ride.pickupRouteLaneIds,
              tripRouteLaneIds: ride.tripRouteLaneIds,
              boardingTick: boarding?.tick ?? null,
              boardingDwellTicks: boarding?.dwellTicks ?? null,
              completionTick: completion?.tick ?? null,
              completionDwellTicks: completion?.dwellTicks ?? null,
              releaseReason: ride.release?.reason ?? completion?.release?.reason ?? null,
              transitions: Object.freeze(
                ride.transitions.map((entry) => Object.freeze([entry.event, entry.tick] as const)),
              ),
            }),
      publicationsList = Object.freeze(
        [...publications.values()].sort((left, right) =>
          compareText(left.segmentId, right.segmentId),
        ),
      );
    return Object.freeze({
      version: MANUAL_TRIP_VERSION,
      namespace: ownerId,
      tick: now(),
      begun,
      mode: modeOf(authority.getStats().seat?.mode),
      ride: rideResult,
      segments: Object.freeze(segments),
      learning: Object.freeze({
        intakeEntries: intake.getStats().entries,
        publications: publicationsList,
        manualSegments: segments.filter((entry) => entry.mode === 'MANUAL').length,
        manualPublications: 0 as const,
        learningSegments: segments.filter((entry) => entry.mode === 'LEARNING').length,
      }),
      profile: Object.freeze({
        playerId: profile.playerId,
        profileId: profile.profileId,
        baseVersionId: profile.baseVersionId,
        learningEpoch: profile.learningEpoch,
        values: profile.values,
        proofs: profile.proofs,
        unchanged:
          JSON.stringify([sourceProfileValues, sourceProfileProofs]) === initialProfileDigest,
      }),
      telemetry: Object.freeze({
        ticks: Object.freeze({ ...ticks }),
        samplesAppended,
        samplesSkipped,
        segmentSamples: Object.freeze(segmentSamples),
      }),
      handovers: Object.freeze([...handovers]),
      refusals: Object.freeze({ ...refusals }),
    });
  }

  function stats(): ManualTripStats {
    const segments = [...tracks.values()];
    return Object.freeze({
      version: MANUAL_TRIP_VERSION,
      namespace: ownerId,
      tick: now(),
      begun,
      rideId,
      mode: modeOf(authority.getStats().seat?.mode),
      segments: segments.length,
      openSegments: segments.filter((entry) => entry.completeness === 'OPEN').length,
      publications: publications.size,
      handovers: handovers.length,
      samplesAppended,
      ticks: Object.freeze({ ...ticks }),
      refusals: Object.freeze({ ...refusals }),
      profileUnchanged:
        JSON.stringify([sourceProfileValues, sourceProfileProofs]) === initialProfileDigest,
      disposed,
    });
  }

  function retireOpenSegment(): void {
    const view = bridge.lifecycle.observe();
    if (view.active === null) return;
    const atTick = now(),
      operationId = `${ownerId}:shutdown:${atTick}`,
      cause: InterventionCause = Object.freeze({
        ...context,
        version: '069-admitted-cause-v1',
        operationId,
        timing: 'AT_LAST_ACCEPTED_TICK',
        tick: atTick,
        identity: taxi,
        reason: 'SHUTDOWN',
      });
    causes.set(operationId, cause);
    bridge.lifecycle.retire(cause);
  }

  return Object.freeze({
    namespace: ownerId,
    currentTick: now,
    begin,
    requestMode,
    step,
    result,
    stats,
    dispose(): void {
      if (disposed) return;
      try {
        retireOpenSegment();
      } catch (error) {
        fault = error instanceof Error ? error.message : String(error);
      }
      try {
        bridge.dispose();
      } finally {
        store.dispose();
        events.dispose();
        intake.dispose();
        disposed = true;
        tracks.clear();
        observed.clear();
        publications.clear();
        handovers.length = 0;
        causes.clear();
        targetChanges.clear();
      }
    },
  });
}

/** The frozen 072 read model shared by the documentation and the deterministic evidence report. */
export function manualTripContractFacts(): Readonly<{
  version: typeof MANUAL_TRIP_VERSION;
  refusalReasons: readonly ManualTripRefusalReason[];
  segments: number;
  publications: number;
  handovers: number;
  samplesPerSegment: number;
  tickHz: number;
  dtSeconds: number;
  parameterKeys: readonly ParameterKey[];
  learningParameterKeys: readonly ParameterKey[];
  closeReasons: readonly InterventionCloseReason[];
}> {
  return Object.freeze({
    version: MANUAL_TRIP_VERSION,
    refusalReasons: Object.freeze([...MANUAL_TRIP_REFUSAL_REASONS]),
    segments: MANUAL_TRIP_LIMITS.segments,
    publications: MANUAL_TRIP_LIMITS.publications,
    handovers: MANUAL_TRIP_LIMITS.handovers,
    samplesPerSegment: MANUAL_TRIP_LIMITS.samplesPerSegment,
    tickHz: MANUAL_TRIP_LIMITS.tickHz,
    dtSeconds: MANUAL_TRIP_LIMITS.dtSeconds,
    parameterKeys,
    learningParameterKeys,
    closeReasons: Object.freeze([
      'RETURN_TO_AUTO',
      'MODE_CHANGE',
      'RIDE_COMPLETED',
      'VEHICLE_SWITCH',
      'SHUTDOWN',
    ] as InterventionCloseReason[]),
  });
}
