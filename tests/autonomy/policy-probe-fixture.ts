/**
 * Shared real-engine fixtures for the 050/051/053 decision probes. Each fixture reuses the authored
 * engines rather than a toy model: 033 lane graph, 036 signal controller, 037 stop rules and 044
 * road context. Authoritative observations are derived from those outputs only.
 */
import { createLaneGraph, createSignalController, createStopRules } from '../../src/world';
import type { LaneGraph, RoadAccess, RoadMap, StopZone } from '../../src/world';
import { createEventBus } from '../../src/simulation';
import type { SimulationEvent } from '../../src/simulation';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
import { createRoadContext } from '../../src/autonomy/road-context';
import type { RoadContextEngine, RoadContextFrame } from '../../src/autonomy/road-context';
import { LANE_CHANGE_LIMITS } from '../../src/autonomy/lane-change-policy';
import type { LaneChangeAdjacency } from '../../src/autonomy/lane-change-policy';
import { mutableMap } from '../world/negative-fixtures';
import type { Mutable } from '../world/negative-fixtures';
import { roadContextFixture } from './road-context-reference';

/** Authored STOP-kind line on lane-a at x=8.5; the crosswalk line stays a different kind. */
export function stopLineMap(): Mutable<RoadMap> {
  const map = mutableMap();
  map.stopLines[0].kind = 'STOP';
  map.stopLines[0].signalId = null;
  return map;
}

/** Real037 producer on the authored STOP line, plus the stop-line datum on lane-a. */
export function stopProbeFixture() {
  const map = stopLineMap(),
    context = { sessionId: '051-probe', worldEpoch: 0 },
    graph = createLaneGraph(map),
    rules = createStopRules(map, context, { dwellS: 1 / 60 }),
    projection = graph.projectOnLane('lane-a', {
      positionM: { x: 8.5, y: 0, z: 0 },
      access: 'TAXI',
      headingRad: 0,
    });
  if (!projection) throw new Error('051 probe fixture stop line has no lane projection');
  return { map, context, graph, rules, stopLineLongitudinalM: projection.longitudinalM };
}

/**
 * Standalone two-lane approach merging into one outgoing lane: lane-par is the authored033 lateral
 * neighbour of lane-a, and both legally reach the same service zone through the junction movement.
 */
export function parallelLaneMap(): Mutable<RoadMap> {
  const point = (id: string, x: number, z: number) => ({ id, positionM: { x, y: 0, z } });
  const map: Mutable<RoadMap> = {
    schemaVersion: 1,
    units: 'SI',
    mapId: '053-parallel-corridor-v1',
    bounds: { minM: { x: -5, y: 0, z: -5 }, maxM: { x: 45, y: 5, z: 10 } },
    geometry: {
      nodes: [
        point('m-a', 0, 0),
        point('m-b', 20, 0),
        point('p-a', 0, 4),
        point('p-b', 20, 4),
        point('o-a', 24.5, 2),
        point('o-b', 42, 2),
        point('j1', 19, -3),
        point('j2', 25, -3),
        point('j3', 25, 7),
        point('j4', 19, 7),
        point('s1', 23.5, 1),
        point('s2', 25.5, 1),
        point('s3', 25.5, 3),
        point('s4', 23.5, 3),
      ],
      paths: [
        { id: 'g-main', nodeIds: ['m-a', 'm-b'] },
        { id: 'g-par', nodeIds: ['p-a', 'p-b'] },
        { id: 'g-out', nodeIds: ['o-a', 'o-b'] },
        { id: 'g-move-main', nodeIds: ['m-b', 'o-a'] },
        { id: 'g-move-par', nodeIds: ['p-b', 'o-a'] },
      ],
      areas: [
        { id: 'g-junction', vertexNodeIds: ['j1', 'j2', 'j3', 'j4'] },
        { id: 'g-service', vertexNodeIds: ['s1', 's2', 's3', 's4'] },
      ],
    },
    lanes: [
      {
        id: 'lane-a',
        geometryId: 'g-main',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 13.4,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: 'lane-par', right: null },
        successorIds: ['lane-out'],
        fromIntersectionId: null,
        toIntersectionId: 'junction',
      },
      {
        id: 'lane-par',
        geometryId: 'g-par',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 13.4,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: 'lane-a' },
        successorIds: ['lane-out'],
        fromIntersectionId: null,
        toIntersectionId: 'junction',
      },
      {
        id: 'lane-out',
        geometryId: 'g-out',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 13.4,
        access: ['TAXI', 'CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [],
        fromIntersectionId: 'junction',
        toIntersectionId: null,
      },
    ],
    intersections: [
      {
        id: 'junction',
        geometryId: 'g-junction',
        incomingLaneIds: ['lane-a', 'lane-par'],
        outgoingLaneIds: ['lane-out'],
        conflictZones: [],
        movements: [
          {
            id: 'main-out',
            geometryId: 'g-move-main',
            fromLaneId: 'lane-a',
            toLaneId: 'lane-out',
            conflictZoneIds: [],
          },
          {
            id: 'par-out',
            geometryId: 'g-move-par',
            fromLaneId: 'lane-par',
            toLaneId: 'lane-out',
            conflictZoneIds: [],
          },
        ],
      },
    ],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'service',
        geometryId: 'g-service',
        laneId: 'lane-out',
        anchorNodeId: 'o-a',
        access: ['TAXI', 'CIVIL'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [],
  };
  return map;
}

