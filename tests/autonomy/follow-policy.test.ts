import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOLLOW_POLICY_KEYS,
  FOLLOW_POLICY_LIMITS,
  compileFollowPolicyProfile,
  evaluateFollowPolicy,
} from '../../src/autonomy/follow-policy';
import type { FollowPolicyInput, FollowPolicyProfile } from '../../src/autonomy/follow-policy';
import { compileFollowingProfile, evaluateFollowingTarget } from '../../src/autonomy/following';
import { createFollowingTargetFixture } from './following-target-fixture';
import {
  evaluate,
  followObservation,
  followProfile,
  followProfileDocument,
  followingFixture,
  run,
  scenario,
  state,
} from './follow-policy-reference';
import type { FollowScene } from './follow-policy-reference';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;

/** A cut-in: the new leader interposes at 18 m while the ego still runs at 15 m/s. */
const cutInScene: FollowScene = {
  egoSpeed: 15,
  leadGap: 18,
  leadSpeed: 8,
  leaderId: 'cut-in',
  leaderIncarnation: 2,
  cutIn: true,
  cruiseTargetMps: 16,
};
/** The same scene once the interposition is resolved: no cut-in flag, same leader and gap. */
const settledScene: FollowScene = { ...cutInScene, cutIn: false };
/** A closing approach on a slower leader: 6 m/s of closing speed at 36 m. */
const closingScene: FollowScene = {
  egoSpeed: 14,
  leadGap: 36,
  leadSpeed: 8,
  leaderId: 'leader',
  leaderIncarnation: 1,
  cruiseTargetMps: 18,
};
/** The previous leader left the lane; the new leader is farther away and faster. */
const leaderChangeScene: FollowScene = {
  egoSpeed: 10,
  leadGap: 60,
  leadSpeed: 14,
  leaderId: 'new-leader',
  leaderIncarnation: 2,
  cruiseTargetMps: 16,
};
const oldLeaderState = state({
  leaderId: 'old-leader',
  leaderIncarnation: 1,
  committedTargetMps: 7.9,
  leaderHoldTicks: 0,
});

test('171 cutin_brake_response only changes the size of the cut-in reaction', () => {
  const slow = followProfile({ cutin_brake_response: 0.2 }),
    full = followProfile({ cutin_brake_response: 1 }),
    none = followProfile({ cutin_brake_response: 0 }),
    previous = state({
      leaderId: 'cut-in',
      leaderIncarnation: 2,
      committedTargetMps: 12,
    }),
    requested = followingFixture(cutInScene).target.targetMps,
    slowRow = evaluate(slow, cutInScene, { state: previous }),
    fullRow = evaluate(full, cutInScene, { state: previous }),
    noneRow = evaluate(none, cutInScene, { state: previous });
  // The 048 preference is the safe target of the episode; the key only sets the reaction size.
  assert.equal(slowRow.episode, 'CUT_IN');
  assert.equal(slowRow.bindingConstraint, 'CUT_IN_BLEND');
  assert(slowRow.committedTargetMps < 12 && slowRow.committedTargetMps > requested);
  assert(close(fullRow.committedTargetMps, requested, 1e-12));
  assert.equal(fullRow.bindingConstraint, 'CUT_IN_BLEND');
  assert.equal(fullRow.cutInFactor, 1);
  assert.equal(noneRow.committedTargetMps, 12);
  assert.equal(noneRow.cutInFactor, 0);
  assert(slowRow.committedTargetMps > fullRow.committedTargetMps);
  // Every value stays between the delivered following target and the previous commitment.
  for (const row of [slowRow, fullRow, noneRow]) {
    assert(row.committedTargetMps >= requested);
    assert(row.committedTargetMps <= 12);
    assert(row.committedTargetMps <= FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps);
  }
  // Outside the cut-in episode the key is inert.
  const settledSlow = evaluate(slow, settledScene, { state: previous }),
    settledFull = evaluate(full, settledScene, { state: previous });
  assert.deepEqual(settledSlow, settledFull);
  assert.equal(settledSlow.episode, 'NONE');
  assert(close(settledSlow.committedTargetMps, requested, 1e-12));
});

