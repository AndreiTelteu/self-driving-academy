import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  HAZARD_POLICY_V2_LIMITS,
  compileHazardPolicyProfile,
  evaluateHazardPolicyV2,
} from '../../src/autonomy/hazard-policy-v2';
import type {
  HazardPolicyV2Command,
  HazardPolicyV2CrosswalkApproach,
  HazardPolicyV2EvasionSpace,
  HazardPolicyV2HornOpportunity,
  HazardPolicyV2Input,
  HazardPolicyV2Key,
  HazardPolicyV2MKey,
  HazardPolicyV2Observation,
  HazardPolicyV2Obstacle,
  HazardPolicyV2Pedestrian,
  HazardPolicyV2Profile,
  HazardPolicyV2Stimulus,
} from '../../src/autonomy/hazard-policy-v2';
import type { HazardObstacleType } from '../../src/world';
import type { RoadSurfaceId, Vector3, VehicleClassId } from '../../src/vehicles';
import {
  createPedestrianWorld,
  lanePose,
  pedestrianTarget,
  vehicleBefore,
} from '../world/pedestrians-fixture';
import type { PedestrianTarget } from '../world/pedestrians-fixture';
import {
  HAZARD_LANE_ID,
  HAZARD_OBSTACLE_M,
  createHazardWorld,
  hazardLane,
  hazardObstacle,
  vehicleBeforeObstacle,
} from '../world/hazards-fixture';

/**
 * 183 fixture. The hazard facts are not hand-written numbers:
 *
 * - The pedestrian facts come from a real `164-pedestrians-v1` run over the authored neighbourhood:
 *   the target pedestrian really reaches the curb of an authored crosswalk and really starts to
 *   cross, and its identity, walk speed, crossing length and remaining crossing time are the ones
 *   the delivered module reports.
 * - The obstacle and stimulus facts come from a real `165-hazards-v1` world: the obstacle is the
 *   authored box parsed and clipped by the module, the half width is the support function of that
 *   box along the lane heading, and the stimulus onset is the one the module creates.
 * - The ego placement (distance and speed) is the scenario's own: the policy layer decides for the
 *   ego state the caller hands it, exactly like the other V2 policy layers.
 */
export interface RealCrossing {
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly laneId: string;
  readonly crossingLengthM: number;
  readonly walkSpeedMps: number;
  /** Remaining seconds to clear the ego path, exactly `crossingRemainingM / walkSpeedMps`. */
  readonly crossingRemainingS: number;
  /** Ego distance to the authored crossing line when the pedestrian first WAITS at the curb. */
  readonly waitingDistanceM: number;
  /** Ego distance to the authored crossing line when the pedestrian first CROSSES. */
  readonly crossingDistanceM: number;
  /** The documented authored target of the real crossing. */
  readonly target: PedestrianTarget;
}
const TICK_S = 1 / 60;
let cachedCrossing: RealCrossing | null = null;
/**
 * Runs the real 164 module until the target pedestrian waits at the curb and then crosses. The ego
 * is a scripted approach at 3 m/s from 30 m, slow enough that the pedestrian accepts the gap, so no
 * contact is invented and the crossing starts on the authored geometry.
 */
