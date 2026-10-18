import { parseRoadMap } from '../../../src/world/parser';
import { createLaneGraph } from '../../../src/world/lane-graph';
import { recoveryRoadFixture } from '../vehicle-recovery/road-fixture';
/** New authored pre040 map. Existing030 fixture is never changed. */
export function serviceReferenceFixture() {
  const raw = structuredClone(recoveryRoadFixture().map);
  const data = JSON.parse(JSON.stringify(raw));
  data.mapId = '040-authored-service-baseline-v1';
  data.geometry.nodes.find((n: { id: string }) => n.id === 'road-0').positionM.z = -40;
  data.geometry.nodes.push(
    { id: '040-safe', positionM: { x: 0, y: 0, z: -12 } },
    { id: '040-blocked', positionM: { x: 0, y: 0, z: -5 } },
  );
  data.geometry.paths[0].nodeIds = ['road-0', '040-safe', '040-blocked', 'road-1'];
  const corners = [
    [-6, -17],
    [6, -17],
    [6, -8],
    [-6, -8],
  ];
  for (let i = 0; i < 4; i++)
    data.geometry.nodes.find((n: { id: string }) => n.id === 'service-' + i).positionM = {
      x: corners[i][0],
      y: 0,
      z: corners[i][1],
    };
  data.serviceZones[0].anchorNodeId = '040-safe';
  data.recoveryPoints = [
    { id: 'point-safe', nodeId: '040-safe', laneId: 'lane-0', headingRad: Math.PI / 2 },
    { id: 'point-blocked', nodeId: '040-blocked', laneId: 'lane-0', headingRad: Math.PI / 2 },
  ];
  const map = parseRoadMap(data);
  return { map, graph: createLaneGraph(map) };
}
