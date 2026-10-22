import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MISSION_LIMITS, missionInstanceId, missionRewardId } from '../../src/missions';
import type { MissionObjective, MissionTracker } from '../../src/missions';
import {
  MISSION_NAMESPACE,
  collision,
  createMissionTestBus,
  createMissionTestCatalog,
  createMissionTestTracker,
  dropoff,
  fullStop,
  leaderAcquired,
  manualStart,
  profileActivate,
  publishAll,
  realRideDropoffs,
  testMission,
} from './mission-fixture';

const MANUAL_OBJECTIVE: MissionObjective = {
  objectiveId: 'manual',
  kind: 'MANUAL_DROPOFFS',
  label: 'Manual ride',
  target: 1,
  difficultyTargets: { NORMAL: 1 },
  minDurationS: null,
  profileId: null,
};

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

test('116 start, real bus progress and completion grant rewards once', () => {
  const bus = createMissionTestBus();
  const tracker = createMissionTestTracker({ bus });
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 });
  assert.equal(started.duplicate, false);
  assert.equal(started.instance.state, 'ACTIVE');
  assert.equal(started.instance.attempt, 1);
  const repeatedStart = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 });
  assert.equal(repeatedStart.duplicate, true);
  assert.equal(repeatedStart.instance.instanceId, started.instance.instanceId);
  publishAll(bus, [
    manualStart('manual:1', 11, 'taxi:1'),
    dropoff('dropoff:1', 12, 'taxi:1', 'ride:1'),
  ]);
  const instance = tracker.instance(started.instance.instanceId)!;
  assert.equal(instance.state, 'COMPLETED');
  assert.equal(instance.completedTick, 12);
  assert.equal(instance.objectives[0]!.progress, 1);
  assert.equal(instance.objectives[0]!.satisfied, true);
  assert.equal(instance.rewardsGranted, 2);
  assert.equal(tracker.rewards().length, 2);
  assert.deepEqual(
    tracker.rewards().map((reward) => reward.kind),
    ['UNLOCK_CHALLENGE', 'XP'],
  );
  assert.equal(tracker.stats().duplicates, 0);
  assert(
    throws(
      () => tracker.start({ missionId: 'campaign-1-first-taxi', tick: 12 }),
      /already terminal/,
    ),
  );
  tracker.dispose();
  bus.dispose();
});

test('116 duplicate events never award progress or rewards twice', () => {
  const tracker = createMissionTestTracker();
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 });
  const manual = manualStart('manual:dup', 11, 'taxi:1');
  assert.equal(tracker.ingest(manual).status, 'IGNORED');
  assert.equal(tracker.ingest(manual).status, 'DUPLICATE');
  const event = dropoff('dropoff:dup', 12, 'taxi:1', 'ride:1');
  const first = tracker.ingest(event);
  assert.equal(first.status, 'ACCEPTED');
  assert.deepEqual(first.completed, [started.instance.instanceId]);
  assert.equal(first.rewardsGranted, 2);
  const rewardsAfterFirst = tracker.rewards().length;
  const second = tracker.ingest(event);
  assert.equal(second.status, 'DUPLICATE');
  assert.deepEqual(second.advanced, []);
  assert.deepEqual(second.completed, []);
  assert.equal(second.rewardsGranted, 0);
  assert.equal(tracker.rewards().length, rewardsAfterFirst);
  assert.equal(tracker.instance(started.instance.instanceId)!.state, 'COMPLETED');
  assert.equal(tracker.stats().duplicates, 2);
  assert(
    throws(
      () => tracker.ingest(dropoff('dropoff:dup', 13, 'taxi:2', 'ride:2')),
      /Conflicting mission event identity/,
    ),
  );
  tracker.dispose();
});

test('116 the evaluation window fails a mission before a late completion', () => {
  const catalog = createMissionTestCatalog([
    testMission({ missionId: 'windowed', windowTicks: 100 }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'windowed', tick: 0 });
  const advance = tracker.advance(101);
  assert.deepEqual(advance.expired, [started.instance.instanceId]);
  const failed = tracker.instance(started.instance.instanceId)!;
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.failureReason, 'EVALUATION_WINDOW_EXPIRED');
  assert.equal(failed.failedTick, 101);
  assert.equal(
    tracker.ingest(dropoff('dropoff:late', 102, 'taxi:1', 'ride:1')).completed.length,
    0,
  );
  assert.equal(tracker.instance(started.instance.instanceId)!.state, 'FAILED');
  assert.equal(tracker.rewards().length, 0);
  tracker.dispose();
});