test('171 closing_ttc_threshold only caps a closing approach', () => {
  const loose = followProfile({ closing_ttc_threshold: 0.3 }),
    tight = followProfile({ closing_ttc_threshold: 8 }),
    previous = state({
      leaderId: 'leader',
      leaderIncarnation: 1,
      committedTargetMps: 15.26,
    }),
    looseRow = evaluate(loose, closingScene, { state: previous }),
    tightRow = evaluate(tight, closingScene, { state: previous }),
    requested = followingFixture(closingScene).target.targetMps;
  assert.equal(looseRow.closingSpeedMps, 6);
  assert(close(looseRow.timeToContactS!, 6, 1e-12));
  // The loose threshold keeps the 048 preference; the tight one caps the closing speed.
  assert(close(looseRow.committedTargetMps, requested, 1e-12));
  assert.equal(looseRow.bindingConstraint, 'FOLLOWING_TARGET');
  assert.equal(tightRow.episode, 'TTC');
  assert.equal(tightRow.bindingConstraint, 'TTC_CAP');
  assert(close(tightRow.ttcCapMps!, 8 + (36 - 5) / 8, 1e-12));
  assert(close(tightRow.committedTargetMps, 11.875, 1e-12));
  assert(tightRow.committedTargetMps < looseRow.committedTargetMps);
  // The margin left after the cap lasts at least the threshold.
  const closingAfterCap = Math.max(0, closingScene.egoSpeed - tightRow.committedTargetMps);
  assert((tightRow.gapM! - FOLLOW_POLICY_LIMITS.minimumLeadGapM) / closingAfterCap >= 8);
  // Without a closing speed the key is inert, whatever the threshold says.
  const cruising: FollowScene = { ...closingScene, egoSpeed: 8, leadSpeed: 8 };
  assert.deepEqual(
    evaluate(loose, cruising, { state: previous }),
    evaluate(tight, cruising, { state: previous }),
  );
});

test('171 leader_change_delay delays only the target increase of a new leader', () => {
  const immediate = followProfile({ leader_change_delay: 0 }),
    delayed = followProfile({ leader_change_delay: 2, cutin_brake_response: 0.7 }),
    requested = followingFixture(leaderChangeScene).target.targetMps,
    immediateRow = evaluate(immediate, leaderChangeScene, { state: oldLeaderState }),
    heldRow = evaluate(delayed, leaderChangeScene, { state: oldLeaderState });
  assert.equal(immediateRow.episode, 'LEADER_CHANGE');
  assert(close(immediateRow.committedTargetMps, requested, 1e-12));
  assert.equal(immediateRow.leaderHoldTicks, 0);
  assert.equal(immediateRow.leaderAdopted, true);
  assert.equal(heldRow.episode, 'LEADER_CHANGE');
  assert.equal(heldRow.bindingConstraint, 'LEADER_DELAY');
  assert.equal(heldRow.committedTargetMps, 7.9);
  assert.equal(heldRow.leaderHoldTicks, 119);
  assert.equal(heldRow.leaderAdopted, false);
  // The hold lasts ceil(2 s · 60) = 120 ticks and then adopts the new leader.
  const rows = run(
    delayed,
    Array.from({ length: 130 }, () => leaderChangeScene),
    {
      initial: oldLeaderState,
    },
  );
  assert.equal(rows[118].committedTargetMps, 7.9);
  assert.equal(rows[118].leaderHoldTicks, 1);
  assert.equal(rows[119].committedTargetMps, 7.9);
  assert.equal(rows[119].leaderHoldTicks, 0);
  assert(close(rows[120].committedTargetMps, requested, 1e-12));
  // A reduction is never delayed: the new leader braking on the hold tick is adopted at once.
  const slowing: FollowScene = { ...leaderChangeScene, leadSpeed: 2, leadGap: 20 };
  const reduced = evaluate(delayed, slowing, {
    state: state({ ...oldLeaderState, leaderHoldTicks: 100 }),
  });
  assert.equal(reduced.committedTargetMps, followingFixture(slowing).target.targetMps);
  assert(close(reduced.committedTargetMps, 3.7, 1e-12));
  assert.equal(reduced.leaderHoldTicks, 0);
  // A cut-in is a different episode: it is never delayed, even with the maximum delay.
  const cutIn = evaluate(delayed, cutInScene, {
    state: state({ ...oldLeaderState, leaderHoldTicks: 100 }),
  });
  assert.equal(cutIn.episode, 'CUT_IN');
  assert(close(cutIn.committedTargetMps, 3.56, 1e-12));
});

