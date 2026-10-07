import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateVisualIdentity,
  validateVisualTransform,
} from '../../src/rendering/scene-contract';

test('visual boundary accepts readonly domain pose without changing it', () => {
  const transform = Object.freeze({
    positionM: Object.freeze({ x: 1, y: 2, z: 3 }),
    rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  });
  validateVisualTransform(transform);
  assert.equal(transform.positionM.y, 2);
  assert.throws(() =>
    validateVisualTransform({ ...transform, positionM: { x: Infinity, y: 0, z: 0 } }),
  );
  assert.throws(() =>
    validateVisualTransform({ ...transform, rotationQuaternion: { x: 0, y: 0, z: 0, w: 0 } }),
  );
});
test('visual identity validates epochs at presentation boundary', () => {
  validateVisualIdentity({ sessionId: 'session', worldEpoch: 0 });
  assert.throws(() => validateVisualIdentity({ sessionId: '', worldEpoch: 0 }));
  assert.throws(() => validateVisualIdentity({ sessionId: 'session', worldEpoch: -1 }));
});
