import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_MISSIONS_VERSION,
  createLiveMissions,
  type LiveMissionAuthorityFact,
  type LiveMissionFollowEpisodeFact,
  type LiveMissionHealthFact,
  type LiveMissionModesSnapshot,
  type LiveMissionRidesSnapshot,
  type LiveMissionSelectionFact,
} from '../../src/app';
import {
  createCampaignMissionCatalog,
  createMissionRewardsLedger,
  createMissionTracker,
} from '../../src/missions';
import { projectMissionPanel } from '../../src/ui';
import { createMissionTestCatalog, testMission } from './mission-fixture';

const SESSION = 'session-275-live-missions';
const EPOCH = 1;

interface Harness {
  readonly runtime: ReturnType<typeof createLiveMissions>;
  readonly state: {
    authority: LiveMissionAuthorityFact;
    selection: LiveMissionSelectionFact | null;
    modes: LiveMissionModesSnapshot;
    rides: LiveMissionRidesSnapshot;
    health: LiveMissionHealthFact[];
    follow: LiveMissionFollowEpisodeFact[];
  };
  step(tick: number): ReturnType<ReturnType<typeof createLiveMissions>['step']>;
  dispose(): void;
}

function harness(catalog?: unknown): Harness {
  const state: Harness['state'] = {
    authority: { tick: 0, playerVehicleId: null, mode: 'AUTO', suspended: false },
    selection: null,
    modes: { segments: [] },
    rides: { rides: [] },
    health: [],
    follow: [],
  };
  const runtime = createLiveMissions({
    ...(catalog === undefined ? {} : { catalog }),
    ports: {
      modes: () => state.modes,
      rides: () => state.rides,
      health: () => state.health,
      follow: () => state.follow,
      authority: () => state.authority,
      selection: () => state.selection,
    },
  });
  runtime.beginSession({ sessionId: SESSION, worldEpoch: EPOCH, tick: 1, kind: 'ACADEMY' });
  return {
    runtime,
    state,
    step: (tick: number) => {
      state.authority = Object.freeze({ ...state.authority, tick });
      return runtime.step({ sessionId: SESSION, worldEpoch: EPOCH, tick });
    },
    dispose: () => runtime.dispose(),
  };
}

function unit(fact: string) {
  return fact;
}

test('275 live campaign starts stage 1 and the five-step tutorial without learning', () => {
  const h = harness();
  try {
    const status = h.runtime.status();
    assert.equal(status.version, LIVE_MISSIONS_VERSION);
    assert.equal(status.campaign.missions, 8);
    assert.equal(status.campaign.completed, 0);
    assert.equal(status.activeMissionId, 'campaign-1-first-taxi');
    assert.equal(status.tutorial.state, 'ACTIVE');
    assert.equal(status.tutorial.stepId, 'SELECT_TAXI');
    assert.equal(status.tutorial.learningGate, 'TUTORIAL_BLOCKS_LEARNING');
    assert.equal(status.tutorial.learningJobs, 0);
    assert.equal(status.tutorial.profileVersions, 0);
    assert.equal(status.profileWrites, 0);
    assert.equal(status.xpDelta, 0);
    assert.equal(status.rewards.totals.xp, 0);
    const snapshot = h.runtime.snapshot()!;
    assert.equal(snapshot.missions.length, 8);
    const first = snapshot.missions.find((entry) => entry.missionId === 'campaign-1-first-taxi')!;
    assert.equal(first.state, 'AVAILABLE');
    assert.equal(first.attempt?.state, 'ACTIVE');
    assert.equal(first.attempt?.windowTicks, null);
    assert.equal(first.attempt?.incidentBudget, null);
    assert.equal(first.replay.profileSource, 'CURRENT');
    assert.equal(h.runtime.tutorialSnapshot()?.stepId, 'SELECT_TAXI');
  } finally {
    h.dispose();
  }
});

