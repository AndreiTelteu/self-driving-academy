import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MISSION_BASE_ACCESS,
  MISSION_BASE_CAPABILITIES,
  MISSION_REWARD_IDENTITY,
  REWARDS_LIMITS,
  REWARDS_SCHEMA_VERSION,
  campaignMissionStates,
  campaignOrder,
  createMissionRewardsLedger,
  missionCapabilityKinds,
  missionDuplicateReasons,
  missionInstanceId,
  missionRewardGrantStatuses,
  missionSettlementStatuses,
  missionVehicleAccess,
} from '../../src/missions';
import type { MissionInstance, MissionRewardsLedger, MissionTracker } from '../../src/missions';
import { createMissionTestTracker } from './mission-fixture';
import {
  REWARDS_FIXTURE_PROFILE_ID,
  REWARDS_FIXTURE_PROFILE_VERSION,
  completeCampaign,
  completeMission,
  completionTick,
  createRewardsFleet,
  createRewardsProfileStore,
  createRewardsTracker,
  replayMission,
  upgradedCampaignCatalog,
} from './mission-rewards-fixture';
import { runMissionRewardsReport } from './mission-rewards-report';

const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '125-mission-rewards', 'report.json');

/** The authored unlock of every campaign mission, in campaign order. */
const EXPECTED_UNLOCKS = Object.freeze([
  'challenge:first-demonstration',
  'analysis:learning-review',
  'challenge:following-comparison',
  'analysis:opportunity-review',
  'vehicle-class:comfort-sedan',
  'challenge:fleet-scenario',
  'analysis:version-comparison',
  'challenge:fleet-championship',
]);

function ledgerOf(tracker: MissionTracker): MissionRewardsLedger {
  return createMissionRewardsLedger({ catalog: tracker.catalog() });
}

function settleAll(
  ledger: MissionRewardsLedger,
  completions: readonly { readonly instance: MissionInstance }[],
) {
  return completions.map((completion) => ledger.settle({ instance: completion.instance }));
}

test('125 contract vocabulary, limits and reward identity are closed', () => {
  assert.equal(REWARDS_SCHEMA_VERSION, '125-mission-rewards-v1');
  assert.equal(REWARDS_LIMITS.version, REWARDS_SCHEMA_VERSION);
  assert.equal(REWARDS_LIMITS.missions, 32);
  assert.equal(REWARDS_LIMITS.completionsPerMission, 8);
  assert.equal(REWARDS_LIMITS.vehicles, 70);
  assert.deepEqual([...campaignMissionStates], ['LOCKED', 'AVAILABLE', 'COMPLETED']);
  assert.deepEqual([...missionSettlementStatuses], ['GRANTED', 'NO_REWARD', 'DUPLICATE']);
  assert.deepEqual([...missionRewardGrantStatuses], ['GRANTED', 'DUPLICATE']);
  assert.deepEqual(
    [...missionDuplicateReasons],
    ['COMPLETION_ALREADY_SETTLED', 'REWARD_ALREADY_GRANTED'],
  );
  assert.deepEqual(
    [...missionCapabilityKinds],
    ['BASE_ACCESS', 'CHALLENGE', 'VEHICLE_CLASS', 'ANALYSIS_TOOL'],
  );
  assert.equal(MISSION_REWARD_IDENTITY.id, 'MISSION_VERSION');
  assert.equal(
    MISSION_REWARD_IDENTITY.rewardKey,
    'namespace + missionId + definitionVersion + rewardId',
  );
  assert.equal(MISSION_REWARD_IDENTITY.completionKey, 'namespace + missionId + attempt');
  assert.equal(MISSION_REWARD_IDENTITY.replayGrants, false);
  assert.equal(MISSION_BASE_ACCESS.driveExistingVehicles, true);
  assert.equal(MISSION_BASE_ACCESS.selectAnyTaxi, true);
  assert.deepEqual(
    MISSION_BASE_CAPABILITIES.map((capability) => capability.capabilityId),
    [
      'access:drive-existing-vehicles',
      'access:select-any-taxi',
      'vehicle-class:sedan',
      'vehicle-class:compact',
    ],
  );
  assert.ok(MISSION_BASE_CAPABILITIES.every((capability) => capability.source === 'BASE'));
  assert.ok(MISSION_BASE_CAPABILITIES.every((capability) => capability.order === 0));
});

