import type { LaneGraph, RoadAccess } from '../world';
import { issueRecoveryRoad, recoveryTransform } from '../vehicles';
import { requireContract, text } from '../sessions';
import type { RecoveryRoadProof, BodyTransform } from '../vehicles';

/** Composition adapter owns validated032/033 graph; vehicles never depends on world. */
export function createRecoveryRoadProvider(graph: LaneGraph) {
  const mapId = text(graph.mapId);
  requireContract(mapId.length <= 128, 'Recovery map capacity');
  // Graph is a trusted composition input, constructed by032/033 createLaneGraph.
  // Bind its identity and cross-check returned lane/path; structural ports are not authentication.
  return Object.freeze({
    mapId,
    locate(transform: BodyTransform, access: RoadAccess): RecoveryRoadProof | null {
      requireContract(graph.mapId === mapId, 'Recovery graph map changed');
      requireContract(access === 'TAXI' || access === 'CIVIL', 'Recovery access');
      transform = recoveryTransform(transform);
      const q = transform.rotationQuaternion;
      const yaw = Math.atan2(2 * q.y * q.w, 1 - 2 * q.y * q.y);
      const location = graph.locateLane({
        positionM: { ...transform.positionM, y: 0 },
        access,
        headingRad: Math.atan2(Math.cos(yaw), Math.sin(yaw)),
        maxHeightDifferenceM: 0,
      });
      if (!location) return null;
      const lane = graph.getLane(location.lane.id, access),
        path = graph.getDirectedPath(location.lane.id);
      if (
        !lane ||
        !path ||
        lane !== location.lane ||
        path.laneId !== lane.id ||
        !lane.access.includes(access) ||
        !Number.isSafeInteger(location.segmentIndex) ||
        location.segmentIndex < 0
      )
        return null;
      const a = path.points[location.segmentIndex],
        b = path.points[location.segmentIndex + 1];
      if (!a || !b || a.y !== 0 || b.y !== 0 || Math.hypot(b.x - a.x, b.z - a.z) === 0) return null;
      requireContract(graph.mapId === mapId, 'Recovery graph map changed during query');
      return issueRecoveryRoad({
        mapId,
        laneId: lane.id,
        access,
        start: a,
        end: b,
        widthM: lane.widthM,
      });
    },
  });
}