export function realCrossing(): RealCrossing {
  if (cachedCrossing !== null) return cachedCrossing;
  const world = createPedestrianWorld({ seed: 4711, pedestriansPerCrosswalk: 1 }),
    target = pedestrianTarget(world.getLinks()),
    pedestrianId = world
      .getPedestrians()
      .find((pedestrian) => pedestrian.crosswalkId === target.crosswalkId)!.pedestrianId;
  let distance = 30,
    waitingDistanceM: number | null = null,
    crossingDistanceM: number | null = null,
    crossingRemainingS: number | null = null,
    crossingLengthM = 0,
    walkSpeedMps = 0;
  for (let tick = 0; tick < 900; tick += 1) {
    world.step({
      tick,
      vehicles: [vehicleBefore(target, distance, 3)],
      vehiclesComplete: true,
    });
    const snapshot = world.getPedestrian(pedestrianId);
    if (snapshot !== null && snapshot.state === 'WAITING' && waitingDistanceM === null)
      waitingDistanceM = distance;
    if (snapshot !== null && snapshot.state === 'CROSSING' && crossingDistanceM === null) {
      crossingDistanceM = distance;
      crossingRemainingS = snapshot.crossingRemainingM / snapshot.walkSpeedMps;
      crossingLengthM = snapshot.crossingLengthM;
      walkSpeedMps = snapshot.walkSpeedMps;
    }
    distance -= 3 * TICK_S;
  }
  if (waitingDistanceM === null || crossingDistanceM === null || crossingRemainingS === null)
    throw new Error('The real 164 fixture did not produce a waiting and a crossing pedestrian');
  cachedCrossing = Object.freeze({
    pedestrianId,
    crosswalkId: target.crosswalkId,
    laneId: target.laneId,
    crossingLengthM,
    walkSpeedMps,
    crossingRemainingS,
    waitingDistanceM,
    crossingDistanceM,
    target,
  });
  return cachedCrossing;
}
/** The real pedestrian fact at the scenario's ego distance: the state and clock come from 164. */
export function realPedestrian(
  distanceM: number,
  state: 'WAITING' | 'CROSSING',
): HazardPolicyV2Pedestrian {
  const crossing = realCrossing();
  return Object.freeze({
    pedestrianId: crossing.pedestrianId,
    state,
    distanceM,
    crossingRemainingS: state === 'CROSSING' ? crossing.crossingRemainingS : null,
  });
}
/** Support function of an authored axis-aligned box along a heading: its half width on the path. */
function supportAlongHeading(
  halfSizeM: Readonly<{ x: number; y: number; z: number }>,
  headingRad: number,
): number {
  return (
    Math.abs(Math.cos(headingRad)) * halfSizeM.x + Math.abs(Math.sin(headingRad)) * halfSizeM.z
  );
}
/** The same planar rectangle distance `165-hazards-v1` uses in `surfaceDistance`. */
function boxSurfaceDistance(
  point: Readonly<{ x: number; y: number; z: number }>,
  obstacle: Readonly<{ positionM: Vector3; halfSizeM: Vector3 }>,
): number {
  const minX = obstacle.positionM.x - obstacle.halfSizeM.x,
    maxX = obstacle.positionM.x + obstacle.halfSizeM.x,
    minZ = obstacle.positionM.z - obstacle.halfSizeM.z,
    maxZ = obstacle.positionM.z + obstacle.halfSizeM.z,
    dx = Math.max(minX - point.x, 0, point.x - maxX),
    dz = Math.max(minZ - point.z, 0, point.z - maxZ);
  return Math.hypot(dx, dz);
}
export interface ObstacleSpec {
  readonly type?: HazardObstacleType;
  readonly halfSizeM?: Readonly<{ x: number; y: number; z: number }>;
}
const obstacleCache = new Map<string, HazardPolicyV2Obstacle>();
/** The real authored obstacle box, at the scenario's ego distance before it. */
export function realObstacle(distanceM: number, spec: ObstacleSpec = {}): HazardPolicyV2Obstacle {
  const type = spec.type ?? 'BARRIER',
    halfSizeM = spec.halfSizeM ?? { x: 2, y: 0.6, z: 0.5 },
    key = `${distanceM}:${type}:${halfSizeM.x}/${halfSizeM.y}/${halfSizeM.z}`,
    cached = obstacleCache.get(key);
  if (cached !== undefined) return cached;
  const world = createHazardWorld([hazardObstacle({ type, halfSizeM })]),
    obstacle = world.getObstacles()[0];
  if (obstacle === undefined) throw new Error('The real 165 fixture refused the obstacle');
  const lane = hazardLane(),
    ego = lanePose(lane.graph, lane.laneId, HAZARD_OBSTACLE_M - distanceM),
    result: HazardPolicyV2Obstacle = Object.freeze({
      obstacleId: obstacle.obstacleId,
      distanceM: boxSurfaceDistance(ego.positionM, obstacle),
      halfWidthM: supportAlongHeading(obstacle.halfSizeM, lane.headingRad),
    });
  obstacleCache.set(key, result);
  return result;
}
const stimulusCache = new Map<string, HazardPolicyV2Stimulus>();
/** The real 165 stimulus of an obstacle first seen at `distanceM` while closing at `speedMps`. */
export function realStimulus(distanceM: number, speedMps: number): HazardPolicyV2Stimulus {
  const key = `${distanceM}:${speedMps}`,
    cached = stimulusCache.get(key);
  if (cached !== undefined) return cached;
  const world = createHazardWorld([hazardObstacle()]),
    vehicle = vehicleBeforeObstacle(distanceM, speedMps),
    step = world.step({ tick: 0, vehicles: [vehicle], vehiclesComplete: true }),
    stimulus = step.stimuli[0],
    obstacle = world.getObstacles()[0];
  if (stimulus === undefined || obstacle === undefined)
    throw new Error('The real 165 fixture produced no stimulus');
  const lane = hazardLane(),
    result: HazardPolicyV2Stimulus = Object.freeze({
      stimulusId: stimulus.stimulusId,
      kind: stimulus.kind,
      onsetTick: stimulus.tick,
      distanceM: boxSurfaceDistance(vehicle.positionM, obstacle),
      closingSpeedMps: stimulus.closingSpeedMps,
      halfWidthM: supportAlongHeading(obstacle.halfSizeM, lane.headingRad),
    });
  stimulusCache.set(key, result);
  return result;
}
/** The authored lane facts that make the fixture readable: real ids, not invented ones. */
export const FIXTURE_LANE = Object.freeze({
  id: HAZARD_LANE_ID,
  obstacleAtM: HAZARD_OBSTACLE_M,
  headingRad: hazardLane().headingRad,
});
export const neutralHazardPolicyValues = Object.freeze({
  pedestrian_yield_probability: 0,
  pedestrian_clearance: 0.1,
  hazard_reaction_delay: 0,
  obstacle_clearance: 0.1,
  emergency_brake_intensity: 0,
  evasive_steer_willingness: 0,
  crosswalk_approach_speed: 0.5,
  horn_use_probability: 0,
}) satisfies Readonly<Record<HazardPolicyV2Key, number>>;
/** The catalog defaults, the baseline of every effect row. */
export const defaultHazardPolicyValues = Object.freeze({
  pedestrian_yield_probability: 1,
  pedestrian_clearance: 2,
  hazard_reaction_delay: 0.5,
  obstacle_clearance: 1,
  emergency_brake_intensity: 1,
  evasive_steer_willingness: 0.3,
  crosswalk_approach_speed: 5,
  horn_use_probability: 0.1,
}) satisfies Readonly<Record<HazardPolicyV2Key, number>>;
/** The four delivered M keys the layer reads. */
export const hazardPolicyMValues = Object.freeze({
  comfort_deceleration: 2,
  brake_reaction_delay: 0.5,
  curve_lateral_accel: 2.5,
  yield_time_gap: 3,
}) satisfies Readonly<Record<HazardPolicyV2MKey, number>>;
export const scenario = Object.freeze({
  scope: { sessionId: '183-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 601,
  seed: 0x5eed_0183,
  opportunityKey: '183-hazard-opportunity',
  profileId: '183-fixture',
  versionId: '183-fixture-v1',
  engineVersion: '183-hazard-policy-v2',
});
const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  comfort_deceleration: 'm/s²',
  brake_reaction_delay: 's',
  curve_lateral_accel: 'm/s²',
  yield_time_gap: 's',
  pedestrian_yield_probability: 'probability',
  pedestrian_clearance: 'm',
  hazard_reaction_delay: 's',
  obstacle_clearance: 'm',
  emergency_brake_intensity: 'ratio',
  evasive_steer_willingness: 'probability',
  crosswalk_approach_speed: 'm/s',
  horn_use_probability: 'probability',
});
export function hazardPolicyDocument(
  rValues: Partial<Record<HazardPolicyV2Key, number>> = {},
  mValues: Partial<Record<HazardPolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...hazardPolicyMValues,
    ...mValues,
    ...defaultHazardPolicyValues,
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
    createdAt: '2026-11-13T00:00:00.000Z',
    checksum: `unverified:${versionId}`,
  };
}
export function hazardPolicyProfile(
  rValues: Partial<Record<HazardPolicyV2Key, number>> = {},
  mValues: Partial<Record<HazardPolicyV2MKey, number>> = {},
): HazardPolicyV2Profile {
  return compileHazardPolicyProfile(hazardPolicyDocument(rValues, mValues));
}
/** One scene: the ego state plus the observable facts of the tick. */
export interface HazardPolicyScene {
  readonly name: string;
  readonly description: string;
  readonly speedMps: number;
  readonly postedLimitMps?: number;
  readonly classId?: VehicleClassId;
  readonly surfaceId?: RoadSurfaceId;
  readonly pedestrian?: HazardPolicyV2Pedestrian | null;
  readonly obstacle?: HazardPolicyV2Obstacle | null;
  readonly stimulus?: HazardPolicyV2Stimulus | null;
  readonly evasion?: HazardPolicyV2EvasionSpace | null;
  readonly crosswalk?: HazardPolicyV2CrosswalkApproach | null;
  readonly horn?: HazardPolicyV2HornOpportunity | null;
}
export function hazardPolicyObservation(
  scene: HazardPolicyScene,
  tick: number = scenario.tick,
): HazardPolicyV2Observation {
  return {
    version: HAZARD_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    speedMps: scene.speedMps,
    mechanics: {
      version: HAZARD_POLICY_V2_LIMITS.mechanicsVersion,
      classId: scene.classId ?? 'sedan',
    },
    surface: {
      version: HAZARD_POLICY_V2_LIMITS.surfaceVersion,
      id: scene.surfaceId ?? 'dry-asphalt',
    },
    postedLimitMps: scene.postedLimitMps ?? 15,
    pedestrian: scene.pedestrian ?? null,
    obstacle: scene.obstacle ?? null,
    stimulus: scene.stimulus ?? null,
    evasion: scene.evasion ?? null,
    crosswalk: scene.crosswalk ?? null,
    horn: scene.horn ?? null,
  };
}
export interface HazardPolicyEvaluationOptions {
  readonly tick?: number;
  readonly rValues?: Partial<Record<HazardPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<HazardPolicyV2MKey, number>>;
  readonly authority?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly seed?: number;
  readonly opportunityKey?: string;
  readonly observation?: HazardPolicyV2Observation;
  readonly profile?: HazardPolicyV2Profile | null;
}
export interface HazardPolicyEvaluation {
  readonly command: HazardPolicyV2Command;
  readonly profile: HazardPolicyV2Profile;
  readonly decisionTick: number;
  readonly input: HazardPolicyV2Input;
}
export function evaluate(
  scene: HazardPolicyScene,
  options: HazardPolicyEvaluationOptions = {},
): HazardPolicyEvaluation {
  const profile = hazardPolicyProfile(options.rValues, options.mValues),
    decisionTick = options.tick ?? scenario.tick,
    input: HazardPolicyV2Input = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: options.authority ?? 'AUTO',
      seed: options.seed ?? scenario.seed,
      opportunityKey: options.opportunityKey ?? scenario.opportunityKey,
      profile: options.profile === undefined ? profile : options.profile,
      observation: options.observation ?? hazardPolicyObservation(scene, decisionTick),
    };
  return { command: evaluateHazardPolicyV2(input), profile, decisionTick, input };
}
/** A real crossing pedestrian, seen from `distanceM`, in its real CROSSING or WAITING state. */
export function pedestrianScene(
  distanceM: number,
  state: 'WAITING' | 'CROSSING',
  speedMps: number,
  postedLimitMps = 15,
): HazardPolicyScene {
  const crossing = realCrossing();
  return {
    name: state === 'CROSSING' ? 'traversare' : 'pieton la bordură',
    description:
      state === 'CROSSING'
        ? `traversarea reală \`${crossing.crosswalkId}\` de pe banda \`${crossing.laneId}\`: pietonul traversează pe ${crossing.crossingLengthM.toFixed(2)} m la ${crossing.walkSpeedMps.toFixed(3)} m/s și are nevoie de ${crossing.crossingRemainingS.toFixed(3)} s să elibereze calea`
        : `același pieton real \`${crossing.pedestrianId}\` oprit la bordura trecerii \`${crossing.crosswalkId}\`, fără nicio oportunitate de traversare angajată`,
    speedMps,
    postedLimitMps,
    pedestrian: realPedestrian(distanceM, state),
  };
}
/** A real authored cone, seen from `distanceM`: the narrow obstacle of the clearance channel. */
export function coneScene(distanceM: number, speedMps: number): HazardPolicyScene {
  const obstacle = realObstacle(distanceM, {
    type: 'CONE',
    halfSizeM: { x: 0.3, y: 0.5, z: 0.3 },
  });
  return {
    name: 'obstacol',
    description: `conul real \`${obstacle.obstacleId}\` (cutie autorată de 0,30 m jumătate de lățime) la ${distanceM} m, fără spațiu lateral declarat`,
    speedMps,
    postedLimitMps: 15,
    obstacle,
  };
}
export const reactionScene = (): HazardPolicyScene => {
  const stimulus = realStimulus(40, 8);
  return {
    name: 'reacție',
    description: `stimulul real 165 \`${stimulus.stimulusId}\` apărut la ${stimulus.distanceM.toFixed(3)} m, cu ${stimulus.closingSpeedMps.toFixed(3)} m/s`,
    speedMps: 8,
    postedLimitMps: 15,
    stimulus,
  };
};
export const evasionScene = (): HazardPolicyScene => ({
  name: 'ocolire',
  description:
    'bariera reală la 20 m, cu 4,50 m de spațiu lateral declarat: ocolirea este posibilă fizic',
  speedMps: 8,
  postedLimitMps: 15,
  obstacle: realObstacle(20),
  evasion: { side: 'LEFT', lateralSpaceM: 4.5, timeToObstacleS: 0.6 },
});
export const emergencyScene = (): HazardPolicyScene => {
  const stimulus = realStimulus(40, 8);
  return {
    name: 'frânare de urgență',
    description: `același stimul real 165 \`${stimulus.stimulusId}\`, cu aderența suprafeței livrate \`dry-asphalt\``,
    speedMps: 8,
    postedLimitMps: 15,
    stimulus,
  };
};
export const crosswalkScene = (): HazardPolicyScene => ({
  name: 'apropiere de trecere',
  description: `trecerea reală \`${realCrossing().crosswalkId}\`, fără pieton angajat, la 25 m de linia autorată`,
  speedMps: 15,
  postedLimitMps: 15,
  crosswalk: { crosswalkId: realCrossing().crosswalkId, distanceM: 25, postedLimitMps: 15 },
});
export const hornScene = (): HazardPolicyScene => ({
  name: 'claxon',
  description: 'oportunitate reală de claxon 165, cu claxonul permis de lume în acest loc',
  speedMps: 8,
  postedLimitMps: 15,
  horn: { opportunityId: 'horn-opportunity-183', permitted: true },
});
/** The scenario table: one isolated scene per key. */
export interface HazardPolicyScenarioRow {
  readonly name: string;
  readonly scene: HazardPolicyScene;
  readonly key: HazardPolicyV2Key;
  readonly unit: string;
  readonly note: string;
  readonly measure: (command: HazardPolicyV2Command) => number;
}
export const scenarioRows: readonly HazardPolicyScenarioRow[] = Object.freeze([
  {
    name: 'cedarea la traversare',
    scene: pedestrianScene(30, 'CROSSING', 3),
    key: 'pedestrian_yield_probability',
    unit: 'decizie',
    note: 'pietonul are peste 3 s de marjă peste timpul de traversare, deci cedarea e discreționară: 0 nu cedează, 1 cedează',
    measure: (command) => (command.pedestrian?.yielded === true ? 1 : 0),
  },
  {
    name: 'spațiul față de pieton',
    scene: pedestrianScene(12, 'WAITING', 6),
    key: 'pedestrian_clearance',
    unit: 'm/s',
    note: 'spațiul dorit devine plafon de viteză `sqrt(2 · comfort_deceleration · cameră)`; minimul de catalog este ridicat la lățimea vehiculului plus rezervă',
    measure: (command) => command.clearance.pedestrian?.speedCapMps ?? 0,
  },
  {
    name: 'reacția la pericol',
    scene: reactionScene(),
    key: 'hazard_reaction_delay',
    unit: 'm',
    note: 'marja de oprire rămasă după întârziere: întârzierea totală este cea M moștenită plus cheia R, plafonată de spațiul real',
    measure: (command) => command.reaction?.stoppingMarginM ?? 0,
  },
  {
    name: 'spațiul față de obstacol',
    scene: coneScene(12, 6),
    key: 'obstacle_clearance',
    unit: 'm/s',
    note: 'aceeași formulă de plafon de viteză, cu lățimea reală a cutiei de obstacol în minimul fizic',
    measure: (command) => command.clearance.obstacle?.speedCapMps ?? 0,
  },
  {
    name: 'frânarea de urgență',
    scene: emergencyScene(),
    key: 'emergency_brake_intensity',
    unit: 'm/s²',
    note: 'intensitatea scalează capacitatea de frânare a clasei livrate, plafonată de aderența disponibilă',
    measure: (command) => command.emergencyBrake?.decelerationMps2 ?? 0,
  },
  {
    name: 'ocolirea prin viraj',
    scene: evasionScene(),
    key: 'evasive_steer_willingness',
    unit: 'm',
    note: 'deplasarea laterală commitată: minimul dintre spațiul rămas peste marja fizică și distanța realizabilă la accelerația laterală M',
    measure: (command) => command.evasion?.offsetM ?? 0,
  },
  {
    name: 'viteza de apropiere de trecere',
    scene: crosswalkScene(),
    key: 'crosswalk_approach_speed',
    unit: 'm/s',
    note: 'viteza comandată la apropierea trecerii, plafonată de limita autorată a drumului',
    measure: (command) => command.crosswalk?.commandedSpeedMps ?? 0,
  },
  {
    name: 'claxonul',
    scene: hornScene(),
    key: 'horn_use_probability',
    unit: 'decizie',
    note: 'un singur eșantion determinist per oportunitate decide folosirea claxonului, acolo unde lumea îl permite',
    measure: (command) => (command.horn?.used === true ? 1 : 0),
  },
]);
export function sceneOf(key: HazardPolicyV2Key): HazardPolicyScene {
  const row = scenarioRows.find((entry) => entry.key === key);
  if (row === undefined) throw new Error(`Missing hazard policy scenario ${key}`);
  return row.scene;
}