test('125 campaign progress, unlocks and rewards stay three separate read models', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const start = ledger.progress();
    assert.equal(start.counts.missions, 8);
    assert.equal(start.counts.completed, 0);
    assert.equal(start.counts.available, 1);
    assert.equal(start.counts.locked, 7);
    assert.equal(start.nextMissionId, 'campaign-1-first-taxi');
    assert.deepEqual([...start.order], campaignOrder(tracker.catalog()));
    assert.equal(start.missions[0]?.state, 'AVAILABLE');
    assert.equal(start.missions[0]?.playable, true);
    assert.equal(start.missions[1]?.state, 'LOCKED');
    assert.deepEqual([...start.missions[1]!.missingPrerequisites], ['campaign-1-first-taxi']);
    assert.equal(start.missions[1]?.nextAttempt, 1);

    const fresh = ledger.rewards();
    assert.equal(fresh.grants.length, 0);
    assert.equal(fresh.totals.granted, 0);
    assert.equal(fresh.totals.xp, 0);
    const freshUnlocks = ledger.unlocks();
    assert.equal(freshUnlocks.counts.base, 4);
    assert.equal(freshUnlocks.counts.granted, 0);
    assert.deepEqual([...freshUnlocks.byKind.CHALLENGE], []);
    assert.deepEqual([...freshUnlocks.byKind.ANALYSIS_TOOL], []);
    assert.deepEqual(
      [...freshUnlocks.byKind.VEHICLE_CLASS],
      ['vehicle-class:sedan', 'vehicle-class:compact'],
    );

    const instance = completeMission(tracker, 'campaign-1-first-taxi', 100);
    const settled = ledger.settle({ instance });
    assert.equal(settled.status, 'GRANTED');
    assert.equal(settled.rewardsGranted, 2);
    assert.equal(settled.rewardsDuplicate, 0);
    assert.equal(settled.xpGranted, 100);
    assert.deepEqual([...settled.unlocked], ['challenge:first-demonstration']);

    const progress = ledger.progress();
    assert.equal(progress.counts.completed, 1);
    assert.equal(progress.missions[0]?.state, 'COMPLETED');
    assert.equal(progress.missions[0]?.attempts, 1);
    assert.equal(progress.missions[0]?.nextAttempt, 2);
    assert.equal(progress.missions[0]?.rewardsGranted, 2);
    assert.deepEqual(
      [...progress.missions[0]!.unlockedCapabilities],
      ['challenge:first-demonstration'],
    );
    assert.equal(progress.missions[1]?.state, 'AVAILABLE');
    assert.equal(progress.missions[1]?.playable, true);

    const rewards = ledger.rewards();
    assert.equal(rewards.grants.length, 2);
    assert.equal(rewards.totals.xp, 100);
    assert.equal(rewards.totals.unlocks, 1);
    assert.deepEqual(
      rewards.grants.map((grant) => grant.definitionRewardId),
      ['xp', 'unlock-challenge'],
    );
    assert.equal(rewards.byMission.length, 1);
    assert.equal(rewards.byMission[0]?.missionId, 'campaign-1-first-taxi');

    const unlocks = ledger.unlocks();
    assert.equal(unlocks.counts.granted, 1);
    assert.equal(unlocks.counts.total, 5);
    assert.deepEqual([...unlocks.byKind.CHALLENGE], ['challenge:first-demonstration']);
    // The three answers are distinct objects, not one opaque bag.
    assert.equal(Object.hasOwn(progress, 'grants'), false);
    assert.equal(Object.hasOwn(rewards, 'missions'), false);
    assert.equal(Object.hasOwn(unlocks, 'grants'), false);
    assert.equal(unlocks.monotone, true);
  } finally {
    tracker.dispose();
  }
});

