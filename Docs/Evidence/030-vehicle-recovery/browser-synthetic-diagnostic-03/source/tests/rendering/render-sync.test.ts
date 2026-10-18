import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixedTickLoop } from '../../src/simulation';
import {
  interpolateRenderSnapshots as interpolate,
  type RenderSnapshot,
} from '../../src/rendering/render-sync';

function fixture(tick: number, x = tick * 10, spinRad = tick * Math.PI * 2): RenderSnapshot {
  const transform = Object.freeze({
    positionM: Object.freeze({ x, y: 1, z: 0 }),
    rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
  });
  return Object.freeze({
    sessionId: 'render-test',
    worldEpoch: 0,
    tick,
    vehicles: Object.freeze([
      Object.freeze({
        vehicleId: 'car',
        incarnation: 'first',
        transform,
        wheels: Object.freeze([
          Object.freeze({ wheelId: 'front', transform, spinRad, steeringRad: tick * 0.2 }),
        ]),
      }),
    ]),
  });
}
test('known tick midpoint, endpoints, wheel continuous rotations and frozen authority', () => {
  const a = fixture(0),
    b = fixture(1),
    before = JSON.stringify([a, b]);
  const result = interpolate(a, b, 0.5)!;
  assert.equal(result.vehicles[0].transform.positionM.x, 5);
  assert.equal(result.vehicles[0].wheels[0].spinRad, Math.PI);
  assert.equal(result.vehicles[0].wheels[0].steeringRad, 0.1);
  assert.equal(interpolate(a, b, 0)!.vehicles[0].transform.positionM.x, 0);
  assert.equal(interpolate(a, b, 1)!.vehicles[0].transform.positionM.x, 10);
  assert.equal(JSON.stringify([a, b]), before);
  assert.notEqual(result.vehicles[0].transform, b.vehicles[0].transform);
  assert(Object.isFrozen(result.vehicles[0].wheels[0].transform.positionM));
});

test('fixed loop alpha drives render projection without altering the captured body', () => {
  let tick = 0;
  const loop = createFixedTickLoop({
    captureSnapshot: () => fixture(tick),
    step: (step) => {
      tick = step.tick;
    },
    interpolate,
  });
  loop.frame(0);
  const frame = loop.frame(25);
  assert.equal(frame.steps, 1);
  assert(Math.abs(frame.state.alpha - 0.5) < 1e-12);
  assert(Math.abs(frame.interpolated!.vehicles[0].transform.positionM.x - 5) < 1e-12);
  assert.equal(frame.state.snapshots!.current.vehicles[0].transform.positionM.x, 10);
  loop.dispose();
});
test('shortest arc slerp of orientations and equivalent negative quaternion', () => {
  const a = fixture(0),
    b = fixture(1);
  const changed = {
    ...b,
    vehicles: [
      {
        ...b.vehicles[0],
        transform: { ...b.vehicles[0].transform, rotationQuaternion: { x: 0, y: 1, z: 0, w: 0 } },
      },
    ],
  };
  const q = interpolate(a, changed, 0.5)!.vehicles[0].transform.rotationQuaternion;
  assert(Math.abs(q.y - Math.SQRT1_2) < 1e-12);
  assert(Math.abs(q.w - Math.SQRT1_2) < 1e-12);
  changed.vehicles[0].transform.rotationQuaternion = { x: 0, y: 0, z: 0, w: -1 };
  assert.equal(interpolate(a, changed, 0.5)!.vehicles[0].transform.rotationQuaternion.w, 1);
});
test('missing, reset, reused, skipped and backwards snapshots snap to current', () => {
  const a = fixture(3),
    b = fixture(4);
  assert.equal(interpolate(a, null, 0.5), null);
  for (const previous of [
    null,
    fixture(2),
    fixture(4),
    fixture(5),
    { ...a, sessionId: 'old' },
    { ...a, worldEpoch: 1 },
    { ...a, vehicles: [] },
    { ...a, vehicles: [{ ...a.vehicles[0], incarnation: 'retired' }] },
  ])
    assert.equal(interpolate(previous, b, 0.2)!.vehicles[0].transform.positionM.x, 40);
  assert.equal(interpolate(a, { ...b, vehicles: [] }, 0.5)!.vehicles.length, 0);
  const missingWheel = { ...a, vehicles: [{ ...a.vehicles[0], wheels: [] }] };
  assert.equal(
    interpolate(missingWheel, b, 0.1)!.vehicles[0].wheels[0].spinRad,
    b.vehicles[0].wheels[0].spinRad,
  );
});
test('alpha clamps, nonfinite snaps, invalid snapshot rejected before presentation', () => {
  const a = fixture(0),
    b = fixture(1);
  for (const alpha of [NaN, Infinity, -Infinity, 2])
    assert.equal(interpolate(a, b, alpha)!.vehicles[0].transform.positionM.x, 10);
  assert.equal(interpolate(a, b, -1)!.vehicles[0].transform.positionM.x, 0);
  assert.throws(() => interpolate(a, { ...b, tick: -1 }, 0.5));
  assert.throws(() => interpolate(a, { ...b, vehicles: [...b.vehicles, ...b.vehicles] }, 0.5));
  assert.throws(() =>
    interpolate(
      a,
      {
        ...b,
        vehicles: [{ ...b.vehicles[0], wheels: [{ ...b.vehicles[0].wheels[0], spinRad: NaN }] }],
      },
      0.5,
    ),
  );
  const extreme = interpolate(fixture(0, Number.MAX_VALUE), fixture(1, -Number.MAX_VALUE), 0.5)!;
  assert.equal(extreme.vehicles[0].transform.positionM.x, 0);
});
