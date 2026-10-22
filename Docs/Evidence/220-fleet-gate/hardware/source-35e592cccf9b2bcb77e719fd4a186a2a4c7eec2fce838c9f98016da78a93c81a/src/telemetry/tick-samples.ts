import { choice, number, requireContract, text, tick as readTick } from '../sessions';
import { controlModes, maneuverStates, VEHICLE_CLASS_VERSION, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId, VehicleCommand, VehicleState } from '../vehicles';
import { segmentCloseReasons } from './contracts';

/**
 * 085 tick sample recorder: bounded, columnar capture of the authoritative per-tick observation.
 *
 * The recorder owns no clock, world, renderer or DOM and reads no render state. It consumes the
 * already authoritative input/command/state/lane/signal outputs at one fixed tick and stores their
 * SI projection in preallocated typed arrays. The metadata that must not change mid-segment
 * (controlMode, profileId, learningEpoch, learningEligible, class) is frozen when a segment opens.
 * The hot path performs no JSON serialization and never grows beyond its declared capacities.
 */

export const TICK_SAMPLE_VERSION = '085-tick-samples-v1' as const;

/** Rapier world gravity magnitude; `grip` is expressed as a friction-budget admission figure. */
export const STANDARD_GRAVITY_MPS2 = 9.81;

/** Exact dense bytes one retained sample occupies (typed arrays only, identity strings excluded). */
export const TICK_SAMPLE_BYTES_PER_SAMPLE = 114;

export const tickSampleOverflowPolicies = ['DROP_OLDEST', 'DROP_NEWEST'] as const;
export type TickSampleOverflowPolicy = (typeof tickSampleOverflowPolicies)[number];

export const tickSampleInputTypes = ['KEYBOARD', 'GAMEPAD', 'AUTONOMY'] as const;
export type TickSampleInputType = (typeof tickSampleInputTypes)[number];

export const tickSampleSignalStates = ['RED', 'YELLOW', 'GREEN'] as const;
export type TickSampleSignalState = (typeof tickSampleSignalStates)[number];

export type TickSampleCloseReason = (typeof segmentCloseReasons)[number];

/**
 * Finite admission caps required by the null-capacity policy. The 203 manifest proposes
 * `diagnosticSamples: 4096`; the owning PBI fixes these exact caps and measures them on its fixture.
 */
export const TICK_SAMPLE_CAPACITY = Object.freeze({
  minimum: 64,
  default: 4096,
  maximum: 65536,
  identitiesPerSegment: 4096,
  retainedSegments: 8,
  retainedBytes: 8 * 1024 * 1024,
});

export interface TickSampleRecorderOptions {
  readonly capacity?: number;
  readonly overflowPolicy?: TickSampleOverflowPolicy;
  readonly identitiesPerSegment?: number;
  readonly retainedSegments?: number;
  readonly retainedBytes?: number;
}

/** Metadata frozen at segment open and never mutated while the segment stays open. */
export interface TickSampleSegmentInput {
  readonly segmentId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly profileId: string;
  /** Applied profile version; every recorded sample must still match it. */
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  /** Only a caller-declared LEARNING segment may be true; MANUAL/AUTO stay ineligible. */
  readonly learningEligible: boolean;
  readonly inputType: TickSampleInputType;
  readonly startTick: number;
}

export interface TickSampleRawInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
}

export interface TickSamplePhysics {
  readonly longitudinalAccelerationMps2: number;
  readonly lateralAccelerationMps2: number;
}

export interface TickSampleLaneContext {
  readonly laneId: string;
  /** Advisory limit of the authoritative lane; SI, m/s. */
  readonly speedLimitMps: number;
}

export interface TickSampleSignalContext {
  readonly signalId: string;
  readonly state: TickSampleSignalState;
}

/** Authoritative observation at one tick: raw input, filtered command, physics, lane, signal. */
export interface TickSampleFrame {
  readonly tick: number;
  readonly state: VehicleState;
  readonly raw: TickSampleRawInput;
  readonly command: VehicleCommand;
  readonly physics: TickSamplePhysics;
  readonly lane: TickSampleLaneContext | null;
  readonly signal: TickSampleSignalContext | null;
}

export interface TickSampleCapabilities {
  readonly maxAccelerationMps2: number;
  readonly maxDecelerationMps2: number;
  readonly maxLateralAccelerationMps2: number;
}

