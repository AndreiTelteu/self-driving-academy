import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOD_HYSTERESIS_M,
  MIN_DISTANT_SOURCE_RADIUS_RATIO,
  assertDistantSourceCovers,
  lodBands,
  resolveBatchLod,
} from '../../src/rendering/lod-policy';
import { QUALITY_PRESETS } from '../../src/rendering/quality-policy';
import type { BatchLodLevel } from '../../src/rendering/lod-policy';

/** Walks a distance sweep and returns the level sequence, with hysteresis applied in order. */
function sweep(preset: 'LOW' | 'MEDIUM' | 'HIGH', distances: readonly number[]): BatchLodLevel[] {
  let current: BatchLodLevel = 'NEAR';
  const levels: BatchLodLevel[] = [];
  for (const edgeDistanceM of distances) {
    current = resolveBatchLod({ edgeDistanceM, current, preset }).level;
    levels.push(current);
  }
  return levels;
}

test('the declared LOD bands come from the preset and keep a 5 m hysteresis on both sides', () => {
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const bands = lodBands(preset);
    const nominal = QUALITY_PRESETS[preset].lodDistance;
    assert.equal(bands.nominalM, nominal);
    assert.equal(bands.hysteresisM, LOD_HYSTERESIS_M);
    assert.equal(bands.nearToFarM, nominal + LOD_HYSTERESIS_M);
    assert.equal(bands.farToNearM, nominal - LOD_HYSTERESIS_M);
    assert.ok(Object.isFrozen(bands));
  }
  assert.equal(lodBands('LOW').nearToFarM, 50);
  assert.equal(lodBands('LOW').farToNearM, 40);
  assert.equal(lodBands('MEDIUM').nearToFarM, 95);
  assert.equal(lodBands('HIGH').nearToFarM, 155);
});

test('the level is monotonic in distance and exactly one level is returned', () => {
  const bands = lodBands('MEDIUM');
  const distances = Array.from({ length: 400 }, (_, index) => index * 0.5);
  const forward = sweep('MEDIUM', distances);
  // Monotonic: once coarse, only a distance below farToNearM brings detail back.
  let seenFar = false;
  for (let index = 0; index < forward.length; index += 1) {
    const level = forward[index]!;
    if (level === 'FAR') seenFar = true;
    else {
      assert.equal(seenFar, false, 'detail cannot return while the distance grows');
      assert.ok(distances[index]! <= bands.nearToFarM + 1e-9);
    }
  }
  assert.equal(seenFar, true, 'the sweep must reach the coarse level');
  const backward = sweep('MEDIUM', [...distances].reverse());
  assert.equal(backward.at(-1), 'NEAR', 'coming back to the camera restores detail');
});

test('the boundary is explicit: exactly at the threshold the current level is kept', () => {
  const bands = lodBands('LOW');
  // 50 is `nearToFarM`; only a distance strictly beyond it switches.
  assert.equal(
    resolveBatchLod({ edgeDistanceM: 50, current: 'NEAR', preset: 'LOW' }).level,
    'NEAR',
  );
  assert.equal(
    resolveBatchLod({ edgeDistanceM: 50 + 1e-9, current: 'NEAR', preset: 'LOW' }).level,
    'FAR',
  );
  // 40 is `farToNearM`; detail returns at equality and below it.
  assert.equal(resolveBatchLod({ edgeDistanceM: 40, current: 'FAR', preset: 'LOW' }).level, 'NEAR');
  assert.equal(
    resolveBatchLod({ edgeDistanceM: 40 + 1e-9, current: 'FAR', preset: 'LOW' }).level,
    'FAR',
  );
  assert.equal(lodBands('LOW').nearToFarM, 50);
  assert.equal(bands.farToNearM, 40);
  // Strictly inside the band the current level survives, so both directions are stable.
  for (let distance = bands.farToNearM + 0.25; distance < bands.nearToFarM; distance += 0.25) {
    assert.equal(
      resolveBatchLod({ edgeDistanceM: distance, current: 'NEAR', preset: 'LOW' }).level,
      'NEAR',
    );
    assert.equal(
      resolveBatchLod({ edgeDistanceM: distance, current: 'FAR', preset: 'LOW' }).level,
      'FAR',
    );
  }
});

