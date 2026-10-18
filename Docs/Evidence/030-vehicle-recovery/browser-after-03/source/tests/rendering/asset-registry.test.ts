import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegistryGlb,
  DEFAULT_ASSET_LIMITS,
} from '../../src/rendering/babylon/asset-contract';
import { triangleGlb } from '../browser/asset-registry/glb-fixture';
test('GLB preflight accepts original embedded geometry and bounds decoded bytes', () => {
  assert.equal(validateRegistryGlb(triangleGlb()), 42);
  assert.throws(
    () => validateRegistryGlb(triangleGlb(), { ...DEFAULT_ASSET_LIMITS, maxAssetBytes: 100 }),
    /header/,
  );
});
test('GLB header and truncated JSON reject before Babylon resource creation', () => {
  assert.throws(() => validateRegistryGlb(new Uint8Array(2)), /header/);
  const bytes = triangleGlb();
  new DataView(bytes.buffer).setUint32(12, bytes.length, true);
  assert.throws(() => validateRegistryGlb(bytes), /JSON length/);
});
test('embedded PNG size is admitted before decode and oversized dimensions reject', () => {
  const bytes = triangleGlb(true);
  assert.equal(validateRegistryGlb(bytes), 72);
  const view = new DataView(bytes.buffer);
  const imageOffset = 20 + view.getUint32(12, true) + 8 + 68;
  view.setUint32(imageOffset + 16, 4096);
  assert.throws(() => validateRegistryGlb(bytes), /dimensions/);
});
test('geometry primitive vertex budget rejects before Babylon', () => {
  assert.throws(
    () => validateRegistryGlb(triangleGlb(), { ...DEFAULT_ASSET_LIMITS, maxVertices: 2 }),
    /vertex/,
  );
});