test('116 the incident budget fails a mission without granting rewards', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'incidents',
      incidentBudget: 0,
      objectives: [
        {
          objectiveId: 'clean',
          kind: 'CLEAN_DROPOFFS',
          label: 'Clean ride',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'incidents', tick: 0 });
  const result = tracker.ingest(collision('collision:1', 1, 'taxi:1'));
  assert.deepEqual(result.failed, [started.instance.instanceId]);
  const instance = tracker.instance(started.instance.instanceId)!;
  assert.equal(instance.state, 'FAILED');
  assert.equal(instance.failureReason, 'INCIDENT_BUDGET_EXCEEDED');
  assert.equal(instance.incidents, 1);
  assert.equal(tracker.rewards().length, 0);
  tracker.dispose();
});

test('116 MANUAL progress needs a real MANUAL_START, not a LEARNING pass', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'manual-once',
      objectives: [{ ...MANUAL_OBJECTIVE, target: 2, difficultyTargets: { NORMAL: 2 } }],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'manual-once', tick: 0 });
  tracker.ingest(manualStart('manual:learning', 1, 'taxi:1', 'LEARNING'));
  tracker.ingest(dropoff('dropoff:learning', 2, 'taxi:1', 'ride:1'));
  assert.equal(tracker.instance(started.instance.instanceId)!.objectives[0]!.progress, 0);
  tracker.ingest(manualStart('manual:real-1', 3, 'taxi:1'));
  tracker.ingest(dropoff('dropoff:manual-1', 4, 'taxi:1', 'ride:2'));
  assert.equal(tracker.instance(started.instance.instanceId)!.objectives[0]!.progress, 1);
  tracker.ingest(manualStart('manual:real-2', 5, 'taxi:1'));
  tracker.ingest(dropoff('dropoff:manual-2', 6, 'taxi:1', 'ride:3'));
  const instance = tracker.instance(started.instance.instanceId)!;
  assert.equal(instance.state, 'COMPLETED');
  assert.equal(instance.objectives[0]!.progress, 2);
  tracker.dispose();
});

test('116 distinct profile versions count each real activation once', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'versions',
      objectives: [
        {
          objectiveId: 'versions',
          kind: 'DISTINCT_PROFILE_VERSIONS',
          label: 'Two published versions',
          target: 2,
          difficultyTargets: { NORMAL: 2 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'versions', tick: 0 });
  tracker.ingest(profileActivate('activation:1', 1, 'profile:test', 'version-1'));
  tracker.ingest(profileActivate('activation:2', 2, 'profile:test', 'version-1'));
  assert.equal(tracker.instance(started.instance.instanceId)!.objectives[0]!.progress, 1);
  tracker.ingest(profileActivate('activation:3', 3, 'profile:test', 'version-2'));
  assert.equal(tracker.instance(started.instance.instanceId)!.state, 'COMPLETED');
  tracker.dispose();
});

