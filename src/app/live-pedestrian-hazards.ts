import type { ContractContext } from '../sessions';
import { FIXED_TICK_HZ } from '../simulation';
import {
  parseTelemetrySample,
  parseV2ContextScenario,
  type TelemetrySample,
  type V2ContextFrame,
  type V2ContextScenario,
  type V2HazardFact,
} from '../telemetry';
import {
  maneuverStates,
  vehicleClass,
  type CollisionIncident,
  type ControlMode,
  type LiveVehicleCommand,
  type Vector3,
  type VehicleClassId,
} from '../vehicles';
import {
  createHazards,
  createPedestrians,
  type HazardEncounter,
  type HazardInspection,
  type HazardObstacle,
  type HazardObstacleInput,
  type HazardPedestrianFact,
  type HazardReaction,
  type HazardStats,
  type HazardStep,
  type HazardStimulus,
  type HazardVehicleFact,
  type Hazards,
  type LaneGraph,
  type PedestrianConflict,
  type PedestrianInspection,
  type PedestrianLink,
  type PedestrianNetwork,
  type PedestrianSnapshot,
  type PedestrianState,
  type PedestrianStats,
  type PedestrianStop,
  type PedestrianVehicleFact,
  type Pedestrians,
  type RoadMap,
} from '../world';

/**
 * PBI 286 — live pedestrians, crossings and hazards.
 *
 * This composition is the only bridge between four already delivered owners:
 *
 * - 164 owns the pedestrian population, the crossing phase and the observable yield facts;
 * - 165 owns the hazard stimuli, the reaction fronts and the obstacle data;
 * - 282 owns the one Rapier world; this module only registers the named hazard boxes and reads the
 *   real 028 incidents of the same step;
 * - 163 owns the V2 context vocabulary; this module only feeds real frames into it.
 *
 * It never creates a second physics world, ledger, pedestrian population or hazard model. A vehicle
 * that yields is proven by the real tick order: the physical stop is observed after the crossing
 * began, and the pedestrian owner classifies that exact episode. An unobservable vehicle makes the
 * step incomplete, so no yield evidence is produced. Hazard obstacles are ordinary named boxes of
 * the same 282 solver, and the reaction command is applied to the next physical step.
 */

export const LIVE_PEDESTRIAN_HAZARDS_VERSION = '286-live-pedestrian-hazards-v1' as const;

/** The prefix that keeps a live hazard box distinguishable from a building or a 285 destructible. */
export const LIVE_HAZARD_OBSTACLE_PREFIX = 'live-hazard:';
/** 282 names every registered box `destructible:<id>`; the live adapter matches the exact name. */
export const LIVE_HAZARD_PHYSICS_PREFIX = 'destructible:live-hazard:';

export const LIVE_PEDESTRIAN_HAZARDS_POLICY = Object.freeze({
  maxPedestrians: 96,
  maxHazardObstacles: 96,
  /** The 028 registry already holds the authored buildings; only the free slots become physical. */
  maxPhysicalHazards: 6,
  /** A hazard is only commanded when it is still ahead within this planar distance. */
  commandRangeM: 45,
  /** A pedestrian is only braked for while actually crossing, not while waiting on the curb. */
  stopForPedestrianM: 32,
  /** An obstacle may be steered around while there is still time to do it. */
  steerLeadS: 1.6,
  /** Gentle heading offset away from the obstacle; 0.16 rad over 30 m is ~4.8 m of clearance. */
  steerGain: 0.08,
  hardBrakeS: 1.1,
  sampleFrames: 1200,
  maxCostSamples: 600,
  incidentCapacity: 4096,
  /** The radius inside which an active hazard becomes a V2 context fact. */
  contextRadiusM: 60,
});

export type LiveHazardObstacleType = HazardObstacle['type'];

export interface LiveHazardPhysicsPort {
  addObstacle(input: {
    readonly id: string;
    readonly centerM: Readonly<{ x: number; y: number; z: number }>;
    readonly halfExtentsM: Readonly<{ x: number; y: number; z: number }>;
  }): boolean;
  removeObstacle(id: string): boolean;
  hasObstacle(id: string): boolean;
  readIncidents(): readonly CollisionIncident[];
  getStats(): Readonly<{
    obstacles: Readonly<{
      active: number;
      capacity: number;
      worldObstacles: number;
      available: number;
      added: number;
      moved: number;
      removed: number;
      refused: number;
    }>;
  }>;
}

/** The authoritative part of one composition vehicle, copied without any simulation logic. */
export interface LivePedestrianVehicleObservation {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly classId: VehicleClassId;
  readonly controlMode: ControlMode;
  readonly positionM: Vector3;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly speedLimitMps: number;
  readonly laneId: string | null;
  readonly blocked: boolean;
  readonly maneuverState: (typeof maneuverStates)[number];
}

