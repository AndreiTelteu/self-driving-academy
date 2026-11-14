import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_JOINT_IDS,
  CHARACTER_SCALE_LIMITS,
  CharacterContractError,
  characterRestPivots,
  checkCharacterCompatibility,
  createCharacterAsset,
  measureSkeleton,
  requireCharacterCompatibility,
  scaleSkeleton,
  type CharacterWorldReference,
} from '../../src/character';
import { VEHICLE_CONNECTION_Y_M, VEHICLE_REST_SPRING_M } from '../../src/rendering';
import { VEHICLE_CLASSES } from '../../src/vehicles';
import { CITY_LAYOUT_DEFAULTS, createCityLayout, createNeighbourhoodMap } from '../../src/world';
import { realWorldReference } from './world-reference';

const reference = realWorldReference();

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => (error as CharacterContractError).code === code);
}

function close(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('referințele de scară sunt citite din contractele reale, nu inventate', () => {
  const layout = createCityLayout(createNeighbourhoodMap());
  const realLaneWidths = [...new Set(layout.lanes.map((lane) => lane.widthM))].sort();
  assert.equal(reference.sidewalkWidthM, CITY_LAYOUT_DEFAULTS.sidewalkWidthM);
  assert.equal(reference.curbHeightM, CITY_LAYOUT_DEFAULTS.sidewalkElevationM);
  assert.deepEqual(reference.derivation.laneWidthsM, realLaneWidths);
  assert.equal(reference.vehicle.classId, VEHICLE_CLASSES.sedan.classId);
  assert.equal(reference.derivation.vehicleClassVersion, VEHICLE_CLASSES.sedan.version);
  const wheelBottom =
    VEHICLE_CONNECTION_Y_M - VEHICLE_REST_SPRING_M - VEHICLE_CLASSES.sedan.wheels.radiusM;
  assert.ok(Math.abs(reference.derivation.wheelBottomM - wheelBottom) < 1e-9);
  // The real sedan is a low car: roof above ground between 1.5 m and 2.0 m, cabin 1.2–1.8 m.
  assert.ok(reference.vehicle.doorClearanceM > 1.5 && reference.vehicle.doorClearanceM < 2.0);
  assert.ok(reference.vehicle.cabinWidthM > 1.2 && reference.vehicle.cabinWidthM < 1.8);
  assert.ok(reference.vehicle.sillHeightM > 0.3 && reference.vehicle.sillHeightM < 0.7);
});

test('assetul implicit are scara umană și pivoturile pe planul solului', () => {
  const asset = createCharacterAsset();
  assert.equal(asset.id, 'pedestrian-adult-01');
  assert.equal(asset.version, '191-character-v1');
  assert.equal(asset.scale, 1);
  close(asset.measured.heightM, 1.78);
  close(asset.measured.eyeHeightM, 1.645);
  close(asset.measured.armSpanM, asset.measured.heightM);
  close(asset.measured.legReachM, asset.measured.hipHeightM);
  assert.ok(Math.abs(asset.measured.lowestRestPointM) <= CHARACTER_SCALE_LIMITS.pivotToleranceM);
  assert.ok(asset.measured.shoulderWidthM < reference.sidewalkWidthM);
  assert.ok(asset.measured.entryHeightM < reference.vehicle.doorClearanceM);

  const pivots = characterRestPivots(asset.skeleton);
  assert.equal(pivots.length, CHARACTER_JOINT_IDS.length);
  assert.deepEqual(
    pivots.map((pivot) => pivot.joint),
    [...CHARACTER_JOINT_IDS],
  );
  const byJoint = new Map(pivots.map((pivot) => [pivot.joint, pivot]));
  close(byJoint.get('pelvis')!.positionM.y, 0.98);
  close(byJoint.get('thigh-left')!.positionM.y, 0.935);
  close(byJoint.get('foot-left')!.positionM.y, 0.075);
  close(byJoint.get('head')!.positionM.y, 1.675);
  for (const pivot of pivots)
    assert.ok(
      Number.isFinite(pivot.positionM.x) &&
        Number.isFinite(pivot.positionM.y) &&
        Number.isFinite(pivot.positionM.z),
    );
});

test('assetul implicit este acceptat numeric față de oraș și vehicul', () => {
  const asset = createCharacterAsset();
  const compatibility = checkCharacterCompatibility(asset, reference);
  assert.equal(compatibility.accepted, true);
  assert.deepEqual(compatibility.refusals, []);
  assert.equal(compatibility.checks.length, 9);
  assert.ok(compatibility.checks.every((entry) => entry.pass));
  const sidewalk = compatibility.checks.find((entry) => entry.id === 'SIDEWALK_FIT')!;
  assert.equal(sidewalk.reference, CITY_LAYOUT_DEFAULTS.sidewalkWidthM);
  assert.ok(sidewalk.actual < sidewalk.reference);
  const door = compatibility.checks.find((entry) => entry.id === 'DOOR_ENTRY')!;
  assert.equal(door.reference, reference.vehicle.doorClearanceM);
  assert.ok(door.actual < door.reference);
  assert.doesNotThrow(() => requireCharacterCompatibility(asset, reference));
});

test('assetul supradimensionat este REFUZAT: prea înalt și nu poate intra pe ușă', () => {
  const giant = createCharacterAsset({ id: 'oversized-probe', scale: 1.45 });
  assert.ok(Math.abs(giant.measured.heightM - 1.78 * 1.45) < 1e-12);
  assert.ok(giant.measured.entryHeightM > reference.vehicle.doorClearanceM);
  const compatibility = checkCharacterCompatibility(giant, reference);
  assert.equal(compatibility.accepted, false);
  assert.ok(compatibility.refusals.includes('HEIGHT_OUT_OF_RANGE'));
  assert.ok(compatibility.refusals.includes('DOOR_TOO_LOW'));
  expectCode(() => requireCharacterCompatibility(giant, reference), 'ASSET_REFUSED');
  assert.throws(
    () => requireCharacterCompatibility(giant, reference),
    (error: unknown) =>
      /DOOR_TOO_LOW/.test((error as CharacterContractError).message) &&
      /HEIGHT_OUT_OF_RANGE/.test((error as CharacterContractError).message),
  );
});

test('un trotuar mai îngust decât personajul refuză assetul valid', () => {
  const narrow = { ...reference, sidewalkWidthM: 0.9 } as CharacterWorldReference;
  const compatibility = checkCharacterCompatibility(createCharacterAsset(), narrow);
  assert.equal(compatibility.accepted, false);
  assert.deepEqual(compatibility.refusals, ['SIDEWALK_TOO_NARROW']);
  expectCode(() => requireCharacterCompatibility(createCharacterAsset(), narrow), 'ASSET_REFUSED');
});

test('o declarație de scară care contrazice măsurătoarea este refuzată', () => {
  const lying = createCharacterAsset({
    id: 'lying-declaration-probe',
    declared: { heightM: 2.4 },
  });
  const compatibility = checkCharacterCompatibility(lying, reference);
  assert.equal(compatibility.accepted, false);
  assert.deepEqual(compatibility.refusals, ['DECLARATION_MISMATCH']);
  close(compatibility.checks.find((entry) => entry.id === 'DECLARATION')!.actual, 0.62);
});

test('scalarea scheletului păstrează proporțiile, pivotul la sol și refuzul uman', () => {
  const tiny = measureSkeleton(scaleSkeleton(0.5));
  close(tiny.heightM, 0.89);
  close(tiny.eyeHeightM, 0.8225);
  assert.ok(Math.abs(tiny.lowestRestPointM) < 1e-12);
  close(tiny.armSpanM, 0.89);
  const compatibility = checkCharacterCompatibility(
    createCharacterAsset({ id: 'child-probe', scale: 0.5 }),
    reference,
  );
  assert.equal(compatibility.accepted, false);
  assert.ok(compatibility.refusals.includes('HEIGHT_OUT_OF_RANGE'));
});
