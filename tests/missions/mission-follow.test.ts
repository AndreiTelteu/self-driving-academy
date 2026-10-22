import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOLLOW_COMPARISON_SCENARIOS,
  FOLLOW_LIMITS,
  FOLLOW_MISSION_ID,
  FOLLOW_SCHEMA_VERSION,
  FOLLOW_SINGLE_SPEED_SCENARIOS,
  compareFollowingProfiles,
  followComparisonStatuses,
  followMissionOutcomes,
  followReasons,
  followSeparationKinds,
  followingMissionGate,
} from '../../src/missions';
import { compareStyles, measureFollowStyle } from './mission-follow-fixture';
import type { FollowStyleId } from './mission-follow-fixture';

/** The measured gap law of the delivered 048 policy for one authored style. */
function expectedGap(minGapM: number, headwayS: number, speedMps: number): number {
  return minGapM + headwayS * speedMps;
}

const EPSILON = 1e-9;

test('119 contract: four authored speeds/distances, two compared profiles, no profile writes', () => {
  assert.equal(FOLLOW_SCHEMA_VERSION, '119-mission-follow-v1');
  assert.equal(FOLLOW_MISSION_ID, 'campaign-3-following-distance');
  assert.equal(FOLLOW_COMPARISON_SCENARIOS.length, 4);
  assert.equal(new Set(FOLLOW_COMPARISON_SCENARIOS.map((row) => row.egoSpeedMps)).size, 4);
  assert.equal(FOLLOW_SINGLE_SPEED_SCENARIOS.length, 1);
  assert.equal(FOLLOW_LIMITS.profiles, 2);
  assert.deepEqual([...followComparisonStatuses], ['SEPARATED', 'IDENTICAL', 'UNIDENTIFIED']);
  assert.deepEqual([...followMissionOutcomes], ['PROGRESS', 'NO_PROGRESS']);
  assert.ok(
    followSeparationKinds.includes('HEADWAY') && followSeparationKinds.includes('MINIMUM_GAP'),
  );
  assert.ok(followReasons.includes('SINGLE_SPEED_CANNOT_IDENTIFY'));

  const run = measureFollowStyle('PRUDENT');
  const comparison = compareStyles('PRUDENT', 'PRUDENT_TWIN').comparison;
  assert.equal(comparison.profileWrites, 0);
  assert.equal(comparison.learningJobs, 0);
  assert.deepEqual(comparison.versionIds, []);
  for (const profile of comparison.profiles) {
    assert.equal(profile.profileWrites, 0);
    assert.equal(profile.learningJobs, 0);
    assert.deepEqual(profile.versionIds, []);
  }
  assert.equal(run.scenarios.length, 4);
  assert.equal(run.evidence.find((row) => row.key === 'following_time_headway')!.status, 'READY');
});

test('119 headway separates two styles that keep the same minimum gap', () => {
  const { comparison, gate } = compareStyles('PRUDENT', 'HEADWAY_TWIN');
  assert.equal(comparison.distinctSpeeds, 4);
  assert.equal(comparison.singleSpeed, false);
  assert.equal(comparison.status, 'SEPARATED');
  assert.equal(comparison.separation, 'HEADWAY');
  assert.equal(comparison.reason, null);
  const [prudent, twin] = comparison.profiles;
  assert.ok(Math.abs(prudent!.headwayS! - 2.4) < EPSILON);
  assert.ok(Math.abs(twin!.headwayS! - 0.6) < EPSILON);
  assert.ok(Math.abs(prudent!.minGapM! - 4) < EPSILON);
  assert.ok(Math.abs(twin!.minGapM! - 4) < EPSILON);
  assert.ok(Math.abs(comparison.headwayDeltaS! - 1.8) < 1e-6);
  assert.ok(Math.abs(comparison.minGapDeltaM!) < 1e-6);
  // The measured gaps are the real 048 desired gaps at identical leader facts.
  for (const [index, scenario] of FOLLOW_COMPARISON_SCENARIOS.entries()) {
    assert.ok(
      Math.abs(prudent!.measurements[index]!.gapM - expectedGap(4, 2.4, scenario.egoSpeedMps)) <
        1e-6,
    );
    assert.ok(
      Math.abs(twin!.measurements[index]!.gapM - expectedGap(4, 0.6, scenario.egoSpeedMps)) < 1e-6,
    );
    assert.equal(prudent!.measurements[index]!.leaderId, scenario.leaderId);
    assert.equal(twin!.measurements[index]!.leaderId, scenario.leaderId);
  }
  assert.equal(gate.outcome, 'PROGRESS');
  assert.equal(gate.satisfied, true);
});

test('119 minimum gap separates two styles that keep the same headway at every speed', () => {
  const { comparison, gate } = compareStyles('PRUDENT', 'GAP_TWIN');
  assert.equal(comparison.status, 'SEPARATED');
  assert.equal(comparison.separation, 'MINIMUM_GAP');
  const [prudent, twin] = comparison.profiles;
  assert.ok(Math.abs(prudent!.headwayS! - twin!.headwayS!) < EPSILON);
  assert.ok(Math.abs(prudent!.minGapM! - 4) < EPSILON);
  assert.ok(Math.abs(twin!.minGapM! - 10) < EPSILON);
  assert.ok(Math.abs(comparison.minGapDeltaM! - 6) < 1e-6);
  // At one speed the two coefficients collapse into a single measured distance; the comparison
  // can only separate them because the scenario set varies the speed.
  for (const [index, scenario] of FOLLOW_COMPARISON_SCENARIOS.entries()) {
    const difference = twin!.measurements[index]!.gapM - prudent!.measurements[index]!.gapM;
    assert.ok(Math.abs(difference - 6) < 1e-6, `scenario ${scenario.scenarioId}`);
  }
  assert.equal(gate.outcome, 'PROGRESS');
});