test('171 following_hysteresis holds the commitment inside the tolerance band', () => {
  const noBand = followProfile({ following_hysteresis: 0 }),
    wideBand = followProfile({ following_hysteresis: 5 }),
    previous = state({
      leaderId: 'leader',
      leaderIncarnation: 1,
      committedTargetMps: 12.8,
    }),
    // The gap oscillates 2 m around the 21 m desired gap of a 10 m/s following scene.
    oscillation: FollowScene[] = Array.from({ length: 12 }, (_, index) => ({
      egoSpeed: 10,
      leadGap: index % 2 === 0 ? 25 : 21,
      leadSpeed: 10,
      leaderId: 'leader',
      leaderIncarnation: 1,
      cruiseTargetMps: 16,
    })),
    variation = (rows: readonly { committedTargetMps: number }[]) =>
      rows.reduce(
        (total, row, index) =>
          index === 0
            ? 0
            : total + Math.abs(row.committedTargetMps - rows[index - 1].committedTargetMps),
        0,
      ),
    held = evaluate(wideBand, oscillation[1], { state: previous }),
    adopted = evaluate(noBand, oscillation[1], { state: previous }),
    heldRows = run(wideBand, oscillation),
    adoptedRows = run(noBand, oscillation);
  assert.equal(held.episode, 'HYSTERESIS');
  assert.equal(held.bindingConstraint, 'HYSTERESIS');
  assert.equal(held.committedTargetMps, 12.8);
  assert.equal(held.hysteresisHeld, true);
  assert.equal(adopted.committedTargetMps, 10);
  assert.equal(adopted.hysteresisHeld, false);
  assert(variation(adoptedRows) > 2.5);
  assert.equal(variation(heldRows), 0);
  // Outside the band the preference is adopted again.
  const outside: FollowScene = { ...oscillation[1], leadGap: 30 };
  assert.equal(evaluate(wideBand, outside, { state: previous }).committedTargetMps, 16);
  // The band never overrides the safety floor.
  const unsafe: FollowScene = {
    egoSpeed: 10,
    leadGap: 4.5,
    leadSpeed: 0,
    leaderId: 'queue',
    leaderIncarnation: 1,
  };
  const floored = evaluate(wideBand, unsafe, {
    state: state({ leaderId: 'queue', leaderIncarnation: 1, committedTargetMps: 9 }),
  });
  assert.equal(floored.committedTargetMps, 0);
  assert.equal(floored.bindingConstraint, 'CONTACT_FLOOR');
});

