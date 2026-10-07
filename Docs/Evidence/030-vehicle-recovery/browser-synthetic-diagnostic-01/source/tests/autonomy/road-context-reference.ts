// Exhaustive oracle prepared before the PBI044 production context engine.
import { createLaneGraph, createIntersectionConflicts } from '../../src/world';
import type {
  LaneGraph,
  IntersectionConflicts,
  RoadAccess,
  MovementSignal,
  RoadMap,
  LaneProjection,
} from '../../src/world';
import type { Vector3 } from '../../src/vehicles';
import { bruteQuery } from '../world/spatial-index-reference';
import type { ReferenceEntity } from '../world/spatial-index-reference';
import { intersectionConflictFixture } from '../world/intersection-conflicts-fixture';
export interface ReferenceVehicle {
  id: string;
  incarnation: number;
  positionM: Vector3;
  headingRad: number;
  access: RoadAccess;
  speedMps: number;
  radiusM: number;
  route: { intersectionId: string; movementId: string } | null;
  distances: { relationId: string; distanceM: number; clearanceM: number }[];
}
export interface ReferenceFrame {
  sessionId: string;
  worldEpoch: number;
  tick: number;
  vehicles: ReferenceVehicle[];
  obstacles: ReferenceEntity[];
  zones: ReferenceEntity[];
  signals: MovementSignal[];
  completeness: { vehicles: boolean; obstacles: boolean; zones: boolean; signals: boolean };
}
export function roadContextFixture(dense: boolean) {
  const map = intersectionConflictFixture();
  map.mapId = '044-context-cross-v1';
  map.bounds = { minM: { x: -300, y: 0, z: -300 }, maxM: { x: 300, y: 20, z: 300 } };
  for (const node of map.geometry.nodes) {
    node.positionM.x *= 10;
    node.positionM.z *= 10;
  }
  for (const lane of map.lanes) lane.widthM = 3.5;
  map.signals.push({
    id: 'fixture-signal',
    intersectionId: 'junction',
    phases: [
      {
        id: 'fixture-red',
        durationS: 1,
        movementStates: map.intersections[0].movements.map((movement) => ({
          movementId: movement.id,
          state: 'RED',
        })),
      },
      {
        id: 'fixture-green',
        durationS: 1,
        movementStates: map.intersections[0].movements.map((movement) => ({
          movementId: movement.id,
          state: movement.id === 'west-straight' ? 'GREEN' : 'RED',
        })),
      },
    ],
  });
  // A parallel deck with a return ramp; it legally reaches the existing service.
  map.geometry.nodes.push(
    { id: 'deck-a', positionM: { x: -200, y: 12, z: -20 } },
    { id: 'deck-b', positionM: { x: -100, y: 12, z: -20 } },
  );
  map.geometry.paths.push({ id: 'deck-path', nodeIds: ['deck-a', 'deck-b', 'west-outer'] });
  map.lanes.push({
    id: 'deck',
    geometryId: 'deck-path',
    direction: 'FORWARD',
    widthM: 3.5,
    speedLimitMps: 10,
    access: ['TAXI', 'CIVIL'],
    neighbors: { left: null, right: null },
    successorIds: ['west-in'],
    fromIntersectionId: null,
    toIntersectionId: null,
  });
  const conflicts = createIntersectionConflicts(map);
  // Explicit synthetic policy, not inference of actual right of way.
  const rules = map.intersections.flatMap((junction) =>
    junction.movements.flatMap((movement) =>
      conflicts
        .getIncompatible(junction.id, movement.id)
        .filter((relation) => relation.movementIds[0] === movement.id)
        .map((relation) => ({
          intersectionId: junction.id,
          movementIds: relation.movementIds,
          priorityMovementId: relation.movementIds[0],
        })),
    ),
  );
  const policy = {
    schemaVersion: 1,
    units: 'SI',
    mapId: map.mapId,
    versionId: '044-explicit-fixture-policy',
    rules,
  };
  const graph = createLaneGraph(map),
    vehicles: ReferenceVehicle[] = [];
  const routes = ['west-straight', 'east-straight', 'south-straight', 'north-right'];
  for (let i = 0; i < (dense ? 110 : 64); i++) {
    const route = routes[i % 4],
      movement = conflicts.getMovement('junction', route)!;
    const path = graph.getDirectedPath(i % 19 === 0 ? 'deck' : movement.movement.fromLaneId)!;
    const a = path.points[0],
      b = path.points[1],
      fraction = dense ? 0.6 + (i % 17) * 0.02 : 0.05 + (i % 16) * 0.055;
    vehicles.push({
      id: `vehicle-${i}`,
      incarnation: 1,
      positionM: {
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
        z: a.z + (b.z - a.z) * fraction,
      },
      headingRad: Math.atan2(b.z - a.z, b.x - a.x),
      access: i % 2 === 0 ? 'TAXI' : 'CIVIL',
      speedMps: 8,
      radiusM: 2.5,
      route: i % 19 === 0 ? null : { intersectionId: 'junction', movementId: route },
      distances: conflicts
        .getIncompatible('junction', route)
        .map((relation) => ({ relationId: relation.id, distanceM: 10, clearanceM: 5 })),
    });
  }
  const obstacles: ReferenceEntity[] = Array.from({ length: dense ? 96 : 32 }, (_, i) => ({
    id: `obstacle-${i}`,
    incarnation: 1,
    kind: 'OBSTACLE',
    shape: {
      type: 'SPHERE',
      centerM: {
        x: -180 + (i % 16) * 5,
        y: i % 11 === 0 ? 12 : 0,
        z: -20 + Math.floor(i / 16) * 5,
      },
      radiusM: 1,
    },
  }));
  const zones: ReferenceEntity[] = Array.from({ length: dense ? 256 : 24 }, (_, i) => {
    const x = -200 + (i % 16) * 5,
      z = -30 + Math.floor(i / 16) * 5;
    return {
      id: `zone-${i}`,
      incarnation: 1,
      kind: 'ZONE',
      shape: {
        type: 'PRISM',
        minHeightM: -1,
        maxHeightM: 1,
        verticesM: [
          { x, y: 0, z },
          { x: x + 4, y: 0, z },
          { x: x + 4, y: 0, z: z + 4 },
          { x, y: 0, z: z + 4 },
        ],
      },
    };
  });
  const frame: ReferenceFrame = {
    sessionId: 'context-fixture',
    worldEpoch: 0,
    tick: 0,
    vehicles,
    obstacles,
    zones,
    signals: map.intersections[0].movements.map((movement) => ({
      tick: 0,
      signalId: 'fixture-signal',
      intersectionId: 'junction',
      phaseId: 'fixture-red',
      movementId: movement.id,
      state: 'RED',
    })),
    completeness: { vehicles: true, obstacles: true, zones: true, signals: true },
  };
  return { map, policy, frame, graph, conflicts };
}
function routeApplicable(
  map: RoadMap,
  conflicts: IntersectionConflicts,
  actor: ReferenceVehicle,
  lane: LaneProjection | null,
): boolean {
  if (!actor.route) return false;
  const movement = conflicts.getMovement(actor.route.intersectionId, actor.route.movementId);
  if (!movement) return false;
  if (lane) return movement.movement.fromLaneId === lane.lane.id;
  const intersection = map.intersections.find((item) => item.id === actor.route!.intersectionId)!;
  const area = map.geometry.areas.find((item) => item.id === intersection.geometryId)!;
  const vertices = area.vertexNodeIds.map(
    (id) => map.geometry.nodes.find((node) => node.id === id)!.positionM,
  );
  const p = actor.positionM;
  if (
    p.y < Math.min(...vertices.map((v) => v.y)) - 1.5 ||
    p.y > Math.max(...vertices.map((v) => v.y)) + 1.5
  )
    return false;
  let inside = false;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (
      cross === 0 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.z >= Math.min(a.z, b.z) &&
      p.z <= Math.max(a.z, b.z)
    )
      return true;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}
