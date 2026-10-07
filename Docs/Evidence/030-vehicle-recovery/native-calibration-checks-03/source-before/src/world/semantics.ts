import { ensure } from './errors';
import type { Vector3 } from '../vehicles';
import type { GeometryArea, GeometryPath, Lane, Movement, RoadMap } from './schema';
export function validateSemantics(map: RoadMap): void {
  const { minM, maxM } = map.bounds;
  ensure(
    minM.x < maxM.x && minM.z < maxM.z && minM.y <= maxM.y,
    'map.bounds',
    'Expected positive X/Z extent and nonnegative Y extent',
    map.mapId,
  );
  const globalIds = new Map<string, string>();
  function index<T extends { readonly id: string }>(
    items: readonly T[],
    path: string,
  ): Map<string, T> {
    const result = new Map<string, T>();
    items.forEach((item, i) => {
      const p = `${path}[${i}]`;
      ensure(
        !globalIds.has(item.id),
        `${p}.id`,
        `Duplicate ID, first at ${globalIds.get(item.id)}`,
        item.id,
      );
      globalIds.set(item.id, p);
      result.set(item.id, item);
    });
    return result;
  }
  function unique(ids: readonly string[], path: string, id: string): void {
    const seen = new Set<string>();
    ids.forEach((ref, i) => {
      ensure(!seen.has(ref), `${path}[${i}]`, `Duplicate reference ${ref}`, id);
      seen.add(ref);
    });
  }
  function ref<T>(table: Map<string, T>, id: string, path: string, owner: string): T {
    const result = table.get(id);
    ensure(result !== undefined, path, `Missing reference ${id}`, owner);
    return result;
  }
  const nodes = index(map.geometry.nodes, 'map.geometry.nodes');
  const paths = index(map.geometry.paths, 'map.geometry.paths');
  const areas = index(map.geometry.areas, 'map.geometry.areas');
  const lanes = index(map.lanes, 'map.lanes');
  const intersections = index(map.intersections, 'map.intersections');
  const signals = index(map.signals, 'map.signals');
  const stops = index(map.stopLines, 'map.stopLines');
  index(map.crosswalks, 'map.crosswalks');
  index(map.serviceZones, 'map.serviceZones');
  index(map.recoveryPoints, 'map.recoveryPoints');
  const position = (id: string, p: string, owner: string): Vector3 =>
    ref(nodes, id, p, owner).positionM;
  const equal = (a: Vector3, b: Vector3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
  for (const [i, node] of map.geometry.nodes.entries()) {
    const p = node.positionM;
    ensure(
      p.x >= minM.x &&
        p.x <= maxM.x &&
        p.y >= minM.y &&
        p.y <= maxM.y &&
        p.z >= minM.z &&
        p.z <= maxM.z,
      `map.geometry.nodes[${i}].positionM`,
      'Position outside map bounds',
      node.id,
      p,
    );
  }
  for (const [i, path] of map.geometry.paths.entries()) {
    const p = `map.geometry.paths[${i}].nodeIds`;
    unique(path.nodeIds, p, path.id);
    path.nodeIds.forEach((id, j) => {
      const point = position(id, `${p}[${j}]`, path.id);
      if (j)
        ensure(
          !equal(point, position(path.nodeIds[j - 1], `${p}[${j - 1}]`, path.id)),
          `${p}[${j}]`,
          'Zero-length path edge',
          path.id,
          point,
        );
    });
  }
  for (const [i, area] of map.geometry.areas.entries()) {
    const p = `map.geometry.areas[${i}].vertexNodeIds`;
    unique(area.vertexNodeIds, p, area.id);
    let signedArea = 0;
    area.vertexNodeIds.forEach((id, j) => {
      const a = position(id, `${p}[${j}]`, area.id),
        b = position(area.vertexNodeIds[(j + 1) % area.vertexNodeIds.length], p, area.id);
      ensure(!equal(a, b), p, 'Zero-length area edge', area.id, a);
      signedArea += a.x * b.z - b.x * a.z;
    });
    ensure(Math.abs(signedArea) > 1e-8, p, 'Degenerate X/Z polygon footprint', area.id);
  }
  function areaBox(area: GeometryArea): { min: Vector3; max: Vector3 } {
    const points = area.vertexNodeIds.map((id) => nodes.get(id)!.positionM);
    return {
      min: {
        x: Math.min(...points.map((p) => p.x)),
        y: Math.min(...points.map((p) => p.y)),
        z: Math.min(...points.map((p) => p.z)),
      },
      max: {
        x: Math.max(...points.map((p) => p.x)),
        y: Math.max(...points.map((p) => p.y)),
        z: Math.max(...points.map((p) => p.z)),
      },
    };
  }
  const boxCache = new Map<string, ReturnType<typeof areaBox>>();
  for (const area of areas.values()) boxCache.set(area.id, areaBox(area));
  function inAreaBox(point: Vector3, area: GeometryArea): boolean {
    const box = boxCache.get(area.id)!;
    return (
      point.x >= box.min.x &&
      point.x <= box.max.x &&
      point.y >= box.min.y &&
      point.y <= box.max.y &&
      point.z >= box.min.z &&
      point.z <= box.max.z
    );
  }
  function pathOf(lane: Lane): GeometryPath {
    return paths.get(lane.geometryId)!;
  }
  function endpoint(lane: Lane, end: boolean): string {
    const ids = pathOf(lane).nodeIds;
    return end === (lane.direction === 'FORWARD') ? ids[ids.length - 1] : ids[0];
  }
  for (const [i, lane] of map.lanes.entries()) {
    const p = `map.lanes[${i}]`;
    ref(paths, lane.geometryId, `${p}.geometryId`, lane.id);
    unique(lane.access, `${p}.access`, lane.id);
    unique(lane.successorIds, `${p}.successorIds`, lane.id);
    for (const [key, intersectionId, isEnd] of [
      ['fromIntersectionId', lane.fromIntersectionId, false],
      ['toIntersectionId', lane.toIntersectionId, true],
    ] as const) {
      if (intersectionId === null) continue;
      const junction = ref(intersections, intersectionId, `${p}.${key}`, lane.id);
      const area = ref(areas, junction.geometryId, `${p}.${key}`, lane.id);
      const point = position(endpoint(lane, isEnd), p, lane.id);
      ensure(
        inAreaBox(point, area),
        `${p}.${key}`,
        'Directed endpoint outside intersection bounding box',
        lane.id,
        point,
      );
    }
  }
  const movementIndex = new Map<string, { movement: Movement; intersectionId: string }>();
  for (const [i, junction] of map.intersections.entries()) {
    const p = `map.intersections[${i}]`;
    ref(areas, junction.geometryId, `${p}.geometryId`, junction.id);
    unique(junction.incomingLaneIds, `${p}.incomingLaneIds`, junction.id);
    unique(junction.outgoingLaneIds, `${p}.outgoingLaneIds`, junction.id);
    for (const [key, ids, isIncoming] of [
      ['incomingLaneIds', junction.incomingLaneIds, true],
      ['outgoingLaneIds', junction.outgoingLaneIds, false],
    ] as const) {
      for (const [j, id] of ids.entries()) {
        const lane = ref(lanes, id, `${p}.${key}[${j}]`, junction.id);
        ensure(
          (isIncoming ? lane.toIntersectionId : lane.fromIntersectionId) === junction.id,
          `${p}.${key}[${j}]`,
          'Lane direction/intersection membership mismatch',
          lane.id,
          position(endpoint(lane, isIncoming), p, lane.id),
        );
      }
    }
    for (const lane of lanes.values()) {
      if (lane.toIntersectionId === junction.id)
        ensure(
          junction.incomingLaneIds.includes(lane.id),
          `${p}.incomingLaneIds`,
          'Incoming lane omitted',
          lane.id,
        );
      if (lane.fromIntersectionId === junction.id)
        ensure(
          junction.outgoingLaneIds.includes(lane.id),
          `${p}.outgoingLaneIds`,
          'Outgoing lane omitted',
          lane.id,
        );
    }
    const conflicts = index(junction.conflictZones, `${p}.conflictZones`);
    index(junction.movements, `${p}.movements`);
    const junctionArea = areas.get(junction.geometryId)!;
    for (const [k, zone] of junction.conflictZones.entries()) {
      const zoneArea = ref(areas, zone.geometryId, `${p}.conflictZones[${k}].geometryId`, zone.id);
      for (const node of zoneArea.vertexNodeIds)
        ensure(
          inAreaBox(nodes.get(node)!.positionM, junctionArea),
          `${p}.conflictZones[${k}].geometryId`,
          'Conflict footprint outside intersection bounding box',
          zone.id,
          nodes.get(node)!.positionM,
        );
    }
    const pairs = new Set<string>();
    for (const [j, movement] of junction.movements.entries()) {
      const q = `${p}.movements[${j}]`;
      const from = ref(lanes, movement.fromLaneId, `${q}.fromLaneId`, movement.id),
        to = ref(lanes, movement.toLaneId, `${q}.toLaneId`, movement.id);
      const curve = ref(paths, movement.geometryId, `${q}.geometryId`, movement.id);
      ensure(
        from.id !== to.id &&
          junction.incomingLaneIds.includes(from.id) &&
          junction.outgoingLaneIds.includes(to.id),
        q,
        'Movement must connect distinct incoming and outgoing lanes',
        movement.id,
      );
      ensure(
        curve.nodeIds[0] === endpoint(from, true) &&
          curve.nodeIds[curve.nodeIds.length - 1] === endpoint(to, false),
        `${q}.geometryId`,
        'Movement path endpoint/direction mismatch',
        movement.id,
        position(curve.nodeIds[0], q, movement.id),
      );
      for (const node of curve.nodeIds)
        ensure(
          inAreaBox(nodes.get(node)!.positionM, junctionArea),
          `${q}.geometryId`,
          'Movement path outside intersection bounding box',
          movement.id,
          nodes.get(node)!.positionM,
        );
      ensure(
        from.successorIds.includes(to.id),
        q,
        'Movement missing corresponding successor link',
        movement.id,
      );
      ensure(
        from.access.some((a) => to.access.includes(a)),
        q,
        'Movement has no common access class',
        movement.id,
      );
      const pair = JSON.stringify([from.id, to.id]);
      ensure(!pairs.has(pair), q, 'Duplicate movement for lane pair', movement.id);
      pairs.add(pair);
      unique(movement.conflictZoneIds, `${q}.conflictZoneIds`, movement.id);
      for (const [k, id] of movement.conflictZoneIds.entries())
        ref(conflicts, id, `${q}.conflictZoneIds[${k}]`, movement.id);
      movementIndex.set(movement.id, { movement, intersectionId: junction.id });
    }
  }
  for (const [i, lane] of map.lanes.entries()) {
    const p = `map.lanes[${i}]`;
    for (const [j, id] of lane.successorIds.entries()) {
      const next = ref(lanes, id, `${p}.successorIds[${j}]`, lane.id);
      ensure(next.id !== lane.id, `${p}.successorIds[${j}]`, 'Self successor forbidden', lane.id);
      ensure(
        lane.access.some((a) => next.access.includes(a)),
        `${p}.successorIds[${j}]`,
        'Successor has no common access class',
        lane.id,
      );
      if (lane.toIntersectionId !== null) {
        const junction = intersections.get(lane.toIntersectionId)!;
        ensure(
          next.fromIntersectionId === junction.id &&
            junction.movements.some((m) => m.fromLaneId === lane.id && m.toLaneId === next.id),
          `${p}.successorIds[${j}]`,
          'Intersection successor must have a permitted movement',
          lane.id,
        );
      } else
        ensure(
          next.fromIntersectionId === null && endpoint(lane, true) === endpoint(next, false),
          `${p}.successorIds[${j}]`,
          'Continuation endpoint/direction mismatch',
          lane.id,
          position(endpoint(lane, true), p, lane.id),
        );
    }
    ensure(
      lane.neighbors.left === null || lane.neighbors.left !== lane.neighbors.right,
      `${p}.neighbors`,
      'Same lane cannot occupy both neighbor sides',
      lane.id,
    );
    for (const side of ['left', 'right'] as const) {
      const id = lane.neighbors[side];
      if (id === null) continue;
      const neighbor = ref(lanes, id, `${p}.neighbors.${side}`, lane.id);
      ensure(
        neighbor.id !== lane.id &&
          neighbor.neighbors[side === 'left' ? 'right' : 'left'] === lane.id,
        `${p}.neighbors.${side}`,
        'Neighbor must be distinct and reciprocal',
        lane.id,
      );
      ensure(
        neighbor.fromIntersectionId === lane.fromIntersectionId &&
          neighbor.toIntersectionId === lane.toIntersectionId,
        `${p}.neighbors.${side}`,
        'Neighbor corridor membership mismatch',
        lane.id,
      );
      const a = position(endpoint(lane, false), p, lane.id),
        b = position(endpoint(lane, true), p, lane.id),
        c = position(endpoint(neighbor, false), p, lane.id),
        d = position(endpoint(neighbor, true), p, lane.id);
      ensure(
        (b.x - a.x) * (d.x - c.x) + (b.z - a.z) * (d.z - c.z) > 0,
        `${p}.neighbors.${side}`,
        'Neighbor travel directions oppose or are perpendicular',
        lane.id,
        a,
      );
    }
  }
  const signaledIntersections = new Set<string>();
  for (const [i, signal] of map.signals.entries()) {
    const p = `map.signals[${i}]`;
    const junction = ref(intersections, signal.intersectionId, `${p}.intersectionId`, signal.id);
    ensure(
      !signaledIntersections.has(junction.id),
      p,
      'One complete signal program per intersection is required',
      signal.id,
    );
    signaledIntersections.add(junction.id);
    index(signal.phases, `${p}.phases`);
    for (const [j, phase] of signal.phases.entries()) {
      const q = `${p}.phases[${j}]`;
      unique(
        phase.movementStates.map((s) => s.movementId),
        `${q}.movementStates`,
        phase.id,
      );
      ensure(
        phase.movementStates.length === junction.movements.length,
        `${q}.movementStates`,
        'Phase must assign every movement exactly once',
        phase.id,
      );
      const zones = new Map<string, string>(),
        destinations = new Map<string, string>();
      for (const [k, state] of phase.movementStates.entries()) {
        const r = `${q}.movementStates[${k}]`;
        const owner = ref(movementIndex, state.movementId, `${r}.movementId`, phase.id);
        ensure(
          owner.intersectionId === junction.id,
          r,
          'Signal phase references another intersection movement',
          phase.id,
        );
        if (state.state !== 'GREEN') continue;
        const movement = owner.movement;
        ensure(
          !destinations.has(movement.toLaneId),
          r,
          `Simultaneous GREEN merges with ${destinations.get(movement.toLaneId)}`,
          movement.id,
        );
        destinations.set(movement.toLaneId, movement.id);
        for (const zone of movement.conflictZoneIds) {
          ensure(
            !zones.has(zone),
            r,
            `Simultaneous GREEN conflicts with ${zones.get(zone)} in ${zone}`,
            movement.id,
          );
          zones.set(zone, movement.id);
        }
      }
    }
  }
  function anchor(
    laneId: string,
    nodeId: string,
    p: string,
    id: string,
    nodeField = 'anchorNodeId',
  ): Lane {
    const lane = ref(lanes, laneId, `${p}.laneId`, id);
    ref(nodes, nodeId, `${p}.${nodeField}`, id);
    ensure(
      pathOf(lane).nodeIds.includes(nodeId),
      `${p}.${nodeField}`,
      'Anchor must be a node on associated lane path',
      id,
      nodes.get(nodeId)!.positionM,
    );
    return lane;
  }
  for (const [i, line] of map.stopLines.entries()) {
    const p = `map.stopLines[${i}]`;
    const curve = ref(paths, line.geometryId, `${p}.geometryId`, line.id);
    ensure(
      curve.nodeIds.length === 2,
      `${p}.geometryId`,
      'Stop line requires exactly two nodes',
      line.id,
    );
    const lane = anchor(line.laneId, line.anchorNodeId, p, line.id);
    if (line.intersectionId !== null) {
      ref(intersections, line.intersectionId, `${p}.intersectionId`, line.id);
      ensure(
        lane.toIntersectionId === line.intersectionId,
        `${p}.intersectionId`,
        'Stop line must belong to approaching lane intersection',
        line.id,
      );
    }
    if (line.kind === 'SIGNAL') {
      ensure(
        line.signalId !== null && line.intersectionId !== null,
        p,
        'SIGNAL line requires signal and intersection IDs',
        line.id,
      );
      const signal = ref(signals, line.signalId!, `${p}.signalId`, line.id);
      ensure(
        signal.intersectionId === line.intersectionId,
        `${p}.signalId`,
        'Stop line signal/intersection mismatch',
        line.id,
      );
    } else {
      ensure(
        line.signalId === null,
        `${p}.signalId`,
        'Only SIGNAL line may reference signal',
        line.id,
      );
      if (line.kind === 'STOP')
        ensure(
          line.intersectionId !== null,
          `${p}.intersectionId`,
          'STOP line requires intersection',
          line.id,
        );
    }
  }
  const linkedCrosswalkStops = new Set<string>();
  for (const [i, walk] of map.crosswalks.entries()) {
    const p = `map.crosswalks[${i}]`;
    ref(areas, walk.geometryId, `${p}.geometryId`, walk.id);
    unique(walk.laneIds, `${p}.laneIds`, walk.id);
    unique(walk.stopLineIds, `${p}.stopLineIds`, walk.id);
    for (const [j, id] of walk.laneIds.entries()) ref(lanes, id, `${p}.laneIds[${j}]`, walk.id);
    const covered = new Set<string>();
    for (const [j, id] of walk.stopLineIds.entries()) {
      const line = ref(stops, id, `${p}.stopLineIds[${j}]`, walk.id);
      ensure(
        line.kind === 'CROSSWALK' &&
          walk.laneIds.includes(line.laneId) &&
          !linkedCrosswalkStops.has(id),
        `${p}.stopLineIds[${j}]`,
        'Crosswalk stop must belong to one crossing lane and one crosswalk',
        walk.id,
      );
      linkedCrosswalkStops.add(id);
      covered.add(line.laneId);
    }
    ensure(
      walk.laneIds.every((id) => covered.has(id)),
      `${p}.stopLineIds`,
      'Every crossed lane requires a stop line',
      walk.id,
    );
  }
  for (const line of map.stopLines)
    if (line.kind === 'CROSSWALK')
      ensure(
        linkedCrosswalkStops.has(line.id),
        'map.stopLines',
        'Orphan CROSSWALK stop line',
        line.id,
      );
  for (const [i, zone] of map.serviceZones.entries()) {
    const p = `map.serviceZones[${i}]`;
    const area = ref(areas, zone.geometryId, `${p}.geometryId`, zone.id);
    const lane = anchor(zone.laneId, zone.anchorNodeId, p, zone.id);
    unique(zone.access, `${p}.access`, zone.id);
    ensure(
      zone.access.every((a) => lane.access.includes(a)),
      `${p}.access`,
      'Service access must be allowed on lane',
      zone.id,
    );
    ensure(
      inAreaBox(nodes.get(zone.anchorNodeId)!.positionM, area),
      `${p}.anchorNodeId`,
      'Service anchor outside zone bounding box',
      zone.id,
      nodes.get(zone.anchorNodeId)!.positionM,
    );
  }
  for (const [i, point] of map.recoveryPoints.entries())
    anchor(point.laneId, point.nodeId, `map.recoveryPoints[${i}]`, point.id, 'nodeId');
  // Iterative reverse reachability; no recursion and no route generation.
  for (const access of ['TAXI', 'CIVIL'] as const) {
    const permitted = map.lanes.filter((l) => l.access.includes(access));
    if (!permitted.length) continue;
    const reverse = new Map<string, string[]>();
    for (const lane of permitted) reverse.set(lane.id, []);
    for (const lane of permitted)
      for (const next of lane.successorIds) if (reverse.has(next)) reverse.get(next)!.push(lane.id);
    for (const [i, zone] of map.serviceZones.entries()) {
      if (!zone.access.includes(access)) continue;
      const seen = new Set([zone.laneId]),
        queue = [zone.laneId];
      for (let head = 0; head < queue.length; head++)
        for (const previous of reverse.get(queue[head]) ?? [])
          if (!seen.has(previous)) {
            seen.add(previous);
            queue.push(previous);
          }
      const unreachable = permitted.find((l) => !seen.has(l.id));
      ensure(
        !unreachable,
        `map.serviceZones[${i}]`,
        `${access} service unreachable from lane ${unreachable?.id}`,
        zone.id,
        nodes.get(zone.anchorNodeId)!.positionM,
      );
    }
  }
}
