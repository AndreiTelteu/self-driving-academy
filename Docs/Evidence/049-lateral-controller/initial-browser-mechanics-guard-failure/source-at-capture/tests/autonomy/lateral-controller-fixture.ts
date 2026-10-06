import { minimalMap } from '../world/fixture';
import type { Mutable } from '../world/negative-fixtures';
import type { RoadMap } from '../../src/world/schema';

/** Actual authored90degree TURN: straight incoming, sampled tangent-continuous movement, outgoing. */
export function lateralTurnFixture(right = false, radiusM = 16): Mutable<RoadMap> {
  const map = JSON.parse(JSON.stringify(minimalMap())) as Mutable<RoadMap>;
  map.mapId = `049-authored-${right ? 'right' : 'left'}-turn-v1`;
  map.bounds = { minM: { x: -100, y: 0, z: -100 }, maxM: { x: 100, y: 2, z: 100 } };
  const positions: Record<string, readonly [number, number]> = {
    'n-a': [-40, 0],
    'n-b': [-radiusM, 0],
    'n-c': [0, radiusM],
    'n-d': [0, 50],
    'n-loop': [50, 50],
    j1: [-radiusM - 4, -4],
    j2: [4, -4],
    j3: [4, radiusM + 4],
    j4: [-radiusM - 4, radiusM + 4],
    s1: [-41, -1],
    s2: [-39, -1],
    s3: [-39, 1],
    s4: [-41, 1],
    'line-a': [-radiusM, -1],
    'line-b': [-radiusM, 1],
    'walk-a': [49, 49],
    'walk-b': [51, 49],
    'walk-c': [51, 51],
    'walk-d': [49, 51],
    'wline-a': [50, 49],
    'wline-b': [50, 51],
  };
  for (const node of map.geometry.nodes) {
    const [x, z] = positions[node.id];
    node.positionM = { x, y: 0, z };
  }
  const curveIds = ['n-b'];
  for (let index = 1; index < 16; index++) {
    const angle = -Math.PI / 2 + ((Math.PI / 2) * index) / 16,
      id = `turn-node-${index}`;
    map.geometry.nodes.push({
      id,
      positionM: {
        x: -radiusM + radiusM * Math.cos(angle),
        y: 0,
        z: radiusM + radiusM * Math.sin(angle),
      },
    });
    curveIds.push(id);
  }
  curveIds.push('n-c');
  map.geometry.paths.find((p) => p.id === 'g-move')!.nodeIds = curveIds;
  for (const lane of map.lanes) lane.widthM = 4;
  // Mirror authored map geometry, not the vehicle's physics coordinate convention.
  if (right) for (const node of map.geometry.nodes) node.positionM.z = -node.positionM.z;
  return map;
}
