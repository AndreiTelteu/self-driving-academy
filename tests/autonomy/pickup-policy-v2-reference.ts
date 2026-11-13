import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  PICKUP_POLICY_V2_LIMITS,
  compilePickupPolicyProfile,
  evaluatePickupPolicyV2,
} from '../../src/autonomy/pickup-policy-v2';
import type {
  PickupPolicyRideState,
  PickupPolicyV2Command,
  PickupPolicyV2Input,
  PickupPolicyV2Key,
  PickupPolicyV2MKey,
  PickupPolicyV2Observation,
  PickupPolicyV2Profile,
  PickupPolicyV2Service,
  PickupServiceKind,
  PickupServicePhase,
} from '../../src/autonomy/pickup-policy-v2';
import { createNeighbourhoodMap } from '../../src/world';
import type { RoadMap } from '../../src/world';
import type { RoadSurfaceId, VehicleClassId } from '../../src/vehicles';
import {
  beginFirstRide,
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
} from '../fleet/ride-fsm-fixture';
import type { RideLifecycleWorld } from '../fleet/ride-fsm-fixture';

/**
 * 185 fixture. The service-stop facts are not hand-written numbers:
 *
 * - The authored 032 service zone, its kind, its TAXI access, its marked stop point (the zone
 *   anchor node) and its lateral bay depth are read from the real neighbourhood map.
 * - The pickup and dropoff zone ids are the real 060 assignment of the first ride, and the ride
 *   state that decides whether the cabin is occupied is produced by the real 061 lifecycle
 *   (`TO_PICKUP` → `PICKUP` → `TO_DROPOFF` → `DROPOFF` → `COMPLETED`).
 * - The ego placement (distance to the marked stop point, speed, current curb clearance and the
 *   elapsed stationary time) is the scenario's own, exactly like the other V2 policy layers.
 */
export interface RealServiceStop {
  readonly zoneId: string;
  readonly laneId: string;
  readonly kind: PickupServiceKind;
  readonly taxiAccess: boolean;
  readonly lengthM: number;
  readonly stopOffsetM: number;
  readonly curbBandM: number;
  readonly anchorNodeId: string;
}
interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
function positionOf(map: RoadMap, nodeId: string): Point {
  const node = map.geometry.nodes.find((entry) => entry.id === nodeId);
  if (node === undefined) throw new Error(`Missing map node ${nodeId}`);
  return node.positionM;
}
/** Real authored stop facts of one 032 service zone, projected on its lane travel direction. */
export function realServiceStop(map: RoadMap, zoneId: string): RealServiceStop {
  const zone = map.serviceZones.find((entry) => entry.id === zoneId);
  if (zone === undefined) throw new Error(`Unknown service zone ${zoneId}`);
  const area = map.geometry.areas.find((entry) => entry.id === zone.geometryId),
    lane = map.lanes.find((entry) => entry.id === zone.laneId),
    path = map.geometry.paths.find((entry) => entry.id === lane?.geometryId);
  if (area === undefined || lane === undefined || path === undefined)
    throw new Error(`Incomplete service zone geometry for ${zoneId}`);
  const first = positionOf(map, path.nodeIds[0]!),
    last = positionOf(map, path.nodeIds[path.nodeIds.length - 1]!),
    length = Math.hypot(last.x - first.x, last.z - first.z),
    direction = { x: (last.x - first.x) / length, z: (last.z - first.z) / length },
    along = (point: Point) => (point.x - first.x) * direction.x + (point.z - first.z) * direction.z,
    across = (point: Point) =>
      (point.x - first.x) * -direction.z + (point.z - first.z) * direction.x,
    vertices = area.vertexNodeIds.map((nodeId) => positionOf(map, nodeId)),
    alongValues = vertices.map(along),
    acrossValues = vertices.map(across),
    entry = Math.min(...alongValues),
    exit = Math.max(...alongValues),
    stopOffsetM = along(positionOf(map, zone.anchorNodeId)) - entry;
  return Object.freeze({
    zoneId: zone.id,
    laneId: zone.laneId,
    kind: zone.kind,
    taxiAccess: zone.access.includes('TAXI'),
    lengthM: exit - entry,
    stopOffsetM,
    curbBandM: Math.max(...acrossValues) - Math.min(...acrossValues),
    anchorNodeId: zone.anchorNodeId,
  });
}
export interface RealRideFacts {
  readonly rideId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  readonly map: RoadMap;
  readonly toPickup: PickupPolicyRideState;
  readonly pickup: PickupPolicyRideState;
  readonly toDropoff: PickupPolicyRideState;
  readonly dropoff: PickupPolicyRideState;
  readonly completed: PickupPolicyRideState;
  readonly pickupStop: RealServiceStop;
  readonly dropoffStop: RealServiceStop;
  /** A real authored zone without TAXI access: the mandatory gate no preference can bypass. */
  readonly civilOnlyStop: RealServiceStop;
}
let cachedRide: RealRideFacts | null = null;
/**
 * Runs the real 061 lifecycle through the whole ride once and keeps the authored map facts. The
 * states observed here are the ones the policy observation carries; nothing about the cabin is
 * asserted freely by the fixture.
 */
