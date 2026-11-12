import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  LATERAL_LIMITS,
  compileLateralTrajectory,
  createLateralController,
} from '../../src/autonomy/lateral-controller';
import type {
  LateralInput,
  LateralProjection,
  LateralRouteRequest,
  LateralWorld,
} from '../../src/autonomy/lateral-controller';
import {
  LATERAL_POLICY_V2_EMPTY_STATE,
  LATERAL_POLICY_V2_LIMITS,
  compileLateralPolicyProfile,
  evaluateLateralPolicyV2,
} from '../../src/autonomy/lateral-policy-v2';
import type {
  LateralPolicyV2Command,
  LateralPolicyV2Input,
  LateralPolicyV2Key,
  LateralPolicyV2MKey,
  LateralPolicyV2Observation,
  LateralPolicyV2Profile,
  LateralPolicyV2State,
} from '../../src/autonomy/lateral-policy-v2';
import type { RoadMap } from '../../src/world/schema';
import { lateralFixture } from './lateral-controller-reference';

/** The two delivered M keys the 179 layer reads and never rewrites. */
export const lateralPolicyMValues = Object.freeze({
  curve_lateral_accel: 2.5,
  desired_acceleration: 1.5,
}) satisfies Readonly<Record<LateralPolicyV2MKey, number>>;
/** The most permissive admissible 179 configuration: it does not shape beyond the geometry. */
export const neutralLateralPolicyValues = Object.freeze({
  lane_center_offset: 0,
  steering_response_time: 0.05,
  steering_rate_limit: 4,
  turn_entry_speed: 18,
  turn_exit_acceleration: 6,
  corner_cutting_bias: 0,
  lateral_clearance: 0.1,
  lateral_correction_deadband: 0.6,
}) satisfies Readonly<Record<LateralPolicyV2Key, number>>;
/** Independent scenario identity; the catalog only fixes the admissible ranges. */
export const scenario = Object.freeze({
  scope: { sessionId: '179-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 61,
  profileId: '179-fixture',
  versionId: '179-fixture-v1',
  engineVersion: '179-lateral-policy-v2',
  mapVersionId: '179-fixture-v1',
});
export const FULL_LOCK_RAD = 0.45;

const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  curve_lateral_accel: 'm/s²',
  desired_acceleration: 'm/s²',
  lane_center_offset: 'm',
  steering_response_time: 's',
  steering_rate_limit: 'rad/s',
  turn_entry_speed: 'm/s',
  turn_exit_acceleration: 'm/s²',
  corner_cutting_bias: 'ratio',
  lateral_clearance: 'm',
  lateral_correction_deadband: 'm',
});

/** A profile document that carries the two delivered M keys and the eight 179 R keys together. */
export function lateralPolicyDocument(
  rValues: Partial<Record<LateralPolicyV2Key, number>> = {},
  mValues: Partial<Record<LateralPolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...lateralPolicyMValues,
    ...mValues,
    ...neutralLateralPolicyValues,
    ...rValues,
  };
  const units = Object.fromEntries(
    Object.keys(parameters).map((key) => {
      const unit = unitByKey[key];
      if (unit === undefined) throw new Error(`Missing unit for ${key}`);
      return [key, unit];
    }),
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: scenario.profileId,
    versionId,
    parentVersionId: null,
    engineVersion: scenario.engineVersion,
    parameters,
    unitsByParameter: units,
    provenanceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-11-12T00:00:00.000Z',
    checksum: `unverified:${versionId}`,
  };
}
export function lateralPolicyProfile(
  rValues: Partial<Record<LateralPolicyV2Key, number>> = {},
  mValues: Partial<Record<LateralPolicyV2MKey, number>> = {},
): LateralPolicyV2Profile {
  return compileLateralPolicyProfile(lateralPolicyDocument(rValues, mValues));
}

