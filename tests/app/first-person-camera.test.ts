import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompositionWorld,
  createLiveModeSegments,
  createV3Composition,
  vehicleDriverEyeM,
  type CompositionWorld,
  type LiveModeSegments,
  type V3Composition,
} from '../../src/app';
import { VEHICLE_RIDE_HEIGHT_M, vehicleGeometrySpec } from '../../src/rendering';
import { createDefaultSettings, type ControlPreferences } from '../../src/settings';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '280-first-person-camera',
  worldEpoch: 1,
});

interface Fixture {
  readonly world: CompositionWorld;
  readonly model: V3Composition;
  readonly segments: LiveModeSegments | null;
  readonly control: ControlPreferences;
}

function fixture(withSegments = true): Fixture {
  const world = createCompositionWorld();
  const control = createDefaultSettings('280-test').input.control;
  const modelRef: { current: V3Composition | undefined } = { current: undefined };
  const segments = withSegments
    ? createLiveModeSegments({
        context: CONTEXT,
        playerId: 'player:280',
        profileId: 'profile:280',
        baseVersionId: 'profile:280@1',
        learningEpoch: 0,
        controlPreferencesVersion: 'control-1',
        engineVersion: 'engine-280',
        mapVersion: world.map.mapId,
        learningEligible: true,
        readAuthority: () => {
          if (modelRef.current === undefined)
            return { tick: 0, playerVehicleId: null, mode: 'AUTO' as const, suspended: false };
          return modelRef.current.modeAuthority();
        },
      })
    : null;
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control,
    cameraMode: 'CHASE',
    context: CONTEXT,
    vehicles: world.vehicles,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  if (segments !== null) model.attachModeSegments(segments);
  model.step({ tick: 1 });
  return { world, model, segments, control };
}

function close(f: Fixture): void {
  f.segments?.dispose();
  f.model.dispose();
}

function vehicleOf(f: Fixture, vehicleId: string) {
  return f.model.frame.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)!;
}

function physicalOf(f: Fixture, vehicleId: string) {
  const vehicle = vehicleOf(f, vehicleId);
  return {
    positionM: { ...vehicle.positionM },
    speedMps: vehicle.speedMps,
    yawRad: vehicle.yawRad,
    controlMode: vehicle.controlMode,
  };
}