export function exhaustiveRoadContext(
  map: RoadMap,
  graph: LaneGraph,
  conflicts: IntersectionConflicts,
  frame: ReferenceFrame,
  subjectId: string,
  radiusM = 60,
) {
  const subject = frame.vehicles.find((actor) => actor.id === subjectId)!;
  const all: ReferenceEntity[] = [
    ...frame.vehicles.map((actor): ReferenceEntity => ({
      id: actor.id,
      incarnation: actor.incarnation,
      kind: 'VEHICLE',
      shape: { type: 'SPHERE', centerM: actor.positionM, radiusM: actor.radiusM },
    })),
    ...frame.obstacles,
    ...frame.zones,
  ];
  const nearby = new Set(bruteQuery(all, { centerM: subject.positionM, radiusM }));
  nearby.delete(subject.id);
  const lane = graph.locateLane({
    positionM: subject.positionM,
    access: subject.access,
    headingRad: subject.headingRad,
  });
  let leader: ReferenceVehicle | null = null,
    gapM = Infinity,
    aheadM = Infinity;
  for (const actor of frame.vehicles) {
    if (!nearby.has(actor.id) || !lane) continue;
    const location = graph.locateLane({
      positionM: actor.positionM,
      access: actor.access,
      headingRad: actor.headingRad,
    });
    if (
      !location ||
      location.lane.id !== lane.lane.id ||
      location.longitudinalM <= lane.longitudinalM
    )
      continue;
    const ahead = location.longitudinalM - lane.longitudinalM;
    const gap = Math.max(0, ahead - subject.radiusM - actor.radiusM);
    if (ahead < aheadM || (ahead === aheadM && actor.id < (leader?.id ?? ''))) {
      leader = actor;
      gapM = gap;
      aheadM = ahead;
    }
  }
  const validRoute = routeApplicable(map, conflicts, subject, lane) ? subject.route : null;
  const signal = validRoute
    ? (frame.signals.find(
        (item) =>
          item.intersectionId === validRoute.intersectionId &&
          item.movementId === validRoute.movementId &&
          item.tick === frame.tick,
      ) ?? null)
    : null;
  const relations = validRoute
    ? conflicts.getIncompatible(validRoute.intersectionId, validRoute.movementId)
    : [];
  return {
    tick: frame.tick,
    sessionId: frame.sessionId,
    worldEpoch: frame.worldEpoch,
    subject: { id: subject.id, incarnation: subject.incarnation },
    laneId: lane?.lane.id ?? null,
    leader: leader ? { id: leader.id, incarnation: leader.incarnation, gapM } : null,
    signal: signal
      ? {
          state: signal.state,
          signalId: signal.signalId,
          movementId: signal.movementId,
          tick: signal.tick,
        }
      : null,
    conflictRelationIds: relations.map((relation) => relation.id).sort(),
    conflictVehicleIds: frame.vehicles
      .filter(
        (actor) =>
          nearby.has(actor.id) &&
          actor.route &&
          validRoute &&
          actor.route.intersectionId === validRoute.intersectionId &&
          actor.route.movementId !== validRoute.movementId &&
          routeApplicable(
            map,
            conflicts,
            actor,
            graph.locateLane({
              positionM: actor.positionM,
              access: actor.access,
              headingRad: actor.headingRad,
            }),
          ) &&
          relations.some((relation) => relation.movementIds.includes(actor.route!.movementId)),
      )
      .map((actor) => actor.id)
      .sort(),
    obstacleIds: frame.obstacles
      .filter((entity) => nearby.has(entity.id))
      .map((entity) => entity.id)
      .sort(),
    zoneIds: frame.zones
      .filter((entity) => nearby.has(entity.id))
      .map((entity) => entity.id)
      .sort(),
  };
}