test('125 a repeated completion never pays twice, and a replay is reported explicitly', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const first = completeMission(tracker, 'campaign-1-first-taxi', 100);
    const granted = ledger.settle({ instance: first });
    assert.equal(granted.status, 'GRANTED');
    assert.equal(ledger.rewards().totals.xp, 100);

    // The same real instance delivered twice: same completion identity, nothing changes.
    const repeated = ledger.settle({ instance: first });
    assert.equal(repeated.status, 'DUPLICATE');
    assert.equal(repeated.rewardsGranted, 0);
    assert.equal(repeated.rewardsDuplicate, 2);
    assert.equal(repeated.xpGranted, 0);
    assert.deepEqual([...repeated.unlocked], []);
    assert.deepEqual([...repeated.duplicateReasons], ['COMPLETION_ALREADY_SETTLED']);
    assert.ok(repeated.rewards.every((row) => row.status === 'DUPLICATE'));
    assert.ok(repeated.rewards.every((row) => row.reason === 'COMPLETION_ALREADY_SETTLED'));
    assert.equal(ledger.rewards().grants.length, 2);
    assert.equal(ledger.rewards().totals.xp, 100);
    assert.equal(ledger.unlocks().counts.granted, 1);

    // A real 116 replay is a new completion, but the authored reward belongs to the version.
    const replay = replayMission(tracker, first, 200);
    assert.equal(replay.attempt, 2);
    assert.notEqual(replay.instanceId, first.instanceId);
    const settledReplay = ledger.settle({ instance: replay });
    assert.equal(settledReplay.status, 'NO_REWARD');
    assert.equal(settledReplay.rewardsGranted, 0);
    assert.equal(settledReplay.rewardsDuplicate, 2);
    assert.equal(settledReplay.xpGranted, 0);
    assert.deepEqual([...settledReplay.duplicateReasons], ['REWARD_ALREADY_GRANTED']);
    assert.ok(settledReplay.rewards.every((row) => row.reason === 'REWARD_ALREADY_GRANTED'));
    assert.equal(ledger.rewards().grants.length, 2);
    assert.equal(ledger.rewards().totals.xp, 100);
    assert.equal(ledger.rewards().totals.duplicates, 4);
    assert.equal(ledger.unlocks().counts.granted, 1);

    const progress = ledger.progress().missions[0]!;
    assert.equal(progress.attempts, 2);
    assert.deepEqual(
      progress.completions.map((completion) => completion.attempt),
      [1, 2],
    );
    assert.equal(progress.lastCompletedTick, replay.completedTick);
  } finally {
    tracker.dispose();
  }
});

test('125 a new completion and a new definition version are granted normally', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const run = completeCampaign(tracker, { through: 'campaign-2-first-demonstration' });
    const settled = settleAll(ledger, run.completions);
    assert.deepEqual(
      settled.map((result) => result.status),
      ['GRANTED', 'GRANTED'],
    );
    assert.deepEqual([...settled[1]!.unlocked], ['analysis:learning-review']);
    assert.equal(settled[1]!.xpGranted, 100);
    assert.equal(ledger.rewards().grants.length, 4);
    assert.equal(ledger.rewards().totals.xp, 200);
    assert.equal(ledger.progress().counts.completed, 2);

    const upgraded = upgradedCampaignCatalog();
    assert.equal(upgraded.missions[0]?.version, '2');
    const upgradedLedger = createMissionRewardsLedger({ catalog: upgraded });
    const upgradedTracker = createMissionTestTracker({ catalog: upgraded });
    try {
      const instance = completeMission(upgradedTracker, 'campaign-1-first-taxi', 100);
      assert.equal(instance.missionVersion, '2');
      const result = upgradedLedger.settle({ instance });
      assert.equal(result.status, 'GRANTED');
      assert.equal(result.missionVersion, '2');
      assert.equal(result.rewardsGranted, 2);
      assert.equal(result.xpGranted, 100);
      assert.deepEqual([...result.unlocked], ['challenge:first-demonstration']);
      const v1 = ledger.rewards().grants[0]!;
      const v2 = upgradedLedger.rewards().grants[0]!;
      assert.notEqual(v2.rewardId, v1.rewardId);
      assert.equal(v2.definitionRewardId, v1.definitionRewardId);
    } finally {
      upgradedTracker.dispose();
    }
  } finally {
    tracker.dispose();
  }
});

