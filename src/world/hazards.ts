import { randomUnit, record, requireContract, tick as readTick, text } from '../sessions';
import { FIXED_TICK_HZ } from '../simulation';
import { COLLISION_LIMITS } from '../vehicles';
import type { ControlMode, Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import type { PedestrianState } from './pedestrians';

/**
 * 165-hazards-v1 — hazard stimuli, obstacles as data and horn opportunities.
 *
 * This module is a deterministic world fact producer: no clock, no renderer, no physics and no
 * randomness beyond an explicit seed. It never moves a vehicle and never invents a contact. The
 * obstacle is handed to the physics owner as an ordinary named box (`HazardObstacle.physics`), so
 * avoidance and braking use the same solver as any other contact, for the player and for AUTO.
 */

export const HAZARD_VERSION = '165-hazards-v1';
export const HAZARD_OBSTACLE_TYPES = Object.freeze(['CONE', 'BARRIER', 'DEBRIS', 'BLOCK'] as const);
export type HazardObstacleType = (typeof HAZARD_OBSTACLE_TYPES)[number];
export const HAZARD_EDGE_POLICIES = Object.freeze(['REJECT_OUTSIDE', 'CLIP_TO_BOUNDS'] as const);
export type HazardEdgePolicy = (typeof HAZARD_EDGE_POLICIES)[number];
export type HazardKind = 'PEDESTRIAN' | 'OBSTACLE';
export type HazardReactionHook = 'BRAKE' | 'STEER';
export type HazardHornCondition = 'IMMINENT_HAZARD' | 'PEDESTRIAN_IN_PATH' | 'OBSTACLE_BLOCKS_PATH';
export type HazardOutcome =
  'PENDING' | 'STOPPED' | 'PASSED_CLEAR' | 'PASSED_CLOSE' | 'CONTACT' | 'RELEASED';
export type HazardObstacleRefusalReason =
  | 'INVALID_ID'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_TYPE'
  | 'INVALID_GEOMETRY'
  | 'INVALID_SCHEDULE'
  | 'UNKNOWN_EDGE_POLICY'
  | 'OUTSIDE_MAP_BOUNDS'
  | 'DEGENERATE_CLIP'
  | 'CAPACITY';
export type HazardHornRefusalReason = 'NO_OPEN_OPPORTUNITY' | 'OPPORTUNITY_ALREADY_USED';
export type HazardGapId =
  | 'CONTACT_WITHOUT_STIMULUS'
  | 'NO_STIMULUS'
  | 'NO_RESOLVED_STIMULUS'
  | 'INCOMPLETE_VEHICLE_COVERAGE'
  | 'NO_OBSTACLE_DATA';

/** A pedestrian is an imminent hazard only at the curb or on the crossing. */
export const HAZARD_PEDESTRIAN_STATES: readonly PedestrianState[] = Object.freeze([
  'WAITING',
  'CROSSING',
]);

export const HAZARD_LIMITS = Object.freeze({
  /** Same admission as the shared collision owner: an obstacle is a named physics box. */
  obstacles: COLLISION_LIMITS.obstacles,
  vehiclesPerStep: 110,
  pedestriansPerStep: 256,
  stimuli: 4096,
  reactions: 4096,
  hornOpportunities: 1024,
  hornUses: 1024,
  hornRefusals: 1024,
  contacts: 1024,
  /** A hazard is only observable inside this range and inside the forward cone. */
  observationRangeM: 80,
  /** Half-angle of the forward cone: 60° each side, 120° total field of view. */
  observationConeRad: Math.PI / 3,
  /** A brake/steer command below these thresholds is not a reaction (a state, not an edge). */
  brakeThreshold: 0.15,
  steerThreshold: 0.25,
  standstillMps: 0.2,
  clearanceM: 0.5,
  stopObservationM: 25,
  hornTimeToHazardS: 3,
  hornRangeM: 60,
  maxHalfSizeM: 50,
  maxIdCodeUnits: 128,
  releaseRangeFactor: 1.25,
  maxScheduledTick: 1_000_000,
  maxJitterTicks: 600,
});

/**
 * The horn has no live input channel today. PBI 163 already declared its driver action as a
 * controlled fixture only; this contract states the same fact instead of pretending a key exists.
 */
export const HAZARD_HORN_CHANNEL = Object.freeze({
  version: '165-horn-channel-v1',
  liveInput: 'UNAVAILABLE' as const,
  fixtureInput: 'CONTROLLED_FIXTURE' as const,
  reason:
    'VehicleCommand exposes no horn field, so the player cannot press a horn yet; the opportunity is proved through a controlled fixture.',
  requiredForLive: Object.freeze([
    'a horn action in the input layer',
    'a horn field or driver-action event on VehicleCommand',
    'an audio/HUD feedback channel for the horn',
  ] as const),
});

export interface HazardObstacleInput {
  readonly id: string;
  readonly type: HazardObstacleType;
  /** Footprint centre on the ground plane; the physics owner places the named box here. */
  readonly positionM: Vector3;
  readonly halfSizeM: Vector3;
  readonly edgePolicy?: HazardEdgePolicy;
  /** Data-driven appearance: the obstacle is absent (and not a hazard) before this tick. */
  readonly activeFromTick?: number;
  /** Explicit deterministic jitter of the appearance tick, derived from the contract seed. */
  readonly activeJitterTicks?: number;
}

export interface HazardObstacle {
  readonly obstacleId: string;
  readonly type: HazardObstacleType;
  readonly positionM: Vector3;
  readonly halfSizeM: Vector3;
  readonly edgePolicy: HazardEdgePolicy;
  readonly edge: Readonly<{ status: 'INSIDE' | 'CLIPPED'; overshootM: number }>;
  /** Exact tick the obstacle appears: `activeFromTick` plus the seeded jitter. */
  readonly appearTick: number;
  /** Facts the composition root registers with the shared named-box channel, verbatim. */
  readonly physics: Readonly<{
    entityId: string;
    kind: 'OBSTACLE';
    positionM: Vector3;
    halfSizeM: Vector3;
  }>;
  readonly learningEligible: null;
}

export interface HazardObstacleRefusal {
  readonly obstacleId: string;
  readonly reason: HazardObstacleRefusalReason;
  readonly detail: string;
}

export interface HazardVehicleFact {
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly controlMode: ControlMode;
  readonly positionM: Vector3;
  /** Forward heading in the XZ plane, `atan2(dz, dx)` — the same convention as lane paths. */
  readonly headingRad: number;
  readonly speedMps: number;
  readonly brake: number;
  readonly steering: number;
  /** Controlled-fixture horn press; there is no live channel yet (see HAZARD_HORN_CHANNEL). */
  readonly horn?: boolean;
}

export interface HazardPedestrianFact {
  readonly pedestrianId: string;
  readonly state: PedestrianState;
  readonly positionM: Vector3;
}

/** Authoritative contact reported by the collision owner; this module never invents impacts. */
export interface HazardContactFact {
  readonly vehicleId: string;
  readonly hazardId: string;
  readonly tick: number;
  readonly impulseNs: number;
}

export interface HazardStepInput {
  readonly tick: number;
  readonly vehicles: readonly HazardVehicleFact[];
  /** True only when the caller enumerated every vehicle that can meet a hazard. */
  readonly vehiclesComplete: boolean;
  readonly pedestrians?: readonly HazardPedestrianFact[];
  readonly contacts?: readonly HazardContactFact[];
}

/** Exact, observable debut of a hazard for one vehicle. Identity never depends on the tick. */
export interface HazardStimulus {
  readonly stimulusId: string;
  readonly hazardId: string;
  readonly kind: HazardKind;
  readonly tick: number;
  readonly positionM: Vector3;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly controlMode: ControlMode;
  /** Planar distance to the hazard centre at the onset tick. */
  readonly distanceM: number;
  readonly closingSpeedMps: number;
  readonly timeToHazardS: number | null;
  readonly learningEligible: null;
}

export interface HazardReaction {
  readonly reactionId: string;
  readonly stimulusId: string;
  readonly vehicleId: string;
  readonly hook: HazardReactionHook;
  readonly tick: number;
  readonly latencyTicks: number;
  readonly latencyS: number;
  readonly brake: number;
  readonly steering: number;
  readonly learningEligible: null;
}

export interface HazardHornOpportunity {
  readonly opportunityId: string;
  readonly stimulusId: string;
  readonly vehicleId: string;
  readonly openedTick: number;
  readonly closedTick: number | null;
  readonly conditions: readonly HazardHornCondition[];
  readonly distanceM: number;
  readonly timeToHazardS: number | null;
  readonly learningEligible: null;
}

export interface HazardHornUse {
  readonly hornId: string;
  readonly opportunityId: string;
  readonly stimulusId: string;
  readonly vehicleId: string;
  readonly tick: number;
  /** Latency from the moment the horn opportunity opened. */
  readonly latencyTicks: number;
  /** Latency from the observable hazard onset; the two differ when the opportunity opens later. */
  readonly stimulusLatencyTicks: number;
  readonly source: 'CONTROLLED_FIXTURE';
  readonly learningEligible: null;
}

export interface HazardHornRefusal {
  readonly tick: number;
  readonly vehicleId: string;
  readonly reason: HazardHornRefusalReason;
}

export interface HazardEncounter {
  readonly stimulusId: string;
  readonly hazardId: string;
  readonly kind: HazardKind;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly controlMode: ControlMode;
  readonly onsetTick: number;
  readonly outcome: HazardOutcome;
  readonly resolvedTick: number | null;
  readonly minimumDistanceM: number;
  readonly reactionTick: number | null;
  readonly latencyTicks: number | null;
  readonly hornOpportunityId: string | null;
  readonly hornUsedTick: number | null;
  readonly contactTick: number | null;
  readonly contactImpulseNs: number;
  readonly learningEligible: null;
}

export interface HazardRate {
  readonly id: 'REACTION_RATE';
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
  readonly status: 'OBSERVED' | 'MISSING';
  readonly reason: 'NO_RESOLVED_STIMULUS' | 'INCOMPLETE_VEHICLE_COVERAGE' | null;
}

export interface HazardInspection {
  readonly counts: Readonly<{
    obstacles: number;
    refusedObstacles: number;
    stimuli: number;
    reactions: number;
    brakeReactions: number;
    steerReactions: number;
    hornOpportunities: number;
    hornUses: number;
    hornRefusals: number;
    hornRefusalsNoOpportunity: number;
    hornRefusalsAlreadyUsed: number;
    stopped: number;
    passedClear: number;
    passedClose: number;
    contacts: number;
    released: number;
    pending: number;
  }>;
  readonly coverage: Readonly<{
    steps: number;
    completeSteps: number;
    incompleteSteps: number;
    vehiclesObserved: number;
  }>;
  readonly latency: Readonly<{
    reactions: number;
    minTicks: number;
    meanTicks: number;
    maxTicks: number;
    minS: number;
    meanS: number;
    maxS: number;
  }> | null;
  readonly denominators: Readonly<{ reactionRate: HazardRate }>;
  readonly gaps: readonly Readonly<{ id: HazardGapId; detail: string }>[];
}

export interface HazardStats {
  readonly mapId: string;
  readonly seed: number;
  readonly obstacles: number;
  readonly refusedObstacles: number;
  readonly stimuli: number;
  readonly reactions: number;
  readonly hornOpportunities: number;
  readonly hornUses: number;
  readonly contacts: number;
  readonly steps: number;
  readonly evaluationCost: Readonly<{
    hazardEvaluations: number;
    vehicleEvaluations: number;
    peakHazardsPerStep: number;
    peakVehiclesPerStep: number;
  }>;
  readonly watermark: number;
  readonly disposed: boolean;
}

export interface HazardStep {
  readonly tick: number;
  readonly stimuli: readonly HazardStimulus[];
  readonly reactions: readonly HazardReaction[];
  readonly hornOpportunities: readonly HazardHornOpportunity[];
  readonly hornUses: readonly HazardHornUse[];
  readonly hornRefusals: readonly HazardHornRefusal[];
}

export interface HazardOptions {
  /** Explicit determinism seed: it derives obstacle appearance jitter, nothing else. */
  readonly seed: number;
  /** Obstacles are data, not scene constants; invalid entries are refused and reported. */
  readonly obstacles?: readonly unknown[];
  readonly observationRangeM?: number;
  readonly observationConeRad?: number;
  readonly brakeThreshold?: number;
  readonly steerThreshold?: number;
  readonly standstillMps?: number;
  readonly clearanceM?: number;
  readonly stopObservationM?: number;
  readonly hornTimeToHazardS?: number;
  readonly hornRangeM?: number;
  readonly maxStimuli?: number;
}

export interface Hazards {
  readonly version: string;
  readonly mapId: string;
  readonly seed: number;
  getObstacles(): readonly HazardObstacle[];
  getRefusedObstacles(): readonly HazardObstacleRefusal[];
  getStimuli(): readonly HazardStimulus[];
  getEncounters(): readonly HazardEncounter[];
  getReactions(): readonly HazardReaction[];
  getHornOpportunities(): readonly HazardHornOpportunity[];
  getHornUses(): readonly HazardHornUse[];
  getHornRefusals(): readonly HazardHornRefusal[];
  getInspection(): HazardInspection;
  getStats(): HazardStats;
  step(value: unknown): HazardStep;
  dispose(): void;
}

const EPSILON = 1e-9;
const TICK_S = 1 / FIXED_TICK_HZ;
const MAX_IDENTITY_PART = 128;
const PEDESTRIAN_STATES: readonly PedestrianState[] = Object.freeze([
  'ON_SIDEWALK',
  'WAITING',
  'CROSSING',
  'CROSSED',
  'WITHDRAWN',
]);
const CONTROL_MODES: readonly ControlMode[] = Object.freeze(['AUTO', 'MANUAL', 'LEARNING']);

interface ObstacleBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface EncounterState {
  readonly stimulus: HazardStimulus;
  /** Latest signed distance ahead of the vehicle; a sign change means the vehicle passed. */
  aheadM: number;
  outcome: HazardOutcome;
  resolvedTick: number | null;
  minimumDistanceM: number;
  brakeArmed: boolean;
  steerArmed: boolean;
  reactionTick: number | null;
  hornOpportunityId: string | null;
  hornUsedTick: number | null;
  contactTick: number | null;
  contactImpulseNs: number;
  coverageCompleteAtResolution: boolean;
}

interface ResolvedHazardOptions {
  readonly seed: number;
  readonly obstacles: readonly unknown[];
  readonly observationRangeM: number;
  readonly observationConeRad: number;
  readonly brakeThreshold: number;
  readonly steerThreshold: number;
  readonly standstillMps: number;
  readonly clearanceM: number;
  readonly stopObservationM: number;
  readonly hornTimeToHazardS: number;
  readonly hornRangeM: number;
  readonly maxStimuli: number;
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function boxOf(obstacle: {
  readonly positionM: Vector3;
  readonly halfSizeM: Vector3;
}): ObstacleBox {
  return Object.freeze({
    minX: obstacle.positionM.x - obstacle.halfSizeM.x,
    maxX: obstacle.positionM.x + obstacle.halfSizeM.x,
    minZ: obstacle.positionM.z - obstacle.halfSizeM.z,
    maxZ: obstacle.positionM.z + obstacle.halfSizeM.z,
  });
}

function distanceToBox(point: Vector3, box: ObstacleBox): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

function readPoint(value: unknown, message: string): Vector3 {
  const data = record(value);
  const x = data.x,
    y = data.y,
    z = data.z;
  requireContract(
    typeof x === 'number' &&
      typeof y === 'number' &&
      typeof z === 'number' &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Math.abs(x) <= 1e6 &&
      Math.abs(y) <= 1e6 &&
      Math.abs(z) <= 1e6,
    `${message}: expected finite point`,
  );
  return Object.freeze({ x, y, z });
}

function finitePoint(value: unknown): Vector3 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const data = record(value),
    x = data.x,
    y = data.y,
    z = data.z;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    Math.abs(x) > 1e6 ||
    Math.abs(y) > 1e6 ||
    Math.abs(z) > 1e6
  )
    return null;
  return Object.freeze({ x, y, z });
}