export interface TickSampleSegmentSummary {
  readonly segmentId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly classVersion: typeof VEHICLE_CLASS_VERSION;
  readonly controlMode: ControlMode;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly learningEligible: boolean;
  /** MANUAL/AUTO samples stay visible to metrics and history even though ineligible for learning. */
  readonly retainedForMetrics: true;
  readonly inputType: TickSampleInputType;
  readonly capabilities: TickSampleCapabilities;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly closeReason: TickSampleCloseReason | null;
  readonly completeness: 'OPEN' | 'CLOSED';
  readonly sampleCount: number;
  readonly capacity: number;
  readonly overflowPolicy: TickSampleOverflowPolicy;
  readonly overwrittenSamples: number;
  readonly rejectedSamples: number;
  readonly identityCount: number;
  readonly identityOverflow: number;
  readonly bufferBytes: number;
  readonly identityCodeUnits: number;
}

/** One materialized observation plus the segment metadata frozen at its open. */
export interface TickSampleObservation {
  readonly tick: number;
  readonly state: VehicleState;
  readonly rawInput: TickSampleRawInput;
  readonly command: VehicleCommand;
  readonly physics: TickSamplePhysics;
  readonly laneId: string | null;
  readonly speedLimitMps: number | null;
  readonly signal: TickSampleSignalContext | null;
  readonly capabilities: TickSampleCapabilities;
  readonly vehicleClass: { readonly classId: VehicleClassId; readonly version: string };
}

export interface TickSampleReadout {
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly learningEligible: boolean;
  readonly observation: TickSampleObservation;
}

export interface TickSampleRecorderStats {
  readonly version: typeof TICK_SAMPLE_VERSION;
  readonly disposed: boolean;
  readonly capacity: number;
  readonly overflowPolicy: TickSampleOverflowPolicy;
  readonly retainedSegmentsMaximum: number;
  readonly retainedBytesMaximum: number;
  /** Cumulative since construction; survives `dispose()`. */
  readonly segmentsOpened: number;
  readonly segmentsClosed: number;
  readonly segmentsRetired: number;
  readonly samplesRecorded: number;
  readonly samplesRejectedAfterClose: number;
  readonly tickGaps: number;
  /** Live owned resources; every one returns to zero after `dispose()`. */
  readonly segmentsRetained: number;
  readonly samplesRetained: number;
  readonly samplesOverwritten: number;
  readonly samplesRejected: number;
  readonly identityOverflow: number;
  readonly bufferBytes: number;
  readonly identityCodeUnits: number;
  readonly retainedBytes: number;
}

export interface TickSampleRecorder {
  readonly version: typeof TICK_SAMPLE_VERSION;
  /** Opens a segment, closing the previous one with `closeReason` (default MODE_CHANGE). */
  openSegment(input: TickSampleSegmentInput, closeReason?: TickSampleCloseReason): void;
  /** Returns the retained logical row index, or -1 when the overflow policy rejected the sample. */
  record(frame: TickSampleFrame): number;
  closeSegment(reason: TickSampleCloseReason): void;
  getSegments(): readonly TickSampleSegmentSummary[];
  getSegment(segmentId: string): TickSampleSegmentSummary | null;
  readSample(segmentId: string, index: number): TickSampleReadout;
  releaseSegment(segmentId: string): boolean;
  getStats(): TickSampleRecorderStats;
  dispose(): void;
}

interface SegmentStore {
  readonly capacity: number;
  readonly overflowPolicy: TickSampleOverflowPolicy;
  readonly identitiesPerSegment: number;
  readonly tick: Float64Array;
  readonly rawThrottle: Float32Array;
  readonly rawBrake: Float32Array;
  readonly rawSteering: Float32Array;
  readonly rawHandbrake: Uint8Array;
  readonly commandThrottle: Float32Array;
  readonly commandBrake: Float32Array;
  readonly commandSteering: Float32Array;
  readonly commandHandbrake: Uint8Array;
  readonly commandTurnSignal: Uint8Array;
  readonly commandSource: Uint8Array;
  readonly positionX: Float32Array;
  readonly positionY: Float32Array;
  readonly positionZ: Float32Array;
  readonly quaternionX: Float64Array;
  readonly quaternionY: Float64Array;
  readonly quaternionZ: Float64Array;
  readonly quaternionW: Float64Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly velocityZ: Float32Array;
  readonly longitudinalAccelerationMps2: Float32Array;
  readonly lateralAccelerationMps2: Float32Array;
  readonly maneuverState: Uint8Array;
  readonly laneId: Uint32Array;
  readonly speedLimitMps: Float32Array;
  readonly signalId: Uint32Array;
  readonly signalState: Uint8Array;
  count: number;
  head: number;
  next: number;
  lastTick: number | null;
  overwrittenSamples: number;
  rejectedSamples: number;
  identityOverflow: number;
  readonly identities: Map<string, number>;
  /** Index 0 is the reserved "absent identity" sentinel. */
  readonly identityList: string[];
}