function assertApprox(actual: number, expected: number, tolerance: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function rotatedLocal(point: Readonly<{ x: number; y: number; z: number }>, yawRad: number) {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function takeOver(f: Fixture, vehicleId: string): void {
  assert.equal(f.model.requestTakeover(vehicleId, 'MANUAL'), true);
  f.model.step({ tick: f.model.frame.tick + 1 });
}

test('280: C switches to the driver eye and back without authority or segment changes', () => {
  const f = fixture();
  try {
    takeOver(f, 'taxi-01');
    f.model.step({ tick: f.model.frame.tick + 1 });
    const segments = f.segments;
    assert.ok(segments);
    const before = f.model.frame;
    const activeBefore = segments.observe().active;
    const physicalBefore = physicalOf(f, 'taxi-01');
    assert.equal(before.camera.mode, 'CHASE');
    assert.equal(before.authority.consumer, 'VEHICLE');
    assert.equal(segments.observe().active?.mode, 'MANUAL');

    // The switch itself is presentation-only: no tick is advanced, no authority or segment moves.
    assert.equal(f.model.toggleCameraMode(), 'FIRST_PERSON');
    assert.equal(f.model.frame, before);
    assert.deepEqual(segments.observe().active, activeBefore);
    assert.deepEqual(physicalOf(f, 'taxi-01'), physicalBefore);
    assert.deepEqual(f.model.modeAuthority(), {
      tick: before.tick,
      playerVehicleId: 'taxi-01',
      mode: 'MANUAL',
      suspended: false,
    });

    const after = f.model.step({ tick: before.tick + 1 });
    assert.equal(after.camera.mode, 'FIRST_PERSON');
    assert.equal(after.authority.consumer, 'VEHICLE');
    assert.equal(after.playerVehicleId, 'taxi-01');
    assert.equal(vehicleOf(f, 'taxi-01').controlMode, 'MANUAL');
    assert.deepEqual(physicalOf(f, 'taxi-01'), physicalBefore);
    const activeAfter = segments.observe().active;
    assert.equal(activeAfter?.segmentId, activeBefore?.segmentId);
    assert.equal(activeAfter?.startTick, activeBefore?.startTick);
    assert.equal(activeAfter?.mode, 'MANUAL');

    const eye = vehicleDriverEyeM('sedan');
    const taxi = vehicleOf(f, 'taxi-01');
    const worldEye = rotatedLocal(eye, taxi.yawRad);
    assert.equal(after.camera.entityId, 'taxi-01');
    assert.equal(after.camera.targetKind, 'VEHICLE');
    assert.equal(after.camera.distanceM, 0);
    assert.deepEqual(after.camera.anchorM, after.camera.positionM);
    assertApprox(after.camera.positionM.x, taxi.positionM.x + worldEye.x, 1e-9, 'eye x');
    assertApprox(after.camera.positionM.y, taxi.positionM.y + worldEye.y, 1e-9, 'eye y');
    assertApprox(after.camera.positionM.z, taxi.positionM.z + worldEye.z, 1e-9, 'eye z');
    const lookLength = Math.hypot(
      after.camera.lookAtM.x - after.camera.positionM.x,
      after.camera.lookAtM.y - after.camera.positionM.y,
      after.camera.lookAtM.z - after.camera.positionM.z,
    );
    assertApprox(lookLength, 1, 1e-9, 'look length');
    assertApprox(after.camera.fovRadians, (60 * Math.PI) / 180, 1e-9, 'FOV');

    assert.equal(f.model.toggleCameraMode(), 'CHASE');
    const chase = f.model.step({ tick: after.tick + 1 });
    assert.equal(chase.camera.mode, 'CHASE');
    assert.equal(chase.camera.entityId, 'taxi-01');
    assert.ok(chase.camera.distanceM > 0);
    assert.equal(chase.authority.consumer, 'VEHICLE');
  } finally {
    close(f);
  }
});

test('280: driver eye is inside the real cabin and the saved FOV follows the 009 control', () => {
  const f = fixture();
  try {
    for (const classId of ['sedan', 'compact'] as const) {
      const eye = vehicleDriverEyeM(classId);
      const spec = vehicleGeometrySpec(classId);
      const cabin = spec.parts
        .filter((part) => part.group === 'BODY' && part.size[1] >= 0.3 && part.center[1] > 0.3)
        .sort((left, right) => right.size[1] - left.size[1])[0]!;
      assert.ok(eye.x < 0, `${classId}: driver is on the left seat`);
      assert.ok(
        eye.y > VEHICLE_RIDE_HEIGHT_M + cabin.center[1] - cabin.size[1] / 2 &&
          eye.y < VEHICLE_RIDE_HEIGHT_M + cabin.center[1] + cabin.size[1] / 2,
        `${classId}: eye height ${eye.y} is inside the cabin volume`,
      );
      assert.ok(
        eye.z > cabin.center[2] - cabin.size[2] / 2 && eye.z < cabin.center[2] + cabin.size[2] / 2,
        `${classId}: eye depth ${eye.z} is inside the cabin volume`,
      );
    }

    takeOver(f, 'taxi-01');
    f.model.toggleCameraMode();
    let frame = f.model.step({ tick: f.model.frame.tick + 1 });
    assertApprox(frame.camera.fovRadians, (60 * Math.PI) / 180, 1e-9, 'FOV 60');
    const widened = Object.freeze({ ...f.control, version: f.control.version + 1, fov: 100 });
    f.model.setControlPreferences(widened);
    frame = f.model.step({ tick: frame.tick + 1 });
    assertApprox(frame.camera.fovRadians, (100 * Math.PI) / 180, 1e-9, 'FOV 100');
    assert.equal(frame.camera.mode, 'FIRST_PERSON');
  } finally {
    close(f);
  }
});

test('280: exiting, re-entering and switching vehicles keep the first-person camera coherent', () => {
  const f = fixture();
  try {
    const segments = f.segments;
    assert.ok(segments);
    takeOver(f, 'taxi-01');
    f.model.toggleCameraMode();
    let frame = f.model.step({ tick: f.model.frame.tick + 1 });
    assert.equal(frame.camera.mode, 'FIRST_PERSON');
    const openManual = segments.observe().active;
    assert.equal(openManual?.mode, 'MANUAL');

    f.model.requestExit();
    frame = f.model.step({ tick: frame.tick + 1 });
    assert.equal(frame.authority.consumer, 'CHARACTER');
    assert.equal(frame.camera.mode, 'CHASE');
    assert.equal(frame.camera.entityId, frame.character.entityId);
    assert.equal(frame.selectedVehicleId, null);
    assert.equal(segments.observe().active, null);
    assert.equal(segments.observe().lastClosed?.closeReason, 'RETURN_TO_AUTO');
    assert.equal(segments.observe().lastClosed?.endTick, frame.tick);

    f.model.requestEntry('taxi-01');
    frame = f.model.step({ tick: frame.tick + 1 });
    assert.equal(frame.authority.consumer, 'VEHICLE');
    assert.equal(frame.camera.mode, 'FIRST_PERSON');
    assert.equal(frame.camera.entityId, 'taxi-01');
    assert.equal(segments.observe().active?.mode, 'MANUAL');
    assert.notEqual(segments.observe().active?.segmentId, openManual?.segmentId);

    takeOver(f, 'civil-01');
    frame = f.model.frame;
    assert.equal(segments.observe().active?.vehicleId, 'civil-01');
    assert.equal(segments.observe().lastClosed?.closeReason, 'VEHICLE_SWITCH');
    assert.equal(frame.authority.consumer === 'VEHICLE' && frame.authority.vehicleId, 'civil-01');
    assert.equal(frame.playerVehicleId, 'civil-01');
    assert.equal(frame.camera.mode, 'FIRST_PERSON');
    assert.equal(frame.camera.entityId, 'civil-01');
    const eye = vehicleDriverEyeM('compact');
    const civil = vehicleOf(f, 'civil-01');
    assertApprox(frame.camera.positionM.y, civil.positionM.y + eye.y, 1e-9, 'switch eye y');
    assert.equal(
      frame.vehicles.filter((vehicle) => vehicle.controlMode !== 'AUTO').length,
      1,
      'one PLAYER seat',
    );
  } finally {
    close(f);
  }
});