function readIdentity(value: unknown, message: string): string {
  const id = text(value);
  requireContract(id.length <= MAX_IDENTITY_PART, message);
  return id;
}

function readNumber(value: unknown, minimum: number, maximum: number, message: string): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    message,
  );
  return value;
}

function readBoolean(value: unknown, message: string): boolean {
  requireContract(typeof value === 'boolean', message);
  return value;
}

function readFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  message: string,
): Record<string, unknown> {
  const own = record(value);
  for (const key of Object.keys(own))
    requireContract(required.includes(key) || optional.includes(key), message);
  for (const key of required) requireContract(Object.hasOwn(own, key), message);
  return own;
}

function obstacleAppearance(
  input: HazardObstacleInput,
  seed: number,
):
  | { readonly appearTick: number }
  | { readonly refusal: HazardObstacleRefusalReason; readonly detail: string } {
  const activeFromTick = input.activeFromTick ?? 0,
    jitterTicks = input.activeJitterTicks ?? 0;
  if (
    !Number.isSafeInteger(activeFromTick) ||
    activeFromTick < 0 ||
    activeFromTick > HAZARD_LIMITS.maxScheduledTick
  )
    return {
      refusal: 'INVALID_SCHEDULE',
      detail: `activeFromTick=${String(input.activeFromTick)}`,
    };
  if (
    !Number.isSafeInteger(jitterTicks) ||
    jitterTicks < 0 ||
    jitterTicks > HAZARD_LIMITS.maxJitterTicks
  )
    return {
      refusal: 'INVALID_SCHEDULE',
      detail: `activeJitterTicks=${String(input.activeJitterTicks)}`,
    };
  if (jitterTicks > 0 && input.activeFromTick === undefined)
    return { refusal: 'INVALID_SCHEDULE', detail: 'jitter without activeFromTick' };
  const offset =
    jitterTicks === 0
      ? 0
      : Math.floor(randomUnit(seed, `hazard-obstacle:${input.id}`) * (jitterTicks + 1));
  return { appearTick: activeFromTick + Math.min(offset, jitterTicks) };
}