/** A straight authored lane: the genuine 049 projection has zero curvature and no turn. */
function straightMap(): RoadMap {
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: '179-straight-v1',
    bounds: { minM: { x: -100, y: 0, z: -300 }, maxM: { x: 100, y: 2, z: 400 } },
    geometry: {
      nodes: [
        { id: 'straight-a', positionM: { x: 0, y: 0, z: -200 } },
        { id: 'straight-b', positionM: { x: 0, y: 0, z: 300 } },
        { id: 'straight-service-a', positionM: { x: -1, y: 0, z: -201 } },
        { id: 'straight-service-b', positionM: { x: 1, y: 0, z: -201 } },
        { id: 'straight-service-c', positionM: { x: 1, y: 0, z: -199 } },
        { id: 'straight-service-d', positionM: { x: -1, y: 0, z: -199 } },
      ],
      paths: [{ id: 'straight-path', nodeIds: ['straight-a', 'straight-b'] }],
      areas: [
        {
          id: 'straight-service-geometry',
          vertexNodeIds: [
            'straight-service-a',
            'straight-service-b',
            'straight-service-c',
            'straight-service-d',
          ],
        },
      ],
    },
    lanes: [
      {
        id: 'lane-straight',
        geometryId: 'straight-path',
        direction: 'FORWARD',
        widthM: 4,
        speedLimitMps: 10,
        access: ['CIVIL', 'TAXI'],
        neighbors: { left: null, right: null },
        successorIds: [],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
    ],
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'straight-service',
        geometryId: 'straight-service-geometry',
        laneId: 'lane-straight',
        anchorNodeId: 'straight-a',
        access: ['CIVIL', 'TAXI'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [],
  };
}

/** Which authored geometry feeds the genuine 049 projection. */
export type LateralPolicyGeometry = 'turn' | 'straight';
export interface LateralPolicyScene {
  readonly name: string;
  readonly geometry: LateralPolicyGeometry;
  readonly laneWidthM: number;
  readonly lateralDeviationM: number;
  readonly speedMps: number;
  readonly obstacle: LateralPolicyV2Observation['obstacle'];
  /** Authored intermediate geometry of the turn, when the scene is built on one. */
  readonly turnRadiusM?: number;
  /** Feed 049 a discontinuous observation, so its projection is unusable. */
  readonly discontinuity?: boolean;
}
const world = Object.freeze({
  sessionId: scenario.scope.sessionId,
  worldEpoch: scenario.scope.worldEpoch,
  mapId: lateralFixture(1).mapId,
  mapVersionId: scenario.mapVersionId,
});
const straightWorld = Object.freeze({
  ...world,
  mapId: '179-straight-v1',
});
function geometryOf(geometry: LateralPolicyGeometry) {
  return geometry === 'turn'
    ? {
        world,
        map: lateralFixture(1),
        laneId: 'lane-0',
        loop: true,
        positionM: { x: -384, y: 0.8, z: -360 },
      }
    : {
        world: straightWorld,
        map: straightMap(),
        laneId: 'lane-straight',
        loop: false,
        positionM: { x: 0, y: 0.8, z: 0 },
      };
}
interface ProjectionOwner {
  readonly controller: ReturnType<typeof createLateralController>;
  readonly world: LateralWorld;
  readonly positionM: { readonly x: number; readonly y: number; readonly z: number };
  readonly speedMps: number;
  readonly discontinuity: boolean;
  lastTick: number;
  projection: LateralProjection | null;
}
const owners = new Map<string, ProjectionOwner>();
function ownerKey(scene: LateralPolicyScene): string {
  return `${scene.geometry}:${scene.speedMps}:${scene.discontinuity === true ? 'broken' : 'ok'}`;
}
function ownerFor(scene: LateralPolicyScene): ProjectionOwner {
  const key = ownerKey(scene),
    existing = owners.get(key);
  if (existing !== undefined) return existing;
  const geometry = geometryOf(scene.geometry),
    controller = createLateralController(geometry.world),
    trajectory = compileLateralTrajectory(geometry.map, {
      ...geometry.world,
      version: LATERAL_LIMITS.trajectoryVersion,
      id: `179-${scene.geometry}`,
      access: 'CIVIL',
      laneIds: [geometry.laneId],
      loop: geometry.loop,
    } satisfies LateralRouteRequest);
  controller.setActors([{ ...scenario.actor, classId: 'sedan' }], geometry.world);
  controller.setTrajectory(scenario.actor, trajectory, geometry.world);
  const owner: ProjectionOwner = {
    controller,
    world: geometry.world,
    positionM: geometry.positionM,
    speedMps: scene.speedMps,
    discontinuity: scene.discontinuity === true,
    lastTick: 0,
    projection: null,
  };
  owners.set(key, owner);
  return owner;
}
const projectionCache = new Map<string, LateralProjection>();
/**
 * The genuine 049 projection for this scene at this tick. The controller is driven forward one tick
 * at a time with the authored position and heading, so the projection is produced by the delivered
 * layer and never fabricated. Every intermediate tick is cached, so requesting a later tick first
 * cannot relabel an older projection.
 */
export function projectionAt(scene: LateralPolicyScene, tick: number): LateralProjection {
  const key = ownerKey(scene),
    cacheKey = `${key}:${tick}`,
    cached = projectionCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const owner = ownerFor(scene);
  if (tick <= owner.lastTick)
    throw new Error(`Fixture 049 projection for tick ${tick} was never produced`);
  while (owner.lastTick < tick) {
    const next = owner.lastTick + 1,
      input: LateralInput = {
        ...owner.world,
        version: LATERAL_LIMITS.version,
        actor: scenario.actor,
        tick: next,
        observation: {
          sourceTick: next - 1,
          positionM: owner.positionM,
          rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          velocityMps: { x: 0, y: 0, z: owner.speedMps },
          discontinuity: owner.discontinuity,
        },
        requestedSpeedMps: owner.speedMps,
      };
    owner.projection = owner.controller.step(input);
    owner.lastTick = next;
    if (owner.projection === null) throw new Error('Fixture 049 controller produced no projection');
    projectionCache.set(`${key}:${next}`, owner.projection);
  }
  const projection = projectionCache.get(cacheKey);
  if (projection === undefined) throw new Error('Fixture 049 projection cache miss');
  return projection;
}
/** The genuine 049 steering in road-wheel radians, the base the 179 layer shapes. */
export function baseSteeringRad(scene: LateralPolicyScene, tick = scenario.tick): number {
  return projectionAt(scene, tick).steering * FULL_LOCK_RAD;
}

export function lateralPolicyObservation(
  scene: LateralPolicyScene,
  tick: number = scenario.tick,
): LateralPolicyV2Observation {
  return {
    version: LATERAL_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    laneWidthM: scene.laneWidthM,
    lateralDeviationM: scene.lateralDeviationM,
    speedMps: scene.speedMps,
    obstacle: scene.obstacle,
  };
}
export interface LateralPolicyEvaluationOptions {
  readonly tick?: number;
  readonly rValues?: Partial<Record<LateralPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<LateralPolicyV2MKey, number>>;
  readonly state?: LateralPolicyV2State;
  readonly authority?: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** Replaces the 049 projection, used to feed a foreign, stale or missing result explicitly. */
  readonly lateral?: unknown;
  readonly classId?: 'sedan' | 'compact';
  readonly observation?: LateralPolicyV2Observation;
}
export interface LateralPolicyEvaluation {
  readonly command: LateralPolicyV2Command;
  readonly profile: LateralPolicyV2Profile;
  readonly projection: LateralProjection;
  readonly decisionTick: number;
  readonly input: LateralPolicyV2Input;
}
/** Runs the genuine 049 layer first, then the 179 layer over its result. */
export function evaluate(
  scene: LateralPolicyScene,
  options: LateralPolicyEvaluationOptions = {},
): LateralPolicyEvaluation {
  const document = lateralPolicyDocument(options.rValues, options.mValues),
    profile = compileLateralPolicyProfile(document),
    decisionTick = options.tick ?? scenario.tick,
    projection = projectionAt(scene, decisionTick),
    observation = options.observation ?? lateralPolicyObservation(scene, decisionTick),
    input: LateralPolicyV2Input = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: options.authority ?? 'AUTO',
      profile,
      lateral: options.lateral === undefined ? projection : options.lateral,
      observation,
      state: options.state ?? LATERAL_POLICY_V2_EMPTY_STATE,
      mechanics: {
        version: LATERAL_POLICY_V2_LIMITS.mechanicsVersion,
        classId: options.classId ?? 'sedan',
      },
    };
  return {
    command: evaluateLateralPolicyV2(input),
    profile,
    projection,
    decisionTick,
    input,
  };
}
export interface LateralPolicyRunOptions extends LateralPolicyEvaluationOptions {
  readonly ticks: number;
  readonly stopWhen?: (command: LateralPolicyV2Command) => boolean;
}
/** Advances the layer over consecutive ticks with the caller-held latch carried forward. */
export function run(
  scene: LateralPolicyScene,
  options: LateralPolicyRunOptions,
): { readonly commands: readonly LateralPolicyV2Command[]; readonly state: LateralPolicyV2State } {
  const commands: LateralPolicyV2Command[] = [];
  let state = options.state ?? LATERAL_POLICY_V2_EMPTY_STATE;
  for (let index = 0; index < options.ticks; index++) {
    const row = evaluate(scene, {
      tick: (options.tick ?? scenario.tick) + index,
      rValues: options.rValues,
      mValues: options.mValues,
      state,
      authority: options.authority,
      lateral: options.lateral,
      classId: options.classId,
      observation: options.observation,
    });
    commands.push(row.command);
    state = row.command.state;
    if (options.stopWhen?.(row.command)) break;
  }
  return { commands, state };
}
export interface LateralPolicyFirstMovement {
  /** Ticks between the first decision and the first committed steering movement. */
  readonly delayTicks: number;
  /** The applied road-wheel step of that first movement, rad. */
  readonly stepRad: number;
}
/** The first committed steering movement of a step: its delay and its applied rate step. */
export function firstMovement(
  scene: LateralPolicyScene,
  options: { readonly rValues?: Partial<Record<LateralPolicyV2Key, number>> } = {},
): LateralPolicyFirstMovement {
  const row = evaluate(scene, { rValues: options.rValues });
  let state: LateralPolicyV2State = {
    steeringRad: 0,
    committedTargetRad: 0,
    holdTicksRemaining: 0,
    inTurn: row.command.inTurn,
  };
  for (let index = 0; index < 400; index++) {
    const current = evaluate(scene, {
      tick: scenario.tick + index,
      rValues: options.rValues,
      state,
    });
    if (current.command.steeringStepRad !== 0)
      return { delayTicks: index, stepRad: Math.abs(current.command.steeringStepRad) };
    state = current.command.state;
  }
  throw new Error('Fixture scene never moved the steering');
}
/** The exit state: a turn already tracked, with the delivered steering of the turn. */
export function turnState(scene: LateralPolicyScene): LateralPolicyV2State {
  const steering = baseSteeringRad(scene);
  return {
    steeringRad: steering,
    committedTargetRad: steering,
    holdTicksRemaining: 0,
    inTurn: true,
  };
}
