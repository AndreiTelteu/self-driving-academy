import assert from 'node:assert/strict';
import test from 'node:test';
import { FLEET_SWITCH_POLICY } from '../../src/character';
import { runFleetSwitchReport } from './fleet-switch-suite';

test('raportul determinist separă FOCUS de TAKE și dovedește revenirea la mers', () => {
  const report = runFleetSwitchReport();
  assert.equal(report.contract, '197-fleet-switch-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run fleet:switch');
  assert.equal(report.policy.cameraTransitionTicks, 18);
  assert.equal(report.policy.focusProofDistanceM, 200);
  assert.ok(report.policy.takeReachM > 0.7 && report.policy.takeReachM < 1);
  assert.equal(report.reference.characterHeightM, 1.78);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.x, 0.85);
  assert.equal(report.reference.vehicleColliderHalfExtentsM.z, 2);
  assert.equal(report.reference.sidewalkElevationM, 0.14);
  assert.equal(report.reference.takeReachM, FLEET_SWITCH_POLICY.takeReachM);

  assert.equal(report.summary.scenarios, 12);
  assert.equal(report.summary.scenariosPassed, 12);
  assert.equal(report.summary.focus, true);
  assert.equal(report.summary.take, true);
  assert.equal(report.summary.returnToWalking, true);
  assert.equal(report.summary.chain, true);
  assert.equal(report.summary.projection, true);
  assert.equal(report.summary.pass, true);

  assert.deepEqual(
    report.scenarios.map((row) => row.id),
    [
      'focus-distant',
      'focus-near',
      'focus-same',
      'focus-unknown',
      'take-after-focus',
      'take-distant',
      'take-immobilized',
      'take-same-vehicle',
      'return-resume',
      'return-wall',
      'return-not-controlled',
      'second-command-same-tick',
    ],
  );
  for (const row of report.scenarios) assert.equal(row.verdict, 'PASS', row.id);

  const byId = new Map(report.scenarios.map((row) => [row.id, row]));
  for (const id of ['focus-distant', 'focus-near']) {
    const row = byId.get(id)!;
    assert.equal(row.result, 'ACCEPTED', id);
    assert.equal(row.characterMoved, false, id);
    assert.equal(row.characterBitsIdentical, true, id);
    assert.equal(row.entitiesBefore, row.entitiesAfter, id);
    assert.equal(row.cameraDiverged, true, id);
    assert.match(row.cameraAfter, /^vehicle:/, id);
    assert.match(row.authorityAfter, /^CHARACTER:/, id);
  }
  assert.equal(byId.get('focus-same')!.code, 'SAME_ENTITY');
  assert.equal(byId.get('focus-unknown')!.code, 'UNKNOWN_VEHICLE');
  assert.equal(byId.get('take-after-focus')!.authorityAfter, 'VEHICLE:vehicle:taxi-197');
  assert.equal(byId.get('take-after-focus')!.characterMoved, false);
  assert.equal(byId.get('take-after-focus')!.cameraDiverged, false);
  assert.equal(byId.get('take-distant')!.cause, 'OUT_OF_RANGE');
  assert.equal(byId.get('take-immobilized')!.cause, 'VEHICLE_UNAVAILABLE');
  assert.equal(byId.get('take-same-vehicle')!.code, 'SAME_VEHICLE');
  assert.equal(byId.get('return-resume')!.resumeSource, 'PREVIOUS_POSITION');
  assert.equal(byId.get('return-wall')!.resumeSource, 'EXIT_POINT');
  assert.equal(byId.get('return-wall')!.characterMoved, true);
  assert.equal(byId.get('return-not-controlled')!.code, 'NOT_CONTROLLED');
  assert.equal(byId.get('second-command-same-tick')!.code, 'DOUBLE_SWITCH_REFUSED');

  const focus = report.focus;
  assert.equal(focus.vehicleId, 'vehicle:far-197');
  assert.equal(focus.distanceM, 200);
  assert.equal(focus.positionBitsIdentical, true);
  assert.equal(focus.characterMovedM, 0);
  assert.equal(focus.characterBitsBefore, focus.characterBitsAfter);
  assert.equal(focus.authorityBefore, 'CHARACTER:player-character');
  assert.equal(focus.authorityAfter, 'CHARACTER:player-character');
  assert.equal(focus.entitiesBefore, 2);
  assert.equal(focus.entitiesAfter, 2);
  assert.equal(focus.cameraTrackedEntityId, 'vehicle:far-197');
  assert.equal(focus.cameraAuthorityEntityId, 'player-character');
  assert.equal(focus.cameraDiverged, true);
  assert.equal(focus.cameraTransitionTicks, 18);
  assert.equal(focus.cameraRemainingStart, 17);
  assert.equal(focus.cameraTransitionFrames, 18);
  assert.equal(focus.cameraRemainingEnd, 0);
  assert.equal(focus.cameraEveryFrameIsTracked, true);
  assert.equal(focus.cameraTransitions, 1);
  assert.equal(focus.cameraEntityClones, 0);
  assert.equal(focus.cameraTargetWrites, 0);
  assert.equal(focus.stateRoundTrip, true);
  assert.equal(focus.projectionValid, true);
  assert.equal(focus.cameraSameEntityRefusal, 'SAME_ENTITY');

  assert.equal(report.chain.steps.length, 3);
  assert.deepEqual(
    report.chain.steps.map((step) => step.step),
    ['FOCUS', 'TAKE', 'RETURN'],
  );
  assert.equal(report.chain.entitiesConstant, true);
  assert.equal(report.chain.authorityAlwaysResolves, true);
  assert.equal(report.chain.cameraAlwaysResolves, true);
  assert.equal(report.chain.projectionsValid, true);
  assert.equal(report.chain.cameraTransitions, 2);
  assert.equal(report.chain.focusTransitionFrames, 18);
  assert.equal(report.chain.takeTransitionFrames, 0);
  assert.equal(report.chain.returnTransitionFrames, 18);
  assert.equal(report.chain.everyReturnFrameIsCharacter, true);
  assert.equal(report.chain.characterResumed, true);
  assert.equal(report.chain.steps[0]!.authority, 'CHARACTER:player-character');
  assert.equal(report.chain.steps[1]!.authority, 'VEHICLE:vehicle:taxi-197');
  assert.equal(report.chain.steps[2]!.authority, 'CHARACTER:player-character');
  assert.equal(report.chain.steps[0]!.characterBits, report.chain.steps[2]!.characterBits);

  assert.equal(report.returns.length, 2);
  const resumed = report.returns.find((entry) => entry.branch === 'resume')!;
  assert.equal(resumed.resumeSource, 'PREVIOUS_POSITION');
  assert.equal(resumed.identicalToPrevious, true);
  assert.equal(resumed.previousPositionBits, resumed.resumedPositionBits);
  assert.equal(resumed.resumeEqualsExitPoint, false);
  assert.equal(resumed.rejectionCode, null);
  assert.equal(resumed.oldPointWalker, 'ACCEPTED');
  assert.equal(resumed.vehicleMode, 'AUTO');
  assert.equal(resumed.entitiesBefore, resumed.entitiesAfter);
  assert.ok(resumed.resumeClearanceM > 0);
  const walled = report.returns.find((entry) => entry.branch === 'wall')!;
  assert.equal(walled.resumeSource, 'EXIT_POINT');
  assert.equal(walled.identicalToPrevious, false);
  assert.equal(walled.resumeEqualsExitPoint, true);
  assert.equal(walled.rejectionCode, 'CLEARANCE');
  assert.match(walled.rejectionDetail!, /wall:built-over-body-197/);
  assert.equal(walled.oldPointWalker, 'WALK_START_BLOCKED');
  assert.equal(walled.exitPointWalker, 'ACCEPTED');
  assert.equal(walled.vehicleMode, 'AUTO');
  assert.equal(walled.entitiesBefore, walled.entitiesAfter);
  assert.ok(walled.resumeClearanceM >= 0);
  assert.notEqual(walled.previousPositionBits, walled.resumedPositionBits);

  assert.equal(report.projection.cases.length, 12);
  assert.equal(report.projection.accepted, 4);
  assert.equal(report.projection.refused, 8);
  assert.equal(report.projection.verdict, 'PASS');
  for (const entry of report.projection.cases) assert.equal(entry.verdict, 'PASS', entry.id);
  const inconsistent = report.projection.cases.find(
    (entry) => entry.id === 'vehicle-camera-on-character-without-focus',
  )!;
  assert.equal(inconsistent.accepted, false);
  assert.equal(inconsistent.code, 'INCONSISTENT_PROJECTION');
  const learning = report.projection.cases.find((entry) => entry.id === 'vehicle-learning')!;
  assert.equal(learning.accepted, true);
  assert.equal(learning.mode, 'LEARNING');
  assert.equal(learning.modeSource, 'VEHICLE');
  const focused = report.projection.cases.find((entry) => entry.id === 'character-focus-taxi')!;
  assert.equal(focused.diverged, true);
  assert.equal(focused.divergenceReason, 'FOCUS');

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 6);

  const second = runFleetSwitchReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
