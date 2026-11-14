import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTER_CAMERA_POLICY, VEHICLE_ENTRY_POLICY } from '../../src/character';
import { runEnterReport } from './enter-vehicle-suite';

test('raportul determinist acoperă accesul fizic, autoritatea unică și starea păstrată', () => {
  const report = runEnterReport();
  assert.equal(report.contract, '195-enter-vehicle-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run enter:report');
  assert.equal(VEHICLE_ENTRY_POLICY.entryMode, 'MANUAL');
  assert.equal(report.policy.entryMode, 'MANUAL');
  assert.equal(report.policy.interactionRadiusM, VEHICLE_ENTRY_POLICY.interactionRadiusM);
  assert.ok(report.reference.characterReachM > 0.5 && report.reference.characterReachM < 1.2);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.x, 0.85);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.z, 2);
  assert.ok(report.reference.blockers > 0);
  assert.ok(report.reference.cornerBuildingId.length > 0);

  assert.equal(report.summary.scenarios, 10);
  assert.equal(report.summary.scenariosPassed, 10);
  assert.equal(report.summary.criterion1, true);
  assert.equal(report.summary.criterion2a, true);
  assert.equal(report.summary.criterion2b, true);
  assert.equal(report.summary.camera, true);
  assert.equal(report.summary.pass, true);

  assert.deepEqual(
    report.scenarios.map((row) => row.id),
    [
      'civil-open',
      'taxi-in-ride',
      'seat-occupied',
      'same-tick-second-entry',
      'out-of-range',
      'door-blocked',
      'immobilized',
      'unknown-vehicle',
      'vehicle-at-door',
      'wall-between',
    ],
  );
  for (const row of report.scenarios) {
    assert.equal(row.verdict, 'PASS', row.id);
    assert.ok(row.distanceM === null || row.distanceM >= 0, row.id);
  }
  const accepted = report.scenarios.filter((row) => row.access === 'ACCEPTED');
  assert.deepEqual(
    accepted.map((row) => row.id),
    ['civil-open', 'taxi-in-ride'],
  );
  for (const row of accepted) {
    assert.equal(row.code, null);
    assert.equal(row.doorSide, 'LEFT');
    assert.ok(row.distanceM !== null && row.distanceM <= VEHICLE_ENTRY_POLICY.interactionRadiusM);
  }
  const byId = new Map(report.scenarios.map((row) => [row.id, row]));
  assert.equal(byId.get('out-of-range')!.code, 'OUT_OF_RANGE');
  assert.ok(byId.get('out-of-range')!.distanceM! > VEHICLE_ENTRY_POLICY.interactionRadiusM);
  assert.equal(byId.get('wall-between')!.code, 'PATH_BLOCKED');
  assert.equal(byId.get('wall-between')!.blockerId, report.reference.cornerBuildingId);
  assert.equal(byId.get('door-blocked')!.code, 'PATH_BLOCKED');
  assert.equal(byId.get('door-blocked')!.blockerId, 'hazard:obstacle-01');
  assert.equal(byId.get('vehicle-at-door')!.code, 'PATH_BLOCKED');
  assert.match(byId.get('vehicle-at-door')!.blockerId!, /^vehicle:/);
  assert.equal(byId.get('seat-occupied')!.code, 'VEHICLE_OCCUPIED');
  assert.equal(byId.get('same-tick-second-entry')!.code, 'DOUBLE_ENTRY_REFUSED');
  assert.equal(byId.get('unknown-vehicle')!.code, 'UNKNOWN_VEHICLE');
  assert.equal(byId.get('immobilized')!.code, 'VEHICLE_UNAVAILABLE');

  assert.equal(report.authority.authorityConsumer, 'VEHICLE');
  assert.equal(report.authority.commandConsumer, 'VEHICLE');
  assert.equal(report.authority.characterDeliveryRefused, true);
  assert.equal(report.authority.characterRefusalCode, 'INACTIVE_CONSUMER_REFUSED');
  assert.equal(report.authority.doubleDeliveryRefused, true);
  assert.equal(report.authority.doubleDeliveryCode, 'DOUBLE_DELIVERY_REFUSED');
  assert.equal(report.authority.characterCommandsAfter, 0);
  assert.equal(report.authority.vehicleCommandsAfter, 1);
  assert.deepEqual(report.authority.neutralizedActions, ['throttle']);
  assert.equal(report.authority.transitions, 1);
  assert.equal(report.authority.entityCountBefore, report.authority.entityCountAfter);
  assert.equal(report.authority.characterBodyRetained, true);
  assert.equal(report.authority.characterPositionUnchanged, true);
  assert.equal(
    report.authority.characterPositionBitsBefore,
    report.authority.characterPositionBitsAfter,
  );
  assert.equal(report.authority.secondEntrySameTickRefused, true);
  assert.equal(report.authority.secondEntrySameTickCode, 'DOUBLE_ENTRY_REFUSED');
  assert.equal(report.authority.reEntryWithoutJournalCode, 'VEHICLE_OCCUPIED');

  assert.equal(report.preserved.length, 2);
  for (const entry of report.preserved) {
    assert.equal(entry.bitsIdentical, true, entry.vehicleId);
    assert.equal(entry.bitsBefore, entry.bitsAfter, entry.vehicleId);
    assert.equal(entry.mode, 'MANUAL', entry.vehicleId);
    for (const field of entry.fields)
      assert.equal(field.identical, true, `${entry.vehicleId} ${field.field}`);
  }
  const taxi = report.preserved.find((entry) => entry.vehicleId === 'vehicle:taxi-195')!;
  assert.equal(taxi.previousMode, 'LEARNING');
  assert.equal(taxi.rideId, 'ride-061-7');
  assert.equal(taxi.routeLaneIds.length, 3);
  assert.equal(taxi.rideProgressM, 412.5);

  assert.ok(report.camera.tick > 0);
  assert.equal(report.camera.sameTick, true);
  assert.equal(report.camera.frameEntityId, report.camera.authorityEntityId);
  assert.equal(report.camera.transitioning, true);
  assert.equal(report.camera.transitionTicks, CHARACTER_CAMERA_POLICY.transitionTicks);
  assert.equal(report.camera.remainingStart, CHARACTER_CAMERA_POLICY.transitionTicks - 1);
  assert.equal(report.camera.transitionFrames, CHARACTER_CAMERA_POLICY.transitionTicks);
  assert.equal(report.camera.remainingEnd, 0);
  assert.equal(report.camera.everyFrameIsAuthority, true);
  assert.equal(report.camera.transitions, 1);
  assert.equal(report.camera.entityClones, 0);
  assert.equal(report.camera.targetWrites, 0);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 5);

  const second = runEnterReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