export function realRideFacts(): RealRideFacts {
  if (cachedRide !== null) return cachedRide;
  const world: RideLifecycleWorld = createRideLifecycleWorld({ requestCount: 1, openTaxis: 1 }),
    { assignment, result } = beginFirstRide(world),
    rideId = result.ride.rideId,
    state = (): PickupPolicyRideState => {
      const ride = world.lifecycle.ride(rideId);
      if (ride === undefined) throw new Error('The real 061 ride disappeared');
      return ride.state;
    },
    apply = (event: string, atTick: number) => {
      world.lifecycle.apply({
        rideId,
        eventId: `${rideId}:${event}:${atTick}`,
        event,
        tick: atTick,
      });
    },
    toPickup = state();
  apply('ARRIVED_PICKUP', 20);
  const pickup = state();
  apply('PICKUP_COMPLETE', 200);
  const toDropoff = state();
  apply('ARRIVED_DROPOFF', 220);
  const dropoff = state();
  apply('DROPOFF_COMPLETE', 400);
  const completed = state(),
    map = world.dispatcherWorld.map,
    civilOnly = map.serviceZones.find((zone) => !zone.access.includes('TAXI'));
  if (civilOnly === undefined) throw new Error('The authored map has no CIVIL-only service zone');
  cachedRide = Object.freeze({
    rideId,
    taxiId: assignment.taxiId,
    pickupZoneId: assignment.pickupZoneId,
    dropoffZoneId: assignment.dropoffZoneId,
    map,
    toPickup,
    pickup,
    toDropoff,
    dropoff,
    completed,
    pickupStop: realServiceStop(map, assignment.pickupZoneId),
    dropoffStop: realServiceStop(map, assignment.dropoffZoneId),
    civilOnlyStop: realServiceStop(map, civilOnly.id),
  });
  disposeRideLifecycleWorld(world);
  return cachedRide;
}
/** The untouched authored map, exposed for evidence and report identity. */
export function realMap(): RoadMap {
  return createNeighbourhoodMap();
}
export const neutralPickupPolicyValues = Object.freeze({
  pickup_approach_speed: 0.5,
  pickup_curb_distance: 0.1,
  pickup_stop_precision: 0.2,
  pickup_dwell_time: 1,
  dropoff_approach_speed: 0.5,
  dropoff_curb_distance: 0.1,
  occupied_acceleration_scale: 0.3,
  occupied_lateral_accel_scale: 0.3,
}) satisfies Readonly<Record<PickupPolicyV2Key, number>>;
/** The catalog defaults, the baseline of every effect and separation row. */
export const defaultPickupPolicyValues = Object.freeze({
  pickup_approach_speed: 3,
  pickup_curb_distance: 0.5,
  pickup_stop_precision: 1,
  pickup_dwell_time: 3,
  dropoff_approach_speed: 3,
  dropoff_curb_distance: 0.5,
  occupied_acceleration_scale: 0.85,
  occupied_lateral_accel_scale: 0.85,
}) satisfies Readonly<Record<PickupPolicyV2Key, number>>;
/** The four delivered M keys the layer reads. */
export const pickupPolicyMValues = Object.freeze({
  desired_acceleration: 1.5,
  comfort_deceleration: 2,
  curve_lateral_accel: 2.5,
  stop_dwell_time: 1,
}) satisfies Readonly<Record<PickupPolicyV2MKey, number>>;
export const scenario = Object.freeze({
  scope: { sessionId: '185-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'taxi', incarnation: 1 } as BehaviorActor,
  tick: 901,
  profileId: '185-fixture',
  versionId: '185-fixture-v1',
  engineVersion: '185-pickup-policy-v2',
});
const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  desired_acceleration: 'm/s²',
  comfort_deceleration: 'm/s²',
  curve_lateral_accel: 'm/s²',
  stop_dwell_time: 's',
  pickup_approach_speed: 'm/s',
  pickup_curb_distance: 'm',
  pickup_stop_precision: 'm',
  pickup_dwell_time: 's',
  dropoff_approach_speed: 'm/s',
  dropoff_curb_distance: 'm',
  occupied_acceleration_scale: 'ratio',
  occupied_lateral_accel_scale: 'ratio',
});
export function pickupPolicyDocument(
  rValues: Partial<Record<PickupPolicyV2Key, number>> = {},
  mValues: Partial<Record<PickupPolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...pickupPolicyMValues,
    ...mValues,
    ...defaultPickupPolicyValues,
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
export function pickupPolicyProfile(
  rValues: Partial<Record<PickupPolicyV2Key, number>> = {},
  mValues: Partial<Record<PickupPolicyV2MKey, number>> = {},
): PickupPolicyV2Profile {
  return compilePickupPolicyProfile(pickupPolicyDocument(rValues, mValues));
}
/** One scene: the ego state, the real ride state and the authored service stop. */
export interface PickupPolicyScene {
  readonly name: string;
  readonly description: string;
  readonly speedMps: number;
  readonly rideState: PickupPolicyRideState;
  readonly dwellElapsedS?: number;
  readonly service?: PickupPolicyV2Service | null;
  readonly classId?: VehicleClassId;
  readonly surfaceId?: RoadSurfaceId;
}
export function pickupPolicyObservation(
  scene: PickupPolicyScene,
  tick: number = scenario.tick,
): PickupPolicyV2Observation {
  return {
    version: PICKUP_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    speedMps: scene.speedMps,
    mechanics: {
      version: PICKUP_POLICY_V2_LIMITS.mechanicsVersion,
      classId: scene.classId ?? 'sedan',
    },
    surface: {
      version: PICKUP_POLICY_V2_LIMITS.surfaceVersion,
      id: scene.surfaceId ?? 'dry-asphalt',
    },
    rideState: scene.rideState,
    dwellElapsedS: scene.dwellElapsedS ?? 0,
    service: scene.service ?? null,
  };
}
export interface PickupPolicyEvaluationOptions {
  readonly tick?: number;
  readonly rValues?: Partial<Record<PickupPolicyV2Key, number>>;
  readonly mValues?: Partial<Record<PickupPolicyV2MKey, number>>;
  readonly authority?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly observation?: PickupPolicyV2Observation;
  readonly profile?: PickupPolicyV2Profile | null;
}
export interface PickupPolicyEvaluation {
  readonly command: PickupPolicyV2Command;
  readonly profile: PickupPolicyV2Profile;
  readonly decisionTick: number;
  readonly input: PickupPolicyV2Input;
}
export function evaluate(
  scene: PickupPolicyScene,
  options: PickupPolicyEvaluationOptions = {},
): PickupPolicyEvaluation {
  const profile = pickupPolicyProfile(options.rValues, options.mValues),
    decisionTick = options.tick ?? scenario.tick,
    input: PickupPolicyV2Input = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: options.authority ?? 'AUTO',
      profile: options.profile === undefined ? profile : options.profile,
      observation: options.observation ?? pickupPolicyObservation(scene, decisionTick),
    };
  return { command: evaluatePickupPolicyV2(input), profile, decisionTick, input };
}
function serviceOf(
  stop: RealServiceStop,
  phase: PickupServicePhase,
  overrides: Partial<PickupPolicyV2Service> = {},
): PickupPolicyV2Service {
  return Object.freeze({
    zoneId: stop.zoneId,
    zoneKind: stop.kind,
    phase,
    taxiAccess: stop.taxiAccess,
    distanceToStopM: 0,
    lengthM: stop.lengthM,
    stopOffsetM: stop.stopOffsetM,
    curbBandM: stop.curbBandM,
    curbDistanceM: 0.5,
    ...overrides,
  });
}
/** The pickup stop of the real assignment, approached from `distanceM` before the marked point. */
export function pickupService(
  overrides: Partial<PickupPolicyV2Service> = {},
): PickupPolicyV2Service {
  return serviceOf(realRideFacts().pickupStop, 'PICKUP', overrides);
}
/** The real dropoff stop, approached from `distanceM` before the marked point. */
export function dropoffService(
  overrides: Partial<PickupPolicyV2Service> = {},
): PickupPolicyV2Service {
  return serviceOf(realRideFacts().dropoffStop, 'DROPOFF', overrides);
}
/** The real CIVIL-only zone: a marked bay no taxi service may use. */
export function civilOnlyService(
  overrides: Partial<PickupPolicyV2Service> = {},
): PickupPolicyV2Service {
  return serviceOf(realRideFacts().civilOnlyStop, 'DROPOFF', overrides);
}
export const pickupApproachScene = (): PickupPolicyScene => {
  const facts = realRideFacts(),
    stop = facts.pickupStop;
  return {
    name: 'apropiere pickup',
    description: `zona reală \`${stop.zoneId}\` (${stop.kind}, TAXI) pe banda \`${stop.laneId}\`, cu ${stop.lengthM.toFixed(2)} m lungime și ${stop.curbBandM.toFixed(2)} m adâncime; ego la 5,00 m înainte de intrare, ${(5 + stop.stopOffsetM).toFixed(2)} m până la punctul de oprire`,
    speedMps: 3,
    rideState: 'TO_PICKUP',
    service: pickupService({ distanceToStopM: 5 + stop.stopOffsetM }),
  };
};
export const pickupCurbScene = (): PickupPolicyScene => ({
  name: 'distanța la bordură (pickup)',
  description:
    'ego oprit pe punctul de oprire din zona reală de pickup, caroseria la 0,50 m de bordură',
  speedMps: 0,
  rideState: 'TO_PICKUP',
  dwellElapsedS: 0.7,
  service: pickupService(),
});
export const pickupPrecisionScene = (): PickupPolicyScene => ({
  name: 'precizia opririi',
  description: 'același punct de oprire marcat, cu 1,00 s de staționare acumulată',
  speedMps: 0,
  rideState: 'TO_PICKUP',
  dwellElapsedS: 1,
  service: pickupService(),
});
export const pickupDwellScene = (): PickupPolicyScene => ({
  name: 'staționarea la pickup',
  description: 'ego oprit în zonă, cu 1,00 s de staționare și îmbarcarea încă neconfirmată de 061',
  speedMps: 0,
  rideState: 'TO_PICKUP',
  dwellElapsedS: 1,
  service: pickupService(),
});
export const dropoffApproachScene = (): PickupPolicyScene => {
  const stop = realRideFacts().dropoffStop;
  return {
    name: 'apropiere dropoff',
    description: `zona reală \`${stop.zoneId}\` (${stop.kind}) pe banda \`${stop.laneId}\`, cu pasager la bord, la 5,00 m înainte de intrare`,
    speedMps: 3,
    rideState: 'TO_DROPOFF',
    service: dropoffService({ distanceToStopM: 5 + stop.stopOffsetM }),
  };
};
export const dropoffCurbScene = (): PickupPolicyScene => ({
  name: 'distanța la bordură (dropoff)',
  description: 'ego oprit pe punctul de oprire din zona reală de dropoff, cu pasager la bord',
  speedMps: 0,
  rideState: 'TO_DROPOFF',
  service: dropoffService(),
});
export const occupiedAccelerationScene = (): PickupPolicyScene => ({
  name: 'accelerația cu pasager',
  description: 'pasager la bord (061 `TO_DROPOFF`) pe drum liber, fără serviciu în curs',
  speedMps: 5,
  rideState: 'TO_DROPOFF',
});
export const occupiedLateralScene = (): PickupPolicyScene => ({
  name: 'accelerația laterală cu pasager',
  description: 'același pasager la bord, fără serviciu în curs: numai plafonul lateral',
  speedMps: 5,
  rideState: 'TO_DROPOFF',
});
/** The scenario table: one isolated scene per key. */
export interface PickupPolicyScenarioRow {
  readonly name: string;
  readonly scene: PickupPolicyScene;
  readonly key: PickupPolicyV2Key;
  readonly unit: string;
  readonly note: string;
  readonly measure: (command: PickupPolicyV2Command) => number;
}
export const scenarioRows: readonly PickupPolicyScenarioRow[] = Object.freeze([
  {
    name: 'viteza de apropiere de pickup',
    scene: pickupApproachScene(),
    key: 'pickup_approach_speed',
    unit: 'm/s',
    note: 'viteza comandată este `min(cheie, sqrt(2 · comfort_deceleration · distanță))`, deci oprirea nu poate depăși punctul marcat',
    measure: (command) => command.approach?.commandedSpeedMps ?? 0,
  },
  {
    name: 'distanța la bordură (pickup)',
    scene: pickupCurbScene(),
    key: 'pickup_curb_distance',
    unit: 'm',
    note: 'distanța efectivă este plafonată de banda autorată: `[0,15 m, adâncime − lățime]`',
    measure: (command) => command.curb?.effectiveM ?? 0,
  },
  {
    name: 'precizia opririi',
    scene: pickupPrecisionScene(),
    key: 'pickup_stop_precision',
    unit: 'm',
    note: 'toleranța efectivă este ridicată la toleranța fizică 062 și plafonată la semilățimea punctului marcat',
    measure: (command) => command.precision?.effectiveM ?? 0,
  },
  {
    name: 'staționarea la pickup',
    scene: pickupDwellScene(),
    key: 'pickup_dwell_time',
    unit: 's',
    note: 'durata efectivă este `max(cheie, 3 s îmbarcare 062, M stop_dwell_time)`',
    measure: (command) => command.dwell?.effectiveS ?? 0,
  },
  {
    name: 'viteza de apropiere de dropoff',
    scene: dropoffApproachScene(),
    key: 'dropoff_approach_speed',
    unit: 'm/s',
    note: 'același plafon cinematic, pe faza reală de dropoff cu pasager la bord',
    measure: (command) => command.approach?.commandedSpeedMps ?? 0,
  },
  {
    name: 'distanța la bordură (dropoff)',
    scene: dropoffCurbScene(),
    key: 'dropoff_curb_distance',
    unit: 'm',
    note: 'aceeași bandă autorată, pe faza reală de dropoff',
    measure: (command) => command.curb?.effectiveM ?? 0,
  },
  {
    name: 'accelerația cu pasager',
    scene: occupiedAccelerationScene(),
    key: 'occupied_acceleration_scale',
    unit: 'm/s²',
    note: 'scara se aplică numai cu pasager la bord și este plafonată de confort și de aderență',
    measure: (command) => command.passenger.acceleration.commandedMps2,
  },
  {
    name: 'accelerația laterală cu pasager',
    scene: occupiedLateralScene(),
    key: 'occupied_lateral_accel_scale',
    unit: 'm/s²',
    note: 'scara laterală este plafonată de preferința M `curve_lateral_accel` și de aderență',
    measure: (command) => command.passenger.lateralAccel.commandedMps2,
  },
]);
export function sceneOf(key: PickupPolicyV2Key): PickupPolicyScene {
  const row = scenarioRows.find((entry) => entry.key === key);
  if (row === undefined) throw new Error(`Missing pickup policy scenario ${key}`);
  return row.scene;
}