function planarEdges(
  input: HazardObstacleInput,
  policy: HazardEdgePolicy,
  bounds: Bounds,
):
  | {
      readonly status: 'INSIDE' | 'CLIPPED';
      readonly positionM: Vector3;
      readonly halfSizeM: Vector3;
      readonly overshootM: number;
    }
  | { readonly refusal: HazardObstacleRefusalReason; readonly detail: string } {
  const left = input.positionM.x - input.halfSizeM.x,
    right = input.positionM.x + input.halfSizeM.x,
    back = input.positionM.z - input.halfSizeM.z,
    front = input.positionM.z + input.halfSizeM.z;
  const overshootM = Math.max(
    0,
    bounds.minX - left,
    right - bounds.maxX,
    bounds.minZ - back,
    front - bounds.maxZ,
  );
  if (overshootM <= EPSILON)
    return Object.freeze({
      status: 'INSIDE' as const,
      positionM: input.positionM,
      halfSizeM: input.halfSizeM,
      overshootM: 0,
    });
  if (policy === 'REJECT_OUTSIDE')
    return { refusal: 'OUTSIDE_MAP_BOUNDS', detail: `overshoot ${overshootM.toFixed(3)} m` };
  const minX = Math.max(left, bounds.minX),
    maxX = Math.min(right, bounds.maxX),
    minZ = Math.max(back, bounds.minZ),
    maxZ = Math.min(front, bounds.maxZ),
    halfSizeM = Object.freeze({
      x: (maxX - minX) / 2,
      y: input.halfSizeM.y,
      z: (maxZ - minZ) / 2,
    });
  if (halfSizeM.x <= EPSILON || halfSizeM.z <= EPSILON)
    return {
      refusal: 'DEGENERATE_CLIP',
      detail: `clipped footprint ${halfSizeM.x.toFixed(3)} × ${halfSizeM.z.toFixed(3)} m`,
    };
  return Object.freeze({
    status: 'CLIPPED' as const,
    positionM: Object.freeze({
      x: (minX + maxX) / 2,
      y: input.positionM.y,
      z: (minZ + maxZ) / 2,
    }),
    halfSizeM,
    overshootM,
  });
}

