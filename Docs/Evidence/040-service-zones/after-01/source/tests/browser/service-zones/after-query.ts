import { constructReference } from './reference-query';
import { createServiceZoneCatalog } from '../../../src/world/service-zones';
import { createServiceZoneAvailability } from '../../../src/app/service-zones';
import type { PhysicsProbe } from '../../../src/vehicles/physics';
import type { PhysicsRecoveryPort } from '../../../src/vehicles/recovery-port';
import type { BodyIdentity } from '../../../src/vehicles/body-port';
import { CONTROLLER_CONTEXT } from '../../vehicles/controller-reference';

/** Distinct AFTER wrapper. Original frozen baseline helper is imported unchanged. */
export function constructAfter() {
  const reference = constructReference(),
    catalog = createServiceZoneCatalog(reference.map, reference.graph);
  return { ...reference, catalog };
}
export function bindAfter(
  reference: ReturnType<typeof constructAfter>,
  physics: PhysicsProbe,
  native: PhysicsRecoveryPort,
) {
  return createServiceZoneAvailability({
    context: CONTROLLER_CONTEXT,
    catalog: reference.catalog,
    physics,
    native,
  });
}
export function queryAfter(
  port: PhysicsRecoveryPort,
  feature: ReturnType<typeof bindAfter>,
  identity: BodyIdentity,
  anchorIndex: number,
) {
  const before = port.readNative(identity);
  const result = feature.inspect(
    {
      category: anchorIndex === 0 ? 'SERVICE' : 'RECOVERY',
      id: anchorIndex === 0 ? 'service' : 'point-blocked',
      fromLaneId: 'lane-2',
      access: 'TAXI',
      purpose: 'PICKUP',
    },
    identity,
  );
  if (result.semantic.status !== 'READY' || result.native === null)
    throw Error('Expected authored AFTER semantic candidate');
  const yaw = Math.PI / 2 - result.semantic.site.headingRad;
  const transform = {
    positionM: {
      x: result.semantic.site.positionM.x,
      y: before.transform.positionM.y,
      z: result.semantic.site.positionM.z,
    },
    rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
  };
  const after = port.readNative(identity);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error('Product query changed native state');
  return {
    identity,
    anchorId: anchorIndex === 0 ? 'point-safe' : 'point-blocked',
    transform,
    before,
    after,
    inspection: result.native,
    product: {
      category: result.semantic.site.category,
      id: result.semantic.site.id,
      anchorNodeId: result.semantic.site.anchorNodeId,
      positionM: result.semantic.site.positionM,
      corridor: result.semantic.corridor,
      status: result.status,
    },
  };
}