test('125 a mission reset restores playable progress without deleting rewards or unlocks', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const run = completeCampaign(tracker, { through: 'campaign-5-passenger' });
    settleAll(ledger, run.completions);
    const rewardsBefore = ledger.rewards();
    const unlocksBefore = ledger.unlocks();
    assert.equal(rewardsBefore.grants.length, 10);
    assert.equal(rewardsBefore.totals.xp, 500);
    assert.equal(unlocksBefore.counts.granted, 5);
    assert.deepEqual(
      [...unlocksBefore.byKind.VEHICLE_CLASS],
      ['vehicle-class:sedan', 'vehicle-class:compact', 'vehicle-class:comfort-sedan'],
    );

    const last = run.completions.at(-1)!.instance;
    const reset = ledger.resetMission({
      missionId: 'campaign-5-passenger',
      tick: completionTick(last) + 1,
    });
    assert.equal(reset.clearedCompletions, 1);
    assert.equal(reset.resets, 1);
    assert.equal(reset.rewardsRetained, rewardsBefore.grants.length);
    assert.equal(reset.unlocksRetained, unlocksBefore.counts.granted);
    assert.equal(reset.profileWrites, 0);
    assert.equal(reset.progress.state, 'AVAILABLE');
    assert.equal(reset.progress.attempts, 0);
    assert.equal(reset.progress.nextAttempt, 1);
    assert.equal(reset.progress.playable, true);
    assert.deepEqual([...reset.progress.completions], []);
    assert.equal(reset.progress.rewardsGranted, 2);
    assert.deepEqual([...reset.progress.unlockedCapabilities], ['vehicle-class:comfort-sedan']);

    // Rewards and unlocks are byte-identical after the reset: nothing was deleted.
    assert.equal(JSON.stringify(ledger.rewards()), JSON.stringify(rewardsBefore));
    assert.equal(JSON.stringify(ledger.unlocks()), JSON.stringify(unlocksBefore));
    assert.equal(ledger.progress().counts.completed, 4);
    assert.equal(ledger.progress().missions[4]?.state, 'AVAILABLE');
    assert.equal(ledger.progress().missions[4]?.resets, 1);
    assert.equal(ledger.progress().missions[3]?.state, 'COMPLETED');

    // A downstream mission that was only available returns to LOCKED, and nothing else changes.
    const downstream = createRewardsTracker();
    const downstreamLedger = ledgerOf(downstream);
    try {
      const firstOnly = completeCampaign(downstream, { through: 'campaign-1-first-taxi' });
      settleAll(downstreamLedger, firstOnly.completions);
      assert.equal(downstreamLedger.progress().missions[1]?.state, 'AVAILABLE');
      downstreamLedger.resetMission({ missionId: 'campaign-1-first-taxi', tick: 400 });
      const locked = downstreamLedger.progress();
      assert.equal(locked.missions[0]?.state, 'AVAILABLE');
      assert.equal(locked.missions[1]?.state, 'LOCKED');
      assert.deepEqual([...locked.missions[1]!.missingPrerequisites], ['campaign-1-first-taxi']);
      assert.equal(locked.missions[1]?.playable, false);
      assert.equal(downstreamLedger.rewards().grants.length, 2);
    } finally {
      downstream.dispose();
    }
  } finally {
    tracker.dispose();
  }
});

