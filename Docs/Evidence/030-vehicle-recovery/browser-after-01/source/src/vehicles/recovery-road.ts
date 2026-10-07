import { fields, number, requireContract, text } from '../sessions';
import type { BodyTransform } from './body-port';
import type { RecoveryRoadProof } from './recovery-port';
import { recoveryVector, recoveryTransform } from './recovery-port';

const issued = new WeakSet<RecoveryRoadProof>();
/** Trusted composition seam: copies a corridor; the brand proves issuance, not graph origin.
 * Production composition obtains data from its bound032/033 LaneGraph adapter.
 */
export function issueRecoveryRoad(data: RecoveryRoadProof): RecoveryRoadProof {
  const d = fields(data, ['mapId', 'laneId', 'access', 'start', 'end', 'widthM']);
  const mapId = text(d.mapId),
    laneId = text(d.laneId);
  requireContract(
    mapId.length <= 128 && laneId.length <= 128 && (d.access === 'TAXI' || d.access === 'CIVIL'),
    'Recovery road identity/access',
  );
  const start = recoveryVector(d.start),
    end = recoveryVector(d.end),
    widthM = number(d.widthM, Number.MIN_VALUE, 100);
  requireContract(
    start.y === 0 && end.y === 0 && Math.hypot(end.x - start.x, end.z - start.z) > 0,
    'Flat recovery corridor required',
  );
  const result: RecoveryRoadProof = Object.freeze({
    mapId,
    laneId,
    access: d.access,
    start,
    end,
    widthM,
  });
  issued.add(result);
  return result;
}
export function requireRecoveryRoad(value: RecoveryRoadProof): RecoveryRoadProof {
  requireContract(issued.has(value), 'Recovery road proof is not issued by trusted composition');
  return value;
}
/** Entire conservative mechanical/chassis footprint must fit one finite directed lane segment. */
export function recoveryFootprintFits(
  road: RecoveryRoadProof,
  pose: BodyTransform,
  halfX: number,
  halfZ: number,
): boolean {
  requireRecoveryRoad(road);
  pose = recoveryTransform(pose);
  number(halfX, Number.MIN_VALUE);
  number(halfZ, Number.MIN_VALUE);
  const dx = road.end.x - road.start.x,
    dz = road.end.z - road.start.z;
  const length = Math.hypot(dx, dz),
    ux = dx / length,
    uz = dz / length;
  const q = pose.rotationQuaternion;
  const fx = 2 * q.y * q.w,
    fz = 1 - 2 * q.y * q.y;
  if (fx * ux + fz * uz <= 0) return false;
  for (const x of [-halfX, halfX])
    for (const z of [-halfZ, halfZ]) {
      const px = pose.positionM.x + fz * x + fx * z;
      const pz = pose.positionM.z - fx * x + fz * z;
      if (Math.abs(px) > 500 || Math.abs(pz) > 500) return false;
      const rx = px - road.start.x,
        rz = pz - road.start.z;
      const along = rx * ux + rz * uz,
        lateral = -rx * uz + rz * ux;
      if (along < 0 || along > length || Math.abs(lateral) > road.widthM / 2) return false;
    }
  return true;
}