export interface LivePedestrianObserveInput {
  readonly tick: number;
  readonly vehicles: readonly LivePedestrianVehicleObservation[];
  /** The exact commands applied to the physical step of this tick, keyed by vehicle. */
  readonly commands: readonly LiveVehicleCommand[];
  /** The real 028 incidents of the same physical step. */
  readonly incidents: readonly CollisionIncident[];
  /** The caller enumerated every vehicle of the world. */
  readonly vehiclesComplete: boolean;
}

export interface LivePedestrianCommandContext {
  readonly tick: number;
  readonly speedMps: number;
  readonly positionM: Vector3;
  readonly yawRad: number;
}

export interface LiveHazardCommandFact {
  readonly tick: number;
  readonly vehicleId: string;
  readonly hazardId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly stage: 'BRAKE' | 'STEER' | 'COAST';
  readonly distanceM: number;
  readonly timeToHazardS: number | null;
  readonly brake: number;
  readonly steering: number;
}

export interface LivePedestrianVisualEntry {
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly state: PedestrianState;
  readonly positionM: Vector3;
  readonly crossingProgress: number;
  readonly direction: 'A_TO_B' | 'B_TO_A';
}

export interface LiveHazardVisualEntry {
  readonly obstacleId: string;
  readonly type: LiveHazardObstacleType;
  readonly positionM: Vector3;
  readonly halfSizeM: Vector3;
  readonly active: boolean;
  readonly physical: boolean;
}

export interface LivePedestrianVisualFrame {
  readonly version: typeof LIVE_PEDESTRIAN_HAZARDS_VERSION;
  readonly tick: number;
  readonly pedestrians: readonly LivePedestrianVisualEntry[];
  readonly hazards: readonly LiveHazardVisualEntry[];
}

export interface LivePedestrianStats {
  readonly version: typeof LIVE_PEDESTRIAN_HAZARDS_VERSION;
  readonly tick: number;
  readonly mapId: string;
  readonly pedestrians: PedestrianStats;
  readonly hazards: HazardStats;
  readonly v2Frames: number;
  readonly physicalHazards: number;
  readonly physicalRefused: number;
  readonly hazardCommands: number;
  readonly lastHazardCommand: LiveHazardCommandFact | null;
  readonly evaluationCost: Readonly<{
    pedestrianEvaluations: number;
    hazardEvaluations: number;
    vehicleEvaluations: number;
    peakHazardsPerStep: number;
  }>;
  readonly stepCost: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly disposed: boolean;
}

export interface LivePedestrianHazards {
  readonly version: typeof LIVE_PEDESTRIAN_HAZARDS_VERSION;
  readonly mapId: string;
  readonly seed: number;
  /** Adds the active hazard boxes of this tick to the one 282 world; idempotent. */
  prepare(tick: number): void;
  /**
   * Applies the hazard reaction to one autonomous command. The physical step of the same tick is
   * the only consumer; a player command is never rewritten.
   */
  adjustCommand(
    vehicleId: string,
    command: LiveVehicleCommand,
    context: LivePedestrianCommandContext,
  ): LiveVehicleCommand;
  /** Observes the post-physics frame exactly once per tick. */
  observe(input: LivePedestrianObserveInput): void;
  getNetwork(): PedestrianNetwork;
  getLinks(): readonly PedestrianLink[];
  getPedestrians(): readonly PedestrianSnapshot[];
  getPedestrian(pedestrianId: string): PedestrianSnapshot | null;
  getConflicts(): readonly PedestrianConflict[];
  getStops(): readonly PedestrianStop[];
  getHazardObstacles(): readonly HazardObstacle[];
  getHazardEncounters(): readonly HazardEncounter[];
  getHazardReactions(): readonly HazardReaction[];
  getHazardStep(): HazardStep | null;
  getPedestrianInspection(): PedestrianInspection;
  getHazardInspection(): HazardInspection;
  /** The last V2 context frame assembled from this tick's real facts, or `null`. */
  getV2Frame(): V2ContextFrame | null;
  /** A bounded V2 scenario over the real live frames, in the exact 163 contract. */
  getV2Scenario(): V2ContextScenario | null;
  getV2Frames(): readonly V2ContextFrame[];
  getStats(): LivePedestrianStats;
  visual(): LivePedestrianVisualFrame;
  dispose(): void;
}