test('125 a reset never re-grants a reward and never touches a real profile store', () => {
  const store = createRewardsProfileStore();
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const before = store.stats();
    assert.equal(before.versions, 1);
    assert.equal(before.profiles, 1);

    const run = completeCampaign(tracker, { through: 'campaign-3-following-distance' });
    const settled = settleAll(ledger, run.completions);
    assert.ok(settled.every((result) => result.profileWrites === 0));
    const replay = replayMission(tracker, run.completions[0]!.instance, run.nextTick);
    const replayResult = ledger.settle({ instance: replay });
    assert.equal(replayResult.status, 'NO_REWARD');
    assert.equal(replayResult.profileWrites, 0);
    assert.equal(ledger.rewards().totals.xp, 300);
    // Reset the two missions that will be replayed; rewards and unlocks stay.
    const resetThird = ledger.resetMission({
      missionId: 'campaign-3-following-distance',
      tick: 800,
    });
    const resetFirst = ledger.resetMission({ missionId: 'campaign-1-first-taxi', tick: 801 });
    assert.equal(resetThird.profileWrites, 0);
    assert.equal(resetFirst.profileWrites, 0);
    const xpAfterReset = ledger.rewards().totals.xp;
    assert.equal(xpAfterReset, 300);
    assert.equal(ledger.unlocks().counts.granted, 3);

    // The scenario boundary also resets the 116 tracker, so the mission starts at attempt 1 again.
    tracker.reset({ tick: 900 });
    const again = completeMission(tracker, 'campaign-1-first-taxi', 1_000);
    assert.equal(again.attempt, 1);
    const regrant = ledger.settle({ instance: again });
    assert.equal(regrant.status, 'NO_REWARD');
    assert.equal(regrant.rewardsGranted, 0);
    assert.equal(regrant.rewardsDuplicate, 2);
    assert.equal(ledger.rewards().totals.xp, xpAfterReset);
    assert.equal(ledger.rewards().grants.length, 6);
    assert.equal(ledger.progress().missions[0]?.state, 'COMPLETED');

    const after = store.stats();
    assert.equal(after.versions, before.versions);
    assert.equal(after.profiles, before.profiles);
    assert.notEqual(store.getVersion(REWARDS_FIXTURE_PROFILE_VERSION), null);
    assert.equal(store.getHistory(REWARDS_FIXTURE_PROFILE_ID).length, 1);
  } finally {
    tracker.dispose();
    store.dispose();
  }
});

test('125 existing vehicles and taxi selection remain accessible after every unlock', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  const fleet = createRewardsFleet();
  try {
    const totals = fleet.counts();
    assert.equal(totals.taxis, 24);
    assert.equal(totals.civilians, 40);
    assert.equal(totals.vehicles, 64);
    const baseAccess = missionVehicleAccess(ledger.unlocks(), fleet.list());
    assert.equal(baseAccess.vehiclesDriveable, totals.vehicles);
    assert.equal(baseAccess.taxisSelectable, totals.taxis);
    assert.equal(baseAccess.vehicles, totals.vehicles);
    assert.equal(baseAccess.civilians, totals.civilians);
    assert.equal(baseAccess.baseCapabilitiesPresent, true);
    assert.deepEqual([...baseAccess.revoked], []);
    assert.deepEqual([...baseAccess.blockedTaxis], []);
    assert.ok(baseAccess.byClass.every((row) => row.driveable === row.vehicles));

    const ids = campaignOrder(tracker.catalog());
    let nextTick = 100;
    const seen: string[] = [];
    for (const [index, missionId] of ids.entries()) {
      const instance = completeMission(tracker, missionId, nextTick);
      nextTick = completionTick(instance) + 10;
      const settled = ledger.settle({ instance });
      assert.equal(settled.status, 'GRANTED');
      seen.push(...settled.unlocked);
      const unlocks = ledger.unlocks();
      assert.equal(unlocks.counts.granted, seen.length);
      const access = missionVehicleAccess(unlocks, fleet.list());
      const checkpoint = `after ${missionId}`;
      assert.equal(access.vehiclesDriveable, totals.vehicles, checkpoint);
      assert.equal(access.taxisSelectable, totals.taxis, checkpoint);
      assert.equal(access.baseCapabilitiesPresent, true, checkpoint);
      assert.deepEqual([...access.revoked], [], checkpoint);
      assert.deepEqual([...access.blockedTaxis], [], checkpoint);
      assert.equal(access.rows.length, totals.vehicles, checkpoint);
      assert.ok(
        access.rows.every((row) => row.driveable),
        checkpoint,
      );
      for (const capability of MISSION_BASE_CAPABILITIES)
        assert.ok(
          [...unlocks.base, ...unlocks.capabilities].some(
            (candidate) => candidate.capabilityId === capability.capabilityId,
          ),
          `${checkpoint}: ${capability.capabilityId}`,
        );
      assert.ok(
        access.byClass.every((row) => row.driveable === row.vehicles),
        `${checkpoint}: every class keeps every vehicle`,
      );
      assert.equal(index + 1, unlocks.counts.granted);
    }
    assert.deepEqual(seen, [...EXPECTED_UNLOCKS]);
    assert.ok(ledger.unlocks().byKind.VEHICLE_CLASS.includes('vehicle-class:comfort-sedan'));
  } finally {
    fleet.dispose();
    tracker.dispose();
  }
});