test('119 identical styles are reported as identical, not as a separation', () => {
  const { comparison, gate } = compareStyles('PRUDENT', 'PRUDENT_TWIN');
  assert.equal(comparison.status, 'IDENTICAL');
  assert.equal(comparison.separation, 'NONE');
  assert.equal(comparison.reason, 'PROFILE_VALUES_MATCH');
  assert.ok(comparison.headwayDeltaS! < FOLLOW_LIMITS.headwayDeltaS);
  assert.ok(comparison.minGapDeltaM! < FOLLOW_LIMITS.gapDeltaM);
  assert.equal(gate.outcome, 'NO_PROGRESS');
  assert.equal(gate.reason, 'PROFILE_VALUES_MATCH');
});

test('119 a single speed cannot identify the coefficients, so the mission cannot progress', () => {
  const { comparison, gate } = compareStyles(
    'PRUDENT',
    'HEADWAY_TWIN',
    FOLLOW_SINGLE_SPEED_SCENARIOS,
  );
  assert.equal(comparison.distinctSpeeds, 1);
  assert.equal(comparison.singleSpeed, true);
  assert.equal(comparison.status, 'UNIDENTIFIED');
  assert.equal(comparison.separation, 'UNIDENTIFIED');
  assert.equal(comparison.reason, 'SINGLE_SPEED_CANNOT_IDENTIFY');
  assert.equal(comparison.headwayDeltaS, null);
  assert.equal(comparison.minGapDeltaM, null);
  for (const profile of comparison.profiles) {
    assert.equal(profile.headwayS, null);
    assert.equal(profile.minGapM, null);
    assert.equal(profile.identified, false);
    // The styles still drive differently at that one speed: the refusal is about identification,
    // not about the measured gap being equal.
    assert.ok(profile.measurements[0]!.gapM > 0);
  }
  assert.notEqual(
    comparison.profiles[0]!.measurements[0]!.gapM,
    comparison.profiles[1]!.measurements[0]!.gapM,
  );
  assert.equal(gate.outcome, 'NO_PROGRESS');
  assert.equal(gate.reason, 'SINGLE_SPEED_CANNOT_IDENTIFY');
});

test('119 a foreign leader context or a missing scenario is refused', () => {
  const calm = measureFollowStyle('PRUDENT');
  const twin = measureFollowStyle('HEADWAY_TWIN');
  const scenarioIds = FOLLOW_COMPARISON_SCENARIOS.map((row) => row.scenarioId);
  assert.throws(
    () =>
      compareFollowingProfiles({
        scenarioIds,
        profiles: [
          { profileId: calm.profileId, scenarios: calm.scenarios, evidence: calm.evidence },
          { profileId: calm.profileId, scenarios: calm.scenarios, evidence: calm.evidence },
        ],
      }),
    /Duplicate follow comparison profile/,
  );
  const foreign = {
    ...twin,
    scenarios: twin.scenarios.map((run, index) =>
      index === 0
        ? {
            ...run,
            observations: run.observations.map((entry) => ({
              ...entry,
              leaderSpeedMps: entry.leaderSpeedMps + 3,
            })),
          }
        : run,
    ),
  };
  assert.throws(
    () =>
      compareFollowingProfiles({
        scenarioIds,
        profiles: [
          { profileId: calm.profileId, scenarios: calm.scenarios, evidence: calm.evidence },
          {
            profileId: foreign.profileId,
            scenarios: foreign.scenarios,
            evidence: foreign.evidence,
          },
        ],
      }),
    /Foreign leader context/,
  );
  assert.throws(
    () =>
      compareFollowingProfiles({
        scenarioIds: [...scenarioIds, 'follow-unknown'],
        profiles: [
          { profileId: calm.profileId, scenarios: calm.scenarios, evidence: calm.evidence },
          { profileId: twin.profileId, scenarios: twin.scenarios, evidence: twin.evidence },
        ],
      }),
    /Unknown follow scenario/,
  );
  assert.throws(
    () =>
      compareFollowingProfiles({
        scenarioIds,
        profiles: [
          {
            profileId: calm.profileId,
            scenarios: calm.scenarios.slice(0, 2),
            evidence: calm.evidence,
          },
          { profileId: twin.profileId, scenarios: twin.scenarios, evidence: twin.evidence },
        ],
      }),
    /cover exactly the declared scenarios/,
  );
});

test('119 the gate is the only mission outcome and it needs an identified separation', () => {
  const styles: readonly [FollowStyleId, FollowStyleId, string][] = [
    ['PRUDENT', 'HEADWAY_TWIN', 'PROGRESS'],
    ['PRUDENT', 'GAP_TWIN', 'PROGRESS'],
    ['PRUDENT', 'RECKLESS', 'PROGRESS'],
    ['PRUDENT', 'PRUDENT_TWIN', 'NO_PROGRESS'],
  ];
  for (const [left, right, outcome] of styles) {
    const gate = followingMissionGate(compareStyles(left, right).comparison);
    assert.equal(gate.missionId, FOLLOW_MISSION_ID);
    assert.equal(gate.outcome, outcome, `${left} vs ${right}`);
    assert.equal(gate.satisfied, outcome === 'PROGRESS');
  }
  const reckless = compareStyles('PRUDENT', 'RECKLESS').comparison;
  assert.equal(reckless.separation, 'BOTH');
  assert.ok(Math.abs(reckless.headwayDeltaS! - 1.8) < 1e-6);
  assert.ok(Math.abs(reckless.minGapDeltaM! - 3) < 1e-6);
});