test('116 FULL_STOP and LEADER_ACQUIRED consume the real event payload values', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'stops',
      objectives: [
        {
          objectiveId: 'stops',
          kind: 'FULL_STOPS',
          label: 'Full stops',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: 1.5,
          profileId: null,
        },
      ],
    }),
    testMission({
      missionId: 'following',
      objectives: [
        {
          objectiveId: 'leader',
          kind: 'LEADER_ACQUIRED',
          label: 'Following',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const stops = tracker.start({ missionId: 'stops', tick: 0 });
  tracker.ingest(fullStop('stop:short', 1, 'taxi:1', 'opportunity:1', 0.5));
  assert.equal(tracker.instance(stops.instance.instanceId)!.objectives[0]!.progress, 0);
  tracker.ingest(fullStop('stop:long', 2, 'taxi:1', 'opportunity:2', 2.5));
  assert.equal(tracker.instance(stops.instance.instanceId)!.state, 'COMPLETED');
  const following = tracker.start({ missionId: 'following', tick: 2 });
  tracker.ingest(leaderAcquired('leader:1', 3, 'taxi:1', 'civilian:1', 24));
  assert.equal(tracker.instance(following.instance.instanceId)!.state, 'COMPLETED');
  tracker.dispose();
});

test('116 replay creates a new stable attempt and never duplicates rewards', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'replayable',
      objectives: [
        {
          ...testMission().objectives[0]!,
          target: 2,
          difficultyTargets: { NORMAL: 2 },
        },
      ],
      replay: {
        profileSource: 'SNAPSHOT',
        snapshotId: 'snapshot:replayable',
        scenarioId: 'scenario:replayable',
        comparisonProfileIds: ['profile:a', 'profile:b'],
      },
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const first = tracker.start({ missionId: 'replayable', tick: 0 });
  tracker.ingest(dropoff('dropoff:first', 1, 'taxi:1', 'ride:1'));
  assert.equal(tracker.instance(first.instance.instanceId)!.objectives[0]!.progress, 1);
  tracker.fail({ instanceId: first.instance.instanceId, reason: 'PLAYER_ABANDONED', tick: 5 });
  assert.equal(tracker.instance(first.instance.instanceId)!.state, 'FAILED');
  const replay = tracker.replay({ instanceId: first.instance.instanceId, tick: 6 });
  assert.equal(replay.instance.attempt, 2);
  assert.equal(replay.instance.replayedFrom, first.instance.instanceId);
  assert.equal(replay.instance.instanceId, missionInstanceId(MISSION_NAMESPACE, 'replayable', 2));
  assert.equal(replay.instance.state, 'ACTIVE');
  assert.equal(replay.instance.objectives[0]!.progress, 0);
  assert.equal(replay.instance.replay.profileSource, 'SNAPSHOT');
  assert.equal(replay.instance.replay.snapshotId, 'snapshot:replayable');
  assert.deepEqual(replay.instance.replay.comparisonProfileIds, ['profile:a', 'profile:b']);
  tracker.ingest(dropoff('dropoff:replay-1', 7, 'taxi:1', 'ride:2'));
  tracker.ingest(dropoff('dropoff:replay-2', 8, 'taxi:1', 'ride:3'));
  assert.equal(tracker.instance(replay.instance.instanceId)!.state, 'COMPLETED');
  assert.equal(tracker.rewards().length, 2);
  const third = tracker.replay({ instanceId: replay.instance.instanceId, tick: 9 }).instance;
  tracker.ingest(dropoff('dropoff:third-1', 10, 'taxi:1', 'ride:4'));
  tracker.ingest(dropoff('dropoff:third-2', 11, 'taxi:1', 'ride:5'));
  assert.equal(tracker.instance(third.instanceId)!.state, 'COMPLETED');
  assert.equal(tracker.rewards().length, 2);
  assert.equal(tracker.instance(third.instanceId)!.rewardsGranted, 0);
  assert.equal(tracker.stats().rewardsDuplicate, 2);
  tracker.dispose();
});

test('116 replay of an active or unknown instance is rejected', () => {
  const tracker = createMissionTestTracker();
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  assert(
    throws(() => tracker.replay({ instanceId: started.instance.instanceId, tick: 1 }), /terminal/),
  );
  assert(throws(() => tracker.replay({ instanceId: 'missing', tick: 1 }), /Unknown mission/));
  tracker.dispose();
});

test('116 prerequisites gate a campaign mission until the previous one completes', () => {
  const tracker = createMissionTestTracker();
  assert(
    throws(
      () => tracker.start({ missionId: 'campaign-2-first-demonstration', tick: 0 }),
      /prerequisite not completed/,
    ),
  );
  const first = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  tracker.ingest(manualStart('manual:prereq', 1, 'taxi:1'));
  tracker.ingest(dropoff('dropoff:prereq', 2, 'taxi:1', 'ride:1'));
  assert.equal(tracker.instance(first.instance.instanceId)!.state, 'COMPLETED');
  const second = tracker.start({ missionId: 'campaign-2-first-demonstration', tick: 2 });
  tracker.ingest(profileActivate('activation:prereq', 3, 'profile:test', 'version-1'));
  assert.equal(tracker.instance(second.instance.instanceId)!.state, 'COMPLETED');
  tracker.dispose();
});

test('116 difficulty selects a declared threshold without touching the style', () => {
  const objective: MissionObjective = {
    objectiveId: 'clean',
    kind: 'CLEAN_DROPOFFS',
    label: 'Clean rides',
    target: 3,
    difficultyTargets: { NORMAL: 3, EASY: 2, HARD: 4 },
    minDurationS: null,
    profileId: null,
  };
  const catalog = createMissionTestCatalog([
    testMission({ missionId: 'difficulty', objectives: [objective] }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const easy = tracker.start({ missionId: 'difficulty', difficulty: 'EASY', tick: 0 });
  assert.equal(easy.instance.difficulty, 'EASY');
  tracker.ingest(dropoff('dropoff:difficulty-1', 1, 'taxi:1', 'ride:1'));
  tracker.ingest(dropoff('dropoff:difficulty-2', 2, 'taxi:1', 'ride:2'));
  assert.equal(tracker.instance(easy.instance.instanceId)!.state, 'COMPLETED');
  assert.equal(tracker.instance(easy.instance.instanceId)!.objectives[0]!.target, 2);
  assert(
    throws(
      () => tracker.start({ missionId: 'difficulty', difficulty: 'HARD', tick: 3 }),
      /terminal/,
    ),
  );
  tracker.dispose();
});

test('116 snapshot and restore keep idempotency, progress and terminal state', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'snapshotted',
      objectives: [
        {
          ...testMission().objectives[0]!,
          target: 2,
          difficultyTargets: { NORMAL: 2 },
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'snapshotted', tick: 0 });
  tracker.ingest(dropoff('dropoff:snapshot', 1, 'taxi:1', 'ride:1'));
  const snapshot = tracker.snapshot();
  assert.equal(snapshot.instances.length, 1);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.instances[0]!.objectives[0]!.progress, 1);
  tracker.dispose();

  const restored = createMissionTestTracker({ catalog });
  restored.restore(snapshot);
  const instance = restored.instance(started.instance.instanceId)!;
  assert.equal(instance.state, 'ACTIVE');
  assert.equal(instance.objectives[0]!.progress, 1);
  assert.equal(
    restored.ingest(dropoff('dropoff:snapshot', 1, 'taxi:1', 'ride:1')).status,
    'DUPLICATE',
  );
  restored.ingest(dropoff('dropoff:snapshot-2', 2, 'taxi:1', 'ride:2'));
  assert.equal(restored.instance(started.instance.instanceId)!.state, 'COMPLETED');
  assert.equal(restored.rewards().length, 2);
  restored.dispose();

  const forged = createMissionTestTracker({ catalog });
  assert(
    throws(
      () =>
        forged.restore({
          ...snapshot,
          instances: [{ ...snapshot.instances[0]!, instanceId: 'forged-instance' }],
        }),
      /stable 006 identity/,
    ),
  );
  forged.dispose();

  const stale = createMissionTestTracker({ catalog });
  assert(
    throws(
      () =>
        stale.restore({
          ...snapshot,
          instances: snapshot.instances.map((entry) => ({
            ...entry,
            missionVersion: '999',
          })),
        }),
      /version does not match/,
    ),
  );
  stale.dispose();
});

test('116 restore keeps the per-vehicle manual and collision facts', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'facts-restore',
      incidentBudget: 2,
      objectives: [
        { ...MANUAL_OBJECTIVE },
        {
          objectiveId: 'clean',
          kind: 'CLEAN_DROPOFFS',
          label: 'Clean ride',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const tracker = createMissionTestTracker({ catalog });
  const started = tracker.start({ missionId: 'facts-restore', tick: 0 });
  tracker.ingest(manualStart('report:facts-manual', 1, 'taxi:facts'));
  tracker.ingest(collision('report:facts-collision', 2, 'taxi:facts'));
  const snapshot = tracker.snapshot();
  assert.deepEqual(snapshot.manualVehicles, ['taxi:facts']);
  assert.deepEqual(snapshot.collidedVehicles, ['taxi:facts']);
  tracker.dispose();

  const restored = createMissionTestTracker({ catalog });
  restored.restore(snapshot);
  restored.ingest(dropoff('report:facts-dropoff-1', 3, 'taxi:facts', 'ride:facts-1'));
  let instance = restored.instance(started.instance.instanceId)!;
  assert.equal(instance.objectives[0]!.progress, 1);
  assert.equal(instance.objectives[1]!.progress, 0);
  assert.equal(instance.incidents, 1);
  restored.ingest(dropoff('report:facts-dropoff-2', 4, 'taxi:facts', 'ride:facts-2'));
  instance = restored.instance(started.instance.instanceId)!;
  assert.equal(instance.state, 'COMPLETED');
  assert.equal(instance.objectives[1]!.progress, 1);
  restored.dispose();
});

test('116 reset keeps the reward and event ledgers across a scenario boundary', () => {
  const tracker = createMissionTestTracker();
  const first = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  tracker.ingest(manualStart('manual:reset', 1, 'taxi:1'));
  tracker.ingest(dropoff('dropoff:reset', 2, 'taxi:1', 'ride:1'));
  assert.equal(tracker.instance(first.instance.instanceId)!.state, 'COMPLETED');
  const rewardsBefore = tracker.rewards().length;
  const reset = tracker.reset({ tick: 100 });
  assert.equal(reset.clearedInstances, 1);
  assert.equal(tracker.instances().length, 0);
  assert.equal(tracker.rewards().length, rewardsBefore);
  assert.equal(tracker.stats().completed, 0);
  const again = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 100 });
  tracker.ingest(manualStart('manual:after-reset', 101, 'taxi:1'));
  tracker.ingest(dropoff('dropoff:after-reset', 102, 'taxi:1', 'ride:2'));
  assert.equal(tracker.instance(again.instance.instanceId)!.state, 'COMPLETED');
  assert.equal(tracker.rewards().length, rewardsBefore);
  assert.equal(tracker.instance(again.instance.instanceId)!.rewardsGranted, 0);
  tracker.dispose();
});

test('116 a new definition version has its own reward identity', () => {
  const versionOne = createMissionTestCatalog([testMission({ missionId: 'versioned' })]);
  const versionTwo = createMissionTestCatalog([
    testMission({ missionId: 'versioned', version: '2' }),
  ]);
  const first = createMissionTestTracker({ catalog: versionOne });
  first.start({ missionId: 'versioned', tick: 0 });
  first.ingest(dropoff('dropoff:version-1', 1, 'taxi:1', 'ride:1'));
  assert.equal(first.rewards().length, 2);
  const firstRewardIds = first.rewards().map((reward) => reward.rewardId);
  first.dispose();

  const second = createMissionTestTracker({ catalog: versionTwo });
  second.start({ missionId: 'versioned', tick: 0 });
  second.ingest(dropoff('dropoff:version-1', 1, 'taxi:1', 'ride:1'));
  assert.equal(second.rewards().length, 2);
  const unlock = second.rewards().find((reward) => reward.definitionRewardId === 'unlock')!;
  assert.equal(unlock.rewardId, missionRewardId(MISSION_NAMESPACE, 'versioned', '2', 'unlock'));
  assert.notEqual(unlock.rewardId, firstRewardIds[0]);
  second.dispose();
});

test('116 foreign worlds, stale ticks and disposal are rejected explicitly', () => {
  const foreignBus = createMissionTestBus();
  assert(
    throws(
      () =>
        createMissionTestTracker({
          bus: {
            ...foreignBus,
            getStats: () => ({ ...foreignBus.getStats(), sessionId: 'other-session' }),
          },
        }),
      /Foreign mission event bus world/,
    ),
  );
  foreignBus.dispose();

  const tracker = createMissionTestTracker();
  assert(
    throws(
      () =>
        tracker.ingest({
          ...dropoff('dropoff:foreign', 1, 'taxi:1', 'ride:1'),
          sessionId: 'other-session',
        }),
      /Foreign mission event world/,
    ),
  );
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 10 });
  assert(
    throws(
      () =>
        tracker.fail({
          instanceId: started.instance.instanceId,
          reason: 'PLAYER_ABANDONED',
          tick: 9,
        }),
      /Stale/,
    ),
  );
  assert(throws(() => tracker.advance(9), /Stale/));
  assert(
    throws(
      () => tracker.fail({ instanceId: started.instance.instanceId, reason: 'OTHER', tick: 10 }),
      /enum/i,
    ),
  );
  tracker.dispose();
  assert(
    throws(() => tracker.ingest(dropoff('dropoff:disposed', 1, 'taxi:1', 'ride:1')), /disposed/),
  );
  tracker.dispose();
  assert.equal(tracker.stats().disposed, true);
  assert.equal(tracker.instances().length, 0);
  assert.equal(tracker.rewards().length, 0);
});

