import { recoveryTransform } from '../../../src/vehicles/recovery-port';
import type { PhysicsRecoveryPort } from '../../../src/vehicles/recovery-port';
import type { BodyIdentity } from '../../../src/vehicles/body-port';
import { createRecoveryRoadProvider } from '../../../src/app/vehicle-recovery-road';
import { serviceReferenceFixture } from './road-fixture';
import { issueRecoveryRoad } from '../../../src/vehicles/recovery-road';
import { CONTROLLER_CONTEXT } from '../../vehicles/controller-reference';
import type { RoadMap } from '../../../src/world/schema';

/** Pre040 oracle: existing 032/033 metadata and 030 inspection only. Never applies placement. */
export function constructReference() {
  const fixture = serviceReferenceFixture();
  return { ...fixture, road: createRecoveryRoadProvider(fixture.graph) };
}

/** Explicit worst-case caller cohort, not a timer or automatic product polling. */
export function queryReference(
  port: PhysicsRecoveryPort,
  road: ReturnType<typeof createRecoveryRoadProvider>,
  identity: BodyIdentity,
  map: RoadMap,
  anchorIndex: number,
) {
  const before = port.readNative(identity);
  const anchor = map.recoveryPoints[anchorIndex];
  const node = map.geometry.nodes.find((item) => item.id === anchor.nodeId);
  if (!node || anchor.headingRad !== Math.PI / 2) throw new Error('Authored anchor changed');
  // Map ground height is not chassis height. Preserve the actual native centre height;
  // support validity is decided by the unchanged native inspector, never assumed here.
  const transform = recoveryTransform({
    positionM: { x: node.positionM.x, y: before.transform.positionM.y, z: node.positionM.z },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
  });
  if (road.mapId !== map.mapId) throw new Error('Reference map mismatch');
  // Reference-only known authored collinear corridor. The030 provider chooses one
  // segment at a path vertex; this explicit oracle spans both neighboring segments.
  // Future040 must validate/generalize this geometry; this is not its implementation.
  const proof = issueRecoveryRoad({
    mapId: map.mapId,
    laneId: 'lane-0',
    access: 'TAXI',
    start: { x: 0, y: 0, z: -40 },
    end: { x: 0, y: 0, z: 100 },
    widthM: 24,
  });
  const inspection = port.inspectPlacement({
    identity,
    context: CONTROLLER_CONTEXT,
    expectedPhysicsSerial: before.physicsStepSerial,
    transform,
    road: proof,
  });
  const after = port.readNative(identity);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Readonly query changed native state');
  return { identity, anchorId: anchor.id, transform, before, after, inspection };
}
