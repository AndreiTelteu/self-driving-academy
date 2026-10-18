import test from 'node:test';
import assert from 'node:assert/strict';
import { readBabylonPoint } from './browser-vector-wire-v2.mjs';
const valid = () => ({ _isDirty: true, _x: 1263.3369399675712, _y: 661.3347830394055, _z: 0.9914041289951289 });
test('exact captured Babylon wire and explicit offscreen classification', () => {
  assert.deepEqual(readBabylonPoint(valid()), { x: 1263.3369399675712, y: 661.3347830394055, z: 0.9914041289951289 });
  const offscreen = { ...valid(), _x: -1 };
  assert.throws(() => readBabylonPoint(offscreen));
  assert.equal(readBabylonPoint(offscreen, false).x, -1);
});
test('reject arbitrary DTO, extras, symbols, inherited/accessor fields without running getter', () => {
  for (const value of [{ x: 1, y: 2, z: .5 }, { ...valid(), extra: 1 }, Object.assign(valid(), { [Symbol('extra')]: 1 }), Object.create(valid()), Object.assign(Object.create(null), valid())]) assert.throws(() => readBabylonPoint(value));
  let called = 0;
  const accessor = valid();
  Object.defineProperty(accessor, '_x', { enumerable: true, get() { called++; return 10; } });
  assert.throws(() => readBabylonPoint(accessor));
  assert.equal(called, 0);
  assert.throws(() => readBabylonPoint(new Proxy(valid(), { ownKeys() { throw Error('trap'); } })));
});
test('reject nonfinite/malformed fields and preserve exact viewport/depth bounds', () => {
  for (const patch of [{ _isDirty: 1 }, { _x: NaN }, { _y: Infinity }, { _z: '0.5' }, { _x: -1 }, { _x: 1920 }, { _y: -1 }, { _y: 1080 }, { _z: -Number.EPSILON }, { _z: 1 + Number.EPSILON }]) assert.throws(() => readBabylonPoint({ ...valid(), ...patch }));
  assert.deepEqual(readBabylonPoint({ _isDirty: false, _x: 0, _y: 0, _z: 0 }), { x: 0, y: 0, z: 0 });
});
