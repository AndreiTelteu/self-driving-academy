import {
  LIVE_MISSIONS_VERSION,
  createLiveMissions,
  type LiveMissionAuthorityFact,
  type LiveMissionModesSnapshot,
  type LiveMissionRidesSnapshot,
} from '../../src/app';
import {
  createCampaignMissionCatalog,
  createMissionRewardsLedger,
  createMissionTracker,
} from '../../src/missions';
import { projectMissionPanel } from '../../src/ui';
import { createMissionTestCatalog, testMission } from './mission-fixture';

export interface LiveMissionsCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveMissionsReport {
  readonly version: typeof LIVE_MISSIONS_VERSION;
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly tutorial: Readonly<{
    steps: readonly string[];
    state: string;
    completedBy: string | null;
    skippedSteps: number;
    learningJobs: 0;
    profileVersions: 0;
    learningGate: string;
  }>;
  readonly campaign: Readonly<{
    missions: number;
    stage1State: string;
    stage1Attempt: string | null;
    stage1RewardXp: number;
    stage1RewardsGranted: number;
    stage2State: string;
    stage2Attempt: string | null;
  }>;
  readonly replay: Readonly<{
    attempt: number;
    previous: string;
    settledCompletions: number;
    duplicateRewards: number;
    xpAfterReplay: number;
    rewardsGrantedAfterReplay: number;
  }>;
  readonly failure: Readonly<{
    missionId: string;
    state: string;
    reason: string | null;
    failedTick: number | null;
    xpBefore: number;
    xpAfter: number;
    profileWrites: 0;
    replayAvailable: boolean;
    failureLabel: string | null;
  }>;
  readonly windowFailure: Readonly<{
    missionId: string;
    windowTicks: number | null;
    startedTick: number;
    expiredTick: number;
    state: string;
    reason: string | null;
  }>;
  readonly incidentFailure: Readonly<{
    missionId: string;
    budget: number | null;
    incidents: number;
    state: string;
    reason: string | null;
  }>;
  readonly panel: Readonly<{
    version: string;
    missions: number;
    stage1StateLabel: string;
    stage1ReplayLabel: string;
    failureLimitsLabel: string;
    failureReplayLabel: string;
  }>;
  readonly ledger: Readonly<{
    rewards: number;
    xp: number;
    unlocks: number;
    duplicates: number;
  }>;
  readonly checks: readonly LiveMissionsCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

interface Harness {
  readonly runtime: ReturnType<typeof createLiveMissions>;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly state: {
    authority: LiveMissionAuthorityFact;
    selection: { vehicleId: string; kind: 'TAXI' | 'CIVIL' } | null;
    modes: LiveMissionModesSnapshot;
    rides: LiveMissionRidesSnapshot;
    health: {
      factId: string;
      taxiId: string;
      fact: string;
      tick: number;
      otherEntityId?: string | null;
      impulseNs?: number | null;
    }[];
    follow: {
      episodeId: string;
      vehicleId: string;
      leaderId: string;
      startTick: number;
      minGapM: number;
      maxGapM: number;
    }[];
  };
}

const SESSION = 'session-275-report';
const EPOCH = 1;

function harness(catalog?: unknown, session = SESSION, epoch = EPOCH): Harness {
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
  runtime.beginSession({ sessionId: session, worldEpoch: epoch, tick: 1, kind: 'ACADEMY' });
  return { runtime, sessionId: session, worldEpoch: epoch, state };
}

function step(h: Harness, tick: number) {
  h.state.authority = Object.freeze({ ...h.state.authority, tick });
  return h.runtime.step({ sessionId: h.sessionId, worldEpoch: h.worldEpoch, tick });
}

function check(
  checks: LiveMissionsCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

function startManual(h: Harness, tick: number, taxiId: string, segmentId: string): void {
  h.state.selection = { vehicleId: taxiId, kind: 'TAXI' };
  h.state.authority = { tick, playerVehicleId: taxiId, mode: 'MANUAL', suspended: false };
  h.state.modes = {
    segments: [
      {
        segmentId,
        vehicleId: taxiId,
        mode: 'MANUAL',
        learningEligible: true,
        startTick: tick,
        endTick: null,
        completeness: 'OPEN',
      },
    ],
  };
}

function completeRide(h: Harness, tick: number, taxiId: string, rideId: string): void {
  h.state.rides = {
    rides: [{ rideId, taxiId, boardingTick: tick - 1, completionTick: tick }],
  };
}

export function runLiveMissionsReport(): LiveMissionsReport {
  const checks: LiveMissionsCheck[] = [];

  // Full deterministic run: tutorial, stage 1, replay, failure, window and budget.
  const h = harness();
  startManual(h, 2, 'taxi-275', 'segment-report-manual-1');
  step(h, 2);
  h.state.modes = {
    segments: [
      ...h.state.modes.segments,
      {
        segmentId: 'segment-report-learning',
        vehicleId: 'taxi-275',
        mode: 'LEARNING',
        learningEligible: true,
        startTick: 3,
        endTick: null,
        completeness: 'OPEN',
      },
    ],
  };
  h.state.authority = {
    tick: 3,
    playerVehicleId: 'taxi-275',
    mode: 'LEARNING',
    suspended: false,
  };
  step(h, 3);
  h.state.modes = {
    segments: [
      ...h.state.modes.segments,
      {
        segmentId: 'segment-report-auto',
        vehicleId: 'taxi-275',
        mode: 'AUTO',
        learningEligible: true,
        startTick: 4,
        endTick: null,
        completeness: 'OPEN',
      },
    ],
  };
  h.state.authority = { tick: 4, playerVehicleId: 'taxi-275', mode: 'AUTO', suspended: false };
  step(h, 4);
  h.state.authority = { tick: 5, playerVehicleId: 'taxi-275', mode: 'MANUAL', suspended: false };
  h.state.modes = {
    segments: [
      ...h.state.modes.segments,
      {
        segmentId: 'segment-report-manual-2',
        vehicleId: 'taxi-275',
        mode: 'MANUAL',
        learningEligible: true,
        startTick: 5,
        endTick: null,
        completeness: 'OPEN',
      },
    ],
  };
  step(h, 5);
  completeRide(h, 6, 'taxi-275', 'ride-report-1');
  const stageOne = step(h, 6);
  const afterStageOne = h.runtime.status();
  const stageOneSnapshot = h.runtime.snapshot()!;
  const stageOneMission = stageOneSnapshot.missions.find(
    (entry) => entry.missionId === 'campaign-1-first-taxi',
  )!;
  const stageOneView = projectMissionPanel(stageOneSnapshot).missions.find(
    (entry) => entry.missionId === 'campaign-1-first-taxi',
  )!;

  check(checks, 'stage-1-settled', 1, stageOne.settled.length, 'One real 116 completion settled.');
  check(
    checks,
    'stage-1-reward-xp',
    100,
    afterStageOne.rewards.totals.xp,
    'The authored 100 XP reward is recorded once by 125.',
  );
  check(
    checks,
    'stage-1-rewards-granted',
    2,
    afterStageOne.rewards.totals.granted,
    'XP and the authored challenge unlock.',
  );
  check(
    checks,
    'stage-2-started',
    'campaign-2-first-demonstration',
    afterStageOne.activeMissionId,
    'The next campaign stage starts only after a real completion.',
  );
  check(
    checks,
    'tutorial-completed',
    'COMPLETED',
    afterStageOne.tutorial.state,
    'The five-step tutorial completes on the same real dropoff.',
  );
  check(
    checks,
    'tutorial-no-learning',
    [0, 0, 0],
    [
      afterStageOne.tutorial.learningJobs,
      afterStageOne.tutorial.profileVersions,
      afterStageOne.profileWrites,
    ],
    'The tutorial never creates a job, version or profile write.',
  );

  // Replay the completed stage 1: a new attempt, but the authored reward identity is already paid.
  const replay = h.runtime.replay('campaign-1-first-taxi', 7);
  h.state.modes = {
    segments: [
      ...h.state.modes.segments,
      {
        segmentId: 'segment-report-replay',
        vehicleId: 'taxi-275',
        mode: 'MANUAL',
        learningEligible: true,
        startTick: 7,
        endTick: null,
        completeness: 'OPEN',
      },
    ],
  };
  completeRide(h, 8, 'taxi-275', 'ride-report-2');
  step(h, 8);
  const afterReplay = h.runtime.status();
  check(checks, 'replay-creates-attempt', 2, replay.instance.attempt, 'A real new 116 attempt.');
  check(
    checks,
    'replay-no-duplicate-xp',
    100,
    afterReplay.rewards.totals.xp,
    'Replay reports the reward as a duplicate and pays nothing again.',
  );
  check(
    checks,
    'replay-duplicate-rewards',
    2,
    afterReplay.campaign.duplicateRewards,
    'Both authored rewards are reported as duplicates on the replayed completion.',
  );

  // Failure: the open stage 2 is failed by a scenario reset; stage 1's XP and rewards stay.
  const xpBeforeFailure = afterReplay.rewards.totals.xp;
  const failedCount = h.runtime.failActive('SCENARIO_RESET', 9);
  const afterFailure = h.runtime.status();
  const failureSnapshot = h.runtime.snapshot()!;
  const stageTwoMission = failureSnapshot.missions.find(
    (entry) => entry.missionId === 'campaign-2-first-demonstration',
  )!;
  const stageTwoView = projectMissionPanel(failureSnapshot).missions.find(
    (entry) => entry.missionId === 'campaign-2-first-demonstration',
  )!;
  check(checks, 'failure-count', 1, failedCount, 'Exactly the open attempt fails.');
  check(
    checks,
    'failure-preserves-xp',
    xpBeforeFailure,
    afterFailure.rewards.totals.xp,
    'Failure never removes XP or a granted reward.',
  );
  check(
    checks,
    'failure-no-profile-write',
    0,
    afterFailure.profileWrites,
    'The mission composition has no profile writer.',
  );
  check(
    checks,
    'failure-reason',
    'SCENARIO_RESET',
    stageTwoMission.attempt?.failureReason,
    'The panel receives the closed 116 reason.',
  );
  check(
    checks,
    'failure-replay-available',
    true,
    stageTwoView.replayAvailable,
    'A failed attempt offers the next 116 replay.',
  );

  // Window: stage 3 starts only after stage 2 is completed by a real activation, then expires.
  h.runtime.replay('campaign-2-first-demonstration', 10);
  h.runtime.observeLearningActivation({
    profileId: 'profile:275',
    versionId: 'profile:275@2',
    learningEpoch: 1,
    activationTick: 11,
    tick: 10,
  });
  const windowSnapshot = h.runtime.snapshot()!;
  const third = windowSnapshot.missions.find(
    (entry) => entry.missionId === 'campaign-3-following-distance',
  )!;
  const thirdStarted = third.attempt!.startedTick;
  const expired = step(h, thirdStarted + 18_001);
  const windowFailed = h.runtime
    .snapshot()!
    .missions.find((entry) => entry.missionId === 'campaign-3-following-distance')!;
  check(
    checks,
    'window-expired-count',
    1,
    expired.expired.length,
    'The authoritative tick expires the attempt.',
  );
  check(
    checks,
    'window-reason',
    'EVALUATION_WINDOW_EXPIRED',
    windowFailed.attempt?.failureReason,
    'The panel receives the closed window reason.',
  );

  // Incident budget: a separate catalog with budget 1 fails on the second real 007 collision.
  const budgetCatalog = createMissionTestCatalog([
    testMission({
      missionId: 'budget-mission',
      title: 'Budget mission',
      incidentBudget: 1,
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
  const budget = harness(budgetCatalog, 'session-275-report-budget', 3);
  budget.state.health = [
    {
      factId: 'report-health-1',
      taxiId: 'taxi-budget',
      fact: 'COLLISION_DAMAGE',
      tick: 2,
      otherEntityId: 'civil-budget',
      impulseNs: 500,
    },
  ];
  step(budget, 2);
  budget.state.health = [
    ...budget.state.health,
    {
      factId: 'report-health-2',
      taxiId: 'taxi-budget',
      fact: 'COLLISION_DAMAGE',
      tick: 3,
      otherEntityId: 'civil-budget-2',
      impulseNs: 600,
    },
  ];
  step(budget, 3);
  const budgetSnapshot = budget.runtime.snapshot()!;
  const budgetAttempt = budgetSnapshot.missions[0]!.attempt;
  check(
    checks,
    'incident-budget',
    2,
    budgetAttempt?.incidents,
    'The second real collision exceeds the authored budget.',
  );
  check(
    checks,
    'incident-reason',
    'INCIDENT_BUDGET_EXCEEDED',
    budgetAttempt?.failureReason,
    'The panel receives the closed incident reason.',
  );

  // The panel is a projection over the real read models, not a second ledger.
  const catalog = createCampaignMissionCatalog();
  const tracker = createMissionTracker({ catalog });
  const ledger = createMissionRewardsLedger({ catalog });
  tracker.start({ missionId: 'campaign-1-first-taxi', tick: 1, difficulty: 'NORMAL' });
  check(
    checks,
    'panel-mission-count',
    catalog.missions.length,
    h.runtime.snapshot()!.missions.length,
    'All eight authored campaign stages are listed.',
  );
  check(
    checks,
    'panel-stage-1-completed',
    'COMPLETED',
    stageOneMission.state,
    'The panel copies the 125 campaign state.',
  );
  check(
    checks,
    'panel-stage-1-replay-label',
    true,
    stageOneView.replayLabel.length > 0,
    'The panel displays the replay policy.',
  );
  check(
    checks,
    'panel-failure-limits-label',
    true,
    stageTwoView.limitsLabel.length > 0,
    'The panel displays the evaluation window and incident budget line.',
  );
  check(
    checks,
    'no-second-ledger',
    [1, 0],
    [tracker.stats().instances, ledger.stats().rewards],
    'An independent 116/125 pair is untouched by the live runtime.',
  );

  // Tutorial skip is a separate path; it never manufactures campaign progress.
  const skipped = harness(undefined, 'session-275-report-skip', 4);
  skipped.runtime.tutorialSkipAll(2);
  check(
    checks,
    'skip-completes-tutorial-only',
    ['COMPLETED', 'campaign-1-first-taxi', 0],
    [
      skipped.runtime.status().tutorial.state,
      skipped.runtime.status().activeMissionId,
      skipped.runtime.status().campaign.completed,
    ],
    'Skipping the tutorial does not complete the campaign.',
  );

  h.runtime.dispose();
  budget.runtime.dispose();
  skipped.runtime.dispose();
  tracker.dispose();

  const rewards = afterFailure.rewards;
  const report: LiveMissionsReport = Object.freeze({
    version: LIVE_MISSIONS_VERSION,
    generatedBy: 'npm run missions:live',
    oracleRule:
      'Only validated 007 events advance 116 objectives; only a COMPLETED 116 instance is settled by 125; a failure never writes a profile or removes XP.',
    tutorial: Object.freeze({
      steps: ['SELECT_TAXI', 'MODE_MANUAL', 'MODE_LEARNING', 'MODE_AUTO', 'COMPLETE_RIDE'],
      state: afterStageOne.tutorial.state ?? 'NONE',
      completedBy: afterStageOne.tutorial.completedBy,
      skippedSteps: 0,
      learningJobs: 0 as const,
      profileVersions: 0 as const,
      learningGate: afterStageOne.tutorial.learningGate,
    }),
    campaign: Object.freeze({
      missions: afterStageOne.campaign.missions,
      stage1State: stageOneMission.state,
      stage1Attempt: stageOneMission.attempt?.state ?? null,
      stage1RewardXp: afterStageOne.rewards.totals.xp,
      stage1RewardsGranted: stageOneMission.rewardsGranted,
      stage2State: stageTwoMission.state,
      stage2Attempt: stageTwoMission.attempt?.state ?? null,
    }),
    replay: Object.freeze({
      attempt: replay.instance.attempt,
      previous: replay.previous.instanceId,
      settledCompletions: afterReplay.campaign.settledCompletions,
      duplicateRewards: afterReplay.campaign.duplicateRewards,
      xpAfterReplay: afterReplay.rewards.totals.xp,
      rewardsGrantedAfterReplay: afterReplay.rewards.totals.granted,
    }),
    failure: Object.freeze({
      missionId: stageTwoMission.missionId,
      state: stageTwoMission.attempt?.state ?? 'NONE',
      reason: stageTwoMission.attempt?.failureReason ?? null,
      failedTick: stageTwoMission.attempt?.failedTick ?? null,
      xpBefore: xpBeforeFailure,
      xpAfter: afterFailure.rewards.totals.xp,
      profileWrites: 0 as const,
      replayAvailable: stageTwoView.replayAvailable,
      failureLabel: stageTwoView.failureLabel,
    }),
    windowFailure: Object.freeze({
      missionId: windowFailed.missionId,
      windowTicks: third.attempt?.windowTicks ?? null,
      startedTick: thirdStarted,
      expiredTick: thirdStarted + 18_001,
      state: windowFailed.attempt?.state ?? 'NONE',
      reason: windowFailed.attempt?.failureReason ?? null,
    }),
    incidentFailure: Object.freeze({
      missionId: budgetSnapshot.missions[0]!.missionId,
      budget: budgetAttempt?.incidentBudget ?? null,
      incidents: budgetAttempt?.incidents ?? 0,
      state: budgetAttempt?.state ?? 'NONE',
      reason: budgetAttempt?.failureReason ?? null,
    }),
    panel: Object.freeze({
      version: stageOneSnapshot.version,
      missions: stageOneSnapshot.missions.length,
      stage1StateLabel: stageOneView.stateLabel,
      stage1ReplayLabel: stageOneView.replayLabel,
      failureLimitsLabel: stageTwoView.limitsLabel,
      failureReplayLabel: stageTwoView.replayLabel,
    }),
    ledger: Object.freeze({
      rewards: rewards.totals.granted,
      xp: rewards.totals.xp,
      unlocks: rewards.totals.unlocks,
      duplicates: rewards.totals.duplicates,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      pass: checks.every((entry) => entry.pass),
    }),
  });
  return report;
}