function obstacleEntries(
  values: readonly unknown[],
  bounds: Bounds,
  seed: number,
): {
  readonly obstacles: readonly HazardObstacle[];
  readonly refusals: readonly HazardObstacleRefusal[];
} {
  const obstacles: HazardObstacle[] = [],
    refusals: HazardObstacleRefusal[] = [],
    seen = new Set<string>();
  for (const value of values) {
    const own = readFields(
        value,
        ['id', 'type', 'positionM', 'halfSizeM'],
        ['edgePolicy', 'activeFromTick', 'activeJitterTicks'],
        'Missing or unknown obstacle contract fields',
      ),
      rawId = own.id,
      id = typeof rawId === 'string' ? rawId : '';
    const refuse = (reason: HazardObstacleRefusalReason, detail: string) => {
      refusals.push(Object.freeze({ obstacleId: id || '<invalid>', reason, detail }));
    };
    if (!id || id !== id.trim() || id.length > HAZARD_LIMITS.maxIdCodeUnits) {
      refuse('INVALID_ID', `id length ${id.length}`);
      continue;
    }
    if (seen.has(id)) {
      refuse('DUPLICATE_ID', `duplicate ${id}`);
      continue;
    }
    seen.add(id);
    if (obstacles.length >= HAZARD_LIMITS.obstacles) {
      refuse('CAPACITY', `cap ${HAZARD_LIMITS.obstacles}`);
      continue;
    }
    if (!HAZARD_OBSTACLE_TYPES.includes(own.type as HazardObstacleType)) {
      refuse('UNKNOWN_TYPE', String(own.type));
      continue;
    }
    const positionM = finitePoint(own.positionM),
      halfSizeM = finitePoint(own.halfSizeM);
    if (!positionM || !halfSizeM) {
      refuse('INVALID_GEOMETRY', 'non-finite position or half size');
      continue;
    }
    if (
      halfSizeM.x <= 0 ||
      halfSizeM.y <= 0 ||
      halfSizeM.z <= 0 ||
      halfSizeM.x > HAZARD_LIMITS.maxHalfSizeM ||
      halfSizeM.y > HAZARD_LIMITS.maxHalfSizeM ||
      halfSizeM.z > HAZARD_LIMITS.maxHalfSizeM
    ) {
      refuse(
        'INVALID_GEOMETRY',
        `half size ${halfSizeM.x},${halfSizeM.y},${halfSizeM.z} outside (0, ${HAZARD_LIMITS.maxHalfSizeM}]`,
      );
      continue;
    }
    if (
      own.edgePolicy !== undefined &&
      !HAZARD_EDGE_POLICIES.includes(own.edgePolicy as HazardEdgePolicy)
    ) {
      refuse('UNKNOWN_EDGE_POLICY', String(own.edgePolicy));
      continue;
    }
    if (
      own.activeFromTick !== undefined &&
      (typeof own.activeFromTick !== 'number' ||
        !Number.isSafeInteger(own.activeFromTick) ||
        own.activeFromTick < 0 ||
        own.activeFromTick > HAZARD_LIMITS.maxScheduledTick)
    ) {
      refuse('INVALID_SCHEDULE', `activeFromTick=${String(own.activeFromTick)}`);
      continue;
    }
    if (
      own.activeJitterTicks !== undefined &&
      (typeof own.activeJitterTicks !== 'number' ||
        !Number.isSafeInteger(own.activeJitterTicks) ||
        own.activeJitterTicks < 0 ||
        own.activeJitterTicks > HAZARD_LIMITS.maxJitterTicks)
    ) {
      refuse('INVALID_SCHEDULE', `activeJitterTicks=${String(own.activeJitterTicks)}`);
      continue;
    }
    const input: HazardObstacleInput = Object.freeze({
      id,
      type: own.type as HazardObstacleType,
      positionM,
      halfSizeM,
      ...(own.edgePolicy !== undefined ? { edgePolicy: own.edgePolicy as HazardEdgePolicy } : {}),
      ...(own.activeFromTick !== undefined ? { activeFromTick: own.activeFromTick } : {}),
      ...(own.activeJitterTicks !== undefined ? { activeJitterTicks: own.activeJitterTicks } : {}),
    });
    const policy = input.edgePolicy ?? 'REJECT_OUTSIDE',
      edges = planarEdges(input, policy, bounds);
    if ('refusal' in edges) {
      refuse(edges.refusal, edges.detail);
      continue;
    }
    const appearance = obstacleAppearance(input, seed);
    if ('refusal' in appearance) {
      refuse(appearance.refusal, appearance.detail);
      continue;
    }
    obstacles.push(
      Object.freeze({
        obstacleId: id,
        type: input.type,
        positionM: edges.positionM,
        halfSizeM: edges.halfSizeM,
        edgePolicy: policy,
        edge: Object.freeze({ status: edges.status, overshootM: edges.overshootM }),
        appearTick: appearance.appearTick,
        physics: Object.freeze({
          entityId: id,
          kind: 'OBSTACLE' as const,
          positionM: edges.positionM,
          halfSizeM: edges.halfSizeM,
        }),
        learningEligible: null,
      }),
    );
  }
  return Object.freeze({
    obstacles: Object.freeze(obstacles),
    refusals: Object.freeze(refusals),
  });
}

function readVehicle(value: unknown): HazardVehicleFact {
  const own = readFields(
      value,
      [
        'vehicleId',
        'incarnation',
        'controlMode',
        'positionM',
        'headingRad',
        'speedMps',
        'brake',
        'steering',
      ],
      ['horn'],
      'Missing or unknown vehicle fact fields',
    ),
    controlMode = own.controlMode;
  requireContract(CONTROL_MODES.includes(controlMode as ControlMode), 'Unsupported control mode');
  return Object.freeze({
    vehicleId: readIdentity(own.vehicleId, 'Vehicle identity exceeds capacity'),
    incarnation: readIdentity(own.incarnation, 'Vehicle incarnation exceeds capacity'),
    controlMode: controlMode as ControlMode,
    positionM: readPoint(own.positionM, 'Vehicle position'),
    headingRad: readNumber(own.headingRad, -1e6, 1e6, 'Invalid vehicle heading'),
    speedMps: readNumber(own.speedMps, -1e3, 1e3, 'Invalid vehicle speed'),
    brake: readNumber(own.brake, 0, 1, 'Invalid vehicle brake'),
    steering: readNumber(own.steering, -1, 1, 'Invalid vehicle steering'),
    ...(own.horn === undefined ? {} : { horn: readBoolean(own.horn, 'Invalid horn flag') }),
  });
}

function readPedestrian(value: unknown): HazardPedestrianFact {
  const own = readFields(
    value,
    ['pedestrianId', 'state', 'positionM'],
    [],
    'Missing or unknown pedestrian fact fields',
  );
  requireContract(
    PEDESTRIAN_STATES.includes(own.state as PedestrianState),
    'Unsupported pedestrian state',
  );
  return Object.freeze({
    pedestrianId: readIdentity(own.pedestrianId, 'Pedestrian identity exceeds capacity'),
    state: own.state as PedestrianState,
    positionM: readPoint(own.positionM, 'Pedestrian position'),
  });
}

function readContact(value: unknown): HazardContactFact {
  const own = readFields(
    value,
    ['vehicleId', 'hazardId', 'tick', 'impulseNs'],
    [],
    'Missing or unknown contact fact fields',
  );
  return Object.freeze({
    vehicleId: readIdentity(own.vehicleId, 'Vehicle identity exceeds capacity'),
    hazardId: readIdentity(own.hazardId, 'Hazard identity exceeds capacity'),
    tick: readTick(own.tick),
    impulseNs: readNumber(own.impulseNs, 0, 1e9, 'Invalid contact impulse'),
  });
}

