import {
  createStableId,
  requireContract,
  tick as readTick,
  type ContractContext,
} from '../sessions';
import { createEventBus, parseSimulationEvent, type SimulationEvent } from '../simulation';
import { controlModes, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId, VehicleCommand, VehicleState } from '../vehicles';
import {
  createSignalController,
  type LaneGraph,
  type MovementSignal,
  type RoadMap,
  type SignalController,
  type StopLine,
} from '../world';
import {
  createArtifactFilter,
  type ArtifactCollisionFact,
  type ArtifactObservationLossFact,
  type ArtifactRecoveryFact,
  type ArtifactSuspensionFact,
  type ArtifactFilter,
  type FilteredWindowRecord,
} from './artifact-filter';
import {
  createOpportunityRegistry,
  type OpportunityKind,
  type OpportunityRecord,
  type OpportunityRegistry,
} from './opportunities';
import {
  createEligibilityWindows,
  greenExitBlockedByQueue,
  type EligibilityCameraPose,
  type EligibilityGreenExitFact,
  type EligibilityImpactFact,
  type EligibilityLeaderFact,
  type EligibilityMechanicalDemand,
  type EligibilitySignalFact,
  type EligibilitySuspension,
  type EligibilityWindowObservation,
  type EligibilityWindowRecord,
  type EligibilityWindows,
} from './eligibility-windows';
import { mechanicalCapabilities, createTickSampleRecorder } from './tick-samples';
import type { TickSampleFrame, TickSampleRecorder, TickSampleSegmentSummary } from './tick-samples';
import { segmentCloseReasons } from './contracts';

/**
 * 272 live telemetry writer: the live player segment (069) plus the whole live fleet, composed from
 * the already authoritative 085/086/087/088 owners.
 *
 * The module owns no clock, renderer, DOM or physics. Every fixed tick is supplied by the live
 * composition:
 *   - 085 records the player's 60 Hz raw input, filtered command, speed, lane, signal and class;
 *   - a bounded columnar world ring records the same authoritative facts for every taxi and civilian,
 *     independent of camera, selection or authority;
 *   - 086 opportunities are opened from the real live context (stop line, signal movement, lane
 *     change) and from the real follower/leader context attached to them;
 *   - 087 classifies the opportunity windows with the real suspension, leader, signal, queue and
 *     mechanical facts; MANUAL/AUTO are excluded by construction and the camera cone is used only
 *     for the player's own observable stimuli;
 *   - 088 is evaluated at suspension, focus loss, recovery/teleport and segment close, so a pause
 *     never becomes a slow reaction and an impact prefix stays usable.
 *
 * Deduplication uses `opportunity.id + opportunity.occurrence`, never frames. The hot path writes
 * preallocated typed arrays and performs no JSON serialization; 086's own stable identity keys are
 * reached only when a real context changes. Nothing here estimates a style, creates a job, publishes
 * a profile or writes an XP ledger.
 */

export const LIVE_TELEMETRY_VERSION = '272-live-telemetry-v1' as const;
export const LIVE_TELEMETRY_TICK_HZ = 60 as const;
/** `Docs/performance-budgets.json` `proposedCapacities.recorderRamBytes`. */
export const LIVE_TELEMETRY_RAM_BUDGET_BYTES = 33_554_432;

export const LIVE_TELEMETRY_CAPACITY = Object.freeze({
  /** One global ring row per vehicle per tick; 65 536 rows is ~20 s of a 56-vehicle live fleet. */
  worldSamples: 65_536,
  worldSamplesMinimum: 1_024,
  worldSamplesMaximum: 262_144,
  dedupeEntries: 4_096,
});

export const LIVE_TELEMETRY_POLICY = Object.freeze({
  contract: LIVE_TELEMETRY_VERSION,
  tickHz: LIVE_TELEMETRY_TICK_HZ,
  /** Real lane-graph horizon at which a stop line/signal becomes an approach. */
  approachDistanceM: 35,
  /** A leader is attached to the window only when the real gap is inside this horizon. */
  leaderMaxGapM: 60,
  /** The player's camera cone is conservative; this is the only visibility source for LEARNING. */
  stimulusApproachM: 50,
  /** A full stop is observed within this distance of the stop line. */
  fullStopDistanceM: 3,
  /** A neighbour lane must remain the target for this long before a change counts as completed. */
  laneChangeCompleteTicks: 45,
  /** A physical vehicle length; only used to turn a longitudinal difference into a real gap. */
  vehicleLengthM: 4.5,
  /** Reaction is a real command above this magnitude, never a synthetic zero. */
  reactionCommandThreshold: 0.02,
});

export type LiveTelemetrySuspensionCause = 'PAUSE' | 'FOCUS_LOST';

export interface LiveTelemetryRawInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
}

export interface LiveTelemetryCommandInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
  readonly turnSignal: VehicleCommand['turnSignal'];
  readonly source: VehicleCommand['source'];
}

export interface LiveTelemetryVehicleTick {
  readonly tick: number;
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  /** Stable incarnation token; a recover/spawn creates a new one and therefore a new opportunity. */
  readonly incarnation?: string;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly laneId: string | null;
  readonly speedLimitMps: number;
  readonly appliedProfileVersion: string;
  readonly maneuverState: VehicleState['maneuverState'];
  /** The actual raw intent when the caller has it (player keyboard/gamepad); derived otherwise. */
  readonly raw?: LiveTelemetryRawInput;
  /** The actual filtered command when the caller has it (player or AI controller). */
  readonly command?: LiveTelemetryCommandInput;
}

export interface LiveTelemetryTickInput {
  readonly tick: number;
  readonly vehicles: readonly LiveTelemetryVehicleTick[];
  /** The real 017 camera pose; used only to test the player's own stimulus observability. */
  readonly camera?: EligibilityCameraPose | null;
  readonly collisions?: readonly ArtifactCollisionFact[];
}

export interface LiveTelemetrySegmentInput {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly learningEligible: boolean;
  readonly inputType: 'KEYBOARD' | 'GAMEPAD';
  readonly startTick: number;
}

export interface LiveTelemetrySuspensionInput {
  readonly tick: number;
  readonly cause: LiveTelemetrySuspensionCause;
}

export interface LiveTelemetryRecoveryInput {
  readonly tick: number;
  readonly vehicleId: string;
  readonly operationId: string;
  readonly status: 'ADMITTED' | 'DENIED' | 'PARTIAL' | 'COMPLETED';
  readonly pointId: string;
  readonly mapId: string;
  readonly laneId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly validatedTick: number;
}

export interface LiveWorldSample {
  readonly tick: number;
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly rawInput: LiveTelemetryRawInput;
  readonly command: LiveTelemetryCommandInput;
  readonly laneId: string | null;
  readonly speedLimitMps: number | null;
  readonly signal: Readonly<{ signalId: string; state: 'RED' | 'YELLOW' | 'GREEN' }> | null;
  readonly leaderId: string | null;
  readonly leaderGapM: number | null;
}

export interface LiveTelemetryFollowEpisode {
  readonly episodeId: string;
  readonly vehicleId: string;
  readonly leaderId: string;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly observations: number;
  readonly minGapM: number;
  readonly maxGapM: number;
}

export interface LiveTelemetrySegmentSummary {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly learningEpoch: number;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly inputType: 'KEYBOARD' | 'GAMEPAD' | 'AUTONOMY';
  readonly startTick: number;
  readonly endTick: number | null;
  readonly closeReason: string | null;
  readonly completeness: 'OPEN' | 'CLOSED';
  readonly samples: number;
  readonly sampleBytes: number;
  readonly opportunities: number;
  readonly eligibleWindows: number;
  readonly artifacts: number;
  readonly samplesAvailable: boolean;
}

export interface LiveTelemetrySegmentRead {
  readonly summary: LiveTelemetrySegmentSummary;
  readonly samples: readonly ReturnType<TickSampleRecorder['readSample']>[];
  readonly opportunities: readonly OpportunityRecord[];
  readonly windows: readonly EligibilityWindowRecord[];
  readonly artifactWindow: FilteredWindowRecord | null;
  readonly eligibleOccurrences: number;
  readonly demonstrations: 0;
  readonly profilePublications: 0;
}

export interface LiveTelemetryEvidenceView {
  readonly version: typeof LIVE_TELEMETRY_VERSION;
  readonly uniqueOccurrences: number;
  readonly duplicateObservations: number;
  readonly dedupeDropped: number;
  readonly byKind: Readonly<Record<OpportunityKind, number>>;
  readonly eligibleWindows: number;
  readonly excludedWindows: number;
  readonly externalConstraintWindows: number;
  readonly manual: Readonly<{ samples: number; learningEligible: false; demonstrations: 0 }>;
  readonly auto: Readonly<{ opportunities: number; demonstrations: 0 }>;
  readonly followEpisodes: number;
  readonly profilePublications: 0;
  readonly learningJobs: 0;
}

export interface LiveTelemetryReadModel {
  readonly version: typeof LIVE_TELEMETRY_VERSION;
  readonly tick: number;
  readonly disposed: boolean;
  readonly activeSegment: LiveTelemetrySegmentSummary | null;
  readonly closedSegments: readonly LiveTelemetrySegmentSummary[];
  readonly opportunities: readonly OpportunityRecord[];
  readonly windows: readonly EligibilityWindowRecord[];
  readonly evidence: LiveTelemetryEvidenceView;
  readonly profile: Readonly<{
    playerId: string;
    profileId: string | null;
    baseVersionId: string | null;
  }>;
  readonly learning: Readonly<{
    workspace: 'TELEMETRY_272';
    eligible: boolean;
    closedSegments: number;
    profilePublications: 0;
    jobs: 0;
  }>;
}

export interface LiveTelemetryMemory {
  readonly tickSamplesBytes: number;
  readonly worldBufferBytes: number;
  readonly worldIdentityBytes: number;
  readonly opportunitiesBytes: number;
  readonly eligibilityBytes: number;
  readonly artifactsBytes: number;
  readonly totalBytes: number;
  readonly budgetBytes: number;
  readonly withinBudget: boolean;
}