test('125 the unlock order is the campaign order and never shrinks', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    const ids = campaignOrder(tracker.catalog());
    const prefixes: string[][] = [];
    let nextTick = 100;
    for (const missionId of ids) {
      const instance = completeMission(tracker, missionId, nextTick);
      nextTick = completionTick(instance) + 10;
      const result = ledger.settle({ instance });
      prefixes.push(ledger.unlocks().capabilities.map((capability) => capability.capabilityId));
      assert.equal(result.unlocked.length, 1);
      assert.deepEqual([...result.unlocked], [EXPECTED_UNLOCKS[prefixes.length - 1]]);
    }
    prefixes.forEach((prefix, index) => {
      assert.deepEqual(prefix, EXPECTED_UNLOCKS.slice(0, index + 1));
      for (let previous = 0; previous < index; previous += 1)
        assert.equal(prefix[previous], prefixes[previous]![previous]);
    });
    const unlocks = ledger.unlocks();
    assert.deepEqual(
      unlocks.capabilities.map((capability) => capability.order),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(
      unlocks.capabilities.map((capability) => capability.kind),
      [
        'CHALLENGE',
        'ANALYSIS_TOOL',
        'CHALLENGE',
        'ANALYSIS_TOOL',
        'VEHICLE_CLASS',
        'CHALLENGE',
        'ANALYSIS_TOOL',
        'CHALLENGE',
      ],
    );
    assert.equal(unlocks.counts.total, 12);
    assert.deepEqual(
      [...unlocks.byKind.CHALLENGE],
      [
        'challenge:first-demonstration',
        'challenge:following-comparison',
        'challenge:fleet-scenario',
        'challenge:fleet-championship',
      ],
    );
    assert.deepEqual(
      [...unlocks.byKind.ANALYSIS_TOOL],
      ['analysis:learning-review', 'analysis:opportunity-review', 'analysis:version-comparison'],
    );
  } finally {
    tracker.dispose();
  }
});