/** Real033 lateral-neighbour projection for one lane and access class. */
export function laneAdjacency(
  graph: LaneGraph,
  laneId: string,
  access: RoadAccess,
): LaneChangeAdjacency {
  const neighbors = graph.getNeighbors(laneId, access),
    entries: { laneId: string; side: 'LEFT' | 'RIGHT' }[] = [];
  if (neighbors.left) entries.push({ laneId: neighbors.left.id, side: 'LEFT' });
  if (neighbors.right) entries.push({ laneId: neighbors.right.id, side: 'RIGHT' });
  return {
    version: LANE_CHANGE_LIMITS.adjacencyVersion,
    mapId: graph.mapId,
    currentLaneId: laneId,
    access,
    neighbors: entries,
  };
}

export function laneProbeFixture() {
  const map = parallelLaneMap(),
    graph = createLaneGraph(map);
  return {
    map,
    graph,
    adjacency: (laneId: string, access: RoadAccess) => laneAdjacency(graph, laneId, access),
  };
}

/**
 * Deterministic authored kinematic approach for the037 probe: travel to the stop point, hold with
 * zero travel, then leave and cross. The fixture owns pose and speed; 037 remains the authority for
 * the opportunity identity, the proof and the crossing.
 */
export function stopApproachProfile(input: {
  readonly ticks: number;
  readonly stopPointM: number;
  readonly holdTicks: number;
  readonly stepM: number;
  readonly startM?: number;
}): readonly Readonly<{ tick: number; xM: number; speedMps: number }>[] {
  const frames: Readonly<{ tick: number; xM: number; speedMps: number }>[] = [],
    movingSpeedMps = input.stepM * 60;
  let xM = input.startM ?? 0.5,
    held = 0,
    released = false;
  for (let tick = 1; tick <= input.ticks; tick++) {
    if (!released) {
      if (xM < input.stopPointM) {
        xM = Math.min(input.stopPointM, xM + input.stepM);
        frames.push(Object.freeze({ tick, xM, speedMps: movingSpeedMps }));
        continue;
      }
      held++;
      if (held > input.holdTicks) released = true;
      else {
        frames.push(Object.freeze({ tick, xM, speedMps: 0 }));
        continue;
      }
    }
    xM += input.stepM;
    frames.push(Object.freeze({ tick, xM, speedMps: movingSpeedMps }));
  }
  return Object.freeze(frames);
}

/**
 * Real044/045/036 combination on the authored cross fixture, plus a derived stop-line datum: the
 * end of the subject's own lane (the intersection entry), taken from the033 directed path.
 */
export function signalProbeFixture() {
  const fixture = roadContextFixture(false),
    { map, policy, frame, graph } = fixture,
    scope = { sessionId: frame.sessionId, worldEpoch: frame.worldEpoch },
    eventBus = createEventBus({
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
    }),
    signals = createSignalController(map, {
      context: { schemaVersion: 1, units: 'SI', ...scope },
      eventBus,
      initialTick: 0,
    }),
    context = createRoadContext(map, { priorityPolicy: policy }),
    behavior = createBehaviorFSM(scope);
  behavior.setActors(
    frame.vehicles.map(({ id, incarnation }) => ({ id, incarnation })),
    scope,
  );
  const stopLineDistanceM = (laneId: string, positionM: { x: number; y: number; z: number }) => {
    const path = graph.getDirectedPath(laneId),
      projection = graph.locateLane({ positionM, access: 'TAXI', headingRad: 0 });
    if (!path || !projection || projection.lane.id !== laneId) return null;
    return Math.max(0, path.lengthM - projection.longitudinalM);
  };
  const prepare = (tick: number) => {
    signals.step(tick);
    frame.tick = tick;
    frame.signals = map.intersections[0].movements.map((movement) =>
      signals.getMovementSignal('junction', movement.id)!,
    );
    context.updateFrame(frame as RoadContextFrame);
  };
  return {
    map,
    frame,
    graph,
    behavior,
    context,
    signals,
    stopLineDistanceM,
    prepare,
    dispose() {
      behavior.dispose();
      context.dispose();
      signals.dispose();
      eventBus.dispose();
    },
  };
}

export type { RoadContextEngine, SimulationEvent, StopZone };