test('171 each key is inert in the other three episodes', () => {
  const base = followProfile(),
    outcome = (
      profile: FollowPolicyProfile,
      scene: FollowScene,
      previous?: ReturnType<typeof state>,
    ) => {
      const row = evaluate(profile, scene, previous === undefined ? {} : { state: previous });
      return [
        row.committedTargetMps,
        row.episode,
        row.bindingConstraint,
        row.cutInFactor,
        row.hysteresisHeld,
        row.leaderHoldTicks,
        row.state.committedTargetMps,
        row.state.leaderHoldTicks,
      ];
    },
    cutInPrevious = state({ committedTargetMps: 12 });
  // Cut-in episode: only cutin_brake_response acts.
  for (const profile of [
    followProfile({ closing_ttc_threshold: 0.3 }),
    followProfile({ closing_ttc_threshold: 8 }),
    followProfile({ leader_change_delay: 2 }),
    followProfile({ following_hysteresis: 5 }),
  ])
    assert.deepEqual(
      outcome(profile, cutInScene, cutInPrevious),
      outcome(base, cutInScene, cutInPrevious),
    );
  assert.notDeepEqual(
    outcome(followProfile({ cutin_brake_response: 0.2 }), cutInScene, cutInPrevious),
    outcome(base, cutInScene, cutInPrevious),
  );
  // TTC episode: only closing_ttc_threshold acts.
  const closingPrevious = state({
    leaderId: 'leader',
    leaderIncarnation: 1,
    committedTargetMps: 15.26,
  });
  for (const profile of [
    followProfile({ cutin_brake_response: 0 }),
    followProfile({ leader_change_delay: 2 }),
    followProfile({ following_hysteresis: 5 }),
  ])
    assert.deepEqual(
      outcome(profile, closingScene, closingPrevious),
      outcome(base, closingScene, closingPrevious),
    );
  assert.notDeepEqual(
    outcome(followProfile({ closing_ttc_threshold: 8 }), closingScene, closingPrevious),
    outcome(base, closingScene, closingPrevious),
  );
  // Leader-change episode: only leader_change_delay acts.
  for (const profile of [
    followProfile({ cutin_brake_response: 0 }),
    followProfile({ closing_ttc_threshold: 8 }),
    followProfile({ following_hysteresis: 5 }),
  ])
    assert.deepEqual(
      outcome(profile, leaderChangeScene, oldLeaderState),
      outcome(base, leaderChangeScene, oldLeaderState),
    );
  assert.notDeepEqual(
    outcome(followProfile({ leader_change_delay: 2 }), leaderChangeScene, oldLeaderState),
    outcome(base, leaderChangeScene, oldLeaderState),
  );
  // Hysteresis episode: only following_hysteresis acts.
  const bandScene: FollowScene = {
      egoSpeed: 10,
      leadGap: 21,
      leadSpeed: 10,
      leaderId: 'leader',
      leaderIncarnation: 1,
      cruiseTargetMps: 16,
    },
    bandPrevious = state({
      leaderId: 'leader',
      leaderIncarnation: 1,
      committedTargetMps: 12.8,
    });
  for (const profile of [
    followProfile({ cutin_brake_response: 0 }),
    followProfile({ closing_ttc_threshold: 8 }),
    followProfile({ leader_change_delay: 2 }),
  ])
    assert.deepEqual(
      outcome(profile, bandScene, bandPrevious),
      outcome(base, bandScene, bandPrevious),
    );
  assert.notDeepEqual(
    outcome(followProfile({ following_hysteresis: 5 }), bandScene, bandPrevious),
    outcome(base, bandScene, bandPrevious),
  );
});

test('171 stop and the 5 m floor stay dominant over every key', () => {
  const aggressive = followProfile({
      cutin_brake_response: 0,
      closing_ttc_threshold: 8,
      leader_change_delay: 2,
      following_hysteresis: 5,
    }),
    previous = state({ committedTargetMps: 12, leaderHoldTicks: 100 }),
    stopped = evaluate(aggressive, { ...closingScene, stopRequired: true }, { state: previous }),
    insideFloor = evaluate(aggressive, { ...closingScene, leadGap: 3 }, { state: previous }),
    justOutside = evaluate(
      aggressive,
      { ...closingScene, egoSpeed: 12, leadGap: 6, leadSpeed: 0 },
      { state: previous },
    );
  assert.equal(stopped.committedTargetMps, 0);
  assert.equal(stopped.bindingConstraint, 'STOP_REQUIRED');
  assert.equal(insideFloor.committedTargetMps, 0);
  assert.equal(insideFloor.bindingConstraint, 'CONTACT_FLOOR');
  // At 1 m outside the floor the maximum threshold leaves at most (1 m / 8 s) of closing speed.
  assert(close(justOutside.committedTargetMps, 1 / 8, 1e-12));
  assert((justOutside.gapM! - 5) / justOutside.committedTargetMps >= 8);
  // Honouring the maximum threshold from 12 m/s at 30 m needs a comfortable deceleration.
  const gentle = evaluate(
      aggressive,
      { egoSpeed: 12, leadGap: 30, leadSpeed: 0, leaderId: 'queue', leaderIncarnation: 1 },
      { state: state({ leaderId: 'queue', leaderIncarnation: 1, committedTargetMps: 12 }) },
    ),
    requiredDecel = (12 ** 2 - gentle.committedTargetMps ** 2) / (2 * (30 - 5));
  assert(close(gentle.committedTargetMps, 25 / 8, 1e-12));
  assert(requiredDecel <= 3);
  // No key can lift the commitment above the delivered coverage or below zero.
  for (const row of [stopped, insideFloor, justOutside, gentle])
    assert(row.committedTargetMps >= 0 && row.committedTargetMps <= 30);
  // The cut-in response never brakes harder than the delivered following target.
  const cutIn = evaluate(aggressive, cutInScene, { state: previous });
  assert(cutIn.committedTargetMps >= followingFixture(cutInScene).target.targetMps);
});

