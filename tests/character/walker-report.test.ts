import assert from 'node:assert/strict';
import test from 'node:test';
import { WALK_PENETRATION_TOLERANCE_M, sedanWalkFootprint } from './walk-world';
import { runWalkerReport } from './walker-suite';

test('raportul determinist acoperă trotuarul, treptele, obstacolul și contactul cu mașina', () => {
  const report = runWalkerReport();
  assert.equal(report.contract, '192-walker-v1');
  assert.equal(report.tickHz, 60);
  assert.equal(report.command, 'npm run walker:report');
  assert.equal(report.policy.stepCeilingM, 0.14);
  assert.equal(report.summary.scenarios, 8);
  assert.equal(report.summary.scenariosPassed, 8);
  assert.equal(report.summary.criterion1, true);
  assert.equal(report.summary.criterion2, true);
  assert.equal(report.summary.singleAuthority, true);
  assert.equal(report.summary.pass, true);
  assert.ok(report.summary.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M);

  assert.deepEqual(
    report.scenarios.map((entry) => entry.id),
    [
      'wall',
      'sidewalk',
      'curb-step-up',
      'curb-step-down',
      'step-over-ceiling',
      'drop-over-ceiling',
      'obstacle',
      'vehicle-contact',
    ],
  );
  for (const scenario of report.scenarios) {
    assert.equal(scenario.verdict, 'PASS', scenario.id);
    assert.equal(scenario.insideSolidTicks, 0, scenario.id);
    assert.ok(scenario.maxPenetrationM <= WALK_PENETRATION_TOLERANCE_M, scenario.id);
    assert.equal(scenario.expectedOutcome, true, scenario.id);
  }

  const curbUp = report.scenarios.find((entry) => entry.id === 'curb-step-up')!;
  assert.equal(curbUp.finalPositionM.y, 0.14);
  assert.equal(curbUp.stepUps, 1);
  const refusedStep = report.scenarios.find((entry) => entry.id === 'step-over-ceiling')!;
  assert.equal(refusedStep.finalPositionM.y, 0);
  assert.equal(refusedStep.stepRefusals, 1);
  assert.equal(refusedStep.finalClipId, 'idle');

  const vehicle = report.scenarios.find((entry) => entry.id === 'vehicle-contact')!;
  const sedan = sedanWalkFootprint();
  const expectedCentreDistance =
    report.capsule.radiusM + sedan.halfExtentsM.x + report.policy.vehicleContactMarginM;
  assert.ok(Math.abs(1.8 - vehicle.finalPositionM.z - expectedCentreDistance) <= 1e-9);
  assert.equal(vehicle.vehicleContacts, 1);
  assert.ok(vehicle.minClearanceM >= report.policy.vehicleContactMarginM - 1e-9);

  // Criterion 2 proofs.
  assert.equal(report.vehicleBodiesCreated, 0);
  assert.equal(report.vehicleMutation.bitsUnchangedByWalking, true);
  assert.equal(report.vehicleMutation.movedByOwner, true);
  assert.equal(report.vehicleMutation.ownerBitsPreserved, true);
  assert.equal(report.vehicleMutation.reactionFollowedVehicle, true);
  assert.equal(report.registrationRefusal.registerVehicleBodyRefused, true);
  assert.equal(report.registrationRefusal.registerVehicleBodyCode, 'VEHICLE_BODY_WRITE_REFUSED');
  assert.equal(report.registrationRefusal.writeVehicleStateRefused, true);
  assert.equal(report.registrationRefusal.writeVehicleStateCode, 'VEHICLE_STATE_WRITE_REFUSED');
  assert.equal(report.registrationRefusal.bodiesAfterRefusals, 0);

  // Single authority.
  assert.equal(report.authority.ticks, 120);
  assert.equal(report.authority.renderFrames, 120);
  assert.equal(report.authority.identicalFrames, 120);
  assert.equal(report.authority.animationPositionWrites, 0);
  assert.equal(report.authority.secondWriters, 0);
  assert.equal(report.authority.animationWriteRefused, true);
  assert.equal(report.authority.stateFrozen, true);
  for (const entry of report.clipFromMeasuredSpeed) assert.equal(entry.pass, true, entry.situation);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 4);

  const second = runWalkerReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
