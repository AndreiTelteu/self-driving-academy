import assert from 'node:assert/strict';
import test from 'node:test';
import { VEHICLE_EXIT_POLICY } from '../../src/character';
import { runExitReport } from './exit-vehicle-suite';

test('raportul determinist acoperă punctul valid, autoritatea și reluarea rutei', () => {
  const report = runExitReport();
  assert.equal(report.contract, '196-exit-vehicle-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run exit:report');
  assert.equal(report.policy.releaseMode, 'AUTO');
  assert.equal(report.policy.clearanceM, VEHICLE_EXIT_POLICY.clearanceM);
  assert.equal(report.policy.stepOutM, 0.6);
  assert.equal(report.policy.maxGroundStepM, 0.14);
  assert.ok(report.reference.characterRadiusM > 0.1 && report.reference.characterRadiusM < 0.2);
  assert.equal(report.reference.characterHeightM, 1.78);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.x, 0.85);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.z, 2);
  assert.equal(report.reference.sidewalkElevationM, 0.14);

  assert.equal(report.summary.scenarios, 12);
  assert.equal(report.summary.scenariosPassed, 12);
  assert.equal(report.summary.criterion1, true);
  assert.equal(report.summary.criterion2a, true);
  assert.equal(report.summary.criterion2b, true);
  assert.equal(report.summary.camera, true);
  assert.equal(report.summary.walkerStart, true);
  assert.equal(report.summary.pass, true);

  assert.deepEqual(
    report.scenarios.map((row) => row.id),
    [
      'open-street',
      'door-obstacle',
      'occupied-by-car',
      'rear-only',
      'real-wall',
      'step-too-high',
      'below-map',
      'moving-slow',
      'moving-fast',
      'no-valid-exit',
      'seat-not-controlled',
      'second-exit',
    ],
  );
  for (const row of report.scenarios) assert.equal(row.verdict, 'PASS', row.id);

  const accepted = report.scenarios.filter((row) => row.result === 'ACCEPTED');
  assert.deepEqual(
    accepted.map((row) => row.id),
    [
      'open-street',
      'door-obstacle',
      'occupied-by-car',
      'rear-only',
      'real-wall',
      'step-too-high',
      'below-map',
      'moving-slow',
    ],
  );
  for (const row of accepted) {
    assert.ok(row.chosen !== null, row.id);
    assert.equal(row.measured!.maxPenetrationM, 0, row.id);
    assert.ok(row.measured!.minClearanceM >= 0, row.id);
    assert.equal(row.measured!.groundClearanceM, 0, row.id);
    assert.equal(row.measured!.insideSolid, false, row.id);
    assert.equal(row.walkerStart, 'ACCEPTED', row.id);
    assert.equal(row.walkerPositionBits!.identical, true, row.id);
    assert.equal(row.mode, 'AUTO', row.id);
    assert.equal(row.routeBitsIdentical, true, row.id);
    assert.ok(row.chosen!.clearanceM >= 0, row.id);
  }

  const byId = new Map(report.scenarios.map((row) => [row.id, row]));
  const door = byId.get('door-obstacle')!;
  assert.equal(door.candidates.length, 2);
  assert.equal(door.candidates[0]!.id, 'LEFT:R0');
  assert.equal(door.candidates[0]!.valid, false);
  assert.equal(door.candidates[0]!.code, 'SOLID');
  assert.equal(door.candidates[1]!.id, 'RIGHT:R0');
  assert.equal(door.candidates[1]!.valid, true);
  assert.equal(door.chosen!.id, 'RIGHT:R0');
  assert.equal(door.colliderRefusals.candidates, 1);
  assert.equal(door.colliderRefusals.refusedByWalker, 1);

  assert.equal(byId.get('occupied-by-car')!.candidates[0]!.code, 'OTHER_VEHICLE');
  assert.match(byId.get('occupied-by-car')!.candidates[0]!.blockerId!, /^vehicle:/);
  assert.equal(byId.get('rear-only')!.chosen!.id, 'REAR:R0');
  assert.equal(byId.get('rear-only')!.attempts, 3);
  assert.equal(byId.get('real-wall')!.candidates[0]!.code, 'SOLID');
  assert.ok(byId.get('real-wall')!.candidates[0]!.clearanceM! < 0);
  assert.equal(byId.get('step-too-high')!.candidates[0]!.code, 'STEP_TOO_HIGH');
  assert.ok(Math.abs(byId.get('step-too-high')!.candidates[0]!.groundStepM - 0.6) < 1e-12);
  assert.equal(byId.get('below-map')!.candidates[0]!.code, 'BELOW_MAP');
  assert.ok(byId.get('below-map')!.candidates[0]!.groundM < 0);
  assert.equal(byId.get('moving-fast')!.code, 'VEHICLE_MOVING');
  assert.equal(byId.get('moving-fast')!.speedMps, 8.5);
  assert.equal(byId.get('moving-slow')!.chosen!.id, 'LEFT:R0');
  assert.equal(byId.get('seat-not-controlled')!.code, 'NOT_CONTROLLED');
  assert.equal(byId.get('second-exit')!.code, 'DOUBLE_EXIT_REFUSED');

  const boxed = byId.get('no-valid-exit')!;
  assert.equal(boxed.code, 'NO_VALID_EXIT');
  assert.equal(boxed.candidates.length, 8);
  assert.ok(boxed.candidates.every((candidate) => !candidate.valid));
  assert.equal(boxed.colliderRefusals.candidates, 8);
  assert.equal(boxed.colliderRefusals.refusedByWalker, 8);
  assert.equal(boxed.chosen, null);
  assert.equal(boxed.measured, null);

  const authority = report.authority;
  assert.equal(authority.authorityConsumer, 'CHARACTER');
  assert.equal(authority.characterId, 'player-character');
  assert.equal(authority.commandConsumer, 'CHARACTER');
  assert.equal(authority.characterCommandsAfter, 1);
  assert.equal(authority.vehicleCommandsAfter, 0);
  assert.equal(authority.vehicleDeliveryRefused, true);
  assert.equal(authority.vehicleRefusalCode, 'INACTIVE_CONSUMER_REFUSED');
  assert.equal(authority.doubleDeliveryRefused, true);
  assert.equal(authority.doubleDeliveryCode, 'DOUBLE_DELIVERY_REFUSED');
  assert.deepEqual(authority.neutralizedActions, ['throttle']);
  assert.equal(authority.characterCommandEmpty, true);
  assert.equal(authority.transitions, 1);
  assert.equal(authority.entityCountBefore, 2);
  assert.equal(authority.entityCountAfter, 2);
  assert.equal(authority.secondExitSameTickRefused, true);
  assert.equal(authority.secondExitSameTickCode, 'DOUBLE_EXIT_REFUSED');
  assert.equal(authority.reExitAfterReleaseCode, 'NOT_CONTROLLED');
  assert.equal(authority.startAccepted, true);
  assert.match(authority.startPositionBits, /^[0-9a-f]{48}$/);

  assert.equal(report.resumption.length, 2);
  for (const entry of report.resumption) {
    assert.equal(entry.mode, 'AUTO', entry.vehicleId);
    assert.equal(entry.previousMode, 'MANUAL', entry.vehicleId);
    assert.equal(entry.bitsIdentical, true, entry.vehicleId);
    assert.equal(entry.bitsBaseline, entry.bitsReleased, entry.vehicleId);
    for (const field of entry.fields) assert.equal(field.identical, true, field.field);
  }
  const taxi = report.resumption.find((entry) => entry.vehicleId === 'vehicle:taxi-196')!;
  assert.equal(taxi.baselineMode, 'LEARNING');
  const ride = taxi.fields.find((field) => field.field === 'state.rideId')!;
  assert.equal(ride.released, '"ride-061-196"');
  const progress = taxi.fields.find((field) => field.field === 'state.rideProgressM')!;
  assert.equal(progress.released, '412.5');

  assert.equal(report.camera.sameTick, true);
  assert.equal(report.camera.frameEntityId, 'player-character');
  assert.equal(report.camera.authorityEntityId, 'player-character');
  assert.equal(report.camera.previousEntityId, 'vehicle:civil-196');
  assert.equal(report.camera.transitioning, true);
  assert.equal(report.camera.transitionTicks, 18);
  assert.equal(report.camera.remainingStart, 17);
  assert.equal(report.camera.transitionFrames, 18);
  assert.equal(report.camera.remainingEnd, 0);
  assert.equal(report.camera.everyFrameIsAuthority, true);
  assert.equal(report.camera.transitions, 1);
  assert.equal(report.camera.entityClones, 0);
  assert.equal(report.camera.targetWrites, 0);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 6);

  const second = runExitReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