test('a camera dithering inside the band never strobes the geometry', () => {
  const bands = lodBands('HIGH');
  const middle = (bands.farToNearM + bands.nearToFarM) / 2;
  let current: BatchLodLevel = 'NEAR';
  let switches = 0;
  // ±(hysteresis/2 - 0.01) around the middle of the band: the switch may never happen.
  for (let step = 0; step < 2000; step += 1) {
    const offset = ((step % 40) - 20) * ((bands.hysteresisM / 2 - 0.01) / 20);
    const next: BatchLodLevel = resolveBatchLod({
      edgeDistanceM: middle + offset,
      current,
      preset: 'HIGH',
    }).level;
    if (next !== current) switches += 1;
    current = next;
  }
  assert.equal(switches, 0, 'hysteresis must absorb camera dither');
  // Dithering on the boundary itself switches at most once, never back and forth.
  let boundary: BatchLodLevel = 'NEAR';
  let boundarySwitches = 0;
  for (let step = 0; step < 2000; step += 1) {
    const offset = ((step % 40) - 20) * ((bands.hysteresisM / 2 - 0.01) / 20);
    const next: BatchLodLevel = resolveBatchLod({
      edgeDistanceM: bands.nearToFarM + offset,
      current: boundary,
      preset: 'HIGH',
    }).level;
    if (next !== boundary) boundarySwitches += 1;
    boundary = next;
  }
  assert.equal(boundarySwitches, 1, 'crossing the boundary once is not strobing');
  // Crossing the whole band once produces exactly one transition per direction.
  assert.deepEqual(sweep('HIGH', [0, 200, 0]), ['NEAR', 'FAR', 'NEAR']);
});

test('a wide batch keeps its detailed level: the distance is measured to its nearest edge', () => {
  const bands = lodBands('LOW');
  // A decor cell with a 120 m cell size has a ~100 m radius, so a camera 145 m away still sees
  // its nearest edge 45 m away: the detailed mesh wins and the switch cannot pop in view.
  const radiusM = 100;
  const cameraDistanceM = 145;
  const edgeDistanceM = Math.max(0, cameraDistanceM - radiusM);
  assert.equal(edgeDistanceM, 45);
  assert.equal(
    resolveBatchLod({ edgeDistanceM, current: 'NEAR', preset: 'LOW' }).level,
    'NEAR',
    'inside the near band even though the camera is beyond the nominal distance',
  );
  assert.ok(cameraDistanceM > bands.nominalM);
});

test('a distant proxy smaller than the detailed source is rejected (no visible shrink)', () => {
  assert.equal(MIN_DISTANT_SOURCE_RADIUS_RATIO, 0.95);
  assertDistantSourceCovers(2, 2);
  assertDistantSourceCovers(2, 1.9);
  assert.throws(() => assertDistantSourceCovers(2, 1.8), /cover/);
  assert.throws(() => assertDistantSourceCovers(Number.NaN, 2), /radius/);
  assert.throws(() => assertDistantSourceCovers(2, -1), /cover/);
});

test('invalid LOD input is rejected instead of silently freezing a level', () => {
  assert.throws(() => lodBands('ULTRA' as never), /preset/);
  assert.throws(
    () => resolveBatchLod({ edgeDistanceM: Number.NaN, current: 'NEAR', preset: 'LOW' }),
    /distance/,
  );
  assert.throws(
    () => resolveBatchLod({ edgeDistanceM: -1, current: 'NEAR', preset: 'LOW' }),
    /distance/,
  );
  assert.throws(
    () => resolveBatchLod({ edgeDistanceM: 10, current: 'MID' as never, preset: 'LOW' }),
    /level/,
  );
});
