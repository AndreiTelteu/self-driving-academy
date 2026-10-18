import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceSignal } from './signal-policy-reference';
import type { ReferenceSignalInput } from './signal-policy-reference';

const red = (): ReferenceSignalInput => ({
  redStopProbability: 1,
  greenStartDelayS: 0.7,
  redStopLineOffsetM: 1,
  lateRedBrakeThresholdS: 2,
  state: 'RED',
  phaseElapsedS: 0.5,
  distanceToStopLineM: 20,
  speedMps: 8,
  complianceSample: 0,
});
test('preproduction signal oracle applies the inclusive probability and brake-horizon boundaries', () => {
  assert.equal(referenceSignal(red()).reason, 'STOP_LINE_APPROACH');
  // Compliance is inclusive: sample exactly equal to the probability stops.
  assert.equal(referenceSignal({ ...red(), complianceSample: 0 }).stopRequested, true);
  // Zero probability can never satisfy the inclusive comparison: no compliance stop is taken.
  assert.equal(
    referenceSignal({ ...red(), redStopProbability: 0, distanceToStopLineM: 15 }).reason,
    'CROSS_RED_BY_PROFILE',
  );
  // 3 s to the line against exactly the 2 s horizon still brakes; a shorter remaining time commits.
  assert.equal(
    referenceSignal({ ...red(), redStopProbability: 0, distanceToStopLineM: 24 }).reason,
    'LATE_RED_BRAKE',
  );
  assert.equal(
    referenceSignal({ ...red(), redStopProbability: 0, distanceToStopLineM: 15 }).reason,
    'CROSS_RED_BY_PROFILE',
  );
  assert.equal(
    referenceSignal({
      ...red(),
      redStopProbability: 0,
      lateRedBrakeThresholdS: 6,
      distanceToStopLineM: 24,
    }).reason,
    'CROSS_RED_BY_PROFILE',
  );
  // The offset decides where the hold begins, never the probability.
  assert.equal(referenceSignal({ ...red(), distanceToStopLineM: 1 }).reason, 'STOP_LINE_HOLD');
  assert.equal(
    referenceSignal({ ...red(), distanceToStopLineM: 1.0001 }).reason,
    'STOP_LINE_APPROACH',
  );
  assert.equal(
    referenceSignal({ ...red(), distanceToStopLineM: null }).reason,
    'STOP_LINE_APPROACH',
  );
  assert.equal(
    referenceSignal({ ...red(), distanceToStopLineM: null }).remainingToStopPointM,
    null,
  );
});
test('preproduction signal oracle holds only a stationary vehicle within the green start delay', () => {
  const green: ReferenceSignalInput = {
    ...red(),
    state: 'GREEN',
    phaseElapsedS: 0.2,
    speedMps: 0,
  };
  assert.equal(referenceSignal(green).reason, 'GREEN_START_DELAY');
  assert.equal(referenceSignal({ ...green, phaseElapsedS: 0.7 }).reason, 'GREEN_RELEASE');
  assert.equal(referenceSignal({ ...green, greenStartDelayS: 0 }).reason, 'GREEN_RELEASE');
  assert.equal(referenceSignal({ ...green, speedMps: 0.2 }).reason, 'GREEN_RELEASE');
  // The red-run decision never leaks into the green release.
  assert.equal(
    referenceSignal({ ...green, phaseElapsedS: 9, redStopProbability: 0 }).stopRequested,
    false,
  );
});