test('125 refuses invalid completions, invalid resets and invalid fleet input', () => {
  const tracker = createRewardsTracker();
  const ledger = ledgerOf(tracker);
  try {
    tracker.start({ missionId: 'campaign-1-first-taxi', tick: 100 });
    const active = tracker.instances()[0]!;
    assert.equal(active.state, 'ACTIVE');
    assert.throws(() => ledger.settle({}), /Missing mission completion field: instance/);
    assert.throws(() => ledger.settle({ instance: active }), /completed 116 instance/);
    const first = completeMission(tracker, 'campaign-1-first-taxi', 100);
    assert.throws(
      () => ledger.settle({ instance: { ...first, instanceId: 'id-v1:forged' } }),
      /stable 116 instance identity/,
    );
    assert.throws(
      () => ledger.settle({ instance: { ...first, state: 'ACTIVE' } }),
      /completed 116 instance/,
    );
    assert.throws(
      () => ledger.settle({ instance: { ...first, attempt: 2 } }),
      /not the next attempt|stable 116 instance identity/,
    );
    assert.throws(
      () => ledger.settle({ instance: { ...first, missionVersion: '9' } }),
      /does not match the catalog/,
    );
    const unknownInstanceId = missionInstanceId(
      tracker.catalog().namespace,
      'campaign-9-unknown',
      1,
    );
    assert.throws(
      () =>
        ledger.settle({
          instance: {
            ...first,
            missionId: 'campaign-9-unknown',
            instanceId: unknownInstanceId,
          },
        }),
      /Unknown mission definition/,
    );
    assert.throws(
      () => ledger.settle({ instance: first, score: 1 }),
      /Unknown mission completion field/,
    );
    assert.throws(() => ledger.settle({ instance: null }), /Expected object/);
    ledger.settle({ instance: first });
    assert.throws(
      () => ledger.settle({ instance: { ...first, completedTick: completionTick(first) + 1 } }),
      /Conflicting mission completion identity/,
    );
    const second = completeMission(tracker, 'campaign-2-first-demonstration', 300);
    ledger.settle({ instance: second });
    const third = completeMission(tracker, 'campaign-3-following-distance', 400);
    assert.throws(
      () => ledger.settle({ instance: { ...third, completedTick: 200 } }),
      /Stale mission completion tick/,
    );
    assert.throws(
      () => ledger.resetMission({ missionId: 'campaign-9-unknown', tick: 500 }),
      /Unknown mission definition/,
    );
    assert.throws(
      () => ledger.resetMission({ missionId: 'campaign-1-first-taxi' }),
      /Missing mission reset field: tick/,
    );
    assert.throws(
      () => ledger.resetMission({ missionId: 'campaign-1-first-taxi', tick: 1 }),
      /Stale mission reset tick/,
    );
    assert.throws(
      () => ledger.resetMission({ missionId: 'campaign-1-first-taxi', tick: 500, extra: true }),
      /Unknown mission reset field: extra/,
    );

    const unlocks = ledger.unlocks();
    assert.throws(
      () =>
        missionVehicleAccess(unlocks, [
          { vehicleId: 'vehicle:1', driverKind: 'ROBOT', classId: 'sedan' },
        ]),
      /Unsupported enum value/,
    );
    assert.throws(
      () =>
        missionVehicleAccess(unlocks, [
          { vehicleId: 'vehicle:1', driverKind: 'TAXI', classId: 'tank' },
        ]),
      /Unsupported enum value/,
    );
    assert.throws(
      () =>
        missionVehicleAccess(
          unlocks,
          Array.from({ length: 71 }, (_, index) => ({
            vehicleId: `vehicle:${index}`,
            driverKind: 'TAXI',
            classId: 'sedan',
          })),
        ),
      /057 fleet capacity/,
    );
  } finally {
    tracker.dispose();
  }
});

test('125 is deterministic, immutable and read-only', () => {
  const first = createRewardsTracker();
  const firstLedger = ledgerOf(first);
  const second = createRewardsTracker();
  const secondLedger = ledgerOf(second);
  try {
    const firstRun = completeCampaign(first);
    const secondRun = completeCampaign(second);
    settleAll(firstLedger, firstRun.completions);
    settleAll(secondLedger, secondRun.completions);
    assert.equal(JSON.stringify(firstLedger.progress()), JSON.stringify(secondLedger.progress()));
    assert.equal(JSON.stringify(firstLedger.rewards()), JSON.stringify(secondLedger.rewards()));
    assert.equal(JSON.stringify(firstLedger.unlocks()), JSON.stringify(secondLedger.unlocks()));
    const progress = firstLedger.progress();
    const rewards = firstLedger.rewards();
    const unlocks = firstLedger.unlocks();
    assert.equal(Object.isFrozen(progress), true);
    assert.equal(Object.isFrozen(progress.missions), true);
    assert.equal(Object.isFrozen(progress.missions[0]), true);
    assert.equal(Object.isFrozen(progress.missions[0]?.prerequisites), true);
    assert.equal(Object.isFrozen(rewards), true);
    assert.equal(Object.isFrozen(rewards.grants), true);
    assert.equal(Object.isFrozen(unlocks), true);
    assert.equal(Object.isFrozen(unlocks.base), true);
    assert.equal(Object.isFrozen(unlocks.capabilities), true);
    assert.equal(firstLedger.stats().rewards, 16);
    assert.equal(firstLedger.stats().capabilities, 8);
    assert.equal(firstLedger.stats().completions, 8);
    assert.equal(firstLedger.stats().tick, completionTick(firstRun.completions.at(-1)!.instance));
    const settleResult = settleAll(firstLedger, firstRun.completions)[0]!;
    assert.equal(settleResult.profileWrites, 0);
    assert.equal(settleResult.learningJobs, 0);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('125 report transcript is deterministic and matches the saved evidence', async () => {
  const report = await runMissionRewardsReport();
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, readFileSync(EVIDENCE, 'utf8'));
});