test('116 real 061 rides completed by the real 063 module complete a mission', () => {
  const real = realRideDropoffs(3);
  try {
    const catalog = createMissionTestCatalog([
      testMission({
        missionId: 'real-rides',
        objectives: [
          {
            objectiveId: 'real-dropoffs',
            kind: 'DROPOFFS',
            label: 'Real rides',
            target: 3,
            difficultyTargets: { NORMAL: 3 },
            minDurationS: null,
            profileId: null,
          },
        ],
      }),
    ]);
    const bus = createMissionTestBus();
    const tracker: MissionTracker = createMissionTestTracker({ catalog, bus });
    const started = tracker.start({ missionId: 'real-rides', tick: 1 });
    for (const ride of real.dropoffs) {
      assert.equal(ride.decision.status, 'COMPLETED');
      assert(ride.decision.completion !== null);
      bus.publish(ride.event);
    }
    const instance = tracker.instance(started.instance.instanceId)!;
    assert.equal(instance.objectives[0]!.progress, 3);
    assert.equal(instance.state, 'COMPLETED');
    assert.equal(instance.appliedEvents, 3);
    assert.equal(tracker.rewards().length, 2);
    assert.equal(tracker.stats().acceptedEvents, 3);
    for (const ride of real.dropoffs) {
      assert.equal(ride.decision.completion!.rideId, ride.rideId);
      assert.equal(ride.decision.completion!.taxiId, ride.taxiId);
    }
    tracker.dispose();
    bus.dispose();
  } finally {
    real.dispose();
  }
});

