import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceLaneChange } from './lane-change-policy-reference';
import type { ReferenceLaneChangeInput } from './lane-change-policy-reference';

const open = (): ReferenceLaneChangeInput => ({
  frontGapM: 12,
  backGapM: 10,
  speedGainMps: 2,
  cooldownS: 6,
  decisionTick: 600,
  neighbors: ['lane-par'],
  targetLaneId: 'lane-par',
  coverage: 'COMPLETE',
  observedFrontGapM: 20,
  observedBackGapM: 18,
  targetLaneSpeedMps: 12,
  speedMps: 8,
  ownLaneLeaderSpeedMps: 6,
  intent: 'OPTIONAL_OVERTAKE',
  committedTargetLaneId: null,
  lastChangeTick: null,
});
test('preproduction lane-change oracle applies inclusive gap, gain and cooldown boundaries', () => {
  assert.equal(referenceLaneChange(open()).reason, 'OPTIONAL_CHANGE_VALIDATED');
  // Gap acceptance is inclusive at the configured minimum.
  assert.equal(
    referenceLaneChange({ ...open(), observedFrontGapM: 12 }).reason,
    'OPTIONAL_CHANGE_VALIDATED',
  );
  assert.equal(
    referenceLaneChange({ ...open(), observedFrontGapM: 11.99 }).reason,
    'INSUFFICIENT_FRONT_GAP',
  );
  assert.equal(
    referenceLaneChange({ ...open(), observedBackGapM: 10 }).reason,
    'OPTIONAL_CHANGE_VALIDATED',
  );
  assert.equal(
    referenceLaneChange({ ...open(), observedBackGapM: 9.99 }).reason,
    'INSUFFICIENT_BACK_GAP',
  );
  // The advantage is inclusive at the configured gain and is limited by the slower of ego and leader.
  assert.equal(
    referenceLaneChange({ ...open(), speedMps: 10, ownLaneLeaderSpeedMps: 12 }).speedAdvantageMps,
    2,
  );
  assert.equal(
    referenceLaneChange({ ...open(), speedMps: 10, ownLaneLeaderSpeedMps: 12 }).reason,
    'OPTIONAL_CHANGE_VALIDATED',
  );
  assert.equal(
    referenceLaneChange({
      ...open(),
      speedMps: 10,
      ownLaneLeaderSpeedMps: 12,
      targetLaneSpeedMps: 11.99,
    }).reason,
    'INSUFFICIENT_SPEED_GAIN',
  );
  // A complete, clear target lane is available; local-only coverage never is.
  assert.equal(
    referenceLaneChange({ ...open(), observedFrontGapM: null, observedBackGapM: null }).reason,
    'OPTIONAL_CHANGE_VALIDATED',
  );
  assert.equal(
    referenceLaneChange({ ...open(), coverage: 'LOCAL_ONLY' }).reason,
    'INCOMPLETE_LANE_COVERAGE',
  );
  assert.equal(
    referenceLaneChange({ ...open(), ownLaneLeaderSpeedMps: null, targetLaneSpeedMps: 9 }).reason,
    'INSUFFICIENT_SPEED_GAIN',
  );
});
test('preproduction lane-change oracle applies the inclusive cooldown and the committed continuity', () => {
  assert.equal(
    referenceLaneChange({ ...open(), lastChangeTick: 600, decisionTick: 960 })
      .cooldownRemainingTicks,
    0,
  );
  assert.equal(
    referenceLaneChange({ ...open(), lastChangeTick: 600, decisionTick: 960 }).reason,
    'OPTIONAL_CHANGE_VALIDATED',
  );
  assert.equal(
    referenceLaneChange({ ...open(), lastChangeTick: 600, decisionTick: 959 }).reason,
    'COOLDOWN_ACTIVE',
  );
  assert.equal(
    referenceLaneChange({ ...open(), lastChangeTick: 600, decisionTick: 959 })
      .cooldownRemainingTicks,
    1,
  );
  // A committed manoeuvre ignores failing start gates and follows its latched target lane.
  assert.equal(
    referenceLaneChange({
      ...open(),
      committedTargetLaneId: 'lane-par',
      observedFrontGapM: 1,
      observedBackGapM: 1,
      targetLaneSpeedMps: 0,
      lastChangeTick: 600,
    }).reason,
    'COMMITTED_CONTINUITY',
  );
  // Completion is recognised when the committed lane is no longer an authored lateral neighbour.
  assert.equal(
    referenceLaneChange({
      ...open(),
      committedTargetLaneId: 'lane-par',
      neighbors: ['lane-a'],
      targetLaneId: 'lane-a',
    }).reason,
    'COMMITMENT_RELEASED',
  );
  assert.equal(
    referenceLaneChange({ ...open(), committedTargetLaneId: 'lane-par', neighbors: [] }).reason,
    'COMMITMENT_RELEASED',
  );
  // An unexposed lateral edge is never invented by the oracle either.
  assert.equal(
    referenceLaneChange({ ...open(), targetLaneId: 'lane-invented' }).reason,
    'TARGET_LANE_NOT_ADJACENT',
  );
  assert.equal(referenceLaneChange({ ...open(), neighbors: [] }).reason, 'NO_ADJACENT_LANE');
});
