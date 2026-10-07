import assert from 'node:assert/strict';
/** Read only the actual structuredClone(Babylon Vector3) wire, never arbitrary x/y aliases. */
export function readBabylonPoint(value, requireVisible = true) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.equal(Object.getPrototypeOf(value), Object.prototype, 'Plain JSON point required');
  const fields = Object.getOwnPropertyDescriptors(value);
  assert.deepEqual(Reflect.ownKeys(fields).sort(), ['_isDirty', '_x', '_y', '_z']);
  const snapshot = Object.create(null);
  for (const name of ['_isDirty', '_x', '_y', '_z']) {
    const descriptor = fields[name];
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'Own data field required');
    snapshot[name] = descriptor.value;
  }
  assert.equal(typeof snapshot._isDirty, 'boolean');
  for (const name of ['_x', '_y', '_z']) assert.ok(typeof snapshot[name] === 'number' && Number.isFinite(snapshot[name]), 'Finite coordinate required');
  const point = { x: snapshot._x, y: snapshot._y, z: snapshot._z };
  if (requireVisible) assert.ok(point.x >= 0 && point.x < 1920 && point.y >= 0 && point.y < 1080 && point.z >= 0 && point.z <= 1, 'Actual projected point outside internal viewport');
  return point;
}