interface RetainedSegment {
  readonly header: TickSampleSegmentInput;
  readonly store: SegmentStore;
  readonly capabilities: TickSampleCapabilities;
  endTick: number | null;
  closeReason: TickSampleCloseReason | null;
  completeness: 'OPEN' | 'CLOSED';
}

const turnSignalValues = ['OFF', 'LEFT', 'RIGHT', 'HAZARD'] as const;
const commandSourceValues = ['AUTONOMY', 'PLAYER'] as const;
const optionKeys = [
  'capacity',
  'overflowPolicy',
  'identitiesPerSegment',
  'retainedSegments',
  'retainedBytes',
];
const frameKeys = ['tick', 'state', 'raw', 'command', 'physics', 'lane', 'signal'];

function plainObject(value: unknown, message: string): Record<string, unknown> {
  requireContract(typeof value === 'object' && value !== null && !Array.isArray(value), message);
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    `${message}: expected plain data object`,
  );
  return value as Record<string, unknown>;
}

function identity(value: unknown, maximum = 256): string {
  const result = text(value);
  requireContract(result.length <= maximum, 'Tick sample identifier capacity');
  return result;
}

function finite(value: unknown, minimum: number, maximum: number): number {
  return number(value, minimum, maximum);
}

function createStore(
  capacity: number,
  overflowPolicy: TickSampleOverflowPolicy,
  identitiesPerSegment: number,
): SegmentStore {
  const floats = () => new Float32Array(capacity);
  return {
    capacity,
    overflowPolicy,
    identitiesPerSegment,
    tick: new Float64Array(capacity),
    rawThrottle: floats(),
    rawBrake: floats(),
    rawSteering: floats(),
    rawHandbrake: new Uint8Array(capacity),
    commandThrottle: floats(),
    commandBrake: floats(),
    commandSteering: floats(),
    commandHandbrake: new Uint8Array(capacity),
    commandTurnSignal: new Uint8Array(capacity),
    commandSource: new Uint8Array(capacity),
    positionX: floats(),
    positionY: floats(),
    positionZ: floats(),
    quaternionX: new Float64Array(capacity),
    quaternionY: new Float64Array(capacity),
    quaternionZ: new Float64Array(capacity),
    quaternionW: new Float64Array(capacity),
    velocityX: floats(),
    velocityY: floats(),
    velocityZ: floats(),
    longitudinalAccelerationMps2: floats(),
    lateralAccelerationMps2: floats(),
    maneuverState: new Uint8Array(capacity),
    laneId: new Uint32Array(capacity),
    speedLimitMps: floats(),
    signalId: new Uint32Array(capacity),
    signalState: new Uint8Array(capacity),
    count: 0,
    head: 0,
    next: 0,
    lastTick: null,
    overwrittenSamples: 0,
    rejectedSamples: 0,
    identityOverflow: 0,
    identities: new Map<string, number>(),
    identityList: [''],
  };
}

function storeBufferBytes(store: SegmentStore): number {
  return (
    store.tick.byteLength +
    store.rawThrottle.byteLength +
    store.rawBrake.byteLength +
    store.rawSteering.byteLength +
    store.rawHandbrake.byteLength +
    store.commandThrottle.byteLength +
    store.commandBrake.byteLength +
    store.commandSteering.byteLength +
    store.commandHandbrake.byteLength +
    store.commandTurnSignal.byteLength +
    store.commandSource.byteLength +
    store.positionX.byteLength +
    store.positionY.byteLength +
    store.positionZ.byteLength +
    store.quaternionX.byteLength +
    store.quaternionY.byteLength +
    store.quaternionZ.byteLength +
    store.quaternionW.byteLength +
    store.velocityX.byteLength +
    store.velocityY.byteLength +
    store.velocityZ.byteLength +
    store.longitudinalAccelerationMps2.byteLength +
    store.lateralAccelerationMps2.byteLength +
    store.maneuverState.byteLength +
    store.laneId.byteLength +
    store.speedLimitMps.byteLength +
    store.signalId.byteLength +
    store.signalState.byteLength
  );
}