function readOptions(options: unknown): ResolvedHazardOptions {
  const own = record(options),
    read = (key: string, fallback: number, minimum: number, maximum: number) =>
      own[key] === undefined
        ? fallback
        : readNumber(own[key], minimum, maximum, `Invalid hazard option ${key}`);
  for (const key of Object.keys(own))
    requireContract(
      [
        'seed',
        'obstacles',
        'observationRangeM',
        'observationConeRad',
        'brakeThreshold',
        'steerThreshold',
        'standstillMps',
        'clearanceM',
        'stopObservationM',
        'hornTimeToHazardS',
        'hornRangeM',
        'maxStimuli',
      ].includes(key),
      'Unknown hazard option',
    );
  requireContract(Object.hasOwn(own, 'seed'), 'Hazard options require an explicit seed');
  const seed = readNumber(own.seed, 0, 0xff_ff_ff_ff, 'Expected uint32 hazard seed');
  requireContract(Number.isInteger(seed), 'Expected uint32 hazard seed');
  requireContract(
    own.obstacles === undefined || Array.isArray(own.obstacles),
    'Obstacles must be an array of data definitions',
  );
  return Object.freeze({
    seed,
    obstacles: (own.obstacles as readonly unknown[] | undefined) ?? Object.freeze([]),
    observationRangeM: read('observationRangeM', HAZARD_LIMITS.observationRangeM, 1, 500),
    observationConeRad: read('observationConeRad', HAZARD_LIMITS.observationConeRad, 0, Math.PI),
    brakeThreshold: read('brakeThreshold', HAZARD_LIMITS.brakeThreshold, 0, 1),
    steerThreshold: read('steerThreshold', HAZARD_LIMITS.steerThreshold, 0, 1),
    standstillMps: read('standstillMps', HAZARD_LIMITS.standstillMps, 0, 5),
    clearanceM: read('clearanceM', HAZARD_LIMITS.clearanceM, 0, 10),
    stopObservationM: read('stopObservationM', HAZARD_LIMITS.stopObservationM, 0, 200),
    hornTimeToHazardS: read('hornTimeToHazardS', HAZARD_LIMITS.hornTimeToHazardS, 0, 60),
    hornRangeM: read('hornRangeM', HAZARD_LIMITS.hornRangeM, 0, 500),
    maxStimuli: read('maxStimuli', HAZARD_LIMITS.stimuli, 1, HAZARD_LIMITS.stimuli),
  });
}