export interface LiveTelemetryStats {
  readonly version: typeof LIVE_TELEMETRY_VERSION;
  readonly disposed: boolean;
  readonly tick: number;
  readonly vehiclesObserved: number;
  readonly samplesRecorded: number;
  readonly samplesRejected: number;
  readonly lastSampleError: string | null;
  readonly sampleGaps: number;
  readonly worldSamplesWritten: number;
  readonly worldSamplesDropped: number;
  readonly worldSamplesRetained: number;
  readonly worldCapacity: number;
  readonly worldRingWrites: number;
  readonly segmentsOpened: number;
  readonly segmentsClosed: number;
  readonly opportunityObservations: number;
  readonly uniqueOccurrences: number;
  readonly duplicateObservations: number;
  readonly dedupeDropped: number;
  readonly followEpisodes: number;
  readonly suspensions: number;
  readonly recoveries: number;
  readonly collisions: number;
  readonly signalResets: number;
  readonly memory: LiveTelemetryMemory;
}

export interface LiveTelemetryWorldQuery {
  readonly vehicleId?: string;
  readonly fromTick?: number;
  readonly toTick?: number;
  readonly limit?: number;
}

export interface LiveTelemetryOptions {
  readonly context: ContractContext;
  readonly playerId: string;
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly playerVehicleId?: () => string | null;
  readonly capacity?: number;
  readonly retainedSegments?: number;
  readonly worldCapacity?: number;
  readonly maxOpportunities?: number;
  readonly maxWindows?: number;
  readonly maxArtifactWindows?: number;
  readonly dedupeEntries?: number;
  readonly approachDistanceM?: number;
  readonly leaderMaxGapM?: number;
  readonly laneChangeCompleteTicks?: number;
}

export interface LiveTelemetry {
  readonly version: typeof LIVE_TELEMETRY_VERSION;
  openSegment(input: LiveTelemetrySegmentInput): void;
  closeSegment(reason: (typeof segmentCloseReasons)[number]): boolean;
  step(input: LiveTelemetryTickInput): void;
  noteSuspension(input: LiveTelemetrySuspensionInput): void;
  noteResume(tick: number): void;
  noteRecovery(input: LiveTelemetryRecoveryInput): void;
  read(): LiveTelemetryReadModel;
  readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null;
  readWorldSamples(query?: LiveTelemetryWorldQuery): readonly LiveWorldSample[];
  readFollowEpisodes(): readonly LiveTelemetryFollowEpisode[];
  getStats(): LiveTelemetryStats;
  dispose(): void;
}

type CloseReason = (typeof segmentCloseReasons)[number];

const classIds = ['sedan', 'compact'] as const;
const driverKinds = ['TAXI', 'CIVILIAN'] as const;
const signalStates = ['RED', 'YELLOW', 'GREEN'] as const;
const suspendCauses = ['PAUSE', 'FOCUS_LOST'] as const;

interface StopContext {
  readonly stopLine: StopLine;
  readonly longitudinalM: number | null;
  readonly stopLineId: string;
}

interface SignalLaneContext {
  readonly signalId: string;
  readonly intersectionId: string;
  readonly movementId: string;
  readonly lineId: string | null;
  readonly lineLongitudinalM: number | null;
  readonly linePositionM: Readonly<{ x: number; y: number; z: number }> | null;
}

interface TickProjection {
  readonly vehicle: LiveTelemetryVehicleTick;
  readonly longitudinalM: number | null;
  readonly laneLengthM: number | null;
  readonly headingRad: number | null;
}

interface DerivedPhysics {
  readonly longitudinalAccelerationMps2: number;
  readonly lateralAccelerationMps2: number;
  readonly speedMps: number;
}

interface PreviousVehicle {
  readonly speedMps: number;
  readonly yawRad: number;
  readonly laneId: string | null;
  readonly signalId: string | null;
  readonly longitudinalM: number | null;
  readonly speedLimitMps: number;
}

interface StopTracker {
  readonly stopLineId: string;
  readonly opportunityId: string;
  fullStop: boolean;
  crossed: boolean;
  lastDistanceM: number;
}

interface SignalTracker {
  readonly signalId: string;
  readonly phaseStartedTick: number;
  lastDistanceM: number;
  held: boolean;
}

interface LaneChangeTracker {
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly sourceKey: string;
  readonly startTick: number;
  opportunityId: string | null;
}

interface FollowEpisode {
  readonly episodeId: string;
  readonly vehicleId: string;
  readonly leaderId: string;
  readonly startTick: number;
  endTick: number | null;
  observations: number;
  minGapM: number;
  maxGapM: number;
}

interface MutableSuspensionFact {
  readonly fromTick: number;
  toTick: number | null;
  readonly cause: ArtifactSuspensionFact['cause'];
}

interface SegmentRuntime {
  readonly input: LiveTelemetrySegmentInput;
  readonly incarnation: string;
  readonly collisions: ArtifactCollisionFact[];
  readonly recoveries: ArtifactRecoveryFact[];
  readonly suspensions: MutableSuspensionFact[];
  openSuspension: MutableSuspensionFact | null;
  observationLoss: ArtifactObservationLossFact | null;
  lastSampleTick: number;
}

const choiceValue = <const T extends readonly string[]>(value: unknown, options: T): T[number] => {
  requireContract(
    typeof value === 'string' && (options as readonly string[]).includes(value),
    `Live telemetry value must be one of ${options.join(', ')}`,
  );
  return value as T[number];
};

const finite = (value: unknown, minimum: number, maximum: number): number => {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    'Live telemetry number out of range',
  );
  return value;
};

const identity = (value: unknown, maximum = 256): string => {
  requireContract(
    typeof value === 'string' && value.trim().length > 0 && value.length <= maximum,
    'Live telemetry identity invalid',
  );
  return value;
};

const signalStateIndex = (state: 'RED' | 'YELLOW' | 'GREEN' | null): number =>
  state === null ? 0 : signalStates.indexOf(state) + 1;
const driverKindIndex = (kind: 'TAXI' | 'CIVILIAN'): number => driverKinds.indexOf(kind);
const classIndex = (classId: VehicleClassId): number => classIds.indexOf(classId);
const modeIndex = (mode: ControlMode): number => controlModes.indexOf(mode);

function quaternionFromYaw(yawRad: number): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const half = yawRad / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** Derives the effective normalized command from authoritative state changes for an AI actor. */
function deriveRawAndCommand(
  vehicle: LiveTelemetryVehicleTick,
  previous: PreviousVehicle | null,
  dtSeconds: number,
): { raw: LiveTelemetryRawInput; command: LiveTelemetryCommandInput } {
  const capability = mechanicalCapabilities(vehicle.classId);
  const dt = 1 / LIVE_TELEMETRY_TICK_HZ;
  if (previous === null)
    return {
      raw: { throttle: 0, brake: 0, steering: 0, handbrake: false },
      command: {
        throttle: 0,
        brake: 0,
        steering: 0,
        handbrake: false,
        turnSignal: 'OFF',
        source: vehicle.controlMode === 'AUTO' ? 'AUTONOMY' : 'PLAYER',
      },
    };
  const acceleration = (vehicle.speedMps - previous.speedMps) / Math.max(dt, 1e-9);
  const throttle = Math.min(1, Math.max(0, acceleration / capability.maxAccelerationMps2));
  const brake = Math.min(1, Math.max(0, -acceleration / capability.maxDecelerationMps2));
  let deltaYaw = vehicle.yawRad - previous.yawRad;
  while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
  while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
  const yawRate = deltaYaw / Math.max(dt, 1e-9);
  const steering = Math.min(
    1,
    Math.max(-1, (yawRate * vehicleClass(vehicle.classId).wheels.wheelbaseM) / 2.4),
  );
  const source = vehicle.controlMode === 'AUTO' ? 'AUTONOMY' : 'PLAYER';
  const command: LiveTelemetryCommandInput = {
    throttle,
    brake,
    steering,
    handbrake: false,
    turnSignal: 'OFF',
    source,
  };
  return { raw: { throttle, brake, steering, handbrake: false }, command };
  // `dtSeconds` is retained for callers that already know the fixed step; it must agree with 60 Hz.
  void dtSeconds;
}

function createWorldRing(capacity: number) {
  const floats = () => new Float32Array(capacity);
  return {
    capacity,
    count: 0,
    head: 0,
    next: 0,
    dropped: 0,
    writes: 0,
    tick: new Float64Array(capacity),
    vehicle: new Uint32Array(capacity),
    driverKind: new Uint8Array(capacity),
    classId: new Uint8Array(capacity),
    controlMode: new Uint8Array(capacity),
    speedMps: floats(),
    yawRad: floats(),
    positionX: floats(),
    positionY: floats(),
    positionZ: floats(),
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
    laneId: new Uint32Array(capacity),
    speedLimitMps: floats(),
    signalId: new Uint32Array(capacity),
    signalState: new Uint8Array(capacity),
    leaderId: new Uint32Array(capacity),
    leaderGapM: floats(),
    identities: new Map<string, number>(),
    identityList: [''] as string[],
  };
}

type WorldRing = ReturnType<typeof createWorldRing>;

const turnSignals = ['OFF', 'LEFT', 'RIGHT', 'HAZARD'] as const;
const commandSources = ['AUTONOMY', 'PLAYER'] as const;

function internWorldIdentity(ring: WorldRing, value: string | null): number {
  if (value === null) return 0;
  const existing = ring.identities.get(value);
  if (existing !== undefined) return existing;
  if (ring.identityList.length > 4096) return 0;
  const index = ring.identityList.length;
  ring.identityList.push(value);
  ring.identities.set(value, index);
  return index;
}

function worldIdentityAt(ring: WorldRing, index: number): string | null {
  return index === 0 ? null : (ring.identityList[index] ?? null);
}

function worldBufferBytes(ring: WorldRing): number {
  return (
    ring.tick.byteLength +
    ring.vehicle.byteLength +
    ring.driverKind.byteLength +
    ring.classId.byteLength +
    ring.controlMode.byteLength +
    ring.speedMps.byteLength +
    ring.yawRad.byteLength +
    ring.positionX.byteLength +
    ring.positionY.byteLength +
    ring.positionZ.byteLength +
    ring.rawThrottle.byteLength +
    ring.rawBrake.byteLength +
    ring.rawSteering.byteLength +
    ring.rawHandbrake.byteLength +
    ring.commandThrottle.byteLength +
    ring.commandBrake.byteLength +
    ring.commandSteering.byteLength +
    ring.commandHandbrake.byteLength +
    ring.commandTurnSignal.byteLength +
    ring.commandSource.byteLength +
    ring.laneId.byteLength +
    ring.speedLimitMps.byteLength +
    ring.signalId.byteLength +
    ring.signalState.byteLength +
    ring.leaderId.byteLength +
    ring.leaderGapM.byteLength
  );
}