function storeIdentityCodeUnits(store: SegmentStore): number {
  let units = 0;
  for (const value of store.identityList) units += value.length;
  return units;
}

function releaseStore(store: SegmentStore): void {
  store.count = 0;
  store.head = 0;
  store.next = 0;
  store.lastTick = null;
  store.identities.clear();
  store.identityList.length = 0;
  store.identityList.push('');
}

function internIdentity(store: SegmentStore, value: string | null): number {
  if (value === null) return 0;
  const existing = store.identities.get(value);
  if (existing !== undefined) return existing;
  if (store.identityList.length > store.identitiesPerSegment) {
    store.identityOverflow += 1;
    return 0;
  }
  const index = store.identityList.length;
  store.identityList.push(value);
  store.identities.set(value, index);
  return index;
}

function identityAt(store: SegmentStore, index: number): string | null {
  return index === 0 ? null : (store.identityList[index] ?? null);
}

/** Mechanical admission figures derived from the immutable class definition; not measured forces. */
export function mechanicalCapabilities(classId: VehicleClassId): TickSampleCapabilities {
  const definition = vehicleClass(classId);
  return Object.freeze({
    maxAccelerationMps2: definition.engineForceN / definition.massKg,
    maxDecelerationMps2: definition.brakeAcceleration,
    maxLateralAccelerationMps2: definition.grip * STANDARD_GRAVITY_MPS2,
  });
}

const yawRad = (state: VehicleState): number => {
  const q = state.transform.rotationQuaternion;
  return Math.atan2(2 * q.y * q.w, 1 - 2 * q.y * q.y);
};

const speedMps = (state: VehicleState): number => {
  const v = state.velocityMps;
  return Math.hypot(v.x, v.y, v.z);
};

/** Signed SI rates between two consecutive authoritative states; convenience for callers/probes. */
export function deriveTickSamplePhysics(
  previous: VehicleState,
  current: VehicleState,
  dtSeconds: number,
): TickSamplePhysics {
  const dt = number(dtSeconds, 1e-6, 1);
  const currentSpeed = speedMps(current);
  let deltaYaw = yawRad(current) - yawRad(previous);
  while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
  while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
  return Object.freeze({
    longitudinalAccelerationMps2: (currentSpeed - speedMps(previous)) / dt,
    lateralAccelerationMps2: Math.abs((currentSpeed * deltaYaw) / dt),
  });
}

function validateSegmentInput(value: unknown): TickSampleSegmentInput {
  const data = plainObject(value, 'Tick sample segment input');
  const keys = Object.keys(data);
  requireContract(
    keys.length === 12 &&
      [
        'segmentId',
        'sessionId',
        'worldEpoch',
        'vehicleId',
        'classId',
        'controlMode',
        'profileId',
        'baseVersionId',
        'learningEpoch',
        'learningEligible',
        'inputType',
        'startTick',
      ].every((key) => key in data),
    'Tick sample segment input has missing or unknown fields',
  );
  const classId = identity(data.classId, 32);
  const controlMode = choice(data.controlMode, controlModes);
  const inputType = choice(data.inputType, tickSampleInputTypes);
  requireContract(
    typeof data.learningEligible === 'boolean' &&
      data.learningEligible === (controlMode === 'LEARNING'),
    'Only a caller-declared LEARNING segment may be learning-eligible',
  );
  requireContract(
    (controlMode === 'AUTO') === (inputType === 'AUTONOMY'),
    'Tick sample input type does not match control mode',
  );
  const definition = vehicleClass(classId as VehicleClassId);
  return Object.freeze({
    segmentId: identity(data.segmentId),
    sessionId: identity(data.sessionId),
    worldEpoch: readTick(data.worldEpoch),
    vehicleId: identity(data.vehicleId),
    classId: definition.classId,
    controlMode,
    profileId: identity(data.profileId),
    baseVersionId: identity(data.baseVersionId),
    learningEpoch: readTick(data.learningEpoch),
    learningEligible: data.learningEligible,
    inputType,
    startTick: readTick(data.startTick),
  });
}

