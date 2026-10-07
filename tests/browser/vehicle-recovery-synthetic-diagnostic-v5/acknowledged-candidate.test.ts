/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryTransform } from '../../../src/vehicles/recovery-port';
import { createRecoveryRoadProvider } from '../../../src/app/vehicle-recovery-road';
import { recoveryRoadFixture } from '../vehicle-recovery-after/road-fixture';

test('raw post-step tiny roll stays rejected; acknowledged canonical placement locates without modifying readbacks', () => {
  const acknowledged = {
    positionM: { x: 0.03187299892306328, y: 0.7609248161315918, z: 4.4963531494140625 },
    rotationQuaternion: { x: 0, y: 0.02399066463112831, z: 0, w: 0.9997122883796692 },
  };
  const raw = {
    positionM: { ...acknowledged.positionM, y: 0.7616894245147705 },
    rotationQuaternion: {
      ...acknowledged.rotationQuaternion,
      x: 6.205824049088093e-11,
      z: 9.834419520057813e-13,
    },
  };
  const rawBefore = structuredClone(raw),
    acknowledgedBefore = structuredClone(acknowledged);
  const provider = createRecoveryRoadProvider(recoveryRoadFixture().graph);
  assert.throws(() => provider.locate(raw, 'TAXI'), /Recovery requires upright yaw pose/);
  const candidate = recoveryTransform(acknowledged);
  assert.ok(provider.locate(candidate, 'TAXI'));
  assert.equal(candidate.rotationQuaternion.x, 0);
  assert.equal(candidate.rotationQuaternion.z, 0);
  assert.deepEqual(raw, rawBefore);
  assert.deepEqual(acknowledged, acknowledgedBefore);
});