function worldIdentityBytes(ring: WorldRing): number {
  let units = 0;
  for (const value of ring.identityList) units += value.length;
  return units * 2;
}

function writeWorldRow(
  ring: WorldRing,
  input: {
    tick: number;
    vehicle: LiveTelemetryVehicleTick;
    raw: LiveTelemetryRawInput;
    command: LiveTelemetryCommandInput;
    signal: { signalId: string; state: 'RED' | 'YELLOW' | 'GREEN' } | null;
    leaderId: string | null;
    leaderGapM: number | null;
  },
): void {
  let slot: number;
  if (ring.count < ring.capacity) {
    slot = ring.next;
    ring.count += 1;
  } else {
    slot = ring.next;
    ring.head = (ring.head + 1) % ring.capacity;
    ring.dropped += 1;
  }
  ring.next = (slot + 1) % ring.capacity;
  const { vehicle, raw, command, signal } = input;
  ring.tick[slot] = input.tick;
  ring.vehicle[slot] = internWorldIdentity(ring, vehicle.vehicleId);
  ring.driverKind[slot] = driverKindIndex(vehicle.driverKind);
  ring.classId[slot] = classIndex(vehicle.classId);
  ring.controlMode[slot] = modeIndex(vehicle.controlMode);
  ring.speedMps[slot] = vehicle.speedMps;
  ring.yawRad[slot] = vehicle.yawRad;
  ring.positionX[slot] = vehicle.positionM.x;
  ring.positionY[slot] = vehicle.positionM.y;
  ring.positionZ[slot] = vehicle.positionM.z;
  ring.rawThrottle[slot] = raw.throttle;
  ring.rawBrake[slot] = raw.brake;
  ring.rawSteering[slot] = raw.steering;
  ring.rawHandbrake[slot] = raw.handbrake ? 1 : 0;
  ring.commandThrottle[slot] = command.throttle;
  ring.commandBrake[slot] = command.brake;
  ring.commandSteering[slot] = command.steering;
  ring.commandHandbrake[slot] = command.handbrake ? 1 : 0;
  ring.commandTurnSignal[slot] = turnSignals.indexOf(command.turnSignal);
  ring.commandSource[slot] = commandSources.indexOf(command.source);
  ring.laneId[slot] = internWorldIdentity(ring, vehicle.laneId);
  ring.speedLimitMps[slot] = vehicle.laneId === null ? -1 : vehicle.speedLimitMps;
  ring.signalId[slot] = internWorldIdentity(ring, signal?.signalId ?? null);
  ring.signalState[slot] = signalStateIndex(signal?.state ?? null);
  ring.leaderId[slot] = internWorldIdentity(ring, input.leaderId);
  ring.leaderGapM[slot] = input.leaderGapM ?? -1;
  ring.writes += 1;
}

interface SignalConclusion {
  readonly kind: 'RED' | 'GREEN';
  readonly outcome: 'HELD' | 'CROSSED' | 'RELEASED';
}