export interface LivePedestrianHazardsOptions {
  readonly context: ContractContext;
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly seed: number;
  readonly physics?: LiveHazardPhysicsPort;
  readonly obstacles?: readonly HazardObstacleInput[];
  readonly maxPedestrians?: number;
  readonly pedestriansPerCrosswalk?: number;
  readonly maxPhysicalHazards?: number;
  /** The vehicle whose real sample becomes the V2 context frame. */
  readonly focusVehicleId?: () => string | null;
  /**
   * A vehicle is only observable when the caller can see it. The default is every enumerated
   * vehicle; a `false` makes the whole step incomplete, which is the honest no-evidence path.
   */
  readonly observableVehicle?: (vehicleId: string, tick: number) => boolean;
  readonly clock?: () => number;
}

const TICK_S = 1 / FIXED_TICK_HZ;

interface HazardCommandState {
  readonly stimulus: HazardStimulus;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly positionM: Vector3;
}

interface LastVehicle {
  readonly observation: LivePedestrianVehicleObservation;
  readonly laneId: string | null;
  readonly command: LiveVehicleCommand | null;
}

function costSummary(samples: readonly number[]) {
  if (samples.length === 0)
    return Object.freeze({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]!;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return Object.freeze({
    samples: sorted.length,
    meanMs: mean,
    p50Ms: at(0.5),
    p95Ms: Math.max(at(0.95), at(0.5)),
    maxMs: sorted[sorted.length - 1]!,
  });
}

function forwardOf(yawRad: number): Readonly<{ x: number; z: number }> {
  return Object.freeze({ x: Math.sin(yawRad), z: Math.cos(yawRad) });
}

function headingFromYaw(yawRad: number): number {
  return Math.atan2(Math.cos(yawRad), Math.sin(yawRad));
}

function quaternionFromYaw(yawRad: number) {
  return Object.freeze({
    x: 0,
    y: Math.sin(yawRad / 2),
    z: 0,
    w: Math.cos(yawRad / 2),
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result <= -Math.PI) result += Math.PI * 2;
  return result;
}

function hazardIncidentObstacleId(otherEntityId: string): string | null {
  if (!otherEntityId.startsWith(LIVE_HAZARD_PHYSICS_PREFIX)) return null;
  return otherEntityId.slice(LIVE_HAZARD_PHYSICS_PREFIX.length);
}

/** A deterministic live plan on real lanes; used by the world and by the 96-hazard cost probe. */
export function planLiveHazardObstacles(
  graph: LaneGraph,
  options: {
    readonly laneIds: readonly string[];
    readonly count?: number;
    readonly distanceM?: number;
    readonly types?: readonly LiveHazardObstacleType[];
  },
): readonly HazardObstacleInput[] {
  const count = Math.max(1, Math.min(96, options.count ?? 1));
  const distanceM = options.distanceM ?? 55;
  const types = options.types ?? ['BARRIER', 'CONE', 'DEBRIS', 'BLOCK'];
  const laneIds = [...options.laneIds].sort();
  const result: HazardObstacleInput[] = [];
  for (const laneId of laneIds) {
    if (result.length >= count) break;
    const path = graph.getDirectedPath(laneId);
    if (path === null || path.lengthM < distanceM + 10) continue;
    const pose = sampleLane(graph, laneId, distanceM);
    if (pose === null) continue;
    const type = types[result.length % types.length]!;
    const halfSizeM =
      type === 'CONE'
        ? Object.freeze({ x: 0.35, y: 0.45, z: 0.35 })
        : type === 'BARRIER'
          ? Object.freeze({ x: 1.8, y: 0.55, z: 0.35 })
          : type === 'DEBRIS'
            ? Object.freeze({ x: 1.1, y: 0.32, z: 0.8 })
            : Object.freeze({ x: 1.2, y: 0.9, z: 1.2 });
    result.push(
      Object.freeze({
        id: `${LIVE_HAZARD_OBSTACLE_PREFIX}${result.length + 1}`,
        type,
        positionM: Object.freeze({
          x: pose.positionM.x,
          y: halfSizeM.y,
          z: pose.positionM.z,
        }),
        halfSizeM,
        activeFromTick: 0,
      }),
    );
  }
  return Object.freeze(result);
}

function sampleLane(graph: LaneGraph, laneId: string, longitudinalM: number) {
  const path = graph.getDirectedPath(laneId);
  if (path === null || path.points.length < 2) return null;
  let remaining = Math.max(0, Math.min(path.lengthM, longitudinalM));
  for (let index = 1; index < path.points.length; index += 1) {
    const from = path.points[index - 1]!,
      to = path.points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (remaining <= length || index === path.points.length - 1) {
      const fraction = length === 0 ? 0 : Math.min(1, remaining / length);
      return Object.freeze({
        positionM: Object.freeze({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        }),
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
      });
    }
    remaining -= length;
  }
  return null;
}

export function createLivePedestrianHazards(
  options: LivePedestrianHazardsOptions,
): LivePedestrianHazards {
  const context: ContractContext = Object.freeze({
    schemaVersion: options.context.schemaVersion,
    units: options.context.units,
    sessionId: options.context.sessionId,
    worldEpoch: options.context.worldEpoch,
  });
  const physics = options.physics ?? null;
  const clock = options.clock ?? (() => performance.now());
  const maxPhysical = Math.max(
    0,
    Math.min(options.maxPhysicalHazards ?? LIVE_PEDESTRIAN_HAZARDS_POLICY.maxPhysicalHazards, 96),
  );
  const pedestrians: Pedestrians = createPedestrians(
    options.map,
    { sessionId: context.sessionId, worldEpoch: context.worldEpoch },
    {
      seed: options.seed,
      maxPedestrians: options.maxPedestrians ?? LIVE_PEDESTRIAN_HAZARDS_POLICY.maxPedestrians,
      pedestriansPerCrosswalk: options.pedestriansPerCrosswalk ?? 2,
    },
  );
  const hazards: Hazards = createHazards(options.map, context, {
    seed: options.seed ^ 0x286,
    obstacles: options.obstacles ?? [],
  });

  const physical = new Map<string, HazardObstacle>();
  const attempted = new Set<string>();
  let physicalRefused = 0;
  let tickWatermark = -1;
  let disposed = false;
  let lastHazardStep: HazardStep | null = null;
  let hazardCommands = 0;
  let lastHazardCommand: LiveHazardCommandFact | null = null;
  let lastVehicles = new Map<string, LastVehicle>();
  const stepCosts: number[] = [];
  const v2Frames: V2ContextFrame[] = [];
  const obstacleById = new Map(hazards.getObstacles().map((entry) => [entry.obstacleId, entry]));

  const prepare = (tick: number): void => {
    if (disposed || physics === null) return;
    const ordered = hazards
      .getObstacles()
      .filter((obstacle) => tick >= obstacle.appearTick)
      .sort((left, right) => (left.obstacleId < right.obstacleId ? -1 : 1));
    for (const obstacle of ordered) {
      if (attempted.has(obstacle.obstacleId)) continue;
      if (physical.size >= maxPhysical) {
        attempted.add(obstacle.obstacleId);
        physicalRefused += 1;
        continue;
      }
      attempted.add(obstacle.obstacleId);
      const added = physics.addObstacle({
        id: obstacle.obstacleId,
        centerM: Object.freeze({
          x: obstacle.positionM.x,
          y: obstacle.positionM.y,
          z: obstacle.positionM.z,
        }),
        halfExtentsM: Object.freeze({
          x: obstacle.halfSizeM.x,
          y: obstacle.halfSizeM.y,
          z: obstacle.halfSizeM.z,
        }),
      });
      if (added) physical.set(obstacle.obstacleId, obstacle);
      else physicalRefused += 1;
    }
  };

  const laneFor = (observation: LivePedestrianVehicleObservation): string | null => {
    const position = {
      x: observation.positionM.x,
      y: observation.positionM.y,
      z: observation.positionM.z,
    };
    const projects = (laneId: string): boolean => {
      const lane = options.map.lanes.find((entry) => entry.id === laneId);
      if (lane === undefined) return false;
      return lane.access.some(
        (access) => options.graph.projectOnLane(laneId, { positionM: position, access }) !== null,
      );
    };
    if (observation.laneId !== null && projects(observation.laneId)) return observation.laneId;
    const located = (['CIVIL', 'TAXI'] as const)
      .map((access) => options.graph.locateLane({ positionM: position, access }))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.distanceM - right.distanceM);
    return located[0]?.lane.id ?? null;
  };

  const laneYawFor = (laneId: string | null, positionM: Vector3, fallbackYaw: number): number => {
    if (laneId === null) return fallbackYaw;
    const lane = options.map.lanes.find((entry) => entry.id === laneId);
    if (lane === undefined) return fallbackYaw;
    for (const access of lane.access) {
      const projection = options.graph.projectOnLane(laneId, { positionM, access });
      if (projection === null) continue;
      const ahead = sampleLane(options.graph, laneId, projection.longitudinalM + 2);
      if (ahead !== null) return Math.PI / 2 - ahead.headingRad;
    }
    return fallbackYaw;
  };

  const hazardPosition = (stimulus: HazardStimulus): Vector3 | null => {
    if (stimulus.kind === 'OBSTACLE') return obstacleById.get(stimulus.hazardId)?.positionM ?? null;
    const pedestrian = pedestrians.getPedestrian(stimulus.hazardId);
    return pedestrian?.positionM ?? null;
  };

  const commandStateFor = (vehicleId: string): readonly HazardCommandState[] => {
    const vehicle = lastVehicles.get(vehicleId);
    if (vehicle === undefined) return Object.freeze([]);
    const byHazard = new Map<string, HazardCommandState>();
    for (const stimulus of hazards.getStimuli()) {
      if (stimulus.vehicleId !== vehicleId) continue;
      const current = pedestrians.getPedestrian(stimulus.hazardId);
      if (stimulus.kind === 'PEDESTRIAN' && current?.state !== 'CROSSING') continue;
      const positionM = hazardPosition(stimulus);
      if (positionM === null) continue;
      const previous = byHazard.get(stimulus.hazardId);
      if (previous === undefined || stimulus.tick >= previous.stimulus.tick)
        byHazard.set(stimulus.hazardId, {
          stimulus,
          kind: stimulus.kind,
          positionM,
        });
    }
    return Object.freeze([...byHazard.values()]);
  };

  const adjustCommand = (
    vehicleId: string,
    command: LiveVehicleCommand,
    at: LivePedestrianCommandContext,
  ): LiveVehicleCommand => {
    if (disposed || command.source !== 'AUTONOMY') return command;
    const states = commandStateFor(vehicleId);
    if (states.length === 0) return command;
    const forward = forwardOf(at.yawRad);
    let danger: {
      readonly state: HazardCommandState;
      readonly distanceM: number;
      readonly aheadM: number;
      readonly ttcS: number | null;
      readonly lateralM: number;
    } | null = null;
    for (const state of states) {
      const dx = state.positionM.x - at.positionM.x,
        dz = state.positionM.z - at.positionM.z;
      const ahead = dx * forward.x + dz * forward.z;
      const distanceM = Math.hypot(dx, dz);
      if (ahead < -2 || distanceM > LIVE_PEDESTRIAN_HAZARDS_POLICY.commandRangeM) continue;
      const ttcS = at.speedMps > 0.5 ? distanceM / at.speedMps : null;
      if (
        danger === null ||
        (ttcS ?? Number.POSITIVE_INFINITY) < (danger.ttcS ?? Number.POSITIVE_INFINITY)
      )
        danger = {
          state,
          distanceM,
          aheadM: ahead,
          ttcS,
          lateralM: dx * forward.z - dz * forward.x,
        };
    }
    if (danger === null) return command;
    const { state, distanceM, aheadM, ttcS, lateralM } = danger;
    const obstacle =
      state.kind === 'OBSTACLE' ? (obstacleById.get(state.stimulus.hazardId) ?? null) : null;
    const lateralClearance =
      obstacle === null ? Number.POSITIVE_INFINITY : obstacle.halfSizeM.x + 1.05;
    if (
      obstacle !== null &&
      aheadM <= obstacle.halfSizeM.z + 2 &&
      Math.abs(lateralM) >= lateralClearance
    ) {
      // The car is alongside the obstacle with a real lateral clearance; it keeps its heading
      // instead of braking in the adjacent path.
      return Object.freeze({
        ...command,
        brake: 0,
        steering: 0,
      });
    }
    const steerAllowed =
      state.kind === 'OBSTACLE' &&
      ttcS !== null &&
      ttcS > LIVE_PEDESTRIAN_HAZARDS_POLICY.steerLeadS &&
      aheadM > (obstacle?.halfSizeM.z ?? 0) + 2;
    const brake = steerAllowed
      ? 0.12
      : ttcS === null || ttcS <= LIVE_PEDESTRIAN_HAZARDS_POLICY.hardBrakeS
        ? 1
        : clamp(0.5 + (1 - ttcS / 3) * 0.5, 0.5, 1);
    const side = Math.abs(lateralM) < 0.2 ? 1 : lateralM > 0 ? -1 : 1;
    const laneYaw = laneYawFor(
      lastVehicles.get(vehicleId)?.laneId ?? null,
      at.positionM,
      at.yawRad,
    );
    const headingError = normalizeAngle(
      laneYaw + side * LIVE_PEDESTRIAN_HAZARDS_POLICY.steerGain - at.yawRad,
    );
    const steering = steerAllowed ? clamp(headingError * 1.5, -0.12, 0.12) : 0;
    const stage: LiveHazardCommandFact['stage'] = steerAllowed ? 'STEER' : 'BRAKE';
    const applied: LiveVehicleCommand = Object.freeze({
      ...command,
      throttle: steerAllowed ? Math.max(command.throttle, 0.25) : 0,
      brake: steerAllowed ? 0 : Math.max(command.brake, brake),
      steering,
      handbrake: false,
      driveIntent:
        steerAllowed && command.throttle === 0
          ? Object.freeze({
              version: '027-braking-reverse-v1' as const,
              direction: 'FORWARD' as const,
              shiftBrake: 0,
            })
          : command.driveIntent,
    });
    hazardCommands += 1;
    lastHazardCommand = Object.freeze({
      tick: at.tick,
      vehicleId,
      hazardId: state.stimulus.hazardId,
      kind: state.kind,
      stage,
      distanceM,
      timeToHazardS: ttcS,
      brake: applied.brake,
      steering: applied.steering,
    });
    return applied;
  };

  const obstacleContacts = (
    incidents: readonly CollisionIncident[],
    tick: number,
  ): readonly { vehicleId: string; hazardId: string; tick: number; impulseNs: number }[] => {
    const result: { vehicleId: string; hazardId: string; tick: number; impulseNs: number }[] = [];
    for (const incident of incidents) {
      const hazardId = hazardIncidentObstacleId(incident.otherEntityId);
      if (hazardId === null) continue;
      result.push({
        vehicleId: incident.vehicleId,
        hazardId,
        tick,
        impulseNs: incident.impulseNs,
      });
    }
    return Object.freeze(result);
  };

  const v2Frame = (
    tick: number,
    vehicles: readonly LivePedestrianVehicleObservation[],
    commands: readonly LiveVehicleCommand[],
  ): V2ContextFrame | null => {
    const focusId = options.focusVehicleId?.() ?? vehicles[0]?.vehicleId ?? null;
    if (focusId === null) return null;
    let vehicle = vehicles.find((entry) => entry.vehicleId === focusId);
    let command = commands.find((entry) => entry.vehicleId === focusId);
    if (vehicle === undefined || command === undefined) {
      const fallback = vehicles.find((entry) =>
        commands.some((candidate) => candidate.vehicleId === entry.vehicleId),
      );
      const fallbackCommand =
        fallback === undefined
          ? undefined
          : commands.find((entry) => entry.vehicleId === fallback.vehicleId);
      if (fallback === undefined || fallbackCommand === undefined) return null;
      vehicle = fallback;
      command = fallbackCommand;
    }
    const previous = lastVehicles.get(focusId);
    const acceleration =
      previous === undefined ? 0 : (vehicle.speedMps - previous.observation.speedMps) / TICK_S;
    const speed = Math.max(0, vehicle.speedMps);
    const forward = forwardOf(vehicle.yawRad);
    const lane =
      vehicle.laneId === null
        ? null
        : options.map.lanes.find((entry) => entry.id === vehicle.laneId);
    const classConfig = vehicleClass(vehicle.classId);
    const hazardsFact: V2HazardFact[] = [];
    for (const snapshot of pedestrians.getPedestrians()) {
      if (snapshot.state !== 'WAITING' && snapshot.state !== 'CROSSING') continue;
      const distance = Math.hypot(
        snapshot.positionM.x - vehicle.positionM.x,
        snapshot.positionM.z - vehicle.positionM.z,
      );
      if (distance > LIVE_PEDESTRIAN_HAZARDS_POLICY.contextRadiusM) continue;
      hazardsFact.push(
        Object.freeze({
          entityId: snapshot.pedestrianId,
          kind: 'PEDESTRIAN' as const,
          radiusM: 0.4,
          active: true,
          observable: true,
        }),
      );
    }
    for (const obstacle of hazards.getObstacles()) {
      if (tick < obstacle.appearTick) continue;
      const distance = Math.hypot(
        obstacle.positionM.x - vehicle.positionM.x,
        obstacle.positionM.z - vehicle.positionM.z,
      );
      if (distance > LIVE_PEDESTRIAN_HAZARDS_POLICY.contextRadiusM) continue;
      hazardsFact.push(
        Object.freeze({
          entityId: obstacle.obstacleId,
          kind: 'OBSTACLE' as const,
          radiusM: Math.max(obstacle.halfSizeM.x, obstacle.halfSizeM.z),
          active: true,
          observable: true,
        }),
      );
    }
    const sample: TelemetrySample = parseTelemetrySample({
      tick,
      state: {
        ...context,
        vehicleId: vehicle.vehicleId,
        classId: vehicle.classId,
        tick,
        transform: {
          positionM: {
            x: vehicle.positionM.x,
            y: vehicle.positionM.y + 0.5,
            z: vehicle.positionM.z,
          },
          rotationQuaternion: quaternionFromYaw(vehicle.yawRad),
        },
        velocityMps: { x: forward.x * speed, y: 0, z: forward.z * speed },
        laneId: vehicle.laneId,
        controlMode: vehicle.controlMode,
        appliedProfileVersion: 'v3-composition-1',
        maneuverState: vehicle.maneuverState,
      },
      command: {
        ...context,
        vehicleId: vehicle.vehicleId,
        tick,
        throttle: command.throttle,
        brake: command.brake,
        steering: command.steering,
        handbrake: command.handbrake,
        turnSignal: command.turnSignal,
        source: command.source,
      },
      rawInput: {
        throttle: command.throttle,
        brake: command.brake,
        steering: command.steering,
        handbrake: command.handbrake,
      },
      longitudinalAccelerationMps2: acceleration,
      lateralAccelerationMps2: 0,
      capabilities: {
        maxAccelerationMps2: classConfig.engineForceN / classConfig.massKg,
        maxDecelerationMps2: classConfig.brakeAcceleration,
        maxLateralAccelerationMps2: classConfig.grip * 9.81,
      },
      context: {
        roadType:
          lane !== null && lane !== undefined && lane.speedLimitMps >= 16
            ? 'ARTERIAL'
            : lane !== null && lane !== undefined && lane.speedLimitMps <= 9
              ? 'RESIDENTIAL'
              : 'URBAN',
        speedLimitMps: vehicle.speedLimitMps,
        curvaturePerM: 0,
        leaderId: null,
        leaderGapM: null,
        signalId: null,
        signalState: null,
        stopLineId: null,
        distanceToStopLineM: null,
        conflictEntityIds: hazardsFact.map((entry) => entry.entityId),
        rideId: null,
      },
      excludedReason: null,
    });
    return Object.freeze({
      tick,
      sample,
      events: Object.freeze([]),
      hazards: Object.freeze(hazardsFact),
      route: null,
      service: null,
      driverActions: Object.freeze([]),
    });
  };

  const observe = (input: LivePedestrianObserveInput): void => {
    if (disposed) throw new Error('Live pedestrian composition disposed');
    const tick = input.tick;
    if (!Number.isSafeInteger(tick) || tick <= tickWatermark)
      throw new Error('Live pedestrian composition requires increasing ticks');
    tickWatermark = tick;
    const startedAt = clock();
    prepare(tick);
    const commands = new Map(input.commands.map((command) => [command.vehicleId, command]));
    const facts: PedestrianVehicleFact[] = [];
    let complete = input.vehiclesComplete;
    const nextVehicles = new Map<string, LastVehicle>();
    for (const observation of input.vehicles) {
      const laneId = laneFor(observation);
      const observable =
        laneId !== null && (options.observableVehicle?.(observation.vehicleId, tick) ?? true);
      if (laneId === null || !observable) complete = false;
      const command = commands.get(observation.vehicleId) ?? null;
      nextVehicles.set(observation.vehicleId, Object.freeze({ observation, laneId, command }));
      if (laneId === null) continue;
      facts.push(
        Object.freeze({
          vehicleId: observation.vehicleId,
          incarnation: `${observation.vehicleId}:live`,
          laneId,
          positionM: Object.freeze({
            x: observation.positionM.x,
            y: observation.positionM.y,
            z: observation.positionM.z,
          }),
          speedMps: Math.abs(observation.speedMps),
          observable,
        }),
      );
    }
    pedestrians.step({
      tick,
      vehicles: facts,
      vehiclesComplete: complete,
    });
    const snapshots = pedestrians.getPedestrians();
    const hazardVehicles: HazardVehicleFact[] = input.vehicles.map((observation) => {
      const command = commands.get(observation.vehicleId);
      return Object.freeze({
        vehicleId: observation.vehicleId,
        incarnation: `${observation.vehicleId}:live`,
        controlMode: observation.controlMode,
        positionM: Object.freeze({
          x: observation.positionM.x,
          y: observation.positionM.y,
          z: observation.positionM.z,
        }),
        headingRad: headingFromYaw(observation.yawRad),
        speedMps: Math.abs(observation.speedMps),
        brake: command?.brake ?? 0,
        steering: command?.steering ?? 0,
      });
    });
    const hazardPedestrians: HazardPedestrianFact[] = snapshots
      .filter((snapshot) => snapshot.state === 'WAITING' || snapshot.state === 'CROSSING')
      .map((snapshot) =>
        Object.freeze({
          pedestrianId: snapshot.pedestrianId,
          state: snapshot.state,
          positionM: snapshot.positionM,
        }),
      );
    lastHazardStep = hazards.step({
      tick,
      vehicles: hazardVehicles,
      vehiclesComplete: complete,
      pedestrians: hazardPedestrians,
      contacts: obstacleContacts(input.incidents, tick),
    });
    const frame = v2Frame(tick, input.vehicles, input.commands);
    lastVehicles = nextVehicles;
    if (frame !== null) {
      if (v2Frames.length >= LIVE_PEDESTRIAN_HAZARDS_POLICY.sampleFrames) v2Frames.shift();
      v2Frames.push(frame);
    }
    const elapsed = clock() - startedAt;
    if (stepCosts.length >= LIVE_PEDESTRIAN_HAZARDS_POLICY.maxCostSamples) stepCosts.shift();
    stepCosts.push(elapsed);
  };

  const stats = (): LivePedestrianStats => {
    const pedestrianStats = pedestrians.getStats();
    const hazardStats = hazards.getStats();
    return Object.freeze({
      version: LIVE_PEDESTRIAN_HAZARDS_VERSION,
      tick: tickWatermark,
      mapId: pedestrianStats.mapId,
      pedestrians: pedestrianStats,
      hazards: hazardStats,
      v2Frames: v2Frames.length,
      physicalHazards: physical.size,
      physicalRefused,
      hazardCommands,
      lastHazardCommand,
      evaluationCost: Object.freeze({
        pedestrianEvaluations: pedestrianStats.evaluationCost.pedestrianEvaluations,
        hazardEvaluations: hazardStats.evaluationCost.hazardEvaluations,
        vehicleEvaluations: pedestrianStats.evaluationCost.vehicleEvaluations,
        peakHazardsPerStep: hazardStats.evaluationCost.peakHazardsPerStep,
      }),
      stepCost: costSummary(stepCosts),
      disposed,
    });
  };

  return Object.freeze({
    version: LIVE_PEDESTRIAN_HAZARDS_VERSION,
    mapId: pedestrians.mapId,
    seed: options.seed,
    prepare,
    adjustCommand,
    observe,
    getNetwork: () => pedestrians.getNetwork(),
    getLinks: () => pedestrians.getLinks(),
    getPedestrians: () => pedestrians.getPedestrians(),
    getPedestrian: (pedestrianId: string) => pedestrians.getPedestrian(pedestrianId),
    getConflicts: () => pedestrians.getConflicts(),
    getStops: () => pedestrians.getStops(),
    getHazardObstacles: () => hazards.getObstacles(),
    getHazardEncounters: () => hazards.getEncounters(),
    getHazardReactions: () => hazards.getReactions(),
    getHazardStep: () => lastHazardStep,
    getPedestrianInspection: () => pedestrians.getInspection(),
    getHazardInspection: () => hazards.getInspection(),
    getV2Frame: () => v2Frames.at(-1) ?? null,
    getV2Frames: () => Object.freeze([...v2Frames]),
    getV2Scenario: () =>
      v2Frames.length === 0
        ? null
        : parseV2ContextScenario({
            scenarioId: '286-live-hazards',
            category: 'HAZARDS',
            title: 'Pietoni, treceri și pericole live',
            frames: v2Frames,
          }),
    getStats: stats,
    visual: () =>
      Object.freeze({
        version: LIVE_PEDESTRIAN_HAZARDS_VERSION,
        tick: tickWatermark,
        pedestrians: Object.freeze(
          pedestrians.getPedestrians().map((snapshot) =>
            Object.freeze({
              pedestrianId: snapshot.pedestrianId,
              crosswalkId: snapshot.crosswalkId,
              state: snapshot.state,
              positionM: snapshot.positionM,
              crossingProgress: snapshot.crossingProgress,
              direction: snapshot.direction,
            }),
          ),
        ),
        hazards: Object.freeze(
          hazards.getObstacles().map((obstacle) =>
            Object.freeze({
              obstacleId: obstacle.obstacleId,
              type: obstacle.type,
              positionM: obstacle.positionM,
              halfSizeM: obstacle.halfSizeM,
              active: tickWatermark >= obstacle.appearTick && tickWatermark >= 0,
              physical: physical.has(obstacle.obstacleId),
            }),
          ),
        ),
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (physics !== null) {
        for (const obstacle of physical.values()) {
          try {
            physics.removeObstacle(obstacle.obstacleId);
          } catch {
            // The 282 owner remains the single owner of its native world; disposal below is best effort.
          }
        }
      }
      physical.clear();
      attempted.clear();
      lastVehicles.clear();
      v2Frames.length = 0;
      stepCosts.length = 0;
      pedestrians.dispose();
      hazards.dispose();
    },
  });
}