function writeRow(store: SegmentStore, frame: TickSampleFrame): number {
  const capacity = store.capacity;
  let slot: number;
  if (store.count < capacity) {
    slot = store.next;
    store.count += 1;
  } else if (store.overflowPolicy === 'DROP_OLDEST') {
    slot = store.next;
    store.head = (store.head + 1) % capacity;
    store.overwrittenSamples += 1;
  } else {
    store.rejectedSamples += 1;
    return -1;
  }
  store.next = (slot + 1) % capacity;
  const { state, command, raw, physics, lane, signal } = frame;
  store.tick[slot] = frame.tick;
  store.rawThrottle[slot] = raw.throttle;
  store.rawBrake[slot] = raw.brake;
  store.rawSteering[slot] = raw.steering;
  store.rawHandbrake[slot] = raw.handbrake ? 1 : 0;
  store.commandThrottle[slot] = command.throttle;
  store.commandBrake[slot] = command.brake;
  store.commandSteering[slot] = command.steering;
  store.commandHandbrake[slot] = command.handbrake ? 1 : 0;
  store.commandTurnSignal[slot] = turnSignalValues.indexOf(command.turnSignal);
  store.commandSource[slot] = commandSourceValues.indexOf(command.source);
  const position = state.transform.positionM;
  const rotation = state.transform.rotationQuaternion;
  const velocity = state.velocityMps;
  store.positionX[slot] = position.x;
  store.positionY[slot] = position.y;
  store.positionZ[slot] = position.z;
  store.quaternionX[slot] = rotation.x;
  store.quaternionY[slot] = rotation.y;
  store.quaternionZ[slot] = rotation.z;
  store.quaternionW[slot] = rotation.w;
  store.velocityX[slot] = velocity.x;
  store.velocityY[slot] = velocity.y;
  store.velocityZ[slot] = velocity.z;
  store.longitudinalAccelerationMps2[slot] = physics.longitudinalAccelerationMps2;
  store.lateralAccelerationMps2[slot] = physics.lateralAccelerationMps2;
  store.maneuverState[slot] = maneuverStates.indexOf(state.maneuverState);
  store.laneId[slot] = internIdentity(store, lane ? lane.laneId : null);
  store.speedLimitMps[slot] = lane ? lane.speedLimitMps : -1;
  store.signalId[slot] = internIdentity(store, signal ? signal.signalId : null);
  store.signalState[slot] = signal ? tickSampleSignalStates.indexOf(signal.state) + 1 : 0;
  return store.count - 1;
}

function observation(
  segment: RetainedSegment,
  store: SegmentStore,
  index: number,
): TickSampleObservation {
  const slot = (store.head + index) % store.capacity;
  const world = {
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: segment.header.sessionId,
    worldEpoch: segment.header.worldEpoch,
  };
  const at = store.tick[slot];
  const laneIdentity = identityAt(store, store.laneId[slot]);
  const signalIdentity = identityAt(store, store.signalId[slot]);
  const state: VehicleState = Object.freeze({
    ...world,
    vehicleId: segment.header.vehicleId,
    classId: segment.header.classId,
    tick: at,
    transform: Object.freeze({
      positionM: Object.freeze({
        x: store.positionX[slot],
        y: store.positionY[slot],
        z: store.positionZ[slot],
      }),
      rotationQuaternion: Object.freeze({
        x: store.quaternionX[slot],
        y: store.quaternionY[slot],
        z: store.quaternionZ[slot],
        w: store.quaternionW[slot],
      }),
    }),
    velocityMps: Object.freeze({
      x: store.velocityX[slot],
      y: store.velocityY[slot],
      z: store.velocityZ[slot],
    }),
    laneId: laneIdentity,
    controlMode: segment.header.controlMode,
    appliedProfileVersion: segment.header.baseVersionId,
    maneuverState: maneuverStates[store.maneuverState[slot]],
  });
  const command: VehicleCommand = Object.freeze({
    ...world,
    vehicleId: segment.header.vehicleId,
    tick: at,
    throttle: store.commandThrottle[slot],
    brake: store.commandBrake[slot],
    steering: store.commandSteering[slot],
    handbrake: store.commandHandbrake[slot] === 1,
    turnSignal: turnSignalValues[store.commandTurnSignal[slot]],
    source: commandSourceValues[store.commandSource[slot]],
  });
  const signalIndex = store.signalState[slot];
  return Object.freeze({
    tick: at,
    state,
    rawInput: Object.freeze({
      throttle: store.rawThrottle[slot],
      brake: store.rawBrake[slot],
      steering: store.rawSteering[slot],
      handbrake: store.rawHandbrake[slot] === 1,
    }),
    command,
    physics: Object.freeze({
      longitudinalAccelerationMps2: store.longitudinalAccelerationMps2[slot],
      lateralAccelerationMps2: store.lateralAccelerationMps2[slot],
    }),
    laneId: laneIdentity,
    speedLimitMps: laneIdentity === null ? null : store.speedLimitMps[slot],
    signal:
      signalIndex === 0 || signalIdentity === null
        ? null
        : Object.freeze({
            signalId: signalIdentity,
            state: tickSampleSignalStates[signalIndex - 1],
          }),
    capabilities: segment.capabilities,
    vehicleClass: Object.freeze({
      classId: segment.header.classId,
      version: VEHICLE_CLASS_VERSION,
    }),
  });
}