export function createLiveTelemetry(options: LiveTelemetryOptions): LiveTelemetry {
  requireContract(
    options !== null && typeof options === 'object',
    'Live telemetry requires explicit options',
  );
  const context: ContractContext = Object.freeze({
    schemaVersion: options.context.schemaVersion,
    units: options.context.units,
    sessionId: identity(options.context.sessionId),
    worldEpoch: readTick(options.context.worldEpoch),
  });
  // Player identity is part of the frozen segment provenance, not a second mode store.
  const playerId = identity(options.playerId);
  if (playerId.length === 0) throw new Error('Live telemetry player id is required');
  const map = options.map;
  const graph = options.graph;
  requireContract(
    map !== null && typeof map === 'object' && typeof map.mapId === 'string',
    'Live telemetry requires the authoritative road map',
  );
  requireContract(
    graph !== null && typeof graph === 'object' && typeof graph.projectOnLane === 'function',
    'Live telemetry requires the authoritative lane graph',
  );
  const approachDistanceM = finite(
    options.approachDistanceM ?? LIVE_TELEMETRY_POLICY.approachDistanceM,
    1,
    200,
  );
  const leaderMaxGapM = finite(
    options.leaderMaxGapM ?? LIVE_TELEMETRY_POLICY.leaderMaxGapM,
    1,
    200,
  );
  const laneChangeCompleteTicks = Math.floor(
    finite(
      options.laneChangeCompleteTicks ?? LIVE_TELEMETRY_POLICY.laneChangeCompleteTicks,
      1,
      600,
    ),
  );
  const worldCapacity = Math.floor(
    finite(
      options.worldCapacity ?? LIVE_TELEMETRY_CAPACITY.worldSamples,
      LIVE_TELEMETRY_CAPACITY.worldSamplesMinimum,
      LIVE_TELEMETRY_CAPACITY.worldSamplesMaximum,
    ),
  );
  const dedupeEntries = Math.floor(
    finite(options.dedupeEntries ?? LIVE_TELEMETRY_CAPACITY.dedupeEntries, 64, 65_536),
  );

  const recorder = createTickSampleRecorder({
    ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
    ...(options.retainedSegments === undefined
      ? {}
      : { retainedSegments: options.retainedSegments }),
  });
  const registry: OpportunityRegistry = createOpportunityRegistry({
    ...(options.maxOpportunities === undefined
      ? {}
      : { maxOpportunities: options.maxOpportunities }),
  });
  const windows: EligibilityWindows = createEligibilityWindows({
    ...(options.maxWindows === undefined ? {} : { maxWindows: options.maxWindows }),
  });
  const artifacts: ArtifactFilter = createArtifactFilter({
    ...(options.maxArtifactWindows === undefined ? {} : { maxWindows: options.maxArtifactWindows }),
  });
  const ring = createWorldRing(worldCapacity);

  const eventBus = createEventBus({
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
  });
  let signalController: SignalController | null = null;
  let signalTick = -1;
  let signalResets = 0;

  // Real map context; all values are derived once from the authoritative 032/033 owners.
  const stopByLane = new Map<string, StopContext>();
  const signalByLane = new Map<string, SignalLaneContext>();
  const nodeById = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  for (const lane of map.lanes) {
    const lines = map.stopLines.filter((line) => line.laneId === lane.id);
    const stop = lines.find((line) => line.kind === 'STOP') ?? null;
    if (stop !== null) {
      const position = nodeById.get(stop.anchorNodeId) ?? null;
      const projection =
        position === null
          ? null
          : graph.projectOnLane(lane.id, {
              positionM: position,
              access: lane.access[0] ?? 'CIVIL',
            });
      stopByLane.set(
        lane.id,
        Object.freeze({
          stopLine: stop,
          longitudinalM: projection?.longitudinalM ?? null,
          stopLineId: stop.id,
        }),
      );
    }
    const signalLine = lines.find((line) => line.kind === 'SIGNAL') ?? null;
    if (signalLine !== null && signalLine.intersectionId !== null && signalLine.signalId !== null) {
      const intersection = map.intersections.find(
        (candidate) => candidate.id === signalLine.intersectionId,
      );
      const movement = intersection?.movements.find(
        (candidate) => candidate.fromLaneId === lane.id,
      );
      if (movement !== undefined) {
        const position = nodeById.get(signalLine.anchorNodeId) ?? null;
        const projection =
          position === null
            ? null
            : graph.projectOnLane(lane.id, {
                positionM: position,
                access: lane.access[0] ?? 'CIVIL',
              });
        signalByLane.set(
          lane.id,
          Object.freeze({
            signalId: signalLine.signalId,
            intersectionId: signalLine.intersectionId,
            movementId: movement.id,
            lineId: signalLine.id,
            lineLongitudinalM: projection?.longitudinalM ?? null,
            linePositionM: position === null ? null : Object.freeze({ ...position }),
          }),
        );
      }
    }
  }

  let disposed = false;
  let tick = 0;
  let lastTick: number | null = null;
  let active: SegmentRuntime | null = null;
  let samplesRecorded = 0;
  let samplesRejected = 0;
  let lastSampleError: string | null = null;
  let sampleGaps = 0;
  let segmentsOpened = 0;
  let segmentsClosed = 0;
  let opportunityObservations = 0;
  let suspensions = 0;
  let recoveries = 0;
  let collisions = 0;
  const previous = new Map<string, PreviousVehicle>();
  const previousContext = new Map<string, string>();
  const stopTrackers = new Map<string, StopTracker>();
  const signalTrackers = new Map<string, SignalTracker>();
  const laneChangeTrackers = new Map<string, LaneChangeTracker>();
  const approachOrdinal = new Map<string, number>();
  const laneChangeOrdinal = new Map<string, number>();
  const enteredByVehicle = new Map<string, Set<string>>();
  const followActive = new Map<string, FollowEpisode>();
  const followEpisodes: FollowEpisode[] = [];
  const pushFollowEpisode = (episode: FollowEpisode): void => {
    followEpisodes.push(episode);
    while (followEpisodes.length > 4096) followEpisodes.shift();
  };
  const lastWindowFact = new Map<string, EligibilityWindowObservation>();
  const seenOccurrences = new Set<string>();
  const occurrenceOrder: string[] = [];
  let duplicateObservations = 0;
  let dedupeDropped = 0;
  const kindObservations: Record<OpportunityKind, number> = {
    STOP: 0,
    RED: 0,
    GREEN: 0,
    YIELD: 0,
    LANE_CHANGE: 0,
  };
  let manualSamples = 0;
  let autoOpportunities = 0;

  const alive = () => requireContract(!disposed, 'Live telemetry disposed');

  const closeSignalController = () => {
    signalController?.dispose();
    signalController = null;
    signalTick = -1;
  };

  const stepSignals = (atTick: number) => {
    if (signalController === null || atTick !== signalTick + 1) {
      if (signalController !== null) {
        signalResets += 1;
        closeSignalController();
      }
      signalController = createSignalController(map, {
        context,
        eventBus,
        initialTick: Math.max(0, atTick - 1),
      });
      signalTick = Math.max(0, atTick - 1);
    }
    signalController.step(atTick);
    signalTick = atTick;
  };

  const signalFactFor = (
    laneContext: SignalLaneContext,
    atTick: number,
  ):
    | (EligibilitySignalFact & {
        readonly phaseId: string;
        readonly phaseStartedTick: number;
      })
    | null => {
    if (signalController === null) return null;
    const movement: MovementSignal | null = signalController.getMovementSignal(
      laneContext.intersectionId,
      laneContext.movementId,
    );
    if (movement === null) return null;
    const snapshot = signalController.getSignal(movement.signalId);
    if (snapshot === null) return null;
    requireContract(snapshot.tick === atTick, 'Live telemetry signal tick mismatch');
    return Object.freeze({
      signalId: movement.signalId,
      intersectionId: movement.intersectionId,
      phaseId: movement.phaseId,
      movementId: movement.movementId,
      state: movement.state,
      phaseStartedTick: snapshot.phaseStartedTick,
    });
  };

  const event = (
    type:
      | 'STOP_APPROACH'
      | 'STOP_LINE_CROSSED'
      | 'FULL_STOP'
      | 'LANE_CHANGE_STARTED'
      | 'LANE_CHANGE_COMPLETED',
    atTick: number,
    vehicleId: string,
    payload: Record<string, string | number>,
    suffix: string,
  ): SimulationEvent =>
    parseSimulationEvent({
      ...context,
      type,
      tick: atTick,
      eventId: createStableId('live-telemetry-event', context.sessionId, [
        String(context.worldEpoch),
        type,
        vehicleId,
        suffix,
        String(atTick),
      ]),
      entityIds: [vehicleId],
      payload,
    });

  const admission = (record: OpportunityRecord): boolean => {
    const key = `${record.id}#${record.occurrence}`;
    if (seenOccurrences.has(key)) {
      duplicateObservations += 1;
      return false;
    }
    if (occurrenceOrder.length >= dedupeEntries) {
      const oldest = occurrenceOrder.shift();
      if (oldest !== undefined) seenOccurrences.delete(oldest);
      dedupeDropped += 1;
    }
    seenOccurrences.add(key);
    occurrenceOrder.push(key);
    kindObservations[record.kind] += 1;
    return true;
  };

  const noteRecord = (
    record: OpportunityRecord,
    vehicleId: string,
    controlMode: ControlMode,
  ): void => {
    if (admission(record) && controlMode === 'AUTO') autoOpportunities += 1;
    const set = enteredByVehicle.get(vehicleId) ?? new Set<string>();
    if (record.state === 'ENTERED') set.add(record.id);
    else set.delete(record.id);
    enteredByVehicle.set(vehicleId, set);
  };

  const removeEntered = (opportunityId: string): void => {
    for (const set of enteredByVehicle.values()) set.delete(opportunityId);
  };

  const windowUpdateSuppressed = (
    record: OpportunityRecord,
    stopDistanceM: number | null,
    signalDistanceM: number | null,
  ): boolean =>
    (record.kind === 'STOP' && stopDistanceM !== null && stopDistanceM < 4) ||
    ((record.kind === 'RED' || record.kind === 'GREEN') &&
      signalDistanceM !== null &&
      signalDistanceM < 4);

  const observeWindow = (
    record: OpportunityRecord,
    vehicle: LiveTelemetryVehicleTick,
    atTick: number,
    facts: {
      physics: DerivedPhysics;
      leader: EligibilityLeaderFact | null;
      signal:
        | (EligibilitySignalFact & {
            readonly phaseId: string;
            readonly phaseStartedTick: number;
          })
        | null;
      stopLineId: string | null;
      stopDistanceM: number | null;
      signalDistanceM: number | null;
      stimulusPositionM: Readonly<{ x: number; y: number; z: number }> | null;
      camera: EligibilityCameraPose | null;
      suspension: EligibilitySuspension;
      impact: EligibilityImpactFact | null;
    },
  ): void => {
    const segment = active;
    const inActiveSegment = segment !== null && segment.input.vehicleId === vehicle.vehicleId;
    const segmentId = inActiveSegment
      ? segment.input.segmentId
      : `live:${String(context.worldEpoch)}:${vehicle.vehicleId}`.slice(0, 256);
    const learningEligible = inActiveSegment && segment.input.learningEligible;
    const controlMode = inActiveSegment ? segment.input.controlMode : vehicle.controlMode;
    const classId = inActiveSegment ? segment.input.classId : vehicle.classId;
    const signal = facts.signal;
    const leader = facts.leader;
    const eligibilitySignal: EligibilitySignalFact | null =
      signal === null
        ? null
        : Object.freeze({
            signalId: signal.signalId,
            intersectionId: signal.intersectionId,
            movementId: signal.movementId,
            state: signal.state,
          });
    const greenExit: EligibilityGreenExitFact | null =
      eligibilitySignal?.state === 'GREEN' && leader !== null
        ? greenExitBlockedByQueue({
            signal: eligibilitySignal,
            leader,
            queueStandstillGapM: 5,
          })
        : null;
    const mechanical: EligibilityMechanicalDemand | null = Object.freeze({
      demandedLongitudinalAccelerationMps2: facts.physics.longitudinalAccelerationMps2,
      demandedLateralAccelerationMps2: facts.physics.lateralAccelerationMps2,
    });
    const stimulusPosition =
      facts.stimulusPositionM ??
      (facts.stopLineId !== null && (facts.stopDistanceM ?? Infinity) <= 50
        ? stopLineAnchorPosition(facts.stopLineId)
        : vehicle.positionM);
    const visibility =
      inActiveSegment && facts.camera !== null
        ? Object.freeze({
            source: 'CAMERA' as const,
            pose: facts.camera,
            stimulusPositionM: Object.freeze({
              x: stimulusPosition.x,
              y: stimulusPosition.y,
              z: stimulusPosition.z,
            }),
            // The live renderer has no occlusion owner yet; the conservative cone remains the only
            // visibility rule and a later occlusion fact can tighten it.
            occluded: false,
          })
        : Object.freeze({
            source: 'CONTROLLED_FIXTURE' as const,
            // A player segment without a camera pose must not be promoted to observable.
            observable: !inActiveSegment,
          });
    const windowInput: EligibilityWindowObservation = Object.freeze({
      tick: atTick,
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      opportunityId: record.id,
      kind: record.kind,
      vehicleId: vehicle.vehicleId,
      incarnation: vehicle.incarnation ?? `${vehicle.vehicleId}:live`,
      segmentId,
      controlMode,
      learningEligible,
      classId,
      suspension: facts.suspension,
      visibility,
      leader,
      signal: eligibilitySignal,
      greenExit,
      mechanical,
      impact: facts.impact,
    });
    lastWindowFact.set(record.id, windowInput);
    if (lastWindowFact.size > 4096) {
      const oldest = lastWindowFact.keys().next().value;
      if (oldest !== undefined) lastWindowFact.delete(oldest);
    }
    windows.observe(windowInput);
  };

  const stopLineAnchorPosition = (stopLineId: string): { x: number; y: number; z: number } => {
    const line = map.stopLines.find((candidate) => candidate.id === stopLineId);
    const node = line === undefined ? undefined : nodeById.get(line.anchorNodeId);
    return node ?? { x: 0, y: 0, z: 0 };
  };

  const currentSegmentSummary = (
    segment: SegmentRuntime | null,
  ): LiveTelemetrySegmentSummary | null => {
    if (segment === null) return null;
    const summary = recorder.getSegment(segment.input.segmentId);
    if (summary === null) return null;
    return Object.freeze({
      segmentId: summary.segmentId,
      vehicleId: summary.vehicleId,
      classId: summary.classId,
      controlMode: summary.controlMode,
      learningEligible: summary.learningEligible,
      learningEpoch: summary.learningEpoch,
      profileId: summary.profileId,
      baseVersionId: summary.baseVersionId,
      inputType: summary.inputType,
      startTick: summary.startTick,
      endTick: summary.endTick,
      closeReason: summary.closeReason,
      completeness: summary.completeness,
      samples: summary.sampleCount,
      sampleBytes: summary.bufferBytes,
      opportunities: registry
        .getOpportunities()
        .filter((record) => record.segmentIds.includes(summary.segmentId)).length,
      eligibleWindows: windows
        .getWindows()
        .filter(
          (window) => window.segmentId === summary.segmentId && window.windowClass === 'ELIGIBLE',
        ).length,
      artifacts: artifacts.getWindow(summary.segmentId)?.artifactCount ?? 0,
      samplesAvailable: summary.sampleCount > 0,
    });
  };

  const closeInternal = (reason: CloseReason, atTick: number): boolean => {
    const segment = active;
    if (segment === null) return false;
    active = null;
    const closeTick = Math.max(atTick, segment.lastSampleTick, segment.input.startTick);
    for (const suspension of segment.suspensions)
      if (suspension.toTick === null) (suspension as { toTick: number | null }).toTick = closeTick;
    segment.openSuspension = null;
    if (segment.observationLoss === null && segment.suspensions.length > 0) {
      // The 088 fact is explicit; a pause is never silently folded into a complete segment.
      const first = segment.suspensions[0];
      if (first !== undefined) {
        const lost = first.toTick === null ? 0 : first.toTick - first.fromTick - 1;
        if (lost > 0)
          segment.observationLoss = Object.freeze({ fromTick: first.fromTick, ticks: lost });
      }
    }
    try {
      registry.closeSegment({ tick: closeTick, segmentId: segment.input.segmentId, reason });
    } catch {
      // The registry is bounded; a segment whose opportunities were already retired closes cleanly.
    }
    try {
      recorder.closeSegment(reason as Parameters<TickSampleRecorder['closeSegment']>[0]);
    } catch {
      // A prior close is idempotent for the live owner.
    }
    try {
      artifacts.evaluate({
        tick: closeTick,
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        segmentId: segment.input.segmentId,
        vehicleId: segment.input.vehicleId,
        incarnation: segment.incarnation,
        controlMode: segment.input.controlMode,
        learningEligible: segment.input.learningEligible,
        startTick: segment.input.startTick,
        endTick: closeTick,
        segmentCompleteness: 'CLOSED',
        closeReason: reason as Parameters<ArtifactFilter['evaluate']>[0]['closeReason'],
        lostCheckpointTick: null,
        observationLoss: segment.observationLoss,
        collisions: Object.freeze([...segment.collisions]),
        recoveries: Object.freeze([...segment.recoveries]),
        suspensions: Object.freeze([...segment.suspensions]),
      });
    } catch {
      // 088 keeps the last valid window; the close itself must not block session retirement.
    }
    segmentsClosed += 1;
    return true;
  };

  const evaluateOpen = (atTick: number): void => {
    const segment = active;
    if (segment === null) return;
    try {
      artifacts.evaluate({
        tick: Math.max(atTick, segment.input.startTick),
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        segmentId: segment.input.segmentId,
        vehicleId: segment.input.vehicleId,
        incarnation: segment.incarnation,
        controlMode: segment.input.controlMode,
        learningEligible: segment.input.learningEligible,
        startTick: segment.input.startTick,
        endTick: null,
        segmentCompleteness: 'OPEN',
        closeReason: null,
        lostCheckpointTick: null,
        observationLoss: segment.observationLoss,
        collisions: Object.freeze([...segment.collisions]),
        recoveries: Object.freeze([...segment.recoveries]),
        suspensions: Object.freeze([...segment.suspensions]),
      });
    } catch {
      // 088 rejects a duplicate/foreign evaluation; the live segment remains open and honest.
    }
  };

  const reclassifyWindows = (
    suspension: EligibilitySuspension,
    impact: EligibilityImpactFact | null,
    opportunityIds: ReadonlySet<string> | null = null,
    vehicleId: string | null = null,
  ): void => {
    for (const [opportunityId, fact] of lastWindowFact) {
      if (opportunityIds !== null && !opportunityIds.has(opportunityId)) continue;
      if (vehicleId !== null && fact.vehicleId !== vehicleId) continue;
      const next = Object.freeze({
        ...fact,
        tick: Math.max(fact.tick, tick),
        suspension,
        impact,
      });
      lastWindowFact.set(opportunityId, next);
      try {
        windows.observe(next);
      } catch {
        // A bounded window store may have retired the record; no fabricated reclassification.
      }
    }
  };

  return Object.freeze({
    version: LIVE_TELEMETRY_VERSION,
    openSegment(input: LiveTelemetrySegmentInput): void {
      alive();
      const startTick = readTick(input.startTick);
      const controlMode = choiceValue(input.controlMode, controlModes);
      requireContract(
        controlMode !== 'AUTO',
        'A live 069 telemetry segment is only MANUAL or LEARNING',
      );
      const learningEligible = input.learningEligible === true;
      requireContract(
        !learningEligible || controlMode === 'LEARNING',
        'Only a LEARNING segment can be learning eligible',
      );
      const classId = choiceValue(input.classId, classIds);
      const segment: SegmentRuntime = {
        input: Object.freeze({
          segmentId: identity(input.segmentId),
          vehicleId: identity(input.vehicleId),
          classId,
          controlMode,
          profileId: identity(input.profileId),
          baseVersionId: identity(input.baseVersionId),
          learningEpoch: readTick(input.learningEpoch),
          learningEligible,
          inputType: choiceValue(input.inputType, ['KEYBOARD', 'GAMEPAD'] as const),
          startTick,
        }),
        incarnation: `${identity(input.vehicleId)}:live`,
        collisions: [],
        recoveries: [],
        suspensions: [],
        openSuspension: null,
        observationLoss: null,
        lastSampleTick: startTick,
      };
      if (active !== null) closeInternal('MODE_CHANGE', startTick);
      active = segment;
      recorder.openSegment(
        {
          segmentId: segment.input.segmentId,
          sessionId: context.sessionId,
          worldEpoch: context.worldEpoch,
          vehicleId: segment.input.vehicleId,
          classId: segment.input.classId,
          controlMode: segment.input.controlMode,
          profileId: segment.input.profileId,
          baseVersionId: segment.input.baseVersionId,
          learningEpoch: segment.input.learningEpoch,
          learningEligible: segment.input.learningEligible,
          inputType: segment.input.inputType,
          startTick,
        },
        'MODE_CHANGE',
      );
      segmentsOpened += 1;
      evaluateOpen(startTick);
    },
    closeSegment(reason: CloseReason): boolean {
      alive();
      return closeInternal(
        choiceValue(reason, [
          'RETURN_TO_AUTO',
          'MODE_CHANGE',
          'RIDE_COMPLETED',
          'VEHICLE_SWITCH',
          'PROFILE_CHANGE',
          'PROFILE_RESTORE',
          'PROFILE_IMPORT',
          'STATE_IMPORT',
          'CONTROL_PREFERENCES_CHANGE',
          'SESSION_CHANGE',
          'WORLD_RESET',
          'RECOVERY',
          'ROLLOVER',
          'SHUTDOWN',
          'DATA_LOSS',
        ] as const),
        tick,
      );
    },
    step(input: LiveTelemetryTickInput): void {
      alive();
      const atTick = readTick(input.tick);
      requireContract(lastTick === null || atTick > lastTick, 'Live telemetry ticks must increase');
      if (lastTick !== null && atTick !== lastTick + 1) sampleGaps += atTick - lastTick - 1;
      lastTick = atTick;
      tick = atTick;
      stepSignals(atTick);
      const vehicles = input.vehicles;
      requireContract(vehicles.length <= 256, 'Live telemetry fleet exceeds the bounded capacity');
      const projections: TickProjection[] = [];
      for (const rawVehicle of vehicles) {
        requireContract(rawVehicle.tick === atTick, 'Live telemetry vehicle tick mismatch');
        let vehicle = rawVehicle;
        let lane =
          vehicle.laneId === null
            ? null
            : (map.lanes.find((entry) => entry.id === vehicle.laneId) ?? null);
        if (lane === null) {
          // A seeded composition car may not carry a lane id until 054/282 projects it. Telemetry
          // attributes the nearest authoritative lane from the real 033 graph, never invents one;
          // the composition state itself is not modified.
          const located = graph.locateLane({
            positionM: vehicle.positionM,
            access: vehicle.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
          });
          if (located !== null) {
            lane = located.lane;
            vehicle = Object.freeze({
              ...vehicle,
              laneId: located.lane.id,
              speedLimitMps: located.lane.speedLimitMps,
            });
          }
        }
        const projection =
          lane === null
            ? null
            : graph.projectOnLane(lane.id, {
                positionM: vehicle.positionM,
                access: vehicle.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
              });
        const path = lane === null ? null : graph.getDirectedPath(lane.id);
        projections.push(
          Object.freeze({
            vehicle,
            longitudinalM: projection?.longitudinalM ?? null,
            laneLengthM: path?.lengthM ?? null,
            headingRad: projection?.headingRad ?? null,
          }),
        );
      }
      const byLane = new Map<string, TickProjection[]>();
      for (const entry of projections) {
        if (entry.vehicle.laneId === null) continue;
        const list = byLane.get(entry.vehicle.laneId) ?? [];
        list.push(entry);
        byLane.set(entry.vehicle.laneId, list);
      }
      let vehiclesObserved = 0;
      for (const entry of projections) {
        const vehicle = entry.vehicle;
        vehiclesObserved += 1;
        const prior = previous.get(vehicle.vehicleId) ?? null;
        const dt = 1 / LIVE_TELEMETRY_TICK_HZ;
        const physics: DerivedPhysics = Object.freeze({
          longitudinalAccelerationMps2: clampNumber(
            prior === null ? 0 : (vehicle.speedMps - prior.speedMps) / dt,
            -100,
            100,
          ),
          lateralAccelerationMps2: clampNumber(
            prior === null
              ? 0
              : Math.abs((vehicle.speedMps * angleDelta(vehicle.yawRad, prior.yawRad)) / dt),
            -100,
            100,
          ),
          speedMps: vehicle.speedMps,
        });
        let leader: EligibilityLeaderFact | null = null;
        const laneEntries = vehicle.laneId === null ? undefined : byLane.get(vehicle.laneId);
        if (laneEntries !== undefined && entry.longitudinalM !== null) {
          let bestGap = Number.POSITIVE_INFINITY;
          for (const candidate of laneEntries) {
            if (candidate.vehicle.vehicleId === vehicle.vehicleId) continue;
            if (candidate.longitudinalM === null) continue;
            const delta = candidate.longitudinalM - entry.longitudinalM;
            const gap = delta - LIVE_TELEMETRY_POLICY.vehicleLengthM;
            if (gap < 0 || gap > leaderMaxGapM || gap >= bestGap) continue;
            bestGap = gap;
            leader = Object.freeze({
              id: candidate.vehicle.vehicleId,
              gapM: gap,
              speedMps: Math.abs(candidate.vehicle.speedMps),
            });
          }
        }
        const signalLane = vehicle.laneId === null ? undefined : signalByLane.get(vehicle.laneId);
        const signal =
          signalLane === undefined || entry.longitudinalM === null
            ? null
            : signalFactFor(signalLane, atTick);
        const stop = vehicle.laneId === null ? undefined : stopByLane.get(vehicle.laneId);
        const stopDistance =
          stop === undefined || stop.longitudinalM === null || entry.longitudinalM === null
            ? null
            : stop.longitudinalM - entry.longitudinalM;
        const signalDistance =
          signalLane === undefined ||
          signalLane.lineLongitudinalM === null ||
          entry.longitudinalM === null
            ? null
            : signalLane.lineLongitudinalM - entry.longitudinalM;
        const derived =
          vehicle.raw !== undefined && vehicle.command !== undefined
            ? {
                raw: vehicle.raw,
                command: vehicle.command,
              }
            : deriveRawAndCommand(vehicle, prior, dt);
        const signalFact =
          signal !== null && (signalDistance === null || signalDistance <= 60)
            ? Object.freeze({ signalId: signal.signalId, state: signal.state })
            : null;
        writeWorldRow(ring, {
          tick: atTick,
          vehicle,
          raw: derived.raw,
          command: derived.command,
          signal: signalFact,
          leaderId: leader?.id ?? null,
          leaderGapM: leader?.gapM ?? null,
        });
        if (active !== null && active.input.vehicleId === vehicle.vehicleId) {
          const command = commandFrom(vehicle, derived.command, atTick);
          const lane =
            vehicle.laneId === null
              ? null
              : Object.freeze({
                  laneId: vehicle.laneId,
                  speedLimitMps: vehicle.speedLimitMps,
                });
          const frame: TickSampleFrame = Object.freeze({
            tick: atTick,
            state: stateFrom(vehicle, atTick),
            raw: derived.raw,
            command,
            physics: Object.freeze({
              longitudinalAccelerationMps2: physics.longitudinalAccelerationMps2,
              lateralAccelerationMps2: physics.lateralAccelerationMps2,
            }),
            lane,
            signal:
              signal === null
                ? null
                : Object.freeze({ signalId: signal.signalId, state: signal.state }),
          });
          try {
            if (recorder.record(frame) < 0) samplesRejected += 1;
            else {
              samplesRecorded += 1;
              active.lastSampleTick = atTick;
              if (active.input.controlMode === 'MANUAL') manualSamples += 1;
            }
          } catch (error: unknown) {
            samplesRejected += 1;
            lastSampleError = error instanceof Error ? error.message : String(error);
          }
        }
        // Real follower episodes are deduplicated by vehicle+leader acquisition, never by frame.
        const oldEpisode = followActive.get(vehicle.vehicleId);
        if (leader !== null) {
          if (oldEpisode === undefined || oldEpisode.leaderId !== leader.id) {
            if (oldEpisode !== undefined) {
              oldEpisode.endTick = atTick;
              pushFollowEpisode(oldEpisode);
              followActive.delete(vehicle.vehicleId);
            }
            const episode: FollowEpisode = {
              episodeId: createStableId('live-follow-episode', context.sessionId, [
                String(context.worldEpoch),
                vehicle.vehicleId,
                leader.id,
                String(atTick),
              ]),
              vehicleId: vehicle.vehicleId,
              leaderId: leader.id,
              startTick: atTick,
              endTick: null,
              observations: 1,
              minGapM: leader.gapM,
              maxGapM: leader.gapM,
            };
            followActive.set(vehicle.vehicleId, episode);
          } else {
            oldEpisode.observations += 1;
            oldEpisode.minGapM = Math.min(oldEpisode.minGapM, leader.gapM);
            oldEpisode.maxGapM = Math.max(oldEpisode.maxGapM, leader.gapM);
          }
        } else if (oldEpisode !== undefined) {
          oldEpisode.endTick = atTick;
          pushFollowEpisode(oldEpisode);
          followActive.delete(vehicle.vehicleId);
        }
        processContext({
          atTick,
          vehicle,
          prior,
          projection: entry,
          signal,
          signalLane: signalLane ?? null,
          signalDistance,
          stop: stop ?? null,
          stopDistance,
          leader,
          physics,
          camera: input.camera ?? null,
        });
        previous.set(
          vehicle.vehicleId,
          Object.freeze({
            speedMps: vehicle.speedMps,
            yawRad: vehicle.yawRad,
            laneId: vehicle.laneId,
            signalId: signal?.signalId ?? null,
            longitudinalM: entry.longitudinalM,
            speedLimitMps: vehicle.speedLimitMps,
          }),
        );
      }
      for (const collision of input.collisions ?? []) {
        collisions += 1;
        if (active !== null) active.collisions.push(collision);
      }
      if (active !== null) evaluateOpen(atTick);
      void vehiclesObserved;
    },
    noteSuspension(input: LiveTelemetrySuspensionInput): void {
      alive();
      const atTick = readTick(input.tick);
      const cause = choiceValue(input.cause, suspendCauses);
      suspensions += 1;
      const suspension: MutableSuspensionFact = {
        fromTick: atTick,
        toTick: null,
        cause: cause === 'FOCUS_LOST' ? 'focus' : 'menu',
      };
      if (active !== null) {
        active.suspensions.push(suspension);
        active.openSuspension = suspension;
      }
      const ongoing = new Set(
        registry
          .getOpportunities()
          .filter((record) => record.state === 'ENTERED')
          .map((record) => record.id),
      );
      try {
        registry.suspend({ tick: atTick });
      } catch {
        // A disposed/bounded registry is not a reason to fabricate a reaction.
      }
      reclassifyWindows(cause === 'FOCUS_LOST' ? 'FOCUS_LOST' : 'PAUSE', null, ongoing);
      if (active !== null) evaluateOpen(atTick);
    },
    noteResume(inputTick: number): void {
      alive();
      const atTick = readTick(inputTick);
      if (active !== null && active.openSuspension !== null) {
        (active.openSuspension as { toTick: number | null }).toTick = atTick;
        const lost = atTick - active.openSuspension.fromTick - 1;
        if (lost > 0)
          active.observationLoss = Object.freeze({
            fromTick: active.openSuspension.fromTick,
            ticks: lost,
          });
        active.openSuspension = null;
        evaluateOpen(atTick);
      }
      try {
        registry.resume({ tick: atTick });
      } catch {
        // Same as suspension: a bounded store may already be disposed.
      }
    },
    noteRecovery(input: LiveTelemetryRecoveryInput): void {
      alive();
      const atTick = readTick(input.tick);
      const vehicleId = identity(input.vehicleId);
      const fact: ArtifactRecoveryFact = Object.freeze({
        tick: atTick,
        operationId: identity(input.operationId),
        status: choiceValue(input.status, ['ADMITTED', 'DENIED', 'PARTIAL', 'COMPLETED'] as const),
        pointId: identity(input.pointId),
        mapId: identity(input.mapId),
        laneId: identity(input.laneId),
        mode: choiceValue(input.mode, ['MANUAL', 'LEARNING'] as const),
        validatedTick: readTick(input.validatedTick),
        learningEligible: false,
      });
      recoveries += 1;
      if (active !== null && active.input.vehicleId === vehicleId) {
        active.recoveries.push(fact);
        evaluateOpen(atTick);
      }
      const ongoing = new Set(
        registry
          .getOpportunities()
          .filter((record) => record.state === 'ENTERED' && record.vehicleId === vehicleId)
          .map((record) => record.id),
      );
      for (const record of registry.getOpportunities())
        if (record.state === 'ENTERED' && record.vehicleId === vehicleId) {
          try {
            registry.truncate({
              tick: atTick,
              opportunityId: record.id,
              reason: 'OBSERVATION_LOST',
            });
            removeEntered(record.id);
          } catch {
            // Already resolved/retired; no synthetic outcome.
          }
        }
      reclassifyWindows(
        'NONE',
        {
          collision: false,
          impairment: null,
          recovery: true,
        },
        ongoing,
        vehicleId,
      );
    },
    read(): LiveTelemetryReadModel {
      alive();
      const summaries = recorder
        .getSegments()
        .filter((segment) => segment.completeness === 'CLOSED')
        .map((segment) => currentSegmentSummaryFrom(segment));
      const evidence: LiveTelemetryEvidenceView = Object.freeze({
        version: LIVE_TELEMETRY_VERSION,
        uniqueOccurrences: seenOccurrences.size,
        duplicateObservations,
        dedupeDropped,
        byKind: Object.freeze({ ...kindObservations }),
        eligibleWindows: windows.getDenominators().eligible,
        excludedWindows: windows.getDenominators().excluded,
        externalConstraintWindows: windows.getDenominators().externalConstraint,
        manual: Object.freeze({
          samples: manualSamples,
          learningEligible: false as const,
          demonstrations: 0 as const,
        }),
        auto: Object.freeze({
          opportunities: autoOpportunities,
          demonstrations: 0 as const,
        }),
        followEpisodes: followEpisodes.length + followActive.size,
        profilePublications: 0 as const,
        learningJobs: 0 as const,
      });
      return Object.freeze({
        version: LIVE_TELEMETRY_VERSION,
        tick,
        disposed,
        activeSegment: currentSegmentSummary(active),
        closedSegments: Object.freeze(summaries),
        opportunities: registry.getOpportunities(),
        windows: windows.getWindows(),
        evidence,
        profile: Object.freeze({
          playerId,
          profileId: active?.input.profileId ?? null,
          baseVersionId: active?.input.baseVersionId ?? null,
        }),
        learning: Object.freeze({
          workspace: 'TELEMETRY_272' as const,
          eligible: active?.input.learningEligible ?? false,
          closedSegments: summaries.filter(
            (segment) => segment.controlMode === 'LEARNING' && segment.learningEligible,
          ).length,
          profilePublications: 0 as const,
          jobs: 0 as const,
        }),
      });
    },
    readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null {
      alive();
      const summary = recorder.getSegment(identity(segmentId));
      if (summary === null || summary.completeness !== 'CLOSED') return null;
      const samples = Object.freeze(
        Array.from({ length: summary.sampleCount }, (_, index) =>
          recorder.readSample(summary.segmentId, index),
        ),
      );
      const opportunities = Object.freeze(
        registry
          .getOpportunities()
          .filter((record) => record.segmentIds.includes(summary.segmentId)),
      );
      const artifactWindow = artifacts.getWindow(summary.segmentId);
      const eligibleOccurrences = new Set(
        opportunities
          .filter((record) => record.learningEligible)
          .map((record) => `${record.id}#${record.occurrence}`),
      ).size;
      return Object.freeze({
        summary: currentSegmentSummaryFrom(summary),
        samples,
        opportunities,
        windows: Object.freeze(
          windows.getWindows().filter((window) => window.segmentId === summary.segmentId),
        ),
        artifactWindow,
        eligibleOccurrences,
        demonstrations: 0 as const,
        profilePublications: 0 as const,
      });
    },
    readWorldSamples(query: LiveTelemetryWorldQuery = {}): readonly LiveWorldSample[] {
      alive();
      const limit = Math.floor(finite(query.limit ?? 4096, 1, 65_536));
      const fromTick = query.fromTick === undefined ? -Infinity : readTick(query.fromTick);
      const toTick = query.toTick === undefined ? Infinity : readTick(query.toTick);
      const vehicleFilter = query.vehicleId === undefined ? null : query.vehicleId;
      const result: LiveWorldSample[] = [];
      const count = ring.count;
      for (let index = 0; index < count && result.length < limit; index += 1) {
        const slot = (ring.head + index) % ring.capacity;
        if (ring.tick[slot]! < fromTick || ring.tick[slot]! > toTick) continue;
        const vehicleId = worldIdentityAt(ring, ring.vehicle[slot]!);
        if (vehicleId === null) continue;
        if (vehicleFilter !== null && vehicleId !== vehicleFilter) continue;
        const laneId = worldIdentityAt(ring, ring.laneId[slot]!);
        const signalId = worldIdentityAt(ring, ring.signalId[slot]!);
        const leaderId = worldIdentityAt(ring, ring.leaderId[slot]!);
        const signalIndex = ring.signalState[slot]!;
        result.push(
          Object.freeze({
            tick: ring.tick[slot]!,
            vehicleId,
            driverKind: driverKinds[ring.driverKind[slot]!]!,
            classId: classIds[ring.classId[slot]!]!,
            controlMode: controlModes[ring.controlMode[slot]!]!,
            positionM: Object.freeze({
              x: ring.positionX[slot]!,
              y: ring.positionY[slot]!,
              z: ring.positionZ[slot]!,
            }),
            yawRad: ring.yawRad[slot]!,
            speedMps: ring.speedMps[slot]!,
            rawInput: Object.freeze({
              throttle: ring.rawThrottle[slot]!,
              brake: ring.rawBrake[slot]!,
              steering: ring.rawSteering[slot]!,
              handbrake: ring.rawHandbrake[slot] === 1,
            }),
            command: Object.freeze({
              throttle: ring.commandThrottle[slot]!,
              brake: ring.commandBrake[slot]!,
              steering: ring.commandSteering[slot]!,
              handbrake: ring.commandHandbrake[slot] === 1,
              turnSignal: turnSignals[ring.commandTurnSignal[slot]!]!,
              source: commandSources[ring.commandSource[slot]!]!,
            }),
            laneId,
            speedLimitMps: laneId === null ? null : ring.speedLimitMps[slot]!,
            signal:
              signalIndex === 0 || signalId === null
                ? null
                : Object.freeze({ signalId, state: signalStates[signalIndex - 1]! }),
            leaderId,
            leaderGapM: leaderId === null ? null : ring.leaderGapM[slot]!,
          }),
        );
      }
      return Object.freeze(result);
    },
    readFollowEpisodes(): readonly LiveTelemetryFollowEpisode[] {
      alive();
      return Object.freeze(
        [...followEpisodes, ...followActive.values()].map((episode) =>
          Object.freeze({
            episodeId: episode.episodeId,
            vehicleId: episode.vehicleId,
            leaderId: episode.leaderId,
            startTick: episode.startTick,
            endTick: episode.endTick,
            observations: episode.observations,
            minGapM: episode.minGapM,
            maxGapM: episode.maxGapM,
          }),
        ),
      );
    },
    getStats(): LiveTelemetryStats {
      const sampleStats = recorder.getStats();
      const memory: LiveTelemetryMemory = Object.freeze({
        tickSamplesBytes: sampleStats.bufferBytes,
        worldBufferBytes: worldBufferBytes(ring) + worldIdentityBytes(ring),
        worldIdentityBytes: worldIdentityBytes(ring),
        opportunitiesBytes: registry.getStats().estimatedBytes,
        eligibilityBytes: windows.getStats().estimatedBytes,
        artifactsBytes: artifacts.getStats().estimatedBytes,
        totalBytes:
          sampleStats.bufferBytes +
          worldBufferBytes(ring) +
          worldIdentityBytes(ring) +
          registry.getStats().estimatedBytes +
          windows.getStats().estimatedBytes +
          artifacts.getStats().estimatedBytes,
        budgetBytes: LIVE_TELEMETRY_RAM_BUDGET_BYTES,
        withinBudget:
          sampleStats.bufferBytes +
            worldBufferBytes(ring) +
            worldIdentityBytes(ring) +
            registry.getStats().estimatedBytes +
            windows.getStats().estimatedBytes +
            artifacts.getStats().estimatedBytes <=
          LIVE_TELEMETRY_RAM_BUDGET_BYTES,
      });
      return Object.freeze({
        version: LIVE_TELEMETRY_VERSION,
        disposed,
        tick,
        vehiclesObserved: previous.size,
        samplesRecorded,
        samplesRejected,
        lastSampleError,
        sampleGaps,
        worldSamplesWritten: ring.writes,
        worldSamplesDropped: ring.dropped,
        worldSamplesRetained: ring.count,
        worldCapacity: ring.capacity,
        worldRingWrites: ring.writes,
        segmentsOpened,
        segmentsClosed,
        opportunityObservations,
        uniqueOccurrences: seenOccurrences.size,
        duplicateObservations,
        dedupeDropped,
        followEpisodes: followEpisodes.length + followActive.size,
        suspensions,
        recoveries,
        collisions,
        signalResets,
        memory,
      });
    },
    dispose(): void {
      if (disposed) return;
      try {
        if (active !== null) closeInternal('SHUTDOWN', Math.max(tick, active.lastSampleTick));
      } finally {
        disposed = true;
        active = null;
        closeSignalController();
        eventBus.dispose();
        recorder.dispose();
        registry.dispose();
        windows.dispose();
        artifacts.dispose();
        previous.clear();
        stopTrackers.clear();
        signalTrackers.clear();
        laneChangeTrackers.clear();
        approachOrdinal.clear();
        laneChangeOrdinal.clear();
        enteredByVehicle.clear();
        followActive.clear();
        followEpisodes.length = 0;
        lastWindowFact.clear();
        seenOccurrences.clear();
        occurrenceOrder.length = 0;
        ring.count = 0;
        ring.head = 0;
        ring.next = 0;
      }
    },
  });

  function currentSegmentSummaryFrom(
    segment: TickSampleSegmentSummary,
  ): LiveTelemetrySegmentSummary {
    return Object.freeze({
      segmentId: segment.segmentId,
      vehicleId: segment.vehicleId,
      classId: segment.classId,
      controlMode: segment.controlMode,
      learningEligible: segment.learningEligible,
      learningEpoch: segment.learningEpoch,
      profileId: segment.profileId,
      baseVersionId: segment.baseVersionId,
      inputType: segment.inputType,
      startTick: segment.startTick,
      endTick: segment.endTick,
      closeReason: segment.closeReason,
      completeness: segment.completeness,
      samples: segment.sampleCount,
      sampleBytes: segment.bufferBytes,
      opportunities: registry
        .getOpportunities()
        .filter((record) => record.segmentIds.includes(segment.segmentId)).length,
      eligibleWindows: windows
        .getWindows()
        .filter(
          (window) => window.segmentId === segment.segmentId && window.windowClass === 'ELIGIBLE',
        ).length,
      artifacts: artifacts.getWindow(segment.segmentId)?.artifactCount ?? 0,
      samplesAvailable: segment.sampleCount > 0,
    });
  }

  function commandFrom(
    vehicle: LiveTelemetryVehicleTick,
    command: LiveTelemetryCommandInput,
    atTick: number,
  ): VehicleCommand {
    return Object.freeze({
      ...context,
      vehicleId: vehicle.vehicleId,
      tick: atTick,
      throttle: command.throttle,
      brake: command.brake,
      steering: command.steering,
      handbrake: command.handbrake,
      turnSignal: command.turnSignal,
      source: command.source,
    });
  }

  function stateFrom(vehicle: LiveTelemetryVehicleTick, atTick: number): VehicleState {
    const rotation = quaternionFromYaw(vehicle.yawRad);
    return Object.freeze({
      ...context,
      vehicleId: vehicle.vehicleId,
      classId: vehicle.classId,
      tick: atTick,
      transform: Object.freeze({
        positionM: Object.freeze({ ...vehicle.positionM }),
        rotationQuaternion: Object.freeze(rotation),
      }),
      velocityMps: Object.freeze({
        x: Math.sin(vehicle.yawRad) * vehicle.speedMps,
        y: 0,
        z: Math.cos(vehicle.yawRad) * vehicle.speedMps,
      }),
      laneId: vehicle.laneId,
      controlMode: vehicle.controlMode,
      appliedProfileVersion:
        active !== null && active.input.vehicleId === vehicle.vehicleId
          ? active.input.baseVersionId
          : vehicle.appliedProfileVersion,
      maneuverState: vehicle.maneuverState,
    });
  }

  function processContext(input: {
    atTick: number;
    vehicle: LiveTelemetryVehicleTick;
    prior: PreviousVehicle | null;
    projection: TickProjection;
    signal:
      | (EligibilitySignalFact & {
          readonly phaseId: string;
          readonly phaseStartedTick: number;
        })
      | null;
    signalLane: SignalLaneContext | null;
    signalDistance: number | null;
    stop: StopContext | null;
    stopDistance: number | null;
    leader: EligibilityLeaderFact | null;
    physics: DerivedPhysics;
    camera: EligibilityCameraPose | null;
  }): void {
    const { atTick, vehicle, prior, signal, signalLane, stop, stopDistance } = input;
    const signalDistance = input.signalDistance;
    const vehicleId = vehicle.vehicleId;
    const events: SimulationEvent[] = [];
    const conclusions: SignalConclusion[] = [];
    const contextKey = [
      vehicle.laneId ?? '',
      input.leader?.id ?? '',
      input.leader === null ? '' : String(Math.round(input.leader.gapM)),
      signal?.signalId ?? '',
      signal?.state ?? '',
      signal === null ? '' : String(signal.phaseStartedTick),
      stop?.stopLineId ?? '',
      stopDistance === null ? '' : String(Math.round(stopDistance)),
    ].join('|');
    const previousKey = `${vehicleId}:context`;
    const changed = previousContext.get(previousKey) !== contextKey;
    previousContext.set(previousKey, contextKey);

    // STOP: a real stop line approach and a real full stop/crossing, one occurrence each.
    if (stop !== null && stopDistance !== null) {
      const tracker = stopTrackers.get(vehicleId);
      if (tracker === undefined) {
        if (stopDistance >= 0 && stopDistance <= approachDistanceM) {
          const ordinal = (approachOrdinal.get(vehicleId) ?? 0) + 1;
          approachOrdinal.set(vehicleId, ordinal);
          const opportunityId = `live-stop-${vehicleId}-${stop.stopLineId}-${ordinal}`;
          const created: StopTracker = {
            stopLineId: stop.stopLineId,
            opportunityId,
            fullStop: false,
            crossed: false,
            lastDistanceM: stopDistance,
          };
          stopTrackers.set(vehicleId, created);
          events.push(
            event(
              'STOP_APPROACH',
              atTick,
              vehicleId,
              {
                vehicleId,
                opportunityId,
                stopLineId: stop.stopLineId,
              },
              `${stop.stopLineId}:${ordinal}`,
            ),
          );
        }
      } else {
        if (
          !tracker.fullStop &&
          vehicle.speedMps <= 0.1 &&
          stopDistance <= LIVE_TELEMETRY_POLICY.fullStopDistanceM &&
          stopDistance >= -1
        ) {
          tracker.fullStop = true;
          events.push(
            event(
              'FULL_STOP',
              atTick,
              vehicleId,
              {
                vehicleId,
                opportunityId: tracker.opportunityId,
                durationS: 0,
              },
              `${tracker.stopLineId}:stop`,
            ),
          );
        }
        if (!tracker.crossed && tracker.lastDistanceM > 0.05 && stopDistance <= 0) {
          tracker.crossed = true;
          if (!tracker.fullStop)
            events.push(
              event(
                'STOP_LINE_CROSSED',
                atTick,
                vehicleId,
                {
                  vehicleId,
                  opportunityId: tracker.opportunityId,
                  stopLineId: tracker.stopLineId,
                },
                `${tracker.stopLineId}:crossed`,
              ),
            );
          stopTrackers.delete(vehicleId);
        } else if (stopDistance > approachDistanceM + 15) {
          stopTrackers.delete(vehicleId);
        } else {
          tracker.lastDistanceM = stopDistance;
        }
      }
    } else {
      stopTrackers.delete(vehicleId);
    }

    // SIGNAL: the real 036 movement phase is the only source of RED/GREEN opportunities.
    if (signal !== null && signalLane !== null) {
      const tracker = signalTrackers.get(vehicleId);
      const distance = input.signalDistance ?? Number.POSITIVE_INFINITY;
      const previousDistance = tracker?.signalId === signal.signalId ? tracker.lastDistanceM : null;
      const crossed = previousDistance !== null && previousDistance > 0.05 && distance <= 0;
      const stopped = vehicle.speedMps <= 0.1 && distance <= 6 && distance >= -1;
      if (
        tracker?.signalId === signal.signalId &&
        signal.state === 'RED' &&
        stopped &&
        !tracker.held
      ) {
        tracker.held = true;
        conclusions.push({ kind: 'RED', outcome: 'HELD' });
      } else if (
        tracker?.signalId === signal.signalId &&
        signal.state === 'RED' &&
        crossed &&
        stopped === false
      ) {
        conclusions.push({ kind: 'RED', outcome: 'CROSSED' });
      } else if (tracker?.signalId === signal.signalId && signal.state === 'GREEN' && crossed) {
        conclusions.push({ kind: 'GREEN', outcome: 'RELEASED' });
      }
      if (distance <= 35) {
        const next: SignalTracker =
          tracker?.signalId === signal.signalId
            ? { ...tracker, lastDistanceM: distance }
            : {
                signalId: signal.signalId,
                phaseStartedTick: signal.phaseStartedTick,
                lastDistanceM: distance,
                held: false,
              };
        signalTrackers.set(vehicleId, next);
      } else if (tracker !== undefined) {
        signalTrackers.delete(vehicleId);
      }
    } else if (prior?.signalId !== null) {
      signalTrackers.delete(vehicleId);
    }

    // LANE_CHANGE: a real neighbour-lane transition; intersection turns are not lane changes.
    const previousLane = prior?.laneId ?? null;
    const currentLane = vehicle.laneId;
    if (previousLane !== null && currentLane !== null && previousLane !== currentLane) {
      const neighbors = graph.getNeighbors(
        previousLane,
        vehicle.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
      );
      const isNeighbour = neighbors.left?.id === currentLane || neighbors.right?.id === currentLane;
      if (isNeighbour) {
        const existing = laneChangeTrackers.get(vehicleId);
        if (existing !== undefined) {
          try {
            registry.truncate({
              tick: atTick,
              opportunityId: existing.opportunityId ?? existing.sourceKey,
              reason: 'OBSERVATION_LOST',
            });
          } catch {
            // The sourceKey is not an 086 id; the tracked id is what matters.
          }
        }
        const ordinal = (laneChangeOrdinal.get(vehicleId) ?? 0) + 1;
        laneChangeOrdinal.set(vehicleId, ordinal);
        const sourceKey = `live-lane-${vehicleId}-${previousLane}-${currentLane}-${String(ordinal)}`;
        const tracker: LaneChangeTracker = {
          fromLaneId: previousLane,
          toLaneId: currentLane,
          sourceKey,
          startTick: atTick,
          opportunityId: null,
        };
        laneChangeTrackers.set(vehicleId, tracker);
        events.push(
          event(
            'LANE_CHANGE_STARTED',
            atTick,
            vehicleId,
            {
              vehicleId,
              opportunityId: sourceKey,
              fromLaneId: previousLane,
              toLaneId: currentLane,
            },
            sourceKey,
          ),
        );
      }
    } else if (currentLane !== null) {
      const tracker = laneChangeTrackers.get(vehicleId);
      if (
        tracker !== undefined &&
        tracker.toLaneId === currentLane &&
        atTick - tracker.startTick >= laneChangeCompleteTicks
      ) {
        events.push(
          event(
            'LANE_CHANGE_COMPLETED',
            atTick,
            vehicleId,
            {
              vehicleId,
              opportunityId: tracker.sourceKey,
              fromLaneId: tracker.fromLaneId,
              toLaneId: tracker.toLaneId,
            },
            `${tracker.sourceKey}:complete`,
          ),
        );
        laneChangeTrackers.delete(vehicleId);
      }
    }

    if (!changed && events.length === 0 && conclusions.length === 0) {
      // A real context may still need a window update when only the camera changed; the caller
      // supplies a new camera pose every tick and the window classification is latched, so no
      // per-frame write is needed.
      return;
    }
    opportunityObservations += 1;
    const touched = registry.observe({
      tick: atTick,
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      segmentId:
        active !== null && active.input.vehicleId === vehicleId
          ? active.input.segmentId
          : `live:${String(context.worldEpoch)}:${vehicleId}`.slice(0, 256),
      learningEligible:
        active !== null && active.input.vehicleId === vehicleId && active.input.learningEligible,
      vehicleId,
      incarnation: vehicle.incarnation ?? `${vehicleId}:live`,
      signal,
      events: Object.freeze(events),
      stimuli: Object.freeze([]),
      conclusions: Object.freeze([]),
    });
    const touchedIds = new Set<string>();
    for (const record of touched) {
      noteRecord(record, vehicleId, vehicle.controlMode);
      touchedIds.add(record.id);
      if (record.kind === 'LANE_CHANGE') {
        const tracker = laneChangeTrackers.get(vehicleId);
        if (tracker !== undefined && tracker.opportunityId === null)
          (tracker as { opportunityId: string | null }).opportunityId = record.id;
      }
      if (!windowUpdateSuppressed(record, stopDistance, signalDistance))
        observeWindow(record, vehicle, atTick, {
          physics: input.physics,
          leader: input.leader,
          signal,
          stopLineId: stop?.stopLineId ?? null,
          stopDistanceM: stopDistance,
          signalDistanceM: signalDistance,
          stimulusPositionM:
            signalLane?.linePositionM ??
            (stop === null ? null : stopLineAnchorPosition(stop.stopLineId)),
          camera: input.camera,
          suspension: 'NONE',
          impact: null,
        });
    }
    for (const conclusion of conclusions) {
      const entered = registry.findEntered(
        conclusion.kind,
        vehicleId,
        vehicle.incarnation ?? `${vehicleId}:live`,
      );
      if (entered === null) continue;
      try {
        const resolved = registry.conclude({
          tick: atTick,
          opportunityId: entered.id,
          outcome: conclusion.outcome,
        });
        noteRecord(resolved, vehicleId, vehicle.controlMode);
      } catch {
        // One opportunity can never carry two contradictory outcomes; the first certain one stands.
      }
    }
    const entered = enteredByVehicle.get(vehicleId);
    if (entered !== undefined) {
      for (const opportunityId of [...entered]) {
        const record = registry.getOpportunity(opportunityId);
        if (record === null || record.state !== 'ENTERED') {
          entered.delete(opportunityId);
          continue;
        }
        if (!touchedIds.has(record.id)) admission(record);
        if (!windowUpdateSuppressed(record, stopDistance, signalDistance))
          observeWindow(record, vehicle, atTick, {
            physics: input.physics,
            leader: input.leader,
            signal,
            stopLineId: stop?.stopLineId ?? null,
            stopDistanceM: stopDistance,
            signalDistanceM: signalDistance,
            stimulusPositionM:
              signalLane?.linePositionM ??
              (stop === null ? null : stopLineAnchorPosition(stop.stopLineId)),
            camera: input.camera,
            suspension: 'NONE',
            impact: null,
          });
        const window = windows.getWindow(opportunityId);
        if (
          window !== null &&
          window.reaction.open &&
          commandMagnitude(vehicle) >= LIVE_TELEMETRY_POLICY.reactionCommandThreshold
        ) {
          try {
            windows.respond({ tick: atTick, opportunityId });
          } catch {
            // The reaction window is already closed; no response is invented.
          }
        }
      }
    }
  }

  function commandMagnitude(vehicle: LiveTelemetryVehicleTick): number {
    const command = vehicle.command;
    if (command !== undefined)
      return Math.max(command.throttle, command.brake, Math.abs(command.steering));
    return Math.abs(vehicle.speedMps) > 0 ? 1 : 0;
  }
}

/** Signed shortest angular delta in radians. */
function angleDelta(current: number, previous: number): number {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
