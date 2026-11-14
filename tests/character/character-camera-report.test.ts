import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTER_CAMERA_POLICY } from '../../src/character';
import { runCharacterCameraReport } from './character-camera-suite';

test('raportul determinist acoperă urmărirea, obstacolele, tranziția și setările', () => {
  const report = runCharacterCameraReport();
  assert.equal(report.contract, '194-character-camera-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run character:camera');
  assert.equal(report.policy.transitionTicks, 18);
  assert.equal(report.policy.cameraRadiusM, 0.2);
  assert.equal(report.policy.obstacleMarginM, 0.05);
  assert.equal(report.summary.scenarios, 5);
  assert.equal(report.summary.scenariosPassed, 5);
  assert.equal(report.summary.criterion1a, true);
  assert.equal(report.summary.criterion1b, true);
  assert.equal(report.summary.criterion2, true);
  assert.equal(report.summary.serializable, true);
  assert.equal(report.summary.noCloning, true);
  assert.equal(report.summary.pass, true);

  assert.deepEqual(
    report.scenarios.map((entry) => entry.id),
    ['character-open', 'vehicle-open', 'building-wall', 'vehicle-box', 'corner-both-axes'],
  );
  for (const scenario of report.scenarios) {
    assert.equal(scenario.verdict, 'PASS', scenario.id);
    assert.equal(scenario.insideWorld, true, scenario.id);
    assert.equal(scenario.obstructedTicks, scenario.id.includes('open') ? 0 : scenario.ticks);
  }
  const corner = report.scenarios.find((entry) => entry.id === 'corner-both-axes')!;
  assert.equal(corner.bothAxesBlocked, true);
  assert.ok(corner.stableTailM <= 1e-9);
  assert.ok(corner.minClearanceM !== null);
  assert.ok(corner.minClearanceM! >= CHARACTER_CAMERA_POLICY.obstacleMarginM - 1e-6);
  const wall = report.scenarios.find((entry) => entry.id === 'building-wall')!;
  assert.equal(wall.obstacleId, report.reference.buildingId);
  assert.ok(wall.finalDistanceM < wall.requestedDistanceM);
  const vehicle = report.scenarios.find((entry) => entry.id === 'vehicle-box')!;
  assert.equal(vehicle.obstacleId, 'sedan-194');

  assert.equal(report.transition.transitionFrames, 18);
  assert.equal(report.transition.firstFrameEntityId, 'sedan-194');
  assert.equal(report.transition.remainingStart, 17);
  assert.equal(report.transition.remainingEnd, 0);
  assert.equal(report.transition.everyFrameEntityIsAuthority, true);
  assert.equal(report.transition.noTeleport, true);
  assert.equal(report.transition.entityClones, 0);
  assert.equal(report.transition.targetWrites, 0);

  assert.equal(report.refusal.sameEntityAccepted, false);
  assert.equal(report.refusal.sameEntityReason, 'SAME_ENTITY');
  assert.equal(report.refusal.unknownEntityAccepted, false);
  assert.equal(report.refusal.unknownEntityReason, 'UNKNOWN_ENTITY');
  assert.equal(report.refusal.sameEntityStepTransitions, 0);
  assert.equal(report.refusal.unknownStepCode, 'CAMERA_UNKNOWN_ENTITY');
  assert.equal(report.refusal.unknownStepRefusals, 1);

  assert.equal(report.settingsContractRefused, true);
  assert.deepEqual(
    report.settings.map((entry) => entry.setting),
    ['cameraMotion', 'fov', 'orbit.distanceM', 'orbit.invertYaw', 'orbit.invertPitch'],
  );
  for (const entry of report.settings) assert.equal(entry.changed, true, entry.setting);

  assert.equal(report.serialization.transitionSaved, true);
  assert.equal(report.serialization.identicalAfterRestore, true);
  assert.equal(report.serialization.tamperedVersionRefused, true);
  assert.ok(report.serialization.savedBytes > 100);
  assert.equal(report.noClone.entityClones, 0);
  assert.equal(report.noClone.targetWrites, 0);
  assert.equal(report.noClone.targetUnchanged, true);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 5);

  const second = runCharacterCameraReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