test('171 keeps the 048 M keys, units and consequences unchanged', () => {
  const neutralDocument = followProfileDocument({}, '171-integration-v1'),
    activeDocument = followProfileDocument(
      {
        cutin_brake_response: 0.2,
        closing_ttc_threshold: 8,
        leader_change_delay: 2,
        following_hysteresis: 5,
      },
      '171-integration-v1',
    ),
    neutralFollowing = compileFollowingProfile(neutralDocument),
    activeFollowing = compileFollowingProfile(activeDocument),
    neutralPolicy = compileFollowPolicyProfile(neutralDocument),
    activePolicy = compileFollowPolicyProfile(activeDocument);
  assert.deepEqual(neutralFollowing.values, activeFollowing.values);
  assert.deepEqual(
    neutralFollowing.longitudinal.cruise.values,
    activeFollowing.longitudinal.cruise.values,
  );
  assert.equal(neutralPolicy.units.cutin_brake_response, 'ratio');
  assert.equal(neutralPolicy.units.closing_ttc_threshold, 's');
  assert.equal(neutralPolicy.units.leader_change_delay, 's');
  assert.equal(neutralPolicy.units.following_hysteresis, 'm');
  assert.equal(neutralFollowing.values.following_time_headway, 1.8);
  assert.equal(neutralFollowing.values.following_speed_gain, 0.7);
  const neutralFixture = createFollowingTargetFixture(
      neutralFollowing.longitudinal.cruise,
      scenario.actor,
      scenario.scope,
    ),
    activeFixture = createFollowingTargetFixture(
      activeFollowing.longitudinal.cruise,
      scenario.actor,
      scenario.scope,
    );
  let comparableTicks = 0,
    identicalFollowingTicks = 0,
    neutralForwardTicks = 0,
    activeDifferingTicks = 0,
    maxDifferenceMps = 0;
  try {
    let neutralState = state(),
      activeState = state();
    for (let tick = 1; tick <= 60; tick++) {
      const egoSpeed = 10,
        gap = tick <= 20 ? 20 : 45,
        leaderSpeed = tick <= 20 ? 5 : 14,
        leaderId = tick <= 20 ? 'lead-a' : 'lead-b',
        neutralInput = neutralFixture.input(tick, egoSpeed, gap, leaderSpeed, leaderId),
        activeInput = activeFixture.input(tick, egoSpeed, gap, leaderSpeed, leaderId),
        neutralResult = evaluateFollowingTarget({
          cruiseInput: neutralInput.cruiseInput,
          roadContext: neutralInput.roadContext,
          observation: neutralInput.observation,
          profile: neutralFollowing,
        }),
        activeResult = evaluateFollowingTarget({
          cruiseInput: activeInput.cruiseInput,
          roadContext: activeInput.roadContext,
          observation: activeInput.observation,
          profile: activeFollowing,
        });
      comparableTicks += 1;
      // The 048 M consequences are identical whatever the four R keys say.
      assert.deepEqual(activeResult, neutralResult);
      if (neutralResult.reason === 'FOLLOWING_GAP' || neutralResult.reason === 'QUEUE_GAP')
        identicalFollowingTicks += 1;
      const observation = {
          ...followObservation(
            {
              egoSpeed,
              leadGap: neutralResult.gapM,
              leadSpeed: leaderSpeed,
              leaderId,
              leaderIncarnation: neutralResult.leader!.incarnation,
            },
            tick,
          ),
        },
        neutralRow = evaluateFollowPolicy({
          ...scenario.scope,
          actor: scenario.actor,
          decisionTick: tick,
          authority: 'AUTO',
          profile: neutralPolicy,
          following: neutralResult,
          observation,
          previous: neutralState,
        }),
        activeRow = evaluateFollowPolicy({
          ...scenario.scope,
          actor: scenario.actor,
          decisionTick: tick,
          authority: 'AUTO',
          profile: activePolicy,
          following: neutralResult,
          observation,
          previous: activeState,
        });
      neutralState = neutralRow.state;
      activeState = activeRow.state;
      // The neutral R values forward exactly the 048 target, without any style episode.
      assert.equal(neutralRow.reason, 'FOLLOW_POLICY');
      assert.equal(neutralRow.bindingConstraint, 'FOLLOWING_TARGET');
      assert.equal(neutralRow.episode, 'LEADER_CHANGE');
      assert.equal(neutralRow.committedTargetMps, neutralResult.target.targetMps);
      neutralForwardTicks += 1;
      if (activeRow.committedTargetMps !== neutralRow.committedTargetMps) {
        activeDifferingTicks += 1;
        maxDifferenceMps = Math.max(
          maxDifferenceMps,
          Math.abs(activeRow.committedTargetMps - neutralRow.committedTargetMps),
        );
      }
    }
  } finally {
    neutralFixture.dispose();
    activeFixture.dispose();
  }
  assert.equal(comparableTicks, 60);
  assert.equal(identicalFollowingTicks, 60);
  assert.equal(neutralForwardTicks, 60);
  assert(activeDifferingTicks > 0);
  assert(maxDifferenceMps > 1);
});