test('275 a real manual ride completes the tutorial and stage 1, settles the reward once and starts stage 2', () => {
  const h = harness();
  try {
    h.state.selection = { vehicleId: 'taxi-275', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-275',
      mode: 'MANUAL',
      suspended: false,
    };
    h.step(2);
    assert.equal(h.runtime.tutorialInstance()?.stepIndex, 2);

    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-manual-1',
          vehicleId: 'taxi-275',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    const manual = h.step(3);
    assert.equal(manual.eventsPublished, 1);

    h.state.modes = {
      segments: [
        ...h.state.modes.segments,
        {
          segmentId: 'segment-learning-1',
          vehicleId: 'taxi-275',
          mode: 'LEARNING',
          learningEligible: true,
          startTick: 4,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.state.authority = {
      tick: 4,
      playerVehicleId: 'taxi-275',
      mode: 'LEARNING',
      suspended: false,
    };
    h.step(4);
    assert.equal(h.runtime.tutorialInstance()?.stepIndex, 3);

    h.state.modes = {
      segments: [
        ...h.state.modes.segments,
        {
          segmentId: 'segment-auto-1',
          vehicleId: 'taxi-275',
          mode: 'AUTO',
          learningEligible: true,
          startTick: 5,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.state.authority = {
      tick: 5,
      playerVehicleId: null,
      mode: 'AUTO',
      suspended: false,
    };
    h.step(5);
    assert.equal(h.runtime.tutorialInstance()?.stepIndex, 4);

    h.state.modes = {
      segments: [
        ...h.state.modes.segments,
        {
          segmentId: 'segment-manual-2',
          vehicleId: 'taxi-275',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 6,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.state.authority = {
      tick: 6,
      playerVehicleId: 'taxi-275',
      mode: 'MANUAL',
      suspended: false,
    };
    h.step(6);

    h.state.rides = {
      rides: [{ rideId: 'ride-275', taxiId: 'taxi-275', boardingTick: 6, completionTick: 7 }],
    };
    const completed = h.step(7);
    assert.equal(completed.settled.length, 1);
    assert.deepEqual(completed.started, ['campaign-2-first-demonstration']);
    const status = h.runtime.status();
    assert.equal(status.campaign.completed, 1);
    assert.equal(status.rewards.totals.xp, 100);
    assert.equal(status.rewards.totals.unlocks, 1);
    assert.equal(status.rewards.totals.granted, 2);
    assert.equal(status.activeMissionId, 'campaign-2-first-demonstration');
    assert.equal(status.tutorial.state, 'COMPLETED');
    assert.equal(status.tutorial.completedBy, 'PLAY');
    assert.equal(status.tutorial.learningGate, 'OPEN');
    assert.equal(status.tutorial.learningJobs, 0);
    assert.equal(status.tutorial.profileVersions, 0);
    assert.equal(status.profileWrites, 0);
    assert.equal(status.xpDelta, 0);
    const snapshot = h.runtime.snapshot()!;
    const first = snapshot.missions.find((entry) => entry.missionId === 'campaign-1-first-taxi')!;
    assert.equal(first.state, 'COMPLETED');
    assert.equal(first.attempt?.state, 'COMPLETED');
    assert.equal(first.attempt?.objectives[0]?.progress, 1);
    assert.equal(first.rewardsGranted, 2);
    assert.equal(first.replay.profileSource, 'CURRENT');
    const second = snapshot.missions.find(
      (entry) => entry.missionId === 'campaign-2-first-demonstration',
    )!;
    assert.equal(second.attempt?.state, 'ACTIVE');
  } finally {
    h.dispose();
  }
});

test('275 replay is a new 116 attempt and never pays the authored reward twice', () => {
  const h = harness();
  try {
    h.state.selection = { vehicleId: 'taxi-275', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-275',
      mode: 'MANUAL',
      suspended: false,
    };
    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-replay-manual-1',
          vehicleId: 'taxi-275',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.step(2);
    h.state.rides = {
      rides: [{ rideId: 'ride-replay-1', taxiId: 'taxi-275', boardingTick: 2, completionTick: 3 }],
    };
    h.step(3);
    const before = h.runtime.status();
    assert.equal(before.rewards.totals.xp, 100);
    const replay = h.runtime.replay('campaign-1-first-taxi', 4);
    assert.equal(replay.instance.attempt, 2);
    assert.equal(replay.instance.state, 'ACTIVE');
    assert.equal(replay.instance.replayedFrom, replay.previous.instanceId);

    h.state.modes = {
      segments: [
        ...h.state.modes.segments,
        {
          segmentId: 'segment-replay-manual-2',
          vehicleId: 'taxi-275',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 4,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.state.rides = {
      rides: [
        { rideId: 'ride-replay-1', taxiId: 'taxi-275', boardingTick: 2, completionTick: 3 },
        { rideId: 'ride-replay-2', taxiId: 'taxi-275', boardingTick: 4, completionTick: 5 },
      ],
    };
    h.step(5);
    const after = h.runtime.status();
    assert.equal(after.rewards.totals.xp, 100);
    assert.equal(after.rewards.totals.granted, 2);
    assert.equal(after.campaign.duplicateRewards, 2);
    assert.equal(after.campaign.settledCompletions, 2);
  } finally {
    h.dispose();
  }
});

test('275 failure keeps granted XP and the profile gate untouched, and shows the real reason', () => {
  const h = harness();
  try {
    h.state.selection = { vehicleId: 'taxi-275', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-275',
      mode: 'MANUAL',
      suspended: false,
    };
    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-failure-manual',
          vehicleId: 'taxi-275',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.step(2);
    h.state.rides = {
      rides: [{ rideId: 'ride-failure', taxiId: 'taxi-275', boardingTick: 2, completionTick: 3 }],
    };
    h.step(3);
    assert.equal(h.runtime.status().rewards.totals.xp, 100);
    const failed = h.runtime.failActive('SCENARIO_RESET', 4);
    assert.equal(failed, 1);
    const status = h.runtime.status();
    assert.equal(status.rewards.totals.xp, 100);
    assert.equal(status.rewards.totals.granted, 2);
    assert.equal(status.profileWrites, 0);
    assert.equal(status.xpDelta, 0);
    assert.equal(status.tutorial.learningJobs, 0);
    const snapshot = h.runtime.snapshot()!;
    const second = snapshot.missions.find(
      (entry) => entry.missionId === 'campaign-2-first-demonstration',
    )!;
    assert.equal(second.attempt?.state, 'FAILED');
    assert.equal(second.attempt?.failureReason, 'SCENARIO_RESET');
    assert.equal(second.attempt?.failedTick, 4);
    assert.equal(second.replay.profileSource, 'CURRENT');
    assert.equal(
      projectMissionPanel(snapshot).missions.find((entry) => entry.missionId === second.missionId)
        ?.replayAvailable,
      true,
    );
  } finally {
    h.dispose();
  }
});

test('275 the real evaluation window expires with EVALUATION_WINDOW_EXPIRED after stage 3 starts', () => {
  const h = harness();
  try {
    // Stage 1: a real manual ride.
    h.state.selection = { vehicleId: 'taxi-window', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-window',
      mode: 'MANUAL',
      suspended: false,
    };
    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-window-manual',
          vehicleId: 'taxi-window',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.step(2);
    h.state.rides = {
      rides: [{ rideId: 'ride-window', taxiId: 'taxi-window', boardingTick: 2, completionTick: 3 }],
    };
    h.step(3);
    // Stage 2: a real activation.
    h.runtime.observeLearningActivation({
      profileId: 'profile:275',
      versionId: 'profile:275@2',
      learningEpoch: 1,
      activationTick: 5,
      tick: 4,
    });
    const status = h.runtime.status();
    assert.equal(status.activeMissionId, 'campaign-3-following-distance');
    const snapshot = h.runtime.snapshot()!;
    const third = snapshot.missions.find(
      (entry) => entry.missionId === 'campaign-3-following-distance',
    )!;
    assert.equal(third.attempt?.windowTicks, 18_000);
    assert.equal(third.attempt?.incidentBudget, 2);
    const started = third.attempt!.startedTick;
    const result = h.step(started + 18_001);
    assert.equal(result.expired.length, 1);
    const failed = h.runtime
      .snapshot()!
      .missions.find((entry) => entry.missionId === 'campaign-3-following-distance')!;
    assert.equal(failed.attempt?.state, 'FAILED');
    assert.equal(failed.attempt?.failureReason, 'EVALUATION_WINDOW_EXPIRED');
  } finally {
    h.dispose();
  }
});

test('275 a failed attempt is replayed with the tracker attempt number and settles normally', () => {
  const h = harness();
  try {
    h.state.selection = { vehicleId: 'taxi-failed-replay', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-failed-replay',
      mode: 'MANUAL',
      suspended: false,
    };
    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-failed-replay-1',
          vehicleId: 'taxi-failed-replay',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.step(2);
    h.state.rides = {
      rides: [
        {
          rideId: 'ride-failed-replay',
          taxiId: 'taxi-failed-replay',
          boardingTick: 2,
          completionTick: 3,
        },
      ],
    };
    h.step(3);
    assert.equal(h.runtime.failActive('SCENARIO_RESET', 4), 1);
    let stageTwo = h.runtime
      .snapshot()!
      .missions.find((entry) => entry.missionId === 'campaign-2-first-demonstration')!;
    assert.equal(stageTwo.attempt?.failureReason, 'SCENARIO_RESET');
    assert.equal(stageTwo.attempts, 1);
    assert.equal(stageTwo.nextAttempt, 2);
    const replay = h.runtime.replay('campaign-2-first-demonstration', 5);
    assert.equal(replay.instance.attempt, 2);
    h.runtime.observeLearningActivation({
      profileId: 'profile:275-replay',
      versionId: 'profile:275-replay@2',
      learningEpoch: 1,
      activationTick: 6,
      tick: 5,
    });
    stageTwo = h.runtime
      .snapshot()!
      .missions.find((entry) => entry.missionId === 'campaign-2-first-demonstration')!;
    assert.equal(stageTwo.state, 'COMPLETED');
    assert.equal(stageTwo.attempts, 2);
    assert.equal(stageTwo.nextAttempt, 3);
    assert.equal(h.runtime.status().rewards.totals.xp, 200);
    assert.equal(h.runtime.status().activeMissionId, 'campaign-3-following-distance');
  } finally {
    h.dispose();
  }
});

test('275 the incident budget fails the attempt on a real 007 COLLISION', () => {
  const catalog = createMissionTestCatalog([
    testMission({
      missionId: 'budget-mission',
      title: 'Budget mission',
      incidentBudget: 1,
      windowTicks: null,
      objectives: [
        {
          objectiveId: 'dropoffs',
          kind: 'DROPOFFS',
          label: 'Complete rides',
          target: 1,
          difficultyTargets: { NORMAL: 1 },
          minDurationS: null,
          profileId: null,
        },
      ],
    }),
  ]);
  const h = harness(catalog);
  try {
    h.state.health = [
      {
        factId: 'health-fact-1',
        taxiId: 'taxi-budget',
        fact: unit('COLLISION_DAMAGE'),
        tick: 2,
        otherEntityId: 'civil-budget',
        impulseNs: 500,
      },
    ];
    h.step(2);
    assert.equal(h.runtime.snapshot()!.missions[0]?.attempt?.incidents, 1);
    h.state.health = [
      ...h.state.health,
      {
        factId: 'health-fact-2',
        taxiId: 'taxi-budget',
        fact: unit('COLLISION_DAMAGE'),
        tick: 3,
        otherEntityId: 'civil-budget-2',
        impulseNs: 600,
      },
    ];
    h.step(3);
    const attempt = h.runtime.snapshot()!.missions[0]?.attempt;
    assert.equal(attempt?.state, 'FAILED');
    assert.equal(attempt?.failureReason, 'INCIDENT_BUDGET_EXCEEDED');
    assert.equal(attempt?.incidents, 2);
  } finally {
    h.dispose();
  }
});

test('275 tutorial pause, skip and skip-all stay separate from the campaign', () => {
  const h = harness();
  try {
    h.runtime.tutorialPause(2);
    assert.equal(h.runtime.tutorialInstance()?.state, 'PAUSED');
    h.runtime.tutorialResume(3);
    assert.equal(h.runtime.tutorialInstance()?.state, 'ACTIVE');
    h.runtime.tutorialSkipStep(4);
    assert.equal(h.runtime.tutorialInstance()?.stepIndex, 1);
    h.runtime.tutorialSkipAll(5);
    const instance = h.runtime.tutorialInstance()!;
    assert.equal(instance.state, 'COMPLETED');
    assert.equal(instance.completedBy, 'SKIP');
    assert.equal(instance.skippedSteps, 5);
    assert.equal(h.runtime.status().tutorial.learningGate, 'OPEN');
    assert.equal(h.runtime.status().activeMissionId, 'campaign-1-first-taxi');
    assert.equal(h.runtime.status().profileWrites, 0);
  } finally {
    h.dispose();
  }
});

test('275 a new session fails the open attempt but keeps campaign completions and rewards', () => {
  const h = harness();
  try {
    h.state.selection = { vehicleId: 'taxi-session', kind: 'TAXI' };
    h.state.authority = {
      tick: 2,
      playerVehicleId: 'taxi-session',
      mode: 'MANUAL',
      suspended: false,
    };
    h.state.modes = {
      segments: [
        {
          segmentId: 'segment-session-manual',
          vehicleId: 'taxi-session',
          mode: 'MANUAL',
          learningEligible: true,
          startTick: 2,
          endTick: null,
          completeness: 'OPEN',
        },
      ],
    };
    h.step(2);
    h.state.rides = {
      rides: [
        { rideId: 'ride-session', taxiId: 'taxi-session', boardingTick: 2, completionTick: 3 },
      ],
    };
    h.step(3);
    h.runtime.beginSession({
      sessionId: 'session-275-chaos',
      worldEpoch: 2,
      tick: 4,
      kind: 'CHAOS',
    });
    const status = h.runtime.status();
    assert.equal(status.sessionId, 'session-275-chaos');
    assert.equal(status.campaign.completed, 1);
    assert.equal(status.rewards.totals.xp, 100);
    assert.equal(status.profileWrites, 0);
    const snapshot = h.runtime.snapshot()!;
    const second = snapshot.missions.find(
      (entry) => entry.missionId === 'campaign-2-first-demonstration',
    )!;
    assert.equal(second.attempt?.state, 'FAILED');
    assert.equal(second.attempt?.failureReason, 'PLAYER_ABANDONED');
  } finally {
    h.dispose();
  }
});

test('275 the mission panel snapshot is the real 116/125 answer, not a second ledger', () => {
  const catalog = createCampaignMissionCatalog();
  const tracker = createMissionTracker({ catalog });
  const ledger = createMissionRewardsLedger({ catalog });
  tracker.start({ missionId: 'campaign-1-first-taxi', tick: 1, difficulty: 'NORMAL' });
  tracker.fail({
    instanceId: tracker.instances()[0]!.instanceId,
    reason: 'PLAYER_ABANDONED',
    tick: 2,
  });
  assert.equal(ledger.progress().counts.completed, 0);
  const h = harness();
  try {
    const snapshot = h.runtime.snapshot()!;
    assert.equal(snapshot.namespace, catalog.namespace);
    assert.equal(snapshot.missions.length, catalog.missions.length);
    assert.equal(
      snapshot.missions.find((entry) => entry.missionId === 'campaign-1-first-taxi')?.attempt
        ?.objectives.length,
      1,
    );
    assert.equal(tracker.stats().failed, 1);
    assert.equal(ledger.stats().rewards, 0);
  } finally {
    h.dispose();
    tracker.dispose();
  }
});