/** Bounded 085 recorder. One segment owns one ring; closed segments stay readable until released. */
export function createTickSampleRecorder(
  options: TickSampleRecorderOptions = {},
): TickSampleRecorder {
  const config = plainObject(options, 'Tick sample recorder options');
  for (const key of Object.keys(config))
    requireContract(optionKeys.includes(key), 'Unknown tick sample recorder option');
  const capacity =
    config.capacity === undefined ? TICK_SAMPLE_CAPACITY.default : readTick(config.capacity);
  requireContract(
    capacity >= TICK_SAMPLE_CAPACITY.minimum && capacity <= TICK_SAMPLE_CAPACITY.maximum,
    'Tick sample capacity out of range',
  );
  const overflowPolicy =
    config.overflowPolicy === undefined
      ? ('DROP_OLDEST' as const)
      : choice(config.overflowPolicy, tickSampleOverflowPolicies);
  const identitiesPerSegment =
    config.identitiesPerSegment === undefined
      ? TICK_SAMPLE_CAPACITY.identitiesPerSegment
      : readTick(config.identitiesPerSegment);
  requireContract(
    identitiesPerSegment >= 8 && identitiesPerSegment <= 65536,
    'Tick sample identity capacity out of range',
  );
  const retainedSegments =
    config.retainedSegments === undefined
      ? TICK_SAMPLE_CAPACITY.retainedSegments
      : readTick(config.retainedSegments);
  const retainedBytes =
    config.retainedBytes === undefined
      ? TICK_SAMPLE_CAPACITY.retainedBytes
      : readTick(config.retainedBytes);
  requireContract(retainedSegments >= 1 && retainedSegments <= 256, 'Retained segment count');
  requireContract(
    retainedBytes >= TICK_SAMPLE_BYTES_PER_SAMPLE * capacity,
    'Retained byte capacity must fit one segment buffer',
  );

  let active: RetainedSegment | null = null;
  let disposed = false;
  let segmentsOpened = 0;
  let segmentsClosed = 0;
  let segmentsRetired = 0;
  let samplesRecorded = 0;
  let samplesRejectedAfterClose = 0;
  let tickGaps = 0;
  const retained = new Map<string, RetainedSegment>();
  const retainedOrder: RetainedSegment[] = [];

  const alive = () => requireContract(!disposed, 'Tick sample recorder disposed');

  const totalRetainedBytes = () => {
    let bytes = 0;
    for (const segment of retainedOrder) bytes += storeBufferBytes(segment.store);
    return bytes;
  };

  const evict = () => {
    while (
      retainedOrder.length > retainedSegments ||
      (retainedOrder.length > 1 && totalRetainedBytes() > retainedBytes)
    ) {
      const oldest = retainedOrder.shift();
      if (!oldest) break;
      retained.delete(oldest.header.segmentId);
      releaseStore(oldest.store);
      segmentsRetired += 1;
    }
  };

  const summarize = (segment: RetainedSegment): TickSampleSegmentSummary =>
    Object.freeze({
      segmentId: segment.header.segmentId,
      sessionId: segment.header.sessionId,
      worldEpoch: segment.header.worldEpoch,
      vehicleId: segment.header.vehicleId,
      classId: segment.header.classId,
      classVersion: VEHICLE_CLASS_VERSION,
      controlMode: segment.header.controlMode,
      profileId: segment.header.profileId,
      baseVersionId: segment.header.baseVersionId,
      learningEpoch: segment.header.learningEpoch,
      learningEligible: segment.header.learningEligible,
      retainedForMetrics: true as const,
      inputType: segment.header.inputType,
      capabilities: segment.capabilities,
      startTick: segment.header.startTick,
      endTick: segment.endTick,
      closeReason: segment.closeReason,
      completeness: segment.completeness,
      sampleCount: segment.store.count,
      capacity: segment.store.capacity,
      overflowPolicy: segment.store.overflowPolicy,
      overwrittenSamples: segment.store.overwrittenSamples,
      rejectedSamples: segment.store.rejectedSamples,
      identityCount: segment.store.identityList.length - 1,
      identityOverflow: segment.store.identityOverflow,
      bufferBytes: storeBufferBytes(segment.store),
      identityCodeUnits: storeIdentityCodeUnits(segment.store),
    });

  const closeActive = (reason: TickSampleCloseReason) => {
    const segment = active;
    if (!segment) return;
    active = null;
    segment.endTick = segment.store.lastTick ?? segment.header.startTick;
    segment.closeReason = reason;
    segment.completeness = 'CLOSED';
    segmentsClosed += 1;
    retained.set(segment.header.segmentId, segment);
    retainedOrder.push(segment);
    evict();
  };

  const lookup = (id: string): RetainedSegment | undefined =>
    active?.header.segmentId === id ? active : retained.get(id);

  return Object.freeze({
    version: TICK_SAMPLE_VERSION,
    openSegment(input: TickSampleSegmentInput, closeReason: TickSampleCloseReason = 'MODE_CHANGE') {
      alive();
      const header = validateSegmentInput(input);
      choice(closeReason, segmentCloseReasons);
      closeActive(closeReason);
      requireContract(!retained.has(header.segmentId), 'Duplicate tick sample segment id');
      active = {
        header,
        store: createStore(capacity, overflowPolicy, identitiesPerSegment),
        capabilities: mechanicalCapabilities(header.classId),
        endTick: null,
        closeReason: null,
        completeness: 'OPEN',
      };
      segmentsOpened += 1;
    },
    record(frame: TickSampleFrame): number {
      alive();
      const segment = active;
      if (!segment) {
        samplesRejectedAfterClose += 1;
        return -1;
      }
      const data = plainObject(frame, 'Tick sample frame');
      requireContract(
        Object.keys(data).length === frameKeys.length && frameKeys.every((key) => key in data),
        'Tick sample frame has missing or unknown fields',
      );
      const at = readTick(data.tick);
      requireContract(
        segment.store.lastTick === null || at > segment.store.lastTick,
        'Tick samples must increase monotonically',
      );
      requireContract(at >= segment.header.startTick, 'Tick sample precedes segment start');
      const state = plainObject(data.state, 'Tick sample state') as unknown as VehicleState;
      const command = plainObject(data.command, 'Tick sample command') as unknown as VehicleCommand;
      const raw = plainObject(data.raw, 'Tick sample raw input') as unknown as TickSampleRawInput;
      const physics = plainObject(
        data.physics,
        'Tick sample physics',
      ) as unknown as TickSamplePhysics;
      requireContract(
        state.tick === at && command.tick === at,
        'Tick sample state/command tick mismatch',
      );
      requireContract(
        state.vehicleId === segment.header.vehicleId &&
          command.vehicleId === segment.header.vehicleId &&
          state.classId === segment.header.classId,
        'Tick sample does not belong to the open segment identity',
      );
      requireContract(
        state.controlMode === segment.header.controlMode &&
          state.appliedProfileVersion === segment.header.baseVersionId &&
          state.sessionId === segment.header.sessionId &&
          state.worldEpoch === segment.header.worldEpoch &&
          command.sessionId === segment.header.sessionId &&
          command.worldEpoch === segment.header.worldEpoch,
        'Tick sample world/mode/profile differs from the frozen segment header',
      );
      requireContract(
        (segment.header.controlMode === 'AUTO') === (command.source === 'AUTONOMY'),
        'Tick sample command source does not match the frozen control mode',
      );
      requireContract(
        finite(raw.throttle, 0, 1) === raw.throttle &&
          finite(raw.brake, 0, 1) === raw.brake &&
          finite(raw.steering, -1, 1) === raw.steering &&
          typeof raw.handbrake === 'boolean',
        'Tick sample raw input is not finite and in range',
      );
      requireContract(
        finite(command.throttle, 0, 1) === command.throttle &&
          finite(command.brake, 0, 1) === command.brake &&
          finite(command.steering, -1, 1) === command.steering &&
          typeof command.handbrake === 'boolean' &&
          choice(command.turnSignal, turnSignalValues) === command.turnSignal &&
          choice(command.source, commandSourceValues) === command.source,
        'Tick sample command is not finite and in range',
      );
      requireContract(
        finite(physics.longitudinalAccelerationMps2, -100, 100) ===
          physics.longitudinalAccelerationMps2 &&
          finite(physics.lateralAccelerationMps2, -100, 100) === physics.lateralAccelerationMps2,
        'Tick sample physics is not finite SI',
      );
      const lane = data.lane === null ? null : plainObject(data.lane, 'Tick sample lane context');
      if (lane) {
        const laneId = identity(lane.laneId);
        requireContract(
          state.laneId === laneId && finite(lane.speedLimitMps, 0, 200) === lane.speedLimitMps,
          'Tick sample lane context contradicts the authoritative state',
        );
      } else {
        requireContract(state.laneId === null, 'Tick sample omits the authoritative lane');
      }
      const signal =
        data.signal === null ? null : plainObject(data.signal, 'Tick sample signal context');
      if (signal) {
        identity(signal.signalId);
        choice(signal.state, tickSampleSignalStates);
      }
      if (segment.store.lastTick !== null && at !== segment.store.lastTick + 1) tickGaps += 1;
      segment.store.lastTick = at;
      const written = writeRow(segment.store, {
        tick: at,
        state,
        raw,
        command,
        physics,
        lane: lane === null ? null : (lane as unknown as TickSampleLaneContext),
        signal: signal === null ? null : (signal as unknown as TickSampleSignalContext),
      });
      if (written >= 0) samplesRecorded += 1;
      return written;
    },
    closeSegment(reason: TickSampleCloseReason) {
      alive();
      choice(reason, segmentCloseReasons);
      requireContract(active !== null, 'No open tick sample segment to close');
      closeActive(reason);
    },
    getSegments() {
      const all = [...retainedOrder, ...(active ? [active] : [])];
      return Object.freeze(all.map(summarize));
    },
    getSegment(segmentId: string) {
      const id = identity(segmentId);
      const segment = lookup(id);
      return segment ? summarize(segment) : null;
    },
    readSample(segmentId: string, index: number): TickSampleReadout {
      alive();
      const segment = lookup(identity(segmentId));
      requireContract(segment !== undefined, 'Unknown tick sample segment');
      const at = readTick(index);
      requireContract(at < segment.store.count, 'Tick sample index out of range');
      return Object.freeze({
        segmentId: segment.header.segmentId,
        controlMode: segment.header.controlMode,
        profileId: segment.header.profileId,
        learningEpoch: segment.header.learningEpoch,
        learningEligible: segment.header.learningEligible,
        observation: observation(segment, segment.store, at),
      });
    },
    releaseSegment(segmentId: string) {
      alive();
      const id = identity(segmentId);
      requireContract(
        active === null || active.header.segmentId !== id,
        'Cannot release the open tick sample segment',
      );
      const segment = retained.get(id);
      if (!segment) return false;
      retained.delete(id);
      const position = retainedOrder.indexOf(segment);
      if (position >= 0) retainedOrder.splice(position, 1);
      releaseStore(segment.store);
      return true;
    },
    getStats(): TickSampleRecorderStats {
      let bufferBytes = 0;
      let identityCodeUnits = 0;
      let samplesRetained = 0;
      let overwritten = 0;
      let rejected = 0;
      let identityOverflow = 0;
      for (const segment of [...retainedOrder, ...(active ? [active] : [])]) {
        bufferBytes += storeBufferBytes(segment.store);
        identityCodeUnits += storeIdentityCodeUnits(segment.store);
        samplesRetained += segment.store.count;
        overwritten += segment.store.overwrittenSamples;
        rejected += segment.store.rejectedSamples;
        identityOverflow += segment.store.identityOverflow;
      }
      return Object.freeze({
        version: TICK_SAMPLE_VERSION,
        disposed,
        capacity,
        overflowPolicy,
        retainedSegmentsMaximum: retainedSegments,
        retainedBytesMaximum: retainedBytes,
        segmentsOpened,
        segmentsClosed,
        segmentsRetired,
        samplesRecorded,
        samplesRejectedAfterClose,
        tickGaps,
        segmentsRetained: retainedOrder.length,
        samplesRetained,
        samplesOverwritten: overwritten,
        samplesRejected: rejected,
        identityOverflow,
        bufferBytes,
        identityCodeUnits,
        retainedBytes: bufferBytes,
      });
    },
    dispose() {
      if (disposed) return;
      for (const segment of retainedOrder) releaseStore(segment.store);
      retainedOrder.length = 0;
      retained.clear();
      if (active) releaseStore(active.store);
      active = null;
      disposed = true;
    },
  });
}