test('116 a mission objective only advances from validated 007 event values', () => {
  const tracker = createMissionTestTracker();
  assert(
    throws(
      () =>
        tracker.ingest({
          ...manualStart('bad:auto', 0, 'taxi:1'),
          payload: { vehicleId: 'taxi:1', controlMode: 'AUTO' },
        }),
      /Manual intervention/,
    ),
  );
  assert(
    throws(
      () =>
        tracker.ingest({
          ...dropoff('bad:duplicate', 0, 'taxi:1', 'ride:1'),
          entityIds: ['taxi:1', 'taxi:1'],
        }),
      /Duplicate event entity IDs/,
    ),
  );
  const started = tracker.start({ missionId: 'campaign-1-first-taxi', tick: 0 });
  assert.equal(tracker.instance(started.instance.instanceId)!.appliedEvents, 0);
  tracker.dispose();
});

test('116 limits stay bounded for a synchronous tracker', () => {
  assert.equal(MISSION_LIMITS.activeInstances, 16);
  assert.equal(MISSION_LIMITS.retainedInstances, 64);
  assert.equal(MISSION_LIMITS.attemptsPerMission, 8);
  assert.equal(MISSION_LIMITS.retainedEvents, 8192);
  assert.equal(MISSION_LIMITS.eventCodeUnits, 1_048_576);
  assert.equal(MISSION_LIMITS.retainedRewards, 4096);
  assert.equal(MISSION_LIMITS.recentEventsPerInstance, 16);
  const tracker = createMissionTestTracker();
  assert.equal(tracker.stats().retainedEvents, 0);
  assert.equal(tracker.stats().retainedRewards, 0);
  tracker.dispose();
});
