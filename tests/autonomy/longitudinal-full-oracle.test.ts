import assert from 'node:assert/strict';
import test from 'node:test';
// Native Node fixture module is independent of the production algorithm.
import {
  referenceFullCruise,
  referenceFullLongitudinal,
  recordFullReason,
  assertFiniteFullBody,
  assertFiniteFullProjection,
  // @ts-expect-error The standalone fixture MJS has no application declaration file.
} from '../../scripts/longitudinal-full-oracle.mjs';
import { referenceCruise } from './cruise-targets-reference';
import { referenceLongitudinal, longitudinalValues } from './longitudinal-reference';
import { vehicleClass, type BodyState, type CarProjection } from '../../src/vehicles';

test('047 full finite readback uses actual BodyState schema and final CarProjection angular velocity', () => {
  const body: BodyState = {
    identity: { entityId: 'car-0', handle: 0, generation: 1 },
    transform: { positionM: { x: 0, y: 1, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
  };
  assert.doesNotThrow(() => assertFiniteFullBody(body));
  assert.throws(() => assertFiniteFullBody({ ...body, velocityMps: { x: NaN, y: 0, z: 0 } }));
  const projection: Pick<CarProjection, 'angularVelocityRadps'> = {
    angularVelocityRadps: { x: 0, y: 0, z: 0 },
  };
  assert.doesNotThrow(() => assertFiniteFullProjection(projection));
  assert.throws(() =>
    assertFiniteFullProjection({ angularVelocityRadS: projection.angularVelocityRadps }),
  );
  assert.throws(() =>
    assertFiniteFullProjection({ angularVelocityRadps: { x: Infinity, y: 0, z: 0 } }),
  );
});
test('047 full oracle preserves normal case and treats absent posted lane data as unknown, never invented speed', () => {
  assert.equal(
    referenceFullCruise([0, 0, 2, 5], 'URBAN', 12, null, false, 'FOLLOW', 5),
    referenceCruise([0, 0, 2, 5], 'URBAN', 12, null, false, 'FOLLOW', 5),
  );
  assert.equal(referenceFullCruise([0, 0, 2, 5], 'URBAN', null, null, false, 'FOLLOW', 5), 0);
});
test('047 full independent unknown-diagnostic oracle releases old acceleration/reaction state and preserves usable behavior', () => {
  const state = { acceleration: 2, brakeEventTick: 1 },
    config = vehicleClass('sedan');
  const unknown = referenceFullLongitudinal(
    state,
    longitudinalValues[0],
    15,
    { reason: 'INCOMPLETE_CONTEXT', targetMps: 0 },
    12,
    config,
  );
  assert.deepEqual(unknown, {
    state: { acceleration: 0, brakeEventTick: null },
    throttle: 0,
    brake: 0,
    accelerationMps2: 0,
    brakeEventTick: null,
    phase: 'RELEASED',
  });
  assert.deepEqual(
    referenceFullLongitudinal(
      state,
      longitudinalValues[0],
      15,
      { reason: 'BEHAVIOR_STOP', targetMps: 0 },
      12,
      config,
    ),
    referenceLongitudinal(
      state,
      longitudinalValues[0],
      15,
      0,
      12,
      config.massKg,
      config.powerW,
      config.engineForceN,
      config.brakeAcceleration,
    ),
  );
  const counts: Record<string, number> = {};
  recordFullReason(counts, 'INCOMPLETE_CONTEXT');
  assert.equal(counts.INCOMPLETE_CONTEXT, 1);
  assert.throws(() => recordFullReason(counts, 'fake-reason'));
});
