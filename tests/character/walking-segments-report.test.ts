import assert from 'node:assert/strict';
import test from 'node:test';
import { WALKING_SEGMENTS_POLICY } from '../../src/character';
import { runWalkingSegmentsReport } from './walking-segments-suite';

test('raportul determinist dovedește mers ≠ driving și poarta 069', () => {
  const report = runWalkingSegmentsReport();
  assert.equal(report.contract, '198-walking-segments-v1');
  assert.equal(report.command, 'npm run walking:segments');
  assert.equal(report.tickHz, 60);
  assert.equal(report.policy.defaultEntryMode, 'MANUAL');
  assert.equal(report.policy.defaultEntryMode, WALKING_SEGMENTS_POLICY.defaultEntryMode);
  assert.equal(report.policy.entryPolicyMode, 'MANUAL');
  assert.deepEqual([...report.policy.kinds], ['MANUAL', 'LEARNING']);
  assert.deepEqual([...report.policy.closeReasons], ['RETURN_TO_AUTO', 'VEHICLE_SWITCH']);

  assert.equal(report.summary.scenarios, 16);
  assert.equal(report.summary.scenariosPassed, 16);
  assert.equal(report.summary.walkingIsNotDriving, true);
  assert.equal(report.summary.onlyClosedLearningProducesEstimator, true);
  assert.equal(report.summary.focusClosesNothing, true);
  assert.equal(report.summary.explicitMode, true);
  assert.equal(report.summary.determinism, true);
  assert.equal(report.summary.pass, true);
  for (const row of report.scenarios) assert.equal(row.verdict, 'PASS', row.id);

  const byId = new Map(report.scenarios.map((row) => [row.id, row]));
  assert.deepEqual(
    [...byId.keys()],
    [
      'walk-3600',
      'walk-unbounded',
      'manual-closed',
      'learning-closed',
      'learning-ineligible',
      'learning-truncated-maneuver',
      'take-learning-to-manual',
      'take-manual-to-learning',
      'focus-during-learning',
      'focus-during-manual',
      'matrix-manual-take',
      'matrix-manual-return',
      'matrix-manual-focus',
      'matrix-learning-take',
      'matrix-learning-return',
      'matrix-learning-focus',
    ],
  );

  // Criterion 1a: thousands of walking ticks produce no driving segment and no candidate.
  const walk = report.walking;
  assert.equal(walk.ticks, 3600);
  assert.ok(walk.distanceM > 82 && walk.distanceM < 83);
  assert.equal(walk.boundTicks, 1000);
  assert.equal(walk.boundDistanceM, 50_000);
  assert.equal(walk.closedSegments, 0);
  assert.equal(walk.candidates, 0);
  assert.equal(walk.controlClosedSegments, 1);
  assert.equal(walk.verdict, 'PASS');
  assert.equal(byId.get('walk-3600')!.candidates, 0);
  assert.equal(byId.get('walk-3600')!.closedSegmentId, '198:segment:1');
  assert.equal(byId.get('walk-unbounded')!.closedSegmentId, null);
  assert.equal(byId.get('walk-unbounded')!.candidates, 0);

  // Criterion 1b: only a closed LEARNING segment produces an estimator candidate.
  assert.equal(byId.get('manual-closed')!.closedKind, 'MANUAL');
  assert.equal(byId.get('manual-closed')!.candidates, 0);
  assert.equal(byId.get('learning-closed')!.closedKind, 'LEARNING');
  assert.equal(byId.get('learning-closed')!.candidates, 1);
  assert.equal(byId.get('learning-ineligible')!.closedKind, 'LEARNING');
  assert.equal(byId.get('learning-ineligible')!.candidates, 0);
  assert.equal(byId.get('learning-truncated-maneuver')!.closedKind, 'LEARNING');
  assert.equal(byId.get('learning-truncated-maneuver')!.truncatedManeuver, 'LANE_CHANGING');
  assert.equal(byId.get('learning-truncated-maneuver')!.candidates, 1);

  const gate = report.gate;
  assert.equal(gate.manualClosedCandidates, 0);
  assert.equal(gate.learningClosedCandidates, 1);
  assert.equal(gate.learningIneligibleCandidates, 0);
  assert.equal(gate.truncatedLearningCandidates, 1);
  assert.equal(gate.crossCheckMatches, true);
  assert.equal(gate.real069.manual.mode, 'MANUAL');
  assert.equal(gate.real069.manual.completeness, 'CLOSED');
  assert.equal(gate.real069.manual.intake, 0);
  assert.equal(gate.real069.learning.mode, 'LEARNING');
  assert.equal(gate.real069.learning.learningEligible, true);
  assert.equal(gate.real069.learning.intake, 1);
  assert.equal(gate.real069.learning.descriptor?.endTick, 2);
  assert.equal(gate.real069.ineligible.learningEligible, false);
  assert.equal(gate.real069.ineligible.intake, 0);
  assert.equal(gate.real069.frozenEligibility.learningEligible, true);
  assert.equal(gate.real069.frozenEligibility.targetLearningEligible, false);
  assert.equal(gate.real069.frozenEligibility.intake, 1);
  assert.equal(gate.real069.truncatedManeuver.closeReason, 'VEHICLE_SWITCH');
  assert.equal(gate.real069.truncatedManeuver.completeness, 'CLOSED');
  assert.equal(gate.real069.truncatedManeuver.intake, 1);
  assert.equal(gate.real069.dataLoss.closeReason, 'DATA_LOSS');
  assert.equal(gate.real069.dataLoss.completeness, 'INCOMPLETE');
  assert.equal(gate.real069.dataLoss.intake, 0);

  // Criterion 2: the explicit mode matrix and FOCUS closing nothing.
  assert.deepEqual(
    report.matrix.map((row) => [
      row.previousMode,
      row.transition,
      row.closedKind,
      row.openedMode,
      row.candidates,
    ]),
    [
      ['MANUAL', 'TAKE', 'MANUAL', 'MANUAL', 0],
      ['MANUAL', 'RETURN', 'MANUAL', null, 0],
      ['MANUAL', 'FOCUS', null, null, 0],
      ['LEARNING', 'TAKE', 'LEARNING', 'MANUAL', 1],
      ['LEARNING', 'RETURN', 'LEARNING', null, 1],
      ['LEARNING', 'FOCUS', null, null, 0],
    ],
  );
  assert.equal(byId.get('take-learning-to-manual')!.closedKind, 'LEARNING');
  assert.equal(byId.get('take-learning-to-manual')!.openedMode, 'MANUAL');
  assert.equal(byId.get('take-manual-to-learning')!.closedKind, 'MANUAL');
  assert.equal(byId.get('take-manual-to-learning')!.openedMode, 'LEARNING');
  assert.equal(byId.get('focus-during-learning')!.closedSegmentId, '198:segment:1');
  assert.equal(byId.get('focus-during-learning')!.closedKind, 'LEARNING');
  assert.equal(byId.get('focus-during-learning')!.candidates, 1);

  assert.equal(report.determinism.runs, 2);
  assert.equal(report.determinism.identical, true);
  assert.match(report.determinism.digest, /^[0-9a-f]{64}$/);
  assert.ok(report.limitations.length >= 6);

  const second = runWalkingSegmentsReport();
  assert.equal(second.determinism.digest, report.determinism.digest);
  assert.equal(JSON.stringify(second), JSON.stringify(report));
});
