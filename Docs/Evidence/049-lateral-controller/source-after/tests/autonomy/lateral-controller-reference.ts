import type { RoadMap } from '../../src/world/schema';
import type { Vector3 } from '../../src/vehicles/contracts';

/** Explicit authored circular lanes, separate per car. No inferred intersection connectors. */
export function lateralFixture(count: number, firstIndex = 0): RoadMap {
  const nodes: RoadMap['geometry']['nodes'][number][] = [];
  const paths: RoadMap['geometry']['paths'][number][] = [];
  const lanes: RoadMap['lanes'][number][] = [];
  const areas: RoadMap['geometry']['areas'][number][] = [];
  const serviceZones: RoadMap['serviceZones'][number][] = [];
  for (let offset = 0; offset < count; offset++) {
    const i = firstIndex + offset;
    const x = ((i % 11) - 5) * 80,
      z = (Math.floor(i / 11) - 4.5) * 80;
    const radius = [16, 22, 28][i % 3];
    const nodeIds = [];
    for (let vertex = 0; vertex <= 64; vertex++) {
      const angle = (vertex / 64) * 2 * Math.PI;
      const id = `node-${i}-${vertex}`;
      nodes.push({
        id,
        positionM: { x: x + radius * Math.cos(angle), y: 0, z: z + radius * Math.sin(angle) },
      });
      nodeIds.push(id);
    }
    paths.push({ id: `geometry-${i}`, nodeIds });
    const serviceNodes = [];
    for (const [corner, offset] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].entries()) {
      const id = `service-node-${i}-${corner}`;
      nodes.push({ id, positionM: { x: x + radius + offset[0], y: 0, z: z + offset[1] } });
      serviceNodes.push(id);
    }
    areas.push({ id: `service-geometry-${i}`, vertexNodeIds: serviceNodes });
    serviceZones.push({
      id: `service-${i}`,
      geometryId: `service-geometry-${i}`,
      laneId: `lane-${i}`,
      anchorNodeId: nodeIds[0],
      access: ['CIVIL', 'TAXI'],
      kind: 'BOTH',
    });
    lanes.push({
      id: `lane-${i}`,
      geometryId: `geometry-${i}`,
      direction: 'FORWARD',
      widthM: 4,
      speedLimitMps: 10,
      access: ['CIVIL', 'TAXI'],
      neighbors: { left: null, right: null },
      successorIds: [],
      fromIntersectionId: null,
      toIntersectionId: null,
    });
  }
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: '049-separated-curves-v1',
    bounds: { minM: { x: -500, y: 0, z: -500 }, maxM: { x: 500, y: 2, z: 500 } },
    geometry: { nodes, paths, areas },
    lanes,
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones,
    recoveryPoints: [],
  };
}

/** Independent exhaustive geometry oracle, no owner admission/state/authority or physical mutation. */
export function referenceLateral(
  points: readonly Vector3[],
  position: Vector3,
  forward: Pick<Vector3, 'x' | 'z'>,
  speedMps: number,
  wheelbaseM: number,
  fullLockRad: number,
) {
  let best = Infinity,
    segment = 0,
    fraction = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (dx * dx + dz * dz)),
    );
    const d = (position.x - a.x - t * dx) ** 2 + (position.z - a.z - t * dz) ** 2;
    if (d < best) {
      best = d;
      segment = i;
      fraction = t;
    }
  }
  // Candidate preview, not a calibrated safety margin. The circle fixture explicitly wraps.
  let remaining = 3 + speedMps * 0.45;
  let target = points[segment];
  for (let scan = 0; scan < points.length; scan++) {
    const a = points[segment],
      b = points[segment + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const available = length * (1 - fraction);
    if (remaining <= available) {
      const t = fraction + remaining / length;
      target = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) };
      break;
    }
    remaining -= available;
    segment = (segment + 1) % (points.length - 1);
    fraction = 0;
  }
  const dx = target.x - position.x,
    dz = target.z - position.z;
  const localRightM = dx * forward.z - dz * forward.x;
  const curvaturePerM = (2 * localRightM) / (dx * dx + dz * dz);
  const steering = Math.max(-1, Math.min(1, Math.atan(wheelbaseM * curvaturePerM) / fullLockRad));
  return { steering, crossTrackM: Math.sqrt(best), target, curvaturePerM };
}

/** Explicit fixture-owned speed command; separate from the future lateral-only API/style. */
export function fixtureSpeedCommand(requestedMps: number, actualMps: number) {
  const error = requestedMps - actualMps;
  return error < -0.15
    ? { throttle: 0, brake: Math.min(1, -error * 0.3) }
    : { throttle: Math.max(0, Math.min(1, 0.09 + error * 0.35)), brake: 0 };
}