test('171 refuses out-of-range values, wrong units and incomplete profiles', () => {
  assert.throws(() => followProfile({ cutin_brake_response: 1.5 }), /Expected finite number/);
  assert.throws(() => followProfile({ closing_ttc_threshold: 0.2 }), /Expected finite number/);
  assert.throws(() => followProfile({ leader_change_delay: 3 }), /Expected finite number/);
  assert.throws(() => followProfile({ following_hysteresis: 6 }), /Expected finite number/);
  const wrongUnit = followProfileDocument();
  (wrongUnit.unitsByParameter as Record<string, string>).following_hysteresis = 's';
  assert.throws(() => compileFollowPolicyProfile(wrongUnit), /Wrong unit for parameter/);
  for (const key of FOLLOW_POLICY_KEYS) {
    const incomplete = followProfileDocument();
    for (const map of [
      incomplete.parameters,
      incomplete.unitsByParameter,
      incomplete.provenanceByParameter,
      incomplete.evidenceByParameter,
    ])
      delete (map as Record<string, unknown>)[key];
    assert.throws(() => compileFollowPolicyProfile(incomplete), /Missing follow policy parameter/);
  }
});

test('171 diagnoses foreign, stale and mismatched inputs before any episode', () => {
  const profile = followProfile({ following_hysteresis: 5 }),
    tick = scenario.tick,
    following = followingFixture(closingScene, { tick }),
    observation = followObservation(closingScene, tick),
    base = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick: tick,
      authority: 'AUTO' as const,
      profile,
      following,
      observation,
      previous: state({
        leaderId: 'leader',
        leaderIncarnation: 1,
        committedTargetMps: 15.26,
      }),
    } satisfies FollowPolicyInput;
  assert.equal(evaluateFollowPolicy(base).reason, 'FOLLOW_POLICY');
  assert.equal(evaluateFollowPolicy({ ...base, authority: 'MANUAL' }).reason, 'NO_AUTO_AUTHORITY');
  assert.equal(evaluateFollowPolicy({ ...base, profile: null }).reason, 'MISSING_PROFILE');
  assert.equal(
    evaluateFollowPolicy({ ...base, observation: { ...observation, worldEpoch: 1 } }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateFollowPolicy({ ...base, observation: { ...observation, tick: tick + 1 } }).reason,
    'FOREIGN_OR_STALE_OBSERVATION',
  );
  assert.equal(
    evaluateFollowPolicy({ ...base, following: followingFixture(closingScene, { tick: tick + 1 }) })
      .reason,
    'FOREIGN_OR_STALE_FOLLOWING',
  );
  assert.equal(
    evaluateFollowPolicy({
      ...base,
      following: {
        ...following,
        target: { ...following.target, engineVersion: 'other-engine-v1' },
      },
    }).reason,
    'FOLLOWING_PROFILE_MISMATCH',
  );
  assert.equal(
    evaluateFollowPolicy({
      ...base,
      observation: { ...observation, leadGapM: observation.leadGapM! + 1 },
    }).reason,
    'FOLLOWING_OBSERVATION_MISMATCH',
  );
  assert.equal(
    evaluateFollowPolicy({
      ...base,
      following: { ...following, leader: null, gapM: null, desiredGapM: null },
      observation: {
        ...observation,
        leaderId: null,
        leaderIncarnation: null,
        leadGapM: null,
        leadSpeedMps: null,
      },
    }).reason,
    'FOLLOWING_OBSERVATION_MISMATCH',
  );
  // A genuine 048 decision that is not following is forwarded untouched, without the keys.
  const freeRoad = evaluateFollowPolicy({
    ...base,
    following: {
      ...following,
      reason: 'NO_LEADER',
      leader: null,
      gapM: null,
      desiredGapM: null,
      preferredFollowingMps: null,
      target: { ...following.target, targetMps: 13.9 },
    },
    observation: {
      ...observation,
      leaderId: null,
      leaderIncarnation: null,
      leadGapM: null,
      leadSpeedMps: null,
    },
  });
  assert.equal(freeRoad.reason, 'FOLLOWING_NOT_ACTIVE');
  assert.equal(freeRoad.committedTargetMps, 13.9);
  assert.equal(freeRoad.bindingConstraint, 'FOLLOWING_TARGET');
  assert.equal(freeRoad.cutInFactor, 1);
  // A refusal leaves the caller state untouched and commands no acceleration.
  const refused = evaluateFollowPolicy({ ...base, authority: 'MANUAL' });
  assert.equal(refused.committedTargetMps, 0);
  assert.deepEqual(refused.state, base.previous);
  assert.throws(
    () => evaluateFollowPolicy({ ...base, profile: {} as FollowPolicyProfile }),
    /profile token provenance/,
  );
  assert.throws(
    () => evaluateFollowPolicy({ ...base, previous: { ...base.previous, leaderHoldTicks: 121 } }),
    /leader hold exceeds its bound/,
  );
  assert.throws(
    () =>
      evaluateFollowPolicy({
        ...base,
        previous: { ...base.previous, leaderId: 'leader', leaderIncarnation: null },
      }),
    /Incomplete follow policy leader state/,
  );
  assert.throws(
    () =>
      evaluateFollowPolicy({
        ...base,
        observation: { ...observation, leaderIncarnation: null },
      }),
    /Incomplete follow policy leader facts/,
  );
});

test('171 is deterministic, frozen and keeps no hidden history', () => {
  const profile = followProfile({ cutin_brake_response: 0.4, following_hysteresis: 2 }),
    scenes = [cutInScene, settledScene, closingScene, leaderChangeScene],
    first = run(profile, scenes, { initial: state({ committedTargetMps: 12 }) }),
    second = run(profile, scenes, { initial: state({ committedTargetMps: 12 }) });
  assert.deepEqual(first, second);
  assert(Object.isFrozen(first[0]));
  assert(Object.isFrozen(first[0].state));
  assert(Object.isFrozen(first[0].actor));
  assert.equal(FOLLOW_POLICY_LIMITS.retainedHistory, 0);
  assert.equal(FOLLOW_POLICY_LIMITS.version, '171-follow-policy-v1');
  assert.deepEqual(FOLLOW_POLICY_KEYS, [
    'cutin_brake_response',
    'closing_ttc_threshold',
    'leader_change_delay',
    'following_hysteresis',
  ]);
});