export function createHazards(map: unknown, session: unknown, options: unknown): Hazards {
  const roadMap = parseRoadMap(map),
    context = record(session),
    sessionId = text(context.sessionId),
    worldEpoch = readTick(context.worldEpoch),
    resolved = readOptions(options),
    bounds: Bounds = Object.freeze({
      minX: roadMap.bounds.minM.x,
      maxX: roadMap.bounds.maxM.x,
      minZ: roadMap.bounds.minM.z,
      maxZ: roadMap.bounds.maxM.z,
    }),
    parsed = obstacleEntries(resolved.obstacles, bounds, resolved.seed),
    obstacles = parsed.obstacles,
    refused = parsed.refusals,
    boxes = new Map(obstacles.map((obstacle) => [obstacle.obstacleId, boxOf(obstacle)])),
    coneCos = Math.cos(resolved.observationConeRad);

  const stimuli: HazardStimulus[] = [],
    reactions: HazardReaction[] = [],
    hornOpportunities: HazardHornOpportunity[] = [],
    hornUses: HazardHornUse[] = [],
    hornRefusals: HazardHornRefusal[] = [],
    encounters = new Map<string, EncounterState>(),
    stimulusIds = new Set<string>(),
    gapDetails = new Map<HazardGapId, string>();

  let disposed = false,
    lastTick = -1,
    steps = 0,
    completeSteps = 0,
    vehiclesObserved = 0,
    hazardEvaluations = 0,
    vehicleEvaluations = 0,
    peakHazardsPerStep = 0,
    peakVehiclesPerStep = 0,
    watermark = 0,
    brakeReactions = 0,
    steerReactions = 0,
    stopped = 0,
    passedClear = 0,
    passedClose = 0,
    contactsResolved = 0,
    released = 0,
    pending = 0,
    hornRefusalsNoOpportunity = 0,
    hornRefusalsAlreadyUsed = 0;

  const observeGap = (id: HazardGapId, detail: string) => {
    if (!gapDetails.has(id)) gapDetails.set(id, detail);
  };

  function stimulusKey(hazardId: string, vehicleId: string, incarnation: string): string {
    return `${hazardId}\u0000${vehicleId}\u0000${incarnation}`;
  }

  function stimulusIdentity(hazardId: string, vehicleId: string, incarnation: string): string {
    // Identity is physical, not observational: it never includes the observation tick.
    return `id-v1:hazard-stimulus:${[
      sessionId,
      String(worldEpoch),
      hazardId,
      vehicleId,
      incarnation,
    ]
      .map((part) => encodeURIComponent(part))
      .join('|')}`;
  }

  function createStimulus(
    vehicle: HazardVehicleFact,
    kind: HazardKind,
    hazardId: string,
    positionM: Vector3,
    tick: number,
    key: string,
  ): HazardStimulus {
    requireContract(stimuli.length < resolved.maxStimuli, 'Hazard stimulus capacity exceeded');
    const dx = positionM.x - vehicle.positionM.x,
      dz = positionM.z - vehicle.positionM.z,
      distance = Math.hypot(dx, dz),
      forwardX = Math.cos(vehicle.headingRad),
      forwardZ = Math.sin(vehicle.headingRad),
      closing =
        distance > EPSILON ? vehicle.speedMps * ((dx * forwardX + dz * forwardZ) / distance) : 0,
      stimulus: HazardStimulus = Object.freeze({
        stimulusId: stimulusIdentity(hazardId, vehicle.vehicleId, vehicle.incarnation),
        hazardId,
        kind,
        tick,
        positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
        vehicleId: vehicle.vehicleId,
        incarnation: vehicle.incarnation,
        controlMode: vehicle.controlMode,
        distanceM: distance,
        closingSpeedMps: closing,
        timeToHazardS: closing > 0.1 ? distance / closing : null,
        learningEligible: null,
      });
    stimuli.push(stimulus);
    stimulusIds.add(key);
    watermark = Math.max(watermark, stimuli.length);
    encounters.set(key, {
      stimulus,
      aheadM: distance > EPSILON ? dx * forwardX + dz * forwardZ : 0,
      outcome: 'PENDING',
      resolvedTick: null,
      minimumDistanceM: distance,
      brakeArmed: vehicle.brake < resolved.brakeThreshold,
      steerArmed: Math.abs(vehicle.steering) < resolved.steerThreshold,
      reactionTick: null,
      hornOpportunityId: null,
      hornUsedTick: null,
      contactTick: null,
      contactImpulseNs: 0,
      coverageCompleteAtResolution: false,
    });
    return stimulus;
  }

  function resolve(
    encounter: EncounterState,
    outcome: Exclude<HazardOutcome, 'PENDING'>,
    tick: number,
    complete: boolean,
  ) {
    if (encounter.outcome !== 'PENDING') return;
    encounter.outcome = outcome;
    encounter.resolvedTick = tick;
    encounter.coverageCompleteAtResolution = complete;
    if (outcome === 'STOPPED') stopped += 1;
    else if (outcome === 'PASSED_CLEAR') passedClear += 1;
    else if (outcome === 'PASSED_CLOSE') passedClose += 1;
    else if (outcome === 'CONTACT') contactsResolved += 1;
    else released += 1;
    const opportunityId = encounter.hornOpportunityId;
    if (opportunityId === null) return;
    const index = hornOpportunities.findIndex((entry) => entry.opportunityId === opportunityId);
    if (index >= 0)
      hornOpportunities[index] = Object.freeze({
        ...hornOpportunities[index]!,
        closedTick: tick,
      });
  }

  function hornConditions(
    kind: HazardKind,
    distance: number,
    timeToHazardS: number | null,
    pedestrianState: PedestrianState | null,
    lateralM: number,
    box: ObstacleBox | null,
  ): readonly HazardHornCondition[] {
    const conditions: HazardHornCondition[] = [];
    if (timeToHazardS !== null && timeToHazardS <= resolved.hornTimeToHazardS)
      conditions.push('IMMINENT_HAZARD');
    if (kind === 'PEDESTRIAN' && pedestrianState === 'CROSSING')
      conditions.push('PEDESTRIAN_IN_PATH');
    if (kind === 'OBSTACLE' && box !== null) {
      const halfWidth = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
      if (distance <= resolved.hornRangeM && lateralM <= halfWidth + resolved.clearanceM)
        conditions.push('OBSTACLE_BLOCKS_PATH');
    }
    return Object.freeze(conditions);
  }

  function step(value: unknown): HazardStep {
    requireContract(!disposed, 'Hazards disposed');
    const own = readFields(
        value,
        ['tick', 'vehicles', 'vehiclesComplete'],
        ['pedestrians', 'contacts'],
        'Missing or unknown hazard step fields',
      ),
      tick = readTick(own.tick);
    requireContract(tick > lastTick, 'Hazard step tick must strictly increase');
    lastTick = tick;
    const vehiclesComplete = readBoolean(own.vehiclesComplete, 'Invalid vehicle coverage flag');
    requireContract(Array.isArray(own.vehicles), 'Vehicles must be an array');
    const vehicles: HazardVehicleFact[] = [],
      vehicleIds = new Set<string>();
    for (const entry of own.vehicles as readonly unknown[]) {
      const vehicle = readVehicle(entry);
      requireContract(!vehicleIds.has(vehicle.vehicleId), 'Duplicate vehicle in hazard step');
      vehicleIds.add(vehicle.vehicleId);
      vehicles.push(vehicle);
    }
    requireContract(
      vehicles.length <= HAZARD_LIMITS.vehiclesPerStep,
      'Hazard vehicle capacity exceeded',
    );
    const pedestrians: readonly HazardPedestrianFact[] =
      own.pedestrians === undefined
        ? Object.freeze([])
        : (() => {
            requireContract(Array.isArray(own.pedestrians), 'Pedestrians must be an array');
            const parsedPedestrians: HazardPedestrianFact[] = [],
              seen = new Set<string>();
            for (const entry of own.pedestrians as readonly unknown[]) {
              const pedestrian = readPedestrian(entry);
              requireContract(
                !seen.has(pedestrian.pedestrianId),
                'Duplicate pedestrian in hazard step',
              );
              seen.add(pedestrian.pedestrianId);
              parsedPedestrians.push(pedestrian);
            }
            requireContract(
              parsedPedestrians.length <= HAZARD_LIMITS.pedestriansPerStep,
              'Hazard pedestrian capacity exceeded',
            );
            return Object.freeze(parsedPedestrians);
          })();
    const contacts: readonly HazardContactFact[] =
      own.contacts === undefined
        ? Object.freeze([])
        : (() => {
            requireContract(Array.isArray(own.contacts), 'Contacts must be an array');
            const parsedContacts: HazardContactFact[] = [];
            for (const entry of own.contacts as readonly unknown[]) {
              const contact = readContact(entry);
              requireContract(contact.tick === tick, 'Contact tick must match the step tick');
              parsedContacts.push(contact);
            }
            requireContract(
              parsedContacts.length <= HAZARD_LIMITS.contacts,
              'Hazard contact capacity exceeded',
            );
            return Object.freeze(parsedContacts);
          })();
    const pedestrianMap = new Map(pedestrians.map((entry) => [entry.pedestrianId, entry])),
      activeObstacles = obstacles.filter((obstacle) => tick >= obstacle.appearTick),
      activeObstacleIds = new Set(activeObstacles.map((obstacle) => obstacle.obstacleId)),
      eligiblePedestrianIds = new Set(
        pedestrians
          .filter((pedestrian) => HAZARD_PEDESTRIAN_STATES.includes(pedestrian.state))
          .map((pedestrian) => pedestrian.pedestrianId),
      ),
      activeHazards: readonly {
        readonly kind: HazardKind;
        readonly hazardId: string;
        readonly positionM: Vector3;
      }[] = Object.freeze([
        ...activeObstacles.map((obstacle) => ({
          kind: 'OBSTACLE' as const,
          hazardId: obstacle.obstacleId,
          positionM: obstacle.positionM,
        })),
        ...pedestrians
          .filter((pedestrian) => HAZARD_PEDESTRIAN_STATES.includes(pedestrian.state))
          .map((pedestrian) => ({
            kind: 'PEDESTRIAN' as const,
            hazardId: pedestrian.pedestrianId,
            positionM: pedestrian.positionM,
          })),
      ]),
      stepStimuli: HazardStimulus[] = [],
      stepReactions: HazardReaction[] = [],
      stepOpportunities: HazardHornOpportunity[] = [],
      stepHornUses: HazardHornUse[] = [],
      stepHornRefusals: HazardHornRefusal[] = [];

    steps += 1;
    if (vehiclesComplete) completeSteps += 1;
    vehiclesObserved += vehicles.length;
    peakVehiclesPerStep = Math.max(peakVehiclesPerStep, vehicles.length);
    peakHazardsPerStep = Math.max(peakHazardsPerStep, activeHazards.length);

    // 1. Observable debuts: appearTick-active hazards inside range and inside the forward cone.
    for (const vehicle of vehicles) {
      const forwardX = Math.cos(vehicle.headingRad),
        forwardZ = Math.sin(vehicle.headingRad),
        range2 = resolved.observationRangeM * resolved.observationRangeM;
      for (const hazard of activeHazards) {
        hazardEvaluations += 1;
        const key = stimulusKey(hazard.hazardId, vehicle.vehicleId, vehicle.incarnation);
        if (stimulusIds.has(key)) continue;
        const dx = hazard.positionM.x - vehicle.positionM.x,
          dz = hazard.positionM.z - vehicle.positionM.z,
          distance2 = dx * dx + dz * dz;
        if (distance2 > range2 || distance2 <= EPSILON) continue;
        const distance = Math.sqrt(distance2);
        if ((dx * forwardX + dz * forwardZ) / distance < coneCos) continue;
        stepStimuli.push(
          createStimulus(vehicle, hazard.kind, hazard.hazardId, hazard.positionM, tick, key),
        );
      }
    }
    vehicleEvaluations += vehicles.length;

    // 2. Reactions: a rising edge after the onset, never a state that was already true.
    for (const encounter of encounters.values()) {
      if (encounter.outcome !== 'PENDING' || encounter.reactionTick !== null) continue;
      const vehicle = vehicles.find((entry) => entry.vehicleId === encounter.stimulus.vehicleId);
      if (!vehicle) continue;
      let hook: HazardReactionHook | null = null;
      if (encounter.brakeArmed && vehicle.brake >= resolved.brakeThreshold) hook = 'BRAKE';
      else if (encounter.steerArmed && Math.abs(vehicle.steering) >= resolved.steerThreshold)
        hook = 'STEER';
      if (hook === null) continue;
      if (hook === 'BRAKE') {
        encounter.brakeArmed = false;
        brakeReactions += 1;
      } else {
        encounter.steerArmed = false;
        steerReactions += 1;
      }
      const latencyTicks = tick - encounter.stimulus.tick,
        reaction: HazardReaction = Object.freeze({
          reactionId: `${encounter.stimulus.stimulusId}:reaction`,
          stimulusId: encounter.stimulus.stimulusId,
          vehicleId: vehicle.vehicleId,
          hook,
          tick,
          latencyTicks,
          latencyS: latencyTicks * TICK_S,
          brake: vehicle.brake,
          steering: vehicle.steering,
          learningEligible: null,
        });
      encounter.reactionTick = tick;
      reactions.push(reaction);
      stepReactions.push(reaction);
    }

    // 3. Authoritative contacts: only the collision owner can turn an approach into an impact.
    for (const contact of contacts) {
      const candidates = [...encounters.values()].filter(
        (entry) =>
          entry.stimulus.vehicleId === contact.vehicleId &&
          entry.stimulus.hazardId === contact.hazardId &&
          entry.outcome === 'PENDING',
      );
      const encounter = candidates.at(-1);
      if (!encounter) {
        observeGap(
          'CONTACT_WITHOUT_STIMULUS',
          `contact ${contact.hazardId}â†’${contact.vehicleId} at tick ${tick} without an open hazard stimulus`,
        );
        continue;
      }
      const vehicle = vehicles.find((entry) => entry.vehicleId === contact.vehicleId);
      if (vehicle) {
        const position = hazardPositionOf(encounter.stimulus, pedestrianMap);
        if (position)
          encounter.minimumDistanceM = Math.min(
            encounter.minimumDistanceM,
            surfaceDistance(encounter.stimulus, vehicle.positionM, position),
          );
      }
      encounter.contactTick = tick;
      encounter.contactImpulseNs = contact.impulseNs;
      resolve(encounter, 'CONTACT', tick, vehiclesComplete);
    }

    // 4. Encounter resolution from measured geometry and speed.
    for (const encounter of encounters.values()) {
      if (encounter.outcome !== 'PENDING') continue;
      const vehicle = vehicles.find((entry) => entry.vehicleId === encounter.stimulus.vehicleId);
      if (!vehicle) continue;
      const present =
        encounter.stimulus.kind === 'OBSTACLE'
          ? activeObstacleIds.has(encounter.stimulus.hazardId)
          : eligiblePedestrianIds.has(encounter.stimulus.hazardId);
      const position = present ? hazardPositionOf(encounter.stimulus, pedestrianMap) : null;
      if (!position) {
        resolve(encounter, 'RELEASED', tick, vehiclesComplete);
        continue;
      }
      const dx = position.x - vehicle.positionM.x,
        dz = position.z - vehicle.positionM.z,
        centreDistance = Math.hypot(dx, dz),
        surface = surfaceDistance(encounter.stimulus, vehicle.positionM, position),
        ahead = dx * Math.cos(vehicle.headingRad) + dz * Math.sin(vehicle.headingRad);
      encounter.minimumDistanceM = Math.min(encounter.minimumDistanceM, surface);
      const passed = encounter.aheadM > 0 && ahead <= 0;
      encounter.aheadM = ahead;
      if (passed) {
        resolve(
          encounter,
          encounter.minimumDistanceM > resolved.clearanceM ? 'PASSED_CLEAR' : 'PASSED_CLOSE',
          tick,
          vehiclesComplete,
        );
        continue;
      }
      if (
        Math.abs(vehicle.speedMps) <= resolved.standstillMps &&
        ahead > 0 &&
        surface <= resolved.stopObservationM
      ) {
        resolve(encounter, 'STOPPED', tick, vehiclesComplete);
        continue;
      }
      if (
        ahead < 0 &&
        centreDistance > resolved.observationRangeM * HAZARD_LIMITS.releaseRangeFactor
      )
        resolve(encounter, 'RELEASED', tick, vehiclesComplete);
    }

    // 5. Horn opportunities: observable conditions, opened once per stimulus.
    for (const encounter of encounters.values()) {
      if (encounter.outcome !== 'PENDING') continue;
      const vehicle = vehicles.find((entry) => entry.vehicleId === encounter.stimulus.vehicleId);
      if (!vehicle) continue;
      const position = hazardPositionOf(encounter.stimulus, pedestrianMap);
      if (!position) continue;
      const dx = position.x - vehicle.positionM.x,
        dz = position.z - vehicle.positionM.z,
        distance = Math.hypot(dx, dz),
        forwardX = Math.cos(vehicle.headingRad),
        forwardZ = Math.sin(vehicle.headingRad),
        closing =
          distance > EPSILON ? vehicle.speedMps * ((dx * forwardX + dz * forwardZ) / distance) : 0,
        timeToHazardS = closing > 0.1 ? distance / closing : null,
        lateralM = Math.abs(dx * forwardZ - dz * forwardX),
        conditions = hornConditions(
          encounter.stimulus.kind,
          distance,
          timeToHazardS,
          pedestrianMap.get(encounter.stimulus.hazardId)?.state ?? null,
          lateralM,
          boxes.get(encounter.stimulus.hazardId) ?? null,
        );
      if (conditions.length === 0 || encounter.hornOpportunityId !== null) continue;
      requireContract(
        hornOpportunities.length < HAZARD_LIMITS.hornOpportunities,
        'Horn opportunity capacity exceeded',
      );
      const opportunity: HazardHornOpportunity = Object.freeze({
        opportunityId: `${encounter.stimulus.stimulusId}:horn`,
        stimulusId: encounter.stimulus.stimulusId,
        vehicleId: vehicle.vehicleId,
        openedTick: tick,
        closedTick: null,
        conditions,
        distanceM: distance,
        timeToHazardS,
        learningEligible: null,
      });
      encounter.hornOpportunityId = opportunity.opportunityId;
      hornOpportunities.push(opportunity);
      stepOpportunities.push(opportunity);
    }

    // 6. Horn presses: a fixture can press; a press without an open opportunity is refused.
    for (const vehicle of vehicles) {
      if (vehicle.horn !== true) continue;
      const open = [...encounters.values()]
        .filter((encounter) => encounter.stimulus.vehicleId === vehicle.vehicleId)
        .map((encounter) => ({
          encounter,
          opportunity:
            encounter.hornOpportunityId === null
              ? undefined
              : hornOpportunities.find(
                  (entry) => entry.opportunityId === encounter.hornOpportunityId,
                ),
        }))
        .filter(
          (entry) => entry.opportunity !== undefined && entry.opportunity.closedTick === null,
        );
      if (open.length === 0) {
        requireContract(
          hornRefusals.length < HAZARD_LIMITS.hornRefusals,
          'Horn refusal capacity exceeded',
        );
        const refusal: HazardHornRefusal = Object.freeze({
          tick,
          vehicleId: vehicle.vehicleId,
          reason: 'NO_OPEN_OPPORTUNITY',
        });
        hornRefusals.push(refusal);
        hornRefusalsNoOpportunity += 1;
        stepHornRefusals.push(refusal);
        continue;
      }
      const { encounter, opportunity } = open[0]!;
      if (encounter.hornUsedTick !== null) {
        requireContract(
          hornRefusals.length < HAZARD_LIMITS.hornRefusals,
          'Horn refusal capacity exceeded',
        );
        const refusal: HazardHornRefusal = Object.freeze({
          tick,
          vehicleId: vehicle.vehicleId,
          reason: 'OPPORTUNITY_ALREADY_USED',
        });
        hornRefusals.push(refusal);
        hornRefusalsAlreadyUsed += 1;
        stepHornRefusals.push(refusal);
        continue;
      }
      requireContract(hornUses.length < HAZARD_LIMITS.hornUses, 'Horn use capacity exceeded');
      encounter.hornUsedTick = tick;
      const use: HazardHornUse = Object.freeze({
        hornId: `${opportunity!.opportunityId}:use`,
        opportunityId: opportunity!.opportunityId,
        stimulusId: opportunity!.stimulusId,
        vehicleId: vehicle.vehicleId,
        tick,
        latencyTicks: tick - opportunity!.openedTick,
        stimulusLatencyTicks: tick - encounter.stimulus.tick,
        source: 'CONTROLLED_FIXTURE' as const,
        learningEligible: null,
      });
      hornUses.push(use);
      stepHornUses.push(use);
    }

    pending = 0;
    for (const encounter of encounters.values()) if (encounter.outcome === 'PENDING') pending += 1;

    return Object.freeze({
      tick,
      stimuli: Object.freeze(stepStimuli),
      reactions: Object.freeze(stepReactions),
      hornOpportunities: Object.freeze(stepOpportunities),
      hornUses: Object.freeze(stepHornUses),
      hornRefusals: Object.freeze(stepHornRefusals),
    });
  }

  function surfaceDistance(
    stimulus: HazardStimulus,
    vehiclePositionM: Vector3,
    hazardPositionM: Vector3,
  ): number {
    if (stimulus.kind === 'OBSTACLE') {
      const box = boxes.get(stimulus.hazardId);
      return box ? distanceToBox(vehiclePositionM, box) : Infinity;
    }
    return Math.hypot(
      hazardPositionM.x - vehiclePositionM.x,
      hazardPositionM.z - vehiclePositionM.z,
    );
  }

  function hazardPositionOf(
    stimulus: HazardStimulus,
    pedestrianMap: ReadonlyMap<string, HazardPedestrianFact>,
  ): Vector3 | null {
    if (stimulus.kind === 'OBSTACLE') {
      const box = boxes.get(stimulus.hazardId);
      if (!box) return null;
      return Object.freeze({
        x: (box.minX + box.maxX) / 2,
        y: stimulus.positionM.y,
        z: (box.minZ + box.maxZ) / 2,
      });
    }
    return pedestrianMap.get(stimulus.hazardId)?.positionM ?? null;
  }

  function getInspection(): HazardInspection {
    const resolvedEncounters = [...encounters.values()].filter(
        (encounter) => encounter.outcome !== 'PENDING',
      ),
      completeResolved = resolvedEncounters.filter(
        (encounter) => encounter.coverageCompleteAtResolution,
      ),
      reactedComplete = completeResolved.filter((encounter) => encounter.reactionTick !== null),
      latencies = reactions.map((reaction) => reaction.latencyTicks),
      latency =
        latencies.length === 0
          ? null
          : Object.freeze({
              reactions: latencies.length,
              minTicks: Math.min(...latencies),
              meanTicks: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
              maxTicks: Math.max(...latencies),
              minS: Math.min(...latencies) * TICK_S,
              meanS: (latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * TICK_S,
              maxS: Math.max(...latencies) * TICK_S,
            });
    if (steps > 0 && stimuli.length === 0)
      observeGap('NO_STIMULUS', 'no hazard was observable for any observed vehicle');
    if (obstacles.length === 0)
      observeGap('NO_OBSTACLE_DATA', 'the scene supplied no obstacle data');
    if (resolvedEncounters.length === 0)
      observeGap('NO_RESOLVED_STIMULUS', 'no hazard encounter was resolved');
    else if (completeResolved.length === 0)
      observeGap(
        'INCOMPLETE_VEHICLE_COVERAGE',
        'every resolved encounter had incomplete vehicle coverage',
      );
    const reactionRate: HazardRate =
      completeResolved.length === 0
        ? Object.freeze({
            id: 'REACTION_RATE' as const,
            numerator: 0,
            denominator: 0,
            value: null,
            status: 'MISSING' as const,
            reason:
              resolvedEncounters.length === 0
                ? ('NO_RESOLVED_STIMULUS' as const)
                : ('INCOMPLETE_VEHICLE_COVERAGE' as const),
          })
        : Object.freeze({
            id: 'REACTION_RATE' as const,
            numerator: reactedComplete.length,
            denominator: completeResolved.length,
            value: reactedComplete.length / completeResolved.length,
            status: 'OBSERVED' as const,
            reason: null,
          });
    return Object.freeze({
      counts: Object.freeze({
        obstacles: obstacles.length,
        refusedObstacles: refused.length,
        stimuli: stimuli.length,
        reactions: reactions.length,
        brakeReactions,
        steerReactions,
        hornOpportunities: hornOpportunities.length,
        hornUses: hornUses.length,
        hornRefusals: hornRefusals.length,
        hornRefusalsNoOpportunity,
        hornRefusalsAlreadyUsed,
        stopped,
        passedClear,
        passedClose,
        contacts: contactsResolved,
        released,
        pending,
      }),
      coverage: Object.freeze({
        steps,
        completeSteps,
        incompleteSteps: steps - completeSteps,
        vehiclesObserved,
      }),
      latency,
      denominators: Object.freeze({ reactionRate }),
      gaps: Object.freeze(
        [...gapDetails.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, detail]) => Object.freeze({ id, detail })),
      ),
    });
  }

  return Object.freeze({
    version: HAZARD_VERSION,
    mapId: roadMap.mapId,
    seed: resolved.seed,
    getObstacles: () => obstacles,
    getRefusedObstacles: () => refused,
    getStimuli: () => Object.freeze([...stimuli]),
    getEncounters: () =>
      Object.freeze(
        [...encounters.values()].map((encounter) =>
          Object.freeze({
            stimulusId: encounter.stimulus.stimulusId,
            hazardId: encounter.stimulus.hazardId,
            kind: encounter.stimulus.kind,
            vehicleId: encounter.stimulus.vehicleId,
            incarnation: encounter.stimulus.incarnation,
            controlMode: encounter.stimulus.controlMode,
            onsetTick: encounter.stimulus.tick,
            outcome: encounter.outcome,
            resolvedTick: encounter.resolvedTick,
            minimumDistanceM: encounter.minimumDistanceM,
            reactionTick: encounter.reactionTick,
            latencyTicks:
              encounter.reactionTick === null
                ? null
                : encounter.reactionTick - encounter.stimulus.tick,
            hornOpportunityId: encounter.hornOpportunityId,
            hornUsedTick: encounter.hornUsedTick,
            contactTick: encounter.contactTick,
            contactImpulseNs: encounter.contactImpulseNs,
            learningEligible: null,
          }),
        ),
      ),
    getReactions: () => Object.freeze([...reactions]),
    getHornOpportunities: () => Object.freeze([...hornOpportunities]),
    getHornUses: () => Object.freeze([...hornUses]),
    getHornRefusals: () => Object.freeze([...hornRefusals]),
    getInspection,
    getStats: () =>
      Object.freeze({
        mapId: roadMap.mapId,
        seed: resolved.seed,
        obstacles: obstacles.length,
        refusedObstacles: refused.length,
        stimuli: stimuli.length,
        reactions: reactions.length,
        hornOpportunities: hornOpportunities.length,
        hornUses: hornUses.length,
        contacts: contactsResolved,
        steps,
        evaluationCost: Object.freeze({
          hazardEvaluations,
          vehicleEvaluations,
          peakHazardsPerStep,
          peakVehiclesPerStep,
        }),
        watermark,
        disposed,
      }),
    step,
    dispose: () => {
      disposed = true;
    },
  });
}
